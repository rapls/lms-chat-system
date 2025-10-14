(function ($) {
	'use strict';
	window.LMSChat = window.LMSChat || {};
	const reactionState = {
		processing: new Map(),
		lastProcessedReactions: new Map(),
		lastReactionData: new Map(),
		lastThreadReactionData: new Map(),
		isReactionPolling: false,
		isThreadReactionPolling: false,
		reactionPollingInterval: null,
		threadReactionPollingInterval: null,
	};
	const formatUserNames = (users, maxDisplayUsers = 3) => {
		if (!users || users.length === 0) return '';
		if (users.length <= maxDisplayUsers) {
			return users.join(', ');
		}
		const displayedUsers = users.slice(0, maxDisplayUsers);
		const remainingCount = users.length - maxDisplayUsers;
		return `${displayedUsers.join(', ')} +${remainingCount}`;
	};
	const groupReactions = (reactions) => {
		if (!reactions || reactions.length === 0) {
			return {};
		}
		const groupedReactions = {};
		reactions.forEach((reaction) => {
			const emoji = reaction.reaction;
			if (!groupedReactions[emoji]) {
				groupedReactions[emoji] = {
					emoji: emoji,
					count: 0,
					users: [],
					userIds: [],
				};
			}
			groupedReactions[emoji].count++;
			groupedReactions[emoji].users.push(reaction.display_name || `ユーザー${reaction.user_id}`);
			groupedReactions[emoji].userIds.push(parseInt(reaction.user_id));
		});
		return groupedReactions;
	};
	const createReactionsHtml = (reactions) => {
		if (!reactions || reactions.length === 0) {
			return '';
		}
		const groupedReactions = groupReactions(reactions);
		let html = '<div class="message-reactions" data-reactions-hydrated="1">';
		Object.values(groupedReactions).forEach((group) => {
			const formattedUserNames = formatUserNames(group.users);
			const currentUserId = parseInt(lmsChat.currentUserId);
			const userReacted = group.userIds.includes(currentUserId);
			const userReactedClass = userReacted ? 'user-reacted' : '';
			html += `<div class="reaction-item ${userReactedClass}" data-emoji="${group.emoji}" data-users="${formattedUserNames}">
                <span class="emoji">${group.emoji}</span>
                <span class="count">${group.count}</span>
            </div>`;
		});
		html += '</div>';
		return html;
	};
	const isReactionProcessing = (messageId, emoji) => {
		const key = `${messageId}:${emoji}`;
		const processingInfo = reactionState.processing.get(key);
		if (!processingInfo) return false;
		const now = Date.now();
		if (now - processingInfo.timestamp > 10000) {
			reactionState.processing.delete(key);
			return false;
		}
		return true;
	};
	const hasProcessingReactions = (messageId) => {
		for (const [key, info] of reactionState.processing.entries()) {
			const keyParts = key.split(':');
			if (keyParts[0] === messageId) {
				const now = Date.now();
				if (now - info.timestamp <= 10000) {
					return true;
				}
			}
		}
		return false;
	};
	const startReactionProcessing = (messageId, emoji, status = 'processing') => {
		const key = `${messageId}:${emoji}`;
		reactionState.processing.set(key, {
			timestamp: Date.now(),
			status: status,
		});
		reactionState.lastProcessedReactions.set(messageId, {
			emoji: emoji,
			action: 'toggle',
			timestamp: Date.now(),
		});
	};
	const finishReactionProcessing = (messageId, emoji, success = true) => {
		const key = `${messageId}:${emoji}`;
		reactionState.processing.delete(key);
		const lastProcessed = reactionState.lastProcessedReactions.get(messageId);
		if (lastProcessed && lastProcessed.emoji === emoji) {
			lastProcessed.status = success ? 'success' : 'error';
			lastProcessed.completedAt = Date.now();
			reactionState.lastProcessedReactions.set(messageId, lastProcessed);
		}
	};
	const cacheReactionData = (messageId, reactions, isThread = false) => {
		if (isThread) {
			reactionState.lastThreadReactionData.set(messageId, reactions);
			if (window.LMSChat.cache && window.LMSChat.cache.setThreadReactionsCache) {
				window.LMSChat.cache.setThreadReactionsCache(messageId, reactions);
			}
		} else {
			reactionState.lastReactionData.set(messageId, reactions);
			if (window.LMSChat.cache && window.LMSChat.cache.setReactionsCache) {
				window.LMSChat.cache.setReactionsCache(messageId, reactions);
			}
		}
	};
	const getCachedReactionData = (messageId, isThread = false) => {
		if (isThread) {
			return reactionState.lastThreadReactionData.get(messageId) || null;
		} else {
			return reactionState.lastReactionData.get(messageId) || null;
		}
	};
	const getLastProcessedReaction = (messageId) => {
		return reactionState.lastProcessedReactions.get(messageId) || null;
	};
	const isNewerThanLastProcessed = (messageId, timestamp) => {
		const lastProcessed = reactionState.lastProcessedReactions.get(messageId);
		if (!lastProcessed) return true;
		const compareTime = lastProcessed.completedAt || lastProcessed.timestamp;
		return timestamp > compareTime + 1000;
	};
	const logDebug = (message, ...args) => {
	};
	window.LMSChat.reactionCore = {
		state: reactionState,
		formatUserNames,
		groupReactions,
		createReactionsHtml,
		isReactionProcessing,
		hasProcessingReactions,
		startReactionProcessing,
		finishReactionProcessing,
		cacheReactionData,
		getCachedReactionData,
		getLastProcessedReaction,
		isNewerThanLastProcessed,
		logDebug,
	};
})(jQuery);
