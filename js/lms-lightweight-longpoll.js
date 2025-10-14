/**
 * LMS 軽量ロングポーリング - 高速化対応版
 *
 * 複数の重複するロングポーリング実装を統合し、
 * 必要最小限の機能のみで高速化を実現
 */

(function() {
    'use strict';

    // 他のロングポーリングシステムが存在する場合は無効化
    if (window.UnifiedLongPollClient || window.LMSLongPollComplete) {
        // 軽量ロングポーリング: 他の実装が検出されたため無効化
        return;
    }

    class LightweightLongPoll {
        constructor() {
            this.isActive = false;
            this.pollTimeout = null;
            this.retryCount = 0;
            this.maxRetries = 3;
            this.pollInterval = 15000; // 15秒（軽量化）
            this.isPageVisible = true;
            this.lastEventTime = Date.now();
            
            this.config = {
                timeout: 15, // 15秒でタイムアウト（軽量化）
                maxConnections: 1, // 1接続のみ
                batchSize: 10, // バッチサイズ削減
                enableCompression: false, // 圧縮無効で軽量化
            };

            this.init();
        }

        init() {
            // ページ可視性の監視
            this.setupVisibilityHandlers();
            
            // 基本的なイベントのみ監視
            this.eventTypes = ['message_create', 'message_delete'];
            
            // ユーザー情報確認
            this.userId = window.lmsUser?.id || window.LMSChatMinimal?.state?.userId;
            if (!this.userId) {
                return;
            }

            // 軽量ロングポーリングが初期化されました
        }

        setupVisibilityHandlers() {
            // ページ可視性API
            document.addEventListener('visibilitychange', () => {
                this.isPageVisible = !document.hidden;
                
                if (this.isPageVisible) {
                    // ページが表示されたら即座にポーリング再開
                    this.startPolling();
                } else {
                    // ページが非表示になったらポーリング停止
                    this.stopPolling();
                }
            });

            // ウィンドウフォーカス
            window.addEventListener('focus', () => {
                this.isPageVisible = true;
                this.startPolling();
            });

            window.addEventListener('blur', () => {
                this.isPageVisible = false;
                this.stopPolling();
            });
        }

        startPolling() {
            if (this.isActive || !this.isPageVisible) {
                return;
            }

            this.isActive = true;
            this.retryCount = 0;
            this.poll();
        }

        stopPolling() {
            this.isActive = false;
            if (this.pollTimeout) {
                clearTimeout(this.pollTimeout);
                this.pollTimeout = null;
            }
        }

        poll() {
            if (!this.isActive || !this.isPageVisible) {
                return;
            }

            const xhr = new XMLHttpRequest();
            const formData = new FormData();

            // 軽量なパラメータ
            formData.append('action', 'lms_unified_longpoll');
            formData.append('nonce', window.lmsAjax?.nonce || '');
            formData.append('timeout', this.config.timeout);
            formData.append('last_event_time', this.lastEventTime);
            formData.append('event_types', this.eventTypes.join(','));
            formData.append('lightweight', '1'); // 軽量モードフラグ

            const startTime = Date.now();

            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    const responseTime = Date.now() - startTime;
                    
                    if (xhr.status === 200) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            this.handleResponse(response, responseTime);
                        } catch (e) {
                            this.handleError();
                        }
                    } else {
                        this.handleError();
                    }
                }
            };

            xhr.ontimeout = () => {
                // タイムアウトは正常な状態
                this.scheduleNextPoll();
            };

            xhr.onerror = () => {
                this.handleError();
            };

            xhr.open('POST', window.lmsAjax?.ajaxurl || '/wp-admin/admin-ajax.php');
            xhr.timeout = this.config.timeout * 1000 + 5000; // +5秒のマージン
            xhr.send(formData);
        }

        handleResponse(response, responseTime) {
            this.retryCount = 0;
            
            if (response.success) {
                const data = response.data;
                
                // イベントの処理（最小限）
                if (data.events && Array.isArray(data.events)) {
                    data.events.forEach(event => {
                        this.processEvent(event);
                    });
                }

                // 最終イベント時刻更新
                if (data.timestamp) {
                    this.lastEventTime = data.timestamp;
                }

                // バッジ更新（軽量版）
                if (data.unread_count !== undefined) {
                    this.updateBadge(data.unread_count);
                }
            }

            // 次のポーリングをスケジュール
            this.scheduleNextPoll();
        }

        processEvent(event) {
            switch (event.type) {
                case 'message_create':
                    this.handleNewMessage(event.data);
                    break;
                
                case 'message_delete':
                    this.handleDeletedMessage(event.data);
                    break;
                
                default:
                    // その他のイベントは軽量版では処理しない
                    break;
            }
        }

        handleNewMessage(messageData) {
            // 自分のメッセージは処理しない
            if (messageData.user_id == this.userId) {
                return;
            }

            // 現在のチャンネルのメッセージの場合のみ表示
            const currentChannel = window.LMSChatMinimal?.state?.currentChannel;
            if (currentChannel && messageData.channel_id == currentChannel) {
                if (window.LMSChatMinimal?.messages?.append) {
                    window.LMSChatMinimal.messages.append(messageData);
                }
            }

            // バッジ更新
            this.incrementBadge();
        }

        handleDeletedMessage(messageData) {
            const messageEl = document.querySelector(`[data-message-id="${messageData.message_id}"]`);
            if (messageEl) {
                messageEl.remove();
            }
        }

        updateBadge(count) {
            if (window.LMSChatMinimal?.ui?.updateBadge) {
                window.LMSChatMinimal.ui.updateBadge(count);
            }
        }

        incrementBadge() {
            const badge = document.querySelector('.unread-badge');
            if (badge) {
                const current = parseInt(badge.textContent || '0');
                this.updateBadge(current + 1);
            }
        }

        handleError() {
            this.retryCount++;
            
            if (this.retryCount >= this.maxRetries) {
                // 長時間待ってから再開
                setTimeout(() => {
                    this.retryCount = 0;
                    this.scheduleNextPoll();
                }, 30000); // 30秒待機
                return;
            }

            // エクスポネンシャルバックオフ
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000);
            this.scheduleNextPoll(delay);
        }

        scheduleNextPoll(delay = 1000) {
            if (!this.isActive) {
                return;
            }

            this.pollTimeout = setTimeout(() => {
                this.poll();
            }, delay);
        }
    }

    // パフォーマンス最適化のため一時的に無効化（lms-unified-longpoll.jsを使用）
    // グローバルインスタンス
    // window.LightweightLongPoll = new LightweightLongPoll();

    // ページロード後に開始
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.LightweightLongPoll.startPolling();
            }, 2000); // 2秒後に開始（他の処理完了を待つ）
        });
    } else {
        setTimeout(() => {
            window.LightweightLongPoll.startPolling();
        }, 2000);
    }

    // 他のロングポーリングシステムを無効化
    window.addEventListener('load', () => {
        // 既存のロングポーリングを停止
        if (window.UnifiedLongPollClient && typeof window.UnifiedLongPollClient.stopPolling === 'function') {
            window.UnifiedLongPollClient.stopPolling();
            // 統合ロングポーリングを無効化しました
        }
        
        if (window.LMSLongPollComplete && typeof window.LMSLongPollComplete.stop === 'function') {
            window.LMSLongPollComplete.stop();
            // 完全版ロングポーリングを無効化しました
        }
    });

})();