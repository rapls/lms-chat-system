(function ($) {
    'use strict';

    const ThreadReactionSync = {
        minInterval: 10000,
        maxInterval: 30000,
        defaultInterval: 15000,
        currentInterval: 15000,
        timerId: null,
        pendingRequest: null,
        isRunning: false,
        isInitialized: false,
        skipScheduleOnce: false,
        lastTimestamp: 0,
        processedKeys: new Set(),
        recentKeys: [],
        debug: false,

        init(options = {}) {
            if (this.isInitialized && options.force !== true) {
                if (options.interval) {
                    this.setInterval(options.interval);
                }
                if (typeof options.lastTimestamp === 'number') {
                    this.setLastTimestamp(options.lastTimestamp);
                }
                return;
            }

            this.debug = Boolean(window.lmsThreadReactionSyncDebug || options.debug || (window.lmsChat && window.lmsChat.debug));
            const initialInterval = options.interval || window.lmsThreadReactionInterval || this.defaultInterval;
            this.defaultInterval = this.clampInterval(initialInterval);
            this.currentInterval = this.defaultInterval;
            this.lastTimestamp = this.resolveInitialTimestamp(options.lastTimestamp);
            this.isInitialized = true;

            if (options.autoStart !== false) {
                this.start();
            }
        },

        clampInterval(value) {
            const numeric = parseInt(value, 10);
            if (Number.isNaN(numeric) || numeric <= 0) {
                return this.defaultInterval;
            }
            return Math.max(this.minInterval, Math.min(this.maxInterval, numeric));
        },

        resolveInitialTimestamp(candidate) {
            const numeric = parseInt(candidate, 10);
            if (!Number.isNaN(numeric) && numeric > 0) {
                return numeric;
            }
            if (typeof this.lastTimestamp === 'number' && this.lastTimestamp > 0) {
                return this.lastTimestamp;
            }
            return Math.max(0, Math.floor(Date.now() / 1000) - 30);
        },

        log(message, extra) {
            // Debug logging disabled
            return;
        },

        start() {
            if (this.isRunning) {
                return;
            }
            if (!window.lmsChat || !window.lmsChat.ajaxUrl) {
                this.log('ajaxUrl missing, start aborted');
                return;
            }
            this.isRunning = true;
            this.scheduleNext(0);
            this.log('started');
        },

        stop() {
            this.isRunning = false;
            if (this.timerId) {
                clearTimeout(this.timerId);
                this.timerId = null;
            }
            if (this.pendingRequest) {
                this.pendingRequest.abort();
                this.pendingRequest = null;
            }
            this.log('stopped');
        },

        scheduleNext(delay) {
            if (!this.isRunning) {
                return;
            }
            if (this.timerId) {
                clearTimeout(this.timerId);
            }
            const wait = typeof delay === 'number' && delay >= 0 ? delay : this.currentInterval;
            this.timerId = setTimeout(() => {
                this.poll();
            }, wait);
        },

        poll(force = false) {
            if (!this.isRunning) {
                return;
            }

            if (!window.lmsChat || !window.lmsChat.ajaxUrl) {
                this.log('ajaxUrl missing, skipping poll');
                this.scheduleNext(this.maxInterval);
                return;
            }

            if (this.pendingRequest) {
                if (force) {
                    this.skipScheduleOnce = true;
                    this.pendingRequest.abort();
                } else {
                    this.scheduleNext(Math.min(this.currentInterval, 1000));
                    return;
                }
            }

            const requestData = this.buildRequestData();
            this.log('polling', requestData);

            this.pendingRequest = $.ajax({
                url: window.lmsChat.ajaxUrl,
                type: 'GET',
                data: requestData,
                dataType: 'json',
                timeout: 12000,
                cache: false,
            })
                .done((response) => {
                    const payload = Array.isArray(response?.data)
                        ? response.data
                        : (Array.isArray(response?.data?.updates) ? response.data.updates : []);
                    if (Array.isArray(payload) && payload.length) {
                        this.handleUpdates(payload);
                    } else {
                        this.log('no updates');
                    }
                    this.currentInterval = this.defaultInterval;
                })
                .fail((jqXHR, textStatus) => {
                    if (textStatus === 'abort') {
                        this.log('request aborted');
                        return;
                    }
                    this.currentInterval = Math.min(Math.floor(this.currentInterval * 1.5), this.maxInterval);
                    this.log('request failed', { status: textStatus, interval: this.currentInterval });
                })
                .always((_, textStatus) => {
                    this.pendingRequest = null;
                    if (!this.isRunning) {
                        return;
                    }
                    if (textStatus === 'abort' && this.skipScheduleOnce) {
                        this.skipScheduleOnce = false;
                        return;
                    }
                    this.scheduleNext(this.currentInterval);
                });
        },

        buildRequestData() {
            const data = {
                action: 'lms_get_thread_reaction_updates',
                nonce: window.lmsChat?.nonce || '',
                last_timestamp: this.lastTimestamp || 0,
            };

            const threadIds = this.collectTrackedThreadIds();
            if (threadIds.length) {
                data.thread_ids = threadIds.join(',');
            }

            return data;
        },

        collectTrackedThreadIds() {
            const ids = new Set();

            if (window.LMSChat?.state?.currentThread) {
                const current = parseInt(window.LMSChat.state.currentThread, 10);
                if (!Number.isNaN(current) && current > 0) {
                    ids.add(current);
                }
            }

            $('.thread-panel[data-thread-id]').each(function () {
                const value = parseInt($(this).data('thread-id'), 10);
                if (!Number.isNaN(value) && value > 0) {
                    ids.add(value);
                }
            });

            $('.thread-message[data-parent-id]').each(function () {
                const value = parseInt($(this).data('parent-id'), 10);
                if (!Number.isNaN(value) && value > 0) {
                    ids.add(value);
                }
            });

            return Array.from(ids).slice(0, 25);
        },

        handleUpdates(updates) {
            let maxTimestamp = this.lastTimestamp;

            updates.forEach((update) => {
                const messageId = parseInt(update?.message_id, 10);
                const timestamp = parseInt(update?.timestamp, 10);

                if (!messageId || !timestamp) {
                    return;
                }

                const key = `${messageId}:${timestamp}`;
                if (!this.registerKey(key, timestamp)) {
                    return;
                }

                if (timestamp > maxTimestamp) {
                    maxTimestamp = timestamp;
                }

                this.applyUpdate(update);
            });

            if (maxTimestamp > this.lastTimestamp) {
                this.lastTimestamp = maxTimestamp;
            }

            this.log('applied updates', { count: updates.length, lastTimestamp: this.lastTimestamp });
        },

        registerKey(key, timestamp) {
            if (this.processedKeys.has(key)) {
                return false;
            }
            this.processedKeys.add(key);
            this.recentKeys.push({ key, timestamp });

            if (this.recentKeys.length > 200) {
                const removed = this.recentKeys.shift();
                if (removed) {
                    this.processedKeys.delete(removed.key);
                }
            }
            return true;
        },

        applyUpdate(update) {
            const messageId = parseInt(update?.message_id, 10);
            if (!messageId) {
                return;
            }

            const reactions = Array.isArray(update?.reactions) ? update.reactions : [];
            const serverTimestamp = parseInt(update?.timestamp, 10) || 0;
            const threadId = parseInt(update?.thread_id, 10) || 0;

            const unified = window.LMSChat?.threadReactionUnified;
            if (unified && typeof unified.updateReactions === 'function') {
                unified.updateReactions(messageId, reactions, {
                    source: 'thread-sync',
                    serverTimestamp,
                    threadId,
                });
                return;
            }

            const store = window.LMSChat?.threadReactionStore;
            if (store && typeof store.queueUpdate === 'function') {
                store.queueUpdate(messageId, reactions, {
                    source: 'thread-sync',
                    serverTimestamp,
                    threadId,
                    forceRender: true,
                });
                return;
            }

            const ui = window.LMSChat?.reactionUI;
            if (ui && typeof ui.updateThreadMessageReactions === 'function') {
                setTimeout(() => {
                    ui.updateThreadMessageReactions(messageId, reactions, true, true);
                }, 50);
            }
        },

        triggerImmediateFetch() {
            if (!this.isRunning) {
                this.start();
                return;
            }
            this.currentInterval = this.minInterval;
            this.poll(true);
        },

        setInterval(value) {
            const clamped = this.clampInterval(value);
            this.defaultInterval = clamped;
            this.currentInterval = clamped;
            if (this.isRunning) {
                this.scheduleNext(clamped);
            }
        },

        setLastTimestamp(value) {
            const numeric = parseInt(value, 10);
            if (!Number.isNaN(numeric) && numeric > this.lastTimestamp) {
                this.lastTimestamp = numeric;
            }
        },

        getLastTimestamp() {
            return this.lastTimestamp;
        },
    };

    $(function () {
        window.LMSChat = window.LMSChat || {};
        ThreadReactionSync.init({ autoStart: true });

        window.LMSChat.threadReactionSync = {
            start: () => ThreadReactionSync.start(),
            stop: () => ThreadReactionSync.stop(),
            triggerImmediateFetch: () => ThreadReactionSync.triggerImmediateFetch(),
            setInterval: (value) => ThreadReactionSync.setInterval(value),
            setLastTimestamp: (value) => ThreadReactionSync.setLastTimestamp(value),
            getLastTimestamp: () => ThreadReactionSync.getLastTimestamp(),
            isRunning: () => ThreadReactionSync.isRunning,
        };
    });
})(jQuery);
