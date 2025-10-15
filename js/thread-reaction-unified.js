(function ($) {
    'use strict';

    window.LMSChat = window.LMSChat || {};

    /**
     * スレッドリアクション完全統一システム
     * 全ての更新処理を一元管理し、競合を完全に防ぐ
     */
    const ThreadReactionUnified = {
        // 唯一のデータソース
        messageReactions: new Map(),
        
        // 更新中フラグ（厳格な排他制御）
        isUpdating: new Set(),
        
        // 更新キュー（順序保証）
        updateQueue: [],
        
        // 処理中フラグ
        isProcessingQueue: false,
        
        // デバッグフラグ
        debug: false,
        
        // 競合検出設定
        conflictDetection: false,
        lastUpdateMap: new Map(),
        
        // デバウンス用タイマー
        debounceTimers: new Map(),

        /**
         * リアクション更新の唯一のエントリーポイント
         */
        updateReactions(messageId, reactions, metadata = {}) {
            if (!messageId) return;
            
            const key = String(messageId);
            const timestamp = Date.now();
            const source = metadata.source || 'unknown';
            
            // 競合チェック
            if (this.checkForConflicts(messageId, source, timestamp)) {
                // 競合が検出され自動修正が適用された場合
                if (this.debug) {
                }
            }
            
            if (this.debug) {
            }
            
            // データの正規化と検証
            const normalizedReactions = this.normalizeReactions(reactions);
            const dataHash = this.generateHash(normalizedReactions);
            
            // 既存データとの比較
            const existingData = this.messageReactions.get(key);
            if (existingData && existingData.hash === dataHash) {
                if (this.debug) {
                }
                return; // 同じデータの場合は処理しない
            }
            
            // 新しいデータを保存
            this.messageReactions.set(key, {
                reactions: normalizedReactions,
                hash: dataHash,
                timestamp: timestamp,
                source: source
            });
            
            // デバウンス処理
            const debounceKey = `${key}_${source}`;
            
            // 既存のタイマーをクリア
            if (this.debounceTimers.has(debounceKey)) {
                clearTimeout(this.debounceTimers.get(debounceKey));
                if (this.debug) {
                }
            }
            
            // 新しいタイマーをセット（50ms待機）
            const timer = setTimeout(() => {
                this.debounceTimers.delete(debounceKey);
                
                // キューに追加
                this.updateQueue.push({
                    messageId: key,
                    reactions: normalizedReactions,
                    timestamp: timestamp,
                    source: source
                });
                
                // キュー処理を開始
                this.processUpdateQueue();
            }, 50);
            
            this.debounceTimers.set(debounceKey, timer);
        },

        /**
         * リアクションデータの正規化
         */
        normalizeReactions(reactions) {
            if (!Array.isArray(reactions)) {
                return [];
            }
            
            return reactions.filter(reaction => {
                return reaction && 
                       typeof reaction === 'object' &&
                       reaction.reaction &&
                       reaction.user_id &&
                       reaction.display_name;
            }).sort((a, b) => {
                // 一貫した順序でソート
                if (a.reaction !== b.reaction) {
                    return a.reaction.localeCompare(b.reaction);
                }
                return parseInt(a.user_id) - parseInt(b.user_id);
            });
        },

        /**
         * データのハッシュ生成（重複検出用）
         */
        generateHash(reactions) {
            return reactions.map(r => `${r.reaction}:${r.user_id}`).join('|');
        },

        /**
         * 更新キューの処理
         */
        async processUpdateQueue() {
            if (this.isProcessingQueue) {
                return; // 既に処理中
            }
            
            this.isProcessingQueue = true;
            
            try {
                while (this.updateQueue.length > 0) {
                    const update = this.updateQueue.shift();
                    await this.executeUpdate(update);
                    
                    // 少し間隔を空けて次の処理へ
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            } finally {
                this.isProcessingQueue = false;
            }
        },

        /**
         * DOM更新の実行
         */
        async executeUpdate(update) {
            const { messageId, reactions, source } = update;
            
            if (this.isUpdating.has(messageId)) {
                // 更新中の場合は再キュー
                this.updateQueue.push(update);
                return;
            }
            
            this.isUpdating.add(messageId);
            
            try {
                if (this.debug) {
                }
                
                // DOM要素を取得（スレッドメッセージ用のセレクタ）
                const $message = $(`#thread-messages .chat-message[data-message-id="${messageId}"], .thread-message[data-message-id="${messageId}"]`);
                if (!$message.length) {
                    if (this.debug) {
                    }
                    return;
                }
                
                // リアクションコンテナを取得または作成
                let $container = $message.find('.message-reactions').first();
                if (!$container.length) {
                    $container = $('<div class="message-reactions" data-reactions-hydrated="1"></div>');
                    $message.find('.message-content').after($container);
                }
                
                // 差分更新によるDOM最適化（ちらつき防止）
                $container.attr('data-reactions-hydrated', '1');
                
                // 現在のリアクションをマップ化
                const currentReactions = new Map();
                $container.find('.reaction-item').each(function() {
                    const $item = $(this);
                    const emoji = $item.data('emoji');
                    currentReactions.set(emoji, $item);
                });
                
                // 新しいリアクションをグループ化
                const grouped = reactions.length > 0 ? this.groupReactions(reactions) : {};
                const newReactions = new Set(Object.keys(grouped));
                
                // 削除すべきリアクション（存在しない絵文字）
                currentReactions.forEach(($item, emoji) => {
                    if (!newReactions.has(emoji)) {
                        // フェードアウトしてから削除
                        $item.stop(true, true).fadeOut(150, function() {
                            $(this).remove();
                        });
                    }
                });
                
                // 追加・更新すべきリアクション
                Object.values(grouped).forEach(group => {
                    const currentUserId = window.lmsChat?.currentUserId ? parseInt(window.lmsChat.currentUserId, 10) : null;
                    const reacted = currentUserId && group.userIds.includes(currentUserId);
                    const usersLabel = group.users.join(', ');
                    const emoji = group.emoji;
                    
                    let $existingItem = currentReactions.get(emoji);
                    
                    if ($existingItem) {
                        // 既存アイテムの更新（アニメーション付き）
                        const $count = $existingItem.find('.count');
                        const oldCount = parseInt($count.text()) || 0;
                        
                        // カウント更新
                        if (oldCount !== group.count) {
                            $count.stop(true, true).fadeOut(50, function() {
                                $(this).text(group.count).fadeIn(50);
                            });
                        }
                        
                        // データ属性更新
                        $existingItem.attr('data-users', usersLabel);
                        
                        // user-reacted クラスの更新（アニメーション付き）
                        if (reacted && !$existingItem.hasClass('user-reacted')) {
                            $existingItem.addClass('user-reacted reaction-add-animation');
                            setTimeout(() => $existingItem.removeClass('reaction-add-animation'), 300);
                        } else if (!reacted && $existingItem.hasClass('user-reacted')) {
                            $existingItem.removeClass('user-reacted');
                        }
                    } else {
                        // 新しいアイテムを作成
                        const $newItem = $(
                            `<div class="reaction-item${reacted ? ' user-reacted' : ''}" data-emoji="${emoji}" data-users="${usersLabel}" style="display: none;">
                                <span class="emoji">${emoji}</span>
                                <span class="count">${group.count}</span>
                            </div>`
                        );
                        
                        // 適切な位置に挿入（ソート順維持）
                        let inserted = false;
                        $container.find('.reaction-item').each(function() {
                            const existingEmoji = $(this).data('emoji');
                            if (emoji < existingEmoji) {
                                $newItem.insertBefore(this);
                                inserted = true;
                                return false;
                            }
                        });
                        
                        if (!inserted) {
                            $container.append($newItem);
                        }
                        
                        // フェードインアニメーション
                        $newItem.fadeIn(200).addClass('reaction-add-animation');
                        setTimeout(() => $newItem.removeClass('reaction-add-animation'), 300);
                    }
                });
                
                // 空のコンテナの処理
                if (reactions.length === 0 && $container.find('.reaction-item').length === 0) {
                    $container.fadeOut(200, function() {
                        $(this).remove();
                    });
                }
                
                // キャッシュも更新
                if (window.LMSChat?.reactionCore?.cacheReactionData) {
                    window.LMSChat.reactionCore.cacheReactionData(messageId, reactions, true);
                }
                
                if (this.debug) {
                }
                
            } catch (error) {
            } finally {
                this.isUpdating.delete(messageId);
            }
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
                grouped[emoji].users.push(reaction.display_name);
                grouped[emoji].userIds.push(parseInt(reaction.user_id, 10));
            });
            
            return grouped;
        },

        /**
         * データを取得
         */
        getReactions(messageId) {
            const data = this.messageReactions.get(String(messageId));
            return data ? data.reactions : [];
        },

        /**
         * デバッグ情報
         */
        getDebugInfo() {
            return {
                messageCount: this.messageReactions.size,
                queueLength: this.updateQueue.length,
                updatingMessages: Array.from(this.isUpdating),
                isProcessingQueue: this.isProcessingQueue
            };
        },

        /**
         * デバッグモードの切り替え
         */
        setDebugMode(enabled) {
            this.debug = enabled;
            if (enabled) {
            }
        },
        
        /**
         * 競合検出を有効化
         */
        enableConflictDetection() {
            this.conflictDetection = true;
        },
        
        /**
         * 競合をチェック
         */
        checkForConflicts(messageId, source, timestamp) {
            if (!this.conflictDetection) return false;
            
            const lastUpdate = this.lastUpdateMap.get(String(messageId));
            if (!lastUpdate) {
                this.lastUpdateMap.set(String(messageId), { source, timestamp });
                return false;
            }
            
            const timeDiff = timestamp - lastUpdate.timestamp;
            const isConflict = timeDiff < 500 && lastUpdate.source !== source;
            
            if (isConflict) {
                
                // 自動修正: 短時間の競合は無視して最新データを優先
                if (timeDiff < 100) {
                    return true;
                }
            }
            
            this.lastUpdateMap.set(String(messageId), { source, timestamp });
            return false;
        }
    };

    // グローバルに公開
    window.LMSChat.threadReactionUnified = ThreadReactionUnified;

    // 強制的なオーバーライド関数
    const forceOverride = () => {
        // 既存のすべてのスレッドリアクション更新関数を統一システムにリダイレクト
        if (window.LMSChat && window.LMSChat.reactionUI) {
            const originalUpdateThreadMessageReactions = window.LMSChat.reactionUI.updateThreadMessageReactions;
            window.LMSChat.reactionUI.updateThreadMessageReactions = function(messageId, reactions, skipCache, forceUpdate) {
                if (ThreadReactionUnified.debug) {
                }
                ThreadReactionUnified.updateReactions(messageId, reactions, {
                    source: 'ui-legacy',
                    skipCache: skipCache,
                    forceUpdate: forceUpdate
                });
            };
        }

        // ThreadReactionStoreも統一システムにリダイレクト
        if (window.LMSChat && window.LMSChat.threadReactionStore) {
            const originalQueueUpdate = window.LMSChat.threadReactionStore.queueUpdate;
            window.LMSChat.threadReactionStore.queueUpdate = function(messageId, reactions, options) {
                if (ThreadReactionUnified.debug) {
                }
                ThreadReactionUnified.updateReactions(messageId, reactions, {
                    source: typeof options === 'string' ? options : options?.source || 'store',
                    options: options
                });
            };
        }

        // 他の可能な更新関数もオーバーライド
        if (window.LMSChat && window.LMSChat.updateThreadMessageReactions) {
            window.LMSChat.updateThreadMessageReactions = function(messageId, reactions) {
                if (ThreadReactionUnified.debug) {
                }
                ThreadReactionUnified.updateReactions(messageId, reactions, {
                    source: 'lms-chat-legacy'
                });
            };
        }

        // グローバルなupdateThreadMessageReactions関数もオーバーライド
        if (window.updateThreadMessageReactions) {
            window.updateThreadMessageReactions = function(messageId, reactions, forceUpdate = false) {
                if (ThreadReactionUnified.debug) {
                }
                ThreadReactionUnified.updateReactions(messageId, reactions, {
                    source: 'window-global',
                    forceUpdate: forceUpdate
                });
            };
        }

        // chat-reactions.js からの呼び出しもインターセプト
        if (window.LMSChat && window.LMSChat.reactions && window.LMSChat.reactions.updateThreadMessageReactions) {
            window.LMSChat.reactions.updateThreadMessageReactions = function(messageId, reactions, forceUpdate = false) {
                if (ThreadReactionUnified.debug) {
                }
                ThreadReactionUnified.updateReactions(messageId, reactions, {
                    source: 'reactions-module',
                    forceUpdate: forceUpdate
                });
            };
        }

        // リアクションマネージャーからの呼び出しもインターセプト
        if (window.LMSReactionManager && window.LMSReactionManager.updateThreadMessageReactions) {
            window.LMSReactionManager.updateThreadMessageReactions = function(messageId, reactions) {
                if (ThreadReactionUnified.debug) {
                }
                ThreadReactionUnified.updateReactions(messageId, reactions, {
                    source: 'reaction-manager'
                });
            };
        }

        // 緊急リアクション同期システムからの呼び出しもインターセプト
        if (window.EmergencyReactionSync && window.EmergencyReactionSync.updateReactions) {
            const originalEmergencyUpdate = window.EmergencyReactionSync.updateReactions;
            window.EmergencyReactionSync.updateReactions = function(reactionsData) {
                if (ThreadReactionUnified.debug) {
                }
                // 緊急システムからのデータを解析してスレッド用に転送
                if (reactionsData && typeof reactionsData === 'object') {
                    Object.keys(reactionsData).forEach(messageId => {
                        const reactions = reactionsData[messageId];
                        ThreadReactionUnified.updateReactions(messageId, reactions, {
                            source: 'emergency-sync'
                        });
                    });
                }
                return true; // 成功を返す
            };
        }
    };

    // デバッグ用のグローバル関数
    window.debugThreadReactionsUnified = function() {
        ThreadReactionUnified.setDebugMode(true);
    };

    // 高度なデバッグ機能
    window.threadReactionDiagnostics = function() {        
        return {
            systemAvailable: !!window.LMSChat?.threadReactionUnified,
            debugMode: ThreadReactionUnified.debug,
            messageCount: ThreadReactionUnified.messageReactions.size,
            updating: Array.from(ThreadReactionUnified.isUpdating),
            queueLength: ThreadReactionUnified.updateQueue.length
        };
    };

    // リアルタイム監視機能
    window.startThreadReactionMonitoring = function() {
        
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        
        // console.log の監視（スレッドリアクション関連のみ）
        console.log = function(...args) {
            const message = args.join(' ');
            if (message.includes('スレッドリアクション') || message.includes('thread reaction') || message.includes('ThreadReaction')) {
                originalLog.apply(console, ['[MONITORED]', ...args]);
            } else {
                originalLog.apply(console, args);
            }
        };
        
        // DOM変更の監視
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1 && 
                            (node.classList?.contains('message-reactions') || 
                             node.querySelector?.('.message-reactions'))) {
                        }
                    });
                }
            });
        });
        
        // スレッドコンテナを監視
        const threadContainer = document.querySelector('#thread-messages');
        if (threadContainer) {
            observer.observe(threadContainer, { childList: true, subtree: true });
        }
        
        return observer;
    };

    // CSSアニメーションの追加
    const addAnimationStyles = () => {
        if (!$('#thread-reaction-animations').length) {
            $('head').append(`
                <style id="thread-reaction-animations">
                    .reaction-item {
                        transition: all 0.2s ease;
                    }
                    @keyframes reactionPulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.15); }
                        100% { transform: scale(1); }
                    }
                    @keyframes reactionBounceIn {
                        0% { 
                            transform: scale(0.8); 
                            opacity: 0; 
                        }
                        60% { 
                            transform: scale(1.1); 
                            opacity: 1;
                        }
                        100% { 
                            transform: scale(1); 
                            opacity: 1;
                        }
                    }
                    .reaction-add-animation { 
                        animation: reactionBounceIn 0.3s ease-out;
                    }
                    .reaction-item.user-reacted {
                        background-color: rgba(var(--primary-rgb, 59, 130, 246), 0.15);
                    }
                </style>
            `);
        }
    };

    // 初期化と定期的なオーバーライド
    const initialize = () => {
        
        // アニメーションスタイルを追加
        addAnimationStyles();
        
        // 強制オーバーライド実行
        forceOverride();
        
        // デバッグモードを自動有効化（問題発生時の調査のため）
        ThreadReactionUnified.setDebugMode(true);
        
        // 競合検出と自動修正を有効化
        ThreadReactionUnified.enableConflictDetection();
    };

    // DOM読み込み完了時の初期化
    $(document).ready(function() {
        initialize();
    });

    // 遅延初期化（他のスクリプト読み込み完了後）
    setTimeout(() => {
        forceOverride();
    }, 1000);

    // 定期的なオーバーライド確認と整合性チェック
    setInterval(() => {
        forceOverride();
        
        // 整合性チェック（デバッグモード時のみ）
        if (ThreadReactionUnified.debug) {
            ThreadReactionUnified.performConsistencyCheck();
        }
    }, 5000);

    // 整合性チェック機能をThreadReactionUnifiedに追加
    ThreadReactionUnified.performConsistencyCheck = function() {
        try {
            const threadMessages = document.querySelectorAll('#thread-messages .chat-message[data-message-id]');
            let inconsistencies = 0;
            
            threadMessages.forEach(messageElement => {
                const messageId = messageElement.getAttribute('data-message-id');
                if (!messageId) return;
                
                const storedData = this.messageReactions.get(String(messageId));
                const domReactionContainer = messageElement.querySelector('.message-reactions');
                
                if (storedData && domReactionContainer) {
                    const domReactions = domReactionContainer.querySelectorAll('.reaction-item');
                    const storedReactionCount = storedData.reactions ? storedData.reactions.length : 0;
                    
                    if (domReactions.length !== storedReactionCount) {
                        inconsistencies++;
                        
                        // 自動修正を試行
                        this.updateReactions(messageId, storedData.reactions, {
                            source: 'consistency-check',
                            force: true
                        });
                    }
                }
            });
            
            if (inconsistencies > 0) {
            }
        } catch (error) {
        }
    };

})(jQuery);