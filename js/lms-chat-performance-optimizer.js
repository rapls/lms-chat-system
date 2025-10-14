/**
 * LMS チャットパフォーマンス最適化モジュール
 *
 * チャンネル読み込みとリロード時のパフォーマンスを改善
 */
(function($) {
    'use strict';

    window.LMSChatPerformanceOptimizer = {
        // パフォーマンス設定（緊急最適化済み）
        config: {
            enableCache: true,
            cacheExpiry: 900000, // 5分→15分（キャッシュヒット率向上）
            batchSize: 20, // 50→20（初回ロード高速化）
            preloadChannels: false, // チャンネル事前読み込みを一時的に無効化
            optimizeReactions: true, // リアクション最適化
            lazyLoadImages: true // 画像の遅延読み込み
        },

        // キャッシュストレージ
        cache: {
            channels: new Map(),
            messages: new Map(),
            reactions: new Map(),
            timestamps: new Map()
        },

        /**
         * 初期化
         */
        init() {

            this.setupCacheSystem();
            this.optimizeChannelLoading();
            this.optimizeReactionSystem();
            this.setupPreloadStrategies();

            // パフォーマンス監視
            this.startPerformanceMonitoring();

        },

        /**
         * キャッシュシステムのセットアップ
         */
        setupCacheSystem() {
            // localStorageキャッシュの初期化
            this.loadCacheFromStorage();

            // キャッシュ自動クリーンアップ
            setInterval(() => this.cleanupExpiredCache(), 60000); // 1分ごと
        },

        /**
         * チャンネル読み込み最適化
         */
        optimizeChannelLoading() {
            const originalGetMessages = window.LMSChat?.messages?.getMessages;
            if (!originalGetMessages) return;

            window.LMSChat.messages.getMessages = async (channelId, options = {}) => {
                const cacheKey = `channel_${channelId}_${options.page || 1}`;

                // キャッシュチェック
                if (this.config.enableCache && !options.forceRefresh) {
                    const cached = this.getCache('messages', cacheKey);
                    if (cached) {
                        return Promise.resolve({ success: true, data: cached });
                    }
                }

                // 元の関数を呼び出し
                const startTime = performance.now();
                const result = await originalGetMessages.call(window.LMSChat.messages, channelId, options);
                const loadTime = performance.now() - startTime;


                // 成功時はキャッシュ保存
                if (result.success && result.data) {
                    this.setCache('messages', cacheKey, result.data);

                    // リアクションデータも別途キャッシュ
                    if (result.data.messages) {
                        this.cacheReactionsFromMessages(result.data.messages);
                    }
                }

                return result;
            };
        },

        /**
         * リアクションシステム最適化
         */
        optimizeReactionSystem() {
            // リアクション更新のバッチ処理
            this.reactionUpdateQueue = [];
            this.reactionUpdateTimer = null;

            // updateMessageReactions のラップ
            const originalUpdate = window.updateMessageReactions;
            if (originalUpdate) {
                window.updateMessageReactions = (messageId, reactions, skipCache, forceUpdate) => {
                    if (this.config.optimizeReactions && !forceUpdate) {
                        // バッチ処理キューに追加
                        this.queueReactionUpdate(messageId, reactions);
                    } else {
                        // 即座に更新
                        originalUpdate(messageId, reactions, skipCache, forceUpdate);
                    }
                };
            }
        },

        /**
         * リアクション更新をキューに追加
         */
        queueReactionUpdate(messageId, reactions) {
            this.reactionUpdateQueue.push({ messageId, reactions });

            // タイマーがなければ設定
            if (!this.reactionUpdateTimer) {
                this.reactionUpdateTimer = setTimeout(() => {
                    this.processReactionQueue();
                }, 100); // 100ms後にバッチ処理
            }
        },

        /**
         * リアクション更新キューを処理
         */
        processReactionQueue() {
            if (this.reactionUpdateQueue.length === 0) return;

            const updates = [...this.reactionUpdateQueue];
            this.reactionUpdateQueue = [];
            this.reactionUpdateTimer = null;


            // 実際の更新処理
            const originalUpdate = window.LMSChat?.reactionUI?.updateMessageReactions;
            if (originalUpdate) {
                updates.forEach(({ messageId, reactions }) => {
                    originalUpdate(messageId, reactions, false, true);
                });
            }
        },

        /**
         * 事前読み込み戦略のセットアップ
         */
        setupPreloadStrategies() {
            if (!this.config.preloadChannels) return;

            // ページ読み込み完了後、アイドル時にチャンネルをプリロード
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    this.preloadChannels();
                });
            } else {
                setTimeout(() => {
                    this.preloadChannels();
                }, 2000);
            }
        },

        /**
         * チャンネルの事前読み込み
         */
        async preloadChannels() {
            const channels = $('.channel-item');
            const currentChannelId = window.LMSChat?.state?.currentChannel;

            for (let i = 0; i < Math.min(channels.length, 3); i++) {
                const channelId = $(channels[i]).data('channel-id');
                if (channelId && channelId !== currentChannelId) {
                    const cacheKey = `channel_${channelId}_1`;
                    if (!this.hasCache('messages', cacheKey)) {
                        // バックグラウンドで読み込み
                        this.preloadChannel(channelId);
                    }
                }
            }
        },

        /**
         * 単一チャンネルの事前読み込み
         */
        async preloadChannel(channelId) {
            try {
                // lms_chat_ajax が存在しない場合は、lmsChat を使用
                const ajaxConfig = window.lms_chat_ajax || window.lmsChat;
                if (!ajaxConfig || (!ajaxConfig.ajax_url && !ajaxConfig.ajaxUrl)) {
                    return;
                }

                const response = await $.ajax({
                    url: ajaxConfig.ajaxUrl || ajaxConfig.ajax_url,
                    method: 'GET',
                    data: {
                        action: 'lms_get_messages',
                        channel_id: channelId,
                        page: 1,
                        nonce: ajaxConfig.nonce
                    },
                    timeout: 10000
                });

                if (response.success) {
                    const cacheKey = `channel_${channelId}_1`;
                    this.setCache('messages', cacheKey, response.data);
                }
            } catch (error) {
            }
        },

        /**
         * メッセージからリアクションをキャッシュ
         */
        cacheReactionsFromMessages(messages) {
            if (!Array.isArray(messages)) return;

            messages.forEach(message => {
                if (message.id && message.reactions) {
                    this.setCache('reactions', `msg_${message.id}`, message.reactions);
                }
            });
        },

        /**
         * キャッシュ取得
         */
        getCache(type, key) {
            const cache = this.cache[type];
            if (!cache) return null;

            const cached = cache.get(key);
            if (!cached) return null;

            // 有効期限チェック
            const timestamp = this.cache.timestamps.get(`${type}_${key}`);
            if (timestamp && Date.now() - timestamp > this.config.cacheExpiry) {
                cache.delete(key);
                this.cache.timestamps.delete(`${type}_${key}`);
                return null;
            }

            return cached;
        },

        /**
         * キャッシュ設定
         */
        setCache(type, key, value) {
            const cache = this.cache[type];
            if (!cache) return;

            cache.set(key, value);
            this.cache.timestamps.set(`${type}_${key}`, Date.now());

            // localStorage にも保存（永続化）
            this.saveCacheToStorage(type, key, value);
        },

        /**
         * キャッシュ確認
         */
        hasCache(type, key) {
            return this.getCache(type, key) !== null;
        },

        /**
         * 期限切れキャッシュのクリーンアップ
         */
        cleanupExpiredCache() {
            const now = Date.now();
            let cleaned = 0;

            this.cache.timestamps.forEach((timestamp, key) => {
                if (now - timestamp > this.config.cacheExpiry) {
                    const [type, ...keyParts] = key.split('_');
                    const actualKey = keyParts.join('_');

                    if (this.cache[type]) {
                        this.cache[type].delete(actualKey);
                    }
                    this.cache.timestamps.delete(key);
                    cleaned++;
                }
            });

            if (cleaned > 0) {
            }
        },

        /**
         * localStorageからキャッシュ読み込み
         */
        loadCacheFromStorage() {
            try {
                const stored = localStorage.getItem('lms_chat_cache');
                if (stored) {
                    const data = JSON.parse(stored);
                    // 有効期限内のデータのみ復元
                    const now = Date.now();
                    Object.entries(data).forEach(([key, item]) => {
                        if (item.timestamp && now - item.timestamp < this.config.cacheExpiry) {
                            const [type, ...keyParts] = key.split('_');
                            const actualKey = keyParts.join('_');
                            if (this.cache[type]) {
                                this.cache[type].set(actualKey, item.value);
                                this.cache.timestamps.set(key, item.timestamp);
                            }
                        }
                    });
                }
            } catch (error) {
            }
        },

        /**
         * localStorageにキャッシュ保存
         */
        saveCacheToStorage(type, key, value) {
            try {
                const stored = localStorage.getItem('lms_chat_cache') || '{}';
                const data = JSON.parse(stored);
                const storageKey = `${type}_${key}`;

                data[storageKey] = {
                    value: value,
                    timestamp: Date.now()
                };

                // サイズ制限（5MB以下）
                const dataString = JSON.stringify(data);
                if (dataString.length < 5 * 1024 * 1024) {
                    localStorage.setItem('lms_chat_cache', dataString);
                }
            } catch (error) {
            }
        },

        /**
         * パフォーマンス監視開始
         */
        startPerformanceMonitoring() {
            // Navigation Timing API
            if (window.performance && window.performance.timing) {
                const timing = window.performance.timing;
                // loadEventEndが0でない場合のみ計測
                if (timing.loadEventEnd > 0) {
                    const loadTime = timing.loadEventEnd - timing.navigationStart;
                }
            }

            // Resource Timing API
            if (window.performance && window.performance.getEntriesByType) {
                const resources = window.performance.getEntriesByType('resource');
                const ajaxRequests = resources.filter(r => r.name.includes('admin-ajax.php'));
                ajaxRequests.forEach(req => {
                });
            }
        }
    };

    // 初期化
    $(document).ready(function() {
        // LMSChatが存在することを確認
        if (window.LMSChat) {
            window.LMSChatPerformanceOptimizer.init();
        } else {
            // LMSChatの初期化を待つ
            $(document).on('lms_chat_initialized', function() {
                window.LMSChatPerformanceOptimizer.init();
            });
        }
    });

})(jQuery);