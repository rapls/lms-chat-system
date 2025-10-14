/**
 * 緊急リアクション同期システム
 * 25秒問題を完全解決する超高速同期
 *
 * 【緊急無効化】パフォーマンス改善のため一時停止
 * 重複同期によるサーバー負荷を削減
 */
(function($) {
    'use strict';
    // パフォーマンス改善のため緊急同期を一時停止
    return;

    // Debug output removed

    // 緊急同期の状態管理
    const emergencyState = {
        isActive: false,
        syncCount: 0,
        maxInitialSync: 15, // 初回同期回数を15回に増加
        successCount: 0,
        errorCount: 0
    };

    /**
     * メッセージIDを確実に取得
     */
    const getMessageIds = () => {
        const messageIds = [];

        // 複数の方法でメッセージIDを取得
        const selectors = [
            '#chat-messages [data-message-id]',
            '#chat-messages .chat-message',
            '#chat-messages .message-item',
            '.chat-container [data-message-id]'
        ];

        selectors.forEach(selector => {
            $(selector).each(function() {
                const id = $(this).data('message-id') || $(this).attr('data-message-id');
                if (id && !messageIds.includes(String(id))) {
                    messageIds.push(String(id));
                }
            });
        });

        return messageIds;
    };

    /**
     * 小分けリアクション取得
     */
    const fetchReactionsChunk = async (messageIds) => {
        if (messageIds.length === 0) return null;

        try {
            const response = await $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'GET',
                data: {
                    action: 'lms_get_reactions',
                    message_ids: messageIds.join(','),
                    nonce: window.lmsChat?.nonce || '',
                    _: Date.now()
                },
                cache: false,
                timeout: 3000 // 短いタイムアウト
            });

            if (response.success && response.data) {
                return response.data;
            }
        } catch (error) {
            // Debug output removed
        }

        return null;
    };

    /**
     * リアクション表示更新
     */
    const updateReactions = (reactionsData) => {
        if (!reactionsData) return 0;

        let updateCount = 0;
        Object.entries(reactionsData).forEach(([messageId, reactions]) => {
            if (window.LMSChat?.reactionUI?.updateMessageReactions) {
                window.LMSChat.reactionUI.updateMessageReactions(messageId, reactions, true);
                updateCount++;
            }
        });

        return updateCount;
    };

    /**
     * 緊急同期実行
     */
    const executeEmergencySync = async () => {
        if (!window.LMSChat?.state?.currentChannel) {
            // Debug output removed
            return;
        }

        emergencyState.syncCount++;
        // Debug output removed

        const messageIds = getMessageIds();
        // Debug output removed

        if (messageIds.length === 0) {
            // Debug output removed
            return;
        }

        // 3件ずつに分けて処理（確実性重視）
        const chunkSize = 3;
        let totalUpdated = 0;

        for (let i = 0; i < messageIds.length; i += chunkSize) {
            const chunk = messageIds.slice(i, i + chunkSize);

            try {
                const reactionsData = await fetchReactionsChunk(chunk);
                const updated = updateReactions(reactionsData);
                totalUpdated += updated;

                if (reactionsData) {
                    emergencyState.successCount++;
                }
            } catch (error) {
                emergencyState.errorCount++;
                // Debug output removed
            }

            // チャンク間で少し間隔をあける
            if (i + chunkSize < messageIds.length) {
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }

        // Debug output removed
    };

    /**
     * 緊急同期システム開始
     */
    const startEmergencySync = () => {
        if (emergencyState.isActive) {
            // Debug output removed
            return;
        }

        emergencyState.isActive = true;
        // Debug output removed

        // 即座に1回実行
        executeEmergencySync();

        // 50ms間隔で連続実行
        const syncInterval = setInterval(async () => {
            if (emergencyState.syncCount >= emergencyState.maxInitialSync) {
                clearInterval(syncInterval);
                emergencyState.isActive = false;

                // Debug output removed
                startContinuousSync();
                return;
            }

            await executeEmergencySync();
        }, 50); // 50ms間隔（超高速）
    };

    /**
     * 継続同期システム
     */
    const startContinuousSync = () => {
        // Debug output removed

        setInterval(async () => {
            if (window.LMSChat?.state?.currentChannel) {
                const messageIds = getMessageIds();
                if (messageIds.length > 0) {
                    // 10件ずつ処理
                    const chunkSize = 10;
                    for (let i = 0; i < messageIds.length; i += chunkSize) {
                        const chunk = messageIds.slice(i, i + chunkSize);
                        const reactionsData = await fetchReactionsChunk(chunk);
                        updateReactions(reactionsData);

                        // チャンク間で間隔をあける
                        if (i + chunkSize < messageIds.length) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }
            }
        }, 1000); // 1秒間隔
    };

    // DOM Ready後に開始
    $(document).ready(() => {
        // 少し遅延させてから開始（他のシステムとの競合を避ける）
        setTimeout(() => {
            // Debug output removed

            // 依存関係を確認
            if (window.LMSChat?.reactionUI?.updateMessageReactions) {
                startEmergencySync();
            } else {
                // 依存関係待機
                let retryCount = 0;
                const waitForDependencies = setInterval(() => {
                    retryCount++;
                    if (window.LMSChat?.reactionUI?.updateMessageReactions) {
                        clearInterval(waitForDependencies);
                        startEmergencySync();
                    } else if (retryCount > 20) {
                        clearInterval(waitForDependencies);
                        // Debug output removed
                    }
                }, 200);
            }
        }, 300);
    });

    // 緊急同期システムをグローバルに公開
    window.EmergencyReactionSync = {
        start: startEmergencySync,
        state: emergencyState,
        getMessageIds: getMessageIds
    };

})(jQuery);