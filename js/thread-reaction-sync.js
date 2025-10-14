/**
 * 独立スレッドリアクション同期システム
 * 既存のロングポーリングに依存しない専用同期機能
 */
(function($) {
    'use strict';

    // 同期システムの状態管理
    window.ThreadReactionSync = {
        isActive: false,
        currentThreadId: null,
        lastTimestamp: 0,
        pollInterval: null,
        processedEvents: new Set(),

        init: function() {
            // Independent sync system initialization

            // 現在のスレッドIDを検出
            this.detectCurrentThread();

            // DOM Ready時の初期化
            $(document).ready(() => {
                this.detectCurrentThread();
                this.startPolling();
            });

            // スレッド変更時の対応
            $(document).on('lms_thread_opened', (event, threadId) => {

                this.setThread(threadId);
            });
        },

        detectCurrentThread: function() {
            // 複数の方法でスレッドIDを検出
            let threadId = null;

            // Method 1: LMSChat.state.currentThread
            if (window.LMSChat?.state?.currentThread) {
                threadId = window.LMSChat.state.currentThread;

            }

            // Method 2: URL parameter
            if (!threadId) {
                const urlParams = new URLSearchParams(window.location.search);
                threadId = urlParams.get('thread');

            }

            // Method 3: DOM element
            if (!threadId) {
                const threadElement = $('.thread-container').first();
                if (threadElement.length && threadElement.data('thread-id')) {
                    threadId = threadElement.data('thread-id');

                }
            }

            if (threadId) {
                this.setThread(threadId);
            }

            return threadId;
        },

        setThread: function(threadId) {
            const parsedThreadId = parseInt(threadId, 10);
            if (parsedThreadId && parsedThreadId !== this.currentThreadId) {


                this.currentThreadId = parsedThreadId;
                this.lastTimestamp = 0; // リセット
                this.processedEvents.clear(); // イベント履歴クリア

                if (!this.isActive) {
                    this.startPolling();
                }
            }
        },

        startPolling: function() {
            if (this.isActive || !this.currentThreadId) {
                return;
            }



            this.isActive = true;

            // 即座に1回実行
            this.pollReactions();

            // 15秒間隔でポーリング
            this.pollInterval = setInterval(() => {
                this.pollReactions();
            }, 15000);
        },

        stopPolling: function() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
            this.isActive = false;

        },

        pollReactions: function() {
            if (!this.currentThreadId) {
                return;
            }



            $.ajax({
                url: window.lms_ajax_obj?.ajax_url || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_thread_reaction_updates',
                    thread_id: this.currentThreadId,
                    last_timestamp: this.lastTimestamp,
                    nonce: this.getNonce()
                },
                timeout: 10000,
                success: (response) => {


                    if (response.success && response.data && response.data.length > 0) {
                        this.processReactionUpdates(response.data);
                    }
                },
                error: (xhr, status, error) => {

                }
            });
        },

        processReactionUpdates: function(updates) {


            updates.forEach((update) => {
                const eventKey = `${update.message_id}_${update.timestamp}`;

                // 重複チェック
                if (this.processedEvents.has(eventKey)) {

                    return;
                }

                this.processedEvents.add(eventKey);

                // タイムスタンプ更新
                if (update.timestamp > this.lastTimestamp) {
                    this.lastTimestamp = update.timestamp;
                }

                // UI更新
                this.updateMessageReactions(update.message_id, update.reactions);


            });
        },

        updateMessageReactions: function(messageId, reactions) {// Method 1: ThreadReactionUnified (最優先)
            if (window.LMSChat?.threadReactionUnified?.updateReactions) {
                window.LMSChat.threadReactionUnified.updateReactions(messageId, reactions, {
                    source: 'thread_sync',
                    serverTimestamp: Date.now()
                });return;
            }

            // Method 2: LMSChat.reactionUI (フォールバック)
            if (window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
                window.LMSChat.reactionUI.updateThreadMessageReactions(messageId, reactions, true, true);return;
            }

            // Method 3: 直接DOM操作 (最終手段)
            this.directUpdateDOM(messageId, reactions);
        },

        directUpdateDOM: function(messageId, reactions) {
            const $message = $(`.chat-message[data-message-id="${messageId}"]`);
            if ($message.length === 0) {return;
            }

            let $reactionsContainer = $message.find('.message-reactions');
            if ($reactionsContainer.length === 0) {
                $reactionsContainer = $('<div class="message-reactions"></div>');
                $message.append($reactionsContainer);
            }

            // ドリフト防止: レイアウト測定とロック
            const beforeHeight = $message[0].getBoundingClientRect().height;
            const beforeTop = $message[0].getBoundingClientRect().top;

            // ドリフト防止: 段階的更新でレイアウトシフト最小化
            const currentReactions = $reactionsContainer.find('.reaction-item').map(function() {
                return $(this).data('emoji');
            }).get();
            
            const newReactions = reactions ? reactions.map(r => r.emoji) : [];
            
            // 新しいリアクションのみ追加し、不要なものは削除
            const reactionsToAdd = reactions ? reactions.filter(r => !currentReactions.includes(r.emoji)) : [];
            const reactionsToRemove = currentReactions.filter(emoji => !newReactions.includes(emoji));

            // 削除処理（レイアウト変更最小化）
            reactionsToRemove.forEach(emoji => {
                $reactionsContainer.find(`.reaction-item[data-emoji="${emoji}"]`).remove();
            });

            // 追加処理（DocumentFragment使用でリフロー削減）
            if (reactionsToAdd.length > 0) {
                const fragment = document.createDocumentFragment();
                reactionsToAdd.forEach((reaction) => {
                    const reactionElement = document.createElement('span');
                    reactionElement.className = 'reaction-item';
                    reactionElement.setAttribute('data-emoji', reaction.emoji);
                    reactionElement.textContent = `${reaction.emoji} ${reaction.count}`;
                    fragment.appendChild(reactionElement);
                });
                $reactionsContainer[0].appendChild(fragment);
            }

            // 既存リアクションのカウント更新
            if (reactions) {
                reactions.forEach((reaction) => {
                    if (currentReactions.includes(reaction.emoji)) {
                        const $existing = $reactionsContainer.find(`.reaction-item[data-emoji="${reaction.emoji}"]`);
                        if ($existing.length) {
                            $existing.text(`${reaction.emoji} ${reaction.count}`);
                        }
                    }
                });
            }

            // ドリフト検出と補正
            const afterHeight = $message[0].getBoundingClientRect().height;
            const afterTop = $message[0].getBoundingClientRect().top;
            const heightDiff = afterHeight - beforeHeight;
            const topDiff = afterTop - beforeTop;

            if (Math.abs(heightDiff) > 1 || Math.abs(topDiff) > 1) {
                // レイアウトシフト検出時の緊急補正
                if (window.ThreadDriftGuard && window.ThreadDriftGuard.performCorrection) {
                    window.ThreadDriftGuard.performCorrection({
                        messageId: messageId,
                        source: 'reaction_sync',
                        heightDrift: heightDiff,
                        topDrift: topDiff
                    });
                }
            }},

        getNonce: function() {
            // 複数の方法でnonceを取得
            if (window.lms_ajax_obj?.nonce) {
                return window.lms_ajax_obj.nonce;
            }
            if (window.lmsAjax?.nonce) {
                return window.lmsAjax.nonce;
            }
            if (window.lms_nonce) {
                return window.lms_nonce;
            }
            return '';
        }
    };

    // 自動初期化
    window.ThreadReactionSync.init();

    // グローバルアクセス用
    window.LMSThreadReactionSync = window.ThreadReactionSync;

    // Independent sync system loaded

})(jQuery);