/**
 * LMS 完全ロングポーリングシステム
 * 
 * 既存ショートポーリング（6秒間隔）を30秒ロングポーリングに完全移行
 * シンプルで確実な実装により安定性を確保
 * 
 * @version 1.0.0
 * @author LMS Development Team
 */

(function($) {
    'use strict';

    // グローバル名前空間の確保
    window.LMSChat = window.LMSChat || {};
    window.LMSChat.longpoll = window.LMSChat.longpoll || {};

    class LMSCompleteLongPoll {
        constructor() {
            this.config = {
                endpoint: window.lms_chat_ajax.ajax_url,
                nonce: window.lms_chat_ajax.nonce,
                timeout: 30000,           // 30秒ロングポーリング
                reconnectDelay: 1000,     // 再接続遅延
                maxRetries: 3,            // 最大リトライ回数
                debug: true
            };

            this.state = {
                isActive: false,
                isConnected: false,
                lastEventTimestamp: 0,
                currentChannelId: null,
                currentThreadId: null,
                retryCount: 0,
                abortController: null
            };

            this.statistics = {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                startTime: Date.now()
            };

            this.init();
        }

        /**
         * システム初期化
         */
        init() {
            this.log('LMS完全ロングポーリングシステム初期化開始');
            
            $(document).ready(() => {
                this.setupEventListeners();
                this.getCurrentContext();
                this.start();
            });

            // ページ離脱時のクリーンアップ
            $(window).on('beforeunload', () => {
                this.stop();
            });
        }

        /**
         * イベントリスナーの設定
         */
        setupEventListeners() {
            // チャンネル変更の監視
            $(document).on('lms_channel_switched', (event, channelId) => {
                this.log(`チャンネル変更検出: ${channelId}`);
                this.state.currentChannelId = channelId;
                this.restart();
            });

            // スレッド変更の監視
            $(document).on('lms_thread_opened', (event, threadId) => {
                this.log(`スレッド開始検出: ${threadId}`);
                this.state.currentThreadId = threadId;
                this.restart();
            });

            $(document).on('lms_thread_closed', () => {
                this.log('スレッド終了検出');
                this.state.currentThreadId = null;
                this.restart();
            });

            // メッセージ送信後の即座再開
            $(document).on('lms_message_sent', () => {
                this.log('メッセージ送信検出 - 即座に再開');
                this.restart();
            });
        }

        /**
         * 現在のコンテキスト取得
         */
        getCurrentContext() {
            // 現在のチャンネルID取得
            const $activeChannel = $('.channel-item.active, .channel-item.current');
            if ($activeChannel.length > 0) {
                this.state.currentChannelId = $activeChannel.data('channel-id');
            }

            // 現在のスレッドID取得
            const $activeThread = $('.thread-overlay:visible');
            if ($activeThread.length > 0) {
                this.state.currentThreadId = $activeThread.data('message-id');
            }

            this.log(`現在のコンテキスト - チャンネル:${this.state.currentChannelId}, スレッド:${this.state.currentThreadId}`);
        }

        /**
         * ロングポーリング開始
         */
        start() {
            if (this.state.isActive) {
                this.log('既にアクティブです');
                return;
            }

            this.state.isActive = true;
            this.state.retryCount = 0;
            this.log('ロングポーリング開始');
            
            this.poll();
        }

        /**
         * ロングポーリング停止
         */
        stop() {
            this.state.isActive = false;
            
            if (this.state.abortController) {
                this.state.abortController.abort();
                this.state.abortController = null;
            }

            this.log('ロングポーリング停止');
        }

        /**
         * 再起動
         */
        restart() {
            this.log('ロングポーリング再起動');
            this.stop();
            setTimeout(() => {
                if (!this.state.isActive) {
                    this.start();
                }
            }, 100);
        }

        /**
         * メインポーリング処理
         */
        async poll() {
            if (!this.state.isActive) {
                return;
            }

            const startTime = Date.now();
            this.state.abortController = new AbortController();

            try {
                const params = this.buildRequestParams();
                this.log(`ポーリング開始 - パラメータ: ${JSON.stringify(params)}`);

                const response = await this.makeRequest(params);
                const responseTime = Date.now() - startTime;

                this.updateStatistics(true, responseTime);
                this.handleResponse(response);
                
                this.state.retryCount = 0;
                this.state.isConnected = true;

            } catch (error) {
                const responseTime = Date.now() - startTime;
                this.updateStatistics(false, responseTime);
                this.handleError(error);
            }

            // 連続ポーリング
            if (this.state.isActive) {
                const delay = this.calculateRetryDelay();
                setTimeout(() => this.poll(), delay);
            }
        }

        /**
         * リクエストパラメータ構築
         */
        buildRequestParams() {
            return {
                action: 'lms_long_poll_updates',
                nonce: this.config.nonce,
                channel_id: this.state.currentChannelId || 0,
                thread_id: this.state.currentThreadId || 0,
                last_timestamp: this.state.lastEventTimestamp,
                timeout: this.config.timeout,
                types: 'all' // 全イベントタイプ
            };
        }

        /**
         * HTTP リクエスト実行
         */
        async makeRequest(params) {
            this.statistics.totalRequests++;

            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(params),
                signal: this.state.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.data?.message || 'Unknown error');
            }

            return data.data;
        }

        /**
         * レスポンス処理
         */
        handleResponse(data) {
            if (!data || !data.events) {
                this.log('イベントなし');
                return;
            }

            this.log(`${data.events.length}件のイベントを受信`);

            // イベント処理
            data.events.forEach(event => {
                this.processEvent(event);
                
                // タイムスタンプ更新
                if (event.timestamp > this.state.lastEventTimestamp) {
                    this.state.lastEventTimestamp = event.timestamp;
                }
            });

            // 最新のタイムスタンプを保存
            if (data.timestamp) {
                this.state.lastEventTimestamp = Math.max(
                    this.state.lastEventTimestamp, 
                    data.timestamp
                );
            }
        }

        /**
         * イベント処理
         */
        processEvent(event) {
            this.log(`イベント処理: ${event.type}`, event);

            switch (event.type) {
                case 'message_create':
                    this.handleNewMessage(event);
                    break;
                
                case 'message_delete':
                    this.handleMessageDelete(event);
                    break;
                
                case 'reaction_update':
                    this.handleReactionUpdate(event);
                    break;
                
                case 'thread_message_create':
                    this.handleThreadMessage(event);
                    break;
                
                case 'thread_message_delete':
                    this.handleThreadMessageDelete(event);
                    break;
                
                default:
                    this.log(`未対応イベントタイプ: ${event.type}`);
            }
        }

        /**
         * 新規メッセージ処理
         */
        handleNewMessage(event) {
            const data = event.data;
            
            // 自分のメッセージは除外
            if (data.user_id == window.lms_chat_ajax.current_user_id) {
                return;
            }

            // メッセージ表示
            if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.appendMessage) {
                window.LMSChat.messages.appendMessage(data, false);
            }

            // バッジ更新
            this.updateUnreadBadge(data.channel_id, 1);
            
            // 通知
            this.showNotification('新しいメッセージ', data.message);
        }

        /**
         * メッセージ削除処理
         */
        handleMessageDelete(event) {
            const messageId = event.data.message_id;
            
            $(`[data-message-id="${messageId}"]`).fadeOut(300, function() {
                $(this).remove();
            });
        }

        /**
         * リアクション更新処理
         */
        handleReactionUpdate(event) {
            const data = event.data;
            const messageSelector = `[data-message-id="${data.message_id}"]`;
            
            // リアクション表示更新
            this.updateReactionDisplay(messageSelector, data.reactions);
        }

        /**
         * スレッドメッセージ処理
         */
        handleThreadMessage(event) {
            const data = event.data;
            
            // スレッドが開いている場合は表示
            if (this.state.currentThreadId == data.parent_message_id) {
                if (window.LMSChat && window.LMSChat.threads && window.LMSChat.threads.appendThreadMessage) {
                    window.LMSChat.threads.appendThreadMessage(data);
                }
            }
            
            // スレッドバッジ更新
            this.updateThreadBadge(data.parent_message_id, 1);
        }

        /**
         * スレッドメッセージ削除処理
         */
        handleThreadMessageDelete(event) {
            const messageId = event.data.message_id;
            
            // スレッド内のメッセージ削除
            $(`.thread-message[data-thread-message-id="${messageId}"]`).fadeOut(300, function() {
                $(this).remove();
            });
        }

        /**
         * 未読バッジ更新
         */
        updateUnreadBadge(channelId, increment = 1) {
            const $channelBadge = $(`.channel-item[data-channel-id="${channelId}"] .unread-badge`);
            
            if ($channelBadge.length > 0) {
                const currentCount = parseInt($channelBadge.text()) || 0;
                const newCount = currentCount + increment;
                $channelBadge.text(newCount).show();
            } else {
                $(`.channel-item[data-channel-id="${channelId}"]`).append(
                    `<span class="unread-badge">${increment}</span>`
                );
            }
        }

        /**
         * スレッドバッジ更新
         */
        updateThreadBadge(parentMessageId, increment = 1) {
            const $threadBadge = $(`[data-message-id="${parentMessageId}"] .thread-unread-badge`);
            
            if ($threadBadge.length > 0) {
                const currentCount = parseInt($threadBadge.text()) || 0;
                const newCount = currentCount + increment;
                $threadBadge.text(newCount).show();
            } else {
                $(`[data-message-id="${parentMessageId}"] .thread-info`).append(
                    `<span class="thread-unread-badge">${increment}</span>`
                );
            }
        }

        /**
         * リアクション表示更新
         */
        updateReactionDisplay(messageSelector, reactions) {
            const $reactionContainer = $(`${messageSelector} .reactions-container`);
            
            if ($reactionContainer.length === 0) {
                return;
            }

            // 既存のリアクションクリア
            $reactionContainer.empty();

            // 新しいリアクション表示
            Object.entries(reactions).forEach(([emoji, users]) => {
                if (users.length > 0) {
                    const $reaction = $(`
                        <span class="reaction-item" data-emoji="${emoji}">
                            ${emoji} <span class="reaction-count">${users.length}</span>
                        </span>
                    `);
                    $reactionContainer.append($reaction);
                }
            });
        }

        /**
         * 通知表示
         */
        showNotification(title, message) {
            if (window.LMSPushNotification && window.LMSPushNotification.showNotification) {
                window.LMSPushNotification.showNotification(title, {
                    body: message,
                    icon: '/wp-content/themes/lms/img/icon-chat.svg'
                });
            }
        }

        /**
         * エラー処理
         */
        handleError(error) {
            this.state.isConnected = false;
            this.state.retryCount++;

            if (error.name === 'AbortError') {
                this.log('リクエスト中断');
                return;
            }

            this.log(`エラー発生 (試行 ${this.state.retryCount}/${this.config.maxRetries}): ${error.message}`);

            if (this.state.retryCount >= this.config.maxRetries) {
                this.log('最大リトライ回数に達しました。接続を停止します。');
                this.stop();
                
                setTimeout(() => {
                    this.log('自動再開を実行します');
                    this.start();
                }, 300000);
            }
        }

        /**
         * リトライ遅延計算
         */
        calculateRetryDelay() {
            if (this.state.retryCount === 0) {
                return 500; // 通常時は短い遅延
            }
            
            // 指数バックオフ
            return Math.min(this.config.reconnectDelay * Math.pow(2, this.state.retryCount - 1), 30000);
        }

        /**
         * 統計情報更新
         */
        updateStatistics(success, responseTime) {
            if (success) {
                this.statistics.successfulRequests++;
            } else {
                this.statistics.failedRequests++;
            }

            // 移動平均でレスポンス時間更新
            this.statistics.averageResponseTime = 
                (this.statistics.averageResponseTime * 0.9) + (responseTime * 0.1);
        }

        /**
         * 統計情報取得
         */
        getStatistics() {
            const uptime = Date.now() - this.statistics.startTime;
            const successRate = this.statistics.totalRequests > 0 ? 
                (this.statistics.successfulRequests / this.statistics.totalRequests * 100).toFixed(2) : 0;

            return {
                uptime: Math.floor(uptime / 1000),
                totalRequests: this.statistics.totalRequests,
                successfulRequests: this.statistics.successfulRequests,
                failedRequests: this.statistics.failedRequests,
                successRate: successRate + '%',
                averageResponseTime: Math.round(this.statistics.averageResponseTime) + 'ms',
                isConnected: this.state.isConnected,
                isActive: this.state.isActive,
                currentChannel: this.state.currentChannelId,
                currentThread: this.state.currentThreadId
            };
        }

        /**
         * デバッグログ
         */
        log(message, data = null) {
            if (!this.config.debug) return;

            const timestamp = new Date().toLocaleTimeString();
        }

        /**
         * 既存ショートポーリングシステム無効化
         */
        disableLegacySystems() {
            this.log('既存ショートポーリングシステムを無効化中...');

            // 既存のsetIntervalを停止
            const intervals = [
                'reactionPollingInterval',
                'threadReactionPollingInterval',
                'badgeUpdateInterval',
                'unreadCheckInterval'
            ];

            intervals.forEach(intervalName => {
                if (window[intervalName]) {
                    clearInterval(window[intervalName]);
                    window[intervalName] = null;
                    this.log(`${intervalName} を停止`);
                }
            });

            // グローバル状態をフラグ設定
            window.LMS_LONGPOLL_ACTIVE = true;
            
            this.log('既存システム無効化完了');
        }
    }

    // システム初期化
    $(document).ready(function() {
        // 重複起動防止
        if (window.LMSCompleteLongPoll) {
            return;
        }

        // インスタンス作成
        const longPollSystem = new LMSCompleteLongPoll();
        
        // グローバル参照
        window.LMSCompleteLongPoll = longPollSystem;
        window.LMSChat.longpoll = longPollSystem;

        // 既存システム無効化
        longPollSystem.disableLegacySystems();

        // デバッグ用グローバル関数
        window.getLongPollStats = () => longPollSystem.getStatistics();
        
    });

})(jQuery);