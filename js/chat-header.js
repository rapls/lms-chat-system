/**
 * チャットヘッダーの未読バッジ管理
 */
(function ($) {
	'use strict';
	const updateHeaderUnreadCount = async (retryCount = 0) => {
		if (window.LMSBadgeUpdateBlocked) {
			return;
		}
		
		if (window.LMSSimpleNewmarkSystem && typeof window.LMSSimpleNewmarkSystem.isProtectionActive === 'function') {
			if (window.LMSSimpleNewmarkSystem.isProtectionActive()) {
				return;
			}
		}
		
		if (document.hidden) {
			return;
		}
		if (!window.lmsChat || !window.lmsChat.ajaxUrl || !window.lmsChat.nonce) {
			return;
		}
		const maxRetries = 2;
		const timeouts = [8000, 12000, 20000];
		try {
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				data: {
					action: 'lms_get_unread_count',
					nonce: window.lmsChat.nonce,
				},
				timeout: timeouts[retryCount] || timeouts[timeouts.length - 1],
				cache: false,
				dataType: 'json',
				headers: {
					'Cache-Control': 'no-cache',
					'X-Requested-With': 'XMLHttpRequest'
				}
			});
			if (response && response.success && response.data) {
				if (window.LMSBadgeUpdateBlocked) {
					return;
				}
				
				if (window.LMSManualBadgeValue !== undefined) {
					return;
				}
				
				const counts = Object.values(response.data).map((count) => parseInt(count, 10) || 0);
				const totalUnread = counts.reduce((sum, count) => sum + count, 0);
				
				const $headerBadge = $('.chat-icon-wrapper .chat-icon .unread-badge, .chat-icon .unread-badge, .header-chat-icon .unread-badge')
					.not('.user-avatar .unread-badge');
				const currentBadgeValue = parseInt($headerBadge.first().text()) || 0;
				const isCurrentlyVisible = $headerBadge.first().is(':visible');
				
				if (currentBadgeValue === 0 && !isCurrentlyVisible && totalUnread > 0) {
					return;
				}
				
				if (totalUnread > currentBadgeValue) {
					const timeSinceLastZeroUpdate = Date.now() - (window.LMSLastZeroUpdateTime || 0);
					if (window.LMSLastZeroUpdateTime && timeSinceLastZeroUpdate < 120000) {
						return;
					}
					
					const timeSinceManualBadge = Date.now() - (window.LMSManualBadgeTime || 0);
					if (window.LMSManualBadgeTime && timeSinceManualBadge < 40000) {
						return;
					}
				}
				
				if (totalUnread <= currentBadgeValue && currentBadgeValue > 0) {
					return;
				}
				if (window.LMSGlobalBadgeManager) {
					window.LMSGlobalBadgeManager.setState(totalUnread, 'chat-header.js:30s-timer');
				}
			}
		} catch (error) {
			const isRetryableError = (
				error.status === 0 ||
				error.status === 502 || 
				error.status === 503 || 
				error.status === 504 ||
				(error.statusText && error.statusText === 'timeout')
			);
			if (isRetryableError && retryCount < maxRetries) {
				const delay = Math.pow(2, retryCount) * 2000;
				setTimeout(() => {
					updateHeaderUnreadCount(retryCount + 1);
				}, delay);
			}
		}
	};
	if (window.lmsChat && window.lmsChat.currentUserId) {
		setTimeout(() => {
			updateHeaderUnreadCount();
		}, 30000);
		setInterval(updateHeaderUnreadCount, 3600000);
	}
})(jQuery);
