(function ($) {
    'use strict';

    window.LMSChat = window.LMSChat || {};
    const core = window.LMSChat.reactionCore || {};
    const ui = window.LMSChat.reactionUI || {};
    const cacheModule = window.LMSChat.reactionCache || {};
    const { state = {} } = window.LMSChat;

    const logDebug = core.logDebug || (() => {});
    const getReactionSync = () => window.LMSChat.reactionSync || {};
    
    // 新しいThreadReactionStoreを取得
    const getThreadStore = () => window.LMSChat.threadReactionStore;

    const storeCachedReactions = (messageId, reactions) => {
        if (!messageId) {
            return;
        }
        if (core.cacheReactionData) {
            core.cacheReactionData(messageId, reactions, true);
        }
        if (cacheModule && cacheModule.setThreadReactionsCache) {
            cacheModule.setThreadReactionsCache(messageId, reactions);
        }
    };

    const markHydrationState = ($message, pending) => {
        if (!$message.length) {
            return;
        }
        $message.data('reactionHydrationPending', pending);
    };

    const resolveThreadPanel = (threadId) => {
        if (threadId) {
            const parsed = parseInt(threadId, 10);
            if (!Number.isNaN(parsed)) {
                const $panel = $(`.thread-panel[data-thread-id="${parsed}"]`);
                if ($panel.length) {
                    return $panel;
                }
            }
        }
        return $('.thread-panel');
    };

    const fetchThreadMessageReactions = async (messageId) => {
        const $message = $(`.thread-message[data-message-id="${messageId}"]`);
        if (!$message.length) {
            return null;
        }

        if ($message.data('reactionHydrationPending') === true) {
            return null;
        }

        markHydrationState($message, true);

        try {
            const response = await $.ajax({
                url: window.lmsChat?.ajaxUrl,
                type: 'GET',
                data: {
                    action: 'lms_get_thread_message_reactions',
                    message_id: messageId,
                    nonce: window.lmsChat?.nonce,
                },
                cache: false,
                timeout: 8000,
                dataType: 'json',
            });

            if (response?.success) {
                const reactions = response.data || [];
                
                // 統一システムを最優先で使用
                const unifiedSystem = window.LMSChat?.threadReactionUnified;
                if (unifiedSystem) {
                    unifiedSystem.updateReactions(messageId, reactions, {
                        source: 'ajax-refresh'
                    });
                } else {
                    // フォールバック1: ThreadReactionStore
                    const threadStore = getThreadStore();
                    if (threadStore) {
                        const options = {
                            source: 'ajax-refresh',
                            forceRender: true,
                            force: false  // 既存の新しいデータがあれば優先
                        };
                        threadStore.queueUpdate(messageId, reactions, options);
                    } else {
                        // フォールバック2: 旧来の方式（重複防止付き）
                        storeCachedReactions(messageId, reactions);
                        
                        // 重複更新防止
                        const updateKey = `thread_fallback_${messageId}`;
                        const now = Date.now();
                        if (!window.LMSChat.threadFallbackUpdate) window.LMSChat.threadFallbackUpdate = {};
                        
                        if (window.LMSChat.threadFallbackUpdate[updateKey] && 
                            (now - window.LMSChat.threadFallbackUpdate[updateKey]) < 150) {
                            return reactions; // 150ms以内の重複はスキップ
                        }
                        window.LMSChat.threadFallbackUpdate[updateKey] = now;
                        
                        setTimeout(() => {
                            if (ui.updateThreadMessageReactions) {
                                ui.updateThreadMessageReactions(messageId, reactions, true, true);
                            }
                        }, 50); // 10ms -> 50ms に変更（競合を減らす）
                    }
                }
                
                logDebug(`threadReactions: hydrated message ${messageId}`);
                return reactions;
            }
        } catch (error) {
            // 取得失敗時は黙ってスキップ
        } finally {
            markHydrationState($message, false);
        }

        return null;
    };

    const loadReactionsForThread = async (threadId = null) => {
        const $panel = resolveThreadPanel(threadId || state.currentThread);
        if (!$panel.length) {
            return;
        }

        const pendingIds = [];
        $panel.find('.thread-message[data-message-id]').each(function () {
            const $message = $(this);
            const messageId = $message.data('message-id');
            if (!messageId) {
                return;
            }
            const $container = $message.find('.message-reactions').first();
            const hydrated =
                $container.attr('data-reactions-hydrated') === '1' ||
                $container.data('reactionsHydrated') === true;
            const hasItems = $container.find('.reaction-item').length > 0;
            const pending = $message.data('reactionHydrationPending') === true;
            if (!hydrated || (!hasItems && !pending)) {
                pendingIds.push(messageId);
            }
        });

        for (const id of pendingIds) {
            // eslint-disable-next-line no-await-in-loop
            await fetchThreadMessageReactions(id);
        }
    };

    const triggerImmediatePolling = () => {
        if (window.LMSChat?.threadReactionSync?.triggerImmediateFetch) {
            window.LMSChat.threadReactionSync.triggerImmediateFetch();
        }

        const reactionSync = getReactionSync();
        if (reactionSync.pollThreadReactions) {
            reactionSync.pollThreadReactions();
        } else if (reactionSync.pollReactions) {
            reactionSync.pollReactions();
        }
    };

    window.LMSChat.threadReactions = {
        loadReactionsForThread,
        loadThreadMessageReactions: fetchThreadMessageReactions,
        triggerImmediatePolling,
    };

    window.LMSChat.reactions = window.LMSChat.reactions || {};
    Object.assign(window.LMSChat.reactions, {
        loadReactionsForThread,
        loadThreadMessageReactions: fetchThreadMessageReactions,
        triggerImmediatePolling,
    });
})(jQuery);
