(function ($) {
    'use strict';

    window.LMSChat = window.LMSChat || {};
    const core = window.LMSChat.reactionCore || {};
    const { state = {} } = window.LMSChat;

    const logDebug = core.logDebug || (() => {});
    const getReactionSync = () => window.LMSChat.reactionSync || {};
    const buildProcessingKey = (messageId, isThread) => (isThread ? `thread_${String(messageId)}` : String(messageId));

    // UI更新の競合を防ぐためのロック機能
    const updateLocks = new Map();
    const pendingUpdates = new Map();

    const ensureContainer = ($message) => {
        let $container = $message.find('.message-reactions').first();
        const $attachments = $message.find('.message-attachments').first();

        // 📌 保護されたリアクションコンテナはスキップ
        if ($container.length && $container.attr('data-protected') === 'true') {
            return $container;
        }

        if (!$container.length) {
            // 📌 新規作成の場合
            $container = $('<div class="message-reactions" data-reactions-hydrated="1"></div>');

            if ($attachments.length) {
                // 📌 添付ファイルがある場合、リアクションをその後ろに配置
                $attachments.after($container);
            } else {
                $message.find('.message-content').after($container);
            }
        } else {
            // 📌 既存コンテナの位置チェック＆修正
            if ($attachments.length) {
                // 添付ファイルがある場合、リアクションコンテナがその前にあるかチェック
                const $prev = $attachments.prev('.message-reactions');
                if ($prev.length && $prev[0] === $container[0]) {
                    // リアクションが添付ファイルの前にある → 後ろに移動
                    $container.detach();
                    $attachments.after($container);
                }
            }
        }

        $container.attr('data-reactions-hydrated', '1');
        return $container;
    };

    const normaliseReactions = (reactions) => {
        if (!reactions || !reactions.length) {
            return {};
        }
        if (core.groupReactions) {
            return core.groupReactions(reactions);
        }
        const grouped = {};
        reactions.forEach((reaction) => {
            const emoji = reaction.reaction || reaction.emoji;
            if (!emoji) {
                return;
            }
            if (!grouped[emoji]) {
                grouped[emoji] = {
                    emoji,
                    count: 0,
                    users: [],
                    userIds: [],
                };
            }
            grouped[emoji].count += 1;
            if (reaction.display_name) {
                grouped[emoji].users.push(reaction.display_name);
            }
            if (reaction.user_id) {
                grouped[emoji].userIds.push(parseInt(reaction.user_id, 10));
            }
        });
        return grouped;
    };

    const formatUsers = (users) => {
        if (core.formatUserNames) {
            return core.formatUserNames(users);
        }
        return Array.isArray(users) ? users.join(', ') : '';
    };

    const acquireUpdateLock = async (key) => {
        while (updateLocks.get(key)) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        updateLocks.set(key, true);
    };

    const releaseUpdateLock = (key) => {
        updateLocks.delete(key);

        // 保留中の更新があれば実行
        const pending = pendingUpdates.get(key);
        if (pending) {
            pendingUpdates.delete(key);
            setTimeout(() => {
                updateMessage(pending.messageId, pending.reactions, pending.isThread, pending.skipCache, pending.forceUpdate);
            }, 0);
        }
    };

    const patchContainer = ($container, reactions) => {
        // 📌 保護されたリアクションコンテナはスキップ
        if ($container.attr('data-protected') === 'true') {
            return;
        }

        const grouped = normaliseReactions(reactions);
        const existing = new Map();
        $container.find('.reaction-item').each(function () {
            const $item = $(this);
            existing.set($item.data('emoji'), $item);
        });

        const seen = new Set();
        const currentUserId = window.lmsChat?.currentUserId ? parseInt(window.lmsChat.currentUserId, 10) : null;

        // 🚀 DocumentFragmentで一括DOM操作（高速化）
        const fragment = document.createDocumentFragment();
        const itemsToRemove = [];
        const itemsToUpdate = [];

        Object.values(grouped).forEach((group) => {
            seen.add(group.emoji);
            const reacted = currentUserId && Array.isArray(group.userIds) ? group.userIds.includes(currentUserId) : false;
            const usersLabel = formatUsers(group.users || []);
            let $item = existing.get(group.emoji);
            if ($item && $item.length) {
                // 既存アイテムを更新（即座に更新、アニメーションなし）
                itemsToUpdate.push({
                    $item: $item,
                    count: group.count,
                    usersLabel: usersLabel,
                    reacted: reacted
                });
            } else {
                // 新規アイテムを作成（即座に表示、フェードインなし）
                const newItem = document.createElement('div');
                newItem.className = `reaction-item${reacted ? ' user-reacted' : ''}`;
                newItem.setAttribute('data-emoji', group.emoji);
                newItem.setAttribute('data-users', usersLabel || '');
                newItem.innerHTML = `
                    <span class="emoji">${group.emoji}</span>
                    <span class="count">${group.count}</span>
                `;
                fragment.appendChild(newItem);
            }
        });

        existing.forEach(($item, emoji) => {
            if (!seen.has(emoji)) {
                itemsToRemove.push($item);
            }
        });

        // 🚀 バッチ更新（リフロー最小化）
        itemsToUpdate.forEach(update => {
            update.$item.find('.count').text(update.count);
            update.$item.attr('data-users', update.usersLabel || '');
            update.$item.toggleClass('user-reacted', update.reacted);
        });

        // 🚀 バッチ削除（即座に削除）
        itemsToRemove.forEach($item => $item.remove());

        // 🚀 バッチ追加
        if (fragment.childNodes.length > 0) {
            $container[0].appendChild(fragment);
        }

        if (!Object.keys(grouped).length) {
            $container.empty();
        }

        $container.attr('data-reactions-hydrated', '1');
    };

    const shouldSkipUpdate = (processingKey, forceUpdate) => {
        if (forceUpdate) {
            return false;
        }
        if (processingKey && core.hasProcessingReactions && core.hasProcessingReactions(processingKey)) {
            return true;
        }
        const reactionSync = getReactionSync();
        if (reactionSync.shouldSkipUpdate && reactionSync.shouldSkipUpdate(processingKey)) {
            return true;
        }
        return false;
    };

    const updateMessage = async (messageId, reactions, isThread, skipCache, forceUpdate) => {
        if (reactions === null) {
            return;
        }
        if (reactions && reactions.removed === true) {
            reactions = [];
        }

        // ThreadReactionStoreがある場合はスレッド処理を委譲
        if (isThread) {
            const threadStore = window.LMSChat?.threadReactionStore;
            if (threadStore) {
                const options = {
                    source: 'ui-message',
                    forceRender: forceUpdate,
                    force: forceUpdate
                };
                threadStore.queueUpdate(messageId, reactions, options);
                return;
            }
        }

        const key = `${isThread ? 'thread' : 'main'}_${messageId}`;

        // 既に更新中の場合、保留中の更新として登録
        if (updateLocks.get(key)) {
            pendingUpdates.set(key, { messageId, reactions, isThread, skipCache, forceUpdate });
            return;
        }

        await acquireUpdateLock(key);

        try {
            const processingKey = buildProcessingKey(messageId, isThread);
            if (shouldSkipUpdate(processingKey, forceUpdate)) {
                return;
            }

            if (!skipCache && core.cacheReactionData) {
                core.cacheReactionData(messageId, reactions, isThread);
            }

            const selector = isThread ? '.thread-message' : '.chat-message';
            const $message = $(`${selector}[data-message-id="${messageId}"]`);
            if (!$message.length) {
                return;
            }

            // 📌 保護されたメッセージの場合はスキップ
            const $container = $message.find('.message-reactions').first();
            if ($container.length && $container.attr('data-protected') === 'true') {
                return;
            }

            const $ensuredContainer = ensureContainer($message);
            patchContainer($ensuredContainer, reactions || []);

            logDebug(
                `update${isThread ? 'Thread' : ''}MessageReactions: messageId=${messageId}, count=${(reactions || []).length}`
            );
        } finally {
            releaseUpdateLock(key);
        }
    };

    const updateMessageReactions = (messageId, reactions, skipCache = false, forceUpdate = false) => {
        updateMessage(messageId, reactions, false, skipCache, forceUpdate);
    };

    const updateThreadMessageReactions = (messageId, reactions, skipCache = false, forceUpdate = false) => {
        // 🚀 即座に更新（遅延なし）
        updateMessage(messageId, reactions, true, skipCache, forceUpdate);
    };

    const updateParentMessageReactions = (reactions) => {
        const $parentMessage = $('.parent-message');
        if (!$parentMessage.length) {
            setTimeout(() => updateParentMessageReactions(reactions), 100);
            return;
        }

        const $wrapper = $('.parent-message-reactions');
        if (!$wrapper.length) {
            $parentMessage.after('<div class="parent-message-reactions" data-reactions-hydrated="1"></div>');
        }

        const $container = $('.parent-message-reactions').first();
        patchContainer($container, reactions || []);

        if (!reactions || !reactions.length) {
            $parentMessage.addClass('no-reactions');
        } else {
            $parentMessage.removeClass('no-reactions');
        }

        logDebug('updateParentMessageReactions completed');
    };

    const updateParentMessageShadow = () => {
        const $parentMessage = $('#thread-panel .parent-message');
        if (!$parentMessage.length) {
            return;
        }
        const hasReactions = $('#thread-panel .parent-message-reactions .reaction-item').length > 0;
        $parentMessage.toggleClass('no-reactions', !hasReactions);
        logDebug(`updateParentMessageShadow: hasReactions=${hasReactions}`);
    };

    // 📌 ページロード時に既存メッセージのリアクション位置を修正
    const fixExistingReactionPositions = () => {
        $('.chat-message, .thread-message').each(function() {
            const $message = $(this);
            const $reactions = $message.find('.message-reactions').first();
            const $attachments = $message.find('.message-attachments').first();

            // 📌 保護されたリアクションはスキップ
            if ($reactions.length && $reactions.attr('data-protected') === 'true') {
                return; // スキップ
            }

            if ($reactions.length && $attachments.length) {
                // リアクションが添付ファイルの前にあるかチェック
                const $prev = $attachments.prev('.message-reactions');
                if ($prev.length && $prev[0] === $reactions[0]) {
                    // リアクションが添付ファイルの前にある → 後ろに移動
                    $reactions.detach();
                    $attachments.after($reactions);
                }
            }
        });
    };

    window.LMSChat.reactionUI = {
        updateMessageReactions,
        updateThreadMessageReactions,
        updateParentMessageReactions,
        updateParentMessageShadow,
        fixExistingReactionPositions,
    };

    // ページロード時とDOMContentLoaded時に実行
    $(document).ready(function() {
        fixExistingReactionPositions();

        // 📌 定期的に実行（MutationObserverの代わり）
        setInterval(fixExistingReactionPositions, 1000);

        // Ajaxでメッセージが追加された後も実行
        $(document).on('messages:loaded', fixExistingReactionPositions);
        $(document).on('thread:messages_loaded', fixExistingReactionPositions);
        $(document).on('thread:opened', fixExistingReactionPositions);
        $(document).on('message:sent', fixExistingReactionPositions);

        // 📌 スレッド開始時にメインチャット側のリアクションを保護
        $(document).on('lms_thread_opened', function(e, messageId) {
            if (messageId) {
                const $mainMessage = $(`.chat-message[data-message-id="${messageId}"]`);
                $mainMessage.find('.message-reactions').attr('data-protected', 'true');

                // リアクション位置も即座に修正
                fixExistingReactionPositions();
            }
        });
    });
})(jQuery);
