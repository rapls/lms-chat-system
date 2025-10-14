(function ($) {
	'use strict';
	window.LMSChat = window.LMSChat || {};
	const validateChatConfig = () => {
		if (!window.lmsChat) {
			return false;
		}
		if (typeof window.lmsChat.currentUserId !== 'number' || window.lmsChat.currentUserId <= 0) {
			const fallbackUserId = $('#chat-messages').data('current-user-id');
			if (fallbackUserId && Number(fallbackUserId) > 0) {
				window.lmsChat.currentUserId = Number(fallbackUserId);
				return true;
			}
			return false;
		}
		return true;
	};
	const chatState = {
		currentChannel: 0,
		lastMessageId: 0,
		isLoading: false,
		isSending: false,
		unreadCounts: {},
		currentThread: null,
		updateQueue: new Set(),
		lastReactionId: 0,
		pendingFiles: new Map(),
		uploadQueue: [],
		currentUserId: window.lmsChat?.currentUserId,
		deletedMessageIds: new Set(),
		threadPagination: null,
		cache: {
			messages: new Map(),
			threadMessages: new Map(),
			reactions: new Map(),
			threadReactions: new Map(),
			unreadCounts: null,
			lastCacheClear: Date.now(),
			getMessagesCache: function (channelId, page) {
				const key = `${channelId}_${page}`;
				return this.messages.get(key);
			},
			setMessagesCache: function (channelId, page, data) {
				const key = `${channelId}_${page}`;
				this.messages.set(key, data);
			},
			clearMessagesCache: function (channelId) {
				if (channelId) {
					const keysToDelete = [];
					this.messages.forEach((value, key) => {
						if (key.startsWith(`${channelId}_`)) {
							keysToDelete.push(key);
						}
					});
					keysToDelete.forEach((key) => this.messages.delete(key));
				} else {
					this.messages.clear();
				}
			},
			getThreadMessagesCache: function (messageId, page) {
				const key = `${messageId}_${page}`;
				const cached = this.threadMessages.get(key);
				return cached;
			},
			setThreadMessagesCache: function (messageId, page, data) {
				const key = `${messageId}_${page}`;
				this.threadMessages.set(key, data);
			},
			clearThreadMessagesCache: function (messageId) {
				// 指定されたスレッドの全ページキャッシュをクリア
				if (messageId) {
					const keysToDelete = [];
					for (let key of this.threadMessages.keys()) {
						if (key.startsWith(`${messageId}_`)) {
							keysToDelete.push(key);
						}
					}
					keysToDelete.forEach(key => this.threadMessages.delete(key));
				} else {
					// messageIdが指定されていない場合は全てクリア
					this.threadMessages.clear();
				}
			},
			getReactionsCache: function (messageId) {
				return this.reactions.get(messageId);
			},
			setReactionsCache: function (messageId, data) {
				this.reactions.set(messageId, data);
			},
			getThreadReactionsCache: function (messageId) {
				return this.threadReactions.get(messageId);
			},
			setThreadReactionsCache: function (messageId, data) {
				this.threadReactions.set(messageId, data);
			},
			setUnreadCountsCache: function (data) {
				this.unreadCounts = data;
			},
			clearOldCache: function () {
				const now = Date.now();
				if (now - this.lastCacheClear > 3600000) {
					this.messages.clear();
					this.threadMessages.clear();
					this.reactions.clear();
					this.threadReactions.clear();
					this.unreadCounts = null;
					this.lastCacheClear = now;
				}
			},
		},
	};

	// 初期チャネル情報を整合させる
	const bootstrapChannelId = parseInt(
		window.lmsChat?.currentChannel ||
		window.lmsChat?.currentChannelId ||
		window.lmsChat?.initialChannelId ||
		0,
		10
	);
	if (bootstrapChannelId > 0) {
		chatState.currentChannel = bootstrapChannelId;
		if (!window.lmsChat.currentChannel) {
			window.lmsChat.currentChannel = bootstrapChannelId;
		}
		if (!window.lmsChat.currentChannelId) {
			window.lmsChat.currentChannelId = bootstrapChannelId;
		}
	}
	const getAssetPath = (assetRelativePath) => {
		if (window.lmsChat && window.lmsChat.templateUrl) {
			return assetRelativePath.replace(/^wp-content\/themes\/lms/, window.lmsChat.templateUrl);
		}
		if (window.lmsChat && window.lmsChat.siteUrl) {
			return assetRelativePath.replace(
				/^wp-content\/themes\/lms/,
				window.lmsChat.siteUrl + '/wp-content/themes/lms'
			);
		}
		return '/' + assetRelativePath;
	};
	const showError = (message) => {
		const $error = $('<div class="chat-error"></div>').text(message);
		$('#chat-container').append($error);
		setTimeout(() => {
			$error.fadeOut(300, function () {
				$(this).remove();
			});
		}, 3000);
	};
	const showSuccessMessage = (message) => {
		const $success = $('<div class="chat-success"></div>').text(message);
		$('#chat-container').append($success);
		setTimeout(() => {
			$success.fadeOut(300, function () {
				$(this).remove();
			});
		}, 3000);
	};
	const showErrorMessage = (message) => {
		showError(message);
	};
	const escapeHtml = (str) => {
		if (str === undefined || str === null) {
			return '';
		}
		str = String(str);
		return str.replace(/[&<>"']/g, (match) => {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
		});
	};
	const linkifyUrls = (text) => {
		if (text === undefined || text === null) {
			return '';
		}
		text = String(text);
		return text.replace(
			/(https?:\/\/[^\s]+)/g,
			'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
		);
	};
	const formatFileSize = (bytes) => {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / 1048576).toFixed(1) + ' MB';
	};
	const makeAjaxRequest = async (options, retryCount = 0) => {
		if (!options.timeout) {
			options.timeout = 20000;
		}
		const maxRetries = options.maxRetries || 3;
		const retryDelay = options.retryDelay || 1000;
		try {
			return await new Promise((resolve, reject) => {
				const requestStartTime = Date.now();
				$.ajax({
					...options,
					success: (response) => {
						const requestEndTime = Date.now();
						const duration = requestEndTime - requestStartTime;
						if (duration > 5000) {
						}
						resolve(response);
					},
					error: (xhr, status, error) => {
						const enhancedError = new Error(`Ajax request failed: ${status} - ${error}`);
						enhancedError.xhr = xhr;
						enhancedError.status = status;
						enhancedError.originalError = error;
						enhancedError.requestOptions = { ...options };
						reject(enhancedError);
					},
				});
			});
		} catch (error) {
			const isRetryable =
				error.xhr &&
				(error.xhr.status >= 500 ||
					error.xhr.status === 0 ||
					error.status === 'timeout' ||
					error.status === 'parsererror');
			if (isRetryable && retryCount < maxRetries) {
				const baseWaitTime = retryDelay * Math.pow(1.5, retryCount);
				const jitter = Math.floor(Math.random() * 500);
				const waitTime = Math.min(baseWaitTime + jitter, 15000);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				const newOptions = {
					...options,
					timeout: options.timeout * 1.5,
				};
				return makeAjaxRequest(newOptions, retryCount + 1);
			}
			if (retryCount >= maxRetries) {
				if (options.showErrorOnFail !== false) {
					showError('サーバーとの通信に失敗しました。ページを再読み込みしてください。');
				}
			}
			throw error;
		}
	};
	const debounce = (func, wait) => {
		let timeout;
		return function (...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func(...args), wait);
		};
	};
	const getMutedChannels = () => {
		const muted = localStorage.getItem('lmsMutedChannels');
		return muted ? JSON.parse(muted) : {};
	};
	const setMutedChannels = (mutedObj) => {
		localStorage.setItem('lmsMutedChannels', JSON.stringify(mutedObj));
	};
	const isChannelMuted = (channelId) => {
		const mutedObj = getMutedChannels();
		return !!mutedObj[channelId];
	};
	const toggleChannelMute = (channelId) => {
		let mutedObj = getMutedChannels();
		if (mutedObj[channelId]) {
			delete mutedObj[channelId];
		} else {
			mutedObj[channelId] = true;
		}
		setMutedChannels(mutedObj);
	};
	const shouldRemoveDateSeparator = (messageElement, separatorElement) => {
		if (!separatorElement || separatorElement.length === 0) {
			return false;
		}
		const separatorDateText = separatorElement.text().trim();
		if (!separatorDateText) {
			return false;
		}
		let remainingMessagesForDate = 0;
		const deletedMessageIds = new Set();
		if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.deletedMessageIds) {
			window.LMSChat.state.deletedMessageIds.forEach(id => deletedMessageIds.add(String(id)));
		}
		$('.message-group').each(function() {
			const $group = $(this);
			let $groupSeparator = $group.find('.date-separator').first();
			if ($groupSeparator.length === 0) {
				$groupSeparator = $group.prev('.date-separator');
			}
			if ($groupSeparator.length > 0 && $groupSeparator.text().trim() === separatorDateText) {
				const messagesInGroup = $group.find('.chat-message, .thread-message, .message-item');
				messagesInGroup.each(function() {
					const $msg = $(this);
					const msgId = String($msg.data('message-id') || '');
					if ((!messageElement || $msg[0] !== messageElement[0]) && 
						!deletedMessageIds.has(msgId)) {
						remainingMessagesForDate++;
					}
				});
			}
		});
		return remainingMessagesForDate === 0;
	};
	const removeDateSeparatorSafely = (separatorElement, parentGroup) => {
		if (!separatorElement || separatorElement.length === 0) {
			return;
		}
		separatorElement.fadeOut(300, function() {
			$(this).remove();
			if (parentGroup && parentGroup.length > 0) {
				const remainingContent = parentGroup.find('.chat-message, .thread-message, .date-separator');
				if (remainingContent.length === 0) {
					parentGroup.fadeOut(300, function() {
						$(this).remove();
					});
				}
			}
		});
	};
	const updateNonce = async () => {
		try {
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				data: {
					action: 'lms_refresh_nonce',
					current_nonce: window.lmsChat.nonce,
				},
			});
			if (response.success && response.data.nonce) {
				window.lmsChat.nonce = response.data.nonce;
			}
		} catch (error) {
		}
	};
	const formatMessageTime = (dateStr) => {
		if (!dateStr) return '';
		let date;
		try {
			date = new Date(dateStr);
			if (isNaN(date.getTime())) {
				return dateStr;
			}
		} catch (e) {
			return dateStr;
		}
		const hours = ('0' + date.getHours()).slice(-2);
		const minutes = ('0' + date.getMinutes()).slice(-2);
		const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const weekday = weekdays[date.getDay()];
		return `${month}月${day}日（${weekday}） ${hours}:${minutes}`;
	};
	const getDateKey = (date) => {
		if (!(date instanceof Date) || isNaN(date.getTime())) {
			date = new Date();
		}
		const year = date.getFullYear();
		const month = ('0' + (date.getMonth() + 1)).slice(-2);
		const day = ('0' + date.getDate()).slice(-2);
		return `${year}-${month}-${day}`;
	};
	const getFormattedDate = (date) => {
		if (!(date instanceof Date) || isNaN(date.getTime())) {
			date = new Date();
		}
		const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const weekday = weekdays[date.getDay()];
		return `${year}年${month}月${day}日（${weekday}）`;
	};
	const isFirstMessageOfDay = (messageDate, containerSelector = '#chat-messages') => {
		const dateKey = getDateKey(messageDate);
		const $container = $(containerSelector);
		const $existingGroups = $container.find(`[data-date-key="${dateKey}"]`);
		if ($existingGroups.length === 0) {
			return true;
		}
		let hasValidMessages = false;
		const deletedMessageIds = new Set();
		if (chatState.deletedMessageIds) {
			chatState.deletedMessageIds.forEach(id => deletedMessageIds.add(String(id)));
		}
		$existingGroups.each(function() {
			const $group = $(this);
			const $messages = $group.find('.chat-message, .thread-message, .message-item');
			let validMessageCount = 0;
			$messages.each(function() {
				const $msg = $(this);
				const messageId = String($msg.data('message-id') || '');
				const isDeleted = deletedMessageIds.has(messageId);
				const isVisible = $msg.is(':visible');
				if (isVisible && !isDeleted) {
					validMessageCount++;
				}
			});
			if (validMessageCount > 0) {
				hasValidMessages = true;
				return false;
			}
		});
		return !hasValidMessages;
	};
	const createMessageGroupWithSeparator = (messageDate, containerSelector = '#chat-messages') => {
		const dateKey = getDateKey(messageDate);
		const formattedDate = getFormattedDate(messageDate);
		const $container = $(containerSelector);
		const $existingEmptyGroups = $container.find(`[data-date-key="${dateKey}"]`);
		let $targetGroup = null;
		$existingEmptyGroups.each(function() {
			const $group = $(this);
			const messageCount = $group.find('.chat-message, .thread-message, .message-item').length;
			if (messageCount === 0) {
				const $existingSeparator = $group.find('.date-separator');
				if ($existingSeparator.length > 0) {
					$targetGroup = $group;
					return false;
				} else {
					const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
					$group.prepend(separatorHtml);
					$targetGroup = $group;
					return false;
				}
			}
		});
		if (!$targetGroup) {
			$targetGroup = $('<div class="message-group"></div>').attr('data-date-key', dateKey);
			const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
			$targetGroup.append(separatorHtml);
			$container.append($targetGroup);
		}
		const $separator = $targetGroup.find('.date-separator');
		if ($separator.length > 0) {
			$separator.css({
				'display': 'flex',
				'visibility': 'visible',
				'opacity': '1'
			}).show();
		}
		return $targetGroup;
	};
	const clearDeletedMessageLog = () => {
		if (chatState.deletedMessageIds) {
			const count = chatState.deletedMessageIds.size;
			chatState.deletedMessageIds.clear();
			return count;
		}
		return 0;
	};
	const forceCleanupEmptyGroups = () => {
		const $container = $('#chat-messages');
		const removedGroups = [];
		$container.find('.message-group').each(function() {
			const $group = $(this);
			const messageCount = $group.find('.chat-message, .thread-message, .message-item').length;
			if (messageCount === 0) {
				removedGroups.push({
					dateKey: $group.attr('data-date-key'),
					hasSeparator: $group.find('.date-separator').length > 0,
					element: $group[0]
				});
				$group.remove();
			}
		});
		return removedGroups;
	};
	const forceRemoveDeletedMessages = () => {
		const $container = $('#chat-messages');
		const removedMessages = [];
		if (chatState.deletedMessageIds) {
			chatState.deletedMessageIds.forEach(messageId => {
				const $message = $container.find(`[data-message-id="${messageId}"]`);
				if ($message.length > 0) {
					removedMessages.push({
						messageId: messageId,
						element: $message[0]
					});
					$message.remove();
				}
			});
		}
		return removedMessages;
	};
	window.LMSChat.utils = window.LMSChat.utils || {};
	window.LMSChat.utils.compressData = function (data) {
		if (!data) return null;
		try {
			const jsonStr = JSON.stringify(data);
			return LZString.compressToBase64(jsonStr);
		} catch (e) {
			return null;
		}
	};
	window.LMSChat.utils.decompressData = function (compressed) {
		if (!compressed) return null;
		try {
			const jsonStr = LZString.decompressFromBase64(compressed);
			return jsonStr ? JSON.parse(jsonStr) : null;
		} catch (e) {
			return null;
		}
	};
	window.LMSChat.cache = window.LMSChat.cache || {
		messagesCache: {},
		setMessagesCache: function (channelId, page, data) {
			const key = `channel_${channelId}_page_${page}`;
			const compressed = window.LMSChat.utils.compressData(data);
			this.messagesCache[key] = { compressed: true, data: compressed, timestamp: Date.now() };
		},
		getMessagesCache: function (channelId, page) {
			const key = `channel_${channelId}_page_${page}`;
			const cached = this.messagesCache[key];
			if (!cached) return null;
			if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
				delete this.messagesCache[key];
				return null;
			}
			if (cached.compressed) {
				return window.LMSChat.utils.decompressData(cached.data);
			}
			return cached.data;
		},
		clearMessagesCache: function (channelId) {
			Object.keys(this.messagesCache).forEach((key) => {
				if (key.startsWith(`channel_${channelId}_`)) {
					delete this.messagesCache[key];
				}
			});
		},
	};
	const forceCheckDateSeparators = () => {
		setTimeout(() => {
			const deletedMessageIds = new Set();
			if (chatState.deletedMessageIds) {
				chatState.deletedMessageIds.forEach(id => deletedMessageIds.add(String(id)));
			}
			$('.message-group').each(function() {
				const $group = $(this);
				let validMessageCount = 0;
				$group.find('.chat-message, .thread-message, .message-item').each(function() {
					const msgId = String($(this).data('message-id') || '');
					if (!deletedMessageIds.has(msgId)) {
						validMessageCount++;
					}
				});
				if (validMessageCount === 0) {
					let $separator = $group.find('.date-separator').first();
					if ($separator.length === 0) {
						$separator = $group.prev('.date-separator');
					}
					if ($separator.length > 0) {
						if (shouldRemoveDateSeparator(null, $separator)) {
							removeDateSeparatorSafely($separator, $group);
						}
					} else {
						$group.remove();
					}
				}
			});
			$('.date-separator').each(function() {
				const $separator = $(this);
				const separatorDateText = $separator.text().trim();
				if (separatorDateText) {
					let hasMessagesForDate = false;
					$('.message-group').each(function() {
						const $group = $(this);
						let $groupSeparator = $group.find('.date-separator').first();
						if ($groupSeparator.length === 0) {
							$groupSeparator = $group.prev('.date-separator');
						}
						if ($groupSeparator.length > 0 && $groupSeparator.text().trim() === separatorDateText) {
							let validMessageCount = 0;
							$group.find('.chat-message, .thread-message, .message-item').each(function() {
								const msgId = String($(this).data('message-id') || '');
								if (!deletedMessageIds.has(msgId)) {
									validMessageCount++;
								}
							});
							if (validMessageCount > 0) {
								hasMessagesForDate = true;
								return false;
							}
						}
					});
					if (!hasMessagesForDate) {
						$separator.fadeOut(300, function() {
							$(this).remove();
						});
					}
				}
			});
		}, 100);
	};
	window.LMSChat = window.LMSChat || {};
	window.LMSChat.state = chatState;
	window.LMSChat.cache = chatState.cache;
	window.LMSChat.utils = Object.assign({}, window.LMSChat.utils || {}, {
			getAssetPath,
			escapeHtml,
			linkifyUrls,
			formatFileSize,
			showError,
			showSuccessMessage,
			showErrorMessage,
			makeAjaxRequest,
			debounce,
			getMutedChannels,
			setMutedChannels,
			isChannelMuted,
			toggleChannelMute,
			validateChatConfig,
			updateNonce,
			formatMessageTime,
			compressData: window.LMSChat.utils.compressData,
			decompressData: window.LMSChat.utils.decompressData,
			shouldRemoveDateSeparator,
			removeDateSeparatorSafely,
			forceCheckDateSeparators,
			getDateKey,
			getFormattedDate,
			isFirstMessageOfDay,
			createMessageGroupWithSeparator,
			clearDeletedMessageLog,
			forceCleanupEmptyGroups,
			forceRemoveDeletedMessages,
	});
	$(document).ready(async () => {
		if (!validateChatConfig()) return;
		setInterval(updateNonce, 3600000);
		setInterval(chatState.cache.clearOldCache, 60000);
		setInterval(() => {
			if (chatState.deletedMessageIds && chatState.deletedMessageIds.size > 100) {
				chatState.deletedMessageIds.clear();
			}
		}, 300000);
		$(document).on('channel_changed', function (e, channelId) {
			chatState.cache.clearMessagesCache(channelId);
			if (chatState.deletedMessageIds) {
				chatState.deletedMessageIds.clear();
			}
			if (channelId && channelId > 0) {
				chatState.currentChannel = channelId;
				if (window.lmsChat) {
					window.lmsChat.currentChannel = channelId;
					window.lmsChat.currentChannelId = channelId;
				}
			}
		});
		$(document).on('thread_opened', function (e, parentMessageId) {
			const keysToDelete = [];
			chatState.cache.threadMessages.forEach((value, key) => {
				if (key.startsWith(`${parentMessageId}_`)) {
					keysToDelete.push(key);
				}
			});
			keysToDelete.forEach((key) => chatState.cache.threadMessages.delete(key));
		});
		initializeLongPollConnection();
	});
	const initializeLongPollConnection = () => {
		if (chatState.isLongPollInitializing) {
			return;
		}
		chatState.isLongPollInitializing = true;
		let longpollAttempts = 0;
		let channelAttempts = 0;
		const maxAttempts = 50;
		const getCurrentChannel = () => {
			let channelId = null;
			if (chatState.currentChannel) {
				channelId = chatState.currentChannel;
			}
			else if (window.lmsChat && window.lmsChat.currentChannel) {
				channelId = window.lmsChat.currentChannel;
			}
			if (!channelId) {
				const $activeChannel = $('.channel-item.active');
				if ($activeChannel.length > 0) {
					channelId = $activeChannel.data('channel-id');
				}
			}
			if (!channelId) {
			}
			const result = channelId ? parseInt(channelId, 10) : 0;
			return result;
		};
		const finishInitialization = (success = false) => {
			chatState.isLongPollInitializing = false;
			if (success) {
				} else {
			}
		};
		const startLongPollConnection = () => {
			const channelId = getCurrentChannel();
			if (!channelId || channelId === 0) {
				finishInitialization(true);
				return;
			}
			if (window.LMSChat && window.LMSChat.LongPoll && typeof window.LMSChat.LongPoll.connect === 'function') {
				chatState.currentChannel = channelId;
				if (window.lmsChat) {
					window.lmsChat.currentChannel = channelId;
					window.lmsChat.currentChannelId = channelId;
				}
				const connectResult = window.LMSChat.LongPoll.connect(channelId, 0);
				finishInitialization(true);
			} else {
				finishInitialization(false);
			}
		};
		const waitForLongPollModule = () => {
			if (window.LMSChatUnifiedSync && window.lmsUnifiedSync) {
				finishInitialization(true);
				return;
			}
			if (window.LMSChat && window.LMSChat.LongPoll && typeof window.LMSChat.LongPoll.connect === 'function') {
				startLongPollConnection();
			} else {
				longpollAttempts++;
				if (longpollAttempts >= maxAttempts) {
					finishInitialization(false);
					return;
				}
				if (longpollAttempts % 10 === 0) {
				}
				setTimeout(waitForLongPollModule, 100);
			}
		};
		const waitForChannel = () => {
			const channelId = getCurrentChannel();
			if (channelId && channelId > 0) {
				waitForLongPollModule();
			} else {
				channelAttempts++;
				if (channelAttempts >= 10) {
					finishInitialization(true);
					return;
				}
				if (channelAttempts % 5 === 0) {
					}
				setTimeout(waitForChannel, 100);
			}
		};
		setTimeout(() => {
			waitForChannel();
		}, 500);
	};
})(jQuery);
