// 安全な削除同期システム - 既存Long Pollingシステム拡張版
(function() {
    'use strict';// Debug output removed

    // 既存のLong Pollingシステムを拡張（過負荷を避ける）
    function enhanceExistingLongPoll() {
        // Manual Long Pollシステムの拡張
        if (window.LMSManualLongPoll && window.LMSManualLongPoll.handleResponse) {
            const originalHandler = window.LMSManualLongPoll.handleResponse;

            window.LMSManualLongPoll.handleResponse = function(response) {
                try {
                    // 元のハンドラー実行
                    if (originalHandler && typeof originalHandler === 'function') {
                        originalHandler.call(this, response);
                    }

                    // 削除イベント処理を追加（安全に）
                    if (response?.success && response?.data?.data) {
                        response.data.data.forEach(event => {
                            if (event.type === 'main_message_deleted') {
                                handleMessageDeleted(event);
                            }
                        });
                    }
                } catch (error) {
                    // Debug output removed
                }
            };// Debug output removed
        }

        // 基本Long Pollシステムの拡張
        if (window.handleDeletedMessage && typeof window.handleDeletedMessage === 'function') {
            const originalDeleteHandler = window.handleDeletedMessage;

            window.handleDeletedMessage = function(event) {
                try {
                    // 元のハンドラー実行
                    originalDeleteHandler.call(this, event);

                    // 追加の削除処理
                    handleMessageDeleted(event);
                } catch (error) {
                    // Debug output removed
                }
            };// Debug output removed
        }
    }

    // メッセージ削除処理（安全版）
    function handleMessageDeleted(event) {
        try {
            const messageId = event.data?.messageId || event.data?.id;

            if (!messageId) {
                // Debug output removed
                return;
            }// Debug output removed

            // 複数のセレクタでメッセージ要素を検索
            const selectors = [
                `#message-${messageId}`,
                `[data-message-id="${messageId}"]`,
                `.chat-message[data-message-id="${messageId}"]`
            ];

            let messageElement = null;
            for (const selector of selectors) {
                messageElement = document.querySelector(selector);
                if (messageElement) break;
            }

            if (messageElement) {
                // フェードアウト効果付きで削除
                if (typeof jQuery !== 'undefined') {
                    jQuery(messageElement).fadeOut(300, function() {
                        jQuery(this).remove();// Debug output removed
                    });
                } else {
                    // jQueryがない場合の代替処理
                    messageElement.style.transition = 'opacity 0.3s';
                    messageElement.style.opacity = '0';
                    setTimeout(() => {
                        if (messageElement.parentNode) {
                            messageElement.parentNode.removeChild(messageElement);// Debug output removed
                        }
                    }, 300);
                }
            } else {// Debug output removed
            }
        } catch (error) {
            // Debug output removed
        }
    }

    // 初期化（安全に）
    function initialize() {
        try {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', enhanceExistingLongPoll);
            } else {
                enhanceExistingLongPoll();
            }

            // jQuery読み込み後にも実行
            if (typeof jQuery !== 'undefined') {
                jQuery(document).ready(enhanceExistingLongPoll);
            }
        } catch (error) {
            // Debug output removed
        }
    }

    // テスト用削除関数（本番環境対応）
    window.safeDeleteMessage = function(messageId) {
        if (!messageId) {
            // Debug output removed
            return;
        }

        // 複数のnonceソースから取得
        const nonce = window.lmsChat?.nonce ||
                     window.lms_ajax_obj?.nonce ||
                     window.lms_chat_ajax?.nonce ||
                     '07fa5fa8a1'; // フォールバック

        // Debug output removed + '...');

        jQuery.ajax({
            url: window.location.origin + '/wp-admin/admin-ajax.php',
            type: 'POST',
            data: {
                action: 'lms_delete_message',
                message_id: messageId,
                nonce: nonce
            },
            success: function(response) {
                // Debug output removed
            },
            error: function(xhr, status, error) {
                // Debug output removed
                if (xhr.responseText) {
                    // Debug output removed
                }
            }
        });
    };

    initialize();// Debug output removed// Debug output removed');
})();