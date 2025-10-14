/**
 * LMSスレッド同期マネージャー
 * 
 * スレッドメッセージの作成・削除・更新をリアルタイムで同期し、
 * サーバー負荷を最小限に抑えながら全参加者に反映する機能を提供
 *
 * @package LMS Theme  
 */

(function($, window) {
    'use strict';

    // 名前空間の確保
    window.LMSChat = window.LMSChat || {};
    window.LMSChat.threadSync = window.LMSChat.threadSync || {};

    /**
     * LMSスレッド同期マネージャー
     */
    class LMSThreadSyncManager {
        constructor() {
            this.initialized = false;
            this.currentChannelId = null;
            this.activeThreads = new Map(); // アクティブなスレッド管理
            this.syncQueue = new Map(); // 同期待ちキュー
            this.lastProcessedEventId = 0;
            
            // パフォーマンス設定
            this.config = {
                batchSize: 10,
                debounceTime: 100,
                maxRetries: 3,
                retryDelay: 1000,
                syncInterval: 2000,
                domUpdateDelay: 50
            };
            
            // エラー統計
            this.stats = {
                processedEvents: 0,
                errors: 0,
                lastSyncTime: null
            };

            this.bindEvents();
            this.initializeEventHandlers();
        }

        /**
         * 初期化
         */
        initialize(channelId) {
            if (this.initialized && this.currentChannelId === channelId) {
                return;
            }

            this.currentChannelId = channelId;
            this.initialized = true;
            
            this.log('LMSThreadSyncManager initialized for channel:', channelId);
            
            // 統合Long Pollingシステムとの連携
            this.integrateWithLongPolling();
            
            return this;
        }

        /**
         * 統合Long Pollingシステムとの連携
         */
        integrateWithLongPolling() {
            // 統合Long Pollingクライアントが利用可能かチェック
            if (typeof window.unifiedLongPoll !== 'undefined') {
                // スレッド関連イベントを監視対象に追加
                const threadEventTypes = [
                    'thread_create',
                    'thread_delete', 
                    'thread_summary_update'
                ];
                
                // イベントハンドラーを登録
                window.unifiedLongPoll.on('event_received', (event) => {
                    if (threadEventTypes.includes(event.type)) {
                        this.handleLongPollEvent(event);
                    }
                });

                this.log('Integrated with Unified Long Polling system');
            } else {
                // フォールバック: 従来のシステムとの連携
                this.setupFallbackSync();
            }
        }

        /**
         * Long Pollingイベントハンドラー
         */
        handleLongPollEvent(event) {
            try {
                this.stats.processedEvents++;
                
                switch (event.type) {
                    case 'thread_create':
                        this.handleThreadMessageCreated(event.data);
                        break;
                    case 'thread_delete':
                        this.handleThreadMessageDeleted(event.data);
                        break;
                    case 'thread_summary_update':
                        this.handleThreadSummaryUpdate(event.data);
                        break;
                    default:
                        this.log('Unknown thread event type:', event.type);
                }

                this.lastProcessedEventId = Math.max(this.lastProcessedEventId, event.id || 0);
                
            } catch (error) {
                this.stats.errors++;
                this.logError('Error handling long poll event:', error);
            }
        }

        /**
         * スレッドメッセージ作成イベントの処理
         */
        handleThreadMessageCreated(data) {
            if (!data || !data.thread_id || !data.message_id) {
                return;
            }

            const threadId = parseInt(data.thread_id);
            const messageId = parseInt(data.message_id);

            // 重複チェック
            if (this.isDuplicateMessage(threadId, messageId)) {
                return;
            }

            // DOM更新をキューに追加（デバウンス処理）
            this.queueDOMUpdate(() => {
                this.addThreadMessageToDOM(data);
            }, `thread_create_${threadId}_${messageId}`);

            // アクティブスレッド管理の更新
            this.updateActiveThread(threadId, {
                lastMessageId: messageId,
                lastActivity: new Date().getTime()
            });

            this.log('Thread message created:', {threadId, messageId});
        }

        /**
         * スレッドメッセージ削除イベントの処理  
         */
        handleThreadMessageDeleted(data) {
            if (!data || !data.thread_id || !data.message_id) {
                return;
            }

            const threadId = parseInt(data.thread_id);
            const messageId = parseInt(data.message_id);

            // DOM更新をキューに追加
            this.queueDOMUpdate(() => {
                this.removeThreadMessageFromDOM(threadId, messageId);
            }, `thread_delete_${threadId}_${messageId}`);

            this.log('Thread message deleted:', {threadId, messageId});
        }

        /**
         * スレッドサマリー更新イベントの処理
         */
        handleThreadSummaryUpdate(data) {
            if (!data || !data.thread_id || !data.summary) {
                return;
            }

            const threadId = parseInt(data.thread_id);

            // DOM更新をキューに追加
            this.queueDOMUpdate(() => {
                this.updateThreadSummaryDOM(threadId, data.summary);
            }, `thread_summary_${threadId}`);

            this.log('Thread summary updated:', {threadId, summary: data.summary});
        }

        /**
         * DOM更新のキューイング（デバウンス機能付き）
         */
        queueDOMUpdate(updateFunction, key) {
            // 既存のタイマーをクリア
            if (this.syncQueue.has(key)) {
                clearTimeout(this.syncQueue.get(key).timer);
            }

            // 新しいタイマーを設定
            const timer = setTimeout(() => {
                this.performDOMUpdate(updateFunction, key);
            }, this.config.domUpdateDelay);

            this.syncQueue.set(key, {
                updateFunction,
                timer,
                timestamp: Date.now()
            });
        }

        /**
         * DOM更新の実行
         */
        performDOMUpdate(updateFunction, key) {
            try {
                // requestAnimationFrameを使用してスムーズな更新
                requestAnimationFrame(() => {
                    updateFunction();
                    this.syncQueue.delete(key);
                });
            } catch (error) {
                this.logError('DOM update error:', error);
                this.syncQueue.delete(key);
            }
        }

        /**
         * スレッドメッセージをDOMに追加
         */
        addThreadMessageToDOM(messageData) {
            const threadId = messageData.thread_id;
            const $threadPanel = $(`.thread-panel[data-current-thread-id="${threadId}"]`);
            
            if ($threadPanel.length === 0) {
                // スレッドが現在開いていない場合は処理をスキップ
                return;
            }

            const $messagesContainer = $threadPanel.find('.thread-messages');
            if ($messagesContainer.length === 0) {
                return;
            }

            // メッセージHTML生成
            const messageHtml = this.generateMessageHTML(messageData);
            
            // メッセージを適切な位置に挿入
            const $newMessage = $(messageHtml);
            $messagesContainer.append($newMessage);

            // アニメーション効果（フェードイン）
            $newMessage.hide().fadeIn(300);

            // 同期受信時は一切スクロールしない（削除）

            // 未読カウント更新
            this.updateUnreadCount(threadId);
        }

        /**
         * スレッドメッセージをDOMから削除
         */
        removeThreadMessageFromDOM(threadId, messageId) {
            const $message = $(`.thread-message[data-message-id="${messageId}"]`);
            
            if ($message.length > 0) {
                // フェードアウト効果
                $message.fadeOut(300, function() {
                    $(this).remove();
                });
            }
        }

        /**
         * スレッドサマリーのDOM更新
         */
        updateThreadSummaryDOM(threadId, summary) {
            // メインチャネルのスレッド要素を更新
            const $threadElement = $(`.message-thread[data-thread-id="${threadId}"]`);
            
            if ($threadElement.length > 0) {
                // 返信数の更新
                const $replyCount = $threadElement.find('.thread-reply-count');
                if ($replyCount.length > 0 && summary.reply_count !== undefined) {
                    $replyCount.text(`${summary.reply_count}件の返信`);
                }

                // 最後のメッセージ時刻の更新
                const $lastReply = $threadElement.find('.thread-last-reply');
                if ($lastReply.length > 0 && summary.last_reply_at) {
                    $lastReply.text(this.formatRelativeTime(summary.last_reply_at));
                }

                // 参加者数の更新
                const $participants = $threadElement.find('.thread-participants');
                if ($participants.length > 0 && summary.participant_count !== undefined) {
                    $participants.text(`${summary.participant_count}人が参加`);
                }
            }
        }

        /**
         * メッセージHTMLの生成
         */
        generateMessageHTML(messageData) {
            const timestamp = this.formatTimestamp(messageData.created_at);
            const userName = this.escapeHtml(messageData.user_name || messageData.display_name || 'ユーザー');
            const messageContent = this.escapeHtml(messageData.message || messageData.content || '');
            const avatarUrl = messageData.avatar_url || '';

            return `
                <div class="thread-message" data-message-id="${messageData.message_id}" data-user-id="${messageData.user_id}">
                    <div class="message-header">
                        ${avatarUrl ? `<img src="${avatarUrl}" class="user-avatar" alt="${userName}">` : ''}
                        <span class="user-name">${userName}</span>
                        <span class="message-time">${timestamp}</span>
                    </div>
                    <div class="message-content">
                        ${this.linkifyText(messageContent)}
                    </div>
                </div>
            `;
        }

        /**
         * フォールバック同期システムのセットアップ
         */
        setupFallbackSync() {
            this.log('Setting up fallback sync system');
            
            // 定期的な同期処理
            setInterval(() => {
                this.performFallbackSync();
            }, this.config.syncInterval);
        }

        /**
         * フォールバック同期処理
         */
        performFallbackSync() {
            if (!this.currentChannelId) {
                return;
            }

            // Ajax リクエストで最新のスレッド更新を取得
            $.ajax({
                url: lmsAjax.ajaxurl,
                type: 'POST',
                data: {
                    action: 'lms_get_thread_updates',
                    channel_id: this.currentChannelId,
                    last_event_id: this.lastProcessedEventId,
                    nonce: lmsAjax.nonce
                },
                success: (response) => {
                    if (response.success && response.data.events) {
                        response.data.events.forEach(event => {
                            this.handleLongPollEvent(event);
                        });
                    }
                },
                error: (xhr, status, error) => {
                    this.logError('Fallback sync failed:', error);
                }
            });
        }

        /**
         * イベントハンドラーの初期化
         */
        initializeEventHandlers() {
            // スレッドを開いた時の処理
            $(document).on('thread:opened', (event, threadData) => {
                if (threadData && threadData.thread_id) {
                    this.onThreadOpened(threadData.thread_id);
                }
            });

            // スレッドを閉じた時の処理
            $(document).on('thread:closed', () => {
                this.onThreadClosed();
            });

            // チャンネル切り替え時の処理
            $(document).on('channel:switched', (event, channelData) => {
                if (channelData && channelData.channel_id) {
                    this.initialize(channelData.channel_id);
                }
            });
        }

        /**
         * スレッド開いた時の処理
         */
        onThreadOpened(threadId) {
            this.updateActiveThread(threadId, {
                isOpen: true,
                openedAt: Date.now()
            });
            
            this.log('Thread opened:', threadId);
        }

        /**
         * スレッド閉じた時の処理
         */
        onThreadClosed() {
            // アクティブなスレッドのクリーンアップ
            this.activeThreads.forEach((data, threadId) => {
                data.isOpen = false;
            });
            
            this.log('Thread closed');
        }

        /**
         * アクティブスレッド情報の更新
         */
        updateActiveThread(threadId, data) {
            const existing = this.activeThreads.get(threadId) || {};
            this.activeThreads.set(threadId, { ...existing, ...data });
        }

        /**
         * 重複メッセージチェック
         */
        isDuplicateMessage(threadId, messageId) {
            const activeThread = this.activeThreads.get(threadId);
            if (!activeThread) {
                return false;
            }

            // DOM上に既に存在するかチェック
            const $existing = $(`.thread-message[data-message-id="${messageId}"]`);
            return $existing.length > 0;
        }

        /**
         * 現在のユーザーのメッセージかチェック
         */
        isCurrentUserMessage(messageData) {
            const currentUserId = lmsAjax.userId || lmsLongPollConfig?.userId;
            return messageData.user_id && parseInt(messageData.user_id) === parseInt(currentUserId);
        }

        /**
         * スレッドの最下部へスクロール
         */
        scrollThreadToBottom($threadPanel) {
            const $messagesContainer = $threadPanel.find('.thread-messages');
            if ($messagesContainer.length > 0) {
                $messagesContainer.animate({
                    scrollTop: $messagesContainer[0].scrollHeight
                }, 300);
            }
        }

        /**
         * 未読カウントの更新
         */
        updateUnreadCount(threadId) {
            // 未読バッジシステムとの連携
            if (window.LMSUnifiedBadgeManager) {
                window.LMSUnifiedBadgeManager.updateThreadBadge(threadId);
            }
        }

        /**
         * イベントの基本バインディング
         */
        bindEvents() {
            // window.beforeunload でクリーンアップ
            $(window).on('beforeunload', () => {
                this.cleanup();
            });

            // ページ可視性変更の処理
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.onPageHidden();
                } else {
                    this.onPageVisible();
                }
            });
        }

        /**
         * ページが隠れた時の処理
         */
        onPageHidden() {
            // 非アクティブ時はポーリング頻度を下げる
            this.config.syncInterval = 5000; // 5秒に延長
        }

        /**
         * ページが表示された時の処理
         */
        onPageVisible() {
            // アクティブ時は通常のポーリング頻度に戻す
            this.config.syncInterval = 2000; // 2秒
            
            // 復帰時に同期処理を実行
            setTimeout(() => {
                this.performFallbackSync();
            }, 100);
        }

        /**
         * クリーンアップ処理
         */
        cleanup() {
            // タイマーのクリア
            this.syncQueue.forEach((item) => {
                if (item.timer) {
                    clearTimeout(item.timer);
                }
            });
            this.syncQueue.clear();
            
            // アクティブスレッドのクリア
            this.activeThreads.clear();
            
            this.log('LMSThreadSyncManager cleaned up');
        }

        // ==================== ユーティリティメソッド ====================

        /**
         * 時刻のフォーマット
         */
        formatTimestamp(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }

        /**
         * 相対時刻のフォーマット
         */
        formatRelativeTime(timestamp) {
            if (!timestamp) return '';
            const now = new Date();
            const target = new Date(timestamp);
            const diffInMinutes = Math.floor((now - target) / (1000 * 60));
            
            if (diffInMinutes < 1) {
                return 'たった今';
            } else if (diffInMinutes < 60) {
                return `${diffInMinutes}分前`;
            } else if (diffInMinutes < 1440) {
                const hours = Math.floor(diffInMinutes / 60);
                return `${hours}時間前`;
            } else {
                const days = Math.floor(diffInMinutes / 1440);
                return `${days}日前`;
            }
        }

        /**
         * HTMLエスケープ
         */
        escapeHtml(text) {
            if (!text) return '';
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, (m) => map[m]);
        }

        /**
         * URLの自動リンク化
         */
        linkifyText(text) {
            if (!text) return '';
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        }

        /**
         * ログ出力
         */
        log(...args) {
            if (typeof console !== 'undefined' && console.log) {
            }
        }

        /**
         * エラーログ出力
         */
        logError(...args) {
            if (typeof console !== 'undefined' && console.error) {
            }
        }

        /**
         * 統計情報の取得
         */
        getStats() {
            return {
                ...this.stats,
                activeThreadCount: this.activeThreads.size,
                queuedUpdates: this.syncQueue.size
            };
        }
    }

    // グローバル変数として公開
    window.LMSChat.threadSync.LMSThreadSyncManager = LMSThreadSyncManager;

    // インスタンスの作成と初期化
    $(document).ready(function() {
        // LMSThreadSyncManagerのインスタンス作成
        window.lmsThreadSyncManager = new LMSThreadSyncManager();
        
        // 初期チャンネルIDの設定（利用可能な場合）
        const initialChannelId = window.lmsAjax?.channelId || 
                                 window.LMSChat?.state?.currentChannel ||
                                 $('.chat-container').data('channel-id');
        
        if (initialChannelId) {
            window.lmsThreadSyncManager.initialize(initialChannelId);
        }

        // デバッグ用: 統計情報の定期出力
        if (typeof lmsLongPollConfig !== 'undefined' && lmsLongPollConfig.debugMode) {
            setInterval(() => {
            }, 30000); // 30秒毎
        }
    });

})(jQuery, window);