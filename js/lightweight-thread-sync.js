/**
 * 軽量スレッド同期システム - サーバー負荷最小化版
 * 必要最小限の機能のみ実装
 */
(function($) {
    'use strict';

    

    // 軽量同期システム
    window.LightweightThreadSync = {
        lastCheck: Math.floor(Date.now() / 1000) - 60, // 1分前から開始
        initLastCheck: function() {
            // 現在時刻から1分前を安全に設定
            const now = Math.floor(Date.now() / 1000);
            this.lastCheck = now - 60;

        },
        isPolling: false,
        currentThreadId: null,
        pollInterval: null,
        processedDeletes: new Set(), // 削除済みメッセージID管理
        
        init: function() {


            // タイムスタンプを確実に初期化
            this.initLastCheck();

            // スレッド開いた時のみポーリング開始（複数のイベントに対応）
            $(document).on('lms_thread_opened thread:opened', (event, threadId) => {

                // スレッド開いた - 軽量ポーリング開始
                this.currentThreadId = threadId;
                this.initLastCheck(); // 開始時に再初期化
                this.startLightPolling();
            });

            // スレッド閉じた時は停止
            $(document).on('thread:closed', () => {

                this.currentThreadId = null;
                this.stopPolling();
            });

            // スレッドメッセージ送信後の即座チェック（既存イベント使用）
            $(document).on('thread:reply:sent', (event, parentMessageId, messageData) => {

                // スレッドメッセージ送信 - 即座同期
                setTimeout(() => {
                    this.checkThreadUpdates();
                }, 1000); // 1秒後にチェック
            });

            // スレッドメッセージ削除後の即座チェック（既存イベント使用）
            $(document).on('thread_message:deleted', (event, data) => {

                // スレッドメッセージ削除 - 即座同期
                setTimeout(() => {
                    this.checkThreadUpdates();
                }, 500); // 0.5秒後にチェック
            });

            // 初期化時に既にスレッドが開いているかチェック
            setTimeout(() => {
                this.monitorThreadPanelState();
            }, 500); // DOM安定後にチェック

            // 定期的にスレッドパネルの状態を監視（イベントに依存しない方法）
            setInterval(() => {
                this.monitorThreadPanelState();
            }, 2000); // 2秒ごとにチェック
        },

        // スレッドパネルの状態を監視してポーリングを自動開始/停止
        monitorThreadPanelState: function() {
            const $threadPanel = $('.thread-panel');
            const isThreadOpen = $threadPanel.hasClass('open');
            const threadId = $threadPanel.attr('data-current-thread-id') ||
                            $threadPanel.data('current-thread-id') ||
                            window.LMSChat?.state?.currentThread;

            // スレッドが開いていてポーリングが開始されていない場合
            if (isThreadOpen && threadId && !this.isPolling) {

                this.currentThreadId = threadId;
                this.initLastCheck();
                this.startLightPolling();
            }
            // スレッドが閉じていてポーリングが開始されている場合
            else if (!isThreadOpen && this.isPolling) {

                this.currentThreadId = null;
                this.stopPolling();
            }
            // ポーリング中にスレッドIDが変わった場合
            else if (isThreadOpen && threadId && this.isPolling && this.currentThreadId !== threadId) {

                this.currentThreadId = threadId;
                this.initLastCheck();
            }
        },
        
        startLightPolling: function() {
            if (this.isPolling) {

                return;
            }

            this.isPolling = true;


            // 5秒間隔のポーリング（リアルタイム性重視）
            this.pollInterval = setInterval(() => {
                this.checkThreadUpdates();
            }, 5000); // 5秒間隔

            // 即座に1回実行
            this.checkThreadUpdates();
        },
        
        stopPolling: function() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
            this.isPolling = false;

        },
        
        checkThreadUpdates: function() {


            if (!window.lmsChat?.ajaxUrl || !window.lmsChat?.nonce) {

                return;
            }

            // スレッドが開いていない場合はスキップ
            if (!$('.thread-panel').hasClass('open') && !this.currentThreadId) {

                return;
            }

            // タイムスタンプの妥当性確認
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const validMin = 1577836800; // 2020-01-01
            const validMax = 1893456000; // 2030-01-01

            if (this.lastCheck < validMin || this.lastCheck > validMax) {

                this.lastCheck = currentTimestamp - 60; // 1分前に設定
            }
            
            $.ajax({
                url: window.lmsChat.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'lms_get_thread_updates',
                    last_check: this.lastCheck,
                    nonce: window.lmsChat.nonce
                },
                timeout: 10000,
                success: (response) => {
                    // 軽量チェック成功
                    
                    // デバッグ情報の詳細表示
                    if (response.data?.debug_info) {
                        













                    }
                    
                    if (response.success && response.data) {
                        // サーバータイムスタンプを使用して正確にlastCheckを更新
                        if (response.data.timestamp) {
                            const serverTimestamp = response.data.timestamp;
                            const currentTimestamp = Math.floor(Date.now() / 1000);

                            // 異常なタイムスタンプを検証（2020年より前、または2030年より後は異常）
                            const validMin = 1577836800; // 2020-01-01 00:00:00 UTC
                            const validMax = 1893456000; // 2030-01-01 00:00:00 UTC

                            if (serverTimestamp >= validMin && serverTimestamp <= validMax) {
                                this.lastCheck = serverTimestamp;

                            } else {

                                // 現在時刻を使用
                                this.lastCheck = currentTimestamp;
                            }
                        }
                        
                        if (response.data.updates && response.data.updates.length > 0) {

                            this.processUpdates(response.data.updates);
                        } else {
                            
                        }
                    }
                },
                error: (xhr, status, error) => {

                }
            });
        },
        
        processUpdates: function(updates) {
            if (!updates || updates.length === 0) {
                
                return;
            }
            

            
            // 古すぎるイベントをフィルタリング（5分前より古いものは無視）
            const cutoffTime = Math.floor(Date.now() / 1000) - 300; // 5分前
            const filteredUpdates = updates.filter(update => {
                if (update.timestamp < cutoffTime) {

                    return false;
                }
                return true;
            });
            
            if (filteredUpdates.length !== updates.length) {

            }
            
            filteredUpdates.forEach(update => {


                if (update.type === 'thread_message_new' && update.message) {
                    // 自分が送信したメッセージの重複防止チェック（方法1: recentSentMessageIds）
                    if (update.message.id && window.LMSChat?.state?.recentSentMessageIds?.has(String(update.message.id))) {

                        return;
                    }

                    // 自分が送信したメッセージの重複防止チェック（方法2: ユーザーID比較）
                    const currentUserId = window.lmsChat?.currentUserId || window.LMSChat?.state?.currentUserId;
                    if (currentUserId && update.message.user_id && Number(update.message.user_id) === Number(currentUserId)) {
                        // さらにDOMに存在するか確認（自分のメッセージで既に表示済み）
                        const ownExistingMessage = $(`.thread-message[data-message-id="${update.message.id}"]`);
                        if (ownExistingMessage.length > 0) {

                            return;
                        }
                        // 自分のメッセージだがDOMに存在しない場合は追加処理を続行

                    }

                    // 最終的な重複チェック（他の参加者からの重複も防ぐ）
                    const finalExistingCheck = $(`.thread-message[data-message-id="${update.message.id}"]`);
                    if (finalExistingCheck.length > 0) {

                        return;
                    }
                    

                    
                    // スレッド専用メソッドのみ使用（スクロールを避けるため）
                    if (window.LMSChat?.threads?.appendThreadMessage) {
                        try {
                            window.LMSChat.threads.appendThreadMessage(update.message);

                        } catch (e) {

                            // スレッド専用関数が失敗した場合は直接DOM操作
                            this.directAppendMessage(update.message);
                        }
                    }
                    // グローバル関数をフォールバックとして使用
                    else if (window.appendThreadMessage && typeof window.appendThreadMessage === 'function') {
                        try {
                            window.appendThreadMessage(update.message);

                        } catch (e) {

                            this.directAppendMessage(update.message);
                        }
                    }
                    // 直接DOM操作（最終手段）
                    else {

                        this.directAppendMessage(update.message);
                    }
                } else if (update.type === 'thread_message_deleted' && update.message_id) {
                    // 削除済みメッセージの重複処理防止
                    if (this.processedDeletes && this.processedDeletes.has(update.message_id)) {

                        return;
                    }
                    
                    // スレッドメッセージ削除（複数のセレクタを試行）
                    const selectors = [
                        `.thread-message[data-message-id="${update.message_id}"]`,
                        `.chat-message[data-message-id="${update.message_id}"]`,
                        `[data-message-id="${update.message_id}"]`
                    ];
                    
                    let $message = null;
                    for (const selector of selectors) {
                        $message = $(selector);
                        if ($message.length > 0) {

                            break;
                        }
                    }
                    
                    if ($message && $message.length > 0) {
                        // 削除済みマーク
                        if (!this.processedDeletes) {
                            this.processedDeletes = new Set();
                        }
                        this.processedDeletes.add(update.message_id);
                        
                        $message.fadeOut(300, function() {
                            $(this).remove();

                            
                            // 空メッセージチェック
                            const $threadMessages = $('.thread-messages');
                            if ($threadMessages.find('.thread-message:visible').length === 0) {
                                $threadMessages.find('.no-messages').remove();
                                $threadMessages.append('<div class="no-messages">このスレッドにはまだ返信がありません</div>');
                            }
                        });

                    } else {

                        // 削除対象がない場合も処理済みマーク
                        if (!this.processedDeletes) {
                            this.processedDeletes = new Set();
                        }
                        this.processedDeletes.add(update.message_id);
                    }
                }
            });
            
            // 更新があった場合のスクロール調整を無効化
            // 受信側では自動スクロールせず、新規メッセージは画面外に表示
            /*
            if (filteredUpdates.length > 0) {
                setTimeout(() => {
                    if (window.UnifiedScrollManager?.scrollThreadToBottom) {
                        window.UnifiedScrollManager.scrollThreadToBottom(300);

                    } else if (window.LMSChat?.messages?.scrollToBottom) {
                        window.LMSChat.messages.scrollToBottom(300);

                    } else {
                        // 最終手段：jQuery直接操作
                        const $threadMessages = $('.thread-messages');
                        if ($threadMessages.length) {
                            $threadMessages.scrollTop($threadMessages[0].scrollHeight);

                        }
                    }
                }, 100);
            }
            */
        },
        
        // 手動同期トリガー（デバッグ用）
        forceSyncNow: function() {
            
            this.checkThreadUpdates();
        },
        
        // 直接DOM操作でメッセージ追加（最終手段）
        directAppendMessage: function(message) {
            try {
                const $threadMessages = $('.thread-messages');
                if ($threadMessages.length === 0) {
                    
                    return;
                }
                
                // 簡単なメッセージHTML作成
                const messageHtml = `
                    <div class="thread-message" data-message-id="${message.id}" data-user-id="${message.user_id}">
                        <div class="message-header">
                            <span class="user-name">${message.display_name || 'ユーザー'}</span>
                            <span class="message-time">${message.formatted_time || '今'}</span>
                        </div>
                        <div class="message-content">${message.content || message.message || ''}</div>
                    </div>
                `;
                
                $threadMessages.find('.no-messages').remove();
                $threadMessages.append(messageHtml);

            } catch (e) {

            }
        },
        
        // システム状態確認（デバッグ用）
        getStatus: function() {
            const status = {
                isPolling: this.isPolling,
                currentThreadId: this.currentThreadId,
                lastCheck: this.lastCheck,
                lastCheckDate: new Date(this.lastCheck * 1000).toLocaleString(),
                threadPanelOpen: $('.thread-panel').hasClass('open'),
                processedDeletesSize: this.processedDeletes ? this.processedDeletes.size : 0,
                ajaxSettings: {
                    url: window.lmsChat?.ajaxUrl,
                    nonce: !!(window.lmsChat?.nonce)
                },
                availableFunctions: {
                    appendThreadMessage: !!(window.LMSChat?.threads?.appendThreadMessage),
                    threadsAppendMessage: !!(window.LMSChat?.threads?.appendMessage),
                    messagesAppendMessage: !!(window.LMSChat?.messages?.appendMessage)
                }
            };

            return status;
        },
        
        // 削除済みセットクリア（デバッグ用）
        clearProcessedDeletes: function() {
            if (this.processedDeletes) {
                this.processedDeletes.clear();
                
            }
        }
    };

    // DOM Ready時に初期化
    $(document).ready(() => {

        window.LightweightThreadSync.init();
    });

    // グローバルアクセス用エイリアス
    window.LMS_LightSync = window.LightweightThreadSync;

    // デバッグ用グローバル関数
    window.debugThreadSync = function() {









        // 手動でポーリング開始
        if (!window.LightweightThreadSync.isPolling) {
            const threadId = $('.thread-panel').attr('data-current-thread-id') ||
                           window.LMSChat?.state?.currentThread;
            if (threadId) {

                window.LightweightThreadSync.currentThreadId = threadId;
                window.LightweightThreadSync.startLightPolling();
            } else {

            }
        }
    };

})(jQuery);