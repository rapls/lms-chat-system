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
        if (!$container.length) {
            $container = $('<div class="message-reactions" data-reactions-hydrated="1"></div>');
            $message.find('.message-content').after($container);
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
            const emoji = reaction.reaction;
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
        // ドリフト防止: レイアウト測定とロック
        const $message = $container.closest('.chat-message, .thread-message');
        const messageElement = $message[0];
        let beforeHeight = 0;
        let beforeTop = 0;
        
        if (messageElement) {
            const beforeRect = messageElement.getBoundingClientRect();
            beforeHeight = beforeRect.height;
            beforeTop = beforeRect.top;
        }

        const grouped = normaliseReactions(reactions);
        const existing = new Map();
        $container.find('.reaction-item').each(function () {
            const $item = $(this);
            existing.set($item.data('emoji'), $item);
        });

        const seen = new Set();
        const currentUserId = window.lmsChat?.currentUserId ? parseInt(window.lmsChat.currentUserId, 10) : null;

        Object.values(grouped).forEach((group) => {
            seen.add(group.emoji);
            const reacted = currentUserId && Array.isArray(group.userIds) ? group.userIds.includes(currentUserId) : false;
            const usersLabel = formatUsers(group.users || []);
            let $item = existing.get(group.emoji);
            if ($item && $item.length) {
                $item.find('.count').text(group.count);
                $item.attr('data-users', usersLabel || '');
                $item.toggleClass('user-reacted', reacted);
            } else {
                $item = $(
                    `<div class="reaction-item${reacted ? ' user-reacted' : ''}" data-emoji="${group.emoji}" data-users="${usersLabel || ''}">
                        <span class="emoji">${group.emoji}</span>
                        <span class="count">${group.count}</span>
                    </div>`
                );
                // ドリフト防止: DocumentFragment使用でバッチ追加
                const fragment = document.createDocumentFragment();
                fragment.appendChild($item[0]);
                $container[0].appendChild(fragment);
            }
        });

        existing.forEach(($item, emoji) => {
            if (!seen.has(emoji)) {
                $item.remove();
            }
        });

        if (!Object.keys(grouped).length) {
            $container.empty();
        }

        $container.attr('data-reactions-hydrated', '1');

        // ドリフト検出と補正
        if (messageElement) {
            const afterRect = messageElement.getBoundingClientRect();
            const heightDiff = afterRect.height - beforeHeight;
            const topDiff = afterRect.top - beforeTop;

            if (Math.abs(heightDiff) > 1 || Math.abs(topDiff) > 1) {
                // レイアウトシフト検出時の緊急補正
                if (window.ThreadDriftGuard && window.ThreadDriftGuard.performCorrection) {
                    const messageId = $message.data('message-id');
                    window.ThreadDriftGuard.performCorrection({
                        messageId: messageId,
                        source: 'main_reaction_ui',
                        heightDrift: heightDiff,
                        topDrift: topDiff
                    });
                }
            }
        }
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

            const $container = ensureContainer($message);
            patchContainer($container, reactions || []);

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
        // 重複更新防止 - 100ms以内の重複を防ぐ
        const updateKey = `thread_${messageId}`;
        const now = Date.now();
        
        if (!window.LMSChat.lastReactionUpdate) {
            window.LMSChat.lastReactionUpdate = {};
        }
        
        if (window.LMSChat.lastReactionUpdate[updateKey] && 
            (now - window.LMSChat.lastReactionUpdate[updateKey]) < 100) {
            logDebug('Skipping duplicate thread reaction update', { messageId, timeDiff: now - window.LMSChat.lastReactionUpdate[updateKey] });
            return;
        }
        
        window.LMSChat.lastReactionUpdate[updateKey] = now;
        
        logDebug('updateThreadMessageReactions called', { messageId, count: reactions?.length || 0 });

        // データ不完全性チェック: サーバーデータが部分的な場合の対策
        if (reactions && reactions.length > 0) {
            const $message = $(`.thread-message[data-message-id="${messageId}"], #thread-messages .chat-message[data-message-id="${messageId}"]`);
            const currentReactionCount = $message.find('.reaction-item').length;
            
            // 現在のDOM要素数がサーバーデータより多い場合は要注意
            if (currentReactionCount > reactions.length) {
                logDebug('Potential incomplete server data detected', { 
                    domCount: currentReactionCount, 
                    serverCount: reactions.length,
                    messageId: messageId 
                });
                
                // キャッシュから完全なデータを取得を試行
                if (window.LMSChat?.reactionCore?.getCachedReactions) {
                    const cachedData = window.LMSChat.reactionCore.getCachedReactions(messageId, true);
                    if (cachedData && cachedData.length >= currentReactionCount) {
                        logDebug('Using cached complete reaction data', { messageId, cachedCount: cachedData.length });
                        reactions = cachedData;
                    }
                }
            }
        }

        // DOM要素を取得（複数のセレクタで対応）
        const $message = $(`.thread-message[data-message-id="${messageId}"], #thread-messages .chat-message[data-message-id="${messageId}"]`);
        if (!$message.length) {
            logDebug('Thread message element not found', { messageId });
            return;
        }

        // リアクションコンテナを取得または作成
        let $container = $message.find('.message-reactions').first();
        const hasReactions = reactions && reactions.length > 0;

        if (!hasReactions) {
            // リアクションがない場合は削除（フェードアウト）
            if ($container.length) {
                $container.stop(true, true).fadeOut(200, function() {
                    $(this).remove();
                });
            }
            return;
        }

        // コンテナが存在しない場合は作成
        if (!$container.length) {
            $container = $('<div class="message-reactions" data-reactions-hydrated="1"></div>');
            $message.find('.message-content').after($container);
        }

        // 現在のリアクションをマップ化
        const currentReactions = new Map();
        $container.find('.reaction-item').each(function() {
            const $item = $(this);
            const emoji = $item.find('.emoji').text();
            if (emoji) {
                currentReactions.set(emoji, $item);
            }
        });

        // 既存のリアクションを保持してマージ
        const existingReactions = [];
        $container.find('.reaction-item').each(function() {
            const $item = $(this);
            const emoji = $item.find('.emoji').text();
            if (emoji) {
                existingReactions.push({
                    emoji: emoji,
                    count: parseInt($item.find('.count').text()) || 1,
                    users: [$item.hasClass('user-reacted') ? window.lmsChat?.currentUserId : null].filter(Boolean),
                    user_ids: [$item.hasClass('user-reacted') ? parseInt(window.lmsChat?.currentUserId) : null].filter(Boolean),
                    wasUserReacted: $item.hasClass('user-reacted')
                });
            }
        });

        // 新しいリアクションをグループ化（既存とマージ）
        const groupedReactions = {};
        
        // まず既存のリアクションを保持
        existingReactions.forEach(existing => {
            groupedReactions[existing.emoji] = existing;
        });
        
        // サーバーからの新しいデータでマージ・更新
        (reactions || []).forEach(reaction => {
            const emoji = reaction.emoji || reaction.reaction;
            if (!emoji) return;
            
            // 既存データがある場合は更新、ない場合は新規追加
            groupedReactions[emoji] = {
                emoji: emoji,
                count: reaction.count || (reaction.users ? reaction.users.length : 1),
                users: reaction.users || [],
                userIds: reaction.user_ids || [],
                wasUserReacted: groupedReactions[emoji]?.wasUserReacted || false
            };
        });

        // 削除すべきリアクション（慎重な削除判定）
        currentReactions.forEach(($item, emoji) => {
            if (!groupedReactions[emoji]) {
                // 安全チェック: サーバーデータが不完全でない場合のみ削除
                const shouldDelete = reactions && reactions.length > 0; // サーバーから何らかのデータが来た場合のみ削除を許可
                
                if (shouldDelete) {
                    logDebug('Removing reaction not in server data', { messageId, emoji });
                    $item.stop(true, true).fadeOut(150, function() {
                        $(this).remove();
                    });
                } else {
                    logDebug('Preserving existing reaction - server data incomplete', { messageId, emoji });
                    // サーバーデータが空または不完全な場合は既存を保持
                    groupedReactions[emoji] = {
                        emoji: emoji,
                        count: parseInt($item.find('.count').text()) || 1,
                        users: [],
                        userIds: [],
                        wasUserReacted: $item.hasClass('user-reacted')
                    };
                }
            }
        });

        // 追加・更新すべきリアクション
        Object.values(groupedReactions).forEach(group => {
            const currentUserId = window.lmsChat?.currentUserId ? parseInt(window.lmsChat.currentUserId, 10) : null;
            
            // user-reacted状態の正確な判定（複数ソースを考慮）
            let isUserReacted = false;
            if (currentUserId) {
                // 1. サーバーデータから判定
                if (group.userIds && group.userIds.length > 0) {
                    isUserReacted = group.userIds.includes(currentUserId);
                }
                // 2. 既存DOM状態を考慮（サーバーデータが不完全な場合）
                else if (group.wasUserReacted !== undefined) {
                    isUserReacted = group.wasUserReacted;
                }
                // 3. 既存DOM要素から直接確認
                else {
                    const $existingItem = currentReactions.get(group.emoji);
                    if ($existingItem) {
                        isUserReacted = $existingItem.hasClass('user-reacted');
                    }
                }
            }
            
            let $existingItem = currentReactions.get(group.emoji);
            
            if ($existingItem) {
                // 既存アイテムの更新（ちらつき防止）
                const $count = $existingItem.find('.count');
                const currentCount = parseInt($count.text()) || 0;
                
                if (currentCount !== group.count) {
                    // カウントが変わった場合のみ更新
                    if (group.count > 1) {
                        $count.text(group.count);
                    } else {
                        $count.text('');
                    }
                }
                
                // user-reacted クラスの更新（スムーズに）
                if (isUserReacted && !$existingItem.hasClass('user-reacted')) {
                    $existingItem.addClass('user-reacted');
                } else if (!isUserReacted && $existingItem.hasClass('user-reacted')) {
                    $existingItem.removeClass('user-reacted');
                }
            } else {
                // 新しいアイテムを作成（フェードイン）
                const $newItem = $(`
                    <div class="reaction-item ${isUserReacted ? 'user-reacted' : ''}" data-emoji="${group.emoji}" style="display: none;">
                        <span class="emoji">${group.emoji}</span>
                        <span class="count">${group.count > 1 ? group.count : ''}</span>
                    </div>
                `);
                
                // 適切な位置に挿入（順序維持）
                let inserted = false;
                $container.find('.reaction-item').each(function() {
                    const existingEmoji = $(this).find('.emoji').text();
                    if (group.emoji < existingEmoji) {
                        $newItem.insertBefore(this);
                        inserted = true;
                        return false;
                    }
                });
                
                if (!inserted) {
                    $container.append($newItem);
                }
                
                // フェードイン（新規追加時）
                $newItem.fadeIn(200);
            }
        });

        // キャッシュ更新
        if (window.LMSChat?.reactionCore?.cacheReactionData && !skipCache) {
            window.LMSChat.reactionCore.cacheReactionData(messageId, reactions, true);
        }

        logDebug('Thread message reactions updated successfully', { messageId, count: Object.keys(groupedReactions).length });
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

    window.LMSChat.reactionUI = {
        updateMessageReactions,
        updateThreadMessageReactions,
        updateParentMessageReactions,
        updateParentMessageShadow,
    };
})(jQuery);
