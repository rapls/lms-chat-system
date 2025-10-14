(function ($) {
	'use strict';
	window.LMSChat = window.LMSChat || {};
	if (!window.LMSChat.reactionCore) {
		window.LMSChat.reactionCore = {};
	}
	
	
	const cacheState = {
		reactionsCache: new Map(),
		threadReactionsCache: new Map(),
		cacheExpiration: 300000, // 60秒→5分（スレッドリアクションの変更頻度に最適化）
		lastCleanup: 0,
		cleanupInterval: 300000,
	};
	const setReactionsCache = (messageId, reactions) => {
		if (!messageId) return;
		cacheState.reactionsCache.set(messageId, {
			data: reactions,
			timestamp: Date.now(),
		});
		checkAndCleanupCache();
	};
	const setThreadReactionsCache = (messageId, reactions) => {
		if (!messageId) return;
		cacheState.threadReactionsCache.set(messageId, {
			data: reactions,
			timestamp: Date.now(),
		});
		checkAndCleanupCache();
	};
	const getReactionsCache = (messageId) => {
		if (!messageId) return null;
		const cached = cacheState.reactionsCache.get(messageId);
		if (!cached) return null;
		if (Date.now() - cached.timestamp > cacheState.cacheExpiration) {
			cacheState.reactionsCache.delete(messageId);
			return null;
		}
		return cached.data;
	};
	const getThreadReactionsCache = (messageId) => {
		if (!messageId) return null;
		const cached = cacheState.threadReactionsCache.get(messageId);
		if (!cached) return null;
		
		// スマートキャッシング: 現在ユーザーのリアクションは短期間、他は長期間
		const currentUserId = window.lmsChat?.currentUserId;
		let expiration = cacheState.cacheExpiration;
		if (cached.data && cached.data.some(r => r.user_id == currentUserId)) {
			expiration = Math.min(expiration, 120000); // 現在ユーザーのリアクションは2分
		}
		
		if (Date.now() - cached.timestamp > expiration) {
			cacheState.threadReactionsCache.delete(messageId);
			return null;
		}
		return cached.data;
	};
	const clearReactionsCache = (messageId) => {
		if (!messageId) return;
		cacheState.reactionsCache.delete(messageId);
	};
	const clearThreadReactionsCache = (messageId) => {
		if (!messageId) return;
		cacheState.threadReactionsCache.delete(messageId);
	};
	const clearAllReactionsCache = () => {
		cacheState.reactionsCache.clear();
		cacheState.threadReactionsCache.clear();
	};
	const cleanupExpiredCache = () => {
		const now = Date.now();
		const expiration = cacheState.cacheExpiration;
		for (const [messageId, cached] of cacheState.reactionsCache.entries()) {
			if (now - cached.timestamp > expiration) {
				cacheState.reactionsCache.delete(messageId);
			}
		}
		for (const [messageId, cached] of cacheState.threadReactionsCache.entries()) {
			if (now - cached.timestamp > expiration) {
				cacheState.threadReactionsCache.delete(messageId);
			}
		}
		cacheState.lastCleanup = now;
	};
	const checkAndCleanupCache = () => {
		const now = Date.now();
		if (now - cacheState.lastCleanup > cacheState.cleanupInterval) {
			cleanupExpiredCache();
		}
	};
	window.LMSChat.reactionCache = {
		state: cacheState,
		setReactionsCache,
		setThreadReactionsCache,
		getReactionsCache,
		getThreadReactionsCache,
		clearReactionsCache,
		clearThreadReactionsCache,
		clearAllReactionsCache,
		cleanupExpiredCache,
	};
	if (window.LMSChat.cache) {
		window.LMSChat.cache.setReactionsCache = setReactionsCache;
		window.LMSChat.cache.setThreadReactionsCache = setThreadReactionsCache;
		window.LMSChat.cache.getReactionsCache = getReactionsCache;
		window.LMSChat.cache.getThreadReactionsCache = getThreadReactionsCache;
	}
	$(document).ready(() => {
		try {
			setInterval(cleanupExpiredCache, cacheState.cleanupInterval);
			$(document).trigger('reactionCache:initialized');
		} catch (error) {
		}
	});
})(jQuery);
