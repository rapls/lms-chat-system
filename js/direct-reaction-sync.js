/**
 * 直接リアクション同期システム
 * シンプル・確実・高速なリアクション同期
 *
 * 【緊急無効化】パフォーマンス改善のため一時停止
 * 重複同期処理削減でサーバー負荷軽減
 */
(function($) {
    'use strict';
    // パフォーマンス改善のため直接同期を一時停止
    return;


    // 直接同期の状態
    const syncState = {
        isActive: false,
        count: 0,
        maxCount: 25,
        successCount: 0,
        errorCount: 0
    };

    /**
     * 単一メッセージのリアクションを取得
     */
    const fetchSingleReaction = (messageId) => {
        return new Promise((resolve) => {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_reactions',
                    message_ids: String(messageId),
                    nonce: window.lmsChat?.nonce || '',
                    _: Date.now()
                },
                cache: false,
                timeout: 5000,
                success: function(response) {
                    if (response.success && response.data && response.data[messageId]) {
                        if (window.LMSChat?.reactionUI?.updateMessageReactions) {
                            window.LMSChat.reactionUI.updateMessageReactions(messageId, response.data[messageId], true);
                            syncState.successCount++;
                        }
                    }
                    resolve(true);
                },
                error: function(xhr, status, error) {
                    syncState.errorCount++;
                    resolve(false);
                }
            });
        });
    };

    /**
     * 全メッセージのリアクションを順次取得
     */
    const syncAllReactions = async () => {
        const $messages = $('#chat-messages [data-message-id]');

        if ($messages.length === 0) {
            return;
        }

        // 全メッセージを順次処理
        for (let i = 0; i < $messages.length; i++) {
            const element = $messages[i];
            const messageId = $(element).data('message-id') || $(element).attr('data-message-id');

            if (messageId) {
                await fetchSingleReaction(messageId);

                // メッセージ間で少し待機（サーバー負荷軽減）
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

    };

    /**
     * 直接同期開始
     */
    const startDirectSync = () => {
        if (syncState.isActive) {
            return;
        }

        if (!window.LMSChat?.reactionUI?.updateMessageReactions) {
            return;
        }

        syncState.isActive = true;

        // 即座に1回実行
        syncAllReactions();

        // 100ms間隔で25回実行
        const syncInterval = setInterval(async () => {
            syncState.count++;

            await syncAllReactions();

            if (syncState.count >= syncState.maxCount) {
                clearInterval(syncInterval);
                syncState.isActive = false;
                startContinuousMode();
            }
        }, 100);
    };

    /**
     * 継続モード
     */
    const startContinuousMode = () => {

        setInterval(async () => {
            if (window.LMSChat?.state?.currentChannel) {
                const $messages = $('#chat-messages [data-message-id]');

                if ($messages.length > 0) {
                    // ランダムに3件選択して更新
                    const messageArray = $messages.toArray();
                    const randomMessages = messageArray
                        .sort(() => 0.5 - Math.random())
                        .slice(0, 3);

                    for (const element of randomMessages) {
                        const messageId = $(element).data('message-id') || $(element).attr('data-message-id');
                        if (messageId) {
                            await fetchSingleReaction(messageId);
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }
            }
        }, 2000);
    };

    // DOM Ready で開始
    $(document).ready(() => {
        setTimeout(() => {

            // 依存関係確認
            if (window.LMSChat?.reactionUI?.updateMessageReactions) {
                startDirectSync();
            } else {
                // 依存関係待機
                let retryCount = 0;
                const waitInterval = setInterval(() => {
                    retryCount++;

                    if (window.LMSChat?.reactionUI?.updateMessageReactions) {
                        clearInterval(waitInterval);
                        startDirectSync();
                    } else if (retryCount > 30) {
                        clearInterval(waitInterval);
                    } else {
                    }
                }, 200);
            }
        }, 500);
    });

    // グローバルに公開
    window.DirectReactionSync = {
        start: startDirectSync,
        state: syncState,
        syncAll: syncAllReactions
    };

    // デバッグ用コマンド
    window.forceReactionSync = startDirectSync;

})(jQuery);
