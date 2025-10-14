(function ($) {
	'use strict';
	const { state, utils } = window.LMSChat;
	
	const badgeShow = function($badge, text = null) {
		if (text !== null) {
			$badge.text(text);
		}
		$badge.removeAttr('style');
		$badge.removeClass('unread-badge-hide');
		$badge.addClass('visible show has-content');
		return $badge;
	};
	
	const badgeHide = function($badge) {
		$badge.text('');
		$badge.html('');
		$badge.removeAttr('style');
		$badge.removeClass('visible show has-content');
		$badge.addClass('unread-badge-hide');
		return $badge;
	};
	
	const originalHide = $.fn.hide;
	const originalShow = $.fn.show;
	
	$.fn.hide = function(...args) {
		if (this.hasClass('unread-badge')) {
			return badgeHide(this);
		}
		return originalHide.apply(this, args);
	};
	
	$.fn.show = function(...args) {
		if (this.hasClass('unread-badge')) {
			return badgeShow(this);
		}
		return originalShow.apply(this, args);
	};
	
	let isInitialized = false;
	let initialUnreadCountsLoaded = false;
	let badgeProtectionUntil = 0;
	if (!window.LMSBadgeWatcher) {
		window.LMSBadgeWatcher = {
			originalShow: $.fn.show,
			originalHide: $.fn.hide,
			originalText: $.fn.text,
			init: function() {
				$.fn.show = function(...args) {
					if (this.hasClass('unread-badge') && !this.hasClass('user-avatar')) {
						const stack = new Error().stack;
					}
					return window.LMSBadgeWatcher.originalShow.apply(this, args);
				};
				
				$.fn.hide = function(...args) {
					if (this.hasClass('unread-badge') && !this.hasClass('user-avatar')) {
						const stack = new Error().stack;
					}
					return window.LMSBadgeWatcher.originalHide.apply(this, args);
				};
				
				$.fn.text = function(...args) {
					if (args.length > 0 && this.hasClass('unread-badge') && !this.hasClass('user-avatar')) {
						const stack = new Error().stack;
					}
					return window.LMSBadgeWatcher.originalText.apply(this, args);
				};
			}
		};
		window.LMSBadgeWatcher.init();
	}

	window.LMSGlobalBadgeManager = {
		setState: function(value, source = 'unknown') {
			let normalizedValue = value;
			if (value === null || value === undefined || value === '' || isNaN(value)) {
				normalizedValue = 0;
			} else {
				normalizedValue = parseInt(value) || 0;
			}
			
			if (normalizedValue < 0) {
				normalizedValue = 0;
			}
			
			const timestamp = Date.now();
			const $badges = $('.chat-icon-wrapper .chat-icon .unread-badge, .chat-icon .unread-badge, .header-chat-icon .unread-badge, .header-container .chat-icon .unread-badge')
				.not('.user-avatar .unread-badge');
				
			if ($badges.length === 0) {
				return false;
			}
			
			const currentValue = parseInt($badges.first().text()) || 0;
			const isCurrentlyVisible = $badges.first().is(':visible');
			if (window.LMSManualBadgeValue !== undefined) {
				return false;
			}
			
			if (window.LMSBadgeUpdateBlocked) {
				return false;
			}
			
			if (currentValue === 0 && !isCurrentlyVisible && normalizedValue > 0) {
				return false;
			}
			
			if (normalizedValue > 0) {
				$badges.text(normalizedValue);
				$badges.removeAttr('style');
				$badges.removeClass('unread-badge-hide');
				$badges.addClass('visible show has-content');
			} else {
				$badges.text('');
				$badges.html('');
				$badges.removeAttr('style');
				$badges.removeClass('visible show has-content');
				$badges.addClass('unread-badge-hide');
			}
			
			return true;
		}
	};

	window.LMSChatBadgeManager = {
		protectionUntil: 0,
		currentState: { visible: false, text: '', element: null },
		initialized: false,
		isProtected: () => Date.now() < window.LMSChatBadgeManager.protectionUntil,
		extend: (seconds) => {
			window.LMSChatBadgeManager.protectionUntil = Date.now() + (seconds * 1000);
		},
		initialize: () => {
			if (window.LMSChatBadgeManager.initialized) return;
			const $badge = window.LMSChatBadgeManager.getBadgeElement();
			if ($badge && $badge.length > 0) {
				const currentState = {
					visible: $badge.is(':visible'),
					text: $badge.text(),
					element: $badge
				};
				window.LMSChatBadgeManager.currentState = currentState;
				if (currentState.visible && currentState.text) {
					window.LMSChatInitialBadgeState = {
						visible: currentState.visible,
						text: currentState.text,
						timestamp: Date.now(),
						fromDOMInit: true
					};
				}
				window.LMSChatBadgeManager.extend(180);
			}
			window.LMSChatBadgeManager.initialized = true;
		},
		updateBadge: (text, force = false) => {
			return window.LMSGlobalBadgeManager.setState(text, 'LMSChatBadgeManager');
		},
		updateBadgeOld: (text, force = false) => {
			const now = Date.now();
			const isProtected = now < window.LMSChatBadgeManager.protectionUntil;
			if (!force && window.LMSSimpleNewmarkSystem && typeof window.LMSSimpleNewmarkSystem.isProtectionActive === 'function') {
				if (window.LMSSimpleNewmarkSystem.isProtectionActive()) {
					return false;
				}
			}
			if (isProtected && !force && window.LMSChatBadgeManager.initialized) {
				return false;
			}
			const $badge = window.LMSChatBadgeManager.getBadgeElement();
			if (!$badge || $badge.length === 0) return false;
			
			const currentValue = parseInt($badge.text()) || 0;
			const newValue = parseInt(text) || 0;
			
			if (currentValue > 0 && newValue < currentValue) {
				if (!window.LMSBadgeUpdateBlocked) {
					window.LMSBadgeUpdateBlocked = true;
					
					if (window.LMSBadgeBlockTimer) {
						clearTimeout(window.LMSBadgeBlockTimer);
					}
					
					window.LMSBadgeBlockTimer = setTimeout(() => {
						window.LMSBadgeUpdateBlocked = false;
					}, 40000);
				}
			}
			
			if (newValue === 0 && currentValue > 0) {
				text = '';
			}
			const badgeExists = $('.header-container .chat-icon-wrapper .chat-icon .unread-badge, .header-container .chat-icon .unread-badge, .chat-icon .unread-badge').length > 0;
			if (!badgeExists) {
				const $chatIcon = $('.header-container .chat-icon-wrapper .chat-icon, .header-container .chat-icon, #header-chat-icon, .header-chat-button, .chat-icon');
				if ($chatIcon.length > 0) {
					$chatIcon.append('<span class="unread-badge"></span>');
				}
			}
			if (window.LMSChatBadgeController && window.LMSChatBadgeController.isLocked()) {
				return false;
			}
			if (window.LMSChatUnreadMarkManagerBlocking || window.LMSChatUnreadMarkManagerSyncing) {
				return false;
			}
			if ($badge.attr('data-source') === 'unified-sync') {
				return true;
			}
			if (text && parseInt(text) > 0) {
				badgeShow($badge, text);
				window.LMSChatBadgeManager.currentState = { visible: true, text: text, element: $badge };
			} else {
				badgeHide($badge);
				window.LMSChatBadgeManager.currentState = { visible: false, text: '', element: $badge };
			}
			return true;
		},
		getBadgeElement: () => {
			let $badge = $('.header-container .chat-icon-wrapper .chat-icon .unread-badge, .header-container .chat-icon .unread-badge, .chat-icon .unread-badge');
			if ($badge.length === 0) {
				const $chatIcon = $('.header-container .chat-icon-wrapper .chat-icon, .header-container .chat-icon, #header-chat-icon, .header-chat-button, .chat-icon');
				if ($chatIcon.length > 0) {
					$chatIcon.append('<span class="unread-badge"></span>');
					$badge = $('.header-container .chat-icon-wrapper .chat-icon .unread-badge, .header-container .chat-icon .unread-badge, .chat-icon .unread-badge');
				}
			}
			return $badge;
		},
		getCurrentState: () => {
			const $badge = window.LMSChatBadgeManager.getBadgeElement();
			if ($badge && $badge.length > 0) {
				return {
					visible: $badge.is(':visible'),
					text: $badge.text(),
					element: $badge
				};
			}
			return { visible: false, text: '', element: null };
		}
	};
	window.LMSChatBadgeProtection = window.LMSChatBadgeManager;
	let initialBadgeState = null;
	const saveInitialBadgeState = () => {
		const $headerBadge = $('.header-container .chat-icon .unread-badge');
		if ($headerBadge.length > 0 && !initialBadgeState) {
			initialBadgeState = {
				visible: $headerBadge.is(':visible'),
				text: $headerBadge.text(),
				element: $headerBadge
			};
			window.LMSChatInitialBadgeState = {
				visible: initialBadgeState.visible,
				text: initialBadgeState.text,
				timestamp: Date.now()
			};
		}
	};
	const startBadgeProtectionWatcher = () => {
		if (window.LMSChatBadgeWatcherStarted) return;
		window.LMSChatBadgeWatcherStarted = true;
	};
	if (!window.LMSChatInitialBadgeState) {
		const attemptEarlySave = () => {
			const $headerBadge = $('.header-container .chat-icon .unread-badge');
			if ($headerBadge.length > 0) {
				const isVisible = $headerBadge.is(':visible');
				const text = $headerBadge.text();
				window.LMSChatInitialBadgeState = {
					visible: isVisible,
					text: text,
					timestamp: Date.now()
				};
				startBadgeProtectionWatcher();
			} else {
				if (window.lmsChat && window.lmsChat.hasUnread) {
					window.LMSChatInitialBadgeState = {
						visible: true,
						text: '1',
						timestamp: Date.now(),
						assumedFromData: true
					};
				}
				setTimeout(attemptEarlySave, 10);
			}
		};
		attemptEarlySave();
	}
	const showMembersModal = (members) => {
		const $membersList = $('.members-list');
		$membersList.empty();
		members.forEach((member) => {
			const avatarUrl =
				member.avatar_url || utils.getAssetPath('wp-content/themes/lms/img/default-avatar.png');
			const memberHtml = `
                <div class="member-item">
                    <div class="member-avatar">
                        <img src="${avatarUrl}" alt="${utils.escapeHtml(member.display_name)}">
                    </div>
                    <div class="member-name">${utils.escapeHtml(member.display_name)}</div>
                </div>`;
			$membersList.append(memberHtml);
		});
		$('#members-modal').fadeIn(200);
	};
	const updateChannelBadge = (channelId, count) => {
		if (channelId === 'channels' || channelId === 'total') {
			if (!state.unreadCounts) {
				state.unreadCounts = {};
			}
			state.unreadCounts[channelId] = count;
			updateHeaderUnreadBadge(state.unreadCounts);
			return;
		}
		const $channel = $(`.channel-item[data-channel-id="${channelId}"]`);
		if ($channel.length === 0) {
			const allChannels = $('.channel-item');
			allChannels.each(function() {
				const id = $(this).data('channel-id');
			});
		}
		if (!$channel.length) {
			if (!state.unreadCounts) {
				state.unreadCounts = {};
			}
			state.unreadCounts[channelId] = count;
			updateHeaderUnreadBadge(state.unreadCounts);
			return;
		}
		if (utils.isChannelMuted(channelId)) {
			$channel.find('.unread-badge').not('.header-container .unread-badge').remove();
			if ($channel.find('.mute-icon').length === 0) {
				const muteIconPath = utils.getAssetPath('wp-content/themes/lms/img/icon-mute.svg');
				const $muteIcon = $(`<span class="mute-icon" title="ミュート中">
                    <img src="${muteIconPath}" alt="ミュート" width="16" height="16">
                </span>`);
				$channel.append($muteIcon);
			}
			$channel.addClass('muted');
		} else {
			$channel.find('.mute-icon').remove();
			let $badge = $channel.find('.unread-badge');
			if (count > 0) {
				if ($badge.length === 0) {
					$badge = $('<span class="unread-badge"></span>');
					$channel.append($badge);
				}
				if ($badge.attr('data-source') === 'unified-sync') {
					return;
				}
				$badge.text(count).show();
				$channel.addClass('has-unread');
			} else {
				if ($badge.attr('data-source') === 'unified-sync') {
					return;
				}
				if (!$badge.closest('.header-container').length) {
					$badge.remove();
				}
				$channel.removeClass('has-unread');
			}
			$channel.removeClass('muted');
		}
	};
	const updateHeaderUnreadBadge = (counts) => {
		const caller = new Error().stack?.split('\n')[2]?.trim();
		if (!counts || Object.keys(counts).length === 0) {
			return;
		}
		const totalUnread = Object.entries(counts).reduce((total, [channelId, count]) => {
			if (!utils.isChannelMuted(channelId)) {
				return total + parseInt(count || 0);
			}
			return total;
		}, 0);
		const success = window.LMSChatBadgeManager.updateBadge(totalUnread.toString());
		if (!success) {
		}
		Object.entries(counts).forEach(([channelId, count]) => {
			updateChannelBadgeDisplay(channelId, parseInt(count || 0));
		});
		$('.channel-item[data-channel-id], .channel-item[data-channel]').each(function() {
			const $item = $(this);
			const channelId = $item.data('channel-id') || $item.data('channel');
			if (channelId && counts.hasOwnProperty(channelId)) {
				updateChannelBadgeDisplay(channelId, parseInt(counts[channelId] || 0));
			}
		});
		const isProtected = window.LMSChatBadgeManager?.isProtected();
		const currentBadgeState = window.LMSChatBadgeManager?.getCurrentState();
		const headerHasUnread = currentBadgeState?.visible && parseInt(currentBadgeState?.text || 0) > 0;
		
		if (window.LMSBadgeUpdateBlocked) {
			return;
		}
		
		if (isProtected) {
			if (window.LMSDelayedUpdateInProgress) {
				return;
			}
			window.LMSDelayedUpdateInProgress = true;
			setTimeout(() => {
				if (window.LMSBadgeUpdateBlocked) {
					window.LMSDelayedUpdateInProgress = false;
					return;
				}
				
				$.ajax({
					url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
					type: 'POST',
					data: {
						action: 'lms_get_unread_count',
						nonce: window.lmsChat?.nonce
					},
					timeout: 30000,
					success: function(response) {
						if (!response) {
							return;
						}
						let channelData = null;
						try {
							if (response.success && response.data && response.data.channels) {
								channelData = response.data.channels;
							}
							else if (response.success && response.data && typeof response.data === 'object') {
								channelData = response.data;
							}
							else if (typeof response === 'object' && !response.success) {
								channelData = response;
							}
							else if (response.success) {
								return;
							}
							else {
								return;
							}
						} catch (parseError) {
							return;
						}
						if (channelData && typeof channelData === 'object') {
							const allChannelElements = $('.channel-item[data-channel-id]');
							const existingChannelIds = [];
							allChannelElements.each(function() {
								const channelId = $(this).data('channel-id');
								if (channelId) {
									existingChannelIds.push(channelId.toString());
								}
							});
							existingChannelIds.forEach(channelId => {
								if (!channelData.hasOwnProperty(channelId)) {
									const $existingBadge = $(`.channel-item[data-channel-id="${channelId}"] .unread-badge`);
									if ($existingBadge.length > 0 && $existingBadge.is(':visible')) {
										const existingCount = parseInt($existingBadge.text()) || 0;
										if (existingCount > 0) {
											channelData[channelId] = existingCount;
										} else {
											channelData[channelId] = 0;
										}
									} else {
										channelData[channelId] = 0;
									}
								}
							});
							if (Object.keys(channelData).length === 0) {
								$('.channel-item .unread-badge').each(function() {
									badgeHide($(this));
								});
								window.LMSChatBadgeManager.updateBadge('', true);
								return;
							}
							Object.entries(channelData).forEach(([channelId, count]) => {
								updateChannelBadgeDisplay(channelId, parseInt(count || 0));
							});
							
							const freshTotalUnread = Object.entries(channelData).reduce((total, [channelId, count]) => {
								if (channelId === 'total' || channelId === 'channels' || isNaN(parseInt(channelId))) {
									return total;
								}
								if (!utils.isChannelMuted(channelId)) {
									const countValue = parseInt(count || 0);
									return total + countValue;
								}
								return total;
							}, 0);
							
							if (!window.LMSBadgeUpdateBlocked) {
								const $headerBadge = $('.chat-icon-wrapper .chat-icon .unread-badge, .chat-icon .unread-badge, .header-chat-icon .unread-badge')
									.not('.user-avatar .unread-badge');
								const currentBadgeValue = parseInt($headerBadge.first().text()) || 0;
								
								if (window.LMSManualBadgeValue !== undefined) {
									
									if (window.LMSManualBadgeValue < freshTotalUnread) {
										return;
									}
								}
								
								if (freshTotalUnread === 0 && !$headerBadge.first().is(':visible')) {
									window.LMSLastZeroUpdateTime = Date.now();
								} 
								else if (freshTotalUnread < currentBadgeValue) {
								}
								else {
									const freshSuccess = window.LMSChatBadgeManager.updateBadge(freshTotalUnread.toString(), true);
								}
							} else {
							}
							state.unreadCounts = channelData;
						} else {
						}
					},
					error: function(xhr, status, error) {
						if (status === 'timeout' || (xhr && xhr.status === 502)) {
							if (!window.LMSChatRetryCount) {
								window.LMSChatRetryCount = 0;
							}
							if (window.LMSChatRetryCount < 3) {
								window.LMSChatRetryCount++;
								const retryDelay = 3000 * Math.pow(2, window.LMSChatRetryCount - 1);
								setTimeout(() => {
									updateHeaderUnreadBadge();
								}, retryDelay);
							} else {
								window.LMSChatRetryCount = 0;
							}
						} else {
							window.LMSChatRetryCount = 0;
						}
					},
					complete: function() {
						window.LMSDelayedUpdateInProgress = false;
					}
				});
			}, 500);
		}
		window.LMSChatBadgeLastKnownState = {
			text: totalUnread > 0 ? totalUnread.toString() : '',
			visible: totalUnread > 0
		};
	};
	const updateChannelBadgeDisplay = (channelId, count) => {
		if (channelId === 'channels' || channelId === 'total') {
			return false;
		}
		const $channelElement = $(`.channel-item[data-channel-id="${channelId}"], .channel-item[data-channel="${channelId}"]`);
		if ($channelElement.length === 0) {
			return false;
		}
		let $badge = $channelElement.find('.unread-badge');
		if ($badge.length === 0) {
			$badge = $('<span class="unread-badge"></span>');
			$channelElement.append($badge);
		}
		if ($badge.attr('data-source') === 'unified-sync') {
			return true;
		}
		if (count === 0 || !count) {
			badgeHide($badge);
		} else {
			badgeShow($badge, count);
		}
		return true;
	};
	const switchChannel = async (channelId, callback) => {
		if (window.LMSChatBadgeController && window.LMSChatBadgeController.startChannelSwitch) {
			window.LMSChatBadgeController.startChannelSwitch();
		}
		if (!channelId) {
				if (typeof callback === 'function') {
				callback(false);
			}
			return;
		}
		const numChannelId = parseInt(channelId, 10);
		const currentNumChannelId = parseInt(state.currentChannel, 10) || 0;
		updateBadgesFromDatabase();
		disableAvatarBadges();
		if (window.lmsUnifiedSync && window.lmsUnifiedSync.switchChannel) {
			window.lmsUnifiedSync.switchChannel(numChannelId);
		}
		if (numChannelId === currentNumChannelId) {
			if (typeof callback === 'function') {
				callback(true);
			}
			return;
		}
		const $messageContainer = $('#chat-messages');
		$messageContainer.empty();
		$messageContainer.html('');
		const messageContainer = document.getElementById('chat-messages');
		if (messageContainer) {
			messageContainer.innerHTML = '';
		}
		const $loadingIndicator = $(
			'<div class="loading-indicator"><div class="spinner"></div><p>メッセージを読み込んでいます...</p></div>'
		);
		$messageContainer.append($loadingIndicator);
		$messageContainer[0].offsetHeight;
		try {
			if (window.LMSChat && window.LMSChat.LongPoll) {
				const currentLongPollChannel = window.LMSChat.LongPoll.getStats?.()?.channelId || 0;
				if (currentLongPollChannel !== numChannelId) {
					window.LMSChat.LongPoll.disconnect();
					window.LMSChat.LongPoll._isChannelSwitching = true;
				} else {
				}
			}
			state.isChannelSwitching = true;
			state.currentChannel = numChannelId;
			state.lastMessageId = 0;
			state.isChannelLoaded = state.isChannelLoaded || {};
			Object.keys(state.isChannelLoaded).forEach(key => {
				if (parseInt(key) !== numChannelId) {
					delete state.isChannelLoaded[key];
				}
			});
			if (state.unreadCounts && state.unreadCounts[numChannelId] > 0) {
				state.unreadCounts[numChannelId] = 0;
				updateChannelBadge(numChannelId, 0);
				badgeProtectionUntil = 0;
				if (state.unreadCounts && Object.keys(state.unreadCounts).length > 0) {
					updateHeaderUnreadBadge(state.unreadCounts);
				}
			}
			if (window.lmsChat) {
				window.lmsChat.currentChannel = numChannelId;
				window.lmsChat.currentChannelId = numChannelId;
			}
			$('.channel-item').removeClass('active');
			$(`.channel-item[data-channel-id="${numChannelId}"]`).addClass('active');
			const $channelItem = $(`.channel-item[data-channel-id="${numChannelId}"]`);
			if ($channelItem.length) {
				const channelName = $channelItem.find('.channel-name span').text();
				const isPrivate = $channelItem.find('.channel-icon').attr('src').includes('lock');
				$('#current-channel-name .channel-header-text').text(channelName);
				$('#current-channel-name .channel-header-icon').show();
				$('#current-channel-name .icon-hash').toggle(!isPrivate);
				$('#current-channel-name .icon-lock').toggle(isPrivate);
			}
			$('#chat-input').prop('disabled', false).val('');
			$('.send-button').prop('disabled', true);
			try {
				const response = await $.ajax({
					url: window.lmsChat.ajaxUrl,
					type: 'GET',
					data: {
						action: 'lms_get_channel_members',
						channel_id: numChannelId,
						nonce: window.lmsChat.nonce,
					},
					timeout: 30000,
				});
				if (response.success) {
					const memberCount = response.data.length;
					$('.channel-members-count')
						.text(`${memberCount}人`)
						.data('channel-id', numChannelId)
						.show();
				}
			} catch (error) {
			}
			if (window.LMSChat && window.LMSChat.cache) {
				if (typeof window.LMSChat.cache.clearAllCache === 'function') {
					window.LMSChat.cache.clearAllCache();
				} else if (typeof window.LMSChat.cache.clearMessagesCache === 'function') {
					window.LMSChat.cache.clearMessagesCache(numChannelId);
				}
			}
			if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.clearMessageHtmlCache) {
				try {
					window.LMSChat.messages.clearMessageHtmlCache();
				} catch (error) {
				}
			}
			let messagesLoaded = false;
			let retryCount = 0;
			const maxRetries = 2;
			const loadMessages = async () => {
				try {
					if (state.currentChannel !== numChannelId) {
						state.currentChannel = numChannelId;
					}
					const ajaxOptions = {
						timeout: 90000, // 90秒に延長（遅い読み込み対応）
						maxRetries: 3,
						retryDelay: 2000,
					};
					let retryCount = 0;
					const maxRetries = 50;
					while (!window.LMSChat?.messages?.getMessages && retryCount < maxRetries) {
						await new Promise(resolve => setTimeout(resolve, 100));
						retryCount++;
						if (retryCount % 10 === 0) {
						}
					}
					let messagesResponse;
					if (!window.LMSChat || !window.LMSChat.messages || !window.LMSChat.messages.getMessages) {
						messagesResponse = await $.ajax({
							url: window.lmsChat.ajaxUrl,
							type: 'GET',
							data: {
								action: 'lms_get_messages',
								channel_id: numChannelId,
								page: 1,
								nonce: window.lmsChat.nonce
							},
							beforeSend: function() {
							},
							timeout: ajaxOptions.timeout || 30000 // 30秒に延長
						});
					} else {
						messagesResponse = await window.LMSChat.messages.getMessages(numChannelId, 1, ajaxOptions);
					}
					$('#chat-messages .loading-indicator').remove();
					if (messagesResponse && messagesResponse.success) {
						if (state.currentChannel !== numChannelId) {
							state.currentChannel = numChannelId;
						}
						const $messageContainer = $('#chat-messages');
						$messageContainer.empty();
						let hasMessages = false;
						// サーバー応答遅延対応：段階的チェックで確実判定
						if (messagesResponse && messagesResponse.success !== false) {
							if (messagesResponse.data && messagesResponse.data.messages) {
								// 基本チェック：配列が存在し空でない
								hasMessages = Array.isArray(messagesResponse.data.messages) && messagesResponse.data.messages.length > 0;
								
								// 詳細チェック：実際にメッセージが含まれているか
								if (hasMessages) {
									hasMessages = messagesResponse.data.messages.some(group => 
										group && 
										Array.isArray(group.messages) && 
										group.messages.length > 0 &&
										group.messages.some(msg => msg && msg.id)
									);
								}
							}
							// サーバー応答が部分的でも、成功レスポンスなら少し待つ
							else if (messagesResponse.success === true) {
								// 遅延読み込み中の可能性があるため、hasMessages = true とする
								hasMessages = true;
							}
						}
						if (!window.LMSChat?.messages?.displayMessages) {
							if (hasMessages) {
								let html = '';
								try {
									if (messagesResponse.data && messagesResponse.data.messages) {
										messagesResponse.data.messages.forEach(group => {
											if (group && group.messages && Array.isArray(group.messages) && group.messages.length > 0) {
												html += `<div class="message-group">`;
												if (group.date) {
													html += `<div class="date-separator">${group.date}</div>`;
												}
												group.messages.forEach(msg => {
													if (msg && msg.id) {
														html += `<div class="message-item" data-message-id="${msg.id}">
															<strong>${msg.display_name || 'Unknown'}:</strong> ${msg.message}
															<span class="message-time">${msg.formatted_time}</span>
														</div>`;
													}
												});
												html += `</div>`;
											}
										});
									}
								} catch (error) {
									// レンダリングエラー時はリトライ待機
									html = '';
								}
								$messageContainer.html(html);
								
								// サーバー応答遅延対応：HTMLが空の場合は追加待機
								if (html.trim() === '' && hasMessages) {
									// 読み込み中表示を維持
									$messageContainer.html('<div class="loading-indicator"><div class="spinner"></div><span>メッセージを読み込んでいます...</span></div>');
									
									// 追加待機後に再チェック
									setTimeout(() => {
										// 再度メッセージ取得を試行
										const $currentMessages = $('#chat-messages .chat-message, #chat-messages .message-item');
										if ($currentMessages.length === 0) {
											// 本当にメッセージがない場合のみ表示
											if (!messagesResponse.data || !messagesResponse.data.messages || messagesResponse.data.messages.length === 0) {
												$messageContainer.html('<div class="no-messages">このチャンネルにはまだメッセージがありません</div>');
											}
										}
									}, 3000); // 3秒追加待機
								}
								
								setTimeout(() => {
									if (window.UnifiedScrollManager) {
										window.UnifiedScrollManager.scrollToBottom(0, false, 'channel-switch');
										
										setTimeout(() => {
											window.UnifiedScrollManager.scrollToBottom(0, false, 'channel-switch-fallback');
										}, 100);
										
										setTimeout(() => {
											window.UnifiedScrollManager.scrollToBottom(0, false, 'channel-switch-final');
										}, 300);
									} else if (window.scrollToBottom && typeof window.scrollToBottom === 'function') {
										window.scrollToBottom(0, true);
									} else {
										$messageContainer.scrollTop($messageContainer[0].scrollHeight);
									}
									setTimeout(() => {
										if (window.LMSChat.state) {
											window.LMSChat.state.isChannelSwitching = false;
										}
									}, 100);
								}, 200);
							} else {
								$messageContainer.html('<div class="no-messages">このチャンネルにはまだメッセージがありません</div>');
								setTimeout(() => {
									if (window.LMSChat.state) {
										window.LMSChat.state.isChannelSwitching = false;
									}
								}, 100);
							}
						} else {
							await window.LMSChat.messages.displayMessages(messagesResponse.data, true, true);
							
							// 読み込み完了後の遅延チェック（遅い読み込み対応）
							setTimeout(() => {
								const $messages = $('#chat-messages .chat-message, #chat-messages .message-item');
								if ($messages.length === 0) {
									// 再度データをチェックして、本当にメッセージがないか確認
									const actuallyHasMessages = messagesResponse.data && 
																messagesResponse.data.messages && 
																messagesResponse.data.messages.length > 0;
									
									if (!actuallyHasMessages) {
										$messageContainer.html('<div class="no-messages">このチャンネルにはまだメッセージがありません</div>');
									}
								} else {
									const $wrongChannelMessages = $(`.chat-message[data-channel-id]:not([data-channel-id="${numChannelId}"])`);
									if ($wrongChannelMessages.length > 0) {
										$wrongChannelMessages.remove();
									}
									setTimeout(() => {
										if (window.scrollToBottom && typeof window.scrollToBottom === 'function') {
											window.scrollToBottom(0, true);
										} else {
											const $messageContainer = $('#chat-messages');
											if ($messageContainer.length > 0) {
												$messageContainer.scrollTop($messageContainer[0].scrollHeight);
											}
										}
										setTimeout(() => {
											if (window.LMSChat.state) {
												window.LMSChat.state.isChannelSwitching = false;
											}
										}, 100);
									}, 200);
								}
							}, 100);
						}
						messagesLoaded = true;
						// 基本ロングポーリング接続開始
						const longPollAPI = window.LMSLongPoll || window.LMSChat?.LongPoll;
						if (longPollAPI && typeof longPollAPI.connect === 'function') {
							setTimeout(() => {
								try {
									longPollAPI.connect(numChannelId);
								} catch (error) {
								}
							}, 100);
						} else {
						}
						return true;
					} else {
						// サーバー応答遅延やエラー時の処理改善
						$('#chat-messages .loading-indicator').remove();
						const $messageContainer = $('#chat-messages');
						
						// サーバー応答遅延の可能性を考慮した処理
						if (!messagesResponse) {
							// 応答がない場合：ネットワーク遅延の可能性
							$messageContainer.html('<div class="loading-message">サーバーからの応答を待っています...</div>');
							
							// 追加待機後に再判定
							setTimeout(() => {
								// 追加の待機後、本当にメッセージがないか最終確認
								const $existingMessages = $('#chat-messages .chat-message, #chat-messages .message-item');
								if ($existingMessages.length === 0) {
									$messageContainer.html('<div class="no-messages">このチャンネルにはまだメッセージがありません</div>');
								}
							}, 5000); // 5秒待機
						} else if (messagesResponse.success === false) {
							// 明示的なエラーレスポンスの場合
							$messageContainer.html('<div class="error-message">メッセージの読み込みでエラーが発生しました</div>');
						} else {
							// その他の場合（部分的なレスポンス等）
							$messageContainer.html('<div class="no-messages">このチャンネルにはまだメッセージがありません</div>');
						}
						
						messagesLoaded = true;
						setTimeout(() => {
							if (window.LMSChat.state) {
								window.LMSChat.state.isChannelSwitching = false;
							}
						}, 100);
						return true;
					}
				} catch (error) {
					if (retryCount < maxRetries) {
						retryCount++;
						let delay;
						if (error.status === 502 || error.status === 504) {
							delay = 5000 * retryCount;
						} else {
							delay = 1000 * retryCount;
						}
						$('#chat-messages .loading-indicator p')
							.text(`メッセージを読み込んでいます...(リトライ ${retryCount}/${maxRetries} - ${Math.round(delay/1000)}秒後)`);
						await new Promise((resolve) => setTimeout(resolve, delay));
						return await loadMessages();
					}
					$('#chat-messages .loading-indicator').remove();
					const $messageContainer = $('#chat-messages');
					$messageContainer.html('<div class="no-messages error">メッセージの読み込みに失敗しました<br><span class="retry-hint">ページを再読み込みするか、少し時間をおいて再度お試しください</span></div>');
					if (window.LMSChat.state) {
						window.LMSChat.state.isChannelSwitching = false;
					}
					return false;
				}
			};
			const loadResult = await loadMessages();
			if (typeof callback === 'function') {
				callback(loadResult || messagesLoaded);
			}
			if (window.LMSChatBadgeController && window.LMSChatBadgeController.endChannelSwitch) {
				window.LMSChatBadgeController.endChannelSwitch();
			}
		} catch (error) {
			if (window.LMSChat.state) {
				window.LMSChat.state.isChannelSwitching = false;
			}
			if (window.LMSChatBadgeController && window.LMSChatBadgeController.forceEndChannelSwitch) {
				window.LMSChatBadgeController.forceEndChannelSwitch();
			}
			if (typeof callback === 'function') {
				callback(false);
			}
		}
	};
	const createChannelContextMenu = (channelId, x, y) => {
		$('.channel-context-menu').remove();
		const muted = utils.isChannelMuted(channelId);
		const label = muted ? 'ミュートを解除' : 'チャンネルをミュート';
		const iconPath = muted
			? utils.getAssetPath('wp-content/themes/lms/img/icon-menu-unmute.svg')
			: utils.getAssetPath('wp-content/themes/lms/img/icon-menu-mute.svg');
		const readAllIconPath = utils.getAssetPath('wp-content/themes/lms/img/icon-read-all.svg');
		const $menu = $(`
            <div class="channel-context-menu">
                <ul>
                    <li class="mute-toggle ${muted ? 'muted' : ''}" data-channel-id="${channelId}">
                        <img src="${iconPath}" alt="" class="menu-icon">
                        <span>${label}</span>
                    </li>
                    <li class="mark-all-read" data-channel-id="${channelId}">
                        <img src="${readAllIconPath}" alt="" class="menu-icon">
                        <span>全てを既読にする</span>
                    </li>
                </ul>
            </div>
        `);
		const menuWidth = 200;
		const windowWidth = $(window).width();
		let menuX = x;
		if (x + menuWidth > windowWidth) {
			menuX = x - menuWidth;
		}
		const menuY = y - 50;
		$menu.css({
			top: menuY + 'px',
			left: menuX + 'px',
			position: 'fixed',
		});
		$('body').append($menu);
		$menu.on('click', '.mute-toggle', function (e) {
			e.stopPropagation();
			const channelId = $(this).data('channel-id');
			utils.toggleChannelMute(channelId);
			const count = state.unreadCounts[channelId] || 0;
			updateChannelBadge(channelId, count);
			updateHeaderUnreadBadge(state.unreadCounts);
			$menu.addClass('closing');
			setTimeout(() => $menu.remove(), 200);
		});
		$menu.on('click', '.mark-all-read', function (e) {
			e.stopPropagation();
			const channelId = $(this).data('channel-id');
			const $menuItem = $(this);
			$menuItem.addClass('processing').find('span').text('処理中...');
			if (
				window.LMSChat.messages &&
				typeof window.LMSChat.messages.markChannelAllAsRead === 'function'
			) {
				window.LMSChat.messages
					.markChannelAllAsRead(channelId)
					.then((success) => {
						if (success) {
							utils.showSuccessMessage('すべてのメッセージを既読にしました');
						} else {
							utils.showError('処理に失敗しました');
						}
						$menu.addClass('closing');
						setTimeout(() => $menu.remove(), 200);
					})
					.catch((error) => {
						utils.showError('サーバーとの通信に失敗しました');
						$menu.addClass('closing');
						setTimeout(() => $menu.remove(), 200);
					});
				return;
			}
			let nonce = window.lmsChat.nonce;
			if (!nonce && window.lmsChat && window.lmsChat._nonce) {
				nonce = window.lmsChat._nonce;
			}
			if (!nonce && window.lmsPush && window.lmsPush.nonce) {
				nonce = window.lmsPush.nonce;
			}
			if (!nonce) {
				utils.showError('認証エラーが発生しました');
				$menu.addClass('closing');
				setTimeout(() => $menu.remove(), 200);
				return;
			}
			$.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				timeout: 30000,
				data: {
					action: 'lms_mark_channel_all_as_read',
					nonce: nonce,
					channel_id: channelId,
				},
				success: function (response) {
					if (response.success) {
						updateChannelBadge(channelId, 0);
						$('.thread-info .thread-unread-badge').remove();
						if (state.currentChannel === channelId) {
							$('#chat-messages .chat-message .new-mark').each(function () {
								const $newMark = $(this);
								const $message = $newMark.closest('.chat-message');
								if ($message.length > 0 && !$message.hasClass('viewed-once')) {
									$message.addClass('viewed-once');
								}
							});
							$('#chat-messages .chat-message.viewed-once .new-mark').fadeOut(300, function () {
								$(this).remove();
							});
							if (state.currentThread) {
								$('.thread-messages .thread-message .new-mark').each(function () {
									const $newMark = $(this);
									const $message = $newMark.closest('.thread-message');
									if ($message.length > 0 && !$message.hasClass('viewed-once')) {
										$message.addClass('viewed-once');
									}
								});
								$('.thread-messages .thread-message.viewed-once .new-mark').fadeOut(
									300,
									function () {
										$(this).remove();
									}
								);
							}
						}
						window.LMSChat.messages.updateUnreadCounts();
						if (
							window.LMSChat.messages &&
							typeof window.LMSChat.messages.updateAllThreadInfo === 'function'
						) {
							window.LMSChat.messages.updateAllThreadInfo();
						}
						utils.showSuccessMessage('すべてのメッセージを既読にしました');
					} else {
						utils.showError('処理に失敗しました');
					}
					$menu.addClass('closing');
					setTimeout(() => $menu.remove(), 200);
				},
				error: function (xhr, status, error) {
					utils.showError('サーバーとの通信に失敗しました');
					$menu.addClass('closing');
					setTimeout(() => $menu.remove(), 200);
				},
			});
		});
		$(document).one('click', function () {
			$menu.addClass('closing');
			setTimeout(() => $menu.remove(), 200);
		});
		$(document).one('keydown', function (e) {
			if (e.key === 'Escape') {
				$menu.addClass('closing');
				setTimeout(() => $menu.remove(), 200);
			}
		});
	};
	const setupEventListeners = () => {
		disableAvatarBadges();
		$(document).on('click', '.channel-item', function () {
			const channelId = parseInt($(this).data('channel-id'), 10);
			const currentChannelId = parseInt(state.currentChannel, 10) || 0;
			if (channelId === currentChannelId) {
				return;
			}
			clearAllBadgesImmediately();
			updateBadgesFromDatabase();
			const $messageContainer = $('#chat-messages');
			$messageContainer.empty();
			$messageContainer.html('');
			const messageContainer = document.getElementById('chat-messages');
			if (messageContainer) {
				messageContainer.innerHTML = '';
			}
			const $loadingIndicator = $('<div class="loading-indicator"><div class="spinner"></div><p>メッセージを読み込んでいます...</p></div>');
			$messageContainer.append($loadingIndicator);
			$messageContainer[0].offsetHeight;
				switchChannel(channelId);
		});
		$(document).on('click', '.channel-members-count', function (e) {
			e.preventDefault();
			e.stopPropagation();
			const channelId = $(this).data('channel-id');
			$.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'GET',
				data: {
					action: 'lms_get_channel_members',
					channel_id: channelId,
					nonce: window.lmsChat.nonce,
				},
				success: function (response) {
					if (response.success) {
						showMembersModal(response.data);
					} else {
						utils.showError('メンバー情報の取得に失敗しました。');
					}
				},
				error: function () {
					utils.showError('メンバー情報の取得に失敗しました。');
				},
			});
		});
		$('.close-modal').on('click', function () {
			$('#members-modal').fadeOut(200);
		});
		$(document).on('click', '#members-modal', function (e) {
			if ($(e.target).is('#members-modal')) {
				$('#members-modal').fadeOut(200);
			}
		});
		$(document).on('keydown', function (e) {
			if (e.key === 'Escape' && $('#members-modal').is(':visible')) {
				$('#members-modal').fadeOut(200);
			}
		});
		$(document).on('contextmenu', '.channel-item', function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $channel = $(this);
			const channelId = $channel.data('channel-id');
			createChannelContextMenu(channelId, e.pageX, e.pageY);
		});
	};
	const incrementUnreadBadge = (channelId = null) => {
		const targetChannelId = channelId || state.currentChannel;
		if (!targetChannelId) {
			return;
		}
		if (!state.unreadCounts) {
			state.unreadCounts = {};
		}
		state.unreadCounts[targetChannelId] = (state.unreadCounts[targetChannelId] || 0) + 1;
		updateChannelBadge(targetChannelId, state.unreadCounts[targetChannelId]);
		badgeProtectionUntil = 0;
		window.LMSChatBadgeManager.protectionUntil = 0;
		$.ajax({
			url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
			type: 'POST',
			data: {
				action: 'lms_get_unread_count',
				nonce: window.lmsChat?.nonce
			},
			success: function(response) {
				if (response.success && response.data) {
					updateAllBadgesFromServerData(response.data);
				}
			},
			error: function() {
			}
		});
	};
	const updateBadgesFromDatabase = () => {
		if (window.LMSBadgeUpdateBlocked) {
			return;
		}
		
		const currentBadges = $('.unread-badge:visible').map(function() {
			return $(this).text() + ' (' + this.className + ')';
		}).get();
		const stackTrace = new Error().stack;
		if (!window.lmsChat || !window.lmsChat.ajaxUrl) {
			return;
		}
		$.ajax({
			url: window.lmsChat.ajaxUrl,
			type: 'POST',
			data: {
				action: 'lms_get_unread_count',
				nonce: window.lmsChat.nonce,
				force_refresh: true,
				timestamp: Date.now(),
				cache_buster: Math.random()
			},
			timeout: 30000,
			cache: false,
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0'
			},
			success: function(response) {
				if (window.LMSBadgeUpdateBlocked) {
					return;
				}
				
				if (response && response.success && response.data) {
					const totalUnread = response.data.total_unread || response.data.total || 0;
					const channelUnread = response.data.channels || {};
					updateHeaderBadgeWithValue(totalUnread);
					updateChannelBadgesWithValues(channelUnread);
				} else {
				}
			},
			error: function(xhr, status, error) {
			}
		});
	};
	const updateHeaderBadgeWithValue = (count) => {
		if (window.LMSBadgeUpdateBlocked) {
			return;
		}
		
		if (window.LMSSimpleNewmarkSystem && typeof window.LMSSimpleNewmarkSystem.isProtectionActive === 'function') {
			if (window.LMSSimpleNewmarkSystem.isProtectionActive()) {
				return;
			}
		}
		const $headerBadges = $('.header-chat-icon .unread-badge, .chat-icon .unread-badge')
			.not('.user-avatar .unread-badge, .header .user-avatar .unread-badge, .header-container .user-avatar .unread-badge, [class*="user-avatar"] .unread-badge');
		if (count > 0) {
			if ($headerBadges.length === 0) {
				const $chatIcon = $('.header-chat-icon, .chat-icon');
				if ($chatIcon.length > 0) {
					$chatIcon.append(`<span class="unread-badge">${count}</span>`);
				}
			} else {
				$headerBadges.text(count).show();
			}
		} else {
			$headerBadges.hide().text('');
		}
	};
	const updateChannelBadgesWithValues = (channelUnread) => {
		if (window.LMSBadgeUpdateBlocked) {
			return;
		}
		
		if (window.LMSSimpleNewmarkSystem && typeof window.LMSSimpleNewmarkSystem.isProtectionActive === 'function') {
			if (window.LMSSimpleNewmarkSystem.isProtectionActive()) {
				return;
			}
		}
		$('.channel-item').each(function() {
			const $channelItem = $(this);
			const channelId = $channelItem.attr('data-channel-id');
			const $badge = $channelItem.find('.unread-badge');
			if (channelId && channelUnread[channelId] !== undefined) {
				const count = parseInt(channelUnread[channelId]) || 0;
				if (count > 0) {
					if ($badge.length === 0) {
						$channelItem.append(`<span class="unread-badge">${count}</span>`);
					} else {
						$badge.text(count).show();
					}
				} else {
					$badge.hide().text('');
				}
			} else {
				$badge.hide().text('');
			}
		});
	};
	const clearAllBadgesImmediately = () => {
		$('.unread-badge').hide().text('').css('display', 'none');
	};
	const disableAvatarBadges = () => {
		const avatarSelectors = [
			'.header .user-avatar .unread-badge',
			'.header-container .user-avatar .unread-badge', 
			'[class*="user-avatar"] .unread-badge',
			'.user-avatar2 .unread-badge',
			'.user-menu-wrapper .unread-badge',
			'.user-menu-button .unread-badge'
		];
		avatarSelectors.forEach(selector => {
			$(selector).remove();
		});
		setInterval(() => {
			avatarSelectors.forEach(selector => {
				$(selector).remove();
			});
		}, 1000);
	};
	const decrementUnreadBadge = (channelId = null) => {
		$.ajax({
			url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
			type: 'POST',
			data: {
				action: 'lms_get_unread_count',
				nonce: window.lmsChat?.nonce
			},
			success: function(response) {
				if (response.success && response.data) {
					updateAllBadgesFromServerData(response.data);
				}
			},
			error: function() {
			}
		});
	};
	const loadInitialUnreadCounts = async () => {
		if (window.LMSChatUnreadCountsLoading) {
			return;
		}
		if (window.LMSChatUnreadCountsLoaded) {
				window.LMSChatUnreadCountsLoaded = false;
		}
		window.LMSChatUnreadCountsLoading = true;
		if (!window.lmsChat || !window.lmsChat.ajaxUrl || !window.lmsChat.nonce) {
			window.LMSChatUnreadCountsLoading = false;
			return;
		}
		try {
			const $headerBadge = $('.header-container .chat-icon .unread-badge');
			const currentBadgeVisible = $headerBadge.is(':visible');
			const currentBadgeText = $headerBadge.text();
			let unreadCounts = null;
			if (window.lmsChat && window.lmsChat.ajaxUrl) {
				try {
					const requestData = {
						action: 'lms_get_unread_count',
						nonce: window.lmsChat.nonce,
						user_id: window.lmsChat.currentUserId
					};
					unreadCounts = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'POST',
						data: requestData,
						timeout: 30000
					});
					if (unreadCounts && unreadCounts.success) {
						unreadCounts = unreadCounts.data;
					} else {
						unreadCounts = null;
					}
				} catch (error) {
					unreadCounts = null;
					window.LMSChatUnreadCountsLoading = false;
					return;
				}
			}
			if (unreadCounts && typeof unreadCounts === 'object') {
				if (!unreadCounts.hasOwnProperty('4')) {
					const $channel4Element = $('.channel-item[data-channel-id="4"], .channel-item[data-channel="4"]');
					if ($channel4Element.length > 0) {
						const currentBadgeState = window.LMSChatBadgeManager?.getCurrentState();
						const headerHasUnread = currentBadgeState?.visible && parseInt(currentBadgeState?.text || 0) > 0;
						const isProtected = window.LMSChatBadgeManager?.isProtected();
						if (headerHasUnread || isProtected) {
							unreadCounts['4'] = 1;
						}
					}
				}
				state.unreadCounts = unreadCounts;
				Object.entries(unreadCounts).forEach(([channelId, count]) => {
					updateChannelBadge(channelId, count);
				});
				const $channel4Element = $('.channel-item[data-channel-id="4"], .channel-item[data-channel="4"]');
				const isProtected = window.LMSChatBadgeManager?.isProtected();
				if ($channel4Element.length > 0 && isProtected && !unreadCounts.hasOwnProperty('4')) {
					updateChannelBadge('4', 1);
				}
				badgeProtectionUntil = Date.now() + (180 * 1000);
				if (window.LMSChatBadgeProtection) {
					window.LMSChatBadgeProtection.extend(180);
				}
				initialUnreadCountsLoaded = true;
				window.LMSChatUnreadCountsLoaded = true;
				const currentTotal = parseInt(currentBadgeText || '0');
				const newTotal = Object.values(unreadCounts).reduce((sum, count) => sum + parseInt(count || 0), 0);
				if (!currentBadgeVisible || currentTotal !== newTotal) {
					const success = window.LMSChatBadgeManager.updateBadge(newTotal.toString(), true);
					if (success) {
						if (!window.LMSChatInitialBadgeState || window.LMSChatInitialBadgeState.assumedFromData) {
							const currentState = window.LMSChatBadgeManager.getCurrentState();
							if (currentState.visible && currentState.text) {
								window.LMSChatInitialBadgeState = {
									visible: true,
									text: currentState.text,
									timestamp: Date.now(),
									fromInitialization: true
								};
							}
						}
					} else {
					}
				} else {
				}
			} else {
				try {
					const serverResponse = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'POST',
						data: {
							action: 'lms_get_unread_count',
							nonce: window.lmsChat.nonce,
							user_id: window.lmsChat.currentUserId,
							force_refresh: true
						},
						timeout: 15000
					});
					if (serverResponse && serverResponse.success && serverResponse.data) {
						let channelData = null;
						if (serverResponse.data.channels) {
							channelData = serverResponse.data.channels;
						} else if (typeof serverResponse.data === 'object') {
							channelData = serverResponse.data;
						}
						if (channelData && typeof channelData === 'object') {
							if (window.LMSChatBadgeManager) {
								window.LMSChatBadgeManager.protectionUntil = 0;
							}
							updateAllBadgesFromServerData(channelData);
							initialUnreadCountsLoaded = true;
							window.LMSChatUnreadCountsLoaded = true;
							return;
						}
					}
				} catch (forceError) {
				}
				if (currentBadgeVisible && currentBadgeText) {
					badgeProtectionUntil = Date.now() + (180 * 1000);
				}
			}
		} catch (error) {
			const $headerBadge = $('.header-container .chat-icon .unread-badge');
			if ($headerBadge.is(':visible') && $headerBadge.text()) {
				badgeProtectionUntil = Date.now() + (180 * 1000);
			}
		} finally {
			window.LMSChatUnreadCountsLoading = false;
		}
	};
	window.LMSChat.ui = {
		updateChannelBadge,
		updateChannelBadgeDisplay,
		updateHeaderUnreadBadge,
		switchChannel,
		showMembersModal,
		setupEventListeners,
		incrementUnreadBadge,
		decrementUnreadBadge,
		loadInitialUnreadCounts,
	};
	const startPeriodicBadgeUpdate = () => {
		setInterval(() => {
			$('.header .user-avatar .unread-badge, .header-container .user-avatar .unread-badge, [class*="user-avatar2"] .unread-badge').remove();
		}, 5000);
		return;
		setInterval(() => {
			setTimeout(async () => {
				try {
					const $headerBadge = $('.header-container .chat-icon .unread-badge');
					const currentHeaderVisible = $headerBadge.is(':visible');
					const currentHeaderText = $headerBadge.text();
					$.ajax({
						url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
						type: 'POST',
						timeout: 15000,
						data: {
							action: 'lms_get_unread_count',
							nonce: window.lmsChat?.nonce
						},
						success: function(response) {
							requestAnimationFrame(() => {
								try {
									let channelData = null;
									if (response.success && response.data) {
										if (response.data.channels) {
											channelData = response.data.channels;
										} else if (typeof response.data === 'object') {
											channelData = response.data;
										}
									}
									if (channelData) {
										const totalUnread = Object.values(channelData).reduce((sum, count) => sum + parseInt(count || 0), 0);
										const shouldShowHeader = totalUnread > 0;
										if (shouldShowHeader !== currentHeaderVisible || (shouldShowHeader && totalUnread.toString() !== currentHeaderText)) {
											const originalProtection = window.LMSChatBadgeManager?.protectionUntil || 0;
											if (window.LMSChatBadgeManager) {
												window.LMSChatBadgeManager.protectionUntil = 0;
											}
											updateHeaderUnreadBadge(channelData);
											if (window.LMSChatBadgeManager) {
												window.LMSChatBadgeManager.protectionUntil = originalProtection;
											}
										}
									}
								} catch (updateError) {
								}
							});
						},
						error: function(xhr, status, error) {
							if (xhr.status === 502 || xhr.status === 504) {
							} else if (status === 'timeout') {
							} else {
							}
						}
					});
				} catch (intervalError) {
				}
			}, 0);
		}, 30000);
	};
	$(document).ready(() => {
		setTimeout(() => {
			$('.header .user-avatar .unread-badge, .header-container .user-avatar .unread-badge, [class*="user-avatar2"] .unread-badge').remove();
		}, 100);
		window.LMSChatBadgeManager.initialize();
		saveInitialBadgeState();
		if (!window.LMSChat || !window.LMSChat.utils || !window.LMSChat.utils.validateChatConfig) {
			return;
		}
		if (!window.LMSChat.utils.validateChatConfig()) return;
		setupEventListeners();
		setTimeout(() => {
			try {
				loadInitialUnreadCounts();
			} catch (error) {
			}
		}, 1000);
		setTimeout(() => {
			startPeriodicBadgeUpdate();
		}, 5000);
	});
	const updateAllBadgesFromServerData = (unreadData) => {
		if (window.LMSUnreadBadgeDbSyncBlocked || window.LMSChatReadOnViewSyncBlocked) {
			return;
		}
		
		if (!unreadData || typeof unreadData !== 'object') {
			return;
		}
		
		if (window.LMSBadgeUpdateBlocked) {
			return;
		}
		
		let totalUnread = 0;
		let channelData = null;
		if (unreadData.channels) {
			channelData = unreadData.channels;
		} else if (typeof unreadData === 'object' && !Array.isArray(unreadData)) {
			channelData = unreadData;
		}
		if (channelData && typeof channelData === 'object') {
			if (window.LMSChatBadgeManager) {
				window.LMSChatBadgeManager.protectionUntil = 0;
			}
			$('.channel-item .unread-badge').hide().text('');
			Object.entries(channelData).forEach(([channelId, count]) => {
				const numCount = parseInt(count) || 0;
				updateChannelBadgeDisplayForce(channelId, numCount);
				if (!utils.isChannelMuted(channelId)) {
					totalUnread += numCount;
				}
			});
			if (window.LMSChatBadgeManager && window.LMSChatBadgeManager.updateBadge) {
				window.LMSChatBadgeManager.updateBadge(totalUnread > 0 ? totalUnread.toString() : '', true);
			}
			state.unreadCounts = channelData;
			if (window.LMSChatBadgeManager) {
				window.LMSChatBadgeManager.extend(30);
			}
		}
	};
	const updateChannelBadgeDisplayForce = (channelId, count) => {
		if (channelId === 'channels' || channelId === 'total') {
			return false;
		}
		const selectors = [
			`.channel-item[data-channel-id="${channelId}"]`,
			`.channel-item[data-channel="${channelId}"]`,
			`#channel-${channelId}`,
			`.channel-list-item[data-channel-id="${channelId}"]`
		];
		let $channelElement = null;
		for (const selector of selectors) {
			$channelElement = $(selector);
			if ($channelElement.length > 0) {
				break;
			}
		}
		if ($channelElement === null || $channelElement.length === 0) {
			return false;
		}
		let $badge = $channelElement.find('.unread-badge');
		if ($badge.length === 0) {
			$badge = $('<span class="unread-badge"></span>');
			$channelElement.append($badge);
		}
		const numCount = parseInt(count) || 0;
		if (numCount === 0) {
			$badge.hide().text('');
		} else {
			$badge.text(numCount).show();
		}
		return true;
	};
	if (window.LMSChat && window.LMSChat.ui) {
		window.LMSChat.ui.updateAllBadgesFromServerData = updateAllBadgesFromServerData;
		window.LMSChat.ui.updateChannelBadgeDisplayForce = updateChannelBadgeDisplayForce;
	}
})(jQuery);
