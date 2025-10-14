(function ($) {
    'use strict';

    window.LMSChat = window.LMSChat || {};
    const core = window.LMSChat.reactionCore || {};
    const logDebug = core.logDebug || (() => {});

    const SOURCE_PRIORITY = {
        'longpoll-detailed': 5,
        'longpoll': 4,
        'action': 3,
        'ajax-refresh': 2,
        'ajax': 2,
        'ui-legacy': 1,
        'ui': 1,
        'cache': 1,
        'unknown': 0
    };

    /**
     * スレッドリアクション専用のデータストア
     * 全てのリアクションデータを一元管理し、競合を防ぐ
     */
    const ThreadReactionStore = {
        // メッセージごとのリアクションデータ
        reactionData: new Map(),
        
        // DOM更新のキュー
        updateQueue: new Map(),
        
        // 更新中フラグ
        updating: new Set(),
        
        // 連番（クライアント内の更新順序管理）
        sequence: 0,

        /**
         * リアクションデータを設定
         */
        setReactions(messageId, reactions, options = 'unknown') {
            if (!messageId) return;
            
            const key = String(messageId);
            const meta = this.normalizeOptions(options);
            const timestamp = meta.clientTimestamp;
            
            // データの検証
            const validatedReactions = this.validateReactions(reactions);
            
            const version = this.generateVersion(validatedReactions);
            const incomingState = {
                reactions: validatedReactions,
                version,
                meta,
            };

            const currentState = this.reactionData.get(key);
            if (!this.shouldAcceptUpdate(currentState, incomingState)) {
                logDebug('ThreadReactionStore: update skipped', {
                    messageId,
                    source: meta.source,
                    reason: 'stale',
                });
                return false;
            }

            this.sequence += 1;
            incomingState.meta.sequence = this.sequence;

            this.reactionData.set(key, incomingState);

            logDebug('ThreadReactionStore: state committed', {
                messageId,
                source: meta.source,
                priority: meta.priority,
                serverTimestamp: meta.serverTimestamp,
                clientTimestamp: meta.clientTimestamp,
                count: validatedReactions.length,
            });

            return true;
        },

        normalizeOptions(options) {
            const defaultMeta = {
                source: 'unknown',
                serverTimestamp: null,
                clientTimestamp: Date.now(),
                priority: SOURCE_PRIORITY.unknown,
                force: false,
                forceRender: false,
            };

            if (typeof options === 'string') {
                const lower = options.toLowerCase();
                return {
                    ...defaultMeta,
                    source: lower,
                    priority: this.resolvePriority(lower),
                };
            }

            if (!options || typeof options !== 'object') {
                return { ...defaultMeta };
            }

            const meta = { ...defaultMeta, ...options };
            meta.source = meta.source ? String(meta.source).toLowerCase() : 'unknown';
            meta.priority = this.resolvePriority(meta.source);

            if (typeof meta.serverTimestamp !== 'number' || Number.isNaN(meta.serverTimestamp)) {
                meta.serverTimestamp = null;
            }

            if (typeof meta.clientTimestamp !== 'number' || Number.isNaN(meta.clientTimestamp)) {
                meta.clientTimestamp = Date.now();
            }

            meta.force = meta.force === true;
            meta.forceRender = meta.forceRender === true;

            return meta;
        },

        resolvePriority(source) {
            if (!source) {
                return SOURCE_PRIORITY.unknown;
            }
            const normalized = String(source).toLowerCase();
            if (Object.prototype.hasOwnProperty.call(SOURCE_PRIORITY, normalized)) {
                return SOURCE_PRIORITY[normalized];
            }
            return SOURCE_PRIORITY.unknown;
        },

        shouldAcceptUpdate(currentState, incomingState) {
            if (!incomingState) {
                return false;
            }

            const { meta: incomingMeta, version: incomingVersion } = incomingState;

            if (!currentState) {
                return true;
            }

            const { meta: currentMeta, version: currentVersion } = currentState;

            if (incomingMeta.force) {
                return true;
            }

            const incomingServerTs = incomingMeta.serverTimestamp;
            const currentServerTs = currentMeta.serverTimestamp;

            if (incomingServerTs !== null && currentServerTs !== null) {
                if (incomingServerTs < currentServerTs) {
                    return false;
                }
                if (incomingServerTs > currentServerTs) {
                    return true;
                }
            } else if (incomingServerTs !== null && currentServerTs === null) {
                return true;
            } else if (incomingServerTs === null && currentServerTs !== null) {
                if (incomingMeta.priority <= currentMeta.priority) {
                    return false;
                }
            }

            if (incomingMeta.priority !== currentMeta.priority) {
                return incomingMeta.priority > currentMeta.priority;
            }

            if (incomingVersion === currentVersion && !incomingMeta.forceRender) {
                return false;
            }

            const incomingClientTs = incomingMeta.clientTimestamp;
            const currentClientTs = currentMeta.clientTimestamp;

            if (incomingClientTs !== null && currentClientTs !== null) {
                if (incomingClientTs < currentClientTs && !incomingMeta.forceRender) {
                    return false;
                }
            }

            // 最終フォールバック: シーケンス番号（後勝ち）
            return true;
        },

        /**
         * リアクションデータを取得
         */
        getReactions(messageId) {
            if (!messageId) return [];
            
            const data = this.reactionData.get(String(messageId));
            return data ? data.reactions : [];
        },

        /**
         * データの検証
         */
        validateReactions(reactions) {
            if (!Array.isArray(reactions)) return [];
            
            return reactions.filter(reaction => {
                return reaction && 
                       typeof reaction === 'object' &&
                       reaction.reaction &&
                       reaction.user_id &&
                       reaction.display_name;
            });
        },

        /**
         * バージョンハッシュを生成（重複検出用）
         */
        generateVersion(reactions) {
            const sorted = [...reactions].sort((a, b) => {
                if (a.reaction !== b.reaction) return a.reaction.localeCompare(b.reaction);
                return parseInt(a.user_id) - parseInt(b.user_id);
            });
            
            return sorted.map(r => `${r.reaction}:${r.user_id}`).join('|');
        },

        /**
         * DOM更新をキューに追加
         */
        queueUpdate(messageId, reactions, options = 'unknown') {
            if (!messageId) return;
            
            const key = String(messageId);
            const meta = this.normalizeOptions(options);
            
            // データを設定
            if (!this.setReactions(messageId, reactions, meta)) {
                if (meta.forceRender) {
                    this.executeUpdate(messageId, { forceRender: true });
                }
                return; // 古いデータは無視
            }
            
            // 既に更新中の場合はキューに追加
            if (this.updating.has(key)) {
                this.updateQueue.set(key, { reactions, meta, timestamp: Date.now() });
                logDebug('ThreadReactionStore: queued while busy', { messageId, source: meta.source });
                return;
            }
            
            // 即座に更新実行
            this.executeUpdate(messageId);
        },

        /**
         * DOM更新を実行
         */
        async executeUpdate(messageId, options = {}) {
            if (!messageId) return;
            
            const key = String(messageId);
            this.updating.add(key);
            
            try {
                const data = this.reactionData.get(key);
                if (!data) {
                    return;
                }
                
                const { reactions, meta } = data;
                
                logDebug('ThreadReactionStore: DOM update begin', {
                    messageId,
                    source: meta.source,
                    count: reactions.length,
                    sequence: meta.sequence,
                });
                
                // DOM要素を取得
                const $message = $(`.thread-message[data-message-id="${messageId}"]`);
                if (!$message.length) {
                    logDebug('ThreadReactionStore: missing message element', { messageId });
                    return;
                }
                
                // リアクションコンテナを取得または作成
                let $container = $message.find('.message-reactions').first();
                if (!$container.length) {
                    $container = $('<div class="message-reactions" data-reactions-hydrated="1"></div>');
                    $message.find('.message-content').after($container);
                }
                
                // DOM更新を実行
                this.updateDOM($container, reactions);

                if (core.cacheReactionData) {
                    core.cacheReactionData(messageId, reactions, true);
                }

                logDebug('ThreadReactionStore: DOM update complete', {
                    messageId,
                    source: meta.source,
                    count: reactions.length,
                    sequence: meta.sequence,
                });
                
            } catch (error) {
                logDebug('ThreadReactionStore: DOM update error', { messageId, error });
            } finally {
                this.updating.delete(key);
                
                // キューに待機中の更新があれば実行
                const queued = this.updateQueue.get(key);
                if (queued) {
                    this.updateQueue.delete(key);
                    logDebug('ThreadReactionStore: draining queued update', { messageId });
                    setTimeout(() => this.executeUpdate(messageId), 10);
                }
            }
        },

        /**
         * DOM要素を更新
         */
        updateDOM($container, reactions) {
            // 既存のリアクションを取得
            const existing = new Map();
            $container.find('.reaction-item').each(function () {
                const $item = $(this);
                const emoji = $item.data('emoji');
                if (emoji) {
                    existing.set(emoji, $item);
                }
            });

            // リアクションをグループ化
            const grouped = this.groupReactions(reactions);
            const currentUserId = window.lmsChat?.currentUserId ? parseInt(window.lmsChat.currentUserId, 10) : null;
            const seen = new Set();

            // 新しいリアクションを追加・更新
            Object.values(grouped).forEach(group => {
                seen.add(group.emoji);
                const reacted = currentUserId && Array.isArray(group.userIds) ? group.userIds.includes(currentUserId) : false;
                const usersLabel = group.users.join(', ');
                
                let $item = existing.get(group.emoji);
                if ($item && $item.length) {
                    // 既存アイテムを更新
                    $item.find('.count').text(group.count);
                    $item.attr('data-users', usersLabel);
                    $item.toggleClass('user-reacted', reacted);
                } else {
                    // 新しいアイテムを作成
                    $item = $(
                        `<div class="reaction-item${reacted ? ' user-reacted' : ''}" data-emoji="${group.emoji}" data-users="${usersLabel}">
                            <span class="emoji">${group.emoji}</span>
                            <span class="count">${group.count}</span>
                        </div>`
                    );
                    $container.append($item);
                }
            });

            // 削除されたリアクションを除去
            existing.forEach(($item, emoji) => {
                if (!seen.has(emoji)) {
                    $item.remove();
                }
            });

            // 空の場合はコンテナをクリア
            if (Object.keys(grouped).length === 0) {
                $container.empty();
            }
            
            // ハイドレーション完了マークを付与
            $container.attr('data-reactions-hydrated', '1');
        },

        /**
         * リアクションをグループ化
         */
        groupReactions(reactions) {
            const grouped = {};
            
            reactions.forEach(reaction => {
                const emoji = reaction.reaction;
                if (!emoji) return;
                
                if (!grouped[emoji]) {
                    grouped[emoji] = {
                        emoji,
                        count: 0,
                        users: [],
                        userIds: []
                    };
                }
                
                grouped[emoji].count++;
                if (reaction.display_name) {
                    grouped[emoji].users.push(reaction.display_name);
                }
                if (reaction.user_id) {
                    grouped[emoji].userIds.push(parseInt(reaction.user_id, 10));
                }
            });
            
            return grouped;
        },

        /**
         * キャッシュをクリア
         */
        clearCache(messageId) {
            if (messageId) {
                const key = String(messageId);
                this.reactionData.delete(key);
                this.lastUpdate.delete(key);
                this.updateQueue.delete(key);
                this.updating.delete(key);
            } else {
                this.reactionData.clear();
                this.lastUpdate.clear();
                this.updateQueue.clear();
                this.updating.clear();
            }
        },

        /**
         * デバッグ情報を取得
         */
        getDebugInfo() {
            return {
                storedMessages: Array.from(this.reactionData.keys()),
                queuedUpdates: Array.from(this.updateQueue.keys()),
                updatingMessages: Array.from(this.updating),
                totalReactions: Array.from(this.reactionData.values()).reduce((sum, data) => sum + data.reactions.length, 0)
            };
        },

        /**
         * デバッグ情報をコンソールに出力
         */
        debugLog() {
            const info = this.getDebugInfo();
            console.group('ThreadReactionStore Debug Info');
            console.groupEnd();
        }
    };

    // グローバルに公開
    window.LMSChat.threadReactionStore = ThreadReactionStore;

    // デバッグ用のグローバル関数
    window.debugThreadReactions = function() {
        if (window.LMSChat?.threadReactionStore) {
            window.LMSChat.threadReactionStore.debugLog();
        } else {
        }
    };

})(jQuery);
