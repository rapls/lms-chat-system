(function ($) {
    'use strict';

    window.LMSChat = window.LMSChat || {};
    const core = window.LMSChat.reactionCore || {};
    const ui = window.LMSChat.reactionUI || {};
    const cacheModule = window.LMSChat.reactionCache || {};

    const logDebug = core.logDebug || (() => {});

    const skipState = new Map();
    const buildProcessingKey = (messageId, isThread) => (isThread ? `thread_${String(messageId)}` : String(messageId));

    const setSkip = (key, duration = 2000) => {
        if (!key) {
            return;
        }
        const expiresAt = Date.now() + duration;
        skipState.set(key, expiresAt);
        setTimeout(() => {
            const stored = skipState.get(key);
            if (stored && stored <= Date.now()) {
                skipState.delete(key);
            }
        }, duration + 100);
    };

    const shouldSkipUpdate = (key) => {
        if (!key) {
            return false;
        }
        const expiresAt = skipState.get(key);
        if (!expiresAt) {
            return false;
        }
        if (expiresAt <= Date.now()) {
            skipState.delete(key);
            return false;
        }
        return true;
    };

    const cacheReactions = (messageId, reactions, isThread) => {
        if (core.cacheReactionData) {
            core.cacheReactionData(messageId, reactions, isThread);
        }
        if (cacheModule) {
            if (isThread && cacheModule.setThreadReactionsCache) {
                cacheModule.setThreadReactionsCache(messageId, reactions);
            } else if (!isThread && cacheModule.setReactionsCache) {
                cacheModule.setReactionsCache(messageId, reactions);
            }
        }
    };

    const updateMessagesFromResponse = (responseMap) => {
        Object.entries(responseMap || {}).forEach(([messageId, reactions]) => {
            const key = buildProcessingKey(messageId, false);
            if (shouldSkipUpdate(key)) {
                return;
            }
            cacheReactions(messageId, reactions, false);
            if (ui.updateMessageReactions) {
                ui.updateMessageReactions(messageId, reactions, true, true);
            }
        });
    };

    const updateThreadMessagesFromResponse = (responseMap) => {
        Object.entries(responseMap || {}).forEach(([messageId, reactions]) => {
            const key = buildProcessingKey(messageId, true);
            if (shouldSkipUpdate(key)) {
                return;
            }
            cacheReactions(messageId, reactions, true);
            
            // スレッドリアクションは遅延更新で競合を回避
            setTimeout(() => {
                if (ui.updateThreadMessageReactions) {
                    ui.updateThreadMessageReactions(messageId, reactions, true, true);
                }
            }, 20);
        });
    };

    const pollVisibleMessages = async () => {
        const messageIds = [];
        $('#chat-messages .chat-message[data-message-id]').each(function () {
            const $message = $(this);
            const messageId = $message.data('message-id');
            if (!messageId) {
                return;
            }
            const key = buildProcessingKey(messageId, false);
            if (shouldSkipUpdate(key)) {
                return;
            }
            if (core.hasProcessingReactions && core.hasProcessingReactions(key)) {
                return;
            }
            messageIds.push(messageId);
            if (messageIds.length >= 5) {
                return false; // break
            }
        });

        if (!messageIds.length) {
            return;
        }

        try {
            const response = await $.ajax({
                url: window.lmsChat?.ajaxUrl,
                type: 'GET',
                data: {
                    action: 'lms_get_reactions',
                    message_ids: messageIds.join(','),
                    nonce: window.lmsChat?.nonce,
                },
                cache: false,
                timeout: 8000,
                dataType: 'json',
            });

            if (response?.success && response.data) {
                updateMessagesFromResponse(response.data);
                messageIds.forEach((id) => setSkip(buildProcessingKey(id, false), 1500));
                logDebug(`reactionSync: polled ${messageIds.length} messages`);
            }
        } catch (error) {
            // noop
        }
    };

    const pollThreadMessages = async () => {
        if (!window.LMSChat?.threadReactions?.loadReactionsForThread) {
            return;
        }
        await window.LMSChat.threadReactions.loadReactionsForThread();
    };

    window.LMSChat.reactionSync = {
        addSkipUpdateMessageId: (messageKey, duration = 2000) => setSkip(messageKey, duration),
        addSkipUpdateThreadMessageId: (messageId, duration = 2000) => setSkip(buildProcessingKey(messageId, true), duration),
        addPersistentThreadProtection: (messageId, label) => {
            logDebug(`reactionSync: persistent protection ${label || ''}`);
            setSkip(buildProcessingKey(messageId, true), 3000);
        },
        clearThreadProtectionOnSuccess: (messageId) => {
            skipState.delete(buildProcessingKey(messageId, true));
        },
        shouldSkipUpdate,
        pollReactions: () => {
            pollVisibleMessages();
        },
        pollThreadReactions: () => {
            pollThreadMessages();
        },
    };
})(jQuery);
