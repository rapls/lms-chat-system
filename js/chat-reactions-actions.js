(function ($) {
    'use strict';

    window.LMSChat = window.LMSChat || {};
    const { state = {}, utils = {} } = window.LMSChat;
    const core = window.LMSChat.reactionCore || {};
    const ui = window.LMSChat.reactionUI || {};
    const cacheModule = window.LMSChat.reactionCache || {};

    const CONTEXT_THREAD = 'thread';

    const ensureStringId = (messageId) => (typeof messageId === 'number' ? String(messageId) : messageId);
    const buildProcessingKey = (messageId, isThread) => (isThread ? `thread_${ensureStringId(messageId)}` : ensureStringId(messageId));
    const getReactionSync = () => window.LMSChat.reactionSync || {};

    const hideTooltip = () => {
        if (ui.hideReactionTooltip) {
            ui.hideReactionTooltip();
        }
    };

    const resolveMessageElement = (messageId, isThread) => {
        const selector = isThread ? '.thread-message' : '.chat-message';
        return $(`${selector}[data-message-id="${messageId}"]`);
    };

    const resolveThreadId = (messageId) => {
        const $message = resolveMessageElement(messageId, true);
        if ($message.length) {
            const $panel = $message.closest('.thread-panel');
            if ($panel.length) {
                const threadId = $panel.data('thread-id');
                if (threadId) {
                    const parsed = parseInt(threadId, 10);
                    return Number.isNaN(parsed) ? null : parsed;
                }
            }
        }
        if (state.currentThread) {
            const parsed = parseInt(state.currentThread, 10);
            return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
    };

    const getCachedReactions = (messageId, isThread = false) => {
        if (!messageId) {
            return null;
        }
        if (core.getCachedReactionData) {
            const cached = core.getCachedReactionData(messageId, isThread);
            if (cached) {
                return cached;
            }
        }
        if (cacheModule) {
            if (isThread && cacheModule.getThreadReactionsCache) {
                return cacheModule.getThreadReactionsCache(messageId) || null;
            }
            if (!isThread && cacheModule.getReactionsCache) {
                return cacheModule.getReactionsCache(messageId) || null;
            }
        }
        return null;
    };

    const storeCachedReactions = (messageId, reactions, isThread = false) => {
        if (!messageId) {
            return;
        }
        if (core.cacheReactionData) {
            core.cacheReactionData(messageId, reactions, isThread);
        }
        if (cacheModule) {
            if (isThread && cacheModule.setThreadReactionsCache) {
                cacheModule.setThreadReactionsCache(messageId, reactions);
            } else if (!isThread && cacheModule.setReactionsCache) {
                cacheModule.setReactionsCache(messageId, reactions);
            }
        }
    };

    const applyUiUpdate = (messageId, reactions, isThread) => {
        return applyUiUpdateWithTimestamp(messageId, reactions, isThread, null, { source: 'ui' });
    };

    const applyUiUpdateWithTimestamp = (messageId, reactions, isThread, serverTimestamp = null, metadata = {}) => {
        if (isThread) {
            // 統一システムを最優先で使用
            const unifiedSystem = window.LMSChat?.threadReactionUnified;
            if (unifiedSystem) {
                unifiedSystem.updateReactions(messageId, reactions, {
                    source: metadata.source || 'action',
                    serverTimestamp: serverTimestamp,
                    force: metadata.force || false,
                    ...metadata
                });
            } else {
                // フォールバック1: ThreadReactionStore
                const threadStore = window.LMSChat?.threadReactionStore;
                if (threadStore) {
                    const options = {
                        source: metadata.source || 'action',
                        serverTimestamp: serverTimestamp,
                        force: metadata.force || false,
                        forceRender: true,
                        ...metadata
                    };
                    threadStore.queueUpdate(messageId, reactions, options);
                } else {
                    // フォールバック2: 旧来の方式（重複防止付き）
                    const updateKey = `actions_thread_${messageId}`;
                    const now = Date.now();
                    if (!window.LMSChat.actionsUpdate) window.LMSChat.actionsUpdate = {};
                    
                    if (window.LMSChat.actionsUpdate[updateKey] && 
                        (now - window.LMSChat.actionsUpdate[updateKey]) < 120) {
                        // 120ms以内の重複はスキップ
                        return;
                    }
                    window.LMSChat.actionsUpdate[updateKey] = now;
                    
                    if (ui.updateThreadMessageReactions) {
                        ui.updateThreadMessageReactions(messageId, reactions, true, true);
                    } else if (window.updateThreadMessageReactions) {
                        // 🔥 緊急修正: 既存の動作するupdateThreadMessageReactions関数を直接呼び出し
                        window.updateThreadMessageReactions(messageId, reactions, true);
                    }
                }
            }
            
            if (ui.updateParentMessageShadow) {
                ui.updateParentMessageShadow();
            }
            return;
        }
        
        // メインチャットの場合
        if (ui.updateMessageReactions) {
            ui.updateMessageReactions(messageId, reactions, true, true);
        }
    };

    const emitReactionEvent = (messageId, emoji, actionType, isThread, reactions) => {
        const eventName = isThread
            ? actionType === 'removed'
                ? 'thread_reaction:removed'
                : 'thread_reaction:added'
            : actionType === 'removed'
                ? 'reaction:removed'
                : 'reaction:added';
        const payload = {
            messageId,
            reaction: emoji,
            action: actionType,
            reactions,
            userId: window.lmsChat?.currentUserId ? parseInt(window.lmsChat.currentUserId, 10) : null,
            timestamp: Date.now(),
        };
        if (isThread) {
            payload.threadId = resolveThreadId(messageId);
        }
        $(document).trigger(eventName, payload);
    };

    const fetchLatestReactions = async (messageId, isThread) => {
        try {
            const endpoint = isThread ? 'lms_get_thread_message_reactions' : 'lms_get_reactions';
            const response = await $.ajax({
                url: window.lmsChat?.ajaxUrl,
                type: 'GET',
                data: {
                    action: endpoint,
                    message_id: messageId,
                    nonce: window.lmsChat?.nonce,
                },
                cache: false,
                timeout: 8000,
                dataType: 'json',
            });

            if (response && response.success) {
                const payload = response.data || [];
                storeCachedReactions(messageId, payload, isThread);
                applyUiUpdate(messageId, payload, isThread);
                return payload;
            }
        } catch (error) {
            // 取得失敗時は黙ってスキップ
        }
        return null;
    };

    const toggleReactionInternal = async (messageId, emoji, isThread) => {
        if (!messageId || !emoji) {
            return false;
        }

        if (!window.lmsChat?.currentUserId) {
            if (utils.showError) {
                utils.showError('リアクションを利用するにはログインが必要です。');
            }
            return false;
        }

        const processingKey = buildProcessingKey(messageId, isThread);
        if (
            core.isReactionProcessing &&
            core.isReactionProcessing(processingKey, emoji)
        ) {
            return false;
        }

        if (
            window.LMSChat.preventDuplicateReaction &&
            window.LMSChat.preventDuplicateReaction(processingKey, emoji, 'REACTIONS')
        ) {
            return false;
        }

        hideTooltip();
        $(document).trigger('reaction_toggled', [messageId, isThread]);

        if (core.startReactionProcessing) {
            core.startReactionProcessing(processingKey, emoji);
        }

        const reactionSync = getReactionSync();
        if (isThread && reactionSync.addSkipUpdateThreadMessageId) {
            reactionSync.addSkipUpdateThreadMessageId(messageId, 3000);
        } else if (reactionSync.addSkipUpdateMessageId) {
            reactionSync.addSkipUpdateMessageId(processingKey, 2000);
        }

        // スレッドの場合は楽観的更新を行わない（競合防止のため）
        const performOptimisticUpdate = !isThread;
        
        if (performOptimisticUpdate) {
            // メインチャットのみ楽観的更新を実行
            const cachedReactions = getCachedReactions(messageId, isThread) || [];
            applyUiUpdate(messageId, cachedReactions, isThread);
        }

        const ajaxData = {
            action: isThread ? 'lms_toggle_thread_reaction' : 'lms_toggle_reaction',
            message_id: messageId,
            emoji,
            nonce: window.lmsChat?.nonce,
            user_id: window.lmsChat?.currentUserId,
        };
        if (isThread) {
            const threadId = resolveThreadId(messageId);
            if (threadId) {
                ajaxData.thread_id = threadId;
            }
        }

        let success = false;
        try {
            const response = await $.ajax({
                url: window.lmsChat?.ajaxUrl,
                type: 'POST',
                data: ajaxData,
                cache: false,
                timeout: 12000,
                dataType: 'json',
            });

            if (response && response.success && response.data) {
                success = true;
                const payload = response.data.reactions || response.data || [];
                const serverTimestamp = response.data.server_timestamp || null;
                const actionType = response.data.action || (response.data.removed ? 'removed' : 'added');
                
                // キャッシュに保存
                storeCachedReactions(messageId, payload, isThread);
                
                // UI更新（server_timestampを含む）
                applyUiUpdateWithTimestamp(messageId, payload, isThread, serverTimestamp, {
                    action: actionType,
                    source: 'action',
                    force: true
                });

                emitReactionEvent(messageId, emoji, actionType, isThread, payload);

                if (isThread && reactionSync.clearThreadProtectionOnSuccess) {
                    reactionSync.clearThreadProtectionOnSuccess(messageId);
                }
            } else {
                if (utils.showError) {
                    const message = response?.data || 'リアクションの更新に失敗しました。';
                    utils.showError(message);
                }
                await fetchLatestReactions(messageId, isThread);
            }
        } catch (error) {
            if (utils.showError) {
                utils.showError('リアクションの処理中にエラーが発生しました。');
            }
            await fetchLatestReactions(messageId, isThread);
        } finally {
            if (core.finishReactionProcessing) {
                core.finishReactionProcessing(processingKey, emoji, success);
            }
        }

        return success;
    };

    const toggleReaction = (messageId, emoji) => toggleReactionInternal(messageId, emoji, false);
    const toggleThreadReaction = (messageId, emoji) => toggleReactionInternal(messageId, emoji, true);

    const showReactionPicker = ($button, messageId, isThread = false) => {
        if (!window.LMSChat.emojiPicker || !window.LMSChat.emojiPicker.showPicker) {
            return;
        }
        const handleEmojiSelect = (selectedEmoji) => {
            if (isThread) {
                toggleThreadReaction(messageId, selectedEmoji);
            } else {
                toggleReaction(messageId, selectedEmoji);
            }
        };
        window.LMSChat.emojiPicker.showPicker($button, messageId, isThread, handleEmojiSelect);
    };

    const refreshNonceAndRetry = async (messageId, emoji, isThread = false) => {
        try {
            const response = await $.ajax({
                url: window.lmsChat?.ajaxUrl,
                type: 'GET',
                data: {
                    action: 'lms_get_fresh_nonce',
                    _: Date.now(),
                },
                dataType: 'json',
                timeout: 5000,
            });
            if (response?.success && response.data?.nonce) {
                window.lmsChat.nonce = response.data.nonce;
                if (isThread) {
                    toggleThreadReaction(messageId, emoji);
                } else {
                    toggleReaction(messageId, emoji);
                }
            } else if (utils.showError) {
                utils.showError('認証情報の更新に失敗しました。ページを再読み込みしてください。');
            }
        } catch (error) {
            if (utils.showError) {
                utils.showError('認証情報の更新に失敗しました。ページを再読み込みしてください。');
            }
        }
    };

    const refreshParentMessageReactions = async (messageId) => {
        if (!messageId) {
            return;
        }
        await fetchLatestReactions(messageId, false);
        if (ui.updateParentMessageReactions && core.getCachedReactionData) {
            const cached = core.getCachedReactionData(messageId, false) || [];
            ui.updateParentMessageReactions(cached);
        }
    };

    const handleReactionItemClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTooltip();

        const $item = $(event.currentTarget);
        const emoji = $item.data('emoji');
        if (!emoji) {
            return;
        }

        const $threadMessage = $item.closest('.thread-message');
        if ($threadMessage.length) {
            const messageId = $threadMessage.data('message-id');
            if (messageId) {
                toggleThreadReaction(messageId, emoji);
            }
            return;
        }

        const $parentReactions = $item.closest('.parent-message-reactions');
        if ($parentReactions.length) {
            const parentId =
                $parentReactions.data('message-id') ||
                $parentReactions.closest('.parent-message').data('message-id') ||
                state.currentThread;
            if (parentId) {
                toggleReaction(parentId, emoji);
            }
            return;
        }

        const $message = $item.closest('.chat-message');
        if ($message.length) {
            const messageId = $message.data('message-id');
            if (messageId) {
                toggleReaction(messageId, emoji);
            }
        }
    };

    const handleAddReactionClick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        const $button = $(event.currentTarget);
        const $message = $button.closest('.chat-message, .thread-message, .parent-message');
        if (!$message.length) {
            return;
        }

        let messageId = $button.data('message-id') || $message.data('message-id');
        let isThread = false;

        if ($message.hasClass('thread-message')) {
            isThread = true;
        } else if ($message.hasClass('parent-message')) {
            isThread = false;
            if (!messageId && state.currentThread) {
                messageId = state.currentThread;
            }
        }

        if (!messageId) {
            return;
        }

        showReactionPicker($button, messageId, isThread);
    };

    const setupReactionActionEventListeners = () => {
        $(document).off('click.reactionItems', '.reaction-item');
        $(document).off('click.addReaction', '.add-reaction');

        $(document).on('click.reactionItems', '.reaction-item', handleReactionItemClick);
        $(document).on('click.addReaction', '.add-reaction', handleAddReactionClick);
    };

    window.LMSChat.reactionActions = {
        toggleReaction,
        toggleThreadReaction,
        showReactionPicker,
        setupReactionActionEventListeners,
        getReactionDataFromCache: getCachedReactions,
        updateReactionDataInCache: () => null,
        refreshParentMessageReactions,
        refreshNonceAndRetry,
    };

    $(document).ready(() => {
        setupReactionActionEventListeners();
    });
})(jQuery);
