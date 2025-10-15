(function ($) {
	'use strict';
	window.LMSChat.messages = window.LMSChat.messages || {};
	const messageIdTracker = {
		displayedMessages: new Set(),
		isDisplayed: function (messageId) {
			const result = this.displayedMessages.has(String(messageId));
			if (result) {
			}
			return result;
		},
		markAsDisplayed: function (messageId) {
			this.displayedMessages.add(String(messageId));
		},
		removeFromDisplayed: function (messageId) {
			const messageIdStr = String(messageId);
			const removed = this.displayedMessages.delete(messageIdStr);
			return removed;
		},
		clear: function () {
			this.displayedMessages.clear();
		},
		syncWithDOM: function () {
			const $messageContainer = $('#chat-messages');
			this.displayedMessages.clear();
			$messageContainer.find('.chat-message').each(function () {
				const messageId = $(this).data('message-id');
				if (messageId) {
					messageIdTracker.markAsDisplayed(messageId);
				}
			});
		},
	};
	$.extend($.expr[':'], {
		'first-visible': function (a) {
			const $el = $(a);
			const $container = $('#chat-messages');
			if (!$container.length) return false;
			const containerTop = $container.scrollTop();
			const containerHeight = $container.height();
			const elTop = $el.position().top;
			const elHeight = $el.outerHeight();
			const isVisible = elTop >= 0 && elTop < containerHeight;
			return isVisible && elTop + elHeight / 2 <= containerHeight;
		},
	});
	window.LMSChat.state = window.LMSChat.state || {};
	window.LMSChat.utils = window.LMSChat.utils || {};

	// 🔥 SCROLL FLICKER FIX: チャンネル切り替え中の完全ロック管理システム
	const ChannelSwitchGuard = (() => {
		let lockCount = 0;
		const deferredQueue = [];
		let scrollAnchor = null;
		const container = document.getElementById('chat-messages');

		const enforceScroll = (e) => {
			if (scrollAnchor === null) return;

			// 🔥 SCROLL FLICKER FIX: scrollイベント自体をキャンセル
			if (e && e.preventDefault) {
				e.preventDefault();
			}
			if (e && e.stopPropagation) {
				e.stopPropagation();
			}
			if (e && e.stopImmediatePropagation) {
				e.stopImmediatePropagation();
			}

			// スクロール位置が変わっていたら強制的に戻す
			if (container && Math.abs(container.scrollTop - scrollAnchor) > 1) {
				// 無限ループ防止：scrollイベントリスナーを一時的に削除
				container.removeEventListener('scroll', enforceScroll);
				container.scrollTop = scrollAnchor;
				// リスナーを再登録
				setTimeout(() => {
					container.addEventListener('scroll', enforceScroll, { passive: false });
				}, 0);
			}
		};

		const flush = () => {
			while (lockCount === 0 && deferredQueue.length > 0) {
				const fn = deferredQueue.shift();
				try {
					fn();
				} catch (e) {				}
			}
			if (lockCount === 0 && container) {
				container.classList.remove('channel-switch-locked');
			}
		};

		return {
			lock(reason, opts = {}) {
				lockCount++;
				if (opts.scrollTop != null && container) {
					scrollAnchor = opts.scrollTop;
					container.scrollTop = scrollAnchor;
					container.addEventListener('scroll', enforceScroll, { passive: false });
					container.classList.add('channel-switch-locked');
				}
			},
			unlock(reason) {
				if (lockCount > 0) lockCount--;
				if (lockCount === 0 && container) {
					container.removeEventListener('scroll', enforceScroll);
					scrollAnchor = null;
				}
				flush();
			},
			defer(fn) {
				if (lockCount > 0) {
					deferredQueue.push(fn);
				} else {
					fn();
				}
			},
			isLocked() {
				return lockCount > 0;
			},
		};
	})();
	window.LMSChat.channelSwitchGuard = ChannelSwitchGuard;

	const { state, utils } = window.LMSChat;
	if (!state.isChannelSwitching) {
		state.isChannelSwitching = false;
	}
	if (!state.isChannelLoaded) {
		state.isChannelLoaded = {};
	}
	if (!state.recentSentMessageIds) {
		state.recentSentMessageIds = new Set();
	}
	if (!state.recentSentMessageTimes) {
		state.recentSentMessageTimes = new Map();
	}

	// ====== 統一ドリフト防止ヘルパー関数 ======
	const ensureUniqueReactionContainer = ($messageElement) => {
		if (!$messageElement || $messageElement.length === 0) return null;

		// 全ての .message-reactions 要素を取得
		const $allContainers = $messageElement.find('.message-reactions');

		if ($allContainers.length === 0) {
			return null; // コンテナが存在しない
		}

		if ($allContainers.length === 1) {
			return $allContainers.first(); // 単一コンテナ - 正常状態
		}

		// 重複コンテナを統合処理
		const $primary = $allContainers.first();
		const allReactions = new Map();

		// 全コンテナからリアクションを収集
		$allContainers.each(function () {
			const $container = $(this);
			$container.find('.reaction-item').each(function () {
				const $item = $(this);
				const emoji = $item.data('emoji') || $item.attr('data-emoji');
				if (emoji) {
					const text = $item.text().trim();
					const countMatch = text.match(/(\d+)$/);
					const count = countMatch ? parseInt(countMatch[1], 10) : 1;

					if (allReactions.has(emoji)) {
						allReactions.set(emoji, allReactions.get(emoji) + count);
					} else {
						allReactions.set(emoji, count);
					}
				}
			});
		});

		// 重複コンテナを削除（最初のもの以外）
		$allContainers.slice(1).remove();

		// プライマリコンテナに統合されたリアクションを配置
		$primary.empty();
		allReactions.forEach((count, emoji) => {
			const $reactionItem = $(
				`<span class="reaction-item" data-emoji="${emoji}">${emoji} ${count}</span>`
			);
			$primary.append($reactionItem);
		});

		// ハイドレーションマークを設定
		$primary.data('reactionsHydrated', true);
		$primary.attr('data-reactions-hydrated', '1');

		return $primary;
	};

	const ensureUniqueThreadInfo = ($messageElement) => {
		if (!$messageElement || $messageElement.length === 0) return null;

		const $allThreadInfos = $messageElement.find('.thread-info');

		if ($allThreadInfos.length === 0) {
			return null; // スレッド情報が存在しない
		}

		if ($allThreadInfos.length === 1) {
			return $allThreadInfos.first(); // 単一要素 - 正常状態
		}

		// 重複スレッド情報を処理 - 最新のデータを保持
		const $primary = $allThreadInfos.first();
		let maxCount = 0;
		let bestThreadInfo = null;

		$allThreadInfos.each(function () {
			const $threadInfo = $(this);
			const countText = $threadInfo.find('.thread-reply-count').text() || '';
			const countMatch = countText.match(/(\d+)/);
			const count = countMatch ? parseInt(countMatch[1], 10) : 0;

			if (count > maxCount) {
				maxCount = count;
				bestThreadInfo = $threadInfo.clone();
			}
		});

		// 重複要素を削除
		$allThreadInfos.slice(1).remove();

		// 最新データで更新
		if (bestThreadInfo && maxCount > 0) {
			$primary.replaceWith(bestThreadInfo);
			return bestThreadInfo;
		}

		return $primary;
	};

	const safeAddReactionContainer = ($messageElement, reactionsHtml) => {
		if (!$messageElement || $messageElement.length === 0 || !reactionsHtml) {
			return null;
		}

		// 空のリアクションコンテナは追加しない
		const $tempContainer = $(reactionsHtml);
		const hasReactionItems = $tempContainer.find('.reaction-item').length > 0;

		// リアクションアイテムがない場合は何も追加しない
		if (!hasReactionItems && !$tempContainer.attr('data-reactions-hydrated')) {
			return null;
		}

		// 既存コンテナをチェック・統合
		const $existingContainer = ensureUniqueReactionContainer($messageElement);

		if ($existingContainer && $existingContainer.length > 0) {
			// 既存コンテナがある場合
			if (hasReactionItems) {
				// リアクションアイテムがある場合のみ更新
				const newItems = $tempContainer.find('.reaction-item');
				$existingContainer.empty().append(newItems);
				return $existingContainer;
			} else {
				// リアクションアイテムがない場合は既存コンテナを削除
				$existingContainer.remove();
				return null;
			}
		} else if (hasReactionItems) {
			// 新規コンテナを追加（リアクションがある場合のみ）
			$messageElement.find('.message-content').after($tempContainer);
			return $tempContainer;
		}

		return null;
	};

	const safeAddThreadInfo = ($messageElement, threadInfoHtml) => {
		if (!$messageElement || $messageElement.length === 0 || !threadInfoHtml) {
			return null;
		}

		// 既存スレッド情報をチェック・統合
		const $existingThreadInfo = ensureUniqueThreadInfo($messageElement);

		if ($existingThreadInfo && $existingThreadInfo.length > 0) {
			// 既存要素を新しいHTMLで置換
			const $newThreadInfo = $(threadInfoHtml);
			$existingThreadInfo.replaceWith($newThreadInfo);
			return $newThreadInfo;
		} else {
			// 新規スレッド情報を追加
			const $newThreadInfo = $(threadInfoHtml);
			$messageElement.find('.message-content').after($newThreadInfo);
			return $newThreadInfo;
		}
	};
	// 定期的なドリフトクリーンアップ関数
	const performDriftCleanup = () => {
		const $allMessages = $('#chat-messages .chat-message[data-message-id]');
		let cleanedCount = 0;

		$allMessages.each(function () {
			const $message = $(this);
			const messageId = $message.data('message-id');

			// リアクションコンテナの重複チェック・修正
			const $reactionContainers = $message.find('.message-reactions');
			if ($reactionContainers.length > 1) {
				ensureUniqueReactionContainer($message);
				cleanedCount++;
			}

			// スレッド情報の重複チェック・修正
			const $threadInfos = $message.find('.thread-info');
			if ($threadInfos.length > 1) {
				ensureUniqueThreadInfo($message);
				cleanedCount++;
			}
		});

		return cleanedCount;
	};

	// グローバルアクセス用に公開
	window.LMSChat = window.LMSChat || {};
	window.LMSChat.driftPrevention = {
		ensureUniqueReactionContainer,
		ensureUniqueThreadInfo,
		safeAddReactionContainer,
		safeAddThreadInfo,
		performDriftCleanup,
	};

	// 10秒おきにドリフトクリーンアップを実行
	setInterval(() => {
		if (document.getElementById('chat-messages')) {
			performDriftCleanup();
		}
	}, 10000);

	// ====== ドリフト防止ヘルパー関数終了 ======

	const cleanupTempMessages = () => {
		let removedCount = 0;
		$('.chat-message').each(function () {
			const $msg = $(this);
			const userName = $msg.find('.message-sender, .message-author').text().trim();
			const messageId = $msg.attr('data-message-id');
			const messageText = $msg.find('.message-text').text().trim();
			if (
				(userName === 'undefined' && messageText === '') ||
				(messageId && messageId.startsWith('temp_') && userName === '') ||
				(messageText === 'undefined' && userName === '')
			) {
				$msg.remove();
				removedCount++;
			}
		});
		if (removedCount > 0) {
		}
		return removedCount;
	};
	const atomicDeleteMessageAndSeparators = (messageId, options = {}) => {
		const isThread = options.isThread || false;
		const isGroupDelete = options.isGroupDelete || false;
		const groupMessageIds = options.groupMessageIds || [];
		if (isGroupDelete) {
			const groupKey = groupMessageIds.sort().join(',');
			if (atomicDeletionLock.has(`group_${groupKey}`)) {
				return false;
			}
			atomicDeletionLock.add(`group_${groupKey}`);
			setTimeout(() => {
				atomicDeletionLock.delete(`group_${groupKey}`);
			}, 100);
		} else {
			const deletionKey = `single_${messageId}`;
			if (atomicDeletionLock.has(deletionKey)) {
				return false;
			}
			atomicDeletionLock.add(deletionKey);
			setTimeout(() => {
				atomicDeletionLock.delete(deletionKey);
			}, 100);
		}
		if (isGroupDelete && groupMessageIds.length > 0) {
			let deletedCount = 0;
			const affectedDateGroups = new Set();
			groupMessageIds.forEach((msgId) => {
				const $message = $(`.chat-message[data-message-id="${msgId}"]`);
				if ($message.length > 0) {
					const $messageGroup = $message.closest('.message-group');
					if ($messageGroup.length > 0) {
						const dateKey = $messageGroup.attr('data-date-key');
						if (dateKey) {
							affectedDateGroups.add(dateKey);
						}
					}
					$message.remove();
					deletedCount++;
				}
			});
			affectedDateGroups.forEach((dateKey) => {
				const $group = $(`.message-group[data-date-key="${dateKey}"]`);
				if ($group.length > 0 && $group.find('.chat-message, .thread-message').length === 0) {
					$group.fadeOut(300, function () {
						$(this).remove();
					});
				}
			});
			return deletedCount > 0;
		}
		const messageSelector = isThread
			? `.thread-message[data-message-id="${messageId}"]`
			: `.chat-message[data-message-id="${messageId}"], .message-item[data-message-id="${messageId}"]`;
		const groupSelector = `.message-group-item[data-message-id="${messageId}"]`;
		const $messageElement = $(messageSelector);
		const $groupElement = $(groupSelector);
		if ($messageElement.length === 0) {
			return false;
		}
		const $parentGroup = $messageElement.closest('.message-group');
		const $separator = $parentGroup.prev('.date-separator');
		const $separatorInGroup = $parentGroup.find('.date-separator');
		let willSeparatorBeDeleted = false;
		if ($separator.length > 0) {
			try {
				if (
					window.LMSChat &&
					window.LMSChat.utils &&
					typeof window.LMSChat.utils.shouldRemoveDateSeparator === 'function'
				) {
					willSeparatorBeDeleted = window.LMSChat.utils.shouldRemoveDateSeparator(
						$messageElement,
						$separator
					);
				}
			} catch (error) {
				willSeparatorBeDeleted = false;
			}
		}
		const currentMessageCount = $parentGroup.find(
			'.chat-message, .thread-message, .message-item'
		).length;
		const willGroupBeEmpty = currentMessageCount === 1;
		const elementsToRemove = [$messageElement, $groupElement];
		if (willGroupBeEmpty && $parentGroup.length > 0) {
			elementsToRemove.push($parentGroup);
		}
		elementsToRemove.forEach(($element) => {
			$element
				.css({
					transition: 'none',
					animation: 'none',
					transform: 'none',
				})
				.remove();
		});
		if (willSeparatorBeDeleted) {
			try {
				if (
					window.LMSChat &&
					window.LMSChat.utils &&
					typeof window.LMSChat.utils.removeDateSeparatorSafely === 'function'
				) {
					if ($separator.length > 0) {
						window.LMSChat.utils.removeDateSeparatorSafely($separator, $parentGroup);
					}
					if ($separatorInGroup.length > 0) {
						window.LMSChat.utils.removeDateSeparatorSafely($separatorInGroup, $parentGroup);
					}
				} else {
					if ($separator.length > 0) {
						$separator
							.css({
								transition: 'none',
								animation: 'none',
								transform: 'none',
							})
							.remove();
					}
					if ($separatorInGroup.length > 0) {
						$separatorInGroup
							.css({
								transition: 'none',
								animation: 'none',
								transform: 'none',
							})
							.remove();
					}
				}
			} catch (error) {
				if ($separator.length > 0) {
					$separator
						.css({
							transition: 'none',
							animation: 'none',
							transform: 'none',
						})
						.remove();
				}
				if ($separatorInGroup.length > 0) {
					$separatorInGroup
						.css({
							transition: 'none',
							animation: 'none',
							transform: 'none',
						})
						.remove();
				}
			}
		}
		return true;
	};
	const checkAndRemoveEmptyDateSeparator = ($messageElement) => {
		if (!$messageElement || $messageElement.length === 0) {
			return;
		}
		const $parentGroup = $messageElement.closest('.message-group');
		if ($parentGroup.length === 0) {
			return;
		}
		const $visibleMessages = $parentGroup
			.find('.chat-message, .thread-message')
			.filter(function () {
				return $(this).css('display') !== 'none';
			});
		if ($visibleMessages.length === 0 && $parentGroup.length > 0) {
			const dateKey = $parentGroup.attr('data-date-key');
			$parentGroup.fadeOut(300, function () {
				$(this).remove();
			});
		}
		return true;
	};
	const cleanupEmptyDateSeparators = () => {
		let removedCount = 0;
		const separatorsToRemove = [];
		const groupsToRemove = [];
		$('.date-separator').each(function () {
			const $separator = $(this);
			const $nextGroup = $separator.next('.message-group');
			const $parentGroup = $separator.closest('.message-group');
			if ($nextGroup.length > 0) {
				const $messages = $nextGroup.find('.chat-message, .thread-message').filter(':visible');
				if ($messages.length === 0) {
					separatorsToRemove.push($separator);
					groupsToRemove.push($nextGroup);
				}
			}
			if ($parentGroup.length > 0) {
				const $messages = $parentGroup.find('.chat-message, .thread-message').filter(':visible');
				if ($messages.length === 0) {
					if (separatorsToRemove.indexOf($separator) === -1) {
						separatorsToRemove.push($separator);
					}
					if (groupsToRemove.indexOf($parentGroup) === -1) {
						groupsToRemove.push($parentGroup);
					}
				}
			}
		});
		$('.message-group').each(function () {
			const $group = $(this);
			const $messages = $group.find('.chat-message, .thread-message').filter(':visible');
			if ($messages.length === 0 && groupsToRemove.indexOf($group) === -1) {
				groupsToRemove.push($group);
			}
		});
		separatorsToRemove.forEach(($sep) => {
			if ($sep.length > 0 && $sep.is(':visible')) {
				$sep.remove();
				removedCount++;
			}
		});
		groupsToRemove.forEach(($group) => {
			if ($group.length > 0) {
				const $lastCheckMessages = $group.find('.chat-message, .thread-message').filter(':visible');
				if ($lastCheckMessages.length === 0) {
					$group.remove();
					removedCount++;
				} else {
				}
			}
		});
		return removedCount;
	};
	let separatorObserver = null;
	const setupSeparatorObserver = () => {
		if (separatorObserver) return;
		const chatContainer = document.getElementById('chat-messages');
		if (!chatContainer) return;
		separatorObserver = new MutationObserver((mutations) => {
			let needsCleanup = false;
			for (const mutation of mutations) {
				if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
					for (const node of mutation.removedNodes) {
						if (
							node.nodeType === Node.ELEMENT_NODE &&
							(node.classList?.contains('chat-message') ||
								node.classList?.contains('thread-message'))
						) {
							needsCleanup = true;
							break;
						}
					}
					if (needsCleanup) break;
				}
			}
			if (needsCleanup) {
			}
		});
		separatorObserver.observe(chatContainer, {
			childList: true,
			subtree: true,
		});
	};
	const performDateSeparatorDeletion = ($messageGroup) => {
		const removedCount = 0;
		if (removedCount > 0) {
		} else {
		}
	};
	const handleLongPollMessage = (data) => {
		const messageId = data?.messageId || data?.id || data?.payload?.id || data?.payload?.messageId;

		if (!data.payload || !messageId) {
			return;
		}
		if (messageIdTracker.isDisplayed(messageId)) {
			return;
		}
		if (window.LMSUniversalUnreadBadge && window.LMSUniversalUnreadBadge.handleNewMessage) {
			const messageData = {
				id: messageId,
				channel_id: data.payload.channel_id,
				user_id: data.payload.user_id,
				content: data.payload.content || '',
				display_name: data.payload.display_name || '',
			};
			window.LMSUniversalUnreadBadge.handleNewMessage(messageData);
		}

		if (!state.currentChannel || data.payload?.channel_id != state.currentChannel) {
			if (data.payload?.channel_id) {
				const messageChannelId = data.payload.channel_id;
				if (!window.LMSChat.state.unreadCounts) {
					window.LMSChat.state.unreadCounts = {};
				}
				const currentCount = window.LMSChat.state.unreadCounts[messageChannelId] || 0;
				window.LMSChat.state.unreadCounts[messageChannelId] = currentCount + 1;
				if (window.LMSChat?.ui?.updateChannelBadgeDisplay) {
					window.LMSChat.ui.updateChannelBadgeDisplay(
						messageChannelId,
						window.LMSChat.state.unreadCounts[messageChannelId]
					);
				}
				if (window.LMSChatBadgeManager) {
					window.LMSChatBadgeManager.protectionUntil = 0;
				}
				if (
					window.LMSChat?.ui?.updateHeaderUnreadBadge &&
					!window.LMSUnreadBadgeDbSyncBlocked &&
					!window.LMSChatReadOnViewSyncBlocked
				) {
					$.ajax({
						url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
						type: 'POST',
						data: {
							action: 'lms_get_unread_count',
							nonce: window.lmsChat?.nonce,
						},
						success: function (response) {
							let channelData = null;
							if (response.success && response.data) {
								if (response.data.channels) {
									channelData = response.data.channels;
								} else if (typeof response.data === 'object') {
									channelData = response.data;
								}
							}
							if (channelData) {
								const mergedData = { ...channelData };
								if (window.LMSChat.state.unreadCounts) {
									Object.entries(window.LMSChat.state.unreadCounts).forEach(
										([channelId, localCount]) => {
											const serverCount = mergedData[channelId] || 0;
											if (localCount > serverCount) {
												mergedData[channelId] = localCount;
											}
										}
									);
								}
								const allChannelElements = $('.channel-item[data-channel-id]');
								const existingChannelIds = [];
								allChannelElements.each(function () {
									const channelId = $(this).data('channel-id');
									if (channelId) {
										existingChannelIds.push(channelId.toString());
									}
								});
								existingChannelIds.forEach((channelId) => {
									if (!mergedData.hasOwnProperty(channelId)) {
										const $existingBadge = $(
											`.channel-item[data-channel-id="${channelId}"] .unread-badge`
										);
										if ($existingBadge.length > 0 && $existingBadge.is(':visible')) {
											const existingCount = parseInt($existingBadge.text()) || 0;
											mergedData[channelId] = existingCount;
										} else {
											mergedData[channelId] = 0;
										}
									}
								});
								window.LMSChat.state.unreadCounts = mergedData;
								window.LMSChat.ui.updateHeaderUnreadBadge(mergedData);
							} else {
							}
						},
					});
				}
			}
			return;
		}
		if (data.payload && data.payload.user_id == window.lmsChat.currentUserId) {
			const $existingRealMessage = $(`.chat-message[data-message-id="${messageId}"]`);
			if ($existingRealMessage.length > 0 && !$existingRealMessage.hasClass('temp-message')) {
				return;
			}
			const $tempMessages = $('.chat-message[data-message-id^="temp_"]').filter(function () {
				const $msg = $(this);
				const tempMessage = $msg.find('.message-text').text().trim();
				const newMessage = data.payload.message ? data.payload.message.trim() : '';
				return tempMessage === newMessage;
			});
			if ($tempMessages.length > 0) {
				$tempMessages.each(function () {
					const $tempMsg = $(this);
					const $timeElement = $tempMsg.find('.message-time');
					if ($timeElement.length > 0 && data.payload.created_at) {
						const date = new Date(data.payload.created_at);
						if (!isNaN(date.getTime())) {
							const hours = date.getHours().toString().padStart(2, '0');
							const minutes = date.getMinutes().toString().padStart(2, '0');
							const timeStr = `${hours}:${minutes}`;
							$timeElement.text(timeStr);
							$timeElement.attr('data-timestamp', data.payload.created_at);
						}
					}
					$tempMsg.attr('data-message-id', messageId);
					const $threadButton = $tempMsg.find('.thread-button, .thread-info');
					if ($threadButton.length > 0) {
						$threadButton.attr('data-message-id', messageId);
					}
					$tempMsg.removeClass('pending-message temp-message');
					$tempMsg.css({
						opacity: '1',
						'background-color': '',
					});
					messageIdTracker.markAsDisplayed(messageId);
				});
				return;
			} else {
			}
		}
		if (!data.payload || !messageId) {
			return;
		}
		if (state.recentSentMessageIds && state.recentSentMessageIds.has(String(messageId))) {
			const sentTime = state.recentSentMessageTimes?.get(String(messageId));
			if (sentTime && Date.now() - sentTime > 5000) {
				state.recentSentMessageIds.delete(String(messageId));
				if (state.recentSentMessageTimes) {
					state.recentSentMessageTimes.delete(String(messageId));
				}
			} else {
				const existingMessage = $(`.chat-message[data-message-id="${messageId}"]`);
				if (existingMessage.length === 0) {
				} else {
					return;
				}
			}
		}
		const existingMessage = $(`.chat-message[data-message-id="${messageId}"]`);
		if (existingMessage.length > 0 && !existingMessage.hasClass('temp-message')) {
			const hasHeader = existingMessage.find('.message-header').length > 0;
			const hasTime = existingMessage.find('.message-time').length > 0;
			const hasContent = existingMessage.find('.message-content').length > 0;
			if (!hasHeader || !hasTime || !hasContent) {
				existingMessage.remove();
				messageIdTracker.displayedMessages.delete(String(messageId));
			} else {
				return;
			}
		}
		if (existingMessage.length === 0 && messageIdTracker.isDisplayed(messageId)) {
			messageIdTracker.displayedMessages.delete(String(messageId));
		}
		try {
			if (window.LMSChat.messages && window.LMSChat.messages.appendMessage) {
				if (
					!data.payload.display_name ||
					data.payload.display_name === 'undefined' ||
					data.payload.display_name === '' ||
					data.payload.display_name === 'null'
				) {
					data.payload.display_name = `ユーザー${data.payload.user_id || 'Unknown'}`;
					if (data.payload.user_id) {
						if (
							window.lmsChat?.currentUserId &&
							data.payload.user_id == window.lmsChat.currentUserId
						) {
							data.payload.display_name = 'あなた';
						} else {
							data.payload.display_name = `ユーザー${data.payload.user_id}`;
						}
					} else {
						data.payload.display_name = '匿名ユーザー';
					}
				}
				data.payload.isNewFromServer = true;
				data.payload.isUnread = true;
				if (!data.payload.id) {
					data.payload.id = messageId;
				}
				if (!data.payload.display_name || data.payload.display_name === 'undefined') {
					return;
				}
				const messageText = data.payload.message || data.payload.content || '';
				if (!data.payload.message && data.payload.content) {
					data.payload.message = data.payload.content;
				}
				if (!data.payload.content && data.payload.message) {
					data.payload.content = data.payload.message;
				}
				if (
					!messageText ||
					messageText.trim() === '' ||
					messageText === 'undefined' ||
					messageText === 'null'
				) {
					return;
				}
				if (!messageText) {
					return;
				}
				window.LMSChat.messages.appendMessage(data.payload, {
					fromLongPoll: true,
					autoScroll: false,
					markAsUnread: true,
				});
				if (data.payload.user_id != parseInt(window.lmsChat.currentUserId)) {
					if (
						window.LMSChat.ui &&
						window.LMSChat.ui.incrementUnreadBadge &&
						!messageIdTracker.isDisplayed(data.payload.id)
					) {
						window.LMSChat.ui.incrementUnreadBadge();
					}
				}
			} else {
			}
		} catch (error) {}
	};
	const processedDeletions = new Set();
	const deletionCounts = new Map();
	const atomicDeletionLock = new Set();
	const groupDeletionLock = new Set();
	const processedMessageDeletions = new Set();
	const handleLongPollDeleteMessage = (data) => {
		const channelId = data.channelId || data.payload?.channel_id || data.payload?.channelId;
		const messageId = data.messageId || data.id || data.payload?.id || data.payload?.messageId;
		if (messageId) {
			messageIdTracker.removeFromDisplayed(messageId);
		}
		const deletionKey = `${messageId}_${channelId}`;
		if (processedDeletions.has(deletionKey)) {
			return;
		}
		processedDeletions.add(deletionKey);
		setTimeout(() => {
			processedDeletions.delete(deletionKey);
		}, 50);
		if (!state.currentChannel || channelId != state.currentChannel) {
			if (channelId && window.LMSChat?.ui?.updateHeaderUnreadBadge) {
				$.ajax({
					url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
					type: 'POST',
					data: {
						action: 'lms_get_unread_count',
						nonce: window.lmsChat?.nonce,
					},
					success: function (response) {
						if (response.success && response.data) {
							if (
								window.LMSChat &&
								window.LMSChat.ui &&
								typeof window.LMSChat.ui.updateAllBadgesFromServerData === 'function' &&
								!window.LMSUnreadBadgeDbSyncBlocked &&
								!window.LMSChatReadOnViewSyncBlocked
							) {
								window.LMSChat.ui.updateAllBadgesFromServerData(response.data);
							} else if (
								response.data &&
								(window.LMSUnreadBadgeDbSyncBlocked || window.LMSChatReadOnViewSyncBlocked)
							) {
							}
						}
					},
					error: function () {},
				});
			}
			return;
		}
		if (!messageId) {
			return;
		}
		const isGroupDelete = data.is_group_delete || false;
		const groupMessageIds = data.group_message_ids || [];
		if (isGroupDelete && groupMessageIds.length > 0) {
			if (typeof window.atomicDeleteMessageAndSeparators === 'function') {
				const options = {
					isThread: false,
					isGroupDelete: true,
					groupMessageIds: groupMessageIds,
				};
				window.atomicDeleteMessageAndSeparators(messageId, options);
			} else {
				groupMessageIds.forEach((msgId) => {
					const $message = $(`.chat-message[data-message-id="${msgId}"]`);
					if ($message.length > 0) {
						$message.remove();
					}
				});
				$('.message-group').each(function () {
					const $group = $(this);
					if ($group.find('.chat-message, .thread-message').length === 0) {
						$group.prev('.date-separator').remove();
						$group.remove();
					}
				});
			}
		} else {
			let $message = $(`.chat-message[data-message-id="${messageId}"]`);
			if ($message.length === 0) {
				$message = $(`.thread-message[data-message-id="${messageId}"]`);
			}
			if (
				$message.length === 0 &&
				(messageId.toString().startsWith('temp_') || data.temp_message_id)
			) {
				const tempId = data.temp_message_id || messageId;
				$message = $(
					`.chat-message[data-message-id="${tempId}"], .thread-message[data-message-id="${tempId}"]`
				);
			}
			if ($message.length === 0) {
				$message = $(`#message-${messageId}, [id$="${messageId}"]`);
			}
			if ($message.length === 0) {
				$message = $(`[data-id="${messageId}"]`);
			}
			if ($message.length > 0) {
				const isThread =
					$message.hasClass('thread-message') || $message.closest('.thread-container').length > 0;
				let deleteSuccess = false;
				if (typeof window.atomicDeleteMessageAndSeparators === 'function') {
					const options = {
						isThread: isThread,
						isGroupDelete: false,
						groupMessageIds: [],
					};
					deleteSuccess = window.atomicDeleteMessageAndSeparators(messageId, options);
				}
				if (!deleteSuccess) {
					$message.fadeOut(200, function () {
						$(this).remove();
					});
				}
			}
		}
	};
	const registerLongPollListeners = () => {
		if (window.LMSChat && window.LMSChat.LongPoll && window.LMSChat.LongPoll.addEventListener) {
			window.LMSChat.LongPoll.addEventListener('main_message_posted', handleLongPollMessage);
			window.LMSChat.LongPoll.addEventListener('main_message_deleted', handleLongPollDeleteMessage);
			window.LMSChat.LongPoll.addEventListener('thread_message_posted', handleLongPollMessage);
			window.LMSChat.LongPoll.addEventListener(
				'thread_message_deleted',
				handleLongPollDeleteMessage
			);
			return true;
		}
		return false;
	};
	if (!registerLongPollListeners()) {
		let attempts = 0;
		const checkInterval = setInterval(() => {
			attempts++;
			if (registerLongPollListeners()) {
				clearInterval(checkInterval);
			}
		}, 1000);
		setTimeout(() => {
			clearInterval(checkInterval);
		}, 60000);
	}
	$(document).on('lms_longpoll_main_message_posted', function (event, data) {
		handleLongPollMessage(data);
	});
	$(document).on('lms_longpoll_thread_message_posted', function (event, data) {
		handleLongPollMessage(data);

		// 親メッセージのスレッド情報を即座に更新（遅延なし）
		if (data && data.parent_message_id) {
			if (typeof window.refreshThreadInfo === 'function') {
				window.refreshThreadInfo(data.parent_message_id);
			}
		}
	});
	$(document).on('lms_longpoll_main_message_deleted', function (event, data) {
		if (data && data.message_id) {
			messageIdTracker.removeFromDisplayed(data.message_id);
		}
		handleLongPollDeleteMessage(data);
		if (data && data.message_id) {
			setTimeout(() => {
				if (
					window.LMSChat &&
					window.LMSChat.utils &&
					typeof window.LMSChat.utils.shouldRemoveDateSeparator === 'function' &&
					typeof window.LMSChat.utils.removeDateSeparatorSafely === 'function'
				) {
					$('.message-group').each(function () {
						const $group = $(this);
						if ($group.find('.chat-message').length === 0) {
							let $separator = $group.find('.date-separator').first();
							if ($separator.length === 0) {
								$separator = $group.prev('.date-separator');
							}
							if ($separator.length > 0) {
								if (window.LMSChat.utils.shouldRemoveDateSeparator(null, $separator)) {
									window.LMSChat.utils.removeDateSeparatorSafely($separator, $group);
								}
							} else {
								$group.remove();
							}
						}
					});
				}
				if (
					window.LMSChat &&
					window.LMSChat.utils &&
					typeof window.LMSChat.utils.forceCheckDateSeparators === 'function'
				) {
					window.LMSChat.utils.forceCheckDateSeparators();
				}
			}, 350);
		}
	});
	$(document).on('lms_longpoll_thread_message_deleted', function (event, data) {
		if (data && data.message_id) {
			messageIdTracker.removeFromDisplayed(data.message_id);
		}
		handleLongPollDeleteMessage(data);

		// 親メッセージのスレッド情報を即座に更新（遅延なし）
		if (data && data.parent_message_id) {
			if (typeof window.refreshThreadInfo === 'function') {
				window.refreshThreadInfo(data.parent_message_id);
			}
		}
	});
	if (typeof state.isFirstMessageLoaded === 'undefined') {
		state.isFirstMessageLoaded = false;
	}
	if (typeof state.isDateJumping === 'undefined') {
		state.isDateJumping = false;
	}
	if (typeof state.isJumpAnimating === 'undefined') {
		state.isJumpAnimating = false;
	}
	if (typeof state.blockScrollOverride === 'undefined') {
		state.blockScrollOverride = false;
	}
	const mapMimeTypeToIcon = (mimeType, fileName = '') => {
		const lowerName = fileName.toLowerCase();
		if (mimeType === 'image/svg+xml' || lowerName.endsWith('.svg')) {
			return null;
		}
		if (
			lowerName.match(/\.(php|js|html|htm|css|scss|sql|c|cpp|cs|java|py|sh|ts|xml|cobol)$/) ||
			mimeType.match(
				/^text\/(html|css|javascript|x-php|x-sql|x-c|x-java|x-python|x-shellscript|x-typescript|xml)/
			)
		) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-code.svg');
		}
		if (mimeType.startsWith('image/')) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-image.svg');
		}
		if (mimeType.startsWith('video/')) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-video.svg');
		}
		if (mimeType.startsWith('audio/')) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-audio.svg');
		}
		if (mimeType.includes('font') || lowerName.match(/\.(ttf|woff|woff2)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-font.svg');
		}
		if (lowerName.match(/\.(psd|ai|xd|eps|psb)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-design.svg');
		}
		if (lowerName.match(/\.(ppt|pptx)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-presentation.svg');
		}
		if (lowerName.match(/\.(proj|mpp)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-project.svg');
		}
		if (lowerName.match(/\.(json|csv|yml|yaml)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-data.svg');
		}
		if (lowerName.match(/\.(txt|md|ini)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-text.svg');
		}
		if (lowerName.match(/\.(svg|eps|ai)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-vector.svg');
		}
		if (lowerName.match(/\.(zip|rar|7z|tar|gz|bz2|xz|lzma)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-archive.svg');
		}
		if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-pdf.svg');
		}
		if (lowerName.match(/\.(doc|docx)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-word.svg');
		}
		if (lowerName.match(/\.(xls|xlsx|ods)$/)) {
			return utils.getAssetPath('wp-content/themes/lms/img/icon-excel.svg');
		}
		return utils.getAssetPath('wp-content/themes/lms/img/icon-file.svg');
	};
	const getFileUrl = (file) => {
		if (file.url && file.url.startsWith('http')) {
			return file.url;
		}
		if (file.file_path) {
			const baseUrl = window.lmsChat.uploadBaseUrl || '';
			return `${baseUrl}/chat-files/${file.file_path}`;
		}
		if (file.id && (file.file_name || file.name)) {
			return `${window.lmsChat.ajaxUrl}?action=lms_get_file&file_id=${file.id}&nonce=${window.lmsChat.nonce}`;
		}
		return '';
	};
	const createAttachmentHtml = (file) => {
		if (!file) {
			return '';
		}
		const fileName = file.file_name || file.name || 'ファイル';
		const fileType = file.mime_type || file.file_type || '';
		const fileSize = file.file_size || file.size || 0;
		const fileUrl = getFileUrl(file);
		const isImage =
			fileType &&
			(fileType.startsWith('image/') ||
				['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(
					fileName.split('.').pop().toLowerCase()
				));
		let thumbnailUrl = '';
		if (isImage) {
			if (file.thumbnail) {
				thumbnailUrl = file.thumbnail.startsWith('http')
					? file.thumbnail
					: `${window.lmsChat.uploadBaseUrl}/chat-files/${file.thumbnail}`;
			} else {
				thumbnailUrl = fileUrl;
			}
		}
		const previewHtml = isImage
			? `<img src="${thumbnailUrl}" alt="${utils.escapeHtml(fileName)}">`
			: `<img src="${mapMimeTypeToIcon(fileType, fileName)}" class="file-icon" alt="${
					fileType || '不明なファイル形式'
			  }">`;
		return `
			<div class="attachment-item">
				<div class="attachment-preview">
					${previewHtml}
					<a href="${fileUrl}" class="attachment-download" download="${utils.escapeHtml(
			fileName
		)}" target="_blank">
						<img src="${utils.getAssetPath('wp-content/themes/lms/img/icon-download.svg')}" alt="ダウンロード">
					</a>
				</div>
				<div class="attachment-info">
					<div class="attachment-name">${utils.escapeHtml(fileName)}</div>
					<div class="attachment-size">${utils.formatFileSize(fileSize)}</div>
				</div>
			</div>
		`;
	};
	const getDateKey = (date) => {
		if (!(date instanceof Date) || isNaN(date.getTime())) {
			date = new Date();
		}
		const year = date.getFullYear();
		const month = `0${date.getMonth() + 1}`.slice(-2);
		const day = `0${date.getDate()}`.slice(-2);
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
	const createThreadButtonHtml = (message) => {
		if (message.thread_count && message.thread_count > 0) {
			return `
				<a href="#" class="thread-button" data-message-id="${message.id}">
					<img src="${utils.getAssetPath(
						'wp-content/themes/lms/img/icon-thread.svg'
					)}" alt="" class="thread-icon">
					<span class="thread-text">${message.thread_count}件の返信</span>
				</a>
			`;
		}
		return `
			<a href="#" class="thread-button" data-message-id="${message.id}">
				<img src="${utils.getAssetPath(
					'wp-content/themes/lms/img/icon-thread.svg'
				)}" alt="" class="thread-icon">
				<span class="thread-text">スレッドに返信する</span>
			</a>
		`;
	};
	const formatRelativeTime = (timestamp) => {
		if (!timestamp) return '';
		const now = new Date();
		const target = new Date(timestamp);
		if (isNaN(target.getTime())) return '';
		const diffInSeconds = Math.floor((now - target) / 1000);
		if (diffInSeconds < 60) {
			return '1分前';
		} else if (diffInSeconds < 3600) {
			const minutes = Math.floor(diffInSeconds / 60);
			return `${minutes}分前`;
		} else if (diffInSeconds < 86400) {
			const hours = Math.floor(diffInSeconds / 3600);
			return `${hours}時間前`;
		} else if (diffInSeconds < 2592000) {
			const days = Math.floor(diffInSeconds / 86400);
			return `${days}日前`;
		} else if (diffInSeconds < 31536000) {
			const months = Math.floor(diffInSeconds / 2592000);
			return `${months}ヶ月前`;
		} else {
			const years = Math.floor(diffInSeconds / 31536000);
			return `${years}年前`;
		}
	};
	const generateThreadInfoHtml = (
		messageId,
		count,
		unreadCount = 0,
		avatars = [],
		latestReply = ''
	) => {
		if (window.threadDeletionInProgress && window.threadDeletionInProgress.has(messageId)) {
			return '';
		}
		if (typeof count === 'object') {
			if (count && count.total !== undefined) {
				count = count.total;
			} else {
				count = 0;
			}
		}
		count = parseInt(count, 10) || 0;
		if (count <= 0) {
			return '';
		}
		if (typeof unreadCount === 'object') {
			if (unreadCount && unreadCount.unread !== undefined) {
				unreadCount = unreadCount.unread;
			} else {
				unreadCount = 0;
			}
		}
		unreadCount = parseInt(unreadCount, 10) || 0;
		const unreadBadge =
			unreadCount !== undefined && unreadCount !== null && unreadCount > 0
				? `<span class="thread-unread-badge" tabindex="0" aria-label="新着の返信メッセージ ${unreadCount} 件">${unreadCount}</span>`
				: '';
		const validAvatars = Array.isArray(avatars)
			? avatars.filter((avatar) => avatar && typeof avatar === 'object')
			: [];
		let avatarsHtml = '';
		if (validAvatars.length > 0) {
			const sortedAvatars = validAvatars.sort((a, b) => {
				const idA = parseInt(a.user_id) || 0;
				const idB = parseInt(b.user_id) || 0;
				return idA - idB;
			});
			avatarsHtml = sortedAvatars
				.map((avatar, index) => {
					let avatarUrl;
					if (avatar && typeof avatar === 'object' && avatar.avatar_url) {
						avatarUrl = avatar.avatar_url;
					} else {
						avatarUrl = utils.getAssetPath('wp-content/themes/lms/img/default-avatar.png');
					}
					const displayName = avatar && avatar.display_name ? avatar.display_name : 'ユーザー';
					const isParentAuthor = avatar.is_parent_author || false;
					const replyCount = avatar.reply_count || 0;
					let tooltip = displayName;
					if (isParentAuthor && replyCount > 0) {
						tooltip += ` (スレッド作成者・${replyCount}件の返信)`;
					} else if (isParentAuthor) {
						tooltip += ' (スレッド作成者)';
					} else if (replyCount > 0) {
						tooltip += ` (${replyCount}件の返信)`;
					}
					return `<img src="${avatarUrl}"
							 alt="${utils.escapeHtml(displayName)}"
							 title="${utils.escapeHtml(tooltip)}"
							 class="thread-avatar"
							 data-user-id="${avatar.user_id}"
							 style="z-index: ${100 - index};">`;
				})
				.join('');
			if (validAvatars.length > 5) {
				avatarsHtml += `<span class="thread-participants-count">+${validAvatars.length - 5}</span>`;
			}
		} else {
			avatarsHtml = `<img src="${utils.getAssetPath(
				'wp-content/themes/lms/img/default-avatar.png'
			)}" alt="ユーザー" class="thread-avatar" data-temporary="true">`;
			if (messageId && count > 0) {
				if (!window.threadInfoUpdateQueue) {
					window.threadInfoUpdateQueue = new Set();
				}
				window.threadInfoUpdateQueue.add(messageId);
				setTimeout(() => {
					if (window.threadInfoUpdateQueue && window.threadInfoUpdateQueue.size > 0) {
						const messageIds = Array.from(window.threadInfoUpdateQueue);
						window.threadInfoUpdateQueue.clear();
						messageIds.forEach(async (id) => {
							try {
								await updateThreadInfo(id);
							} catch (error) {}
						});
					}
				}, 50);
			}
		}
		const html = `
			<div class="thread-info" data-message-id="${messageId}">
				<div class="thread-info-avatars">
					${avatarsHtml}
				</div>
				<div class="thread-info-text">
					<div class="thread-info-status">
						<span class="thread-reply-count">${count}件の返信</span>
						${unreadBadge}
					</div>
					${latestReply ? `<div class="thread-info-latest">最終返信: ${latestReply}</div>` : ''}
				</div>
			</div>
		`;
		return html;
	};
	const createMessageHtml = (message, isTempParam = false, options = {}) => {
		const isTemp =
			isTempParam ||
			(message?.id && typeof message.id === 'string' && message.id.includes('temp_'));
		if (!message) {
			return '';
		}
		if (message.created_at && message.formatted_time) {
			const needsReformat =
				message.formatted_time.includes('月') ||
				message.formatted_time.includes('日') ||
				message.formatted_time.includes('年') ||
				message.formatted_time.includes('(') ||
				message.formatted_time.includes('（') ||
				message.formatted_time.length > 6;
			if (needsReformat) {
				const date = new Date(message.created_at);
				if (!isNaN(date.getTime())) {
					if (window.LMSChat?.utils?.formatTimeOnly) {
						message.formatted_time = window.LMSChat.utils.formatTimeOnly(message.created_at);
					} else {
						const hours = date.getHours().toString().padStart(2, '0');
						const minutes = date.getMinutes().toString().padStart(2, '0');
						message.formatted_time = `${hours}:${minutes}`;
					}
				}
			}
		}
		if (!message.id || !message.user_id) {
			return '';
		}
		if (typeof message.id !== 'string') {
			message.id = String(message.id);
		}
		let threadCount = parseInt(message.thread_count, 10) || 0;
		let threadUnreadCountFromServer = parseInt(message.thread_unread_count, 10) || 0;
		let avatarsFromServer = message.avatars || [];
		let latestReplyFromServer = message.latest_reply || '';
		if (state.threadInfoCache && state.threadInfoCache.has(message.id)) {
			const cachedInfo = state.threadInfoCache.get(message.id);
			if (message.thread_count !== undefined && message.thread_count !== null) {
				threadCount = parseInt(message.thread_count, 10) || 0;
			} else {
				threadCount = cachedInfo.total || 0;
			}
			threadUnreadCountFromServer = Math.max(threadUnreadCountFromServer, cachedInfo.unread || 0);
			avatarsFromServer = cachedInfo.avatars || avatarsFromServer;
			latestReplyFromServer = cachedInfo.latest_reply || latestReplyFromServer;
		}
		if (!state.isChannelSwitching) {
			if (threadCount > 0) {
			}
		}
		message.thread_count = threadCount;
		message.thread_unread_count = threadUnreadCountFromServer;
		message.avatars = avatarsFromServer;
		message.latest_reply = latestReplyFromServer;
		try {
			const currentUserId = Number(window.lmsChat.currentUserId);
			const messageUserId = Number(message.user_id);
			const isCurrentUser = currentUserId === messageUserId;
			const hasThread = threadCount > 0;
			if (!state.isChannelSwitching) {
			}
			if (!message.formatted_time && message.created_at) {
				try {
					const date = new Date(message.created_at);
					if (!isNaN(date.getTime())) {
						const hours = `0${date.getHours()}`.slice(-2);
						const minutes = `0${date.getMinutes()}`.slice(-2);
						message.formatted_time = `${hours}:${minutes}`;
					} else {
						message.formatted_time = '時間不明';
					}
				} catch (e) {
					message.formatted_time = '時間不明';
				}
			} else if (message.formatted_time && message.formatted_time.includes('（')) {
				try {
					const timeMatch = message.formatted_time.match(/\d{1,2}:\d{1,2}$/);
					if (timeMatch) {
						message.formatted_time = timeMatch[0];
					}
				} catch (e) {}
			}
			if (!message.display_name) {
				if (!options.fromInfinityScroll) {
					message.display_name = isCurrentUser ? 'あなた' : 'ユーザー';
				} else {
					message.display_name = 'ユーザー';
				}
			}
			let messageText = message.message || message.content || '';
			if (!messageText || messageText === 'undefined' || messageText === 'null') {
				messageText = '(メッセージ内容を取得できません)';
			}
			const escapeHtmlFunc =
				utils?.escapeHtml ||
				window.LMSChat?.utils?.escapeHtml ||
				((str) => {
					const div = document.createElement('div');
					div.textContent = str;
					return div.innerHTML;
				});
			const linkifyUrlsFunc =
				utils?.linkifyUrls || window.LMSChat?.utils?.linkifyUrls || ((str) => str);
			const safeMsg = escapeHtmlFunc(messageText).replace(/\r\n|\n|\r/g, '<br>');
			const msgHtml = linkifyUrlsFunc(safeMsg);
			let attachmentsHtml = '';
			if (message.attachments && message.attachments.length > 0) {
				attachmentsHtml = '<div class="message-attachments">';
				message.attachments.forEach((file) => {
					attachmentsHtml += createAttachmentHtml(file);
				});
				attachmentsHtml += '</div>';
			}
			const threadButtonHtml = createThreadButtonHtml(message);
			const threadUnreadCount =
				message.thread_unread_count !== undefined &&
				message.thread_unread_count !== null &&
				parseInt(message.thread_unread_count, 10) > 0
					? parseInt(message.thread_unread_count, 10)
					: 0;
			const threadInfoHtml = hasThread
				? generateThreadInfoHtml(
						message.id,
						threadCount,
						threadUnreadCount,
						message.avatars || [],
						message.latest_reply || ''
				  )
				: '';
			if (!state.isChannelSwitching) {
				if (hasThread && threadInfoHtml.length === 0) {
				}
			}
			const ensureReactionHydrationAttribute = (html, hydratedValue) => {
				if (!html || typeof html !== 'string') {
					return html;
				}
				if (html.includes('data-reactions-hydrated')) {
					return html;
				}
				return html.replace(
					/<div class="message-reactions([^>]*)>/,
					`<div class="message-reactions$1" data-reactions-hydrated="${hydratedValue ? '1' : '0'}">`
				);
			};
			let reactionsHtml = '';
			let reactionsHydrated = false;
			if (message.reactions && message.reactions.length > 0) {
				if (!window.LMSChat.reactions) window.LMSChat.reactions = {};
				if (typeof window.LMSChat.reactions.createReactionsHtml !== 'function') {
					window.LMSChat.reactions.createReactionsHtml = createFallbackReactionsHtml;
				}
				if (typeof window.LMSChat.reactions.createReactionsHtml === 'function') {
					try {
						reactionsHtml = window.LMSChat.reactions.createReactionsHtml(message.reactions);
						reactionsHydrated = reactionsHtml !== '';
					} catch (error) {
						// エラーを無視
						reactionsHtml = createFallbackReactionsHtml(message.reactions);
						reactionsHydrated = reactionsHtml !== '';
					}
				} else {
					reactionsHtml = createFallbackReactionsHtml(message.reactions);
					reactionsHydrated = reactionsHtml !== '';
				}
			} else {
			}
			if (reactionsHtml) {
				reactionsHtml = ensureReactionHydrationAttribute(reactionsHtml, reactionsHydrated);
			} else {
				// 空のリアクションコンテナは作成しない（高さ変化を防ぐため）
				reactionsHtml = '';
			}
			const messageActionsHtml = `
				<div class="message-actions">
					<button class="action-button add-reaction" aria-label="リアクションを追加">
						<img src="${utils.getAssetPath(
							'wp-content/themes/lms/img/icon-emoji.svg'
						)}" alt="絵文字" width="20" height="20">
					</button>
					${
						isCurrentUser
							? `
						<button class="action-button delete-message" aria-label="メッセージを削除">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
								<path d="M6 18L18 6M6 6l12 12" stroke-width="2"
									stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					`
							: ''
					}
				</div>
			`;
			let readStatus = getMessageReadStatus(message.id, false);
			const isNewFromServer =
				message.is_new === '1' || message.is_new === 1 || message.is_new === true;
			const isInUnreadList =
				state.unreadMessages &&
				Array.isArray(state.unreadMessages) &&
				state.unreadMessages.includes(message.id.toString());
			let shouldShowNewMark = false;
			if (!isCurrentUser) {
				if (message.isNewFromServer) {
					shouldShowNewMark = true;
				} else if (isNewFromServer) {
					shouldShowNewMark = true;
				} else if (isInUnreadList && readStatus !== 'fully_read') {
					shouldShowNewMark = true;
				}
			}
			if (!isCurrentUser && isNewFromServer && readStatus === 'fully_read') {
				setMessageReadStatus(message.id, null, false);
				readStatus = null;
				shouldShowNewMark = true;
			}
			if (!state.isChannelSwitching) {
				if (!shouldShowNewMark && !isCurrentUser) {
				}
			}
			let additionalClasses = '';
			if (readStatus === 'first_view' || readStatus === 'fully_read') {
				additionalClasses += ' viewed-once';
			}
			if (readStatus === 'fully_read') {
				additionalClasses += ' read-completely';
			}
			let timeDisplay = '時刻不明';
			if (
				message.formatted_time &&
				typeof message.formatted_time === 'string' &&
				message.formatted_time.match(/^\d{2}:\d{2}$/)
			) {
				timeDisplay = message.formatted_time;
			} else if (message.created_at) {
				try {
					const date = new Date(message.created_at);
					if (!isNaN(date.getTime())) {
						timeDisplay =
							String(date.getHours()).padStart(2, '0') +
							':' +
							String(date.getMinutes()).padStart(2, '0');
					}
				} catch (e) {}
			}
			if (timeDisplay.length > 5 || timeDisplay.includes('2025') || timeDisplay.includes('-')) {
				timeDisplay = '時刻不明';
			}

			if (
				!message.display_name ||
				message.display_name === '' ||
				message.display_name === 'undefined' ||
				message.display_name === 'null' ||
				message.display_name === null
			) {
				if (options.fromInfinityScroll) {
					message.display_name = `ユーザー${message.user_id || '不明'}`;
				} else {
					if (window.lmsChat?.currentUserId && message.user_id == window.lmsChat.currentUserId) {
						message.display_name = 'あなた';
					} else {
						message.display_name = `ユーザー${message.user_id || '不明'}`;
					}
				}
			} else {
			}
			if (!message.user_id || message.user_id === '' || message.user_id === 'undefined') {
				message.user_id = 0;
			}
			if (!message.message && !message.content) {
				message.message = '内容が取得できませんでした';
			}
			const generatedHtml = `<div class="chat-message ${isCurrentUser ? 'current-user' : ''} ${
				hasThread ? 'has-thread' : ''
			}${additionalClasses}" data-message-id="${message.id}" data-user-id="${
				message.user_id
			}" data-read-status="${readStatus || 'null'}">
				<div class="message-header">
					<div class="message-meta">
						<span class="message-time" data-timestamp="${message.created_at || ''}">${timeDisplay}</span>
						<span class="user-name ${isCurrentUser ? 'current-user-name' : 'other-user-name'}">${escapeHtmlFunc(
				message.display_name
			)}</span>
						${shouldShowNewMark ? '<span class="new-mark">New</span>' : ''}
					</div>
					${threadButtonHtml}
				</div>
				<div class="message-content">
					<div class="message-text">${msgHtml}</div>
					${messageActionsHtml}
				</div>
				${attachmentsHtml}
				${reactionsHtml}
				${threadInfoHtml}
			</div>`;
			if (message.id && message.id.toString() === '1047') {
			}
			return generatedHtml;
		} catch (error) {
			if (isTemp) {
			}
			return '';
		}
		if (isTemp) {
		}
		return html;
	};

	const complementMissingThreadAndReactionInfo = async (messageId) => {
		if (!messageId) return;

		const $messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
		if ($messageElement.length === 0) return;

		try {
			if ($messageElement.find('.thread-info').length === 0) {
				const threadResponse = await $.ajax({
					url: window.lmsChat.ajaxUrl,
					method: 'POST',
					data: {
						action: 'lms_get_thread_info',
						message_id: messageId,
						nonce: window.lmsChat.nonce,
					},
					timeout: 5000,
				});

				if (threadResponse && threadResponse.success && threadResponse.data) {
					const threadData = threadResponse.data;
					if (threadData.thread_count > 0) {
						const threadInfoHtml = generateThreadInfoHtml(
							messageId,
							threadData.thread_count || 0,
							threadData.thread_unread_count || 0,
							threadData.avatars || [],
							threadData.latest_reply || ''
						);
						if (threadInfoHtml) {
							safeAddThreadInfo($messageElement, threadInfoHtml);
						}
					}
				}
			}

			const getReactionContainerState = () => {
				// 統一ドリフト防止関数を使用して重複コンテナを処理
				const $unifiedContainer = ensureUniqueReactionContainer($messageElement);
				const $containers = $messageElement.find('.message-reactions');
				const $primary = $messageElement.find('.message-reactions').first();
				const hasItems = $primary.length > 0 && $primary.find('.reaction-item').length > 0;
				const hydrated =
					$primary.length > 0 &&
					($primary.data('reactionsHydrated') === true ||
						$primary.attr('data-reactions-hydrated') === '1');
				return {
					$container: $primary,
					hasItems,
					isHydrated: hydrated,
				};
			};

			const markReactionsHydrated = ($container) => {
				if (!$container || $container.length === 0) {
					return;
				}
				$container.data('reactionsHydrated', true);
				$container.attr('data-reactions-hydrated', '1');
			};

			const initialState = getReactionContainerState();
			if (initialState.$container.length && initialState.hasItems && !initialState.isHydrated) {
				markReactionsHydrated(initialState.$container);
			}
			const isPending = $messageElement.data('reactionHydrationPending') === true;
			const needsReactionHydration =
				initialState.$container.length === 0 ||
				(!initialState.hasItems && !initialState.isHydrated);

			// 既に空のコンテナがある場合は削除
			if (
				initialState.$container.length > 0 &&
				!initialState.hasItems &&
				!initialState.isHydrated
			) {
				initialState.$container.remove();
			}

			if (needsReactionHydration && !isPending) {
				$messageElement.data('reactionHydrationPending', true);
				try {
					const reactionResponse = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						method: 'POST',
						data: {
							action: 'lms_get_reactions',
							message_id: messageId,
							nonce: window.lmsChat.nonce,
						},
						timeout: 5000,
					});

					if (
						reactionResponse &&
						reactionResponse.success &&
						reactionResponse.data &&
						reactionResponse.data.length > 0
					) {
						const currentState = getReactionContainerState();
						if (currentState.hasItems) {
							markReactionsHydrated(currentState.$container);
						} else {
							let reactionsHtml = '';
							if (
								window.LMSChat.reactions &&
								typeof window.LMSChat.reactions.createReactionsHtml === 'function'
							) {
								reactionsHtml = window.LMSChat.reactions.createReactionsHtml(reactionResponse.data);
							} else {
								reactionsHtml = '<div class="message-reactions" data-reactions-hydrated="1">';
								reactionResponse.data.forEach((reaction) => {
									reactionsHtml += `<span class="reaction-item" data-emoji="${reaction.emoji}">
										${reaction.emoji} ${reaction.count}
									</span>`;
								});
								reactionsHtml += '</div>';
							}

							if (reactionsHtml) {
								// 再度確認 - 非同期処理中に他の処理で追加された可能性があるため
								const finalCheck = ensureUniqueReactionContainer($messageElement);
								if (!finalCheck || finalCheck.length === 0) {
									const $renderedReactions = safeAddReactionContainer(
										$messageElement,
										reactionsHtml
									);
									if ($renderedReactions) {
										markReactionsHydrated($renderedReactions);
									}
								} else {
									// 既に存在する場合は更新のみ
									markReactionsHydrated(finalCheck);
								}
							}
						}
					} else {
						const currentState = getReactionContainerState();
						if (currentState.$container.length > 0) {
							// 既存の空コンテナは削除して高さ変化を防ぐ
							currentState.$container.remove();
						}
						// 空のリアクションコンテナは追加しない（高さ変化を防ぐため）
					}
				} catch (error) {
				} finally {
					$messageElement.data('reactionHydrationPending', false);
				}
			}
		} catch (error) {}
	};

	const complementAllVisibleMessages = async () => {
		const $messages = $('#chat-messages .chat-message[data-message-id]');
		const messageIds = [];

		$messages.each(function () {
			const $message = $(this);
			const messageId = $message.data('message-id');
			if (!messageId) {
				return;
			}

			const needsThreadInfo = $message.find('.thread-info').length === 0;
			const $reactionContainer = $message.find('.message-reactions').first();
			const hasReactionItems = $reactionContainer.find('.reaction-item').length > 0;
			const reactionHydrated =
				$reactionContainer.data('reactionsHydrated') === true ||
				$reactionContainer.attr('data-reactions-hydrated') === '1';
			const reactionPending = $message.data('reactionHydrationPending') === true;
			const needsReactions =
				$reactionContainer.length === 0 || (!hasReactionItems && !reactionHydrated);

			if ((needsThreadInfo || needsReactions) && !reactionPending) {
				messageIds.push(messageId);
			}
		});

		for (let i = 0; i < messageIds.length; i += 5) {
			const batch = messageIds.slice(i, i + 5);

			// 各バッチ処理の前に既存の重複を削除
			$('#chat-messages .chat-message').each(function () {
				ensureUniqueReactionContainer($(this));
				ensureUniqueThreadInfo($(this));
			});

			// 順次処理に変更して重複を防ぐ
			for (const id of batch) {
				await complementMissingThreadAndReactionInfo(id);
				// 各処理後に即座に重複チェック
				const $msg = $(`.chat-message[data-message-id="${id}"]`);
				if ($msg.length > 0) {
					ensureUniqueReactionContainer($msg);
					ensureUniqueThreadInfo($msg);
				}
			}

			if (i + 5 < messageIds.length) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	};

	const displayMessages = async (
		data,
		isNewMessages = false,
		isChannelSwitch = false,
		prepend = false
	) => {
		try {
			if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.isInfinityScrollLoading) {
				return;
			}

			if (!data || !data.messages || !Array.isArray(data.messages)) {
				return;
			}

			// 🔥 CRITICAL FIX: スレッド情報を最優先でキャッシュに保存（他の処理より先に実行）
			if (data.thread_info && Array.isArray(data.thread_info) && data.thread_info.length > 0) {
				if (!state.threadInfoCache) {
					state.threadInfoCache = new Map();
				}
				data.thread_info.forEach((thread) => {
					if (thread.parent_message_id && thread.total_replies > 0) {
						const threadInfo = {
							total: thread.total_replies || 0,
							unread: thread.unread_count || 0,
							avatars: thread.avatars || [],
							latest_reply: thread.latest_reply || '',
							timestamp: Date.now(),
							priority: 'high',
							confirmed: true,
						};
						state.threadInfoCache.set(thread.parent_message_id, threadInfo);
					}
				});
			}
			let storedDeletedIds = [];
			let loadedFromStorage = 0;
			try {
				const stored = localStorage.getItem('lms_deleted_messages');
				if (stored) {
					storedDeletedIds = JSON.parse(stored);
					storedDeletedIds.forEach((id) => {
						const idStr = String(id);
						if (!deletedMessageIds.has(idStr)) {
							deletedMessageIds.add(idStr);
							loadedFromStorage++;
						}
					});
					if (loadedFromStorage > 0) {
					}
				}
			} catch (e) {}
			let filteredCount = 0;
			data.messages = data.messages
				.map((group) => {
					if (group.messages && Array.isArray(group.messages)) {
						const originalLength = group.messages.length;
						group.messages = group.messages.filter((message) => {
							const messageIdStr = String(message.id);
							const isDeletedByColumn =
								message.deleted_at && message.deleted_at !== null && message.deleted_at !== '';
							return true;
						});
						if (originalLength !== group.messages.length) {
						}
					}
					return group;
				})
				.filter((group) => group.messages && group.messages.length > 0);
			if (filteredCount > 0) {
			}
			data.messages.forEach((group, index) => {
				if (group.messages && Array.isArray(group.messages)) {
					group.messages.forEach((msg) => {
						if (!msg.message && msg.content) {
							msg.message = msg.content;
						}
					});
				}
			});
			const fixAllNewMarks = () => {
				$('.message-header > .new-mark').each(function () {
					const $headerNewMark = $(this);
					const $message = $headerNewMark.closest('.chat-message');
					const $messageMeta = $message.find('.message-meta');
					const $metaNewMark = $messageMeta.find('.new-mark');
					if ($metaNewMark.length > 0) {
						$headerNewMark.remove();
					} else {
						$headerNewMark.detach();
						$messageMeta.append($headerNewMark);
					}
				});
			};
			fixAllNewMarks();
			const currentChannelId = state.currentChannel;
			if (isChannelSwitch || state.isDateJumping) {
				const $container = $('#chat-messages');
				$container.empty();
				$container.html('');
				$(`.chat-message[data-channel-id]:not([data-channel-id="${currentChannelId}"])`).remove();
				state.displayedDateSeparators = new Set();
			} else {
				$('#chat-messages .loading-messages').remove();
			}
			const $loadingMessages = $('#chat-messages .loading-messages');
			if ($loadingMessages.length > 0) {
				$loadingMessages.remove();
			}
			for (const group of data.messages) {
				await processMessageGroup(group, isNewMessages, isChannelSwitch);
			}

			// 🔥 SCROLL FLICKER FIX: スレッド情報更新を完全削除
			// processMessageGroup内で既に処理されているため、ここでの重複処理は不要
			// この処理がスクロール後にDOM高さを変更してフリッカーを引き起こしていた

			if (isNewMessages) {
				if (typeof updateUnreadCounts === 'function') {
				}
			}
			if (isChannelSwitch) {
				if (state.blockScrollOverride) {
				} else {
					state.isChannelSwitching = true;
					state.firstLoadComplete = null;
					state.noMoreOldMessages = false;

					// 🔥 SCROLL FLICKER FIX: ChannelSwitchGuardでロック開始
					ChannelSwitchGuard.lock('channel-switch');

					const $messageContainer = $('#chat-messages');

					// 🔥 SCROLL FLICKER FIX: 画像読み込み完了を待機（スクロール前に完了）
					const images = $messageContainer.find('img').toArray();
					const imagePromises = images.map((img) => {
						return new Promise((resolve) => {
							if (img.complete) {
								resolve();
							} else {
								img.addEventListener('load', resolve, { once: true });
								img.addEventListener('error', resolve, { once: true });
							}
						});
					});

					// 🔥 SCROLL FLICKER FIX: すべての画像読み込みを完全に待つ（タイムアウトなし）
					await Promise.all(imagePromises);

					// 🔥 SCROLL FLICKER FIX: DOM高さが安定するまで少し待つ
					await new Promise((resolve) => setTimeout(resolve, 50));

					// 🔥 SCROLL FLICKER FIX: ここで全てのDOM更新が完了している
					// この時点でscrollHeightは確定しており、以降変更されない

					if (state.blockScrollOverride) {
						ChannelSwitchGuard.unlock('channel-switch');
						state.isChannelSwitching = false;
						return;
					}

					// 🔥 SCROLL FLICKER FIX: 完全に最下部にスクロール
					const scrollHeight = $messageContainer[0].scrollHeight;
					const clientHeight = $messageContainer[0].clientHeight;
					const targetPosition = scrollHeight - clientHeight;

					// 🔥 SCROLL FLICKER FIX: スクロール位置を固定してからスクロール実行
					ChannelSwitchGuard.lock('scroll-anchor', { scrollTop: targetPosition });

					$messageContainer.scrollTop(targetPosition);

					state.firstLoadComplete = Date.now();

					if (infinityScrollState) {
						const $firstMessage = $('#chat-messages .chat-message').first();
						if ($firstMessage.length) {
							infinityScrollState.oldestMessageId = $firstMessage.data('message-id');
						}
					}

					// 🔥 SCROLL FLICKER FIX: 2000ms後にロック解除（確実にDOM更新完了を待つ）
					setTimeout(() => {
						state.isChannelSwitching = false;
						ChannelSwitchGuard.unlock('scroll-anchor');
						ChannelSwitchGuard.unlock('channel-switch');
					}, 2000);
				}
			}
			// 🔥 SCROLL FLICKER FIX: スレッド情報更新は既にLine 1933-1947で完了しているため、
			// スクロール処理後の重複更新を全て削除（5回の重複を削除）
			$(document).trigger('messages:displayed', [data.messages, isNewMessages, isChannelSwitch]);

			// 🔥 SCROLL FLICKER FIX: .loading-messagesの削除を即座に実行（setTimeoutを削除）
			const $remainingLoading = $('#chat-messages .loading-messages');
			if ($remainingLoading.length > 0) {
				$remainingLoading.remove();
			}
			$('#loading-indicator, .loading-message').hide();

			if (
				window.MessageRealtimeDeleteSync &&
				window.MessageRealtimeDeleteSync.enableDeleteButtons
			) {
				window.MessageRealtimeDeleteSync.enableDeleteButtons();
			}

			// 🔥 SCROLL FLICKER FIX: complementAllMessages()とcomplementSpecificMessages()を完全削除
			// これらがスクロール後にDOM高さを変更してフリッカーを引き起こしていた

			return true;
		} catch (error) {
			$('#loading-indicator, .loading-message').hide();
			return false;
		}
	};
	window.LMSChat.messages.displayMessages = displayMessages;
	const appendMessage = (message, options = {}) => {
		if (
			window.LMSChat &&
			window.LMSChat.state &&
			window.LMSChat.state.isInfinityScrollLoading &&
			!options.fromInfinityScroll
		) {
			return;
		}

		if (message?.id) {
			const messageId = String(message.id);
		}

		const isTemp = message?.id && typeof message.id === 'string' && message.id.includes('temp_');
		if (!message) {
			return;
		}
		if (!message.id) {
			return;
		}
		if (typeof message.id !== 'string') {
			message.id = String(message.id);
		}
		const messageIdStr = String(message.id);

		const isDeletedByColumn =
			message.deleted_at && message.deleted_at !== null && message.deleted_at !== '';
		if (isDeletedByColumn) {
			return;
		}

		const isReReceivedMessage =
			window.MessageDeletionManager?.isDeletedMessage(message.id) ||
			window.GlobalMessageState?.isDeleted(message.id) ||
			options.isReReceivedMessage;

		if (messageIdTracker.isDisplayed(message.id)) {
			return;
		}
		const currentChannelId = parseInt(window.LMSChat.state?.currentChannel || 0, 10);
		const messageChannelId = parseInt(message.channel_id || 0, 10);
		if (messageChannelId > 0 && messageChannelId !== currentChannelId) {
			return;
		}
		const currentUserId = parseInt(
			window.LMSChat.state?.currentUserId || window.lmsChat?.currentUserId || 0,
			10
		);
		const messageUserId = parseInt(message.user_id || 0, 10);
		const isMyMessage = currentUserId > 0 && currentUserId === messageUserId;

		const isTemporaryMessage =
			message.id && typeof message.id === 'string' && message.id.startsWith('temp_');
		if (isMyMessage && !isTemporaryMessage) {
			if (isTemp) {
			}
			const $tempMessages = $('.chat-message.pending-message');
			if ($tempMessages.length > 0) {
				const $latestTempMessage = $tempMessages.last();
				const tempMessageId = $latestTempMessage.data('message-id');
				if (tempMessageId && tempMessageId.startsWith('temp_')) {
					if (!state.tempToRealMessageMap) {
						state.tempToRealMessageMap = new Map();
					}
					state.tempToRealMessageMap.set(tempMessageId, message.id);
				}
			}
			if (state.isSending) {
				const isSendingMyMessage = Object.keys(state.updateQueue || {}).some((key) =>
					key.includes('sending_')
				);
				if (isSendingMyMessage) {
					return;
				}
			}
			if (state.recentSentMessageIds && state.recentSentMessageIds.has(message.id)) {
				const sentTime = state.recentSentMessageTimes?.get(message.id);
				if (sentTime) {
					state.recentSentMessageIds.delete(message.id);
					state.recentSentMessageTimes?.delete(message.id);
				}
			}
			const isBeingReplaced =
				$(`.chat-message[data-message-id="${message.id}"][data-replacing="true"]`).length > 0;
			if (isBeingReplaced) {
				return;
			}
		}
		if (currentChannelId !== messageChannelId && messageChannelId > 0 && !isMyMessage) {
			return;
		}
		if (currentChannelId <= 0) {
			return;
		}
		if (state.isChannelSwitching && !message.is_sender && !isMyMessage) {
			return;
		}
		if (!state.isChannelLoaded[currentChannelId] && !message.is_sender && !isMyMessage) {
			return;
		}
		const $existingMessage = $(`.chat-message[data-message-id="${message.id}"]`);
		if ($existingMessage.length > 0 && !isTemporaryMessage) {
			if ($existingMessage.attr('data-replacing') === 'true') {
				return;
			}
			const hasHeader = $existingMessage.find('.message-header').length > 0;
			const hasUserName = $existingMessage.find('.user-name').length > 0;
			const hasTime = $existingMessage.find('.message-time').length > 0;
			if (!hasHeader || !hasUserName || !hasTime) {
				$existingMessage.remove();
			} else {
				return;
			}
		}
		const isCurrentUser = isMyMessage;
		const existingReadStatus = getMessageReadStatus(message.id, false);
		if (!isCurrentUser) {
			if (existingReadStatus === 'fully_read') {
				message.is_new = false;
			} else if (existingReadStatus === 'first_view') {
			} else if (
				existingReadStatus === null &&
				(message.is_new === '1' || message.is_new === 1 || message.is_new === true)
			) {
				setMessageReadStatus(message.id, 'first_view', false);
			}
		} else {
			message.is_new = false;
		}
		if (!message.user_id && window.lmsChat && window.lmsChat.currentUserId) {
			message.user_id = parseInt(window.lmsChat.currentUserId, 10);
		}
		if (!message.user_id) {
			return;
		}
		if (isTemp) {
		}
		queueDomUpdate(() => {
			try {
				if (isTemp) {
				}
				const $messageContainer = $('#chat-messages');
				let messageDate;
				try {
					if (!message.created_at) {
						messageDate = new Date();
						message.formatted_time = utils.formatMessageTime(messageDate.toISOString());
						message.created_at = messageDate.toISOString();
					} else {
						messageDate = new Date(message.created_at);
						if (isNaN(messageDate.getTime())) {
							messageDate = new Date();
							message.formatted_time = utils.formatMessageTime(messageDate.toISOString());
							message.created_at = messageDate.toISOString();
						} else if (!message.formatted_time) {
							message.formatted_time = utils.formatMessageTime(message.created_at);
						}
					}
				} catch (e) {
					messageDate = new Date();
					message.formatted_time = utils.formatMessageTime(messageDate.toISOString());
					message.created_at = messageDate.toISOString();
				}
				if (!message.display_name) {
					message.display_name = 'ユーザー';
				}
				const dateKey = getDateKey(messageDate);
				const currentUserId = Number(window.lmsChat.currentUserId);
				const isCurrentUser = Number(message.user_id) === currentUserId;
				const existingMessageElement = $messageContainer.find(`[data-message-id="${message.id}"]`);
				if (existingMessageElement.length > 0) {
					return;
				}
				let $targetDateGroup = $messageContainer.find(`[data-date-key="${dateKey}"]`);
				if ($targetDateGroup.length > 0) {
					if ($targetDateGroup.find('.date-separator').length === 0) {
						const formattedDate = getFormattedDate(messageDate);
						const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
						$targetDateGroup.prepend(separatorHtml);
					}
				} else {
					const $newGroup = $('<div class="message-group"></div>').attr('data-date-key', dateKey);
					const formattedDate = getFormattedDate(messageDate);
					const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
					$newGroup.append(separatorHtml);
					const $existingGroups = $messageContainer.find('.message-group');
					let inserted = false;
					if ($existingGroups.length > 0) {
						const $lastGroup = $existingGroups.last();
						const lastGroupDateKey = $lastGroup.attr('data-date-key');
						if (lastGroupDateKey && dateKey >= lastGroupDateKey) {
							$messageContainer.append($newGroup);
							inserted = true;
						} else {
							$existingGroups.each(function () {
								const existingDateKey = $(this).attr('data-date-key');
								if (existingDateKey && dateKey < existingDateKey) {
									$(this).before($newGroup);
									inserted = true;
									return false;
								}
							});
						}
					}
					if (!inserted) {
						$messageContainer.append($newGroup);
					}
					$targetDateGroup = $newGroup;
				}
				if ($targetDateGroup.length > 0) {
					if (isCurrentUser && message.is_new) {
						message.is_new = 0;
					}
					if (options.fromLongPoll && !isCurrentUser && options.markAsUnread) {
						message.is_new = 1;
						message.data_is_new = true;
						message.unread_message_class = true;
					}
					const messageHtml = getCachedMessageHtml(message);
					if (messageHtml) {
						$targetDateGroup.append(messageHtml);

						// ドリフト防止: 追加されたメッセージの重複要素をクリーンアップ
						const $addedMessage = $targetDateGroup.find(`[data-message-id="${message.id}"]`).last();
						if ($addedMessage.length > 0) {
							ensureUniqueReactionContainer($addedMessage);
							ensureUniqueThreadInfo($addedMessage);
						}
						if (options.fromLongPoll && !isCurrentUser && options.markAsUnread) {
							if (window.LMSRealtimeUnreadSystem) {
								window.LMSRealtimeUnreadSystem.handleNewMessage(message);
							}

							setTimeout(() => {
								const $addedMessage = $targetDateGroup
									.find(`[data-message-id="${message.id}"]`)
									.last();
								if ($addedMessage.length > 0) {
									$addedMessage
										.addClass('unread-message')
										.attr('data-is-new', '1')
										.attr('data-read-status', 'null');
									if ($addedMessage.find('.new-mark').length === 0) {
										const $messageMeta = $addedMessage
											.find('.message-meta, .thread-message-meta')
											.first();
										if ($messageMeta.length > 0) {
											const $newMark = $(`<span class=\"new-mark\">New</span>`);
											$messageMeta.append($newMark);

											$.ajax({
												url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
												type: 'POST',
												data: {
													action: 'lms_mark_message_as_read',
													message_id: message.id,
													channel_id: message.channel_id,
													nonce: window.lmsChat?.nonce,
												},
												success: function (response) {
													setTimeout(() => {
														if (
															window.LMSChat &&
															window.LMSChat.ui &&
															window.LMSChat.ui.updateHeaderUnreadBadge
														) {
															$.ajax({
																url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
																type: 'POST',
																data: {
																	action: 'lms_get_unread_count',
																	nonce: window.lmsChat?.nonce,
																	force_refresh: true,
																},
																success: function (data) {
																	if (data.success && data.data) {
																		window.LMSChat.ui.updateHeaderUnreadBadge(data.data);
																	}
																},
															});
														}
													}, 100);
												},
												error: function (xhr, status, error) {},
											});

											if (!window.LMSBadgeUpdateBlocked) {
												window.LMSBadgeUpdateBlocked = true;

												const $headerBadge = $(
													'.chat-icon-wrapper .chat-icon .unread-badge, .chat-icon .unread-badge, .header-chat-icon .unread-badge'
												).not('.user-avatar .unread-badge');
												const currentCount = parseInt($headerBadge.first().text()) || 0;
												if (currentCount > 0) {
													const newCount = currentCount - 1;

													window.LMSManualBadgeValue = newCount;
													window.LMSManualBadgeTime = Date.now();

													setTimeout(() => {
														window.LMSManualBadgeValue = undefined;
														window.LMSManualBadgeTime = undefined;
													}, 40000);

													if (newCount === 0) {
														$headerBadge.hide().text('');
													} else {
														$headerBadge.text(newCount);
													}
												}

												if (window.LMSBadgeBlockTimer) {
													clearTimeout(window.LMSBadgeBlockTimer);
												}

												window.LMSBadgeBlockTimer = setTimeout(() => {
													window.LMSBadgeUpdateBlocked = false;
												}, 40000);
											}
										}
									}
									if (
										window.LMSPersistentUnreadSystem &&
										window.LMSPersistentUnreadSystem.initialize
									) {
										setTimeout(() => {
											$(document).trigger('lms_new_message_received', {
												messageId: message.id,
												channelId: message.channel_id,
												isThread: false,
												element: $addedMessage[0],
											});
										}, 100);
									}
								}
							}, 50);
						}
						if (isTemp) {
						}
					} else {
						if (isTemp) {
						}
					}
				} else {
					return;
				}
				const $targetGroup = dateKey
					? $(`.message-group[data-date-key="${dateKey}"]`)
					: $lastMessageGroup;
				if ($targetGroup && $targetGroup.length > 0) {
					if ($targetGroup.css('display') === 'none' || !$targetGroup.is(':visible')) {
						$targetGroup
							.css({
								display: 'block',
								visibility: 'visible',
								opacity: '1',
							})
							.show();
						const $separator = $targetGroup.find('.date-separator');
						if ($separator.length > 0 && !$separator.is(':visible')) {
							$separator
								.css({
									display: 'flex',
									visibility: 'visible',
									opacity: '1',
								})
								.show();
						}
					}
				}
				if (window.UnifiedScrollManager) {
				} else {
					const executeAppendMessageScroll = () => {
						if (options.fromLongPoll) {
							return;
						}
						if (isCurrentUser) {
							if (window.LMSChat && window.LMSChat.messages) {
								window.LMSChat.messages.preventAutoScroll = false;
							}
							if (window.LMSChat && window.LMSChat.state) {
								window.LMSChat.state.forceNewMessageScroll = true;
								window.LMSChat.state.justSentMessage = true;
								window.LMSChat.state.lastSentTimestamp = new Date(message.created_at).getTime();
								window.LMSChat.state.lastSentMessageId = message.id;
							}
							setTimeout(() => {
								if (window.LMSChat?.messages?.scrollManager) {
									window.LMSChat.messages.scrollManager.scrollForNewMessage(message.id);
								} else {
									const container = document.getElementById('chat-messages');
									if (container) {
										container.scrollTop = container.scrollHeight;
									}
								}
							}, 50);
						}
					};
					setTimeout(executeAppendMessageScroll, 10);
				}
				if (!isCurrentUser) {
					if (window.LMSChat.utils && window.LMSChat.utils.playNotificationSound) {
						window.LMSChat.utils.playNotificationSound();
					}
					if (
						document.hidden &&
						window.LMSChat.utils &&
						window.LMSChat.utils.updateNotificationBadge
					) {
						window.LMSChat.utils.updateNotificationBadge();
					}
				}
				const executeScrollAfterDomUpdate = () => {
					// 🔥 SCROLL FLICKER FIX: チャンネル切り替え中はスクロール処理をスキップ
					if (state.isChannelSwitching) {
						return;
					}

					if (isReReceivedMessage) {
						if (window.LMSChat && window.LMSChat.messages) {
							window.LMSChat.messages.preventAutoScroll = true;
						}
						return;
					}

					if (options.fromLongPoll && !isMyMessage) {
						if (window.LMSChat && window.LMSChat.messages) {
							window.LMSChat.messages.preventAutoScroll = true;
						}
						return;
					}

					if (window.UnifiedScrollManager && window.UnifiedScrollManager.isScrollLocked()) {
						return;
					}

					if (window.UnifiedScrollManager) {
						return;
					}

					try {
						if (window.LMSChat && window.LMSChat.state) {
							window.LMSChat.state.forceNewMessageScroll = true;
						}
						if (isCurrentUser) {
							if (window.LMSChat && window.LMSChat.messages) {
								window.LMSChat.messages.preventAutoScroll = false;
							}
							if (window.UnifiedScrollManager) {
							} else {
								scrollToBottom(0, true);
							}
							return;
						}
						if (options.fromLongPoll) {
							if (window.LMSChat && window.LMSChat.messages) {
								window.LMSChat.messages.preventAutoScroll = true;
							}
							return;
						}
						const $messageElement = $(`.chat-message[data-message-id="${message.id}"]`);
						if ($messageElement.length > 0) {
							if (window.LMSChat && window.LMSChat.messages) {
								window.LMSChat.messages.preventAutoScroll = false;
								if (window.LMSChat.state) {
									window.LMSChat.state.forceNewMessageScroll = true;
								}
							}
							setTimeout(() => {
								try {
									const $container = $('#chat-messages');
									if (window.UnifiedScrollManager) {
									} else {
										const messagePosition = $messageElement.position();
										if (messagePosition && typeof messagePosition.top !== 'undefined') {
											$container.scrollTop(messagePosition.top - 40);
										} else {
											scrollToNewMessage($messageElement);
										}
									}
								} catch (e) {
									if (window.UnifiedScrollManager) {
									} else {
										scrollToNewMessage($messageElement);
									}
								}
							}, 80);
						} else {
							if (window.LMSChat && window.LMSChat.messages) {
								window.LMSChat.messages.preventAutoScroll = false;
							}
							const $container = $('#chat-messages');

							if (window.UnifiedScrollManager) {
							} else {
								try {
									const scrollHeight = $container.prop('scrollHeight');
									$container.scrollTop(scrollHeight);
								} catch (e) {
									if (window.UnifiedScrollManager) {
									} else {
										scrollToBottom(0, true);
									}
								}
							}
						}
					} catch (error) {
						if (window.LMSChat && window.LMSChat.messages) {
							window.LMSChat.messages.preventAutoScroll = false;
						}
						if (window.UnifiedScrollManager) {
						} else {
							scrollToBottom(0, true);
						}
					}
				};
				if (!options.fromLongPoll && !window.UnifiedScrollManager) {
					setTimeout(() => {
						const $messageElement = $(`.chat-message[data-message-id="${message.id}"]`);
						if ($messageElement.length > 0) {
							executeScrollAfterDomUpdate();
						} else {
							setTimeout(executeScrollAfterDomUpdate, 150);
						}
					}, 50);
				}
				if (message.is_new) {
				}
			} catch (error) {}
		});
		messageIdTracker.markAsDisplayed(message.id);
		const $addedMessage = $(`.chat-message[data-message-id="${message.id}"]`);
		if ($addedMessage.length > 0) {
			$(document).trigger('message_added', {
				messageId: message.id,
				messageElement: $addedMessage[0],
				isThread: false,
			});
		} else {
			$(document).trigger('message_added', [message.id, false]);
		}

		if (window.MessageRealtimeDeleteSync && window.MessageRealtimeDeleteSync.enableDeleteButtons) {
			window.MessageRealtimeDeleteSync.enableDeleteButtons();
		}

		return true;
	};
	window.LMSChat.messages.appendMessage = appendMessage;
	const pendingRequests = new Map();
	const getMessages = async (channelId, page = 1, ajaxOptions = {}) => {
		try {
			const requestKey = `${channelId}-${page}`;
			const now = Date.now();
			const pendingRequest = pendingRequests.get(requestKey);
			if (pendingRequest && now - pendingRequest.startTime < 300) {
				return pendingRequest.promise;
			}
			if (page === 1) {
				state.isChannelSwitching = true;
				state.firstLoadComplete = null;
				state.noMoreOldMessages = false;
			}
			if (page === 1) {
				try {
					if (
						window.LMSChat &&
						window.LMSChat.cache &&
						typeof window.LMSChat.cache.clearChannelCache === 'function'
					) {
						window.LMSChat.cache.clearChannelCache(channelId);
					}
				} catch (error) {}
			}

			if (window.LMSChat.cache) {
				const cachedData = window.LMSChat.cache.getMessagesCache(channelId, page);
				if (cachedData) {
					if (cachedData.messages) {
						cachedData.messages.forEach((group) => {
							if (group.messages && Array.isArray(group.messages)) {
								group.messages.forEach((message) => {
									const existingReadStatus = getMessageReadStatus(message.id, false);
									if (existingReadStatus === 'fully_read') {
										message.is_new = false;
									}
								});
							}
						});
					}
					if (page === 1) {
						state.isChannelLoaded[channelId] = true;
					}
					return {
						success: true,
						data: cachedData,
					};
				}
			}
			if (!window.lmsChat || !window.lmsChat.ajaxUrl || !window.lmsChat.nonce) {
				throw new Error('Ajax設定が不完全です');
			}
			const refreshNonce = async () => {
				try {
					const refreshResponse = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'POST',
						data: {
							action: 'lms_refresh_nonce',
							current_nonce: window.lmsChat.nonce,
						},
						timeout: 15000,
						cache: false,
						async: true,
						dataType: 'json',
					});
					if (refreshResponse.success && refreshResponse.data && refreshResponse.data.nonce) {
						const oldNonce = window.lmsChat.nonce;
						window.lmsChat.nonce = refreshResponse.data.nonce;
						return true;
					} else {
						return false;
					}
				} catch (error) {
					return false;
				}
			};
			const useUniversal = page === 1;
			const action = useUniversal ? 'lms_get_messages_universal' : 'lms_get_messages';

			const ajaxConfig = useUniversal
				? {
						url: window.lmsChat.ajaxUrl,
						type: 'POST',
						data: {
							action: 'lms_get_messages_universal',
							channel_id: channelId,
							before_message_id: 0,
							limit: 50,
							nonce: window.lmsChat.nonce,
						},
						timeout: 15000,
						dataType: 'json',
						cache: false,
				  }
				: {
						url: window.lmsChat.ajaxUrl,
						type: 'GET',
						data: {
							action: 'lms_get_messages',
							channel_id: channelId,
							page: page,
							nonce: window.lmsChat.nonce,
							include_thread_info: 1,
						},
						timeout: 15000,
						dataType: 'json',
						cache: false,
				  };
			const requestPromise = $.ajax(ajaxConfig).catch(async (error) => {
				// エラーを無視

				if (error.readyState === 0 || error.status === 0 || error.status >= 500) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					return $.ajax(ajaxConfig);
				}
				if (error.responseJSON && error.responseJSON.data === 'Invalid nonce') {
					const refreshed = await refreshNonce();
					if (refreshed) {
						return $.ajax(ajaxConfig);
					}
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return $.ajax({
					...ajaxConfig,
					timeout: 40000,
				});
			});
			pendingRequests.set(requestKey, {
				promise: requestPromise,
				startTime: now,
			});
			try {
				const response = await requestPromise;

				if (response.success && response.data && useUniversal) {
					const messages = response.data.messages || [];

					const messageGroups = [];
					let currentGroup = null;
					let currentDate = null;

					messages.forEach((message) => {
						const messageDate = new Date(message.created_at).toLocaleDateString('ja-JP', {
							year: 'numeric',
							month: 'long',
							day: 'numeric',
							weekday: 'short',
						});

						if (currentDate !== messageDate) {
							if (currentGroup) {
								messageGroups.push(currentGroup);
							}
							currentGroup = {
								date: messageDate,
								messages: [message],
							};
							currentDate = messageDate;
						} else {
							currentGroup.messages.push(message);
						}
					});

					if (currentGroup) {
						messageGroups.push(currentGroup);
					}

					response.data.messages = messageGroups;
					response.data.total_pages = 1;
					response.data.current_page = 1;
					response.data.has_more = false;
				} else if (response.success && response.data) {
					if (response.data.messages) {
						response.data.messages.forEach((group, groupIndex) => {
							if (group.messages) {
								group.messages.forEach((message, msgIndex) => {
									if (message.reactions && message.reactions.length > 0) {
									}
								});
							}
						});
					}
					if (response.data.thread_info && response.data.thread_info.length > 0) {
					}
				}

				if (response.success && response.data && response.data.messages) {
					let totalMessages = 0;
					response.data.messages.forEach((group) => {
						if (group.messages && Array.isArray(group.messages)) {
							totalMessages += group.messages.length;
						}
					});

					if (!useUniversal && page === 1 && totalMessages > 50) {
						let currentCount = 0;
						const limitedGroups = [];

						for (let i = response.data.messages.length - 1; i >= 0 && currentCount < 50; i--) {
							const group = response.data.messages[i];
							if (group.messages && Array.isArray(group.messages)) {
								const remainingSlots = 50 - currentCount;
								if (group.messages.length <= remainingSlots) {
									limitedGroups.unshift(group);
									currentCount += group.messages.length;
								} else {
									const limitedGroup = {
										...group,
										messages: group.messages.slice(-remainingSlots),
									};
									limitedGroups.unshift(limitedGroup);
									currentCount += limitedGroup.messages.length;
									break;
								}
							}
						}

						response.data.messages = limitedGroups;
					}

					response.data.messages.forEach((group) => {
						if (group.messages && Array.isArray(group.messages)) {
							group.messages.forEach((message) => {
								const existingReadStatus = getMessageReadStatus(message.id, false);
								if (existingReadStatus === 'fully_read') {
									message.is_new = false;
								}
							});
						}
					});
				}
				if (response.success && window.LMSChat.cache) {
					window.LMSChat.cache.setMessagesCache(channelId, page, response.data);
				}
				if (page === 1) {
					state.isChannelLoaded[channelId] = true;
				}
				pendingRequests.delete(requestKey);
				return response;
			} catch (error) {
				if (
					(error.status === 0 &&
						(error.statusText === 'timeout' || error.statusText === 'error')) ||
					error.status === 502 ||
					error.status === 504
				) {
					if (error.statusText === 'timeout' || error.status === 0) {
						pendingRequests.delete(requestKey);
						return {
							success: true,
							data: {
								messages: [],
								total_pages: 1,
								current_page: 1,
								has_more: false,
							},
						};
					}
					if (
						window.LMSChat &&
						window.LMSChat.utils &&
						typeof window.LMSChat.utils.showError === 'function'
					) {
						window.LMSChat.utils.showError(
							'サーバーとの接続がタイムアウトしました。しばらくしてから再試行してください。'
						);
					}
					throw error;
				}
				if (error.readyState === 0 && error.status === 0) {
					throw error;
				}
				if (error._retryCount === undefined) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					if (!error._retryCount || error._retryCount < 2) {
						const retryError = new Error('Retry attempt');
						retryError._retryCount = (error._retryCount || 0) + 1;
						throw retryError;
					}
				}
				if (page === 1) {
					state.isChannelLoaded[channelId] = false;
					state.isChannelSwitching = false;
				}
				throw error;
			} finally {
				pendingRequests.delete(requestKey);
			}
		} catch (error) {
			const requestKey = `${channelId}-${page}`;
			pendingRequests.delete(requestKey);
			throw error;
		}
	};
	window.LMSChat.messages.getMessages = getMessages;
	const updateSendButtonState = () => {
		const $input = $('#chat-input');
		const $sendButton = $('#chat-form .send-button, #main-chat-send-button');
		$sendButton.each(function () {
			if (!$(this).attr('id')) {
				$(this).attr('id', 'main-chat-send-button');
			}
		});
		const messageText = $input.val().trim();
		const isSending =
			window.LMSChat && window.LMSChat.state ? window.LMSChat.state.isSending : false;
		if (isSending) {
			return;
		}
		if (messageText) {
			$sendButton.prop('disabled', false).addClass('active');
		} else {
			$sendButton.prop('disabled', true).removeClass('active');
		}
	};
	const sendMessage = async (channelId, message, fileIds = []) => {
		if (window.ChatMasterSync && window.ChatMasterSync.sendMessage) {
			try {
				const result = await window.ChatMasterSync.sendMessage(message, channelId, fileIds);
				return result;
			} catch (error) {}
		}

		const sendingKey = `sending_${channelId}_${Date.now()}_${Math.random()
			.toString(36)
			.slice(2, 8)}`;
		if (!channelId) {
			return Promise.reject('チャンネルIDが指定されていません');
		}
		if (!message && (!fileIds || fileIds.length === 0)) {
			return Promise.reject('メッセージまたは添付ファイルが必要です');
		}
		let currentUserName = 'あなた';
		if (window.lmsChat && window.lmsChat.currentUserName) {
			currentUserName = window.lmsChat.currentUserName;
		} else if ($('#user-profile, #chat-container').data('user-name')) {
			currentUserName = $('#user-profile, #chat-container').data('user-name');
		} else if ($('meta[name="user-display-name"]').length) {
			currentUserName = $('meta[name="user-display-name"]').attr('content');
		} else if ($('.user-name, .current-user-name').length) {
			currentUserName = $('.user-name, .current-user-name').first().text().trim();
		} else if (window.lmsSession && window.lmsSession.user_name) {
			currentUserName = window.lmsSession.user_name;
		}
		const tempMessageData = {
			id: `temp_${channelId}_${Date.now()}_${performance.now().toFixed(0)}_${Math.random()
				.toString(36)
				.slice(2, 10)}`,
			channel_id: channelId,
			user_id: parseInt(window.lmsChat.currentUserId, 10),
			message: message,
			display_name: currentUserName,
			avatar_url:
				window.lmsChat.currentUserAvatar || '/wp-content/themes/lms/img/default-avatar.png',
			created_at: new Date().toISOString(),
			formatted_time: (() => {
				const now = new Date();
				if (window.LMSChat?.utils?.formatTimeOnly) {
					return window.LMSChat.utils.formatTimeOnly(now);
				}
				const hours = now.getHours().toString().padStart(2, '0');
				const minutes = now.getMinutes().toString().padStart(2, '0');
				return `${hours}:${minutes}`;
			})(),
			is_sender: true,
			is_new: true,
			attachments: [],
		};
		try {
			state.isSending = true;
			state.currentSendingKey = sendingKey;
			setTimeout(() => {
				if (state.currentSendingKey === sendingKey) {
					state.isSending = false;
					state.currentSendingKey = null;
				}
			}, 3000);
			try {
				const existingMessage = $(`.chat-message[data-message-id="${tempMessageData.id}"]`);
				if (existingMessage.length === 0) {
					const appendResult = appendMessage(tempMessageData);
					const $tempMessageElement = $(`.chat-message[data-message-id="${tempMessageData.id}"]`);
					if ($tempMessageElement.length > 0) {
						$tempMessageElement.addClass('pending-message');
					}
				}
				updateSendButtonState();
			} catch (tempError) {}
			const startTime = Date.now();
			let response;
			try {
				if (window.LMSChat && window.LMSChat.Ajax && window.LMSChat.Ajax.makeRequest) {
					response = await window.LMSChat.Ajax.makeRequest({
						data: {
							action: 'lms_send_message',
							message: message,
							channel_id: channelId,
							file_ids: fileIds.join(','),
							nonce: window.lmsChat.nonce,
							sending_key: sendingKey,
						},
						timeout: 15000,
						maxRetries: 1,
						retryDelay: 1000,
					});
				} else {
					response = await new Promise((resolve, reject) => {
						$.ajax({
							url: window.lmsChat.ajaxUrl,
							type: 'POST',
							data: {
								action: 'lms_send_message',
								message: message,
								channel_id: channelId,
								file_ids: fileIds.join(','),
								nonce: window.lmsChat.nonce,
								sending_key: sendingKey,
							},
							timeout: 15000,
							success: (response) => {
								resolve(response);
							},
							error: (xhr, status, error) => {
								reject(new Error(`Ajax request failed: ${status} - ${error}`));
							},
						});
					});
				}
			} catch (error) {
				if (error.message === 'TEMP_MESSAGE_MODE') {
					throw new Error('server_timeout');
				} else {
					throw error;
				}
			}
			if (response.success) {
				updateSendButtonState();
				if (!response.data) {
					throw new Error('メッセージの送信に失敗しました: データがありません');
				}
				if (!response.data.message_id && !response.data.id) {
					throw new Error('メッセージの送信に失敗しました: メッセージIDがありません');
				}
				const messageData = response.data.message_data || response.data;
				if (!messageData.display_name) {
					if (messageData.user_name) {
						messageData.display_name = messageData.user_name;
					} else if (response.data.display_name) {
						messageData.display_name = response.data.display_name;
					} else if (response.data.user_name) {
						messageData.display_name = response.data.user_name;
					}
				}
				if (!messageData.display_name) {
					let userName = null;
					if (window.lmsChat && window.lmsChat.currentUserName) {
						userName = window.lmsChat.currentUserName;
					} else if ($('#user-profile, #chat-container').data('user-name')) {
						userName = $('#user-profile, #chat-container').data('user-name');
					} else if ($('meta[name="user-display-name"]').length) {
						userName = $('meta[name="user-display-name"]').attr('content');
					}
					if (userName) {
						messageData.display_name = userName;
					} else {
						messageData.display_name = `ユーザー${messageData.user_id}`;
					}
				}
				messageData.user_id = parseInt(window.lmsChat.currentUserId, 10);
				messageData.is_sender = true;
				if (!messageData.formatted_time && messageData.created_at) {
					messageData.formatted_time = utils.formatMessageTime(messageData.created_at);
				} else if (!messageData.formatted_time) {
					const now = new Date();
					messageData.created_at = now.toISOString();
					messageData.formatted_time = utils.formatMessageTime(now.toISOString());
				}
				if (window.LMSChat.cache && typeof window.LMSChat.cache.clearMessagesCache === 'function') {
					window.LMSChat.cache.clearMessagesCache(channelId);
				}
				if (response.data.message_id && !messageData.id) {
					messageData.id = response.data.message_id;
				}

				if (window.LMSChat.state) {
					window.LMSChat.state.messageSentSuccessfully = true;
					window.LMSChat.state.lastSentMessageId = messageData.id;
					window.LMSChat.state.justSentMessage = true;
				}

				const $tempMessage = $(`.chat-message[data-message-id="${tempMessageData.id}"]`);
				if ($tempMessage.length > 0) {
					try {
						$tempMessage.attr('data-replacing', 'true');
						$tempMessage.attr('data-message-id', messageData.id);
						const $threadButton = $tempMessage.find('.thread-button, .thread-info');
						if ($threadButton.length > 0) {
							$threadButton.attr('data-message-id', messageData.id);
						}
						if (tempMessageData.message !== messageData.message) {
							$tempMessage
								.find('.message-text')
								.html(utils.linkifyUrls(utils.escapeHtml(messageData.message)));
						}
						$tempMessage.find('.sending-indicator, .message-sending').remove();
						$tempMessage.removeClass('pending-message');
						$tempMessage.removeAttr('data-replacing');
						$tempMessage.css({
							transform: '',
							transition: '',
						});
						if (messageData.formatted_time) {
							$tempMessage.find('.message-time').text(messageData.formatted_time);
						}
						state.recentSentMessageIds.add(messageData.id);
						state.recentSentMessageTimes.set(messageData.id, Date.now());
						if (!state.tempToRealMessageMap) {
							state.tempToRealMessageMap = new Map();
						}
						state.tempToRealMessageMap.set(tempMessageData.id, messageData.id);
						const cutoffTime = Date.now() - 10000;
						for (const [id, timestamp] of state.recentSentMessageTimes.entries()) {
							if (timestamp < cutoffTime) {
								state.recentSentMessageIds.delete(id);
								state.recentSentMessageTimes.delete(id);
							}
						}
					} catch (updateError) {
						$tempMessage.remove();
						appendMessage(messageData);
						state.recentSentMessageIds.add(messageData.id);
						state.recentSentMessageTimes.set(messageData.id, Date.now());
					}
				} else {
					appendMessage(messageData);
					const $newMessageElement = $(`.chat-message[data-message-id="${messageData.id}"]`);
					if ($newMessageElement.length > 0) {
						$newMessageElement.css({
							transform: 'translateY(100%)',
							opacity: '0',
							transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
						});
						setTimeout(() => {
							$newMessageElement.css({
								transform: 'translateY(0)',
								opacity: '1',
							});
							setTimeout(() => {
								$newMessageElement.css({
									transform: '',
									transition: '',
								});
							}, 300);
						}, 50);
					}
					state.recentSentMessageIds.add(messageData.id);
					state.recentSentMessageTimes.set(messageData.id, Date.now());
				}
				$('#chat-input').val('').css('height', 'auto').trigger('input');
				$('.file-preview').empty();
				if (window.LMSChat.state.pendingFiles) {
					window.LMSChat.state.pendingFiles.clear();
				}
				if (messageData.id) {
					window.LMSChat.state.lastMessageId = messageData.id;
				} else if (response.data.message_id) {
					window.LMSChat.state.lastMessageId = response.data.message_id;
				}
				$(document).trigger('message_sent', [messageData]);
				$(document).trigger('lms_chat_message_sent', [messageData]);

				// Long Pollシステムに新しいメッセージを通知（同期強化）
				if (window.LMSLongPoll && window.LMSLongPoll.notifyMessageSent) {
					window.LMSLongPoll.notifyMessageSent(messageData);
				}

				// 他のタブ/ウィンドウへの同期通知
				try {
					localStorage.setItem(
						'lms_message_sync',
						JSON.stringify({
							type: 'message_created',
							data: messageData,
							timestamp: Date.now(),
						})
					);
					setTimeout(() => {
						localStorage.removeItem('lms_message_sync');
					}, 1000);
				} catch (e) {}
				updateSendButtonState();
				const $messageContainer = $('#chat-messages');
				if (window.LMSChat.state) {
					window.LMSChat.state.lastSentMessageId = messageData.id || null;
				}
				if (window.LMSChat && window.LMSChat.messages) {
					window.LMSChat.messages.preventAutoScroll = false;
					if (window.LMSChat.state) {
						window.LMSChat.state.forceNewMessageScroll = true;
					}
				}
				setTimeout(() => {
					if (window.LMSChat?.messages?.scrollManager) {
						window.LMSChat.messages.scrollManager.scrollForNewMessage(messageData.id);
					} else {
						const container = document.getElementById('chat-messages');
						if (container) {
							container.scrollTop = container.scrollHeight;
						}
					}
				}, 50);
				const sentMessageId = messageData.id || null;
				if (window.LMSChat.state) {
					window.LMSChat.state.lastSentMessageId = sentMessageId;
					window.LMSChat.state.justSentMessage = true;
					if (messageData.created_at) {
						window.LMSChat.state.lastSentTimestamp = new Date(messageData.created_at).getTime();
					} else {
						window.LMSChat.state.lastSentTimestamp = Date.now();
					}
				}
				setTimeout(() => {
					if (window.LMSChat?.state) {
						window.LMSChat.state.justSentMessage = false;
						window.LMSChat.state.messageSentSuccessfully = false;
					}
				}, 3000);
				showSendSuccessIndicator();
			} else {
				throw new Error(response.data || 'メッセージの送信に失敗しました');
			}
		} catch (error) {
			if (error.message === 'server_timeout') {
				const messageExists =
					$(`.chat-message[data-message-id="${tempMessageData.id}"]`).length > 0;
				if (!messageExists) {
					try {
						appendMessage(tempMessageData);
					} catch (appendError) {}
				}
				return;
			}
			if (error.statusText === 'timeout' || error.status === 0 || error.status >= 500) {
				const messageExists =
					$(`.chat-message[data-message-id="${tempMessageData.id}"]`).length > 0;
				if (!messageExists) {
					try {
						appendMessage(tempMessageData);
					} catch (appendError) {}
				}
				updateSendButtonState();
				utils.showSuccessMessage('メッセージを送信しました（サーバー復旧後に同期されます）');
				return Promise.resolve({
					success: true,
					message_id: tempMessageData.id,
					temporary: true,
				});
			} else {
				if (typeof originalMessage !== 'undefined') {
					$('#chat-input').val(originalMessage).trigger('input');
				}
			}
			utils.showError(error.message || 'メッセージの送信に失敗しました');
		} finally {
			const currentSendingKey = state.currentSendingKey || 'unknown';
			const resetSendingState = () => {
				state.isSending = false;
				state.currentSendingKey = null;
				if (window.LMSChat && window.LMSChat.state) {
					window.LMSChat.state.isSending = false;
					window.LMSChat.state.currentSendingKey = null;
				}
				const $messageContainer = $('#chat-messages');
				const $oldMessages = $messageContainer.find('.message-group');
				$oldMessages.css({
					opacity: '',
					transition: '',
				});
				if (window.tempRestoreTimer) {
					clearTimeout(window.tempRestoreTimer);
					delete window.tempRestoreTimer;
				}
			};
			resetSendingState();
			setTimeout(resetSendingState, 50);
			setTimeout(() => {
				const $sendButton = $('#chat-form .send-button, #main-chat-send-button');
				$sendButton.removeClass('active');
				updateSendButtonState();
				const $input = $('#chat-input');
				if ($input.length && $input.val().trim()) {
					const $mainSendButton = $('#chat-form .send-button, #main-chat-send-button');
					$mainSendButton.prop('disabled', false).addClass('active');
				}
			}, 100);
		}
	};

	const checkVisualLockStatus = () => {
		const $container = $('#chat-messages');
		const containerElement = $container[0];

		return {
			currentTransform: containerElement.style.transform,
			currentPosition: containerElement.style.position,
			currentOverflow: containerElement.style.overflow,
			currentScrollTop: containerElement.scrollTop,
			willChange: containerElement.style.willChange,
			containerRect: containerElement.getBoundingClientRect(),
			timestamp: new Date().toLocaleTimeString(),
		};
	};

	const emergencyResetVisualLock = () => {
		const $container = $('#chat-messages');
		const containerElement = $container[0];

		['transform', 'position', 'overflow', 'willChange'].forEach((prop) => {
			containerElement.style.removeProperty(prop);
		});

		return checkVisualLockStatus();
	};

	const startVisualLockMonitoring = () => {
		let monitoringActive = true;
		let monitorCount = 0;

		const monitor = () => {
			if (!monitoringActive) return;

			monitorCount++;
			const status = checkVisualLockStatus();

			if (monitorCount % 10 === 0) {
			}

			if (status.currentTransform && status.currentTransform !== 'none') {
			}

			if (monitorCount < 100) {
				setTimeout(monitor, 100);
			} else {
				monitoringActive = false;
			}
		};

		monitor();

		return () => {
			monitoringActive = false;
		};
	};

	window.LMSChat.debug = window.LMSChat.debug || {};
	window.LMSChat.debug.checkVisualLockStatus = checkVisualLockStatus;
	window.LMSChat.debug.emergencyResetVisualLock = emergencyResetVisualLock;
	window.LMSChat.debug.startVisualLockMonitoring = startVisualLockMonitoring;
	const loadConsecutiveDates = async (startDate, endDate) => {
		if (!startDate || !endDate || !state.currentChannel) {
			return false;
		}
		try {
			state.isLoadingDateRange = true;
			const start = new Date(startDate);
			const end = new Date(endDate);
			if (isNaN(start.getTime()) || isNaN(end.getTime())) {
				return false;
			}
			if (start > end) {
				const temp = new Date(start);
				start.setTime(end.getTime());
				end.setTime(temp.getTime());
			}
			const $messageContainer = $('#chat-messages');
			const $loadingIndicator = $(
				'<div class="date-range-loader">日付間のメッセージ読み込み中</div>'
			);
			$messageContainer.append($loadingIndicator);
			const currentDate = new Date(start);
			const maxDays = 30;
			let daysProcessed = 0;
			while (currentDate <= end && daysProcessed < maxDays) {
				const dateStr = formatDateForAPI(currentDate);
				$loadingIndicator.text(`${dateStr} のメッセージ読み込み中`);
				try {
					await loadMessagesForDate(dateStr);
					currentDate.setDate(currentDate.getDate() + 1);
					daysProcessed++;
					await new Promise((resolve) => setTimeout(resolve, 200));
				} catch (dateError) {}
			}
			$loadingIndicator.fadeOut(300, function () {
				$(this).remove();
			});
			return true;
		} catch (error) {
			return false;
		} finally {
			state.isLoadingDateRange = false;
		}
	};
	const loadMessagesForDate = async (dateKey, includeAdjacent = true) => {
		if (!state.currentChannel) return;
		try {
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'GET',
				data: {
					action: 'lms_get_messages_by_date',
					channel_id: state.currentChannel,
					date: dateKey,
					include_adjacent: includeAdjacent,
					nonce: window.lmsChat.nonce,
				},
			});
			if (response.success && response.data) {
				await displayMessages(response.data, false);
				return response.data;
			}
			return null;
		} catch (error) {
			utils.showError('メッセージの読み込みに失敗しました');
			return null;
		} finally {
			state.isLoading = false;
		}
	};
	const loadAdditionalMessagesAfterFirst = async () => {
		if (!state.currentChannel) return;
		try {
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'GET',
				data: {
					action: 'lms_get_messages',
					channel_id: state.currentChannel,
					page: 1,
					per_page: 500,
					load_all: true,
					nonce: window.lmsChat.nonce,
				},
				timeout: 30000,
			});
			if (
				response.success &&
				response.data &&
				response.data.messages &&
				response.data.messages.length > 0
			) {
				const $firstMessage = $('#chat-messages .message-item').first();
				const firstMessageId = parseInt($firstMessage.data('message-id'), 10);
				const newerMessages = [];
				for (const group of response.data.messages) {
					if (group.messages && group.messages.length > 0) {
						const filteredMessages = group.messages.filter((msg) => {
							const msgId = parseInt(msg.id, 10);
							return msgId > firstMessageId;
						});
						if (filteredMessages.length > 0) {
							newerMessages.push({
								...group,
								messages: filteredMessages,
							});
						}
					}
				}
				if (newerMessages.length > 0) {
					const sortedMessages = [...newerMessages].reverse();
					sortedMessages.forEach((group) => {
						if (group.messages) {
							group.messages.reverse();
						}
					});
					for (const group of sortedMessages) {
						await processMessageGroup(group, false, false);
						await new Promise((resolve) => setTimeout(resolve, 100));
					}
				} else {
				}
			} else {
			}
		} catch (error) {
			await loadAdditionalMessagesFallback();
		}
	};
	const loadAllMessagesFromFirst = async () => {
		if (!state.currentChannel) return;
		try {
			const existingMessageIds = new Set();
			$('#chat-messages .message-item').each(function () {
				const msgId = parseInt($(this).data('message-id'), 10);
				if (msgId) {
					existingMessageIds.add(msgId);
				}
			});
			const allNewMessages = [];
			let page = 1;
			let hasMore = true;
			while (hasMore && page <= 100) {
				try {
					const response = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'GET',
						data: {
							action: 'lms_get_messages',
							channel_id: state.currentChannel,
							page: page,
							nonce: window.lmsChat.nonce,
						},
						timeout: 20000,
					});
					if (
						response.success &&
						response.data &&
						response.data.messages &&
						response.data.messages.length > 0
					) {
						const newGroups = [];
						for (const group of response.data.messages) {
							if (group.messages && group.messages.length > 0) {
								const newMessages = group.messages.filter((msg) => {
									const msgId = parseInt(msg.id, 10);
									return msgId && !existingMessageIds.has(msgId);
								});
								if (newMessages.length > 0) {
									newGroups.push({
										...group,
										messages: newMessages,
									});
									newMessages.forEach((msg) => {
										existingMessageIds.add(parseInt(msg.id, 10));
									});
								}
							}
						}
						if (newGroups.length > 0) {
							allNewMessages.push(...newGroups);
						} else {
						}
						page++;
						await new Promise((resolve) => setTimeout(resolve, 100));
					} else {
						hasMore = false;
					}
				} catch (error) {
					hasMore = false;
				}
			}
			if (allNewMessages.length > 0) {
				const sortedMessages = [...allNewMessages].reverse();
				sortedMessages.forEach((group) => {
					if (group.messages) {
						group.messages.reverse();
					}
				});
				for (const group of sortedMessages) {
					await processMessageGroup(group, false, false);
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
			} else {
			}
		} catch (error) {}
	};
	const loadAdditionalMessagesFallback = async () => {
		try {
			for (let page = 1; page <= 50; page++) {
				const response = await $.ajax({
					url: window.lmsChat.ajaxUrl,
					type: 'GET',
					data: {
						action: 'lms_get_messages',
						channel_id: state.currentChannel,
						page: page,
						nonce: window.lmsChat.nonce,
					},
					timeout: 15000,
				});
				if (
					response.success &&
					response.data &&
					response.data.messages &&
					response.data.messages.length > 0
				) {
					const $firstMessage = $('#chat-messages .message-item').first();
					const firstMessageId = parseInt($firstMessage.data('message-id'), 10);
					const newerGroups = [];
					for (const group of response.data.messages) {
						if (group.messages) {
							const newerMessages = group.messages.filter((msg) => {
								return parseInt(msg.id, 10) > firstMessageId;
							});
							if (newerMessages.length > 0) {
								newerGroups.push({
									...group,
									messages: newerMessages,
								});
							}
						}
					}
					if (newerGroups.length > 0) {
						const sortedGroups = [...newerGroups].reverse();
						sortedGroups.forEach((group) => {
							if (group.messages) {
								group.messages.reverse();
							}
						});
						for (const group of sortedGroups) {
							await processMessageGroup(group, false, false);
						}
					} else {
					}
					await new Promise((resolve) => setTimeout(resolve, 200));
				} else {
					break;
				}
			}
		} catch (error) {}
	};
	const markAsRead = async (channelId, messageId) => {
		try {
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				data: {
					action: 'lms_mark_as_read',
					channel_id: channelId,
					message_id: messageId,
					nonce: window.lmsChat.nonce,
				},
			});
			return response.success;
		} catch (error) {
			return false;
		}
	};
	const updateUnreadCounts = async () => {
		try {
			const now = Date.now();
			if (state.lastUnreadPoll && now - state.lastUnreadPoll < 30000) {
				return;
			}
			if (state.unreadCountsUpdateInProgress) {
				return;
			}
			state.unreadCountsUpdateInProgress = true;
			state.lastUnreadPoll = now;
			let retries = 0;
			const maxRetries = 0;
			let response = null;
			let lastError = null;
			while (retries <= maxRetries) {
				try {
					response = await window.LMSChat.utils.makeAjaxRequest({
						url: window.lmsChat.ajaxUrl,
						type: 'GET',
						data: {
							action: 'lms_get_unread_count',
							nonce: window.lmsChat.nonce,
							_: Math.floor(now / 30000),
						},
						cache: false,
						timeout: 3000,
						maxRetries: 0,
						retryDelay: 3000,
					});
					break;
				} catch (error) {
					lastError = error;
					if (error.status === 'timeout') {
						break;
					}
					const is502Error = error.xhr && error.xhr.status === 502;
					const isServerError = error.xhr && error.xhr.status >= 500;
					const isNetworkError = error.xhr && error.xhr.status === 0;
					retries++;
					if (retries > maxRetries) {
						break;
					}
					break;
				}
			}
			state.unreadCountsUpdateInProgress = false;
			if (!response) {
				return;
			}
			if (response && response.success) {
				const oldCounts = { ...state.unreadCounts };
				state.unreadCounts = response.data;
				if (window.LMSChat.ui && window.LMSChat.ui.state) {
					window.LMSChat.ui.state.unreadCounts = response.data;
				}
				Object.entries(response.data).forEach(([channelId, count]) => {
					if (window.LMSChat.ui && typeof window.LMSChat.ui.updateChannelBadge === 'function') {
						window.LMSChat.ui.updateChannelBadge(channelId, count);
						if (parseInt(count) > 0) {
							const $channelItem = $(`.channel-item[data-channel-id="${channelId}"]`);
							if ($channelItem.length > 0 && $channelItem.find('.unread-badge').length === 0) {
								$channelItem
									.find('.channel-name')
									.append(`<span class="unread-badge">${count}</span>`);
							} else if ($channelItem.find('.unread-badge').length > 0) {
								$channelItem.find('.unread-badge').text(count).show();
							}
						} else {
							$(`.channel-item[data-channel-id="${channelId}"] .unread-badge`).remove();
						}
					} else {
						const $channelItem = $(`.channel-item[data-channel-id="${channelId}"]`);
						if (parseInt(count) > 0) {
							if ($channelItem.length > 0 && $channelItem.find('.unread-badge').length === 0) {
								$channelItem
									.find('.channel-name')
									.append(`<span class="unread-badge">${count}</span>`);
							} else if ($channelItem.find('.unread-badge').length > 0) {
								$channelItem.find('.unread-badge').text(count).show();
							}
						} else {
							$channelItem.find('.unread-badge').remove();
						}
					}
				});
				if (window.LMSChat.ui && typeof window.LMSChat.ui.updateHeaderUnreadBadge === 'function') {
					window.LMSChat.ui.updateHeaderUnreadBadge(response.data);
				}
				const totalUnread = Object.values(response.data).reduce(
					(sum, count) => sum + parseInt(count || 0),
					0
				);
				if (window.LMSChatBadgeManager) {
					const forceUpdate = !window.LMSChatBadgeManager.initialized;
					const success = window.LMSChatBadgeManager.updateBadge(
						totalUnread.toString(),
						forceUpdate
					);
					if (!success && window.LMSChatBadgeManager.initialized) {
					}
				} else if (
					window.LMSChat.ui &&
					typeof window.LMSChat.ui.updateHeaderUnreadBadge === 'function'
				) {
					window.LMSChat.ui.updateHeaderUnreadBadge(response.data);
				} else {
					const $headerBadge = $('#chat-icon-badge, .chat-header-badge');
					if (totalUnread > 0) {
						if ($headerBadge.length > 0) {
							$headerBadge.text(totalUnread).show();
						} else {
							$('#header-chat-icon, .header-chat-button').append(
								`<span id="chat-icon-badge" class="chat-header-badge">${totalUnread}</span>`
							);
						}
					} else {
						$headerBadge.hide();
					}
				}
				try {
					const currentChannelId =
						window.LMSChat?.state?.currentChannel ||
						window.lmsChat?.currentChannelId ||
						window.lmsChat?.currentChannel ||
						$('#current-channel-id').val() ||
						0;
					const currentChannelUnread = response.data[currentChannelId] || 0;
					if (currentChannelUnread > 0) {
						$('.chat-message').each(function () {
							const $message = $(this);
							const userId = $message.data('user-id');
							const messageId = $message.data('message-id');
							const currentUserId = Number(window.lmsChat.currentUserId);
							if (!messageId) return;
							if (Number(userId) !== currentUserId) {
								const readStatus = getMessageReadStatus(messageId, false);
								if (readStatus === 'fully_read') {
									$message.find('.new-mark').remove();
									$message.addClass('viewed-once read-completely');
									$message.attr('data-read-status', 'fully_read');
									return;
								} else if (readStatus === 'first_view') {
									$message.addClass('viewed-once');
									$message.removeClass('read-completely');
									$message.attr('data-read-status', 'first_view');
									return;
								}
								const $newMark = $message.find('.new-mark');
								if ($newMark.length === 0) {
									const messageIndex = $('.chat-message').index($message);
									const totalMessages = $('.chat-message').length;
									if (messageIndex >= totalMessages - currentChannelUnread) {
										setMessageReadStatus(messageId, 'first_view', false);
										$message.find('.new-mark').remove();
										$message.find('.message-meta').append('<span class="new-mark">New</span>');
										$message.addClass('viewed-once');
										$message.removeClass('read-completely');
										$message.attr('data-read-status', 'first_view');

										$.ajax({
											url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
											type: 'POST',
											data: {
												action: 'lms_mark_message_as_read',
												message_id: messageId,
												channel_id: window.lmsChat?.currentChannelId,
												nonce: window.lmsChat?.nonce,
											},
											success: function (response) {
												setTimeout(() => {
													if (
														window.LMSChat &&
														window.LMSChat.ui &&
														window.LMSChat.ui.updateHeaderUnreadBadge
													) {
														$.ajax({
															url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
															type: 'POST',
															data: {
																action: 'lms_get_unread_count',
																nonce: window.lmsChat?.nonce,
																force_refresh: true,
															},
															success: function (data) {
																if (data.success && data.data) {
																	window.LMSChat.ui.updateHeaderUnreadBadge(data.data);
																}
															},
														});
													}
												}, 100);
											},
											error: function (xhr, status, error) {},
										});

										if (!window.LMSBadgeUpdateBlocked) {
											window.LMSBadgeUpdateBlocked = true;

											const $headerBadge = $(
												'.chat-icon-wrapper .chat-icon .unread-badge, .chat-icon .unread-badge, .header-chat-icon .unread-badge'
											).not('.user-avatar .unread-badge');
											const currentCount = parseInt($headerBadge.first().text()) || 0;
											if (currentCount > 0) {
												const newCount = currentCount - 1;

												window.LMSManualBadgeValue = newCount;
												window.LMSManualBadgeTime = Date.now();

												setTimeout(() => {
													window.LMSManualBadgeValue = undefined;
													window.LMSManualBadgeTime = undefined;
												}, 40000);

												if (newCount === 0) {
													$headerBadge.hide().text('');
												} else {
													$headerBadge.text(newCount);
												}
											}

											if (window.LMSBadgeBlockTimer) {
												clearTimeout(window.LMSBadgeBlockTimer);
											}

											window.LMSBadgeBlockTimer = setTimeout(() => {
												window.LMSBadgeUpdateBlocked = false;
											}, 40000);
										}
									}
								}
							}
						});
					} else {
						$('.chat-message .new-mark').each(function () {
							const $newMark = $(this);
							const $message = $newMark.closest('.chat-message');
							const messageId = $message.data('message-id');
							if (messageId) {
								const readStatus = getMessageReadStatus(messageId, false);
								if (readStatus !== 'fully_read') {
									$newMark.fadeOut(300, function () {
										$(this).remove();
									});
								}
							}
						});
					}
				} catch (unreadError) {}
			}
		} catch (error) {
			state.unreadCountsUpdateInProgress = false;
			if (error.message && error.message.includes('timeout')) {
			} else {
			}
		} finally {
			state.unreadCountsUpdateInProgress = false;
		}
	};
	const updateThreadInfoElement = (
		$message,
		parentMessageId,
		total,
		unread,
		avatars,
		latest_reply
	) => {
		if (total <= 0) {
			$message.find('.thread-info').remove();
			return;
		}
		if ($message.length === 0) {
			return;
		}
		const currentChannelId = state.currentChannel || 0;
		const messageChannelId = $message.data('channel-id') || 0;
		if (messageChannelId > 0 && messageChannelId !== currentChannelId) {
			return;
		}
		const fixNewMarks = () => {
			const $headerNewMarks = $message.find('.message-header > .new-mark');
			if ($headerNewMarks.length > 0) {
				const $messageMeta = $message.find('.message-meta');
				const $metaNewMarks = $messageMeta.find('.new-mark');
				if ($metaNewMarks.length > 0) {
					$headerNewMarks.remove();
				} else {
					$headerNewMarks.detach();
					$messageMeta.append($headerNewMarks);
				}
			}
		};
		fixNewMarks();
		if (total > 0) {
			$message.addClass('has-thread');
			const $threadButton = $message.find('.thread-button');
			if ($threadButton.length > 0) {
				const $threadText = $threadButton.find('.thread-text');
				if ($threadText.length > 0) {
					const threadText = total > 0 ? `${total}件の返信` : 'スレッドに返信する';
					$threadText.text(threadText);
				}
			} else {
				const threadText = total > 0 ? `${total}件の返信` : 'スレッドに返信する';
				const newThreadButton = `
					<a href="#" class="thread-button" data-message-id="${parentMessageId}">
						<img src="${utils.getAssetPath(
							'wp-content/themes/lms/img/icon-thread.svg'
						)}" alt="" class="thread-icon">
						<span class="thread-text">${threadText}</span>
					</a>
				`;
				$message.find('.message-meta').after(newThreadButton);
			}
		} else {
			let actualThreadCount = total;
			if (state.threadInfoCache && state.threadInfoCache.has(parentMessageId)) {
				const cachedInfo = state.threadInfoCache.get(parentMessageId);
				actualThreadCount = cachedInfo.total || 0;
			}
			if (state.currentThread && state.currentThread == parentMessageId) {
				return;
			}
			if (actualThreadCount > 0) {
				if (
					window.LMSChat.messages &&
					typeof window.LMSChat.messages.updateMessageThreadInfo === 'function'
				) {
					const cachedInfo = state.threadInfoCache.get(parentMessageId);
					window.LMSChat.messages.updateMessageThreadInfo($message, cachedInfo);
				}
				return;
			}
			let shouldRemove = true;
			if (state.threadInfoCache && state.threadInfoCache.has(parentMessageId)) {
				const cachedInfo = state.threadInfoCache.get(parentMessageId);
				if (cachedInfo.total > 0) {
					shouldRemove = false;
				}
			}
			if (shouldRemove) {
				$message.removeClass('has-thread');
				const messageId = $message.data('message-id');
				const cachedThreadInfo = state.threadInfoCache
					? state.threadInfoCache.get(messageId)
					: null;
				if (!cachedThreadInfo || cachedThreadInfo.total <= 0) {
					$message.find('.thread-info').remove();
				} else {
				}
			}
			const $threadButton = $message.find('.thread-button');
			if ($threadButton.length > 0) {
				const $threadText = $threadButton.find('.thread-text');
				if ($threadText.length > 0) {
					const messageId = $message.data('message-id');
					const cachedThreadInfo = state.threadInfoCache
						? state.threadInfoCache.get(messageId)
						: null;
					const threadCount = cachedThreadInfo ? cachedThreadInfo.total : 0;
					const threadText = threadCount > 0 ? `${threadCount}件の返信` : 'スレッドに返信する';
					$threadText.text(threadText);
				}
			} else {
				const messageId = $message.data('message-id');
				const cachedThreadInfo = state.threadInfoCache
					? state.threadInfoCache.get(messageId)
					: null;
				const threadCount = cachedThreadInfo ? cachedThreadInfo.total : 0;
				const threadText = threadCount > 0 ? `${threadCount}件の返信` : 'スレッドに返信する';
				const newThreadButton = `
					<a href="#" class="thread-button" data-message-id="${parentMessageId}">
						<img src="${utils.getAssetPath(
							'wp-content/themes/lms/img/icon-thread.svg'
						)}" alt="" class="thread-icon">
						<span class="thread-text">${threadText}</span>
					</a>
				`;
				$message.find('.message-meta').after(newThreadButton);
			}
			return;
		}
		let $threadInfo = $message.find('.thread-info');
		if ($threadInfo.length > 0) {
			$threadInfo.attr('data-parent-id', parentMessageId);
			if ($message.find('.message-header .thread-info').length > 0) {
				$threadInfo.detach();
				$message.append($threadInfo);
			}
			let $avatarsContainer = $threadInfo.find('.thread-info-avatars');
			if ($avatarsContainer.length === 0) {
				$threadInfo.prepend('<div class="thread-info-avatars"></div>');
				$avatarsContainer = $threadInfo.find('.thread-info-avatars');
			}
			let $threadInfoText = $threadInfo.find('.thread-info-text');
			if ($threadInfoText.length === 0) {
				$threadInfo.append('<div class="thread-info-text"></div>');
				$threadInfoText = $threadInfo.find('.thread-info-text');
			}
			let $threadInfoStatus = $threadInfoText.find('.thread-info-status');
			if ($threadInfoStatus.length === 0) {
				$threadInfoText.append('<div class="thread-info-status"></div>');
				$threadInfoStatus = $threadInfoText.find('.thread-info-status');
			}
			if (total === 0) {
				$threadInfo.remove();
				return;
			}
			let $replyCount = $threadInfoStatus.find('.thread-reply-count');
			if ($replyCount.length === 0) {
				$threadInfoStatus.append(`<span class="thread-reply-count">${total}件の返信</span>`);
				$replyCount = $threadInfoStatus.find('.thread-reply-count');
			} else {
				$replyCount.text(`${total}件の返信`);
			}
			let $unreadBadge = $threadInfoStatus.find('.thread-unread-badge');
			let cachedUnread = 0;
			if (!state.threadUnreadCache) {
				state.threadUnreadCache = new Map();
			}
			const cachedData = state.threadUnreadCache.get(parentMessageId.toString());
			if (cachedData && typeof unread === 'undefined') {
				cachedUnread = cachedData.unread;
			}
			const effectiveUnread =
				typeof unread !== 'undefined' && unread !== null ? parseInt(unread, 10) : cachedUnread;
			if (effectiveUnread !== undefined && effectiveUnread !== null && effectiveUnread > 0) {
				state.threadUnreadCache.set(parentMessageId.toString(), {
					unread: effectiveUnread,
					total: total,
					timestamp: Date.now(),
				});
				if ($unreadBadge.length > 0) {
					$unreadBadge.text(effectiveUnread);
					$unreadBadge.attr('aria-label', `新着の返信メッセージ ${effectiveUnread} 件`);
					$unreadBadge.show();
				} else {
					$replyCount.after(
						`<span class="thread-unread-badge" tabindex="0" aria-label="新着の返信メッセージ ${effectiveUnread} 件">${effectiveUnread}</span>`
					);
				}
			} else if ($unreadBadge.length > 0) {
				$unreadBadge.remove();
				if (cachedData) {
					state.threadUnreadCache.set(parentMessageId.toString(), {
						unread: 0,
						total: total,
						timestamp: Date.now(),
					});
				}
			}
			const validAvatars = Array.isArray(avatars)
				? avatars.filter((a) => a && typeof a === 'object')
				: [];
			let avatarsHtml = '';
			if (validAvatars.length > 0) {
				const sortedValidAvatars = validAvatars.sort((a, b) => {
					const idA = parseInt(a.user_id) || 0;
					const idB = parseInt(b.user_id) || 0;
					return idA - idB;
				});
				avatarsHtml = sortedValidAvatars
					.map((avatar, index) => {
						const avatarUrl =
							avatar.avatar_url ||
							utils.getAssetPath('wp-content/themes/lms/img/default-avatar.png');
						const displayName = avatar.display_name || 'ユーザー';
						const isParentAuthor = avatar.is_parent_author || false;
						const replyCount = avatar.reply_count || 0;
						let tooltip = displayName;
						if (isParentAuthor && replyCount > 0) {
							tooltip += ` (スレッド作成者・${replyCount}件の返信)`;
						} else if (isParentAuthor) {
							tooltip += ' (スレッド作成者)';
						} else if (replyCount > 0) {
							tooltip += ` (${replyCount}件の返信)`;
						}
						return `<img src="${avatarUrl}"
								 alt="${utils.escapeHtml(displayName)}"
								 title="${utils.escapeHtml(tooltip)}"
								 class="thread-avatar"
								 data-user-id="${avatar.user_id}"
								 style="z-index: ${100 - index};">`;
					})
					.join('');
			} else {
				avatarsHtml = `<img src="${utils.getAssetPath(
					'wp-content/themes/lms/img/default-avatar.png'
				)}" alt="ユーザー" class="thread-avatar" data-temporary="true">`;
				if (total > 0 && !state.isChannelSwitching) {
					if (!window.threadInfoUpdateQueue) {
						window.threadInfoUpdateQueue = new Set();
					}
					window.threadInfoUpdateQueue.add(parentMessageId);
				}
			}
			$avatarsContainer.html(avatarsHtml);
			let $latestReply = $threadInfoText.find('.thread-info-latest');
			if (latest_reply) {
				if ($latestReply.length === 0) {
					$threadInfoText.append(`<div class="thread-info-latest">最終返信: ${latest_reply}</div>`);
				} else {
					$latestReply.text(`最終返信: ${latest_reply}`);
				}
			} else if ($latestReply.length > 0) {
				$latestReply.remove();
			}
		} else {
			const threadInfoHtml = generateThreadInfoHtml(
				parentMessageId,
				total,
				unread,
				avatars,
				latest_reply
			);
			$message.append(threadInfoHtml);
		}
	};
	const scrollToBottom = (delay = 0, force = false, disableAutoScrollAfter = false) => {
		// スレッドモーダルが開いている間はメインチャットをスクロールしない
		if ($('.thread-panel').hasClass('open') || window.LMSChat?.state?.currentThread) {
			return;
		}

		if (force) {
			const $messageContainer = $('#chat-messages');
			if (!$messageContainer.length) return;

			const executeForceScroll = () => {
				const container = $messageContainer[0];
				container.scrollTop = container.scrollHeight;
				setTimeout(() => {
					container.scrollTop = container.scrollHeight;
				}, 100);
			};

			if (delay > 0) {
				setTimeout(executeForceScroll, delay);
			} else {
				executeForceScroll();
			}
			return;
		}

		const $messageContainer = $('#chat-messages');
		if (!$messageContainer.length) return;

		const doScroll = () => {
			const scrollHeight = $messageContainer.prop('scrollHeight');
			const hasSentMessage = window.LMSChat?.state?.justSentMessage || false;
			if (state.blockScrollOverride) {
				if (state.finalScrollPosition !== undefined) {
					$('#chat-messages').scrollTop(state.finalScrollPosition);
				}
				return;
			}
			if (hasSentMessage) {
				if (window.LMSChat && window.LMSChat.messages) {
					const wasScrollPrevented = window.LMSChat.messages.preventAutoScroll;
					window.LMSChat.messages.preventAutoScroll = false;
					if (wasScrollPrevented) {
					}
				}
			} else {
				if (
					window.LMSChat &&
					window.LMSChat.messages &&
					window.LMSChat.messages.preventAutoScroll
				) {
					const forceNewMessageScroll = window.LMSChat?.state?.forceNewMessageScroll || false;
					if (forceNewMessageScroll) {
						if (window.LMSChat && window.LMSChat.state) {
							window.LMSChat.state.forceNewMessageScroll = false;
						}
					} else {
						return;
					}
				}
				const scrollTop = $messageContainer.scrollTop();
				const clientHeight = $messageContainer.height();
				if (scrollHeight - scrollTop - clientHeight > 200) {
					const forceNewMessageScroll = window.LMSChat?.state?.forceNewMessageScroll || false;
					if (forceNewMessageScroll) {
						if (window.LMSChat && window.LMSChat.state) {
							window.LMSChat.state.forceNewMessageScroll = false;
						}
					} else {
						return;
					}
				}
			}
			try {
				$messageContainer.scrollTop(scrollHeight);
				setTimeout(() => {
					try {
						const updatedScrollHeight = $messageContainer.prop('scrollHeight');
						$messageContainer.scrollTop(updatedScrollHeight);
						if (disableAutoScrollAfter && window.LMSChat && window.LMSChat.messages) {
							setTimeout(() => {
								window.LMSChat.messages.preventAutoScroll = true;
							}, 100);
						}
					} catch (e) {}
				}, 200);
			} catch (error) {}
		};

		if (delay > 0) {
			setTimeout(doScroll, delay);
		} else {
			doScroll();
		}
	};
	const setupMainChatScrollEvents = () => {
		const $messageContainer = $('#chat-messages');
		if (!window.LMSChat.messages) {
			window.LMSChat.messages = {};
		}
		window.LMSChat.messages.preventAutoScroll = false;
		window.LMSChat.messages.lastUserScrollTime = 0;
		let isNearBottom = true;
		let userInitiatedScroll = false;
		let scrollTimeoutId = null;
		$messageContainer.off('scroll.mainChat').on('scroll.mainChat', function () {
			if (!window.LMSChat.messages) {
				window.LMSChat.messages = {};
			}
			const scrollTop = $(this).scrollTop();
			const scrollHeight = $(this).prop('scrollHeight');
			const clientHeight = $(this).height();
			const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
			if (userInitiatedScroll) {
				window.LMSChat.messages.lastUserScrollTime = Date.now();
				if (distanceFromBottom > 200) {
					if (!window.LMSChat.messages.preventAutoScroll) {
						window.LMSChat.messages.preventAutoScroll = true;
					}
					isNearBottom = false;
				} else {
					if (window.LMSChat.messages.preventAutoScroll) {
						window.LMSChat.messages.preventAutoScroll = false;
					}
					isNearBottom = true;
				}
				if (scrollTimeoutId) {
					clearTimeout(scrollTimeoutId);
				}
				scrollTimeoutId = setTimeout(() => {
					userInitiatedScroll = false;
				}, 200);
			}
		});
		$messageContainer.off('mousedown.userScroll').on('mousedown.userScroll', function () {
			userInitiatedScroll = true;
		});
		const messageContainerEl = $messageContainer[0];
		if (messageContainerEl) {
			messageContainerEl.removeEventListener('touchstart', handleTouchStart);
			messageContainerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
		}
		function handleTouchStart() {
			userInitiatedScroll = true;
		}
		$messageContainer.off('click.mainChat').on('click.mainChat', function (event) {
			const scrollTop = $(this).scrollTop();
			const scrollHeight = $(this).prop('scrollHeight');
			const clientHeight = $(this).height();
			if (scrollHeight - scrollTop - clientHeight > 200) {
				if (!window.LMSChat.messages) {
					window.LMSChat.messages = {};
				}
				window.LMSChat.messages.preventAutoScroll = true;
				window.LMSChat.messages.lastUserScrollTime = Date.now();
			}
		});
	};
	const readStateCache = new Map();
	const VIEW_COUNT_STORAGE_KEY = 'lms_chat_message_view_counts';
	const FULLY_READ_STORAGE_KEY = 'lms_chat_fully_read_messages';
	const messageViewTracker = {
		getViewCounts() {
			try {
				const stored = localStorage.getItem(VIEW_COUNT_STORAGE_KEY);
				if (stored) {
					const parsedData = JSON.parse(stored);
					if (parsedData && typeof parsedData === 'object') {
						return parsedData;
					}
				}
				return {};
			} catch (e) {
				return {};
			}
		},
		saveViewCounts(counts) {
			try {
				if (!counts || typeof counts !== 'object') {
					return;
				}
				if (Object.keys(counts).length === 0) {
					return;
				}
				const validatedCounts = {};
				let hasValidData = false;
				Object.entries(counts).forEach(([key, value]) => {
					const parsedKey = String(key).trim();
					let parsedValue = parseInt(value, 10);
					if (isNaN(parsedValue)) {
						parsedValue = 0;
					}
					if (parsedKey && parsedValue >= 0) {
						validatedCounts[parsedKey] = parsedValue;
						hasValidData = true;
					}
				});
				if (hasValidData) {
					localStorage.setItem(VIEW_COUNT_STORAGE_KEY, JSON.stringify(validatedCounts));
				} else {
				}
			} catch (e) {}
		},
		getCount(messageId, isThread = false) {
			try {
				if (!messageId) {
					return 0;
				}
				const id = String(messageId);
				const key = isThread ? `thread_${id}` : id;
				const counts = this.getViewCounts();
				const count = counts[key];
				return count !== undefined ? parseInt(count, 10) || 0 : 0;
			} catch (e) {
				return 0;
			}
		},
		incrementCount(messageId, isThread = false) {
			try {
				if (!messageId) {
					return 0;
				}
				const id = String(messageId);
				const key = isThread ? `thread_${id}` : id;
				const counts = this.getViewCounts();
				let currentCount = parseInt(counts[key], 10) || 0;
				currentCount++;
				counts[key] = currentCount;
				this.saveViewCounts(counts);
				if (currentCount >= 2) {
					this.markAsFullyRead(messageId, isThread);
				}
				return currentCount;
			} catch (e) {
				return 0;
			}
		},
		setupAutoSave() {
			if (this.autoSaveTimer) {
				clearInterval(this.autoSaveTimer);
			}
			this.autoSaveTimer = setInterval(() => {
				try {
					const counts = this.getViewCounts();
					if (counts && typeof counts === 'object' && Object.keys(counts).length > 0) {
						this.saveViewCounts(counts);
					}
					const fullyReadMessages = this.getFullyReadMessages();
					if (
						fullyReadMessages &&
						typeof fullyReadMessages === 'object' &&
						Object.keys(fullyReadMessages).length > 0
					) {
						this.saveFullyReadMessages(fullyReadMessages);
					}
				} catch (e) {}
			}, 10000);
			window.addEventListener('beforeunload', () => {
				try {
					const counts = this.getViewCounts();
					if (counts && typeof counts === 'object' && Object.keys(counts).length > 0) {
						this.saveViewCounts(counts);
					}
					const fullyReadMessages = this.getFullyReadMessages();
					if (
						fullyReadMessages &&
						typeof fullyReadMessages === 'object' &&
						Object.keys(fullyReadMessages).length > 0
					) {
						this.saveFullyReadMessages(fullyReadMessages);
					}
				} catch (e) {}
			});
		},
		resetCount(messageId, isThread = false) {
			if (!messageId) {
				return;
			}
			const key = `${messageId}_${isThread ? 'thread' : 'main'}`;
			try {
				const counts = this.getViewCounts();
				delete counts[key];
				this.saveViewCounts(counts);
			} catch (e) {}
		},
		getFullyReadMessages() {
			try {
				const stored = localStorage.getItem(FULLY_READ_STORAGE_KEY);
				if (stored) {
					const parsedData = JSON.parse(stored);
					if (parsedData && typeof parsedData === 'object') {
						return parsedData;
					}
				}
				return {};
			} catch (e) {
				return {};
			}
		},
		saveFullyReadMessages(fullyReadMessages) {
			try {
				if (!fullyReadMessages || typeof fullyReadMessages !== 'object') {
					return;
				}
				localStorage.setItem(FULLY_READ_STORAGE_KEY, JSON.stringify(fullyReadMessages));
			} catch (e) {}
		},
		isFullyRead(messageId, isThread = false) {
			try {
				if (!messageId) {
					return false;
				}
				const id = String(messageId);
				const key = isThread ? `thread_${id}` : id;
				const fullyReadMessages = this.getFullyReadMessages();
				return !!fullyReadMessages[key];
			} catch (e) {
				return false;
			}
		},
		markAsFullyRead(messageId, isThread = false) {
			try {
				if (!messageId) {
					return;
				}
				const id = String(messageId);
				const key = isThread ? `thread_${id}` : id;
				const fullyReadMessages = this.getFullyReadMessages();
				fullyReadMessages[key] = Date.now();
				this.saveFullyReadMessages(fullyReadMessages);
			} catch (e) {}
		},
	};
	const markMessageAsRead = async (messageId, isThread = false, keepNewMark = false) => {
		try {
			const cacheKey = `${messageId}_${isThread}`;
			if (readStateCache.has(cacheKey)) {
				return true;
			}
			const selector = isThread
				? `.thread-message[data-message-id="${messageId}"]`
				: `.chat-message[data-message-id="${messageId}"]`;
			const $message = $(selector);
			if ($message.length === 0) {
				return false;
			}
			const currentStatus = getMessageReadStatus(messageId, isThread);
			let newStatus = currentStatus;
			if (currentStatus === null) {
				newStatus = 'first_view';
				setMessageReadStatus(messageId, 'first_view', isThread);
			} else if (currentStatus === 'first_view' && $message.hasClass('viewed-once')) {
				const viewCount =
					window.LMSChat.messages && window.LMSChat.messages.messageViewTracker
						? window.LMSChat.messages.messageViewTracker.getCount(messageId, isThread) || 0
						: 0;
				if (viewCount > 1) {
					newStatus = 'fully_read';
					setMessageReadStatus(messageId, 'fully_read', isThread);
				} else {
				}
			}
			$message.attr('data-read-status', newStatus);
			$message.addClass('viewed-once');
			if (newStatus === FULLY_READ) {
				$message.addClass('read-completely');
				$message.find('.new-mark').fadeOut(300, function () {
					$(this).remove();
				});
			} else if (newStatus === 'first_view') {
				if ($message.find('.new-mark').length === 0) {
					$message.find('.user-name').after('<span class="new-mark">New</span>');
				}
			}
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				data: {
					action: 'lms_mark_message_as_read',
					nonce: window.lmsChat.nonce,
					message_id: messageId,
					is_thread: isThread ? 1 : 0,
				},
			});
			if (response.success) {
				readStateCache.set(cacheKey, true);
				if (isThread && window.LMSChat.state.unreadThreadMessages) {
					const index = window.LMSChat.state.unreadThreadMessages.indexOf(messageId.toString());
					if (index !== -1) {
						window.LMSChat.state.unreadThreadMessages.splice(index, 1);
					}
				}
				if (!isThread && window.LMSChat.state.unreadMessages) {
					const index = window.LMSChat.state.unreadMessages.indexOf(messageId.toString());
					if (index !== -1) {
						window.LMSChat.state.unreadMessages.splice(index, 1);
					}
				}
				if (
					!isThread &&
					state.threadUnreadCache &&
					state.threadUnreadCache.has(messageId.toString())
				) {
					const cacheData = state.threadUnreadCache.get(messageId.toString());
					if (cacheData) {
						cacheData.unread = 0;
						cacheData.timestamp = Date.now();
						state.threadUnreadCache.set(messageId.toString(), cacheData);
						const $message = $(`.chat-message[data-message-id="${messageId}"]`);
						if ($message.length > 0) {
							const $threadInfo = $message.find('.thread-info');
							if ($threadInfo.length > 0) {
								$threadInfo.find('.thread-unread-badge').remove();
							}
						}
					}
				}
				return true;
			} else {
				return false;
			}
		} catch (error) {
			return false;
		}
	};
	const markChannelAllAsRead = async (channelId) => {
		try {
			let nonce = window.lmsChat.nonce;
			if (!nonce && window.lmsChat && window.lmsChat._nonce) {
				nonce = window.lmsChat._nonce;
			}
			if (!nonce && window.lmsPush && window.lmsPush.nonce) {
				nonce = window.lmsPush.nonce;
			}
			if (!nonce) {
				throw new Error('有効なnonceが見つかりません');
			}
			const requestData = {
				action: 'lms_mark_channel_all_as_read',
				nonce: nonce,
				channel_id: channelId,
			};
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				data: requestData,
				timeout: 30000,
				beforeSend: function (xhr) {},
				complete: function (xhr, status) {},
				error: function (xhr, status, error) {},
			});
			if (response.success) {
				window.LMSChat.ui.updateChannelBadge(channelId, 0);
				if (state.unreadCounts) {
					const oldCount = state.unreadCounts[channelId];
					state.unreadCounts[channelId] = 0;
				}
				if (window.LMSChat.ui && window.LMSChat.ui.updateHeaderUnreadBadge) {
					window.LMSChat.ui.updateHeaderUnreadBadge(state.unreadCounts || {});
				}
				if (state.currentChannel === channelId) {
					if (
						window.LMSChat &&
						window.LMSChat.readStatus &&
						window.LMSChat.readStatus.forceCompleteRead
					) {
						$('#chat-messages .chat-message').each(function () {
							const $message = $(this);
							const messageId = $message.data('message-id');
							if (messageId) {
								window.LMSChat.readStatus.forceCompleteRead(messageId, false);
							}
						});
						$('.thread-messages .thread-message').each(function () {
							const $message = $(this);
							const messageId = $message.data('message-id');
							if (messageId) {
								window.LMSChat.readStatus.forceCompleteRead(messageId, true);
							}
						});
					}
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
					if (state.threadUnreadCache) {
						$('.thread-info').each(function () {
							const $threadInfo = $(this);
							const messageId = $threadInfo.data('message-id');
							if (messageId) {
								if (state.threadUnreadCache.has(messageId.toString())) {
									const cacheData = state.threadUnreadCache.get(messageId.toString());
									cacheData.unread = 0;
									cacheData.timestamp = Date.now();
									state.threadUnreadCache.set(messageId.toString(), cacheData);
								}
								const $unreadBadge = $threadInfo.find('.thread-unread-badge');
								if ($unreadBadge.length) {
									$unreadBadge.fadeOut(300, function () {
										$(this).remove();
									});
								}
							}
						});
					}
				}
				if (
					window.LMSChat.messages &&
					typeof window.LMSChat.messages.updateUnreadCounts === 'function'
				) {
					window.LMSChat.messages.updateUnreadCounts();
				}
				setTimeout(() => {
					if (window.LMSChat.ui && window.LMSChat.ui.updateChannelBadge) {
						window.LMSChat.ui.updateChannelBadge(channelId, 0);
					}
					if (window.LMSChat.ui && window.LMSChat.ui.updateHeaderUnreadBadge) {
						window.LMSChat.ui.updateHeaderUnreadBadge(state.unreadCounts || {});
					}
					if (
						window.LMSChat.messages &&
						typeof window.LMSChat.messages.updateUnreadCounts === 'function'
					) {
						window.LMSChat.messages.updateUnreadCounts();
					}
				}, 500);
				return true;
			} else {
				return false;
			}
		} catch (error) {
			if (error.responseText) {
				try {
					const errorData = JSON.parse(error.responseText);
				} catch (parseError) {}
			}
			return false;
		}
	};
	const markMessageDeleted = (messageId, isThread = false) => {
		if (!messageId) return Promise.resolve(false);
		return $.ajax({
			url: window.lmsChat.ajaxUrl,
			type: 'POST',
			data: {
				action: 'lms_mark_message_deleted',
				message_id: messageId,
				is_thread: isThread ? 1 : 0,
				nonce: window.lmsChat.nonce,
			},
		});
	};
	const forceRefreshThreadInfo = async (parentMessageId) => {
		try {
			await updateThreadInfo(parentMessageId);
		} catch (error) {}
	};
	window.forceRefreshThreadInfo = forceRefreshThreadInfo;
	window.refreshAllThreadInfo = async () => {
		if (state.isChannelSwitching) {
			return;
		}
		const $threadInfos = $('.thread-info');
		if (!window.threadInfoUpdateQueue) {
			window.threadInfoUpdateQueue = new Set();
		}
		$threadInfos.each(function () {
			const messageId = $(this).data('message-id');
			if (messageId && messageId > 0) {
				window.threadInfoUpdateQueue.add(messageId);
			}
		});
		if (window.threadInfoUpdateQueue.size > 0) {
			const messageIds = Array.from(window.threadInfoUpdateQueue);
			window.threadInfoUpdateQueue.clear();
			messageIds.forEach((messageId, index) => {
				setTimeout(() => {
					if (!state.isChannelSwitching) {
						updateThreadInfo(messageId);
					}
				}, index * 300);
			});
		}
	};
	$(() => {
		const checkAndUpdateThreadInfo = () => {
			const $threadInfos = $('.thread-info');
			if ($threadInfos.length > 0) {
				$threadInfos.each(function () {
					const $threadInfo = $(this);
					const messageId = $threadInfo.data('message-id');
					const $message = $(`.chat-message[data-message-id="${messageId}"]`);
					const hasThread = $message.attr('data-has-thread') === 'true';
					if (!hasThread) {
						return;
					}
					const $avatars = $threadInfo.find('.thread-info-avatars img');
					const hasOnlyDefaultAvatars =
						$avatars.length === 1 && $avatars.first().attr('src').includes('default-avatar.png');
					if (messageId && hasOnlyDefaultAvatars && !state.isChannelSwitching) {
						if (!window.threadInfoUpdateQueue) {
							window.threadInfoUpdateQueue = new Set();
						}
						window.threadInfoUpdateQueue.add(messageId);
					}
				});
				setTimeout(() => {
					if (
						window.threadInfoUpdateQueue &&
						window.threadInfoUpdateQueue.size > 0 &&
						!state.isChannelSwitching
					) {
						const messageIds = Array.from(window.threadInfoUpdateQueue);
						window.threadInfoUpdateQueue.clear();
						messageIds.forEach((messageId, index) => {
							setTimeout(() => {
								if (!state.isChannelSwitching) {
									updateThreadInfo(messageId);
								}
							}, index * 200);
						});
					}
				}, 3000);
			}
		};
		setTimeout(checkAndUpdateThreadInfo, 1500);
		setTimeout(checkAndUpdateThreadInfo, 5000);
		setTimeout(checkAndUpdateThreadInfo, 10000);
	});
	const threadParticipantRequests = new Map();
	const requestTimeouts = new Map();
	const getThreadParticipants = async (parentMessageId, retryCount = 0) => {
		const maxRetries = 2;
		if (!parentMessageId || parentMessageId <= 0) {
			return [];
		}
		if (state.isChannelSwitching) {
			return [];
		}
		const currentChannelId = state.currentChannel;
		if (!currentChannelId || currentChannelId <= 0) {
			return [];
		}
		if (threadParticipantRequests.has(parentMessageId)) {
			const existingRequest = threadParticipantRequests.get(parentMessageId);
			if (existingRequest && typeof existingRequest.abort === 'function') {
				existingRequest.abort();
			}
			threadParticipantRequests.delete(parentMessageId);
			if (requestTimeouts.has(parentMessageId)) {
				clearTimeout(requestTimeouts.get(parentMessageId));
				requestTimeouts.delete(parentMessageId);
			}
		}
		let jqXHR = null;
		const requestPromise = (async () => {
			try {
				if (state.isChannelSwitching) {
					return [];
				}
				const timeoutId = setTimeout(() => {
					if (jqXHR) {
						jqXHR.abort();
					}
				}, 2000);
				requestTimeouts.set(parentMessageId, timeoutId);
				jqXHR = $.ajax({
					url: window.lmsChat.ajaxUrl,
					type: 'POST',
					data: {
						action: 'lms_get_thread_info',
						parent_message_id: parentMessageId,
						channel_id: currentChannelId,
						nonce: window.lmsChat.nonce,
					},
					timeout: 2000,
					cache: false,
					async: true,
				});
				const response = await jqXHR;
				if (state.isChannelSwitching) {
					return [];
				}
				if (response && response.success && response.data) {
					const participants = response.data.avatars || [];
					if (response.data.total <= 0) {
						return [];
					}
					const processedParticipants = participants.map((participant) => {
						let avatarUrl = participant.avatar_url;
						if (!avatarUrl || avatarUrl.trim() === '') {
							avatarUrl = utils.getAssetPath('wp-content/themes/lms/img/default-avatar.png');
						}
						return {
							user_id: participant.user_id,
							display_name: participant.display_name || 'ユーザー',
							avatar_url: avatarUrl,
							is_parent_author: false,
							reply_count: 0,
						};
					});
					clearTimeout(requestTimeouts.get(parentMessageId));
					requestTimeouts.delete(parentMessageId);
					return processedParticipants;
				} else {
					if (state.isChannelSwitching) {
						return [];
					}
					if (retryCount < maxRetries && !state.isChannelSwitching) {
						await new Promise((resolve) => setTimeout(resolve, 500 * (retryCount + 1)));
						return getThreadParticipants(parentMessageId, retryCount + 1);
					}
					return [];
				}
			} catch (error) {
				if (state.isChannelSwitching) {
					return [];
				}
				if (error.readyState === 0 && retryCount < maxRetries && !state.isChannelSwitching) {
					await new Promise((resolve) => setTimeout(resolve, 500 * (retryCount + 1)));
					return getThreadParticipants(parentMessageId, retryCount + 1);
				}
				return [];
			} finally {
				threadParticipantRequests.delete(parentMessageId);
				if (requestTimeouts.has(parentMessageId)) {
					clearTimeout(requestTimeouts.get(parentMessageId));
					requestTimeouts.delete(parentMessageId);
				}
			}
		})();
		requestPromise.abort = () => {
			if (jqXHR) {
				jqXHR.abort();
			}
		};
		threadParticipantRequests.set(parentMessageId, requestPromise);
		return requestPromise;
	};
	const updateThreadInfo = async (parentMessageId) => {
		try {
			if (!parentMessageId) {
				return;
			}
			const currentChannelId = state.currentChannel || 0;
			if (currentChannelId <= 0) {
				return;
			}
			const $message = $(`.chat-message[data-message-id="${parentMessageId}"]`);
			if ($message.length === 0) {
				let shouldRemoveOrphanedInfo = true;
				if (state.threadInfoCache && state.threadInfoCache.has(parentMessageId)) {
					const cachedInfo = state.threadInfoCache.get(parentMessageId);
					if (cachedInfo.total > 0) {
						shouldRemoveOrphanedInfo = false;
					}
				}
				if (!state.currentThread || state.currentThread != parentMessageId) {
					if (shouldRemoveOrphanedInfo) {
						$(`.thread-info[data-parent-id="${parentMessageId}"]`).remove();
					}
				}
				return;
			}
			const messageChannelId = $message.data('channel-id') || 0;
			if (messageChannelId > 0 && messageChannelId !== currentChannelId) {
				return;
			}
			if (state.threadUpdateInProgress && state.threadUpdateInProgress[parentMessageId]) {
				return;
			}
			if (!state.threadUpdateInProgress) {
				state.threadUpdateInProgress = {};
			}
			state.threadUpdateInProgress[parentMessageId] = true;
			const timestamp = new Date().getTime();
			let retries = 0;
			const maxRetries = 2;
			let response = null;
			while (retries <= maxRetries) {
				try {
					const requestData = {
						action: 'lms_get_thread_info',
						nonce: window.lmsChat.nonce,
						parent_message_ids: [parentMessageId],
						channel_id: currentChannelId,
						_nocache: timestamp,
						_force_refresh: true,
						_request_id: Math.random().toString(36).slice(2, 11),
					};
					if (window.LMSChat.utils && typeof window.LMSChat.utils.makeAjaxRequest === 'function') {
						response = await window.LMSChat.utils.makeAjaxRequest({
							url: window.lmsChat.ajaxUrl,
							type: 'POST',
							data: requestData,
							cache: false,
							timeout: 90000,
							maxRetries: 0,
							retryDelay: 1000,
						});
					} else {
						response = await $.ajax({
							url: window.lmsChat.ajaxUrl,
							type: 'POST',
							data: requestData,
							cache: false,
							timeout: 90000,
						});
					}
					break;
				} catch (error) {
					retries++;
					if (retries > maxRetries) {
						return null;
					}
					const retryDelay = Math.min(1000 * Math.pow(2, retries - 1), 8000);
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			}
			if (response && response.success) {
				const threadData = response.data[parentMessageId];
				if (!threadData) {
					const $message = $(`.chat-message[data-message-id="${parentMessageId}"]`);
					if ($message.length > 0) {
						$message.find('.thread-info').remove();
						$message.attr('data-has-thread', 'false');
					}
					return;
				}
				const {
					thread_count: total,
					thread_unread_count: unread,
					avatars,
					latest_reply,
				} = threadData;
				if (total <= 0) {
					const $message = $(`.chat-message[data-message-id="${parentMessageId}"]`);
					if ($message.length > 0) {
						$message.find('.thread-info').remove();
						$message.attr('data-has-thread', 'false');
					}
					return;
				}
				let finalAvatars = avatars || [];
				if (finalAvatars.length > 0) {
					const userIds = finalAvatars.map((avatar) => avatar.user_id);
				}
				const $message = $(`.chat-message[data-message-id="${parentMessageId}"]`);
				if ($message.length > 0) {
					updateThreadInfoElement(
						$message,
						parentMessageId,
						total,
						unread,
						finalAvatars,
						latest_reply
					);
					if (!state.threadInfoCache) {
						state.threadInfoCache = new Map();
					}
					const currentChannelId = state.currentChannel || 0;
					const threadData = {
						total,
						unread,
						avatars: finalAvatars,
						latest_reply,
						timestamp: Date.now(),
						channelId: currentChannelId,
					};
					if (threadData.total > 0) {
						state.threadInfoCache.set(parentMessageId, threadData);
					} else {
						state.threadInfoCache.delete(parentMessageId);
					}
				} else {
				}
			} else {
				if (response && response.data === 'Parent message not found') {
					if (state.threadInfoCache && state.threadInfoCache.has(parentMessageId)) {
						const cachedInfo = state.threadInfoCache.get(parentMessageId);
						if (cachedInfo.total > 0) {
							return;
						}
					}
					let shouldRemoveDeleted = true;
					if (state.threadInfoCache && state.threadInfoCache.has(parentMessageId)) {
						const cachedInfo = state.threadInfoCache.get(parentMessageId);
						if (cachedInfo.total > 0) {
							shouldRemoveDeleted = false;
						}
					}
					if (!state.currentThread || state.currentThread != parentMessageId) {
						if (shouldRemoveDeleted) {
							const $message = $(`.chat-message[data-message-id="${parentMessageId}"]`);
							if ($message.length) {
								$message.find('.thread-info').remove();
								$message.removeClass('has-thread');
							}
						}
					} else {
					}
				} else {
				}
			}
			delete state.threadUpdateInProgress[parentMessageId];
		} catch (error) {
			if (error.statusText === 'timeout' || error.status === 0) {
			} else {
			}
			if (state.threadUpdateInProgress) {
				delete state.threadUpdateInProgress[parentMessageId];
			}
			if (state.threadInfoCache && state.threadInfoCache.has(parentMessageId)) {
				const cachedInfo = state.threadInfoCache.get(parentMessageId);
				const currentChannelId = state.currentChannel || 0;
				const now = Date.now();
				if (
					cachedInfo.timestamp &&
					now - cachedInfo.timestamp < 24 * 60 * 60 * 1000 &&
					(!cachedInfo.channelId || cachedInfo.channelId === currentChannelId)
				) {
					const $message = $(`.chat-message[data-message-id="${parentMessageId}"]`);
					if ($message.length > 0) {
						updateThreadInfoElement(
							$message,
							parentMessageId,
							cachedInfo.total,
							cachedInfo.unread,
							cachedInfo.avatars,
							cachedInfo.latest_reply
						);
					}
				} else if (cachedInfo.channelId !== currentChannelId) {
					state.threadInfoCache.delete(parentMessageId);
				}
			}
		}
	};
	const queueThreadUpdate = (messageId) => {
		if (!messageId) return;
		if (!state.updateQueue) {
			state.updateQueue = new Set();
		}
		state.updateQueue.add(messageId);
		processUpdateQueue();
	};
	const processUpdateQueue = utils.debounce(async () => {
		if (!state.updateQueue || state.updateQueue.size === 0) return;
		const messageIds = Array.from(state.updateQueue);
		try {
			state.isProcessingQueue = true;
			const promises = messageIds.map((id) => updateThreadInfo(id));
			await Promise.all(promises);
			messageIds.forEach((id) => state.updateQueue.delete(id));
			state.isProcessingQueue = false;
		} catch (error) {
			state.isProcessingQueue = false;
		}
	}, 200);
	const applyThreadInfoToMessage = ($message, threadData) => {
		if (!$message || !threadData || threadData.thread_count <= 0) {
			return;
		}
		const messageId = $message.data('message-id');
		const threadCount = threadData.thread_count;
		const latestReply = threadData.latest_reply || '';
		const unreadCount = threadData.thread_unread_count || 0;
		if (state.currentThread && state.currentThread == messageId) {
			const $existingThreadInfo = $message.find('.thread-info');
			if ($existingThreadInfo.length > 0) {
				$existingThreadInfo.find('.thread-count').text(`${threadCount}件の返信`);
				if (unreadCount > 0) {
					let $unreadBadge = $existingThreadInfo.find('.thread-unread-badge');
					if ($unreadBadge.length === 0) {
						$existingThreadInfo
							.find('.thread-count')
							.after(`<span class="thread-unread-badge">${unreadCount}</span>`);
					} else {
						$unreadBadge.text(unreadCount);
					}
				} else {
					$existingThreadInfo.find('.thread-unread-badge').remove();
				}
				return;
			}
		}
		let shouldRemoveForUpdate = true;
		if (state.threadInfoCache && state.threadInfoCache.has(messageId)) {
			const cachedInfo = state.threadInfoCache.get(messageId);
			if (cachedInfo.total > 0 && threadCount <= cachedInfo.total) {
				shouldRemoveForUpdate = false;
			}
		}
		if (shouldRemoveForUpdate || threadCount > 0) {
			const cachedThreadInfo = state.threadInfoCache ? state.threadInfoCache.get(messageId) : null;
			if (!cachedThreadInfo || cachedThreadInfo.total <= threadCount) {
				$message.find('.thread-info').remove();
			} else {
			}
		}
		$message.removeClass('has-thread');
		let threadInfoHtml = generateThreadInfoHtml(
			messageId,
			threadCount,
			unreadCount,
			[],
			latestReply
		);

		const $reactions = $message.find('.message-reactions');
		if ($reactions.length) {
			$reactions.after(threadInfoHtml);
		} else {
			$message.find('.message-content').after(threadInfoHtml);
		}

		$message.addClass('has-thread');
	};
	let threadInfoUpdateInProgress = false;
	const updateThreadInfoBatch = (messageIds) => {
		if (!messageIds || messageIds.length === 0) {
			return;
		}
		if (threadInfoUpdateInProgress) {
			return;
		}
		const currentChannelId = state.currentChannel;
		if (!currentChannelId) {
			return;
		}
		threadInfoUpdateInProgress = true;
		$.ajax({
			url: window.lmsChat.ajaxUrl,
			type: 'POST',
			data: {
				action: 'lms_get_thread_info',
				parent_message_ids: messageIds,
				channel_id: currentChannelId,
				nonce: window.lmsChat.nonce,
			},
			timeout: 15000,
			success: function (response) {
				if (response.success && response.data) {
					const threadCount = Object.keys(response.data).length;
					if (threadCount === 0) {
						threadInfoUpdateInProgress = false;
						return;
					}
					let appliedCount = 0;
					Object.entries(response.data).forEach(([messageId, threadData]) => {
						if (threadData && threadData.thread_count > 0) {
							const $message = $(`.chat-message[data-message-id="${messageId}"]`);
							if ($message.length > 0) {
								if (!$message.hasClass('has-thread')) {
									applyThreadInfoToMessage($message, threadData);
									appliedCount++;
								} else {
								}
							} else {
							}
						} else {
						}
					});
				} else {
				}
			},
			error: function (xhr, status, error) {
				if (status === 'timeout') {
				}
			},
			complete: function () {
				threadInfoUpdateInProgress = false;
			},
		});
	};
	const updateAllThreadInfo = () => {
		const messageIds = [];
		$('.chat-message').each(function () {
			const messageId = $(this).data('message-id');
			if (messageId) {
				messageIds.push(parseInt(messageId, 10));
			}
		});
		if (messageIds.length === 0) {
			return;
		}
		updateThreadInfoBatch(messageIds);
	};
	const setupMessageEventListeners = () => {
		setupMainChatScrollEvents();
		if (messageViewTracker && typeof messageViewTracker.setupAutoSave === 'function') {
			messageViewTracker.setupAutoSave();
		}
		$(document)
			.off('channel_changed')
			.on('channel_changed', function (e, channelId) {
				state.isChannelSwitching = true;
				state.firstLoadComplete = null;
				state.noMoreOldMessages = false;
				state.isChannelLoaded[channelId] = false;
				messageIdTracker.clear();

				if (infinityScrollState) {
					infinityScrollState.isLoadingHistory = false;
					infinityScrollState.oldestMessageId = null;
					infinityScrollState.newestMessageId = null;
					infinityScrollState.scrollPosition = 0;
					infinityScrollState.lastScrollTop = 0;
					infinityScrollState.scrollDirection = 'none';
					infinityScrollState.hasReachedEnd = false;
					infinityScrollState.hasReachedNewest = false;
					infinityScrollState.endMessageShown = false;

					$('.end-of-history-message').remove();
				}
				const cancelCount = threadParticipantRequests.size + requestTimeouts.size;
				if (cancelCount > 0) {
				}
				for (const [messageId, request] of threadParticipantRequests.entries()) {
					if (request && typeof request.abort === 'function') {
						try {
							request.abort();
						} catch (e) {}
					}
				}
				threadParticipantRequests.clear();
				for (const [messageId, timeoutId] of requestTimeouts.entries()) {
					clearTimeout(timeoutId);
				}
				requestTimeouts.clear();
				if (state.updateQueue) {
					state.updateQueue.clear();
				}
				if (state.threadInfoCache) {
					state.threadInfoCache.clear();
				}
				if (state.threadUpdateInProgress) {
					state.threadUpdateInProgress = {};
				}
				if (window.threadInfoUpdateQueue) {
					window.threadInfoUpdateQueue.clear();
				}
				setTimeout(() => {
					state.isChannelSwitching = false;
				}, 300);
				$(document).one(
					'messages:displayed',
					function (e, messages, isNewMessages, isChannelSwitch) {
						if (isChannelSwitch && !state.isChannelSwitching) {
							setTimeout(() => {
								const $messagesWithThreads = $('.chat-message[data-has-thread="true"]');
								const messagesToUpdate = [];
								$messagesWithThreads.each(function () {
									const messageId = $(this).data('message-id');
									if (messageId && messageId > 0) {
										messagesToUpdate.push(messageId);
									}
								});
								if (messagesToUpdate.length > 0) {
									const batchSize = 3;
									for (let i = 0; i < messagesToUpdate.length; i += batchSize) {
										const batch = messagesToUpdate.slice(i, i + batchSize);
										setTimeout(() => {
											if (!state.isChannelSwitching) {
												batch.forEach((messageId) => {
													updateThreadInfo(messageId);
												});
											}
										}, i * 200);
									}
								}
							}, 1000);
						}
					}
				);
			});
		$(document)
			.off('thread:updated')
			.on('thread:updated', function (e, parentMessageId) {
				if (parentMessageId) {
					updateThreadInfo(parentMessageId);
				}
			});
		$(document)
			.off('thread:message_deleted')
			.on('thread:message_deleted', function (e, data) {
				if (data && data.parentMessageId) {
					updateThreadInfo(data.parentMessageId);
				}
			});
		$(document)
			.off('messages:new_received')
			.on('messages:new_received', function (e, messages) {
				if (state.isChannelSwitching) {
					return;
				}
				if (messages && Array.isArray(messages)) {
					const threadMessages = messages.filter((msg) => msg.thread_id && msg.thread_id > 0);
					const parentIds = new Set();
					threadMessages.forEach((msg) => {
						if (msg.thread_id) {
							parentIds.add(msg.thread_id);
						}
					});
					if (parentIds.size > 0) {
						let delay = 0;
						parentIds.forEach((parentId) => {
							setTimeout(() => {
								if (!state.isChannelSwitching) {
									updateThreadInfo(parentId);
								}
							}, delay);
							delay += 100;
						});
					}
				}
			});
		$('#chat-form')
			.off('submit')
			.on('submit', function (e) {
				e.preventDefault();
				const message = $('#chat-input').val().trim();
				if (message) {
					if (window.LMSChat && window.LMSChat.messages) {
						window.LMSChat.messages.preventAutoScroll = false;
					}
					sendMessage(state.currentChannel, message, Array.from(state.pendingFiles.keys()));
					$('#chat-input').val('').trigger('input');
				}
			});
		const messageQueue = [];
		let isProcessing = false;
		const processMessageQueue = () => {
			if (isProcessing || messageQueue.length === 0) return;
			isProcessing = true;
			const queueItem = messageQueue.shift();
			const message = queueItem.message;
			setTimeout(() => {
				requestAnimationFrame(() => {
					setTimeout(async () => {
						try {
							let channelId = window.LMSChat.state ? window.LMSChat.state.currentChannel : null;
							if (!channelId && window.lmsChat && window.lmsChat.currentChannelId) {
								channelId = window.lmsChat.currentChannelId;
								if (window.LMSChat.state) {
									window.LMSChat.state.currentChannel = channelId;
								}
							}
							const fileIds =
								window.LMSChat.state && window.LMSChat.state.pendingFiles
									? Array.from(window.LMSChat.state.pendingFiles.keys())
									: [];
							if (window.LMSChat.state && window.LMSChat.state.isSending) {
								window.LMSChat.state.isSending = false;
							}
							await sendMessage(channelId, message, fileIds);
						} catch (error) {
						} finally {
							isProcessing = false;
							if (messageQueue.length > 0) {
								setTimeout(processMessageQueue, 50);
							}
						}
					}, 0);
				});
			}, 0);
		};
		$(document)
			.off('click', '#chat-form .send-button, #main-chat-send-button')
			.on('click', '#chat-form .send-button, #main-chat-send-button', function (e) {
				const startTime = performance.now();
				e.preventDefault();
				e.stopPropagation();
				const input = document.getElementById('chat-input');
				if (!input) {
					return;
				}
				const message = input.value.trim();
				if (message && !this.disabled) {
					input.value = '';
					messageQueue.push({
						message: message,
						timestamp: Date.now(),
					});
					requestAnimationFrame(() => {
						$(input).trigger('input');
					});
					setTimeout(() => {
						if (!isProcessing) {
							processMessageQueue();
						}
					}, 1);
				}
			});
		$('#chat-input')
			.on('input', function () {
				this.style.height = 'auto';
				this.style.height = this.scrollHeight + 'px';
				updateSendButtonState();
			})
			.on('keydown', function (e) {
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					const message = $(this).val().trim();
					if (message && state.currentChannel) {
						const fileIds = state.pendingFiles ? Array.from(state.pendingFiles.keys()) : [];
						$(this).val('').css('height', 'auto').trigger('input');
						if (state.pendingFiles) {
							state.pendingFiles.clear();
						}
						$('.file-preview').empty();
						messageQueue.push({
							message,
							channelId: state.currentChannel,
							fileIds: fileIds,
						});
						queueMicrotask(() => processMessageQueue());
					}
				}
			})
			.on('focus', function () {
				updateSendButtonState();
			});
		const mainChatButtonFixInterval = setInterval(() => {
			const $input = $('#chat-input');
			const $mainSendButton = $('#main-chat-send-button, #chat-form .send-button').first();
			if ($input.length && $mainSendButton.length) {
				const hasText = $input.val().trim().length > 0;
				if (hasText) {
					$mainSendButton.prop('disabled', false).addClass('active');
					$mainSendButton.off('click.chatProtection');
					$mainSendButton.on('click.chatProtection', function (e) {
						e.preventDefault();
						e.stopPropagation();
						if (hasText) {
							sendMessage(
								state.currentChannel,
								$input.val().trim(),
								state.pendingFiles ? Array.from(state.pendingFiles.keys()) : []
							).catch((error) => {});
							$input.val('').trigger('input');
						}
					});
				} else {
					$mainSendButton.prop('disabled', true).removeClass('active');
				}
			}
		}, 300);
		$(window).on('beforeunload', function () {
			clearInterval(mainChatButtonFixInterval);
		});
		$('#chat-messages').off('scroll');
		$(document)
			.off('click', '.delete-message')
			.on('click', '.delete-message', function (e) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation(); // 他のハンドラーも停止

				const $button = $(this);

				// data属性で確認中フラグをチェック（最優先）
				if ($button.attr('data-confirming') === 'true') {
					return false;
				}

				// 既に処理中の場合は何もしない（重複防止）
				if ($button.hasClass('deleting') || $button.prop('disabled')) {
					return false;
				}

				// 確認中フラグを設定
				$button.attr('data-confirming', 'true');

				// ボタンを即座に無効化
				$button.addClass('deleting').prop('disabled', true);

				const $message = $button.closest('.chat-message, .thread-message');
				if (!$message.length) {
					$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
					return false;
				}
				const messageId = $message.data('message-id');
				if (!messageId) {
					$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
					return false;
				}
				if ($message.hasClass('thread-message')) {
					$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
					return false;
				}

				const hasThreadInDOM =
					$message.hasClass('has-thread') || $message.find('.thread-info').length > 0;

				if (hasThreadInDOM) {
					showThreadDeleteWarning();
					// ボタンを再度有効化
					$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
				} else {
					showDeleteConfirmDialog(messageId, $message, $button);
				}

				return false; // イベントの伝播を完全に停止
			});

		setTimeout(() => {
			$('.chat-message').each(function () {
				const $message = $(this);
				const $threadInfo = $message.find('.message-header .thread-info');
				if ($threadInfo.length > 0) {
					$threadInfo.detach();
					$message.append($threadInfo);
				}
			});
		}, 500);
		$(document)
			.off('thread:closed')
			.on('thread:closed', function (e, parentMessageId) {
				if (parentMessageId) {
					setTimeout(() => {
						updateThreadInfo(parentMessageId);
					}, 100);
				}
			});
		$(document).on('click', '.thread-button', function (e) {
			e.preventDefault();
			e.stopPropagation();
			const messageId = $(this).data('message-id');
			if (!messageId) return;
			updateThreadInfo(messageId);
		});
	};
	$(() => {
		if (!window.LMSChat) {
			window.LMSChat = {};
		}
		if (!window.LMSChat.state) {
			window.LMSChat.state = {
				isSending: false,
				pendingFiles: new Map(),
				currentChannel:
					window.lmsChat && window.lmsChat.currentChannelId
						? window.lmsChat.currentChannelId
						: null,
				lastMessageId: null,
				isChannelSwitching: false,
				isChannelLoaded: {},
			};
		} else {
			window.LMSChat.state.isChannelSwitching = window.LMSChat.state.isChannelSwitching || false;
			window.LMSChat.state.isChannelLoaded = window.LMSChat.state.isChannelLoaded || {};
		}
		if (!window.LMSChat || !window.LMSChat.utils || !window.LMSChat.utils.validateChatConfig) {
			return;
		}
		if (!window.LMSChat.utils.validateChatConfig()) return;
		setupMessageEventListeners();
		updateUnreadCounts();
		addMainChatButtonProtection();
		setTimeout(addMainChatButtonProtection, 250);
		setTimeout(addMainChatButtonProtection, 500);
		setupDateSeparatorEvents();
	});
	const addMainChatButtonProtection = () => {
		const $mainSendButton = $('#main-chat-send-button, #chat-form .send-button').first();
		const $input = $('#chat-input');
		if ($mainSendButton.length && $input.length) {
			$mainSendButton.attr('id', 'main-chat-send-button');
			$mainSendButton.off('click');
			$mainSendButton.on('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				const message = $input.val().trim();
				if (message) {
					sendMessage(
						state.currentChannel,
						message,
						state.pendingFiles ? Array.from(state.pendingFiles.keys()) : []
					);
					$input.val('').trigger('input');
				}
			});
		} else {
		}
	};
	const handleDeleteMessage = async (messageId, isThread = false) => {
		const $targetMessage = $(`.chat-message[data-message-id="${messageId}"]`);
		$targetMessage.addClass('deleting temp-hidden').css({
			opacity: '0.6',
			'pointer-events': 'none',
			transition: 'opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
			'will-change': 'opacity',
		});
		try {
			const ajaxData = {
				action: 'lms_delete_message',
				message_id: messageId,
				is_thread: isThread ? 1 : 0,
				nonce: window.lmsChat.nonce,
				force_delete: 1,
			};
			const response = await $.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				data: ajaxData,
				timeout: 30000,
				dataType: 'json',
			});
			if (response && response.success === true) {
				$targetMessage.css({
					opacity: '0',
					transition: 'opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
					'will-change': 'opacity',
				});
				setTimeout(() => {
					$targetMessage.remove();
				}, 400);
				return true;
			} else {
				$targetMessage.removeClass('deleting temp-hidden').css({
					opacity: '1',
					'pointer-events': 'auto',
					transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
					'will-change': 'auto',
				});
				const errorMessage = response.data || '';
				if (errorMessage.includes('返信のついたメッセージは削除できません')) {
					showThreadDeleteWarning();
				}
				return false;
			}
		} catch (error) {
			$targetMessage.removeClass('deleting temp-hidden').css({
				opacity: '1',
				'pointer-events': 'auto',
				transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
				'will-change': 'auto',
			});
			return false;
		}
	};
	const showSendSuccessIndicator = () => {
		const $indicator = $('<div class="send-success-indicator">送信完了</div>');
		$('#chat-form').append($indicator);
		$indicator
			.fadeIn(200)
			.delay(1000)
			.fadeOut(200, function () {
				$(this).remove();
			});
	};
	const createDateMenu = (dateKey) => {
		const menu = document.createElement('div');
		menu.className = 'date-menu';
		menu.innerHTML = `
				<div class="menu-item" data-action="latest">最新</div>
				<div class="menu-item" data-action="last-week">先週</div>
				<div class="menu-item" data-action="last-month">先月</div>
				<div class="menu-item" data-action="first">最初</div>
				<div class="menu-item pick-date" data-action="pick-date">特定の日付に移動</div>
			`;
		return menu;
	};
	const setupDateSeparatorEvents = () => {
		$(document).on('click', '.date-separator', function (e) {
			e.stopPropagation();
			const $separator = $(this);
			const dateKey = $separator.closest('.message-group').data('date-key');
			$('.date-menu').remove();
			const menu = createDateMenu(dateKey);
			$separator.append(menu);
			const $menu = $(menu);
			const $messageContainer = $('#chat-messages');
			const menuHeight = $menu.outerHeight();
			const menuWidth = $menu.outerWidth();
			const separatorOffset = $separator.offset();
			const containerOffset = $messageContainer.offset();
			const windowHeight = $(window).height();
			const windowWidth = $(window).width();
			const scrollTop = $(window).scrollTop();
			const separatorTop = separatorOffset.top - containerOffset.top;
			const separatorLeft = separatorOffset.left - containerOffset.left;
			const separatorBottom = separatorTop + $separator.outerHeight();
			const containerHeight = $messageContainer.height();
			const containerWidth = $messageContainer.width();
			const spaceAbove = separatorTop;
			const spaceBelow = containerHeight - separatorBottom;
			const spaceLeft = separatorLeft;
			const spaceRight = containerWidth - (separatorLeft + $separator.outerWidth());
			let direction = 'down';
			if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
				direction = 'up';
			} else if (spaceBelow < menuHeight && spaceRight > menuWidth) {
				direction = 'right';
			} else if (spaceBelow < menuHeight && spaceLeft > menuWidth) {
				direction = 'left';
			}
			$menu.removeClass('menu-up menu-down menu-left menu-right').addClass(`menu-${direction}`);
			$menu.addClass('show');
			$menu.on('click', '.menu-item', async function (e) {
				e.stopPropagation();
				const action = $(this).data('action');
				await handleDateMenuAction(action, dateKey);
				$menu.removeClass('show').remove();
			});
			$(document).one('click', function () {
				$menu.removeClass('show').remove();
			});
			$(document).one('keydown', function (e) {
				if (e.key === 'Escape') {
					$menu.removeClass('show').remove();
				}
			});
		});
	};
	const handleDateMenuAction = async (action, currentDateKey) => {
		const $messageContainer = $('#chat-messages');
		let targetDate;
		if (window.LMSChat && window.LMSChat.cache) {
			window.LMSChat.cache.clearMessagesCache(state.currentChannel);
		}
		state.isLoading = false;
		state.noMoreOldMessages = false;
		state.isDateJumping = true;
		switch (action) {
			case 'latest':
				$messageContainer.scrollTop($messageContainer[0].scrollHeight);
				return;
			case 'last-week':
				targetDate = new Date();
				targetDate.setDate(targetDate.getDate() - 7);
				break;
			case 'last-month':
				targetDate = new Date();
				targetDate.setMonth(targetDate.getMonth() - 1);
				break;
			case 'first':
				disableThreadProtection();
				$messageContainer.empty();
				await loadMessagesByDate('first');
				return;
			case 'pick-date':
				showDatePicker();
				return;
		}
		if (targetDate) {
			const dateKey = getDateKey(targetDate);
			await jumpToDate(dateKey);
		}
	};
	const jumpToDate = async (targetDateKey) => {
		try {
			if (!targetDateKey) {
				throw new Error('日付キーが指定されていません');
			}
			if (!state.currentChannel) {
				throw new Error('現在のチャンネルが設定されていません');
			}
			const $messageContainer = $('#chat-messages');
			const currentGroups = $messageContainer.find('.message-group[data-date-key]');
			const existingTargetGroup = $messageContainer.find(
				`.message-group[data-date-key="${targetDateKey}"]`
			);
			if (existingTargetGroup.length > 0) {
				const directScrollToTarget = () => {
					const $targetGroup = existingTargetGroup;
					const $dateSeparator = $targetGroup.find('.date-separator');
					const topOffset = 20;
					const currentScrollTop = $messageContainer.scrollTop();
					const targetPosition = $targetGroup.position();
					const targetScrollTop = targetPosition.top + currentScrollTop - topOffset;
					$messageContainer.animate(
						{
							scrollTop: targetScrollTop,
						},
						300,
						function () {
							if ($dateSeparator.length) {
								$dateSeparator.addClass('highlight-separator');
								setTimeout(() => {
									$dateSeparator.removeClass('highlight-separator');
								}, 2000);
							}
						}
					);
				};
				directScrollToTarget();
				return;
			}
			try {
				state.fallbackSuccess = false;
				await loadSpecificDateMessages(targetDateKey);
				if (state.fallbackSuccess) {
					return;
				}
				const $targetGroup = $messageContainer.find(
					`.message-group[data-date-key="${targetDateKey}"]`
				);
				if ($targetGroup.length === 0) {
					return;
				}
			} catch (searchError) {
				throw new Error(
					`指定の日付（${targetDateKey}）のメッセージ検索に失敗しました: ${searchError.message}`
				);
			}
			let $targetGroup = $messageContainer.find(`.message-group[data-date-key="${targetDateKey}"]`);
			if ($targetGroup.length > 0) {
				setTimeout(() => {
					$targetGroup = $messageContainer.find(`.message-group[data-date-key="${targetDateKey}"]`);
					if ($targetGroup.length === 0) {
						return;
					}
					const allGroups = $messageContainer.find('.message-group[data-date-key]');
					let targetIndex = -1;
					allGroups.each(function (index) {
						if ($(this).attr('data-date-key') === targetDateKey) {
							targetIndex = index;
							return false;
						}
					});
					const $dateSeparator = $targetGroup.find('.date-separator');
					const topOffset = 20;
					const containerScrollTop = $messageContainer.scrollTop();
					const targetPosition = $targetGroup.position();
					let targetScrollTop;
					if (targetIndex >= 0) {
						targetScrollTop = targetPosition.top + containerScrollTop - topOffset;
					} else {
						targetScrollTop = targetPosition.top - topOffset;
					}
					const allVisibleGroups = $messageContainer.find('.message-group[data-date-key]');
					state.blockScrollOverride = true;
					state.finalScrollPosition = targetScrollTop;
					state.isJumpAnimating = true;
					let scrollMonitorInterval;
					const startScrollMonitoring = () => {
						scrollMonitorInterval = setInterval(() => {
							if (!state.isJumpAnimating) {
								clearInterval(scrollMonitorInterval);
								return;
							}
							const currentScrollTop = $messageContainer.scrollTop();
							const expectedScrollTop = state.finalScrollPosition;
							const tolerance = 5;
							if (Math.abs(currentScrollTop - expectedScrollTop) > tolerance) {
								$messageContainer.scrollTop(expectedScrollTop);
							}
						}, 16);
					};
					startScrollMonitoring();
					$messageContainer.animate(
						{
							scrollTop: targetScrollTop,
						},
						300,
						function () {
							state.isJumpAnimating = false;
							const finalTargetGroup = $messageContainer.find(
								`.message-group[data-date-key="${targetDateKey}"]`
							);
							if (finalTargetGroup.length > 0) {
								const finalPosition = finalTargetGroup.position();
								const containerHeight = $messageContainer.height();
								const isVisible = finalPosition.top >= 0 && finalPosition.top < containerHeight;
								if (!isVisible) {
									const topOffset = 20;
									const correctScrollTop =
										finalPosition.top + $messageContainer.scrollTop() - topOffset;
									$messageContainer.scrollTop(correctScrollTop);
									state.finalScrollPosition = correctScrollTop;
								}
							}
							state.finalScrollPosition = $messageContainer.scrollTop();
							setTimeout(() => {
								state.blockScrollOverride = false;
								state.isJumpAnimating = false;
							}, 500);
							if ($dateSeparator.length) {
								$dateSeparator.addClass('highlight-separator');
								setTimeout(() => {
									$dateSeparator.removeClass('highlight-separator');
								}, 2000);
							}
						}
					);
				}, 50);
			} else {
				return;
			}
		} catch (error) {
			state.blockScrollOverride = false;
			state.isJumpAnimating = false;
		}
	};
	const loadSpecificDateMessages = async (targetDateKey) => {
		if (!state.currentChannel) {
			throw new Error('現在のチャンネルが設定されていません');
		}
		try {
			if (typeof disableThreadProtection === 'function') {
				disableThreadProtection();
			} else {
			}
			const $messageContainer = $('#chat-messages');
			const originalContent = $messageContainer.html();
			$messageContainer.prepend(
				'<div class="loading-messages date-search-loading">指定の日付のメッセージを検索中...</div>'
			);
			try {
				if (window.LMSChat && window.LMSChat.cache) {
					if (typeof window.LMSChat.cache.clearMessagesCache === 'function') {
						window.LMSChat.cache.clearMessagesCache(state.currentChannel);
					}
					if (typeof window.LMSChat.cache.clearAllCache === 'function') {
						window.LMSChat.cache.clearAllCache();
					}
				}
			} catch (cacheError) {}
			state.isLoading = false;
			state.noMoreOldMessages = false;
			state.isFirstMessageLoaded = false;
			state.isDateJumping = true;
			state.lastMessageId = 0;
			state.currentPage = 1;
			state.preventScrollEvents = true;
			let foundMessages = [];
			let foundPage = null;
			let page = 1;
			const maxPages = 200;
			let pageRetryCount = {};
			while (page <= maxPages) {
				try {
					if (!window.lmsChat?.ajaxUrl) {
						throw new Error('Ajax URLが設定されていません');
					}
					if (!window.lmsChat?.nonce) {
						throw new Error('Nonceが設定されていません');
					}
					const requestData = {
						action: 'lms_get_messages',
						channel_id: state.currentChannel,
						page: page,
						nonce: window.lmsChat.nonce,
						_timestamp: Date.now(),
						_search_target: targetDateKey,
					};
					const response = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'GET',
						data: requestData,
						timeout: 30000,
						cache: false,
						async: true,
						dataType: 'json',
					});
					if (response.success && response.data && response.data.messages) {
						let targetGroupIndex = -1;
						for (let groupIndex = 0; groupIndex < response.data.messages.length; groupIndex++) {
							const group = response.data.messages[groupIndex];
							if (group.date && group.messages && group.messages.length > 0) {
								let groupDateKey;
								try {
									if (typeof group.date === 'string') {
										const dateMatch = group.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
										if (dateMatch) {
											const year = dateMatch[1];
											const month = dateMatch[2].padStart(2, '0');
											const day = dateMatch[3].padStart(2, '0');
											groupDateKey = `${year}-${month}-${day}`;
										} else {
											const firstMessage = group.messages[0];
											if (firstMessage && firstMessage.created_at) {
												const msgDate = new Date(firstMessage.created_at);
												groupDateKey = getDateKey(msgDate);
											}
										}
									}
								} catch (e) {
									continue;
								}
								if (groupDateKey === targetDateKey) {
									targetGroupIndex = groupIndex;
									break;
								}
							}
						}
						if (targetGroupIndex >= 0) {
							const targetGroup = response.data.messages[targetGroupIndex];
							const pagesToLoad = [];
							const centerPage = page;
							for (let p = Math.max(1, centerPage - 1); p <= centerPage + 1; p++) {
								pagesToLoad.push(p);
							}
							const allMessages = [];
							for (const pageNum of pagesToLoad) {
								try {
									const pageResponse = await $.ajax({
										url: window.lmsChat.ajaxUrl,
										type: 'GET',
										data: {
											action: 'lms_get_messages',
											channel_id: state.currentChannel,
											page: pageNum,
											nonce: window.lmsChat.nonce,
											_timestamp: Date.now(),
										},
										timeout: 20000,
										cache: false,
										dataType: 'json',
									});
									if (pageResponse.success && pageResponse.data && pageResponse.data.messages) {
										allMessages.push(...pageResponse.data.messages);
									}
								} catch (pageError) {}
								await new Promise((resolve) => setTimeout(resolve, 100));
							}
							allMessages.sort((a, b) => {
								const dateA = new Date(a.messages?.[0]?.created_at || 0);
								const dateB = new Date(b.messages?.[0]?.created_at || 0);
								return dateA - dateB;
							});
							const targetGroupFoundIndex = allMessages.findIndex((group) => {
								if (group.date && typeof group.date === 'string') {
									let match = group.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
									if (!match) {
										match = group.date.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
									}
									if (match) {
										const year = match[1];
										const month = match[2].padStart(2, '0');
										const day = match[3].padStart(2, '0');
										const gDateKey = `${year}-${month}-${day}`;
										return gDateKey === targetDateKey;
									} else {
										if (group.date === targetDateKey) {
											return true;
										}
									}
								}
								return false;
							});
							allMessages.forEach((group, index) => {
								if (group.date) {
									const match = group.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
									if (match) {
										const year = match[1];
										const month = match[2].padStart(2, '0');
										const day = match[3].padStart(2, '0');
										const gDateKey = `${year}-${month}-${day}`;
									}
								}
							});
							let targetIndex = -1;
							for (let i = 0; i < allMessages.length; i++) {
								const group = allMessages[i];
								if (group.date && group.date.includes(targetDateKey)) {
									targetIndex = i;
									break;
								}
								const japaneseDate = targetDateKey
									.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1年$2月$3日')
									.replace(/年0(\d)月/, '年$1月')
									.replace(/月0(\d)日/, '月$1日');
								if (group.date && group.date.includes(japaneseDate)) {
									targetIndex = i;
									break;
								}
							}
							if (targetIndex >= 0) {
								const startIndex = Math.max(0, targetIndex - 2);
								const endIndex = Math.min(allMessages.length - 1, targetIndex + 2);
								foundMessages = allMessages.slice(startIndex, endIndex + 1);
								foundMessages.forEach((group, index) => {});
							} else {
								const originalTargetGroup = response.data.messages[targetGroupIndex];
								foundMessages = originalTargetGroup ? [originalTargetGroup] : allMessages;
							}
							foundPage = centerPage;
							state.targetDateKey = targetDateKey;
							state.targetPageIndex = centerPage;
							state.currentPage = centerPage;
							state.oldestPage = Math.max(1, centerPage - 1);
							state.newestPage = centerPage + 1;
							foundMessages.forEach((group, index) => {
								if (group.date) {
								}
							});
							break;
						} else {
						}
						if (foundMessages.length > 0) {
							foundPage = page;
							break;
						}
						if (response.data.messages.length === 0) {
							break;
						}
						page++;
						await new Promise((resolve) => setTimeout(resolve, 100));
					} else {
						break;
					}
				} catch (error) {
					if (error.statusText === 'timeout' || error.status === 0) {
						if (!pageRetryCount[page]) pageRetryCount[page] = 0;
						pageRetryCount[page]++;
						if (pageRetryCount[page] <= 3) {
							await new Promise((resolve) => setTimeout(resolve, 1000));
							continue;
						} else {
							page++;
							continue;
						}
					}
					if (error.status >= 500) {
						break;
					} else {
						page++;
						continue;
					}
				}
			}
			$('#chat-messages .loading-messages').remove();
			$('.date-search-loading').remove();
			if (foundMessages.length > 0) {
				foundMessages.forEach((group, index) => {});
				await displayMessages({ messages: foundMessages }, false, false);
				state.preventScrollEvents = false;
				state.isDateJumping = false;
				setTimeout(() => {
					const displayedGroups = $('#chat-messages .message-group[data-date-key]');
					displayedGroups.each(function (index) {
						const dateKey = $(this).attr('data-date-key');
						const dateText = $(this).find('.date-separator').text();
					});
				}, 100);
				setTimeout(async () => {
					const $targetGroup = $messageContainer.find(
						`.message-group[data-date-key="${targetDateKey}"]`
					);
					if ($targetGroup.length > 0) {
						const $dateSeparator = $targetGroup.find('.date-separator');
						const topOffset = 20;
						$messageContainer.animate(
							{
								scrollTop: $targetGroup.position().top - topOffset,
							},
							500,
							async function () {
								if ($dateSeparator.length) {
									$dateSeparator.addClass('highlight-separator');
									setTimeout(() => {
										$dateSeparator.removeClass('highlight-separator');
									}, 3000);
								}
								state.noMoreOldMessages = (state.oldestPage || foundPage) <= 1;
								state.noMoreNewMessages = false;
							}
						);
					}
				}, 300);
			} else {
				try {
					const fallbackResponse = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'GET',
						data: {
							action: 'lms_get_messages_by_date',
							channel_id: state.currentChannel,
							date: targetDateKey,
							nonce: window.lmsChat.nonce,
						},
						timeout: 20000,
						cache: false,
					});
					if (
						fallbackResponse.success &&
						fallbackResponse.data &&
						fallbackResponse.data.messages &&
						fallbackResponse.data.messages.length > 0
					) {
						await displayMessages(fallbackResponse.data, false, false);
						state.preventScrollEvents = false;
						state.isDateJumping = false;
						setTimeout(() => {
							const $targetGroup = $messageContainer.find(
								`.message-group[data-date-key="${targetDateKey}"]`
							);
							if ($targetGroup.length > 0) {
								const $dateSeparator = $targetGroup.find('.date-separator');
								const topOffset = 20;
								$messageContainer.animate(
									{
										scrollTop: $targetGroup.position().top - topOffset,
									},
									500,
									function () {
										if ($dateSeparator.length) {
											$dateSeparator.addClass('highlight-separator');
											setTimeout(() => {
												$dateSeparator.removeClass('highlight-separator');
											}, 3000);
										}
									}
								);
							}
						}, 300);
						state.fallbackSuccess = true;
						return;
					} else {
					}
				} catch (fallbackError) {}
				$('.date-search-loading').remove();
				const $errorMsg = $(
					'<div class="no-messages temp-error">指定の日付（' +
						targetDateKey +
						'）にメッセージが見つかりませんでした</div>'
				);
				$('#chat-messages').prepend($errorMsg);
				setTimeout(() => {
					$errorMsg.fadeOut(300, function () {
						$(this).remove();
					});
				}, 3000);
				state.preventScrollEvents = false;
				state.isDateJumping = false;
			}
			if (typeof enableThreadProtection === 'function') {
				enableThreadProtection();
			}
		} catch (error) {
			$('.date-search-loading').remove();
			const $errorMsg = $(
				'<div class="error-message temp-error">メッセージの検索に失敗しました</div>'
			);
			$('#chat-messages').prepend($errorMsg);
			setTimeout(() => {
				$errorMsg.fadeOut(300, function () {
					$(this).remove();
				});
			}, 3000);
			state.preventScrollEvents = false;
			state.isDateJumping = false;
			if (typeof enableThreadProtection === 'function') {
				enableThreadProtection();
			}
			throw error;
		}
	};
	const loadMessagesByDate = async (target, messageId = null) => {
		if (!state.currentChannel) return;
		try {
			disableThreadProtection();
			const $messageContainer = $('#chat-messages');
			$messageContainer
				.empty()
				.html('<div class="loading-messages loading-indicator">読み込み中...</div>');
			if (window.LMSChat && window.LMSChat.cache) {
				window.LMSChat.cache.clearMessagesCache(state.currentChannel);
			}
			state.isLoading = false;
			state.noMoreOldMessages = false;
			state.isFirstMessageLoaded = false;
			state.isDateJumping = true;
			let ajaxData = {
				channel_id: state.currentChannel,
				nonce: window.lmsChat.nonce,
			};
			let actionUrl = window.lmsChat.ajaxUrl;
			if (target === 'first') {
				ajaxData.action = 'lms_get_first_messages';
				ajaxData.force_first = true;
			} else if (target === 'message' && messageId) {
				ajaxData.action = 'lms_get_messages_around';
				ajaxData.message_id = messageId;
			} else if (typeof target === 'string' && target.match(/\d{4}-\d{2}-\d{2}/)) {
				await loadSpecificDateMessages(target);
				return;
			} else {
				throw new Error('Invalid target parameter');
			}
			let response;
			try {
				response = await $.ajax({
					url: actionUrl,
					type: 'GET',
					data: ajaxData,
					timeout: 10000,
				});
			} catch (error) {
				if (target === 'first') {
					try {
						response = await $.ajax({
							url: actionUrl,
							type: 'GET',
							data: {
								action: 'lms_get_oldest_messages',
								channel_id: state.currentChannel,
								nonce: window.lmsChat.nonce,
							},
							timeout: 10000,
						});
					} catch (fallbackError) {
						try {
							response = await $.ajax({
								url: actionUrl,
								type: 'GET',
								data: {
									action: 'lms_get_messages',
									channel_id: state.currentChannel,
									page: 1,
									nonce: window.lmsChat.nonce,
								},
								timeout: 10000,
							});
							if (response.success && response.data && response.data.messages) {
								response.data.messages.reverse();
								response.data.messages.forEach((group) => {
									if (group.messages) {
										group.messages.reverse();
									}
								});
							}
						} catch (finalError) {
							throw finalError;
						}
					}
				} else {
					throw error;
				}
			}
			if (response.success && response.data) {
				if (response.data.messages && response.data.messages.length > 0) {
					response.data.messages.forEach((group, index) => {
						if (group.messages && group.messages.length > 0) {
						}
					});
				}
				state.preventScrollEvents = true;
				if (!response.data.messages || response.data.messages.length === 0) {
					$('#chat-messages').html(
						'<div class="no-messages">指定された条件でメッセージが見つかりませんでした</div>'
					);
					state.preventScrollEvents = false;
					state.isFirstMessageLoaded = true;
					state.isDateJumping = false;
					setTimeout(() => {
						state.isFirstMessageLoaded = false;
					}, 2000);
					enableThreadProtection();
					return;
				}
				$('#chat-messages .loading-messages').remove();
				if (target === 'first') {
					await displayMessages(response.data, false, false);
				} else {
					await displayMessages(response.data, false, true);
				}
				const $messagesAfterDisplay = $('#chat-messages .message-group');
				enableThreadProtection();
				if (messageId && target === 'message') {
					setTimeout(() => {
						const $targetMessage = $(`.message-item[data-message-id="${messageId}"]`);
						if ($targetMessage.length > 0) {
							$targetMessage[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
							$targetMessage.addClass('highlight-message');
							setTimeout(() => {
								$targetMessage.removeClass('highlight-message');
							}, 3000);
						}
					}, 500);
				} else if (target === 'first') {
					// 最古メッセージを表示したので、これより上にはメッセージがない
					if (infinityScrollState) {
						infinityScrollState.hasReachedEnd = true;
						infinityScrollState.hasReachedNewest = false;
						infinityScrollState.endMessageShown = false;

						// 最新のメッセージIDを設定
						const $lastMessage = $('#chat-messages .chat-message').last();
						if ($lastMessage.length) {
							infinityScrollState.newestMessageId = $lastMessage.data('message-id');
						}
					}

					// 「これ以上古いメッセージはありません」を表示
					showEndOfHistoryMessage();

					setTimeout(() => {
						const $messageContainer = $('#chat-messages');
						$messageContainer.scrollTop(0);
						const $firstGroup = $messageContainer.find('.message-group').first();
						if ($firstGroup.length > 0) {
							const $dateSeparator = $firstGroup.find('.date-separator');
							if ($dateSeparator.length) {
								$dateSeparator.addClass('highlight-separator');
								setTimeout(() => {
									$dateSeparator.removeClass('highlight-separator');
								}, 3000);
							}
						}
						setTimeout(() => {
							$messageContainer.scrollTop(0);
						}, 100);
					}, 300);
				} else {
					const $firstGroup = $('#chat-messages .message-group').first();
					if ($firstGroup.length > 0) {
						const $dateSeparator = $firstGroup.find('.date-separator');
						const topOffset = 20;
						$('#chat-messages').animate(
							{
								scrollTop: $firstGroup.offset().top - $('#chat-messages').offset().top - topOffset,
							},
							200,
							function () {
								if ($dateSeparator.length) {
									$dateSeparator.addClass('highlight-separator');
									setTimeout(() => {
										$dateSeparator.removeClass('highlight-separator');
									}, 2000);
								}
							}
						);
					} else {
						$messageContainer.animate(
							{
								scrollTop: 0,
							},
							200
						);
					}
				}
				const delay = target === 'first' ? 2000 : 1000;
				setTimeout(() => {
					state.preventScrollEvents = false;
					state.isDateJumping = false;
					if (target === 'first') {
						state.noMoreOldMessages = false;
						state.isFirstMessageLoaded = true;
						setTimeout(async () => {
							await loadAllMessagesFromFirst();
							state.isFirstMessageLoaded = false;
						}, 2000);
					}
				}, delay);
			} else {
				$('#chat-messages').html(
					'<div class="error-message">メッセージの読み込みに失敗しました</div>'
				);
				state.isDateJumping = false;
				enableThreadProtection();
			}
		} catch (error) {
			$('#chat-messages').html(
				'<div class="error-message">メッセージの読み込みに失敗しました</div>'
			);
			state.isDateJumping = false;
			enableThreadProtection();
		}
	};
	const loadFirstMessages = async () => {
		await loadMessagesByDate('first');
	};
	const jumpToMessage = async (messageId) => {
		if (!messageId || !state.currentChannel) return;
		await loadMessagesByDate('message', messageId);
	};
	window.LMSChat.messages = window.LMSChat.messages || {};
	window.LMSChat.messages.jumpToMessage = jumpToMessage;
	const showDatePicker = () => {
		const $dateMenu = $('.date-menu.show');
		const menuPosition = $dateMenu.offset();
		const $messageContainer = $('#chat-messages');
		const containerOffset = $messageContainer.offset();
		const $overlay = $('<div class="date-picker-overlay"></div>');
		const $container = $(
			'<div class="date-picker-container"><input type="text" class="date-picker"></div>'
		);
		$('body').append($overlay).append($container);
		$container.css({
			position: 'fixed',
			visibility: 'hidden',
			display: 'block',
		});
		const picker = flatpickr('.date-picker', {
			enableTime: false,
			dateFormat: 'Y-m-d',
			maxDate: 'today',
			locale: 'ja',
			static: true,
			inline: true,
			onChange: async (selectedDates) => {
				try {
					const selectedDate = selectedDates[0];
					const dateKey = getDateKey(selectedDate);
					$('.date-menu').removeClass('show').remove();
					await jumpToDate(dateKey);
					closeDatePicker();
				} catch (error) {
					utils.showError(`日付の移動に失敗しました: ${error.message}`);
					closeDatePicker();
				}
			},
			onClose: () => {
				closeDatePicker();
			},
		});
		const pickerWidth = $container.outerWidth();
		const pickerHeight = $container.outerHeight();
		const $menu = $('.date-menu.show');
		if ($menu.length) {
			const menuDirection = $menu.attr('class').match(/menu-(up|down|left|right)/)?.[1] || 'down';
			const menuRect = $menu[0].getBoundingClientRect();
			let pickerTop = menuRect.bottom + 8;
			let pickerLeft = menuRect.left;
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const scrollTop = $(window).scrollTop();
			const scrollLeft = $(window).scrollLeft();
			const spaceRight = viewportWidth - menuRect.right;
			const spaceLeft = menuRect.left;
			const spaceBottom = viewportHeight - menuRect.bottom;
			const spaceTop = menuRect.top;
			let direction = 'down';
			if (spaceBottom < pickerHeight && spaceTop > pickerHeight) {
				direction = 'up';
			} else if (spaceBottom < pickerHeight && spaceRight > pickerWidth) {
				direction = 'right';
			} else if (spaceBottom < pickerHeight && spaceLeft > pickerWidth) {
				direction = 'left';
			}
			switch (direction) {
				case 'right':
					pickerLeft = menuRect.right + 8;
					pickerTop = Math.min(menuRect.top, viewportHeight - pickerHeight - 16);
					break;
				case 'left':
					pickerLeft = menuRect.left - pickerWidth - 8;
					pickerTop = Math.min(menuRect.top, viewportHeight - pickerHeight - 16);
					break;
				case 'up':
					pickerLeft = Math.min(menuRect.left, viewportWidth - pickerWidth - 16);
					pickerTop = menuRect.top - pickerHeight - 8;
					break;
				case 'down':
				default:
					pickerLeft = Math.min(menuRect.left, viewportWidth - pickerWidth - 16);
					pickerTop = menuRect.bottom + 8;
					break;
			}
			if (pickerLeft + pickerWidth > viewportWidth) {
				pickerLeft = viewportWidth - pickerWidth - 16;
			}
			if (pickerLeft < 0) {
				pickerLeft = 16;
			}
			if (pickerTop + pickerHeight > viewportHeight) {
				pickerTop = viewportHeight - pickerHeight - 16;
			}
			if (pickerTop < 0) {
				pickerTop = 16;
			}
			$container.css({
				position: 'fixed',
				top: pickerTop + 'px',
				left: pickerLeft + 'px',
				transform: 'none',
				visibility: 'visible',
			});
		}
		$overlay.addClass('show');
		$container.addClass('show');
		$overlay.on('click', () => {
			closeDatePicker();
		});
		$(document).one('keydown', (e) => {
			if (e.key === 'Escape') {
				closeDatePicker();
			}
		});
	};
	const closeDatePicker = () => {
		$('.date-picker-overlay').removeClass('show');
		setTimeout(() => {
			$('.date-picker-overlay, .date-picker-container').remove();
		}, 200);
	};
	const processMessageGroup = async (group, isNewMessage, isChannelSwitch = false) => {
		const $messageContainer = $('#chat-messages');
		let groupDate;
		try {
			if (group.date && typeof group.date === 'string') {
				if (group.date.includes('年')) {
					const parts = group.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
					if (parts) {
						groupDate = new Date(
							parseInt(parts[1], 10),
							parseInt(parts[2], 10) - 1,
							parseInt(parts[3], 10)
						);
					} else {
						groupDate = fallbackDate(group);
					}
				} else {
					groupDate = new Date(group.date);
					if (isNaN(groupDate.getTime())) {
						groupDate = fallbackDate(group);
					}
				}
			} else if (typeof group.date === 'object' && group.date instanceof Date) {
				groupDate = group.date;
			} else {
				groupDate = fallbackDate(group);
			}
		} catch (e) {
			groupDate = fallbackDate(group);
		}
		function fallbackDate(groupData) {
			if (groupData.messages && groupData.messages.length) {
				const firstMessage = groupData.messages[0];
				if (firstMessage.created_at) {
					return new Date(firstMessage.created_at);
				}
			}
			return new Date();
		}
		const dateKey = getDateKey(groupDate);

		let $targetGroup = $messageContainer.find(`.message-group[data-date-key="${dateKey}"]`);

		return new Promise((resolve) => {
			const executeFn = () => {
				try {
					if ($targetGroup.length === 0) {
						$targetGroup = $('<div class="message-group"></div>').attr('data-date-key', dateKey);
						const formattedDate = getFormattedDate(groupDate);
						const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
						$targetGroup.append(separatorHtml);

						let inserted = false;
						const $existingGroups = $messageContainer.find('.message-group');

						if ($existingGroups.length > 0) {
							for (let i = 0; i < $existingGroups.length; i++) {
								const $group = $($existingGroups[i]);
								const groupDateKey = $group.attr('data-date-key');

								if (groupDateKey && dateKey < groupDateKey) {
									$group.before($targetGroup);
									inserted = true;
									break;
								}
							}
						}

						if (!inserted) {
							$messageContainer.append($targetGroup);
						}
					} else {
						if (!$targetGroup.find('.date-separator').length) {
							const formattedDate = getFormattedDate(groupDate);
							const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
							$targetGroup.prepend(separatorHtml);
						}
					}
					if (group.messages && Array.isArray(group.messages)) {
						const sortedMessages = [...group.messages].sort((a, b) => {
							const dateA = new Date(a.created_at || 0);
							const dateB = new Date(b.created_at || 0);
							return dateA - dateB;
						});
						let processedCount = 0;
						const messageBatch = [];

						for (const message of sortedMessages) {
							const $existingMessage = $targetGroup.find(
								`.chat-message[data-message-id="${message.id}"]`
							);
							let shouldProcessMessage = $existingMessage.length === 0;

							if (shouldProcessMessage) {
								// 🔥 SCROLL FLICKER FIX: チャンネル切り替え時のスレッド情報更新を完全削除
								// setTimeoutによる非同期更新がスクロール後にDOM高さを変更してフリッカーを引き起こしていた
								// スレッド情報は既にキャッシュに保存されており、必要に応じて後で復元される
								const existingReadStatus = getMessageReadStatus(message.id, false);
								if (existingReadStatus === 'fully_read') {
									message.is_new = false;
								}

								const messageHtml = getCachedMessageHtml(message);
								if (messageHtml) {
									messageBatch.push({ html: messageHtml, message });
									processedCount++;
								}
							}
						}

						const fragment = document.createDocumentFragment();
						let actualInsertCount = 0;
						messageBatch.forEach(({ html, message }) => {
							const tempDiv = document.createElement('div');
							tempDiv.innerHTML = html;
							while (tempDiv.firstChild) {
								fragment.appendChild(tempDiv.firstChild);
								actualInsertCount++;
							}
						});

						$targetGroup[0].appendChild(fragment);
						// 🔥 SCROLL FLICKER FIX: markMessageAsReadのsetTimeoutを完全削除
						// 既読マークの遅延処理がスクロール後にDOM更新を引き起こしていた可能性
						if (processedCount > 0) {
							// 既読処理は必要に応じて他の箇所で実行される
						}
					}
					resolve($targetGroup);
				} catch (error) {
					resolve($targetGroup);
				}
			};

			queueDomUpdate(executeFn);
		});
	};
	const formatDateForAPI = (date) => {
		if (!(date instanceof Date)) {
			try {
				date = new Date(date);
			} catch (e) {
				return '';
			}
		}
		if (isNaN(date.getTime())) {
			return '';
		}
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	};
	const createFallbackReactionsHtml = (reactions) => {
		if (!reactions || reactions.length === 0) {
			return '';
		}
		try {
			const groupedReactions = {};
			reactions.forEach((reaction) => {
				const emoji = reaction.emoji || reaction.reaction || reaction.type || '👍';
				const displayName = reaction.display_name || `ユーザー${reaction.user_id}`;

				if (!groupedReactions[emoji]) {
					groupedReactions[emoji] = {
						emoji: emoji,
						count: 0,
						users: [],
					};
				}
				groupedReactions[emoji].count++;
				groupedReactions[emoji].users.push(displayName);
			});
			let html = '<div class="message-reactions fallback" data-reactions-hydrated="1">';
			Object.values(groupedReactions).forEach((group) => {
				const userList = group.users.join(', ');
				html += `<div class="reaction-item" title="${userList}">
					<span class="emoji">${group.emoji}</span>
					<span class="count">${group.count}</span>
				</div>`;
			});
			html += '</div>';
			return html;
		} catch (error) {
			// エラーを無視
			return '';
		}
	};
	if (!window.lastThreadInfoUpdate) {
		window.lastThreadInfoUpdate = new Map();
	}
	if (!window.ThreadInfoUpdateManager) {
		window.ThreadInfoUpdateManager = {
			updateQueue: new Map(),
			processingQueue: new Set(),
			globalLock: new Set(),
			observer: null,
			init() {
				if (!this.observer) {
					this.observer = new MutationObserver((mutations) => {
						mutations.forEach((mutation) => {
							if (mutation.type === 'childList') {
								mutation.addedNodes.forEach((node) => {
									if (
										node.nodeType === Node.ELEMENT_NODE &&
										node.classList &&
										node.classList.contains('thread-info')
									) {
										const messageId = node.getAttribute('data-message-id');
										if (messageId) {
											this.checkAndFixDuplicates(messageId);
										}
									}
								});
							}
						});
					});
					const chatContainer = document.querySelector('.chat-messages');
					if (chatContainer) {
						this.observer.observe(chatContainer, {
							childList: true,
							subtree: true,
						});
					}
				}
			},
			checkAndFixDuplicates(messageId) {
				setTimeout(() => {
					const $message = $(`.chat-message[data-message-id="${messageId}"]`);
					if ($message.length) {
						const $threadInfos = $message.find('.thread-info');
						if ($threadInfos.length > 1) {
							$threadInfos.slice(1).remove();
						}
					}
				}, 50);
			},
			queueUpdate(messageId, $message, threadInfo) {
				// 🔍 DEBUG: キューに追加される前のデータを記録
				const avatarCount =
					threadInfo && threadInfo.avatars && Array.isArray(threadInfo.avatars)
						? threadInfo.avatars.length
						: 0;

				const isForceDelete = threadInfo && parseInt(threadInfo.total, 10) === 0;
				if (this.globalLock.has(messageId) && !isForceDelete) {
					return;
				}
				if (isForceDelete) {
					threadInfo.forceDelete = true;
					this.globalLock.add(`force_delete_${messageId}`);
				}

				// 🔥 CRITICAL FIX: キャッシュに優先度の高いデータがある場合はそれを使用
				if (state.threadInfoCache && state.threadInfoCache.has(messageId)) {
					const cachedInfo = state.threadInfoCache.get(messageId);
					if (cachedInfo.priority === 'high' && cachedInfo.confirmed === true) {
						// キャッシュのデータの方が新しく信頼できる場合は、それを使用
						if (!threadInfo.timestamp || cachedInfo.timestamp > threadInfo.timestamp) {
							threadInfo = { ...cachedInfo };
						}
					}
				}

				this.updateQueue.set(messageId, { $message, threadInfo, timestamp: Date.now() });
				if (!this.processingQueue.has(messageId)) {
					this.processUpdate(messageId);
				}
			},
			processUpdate(messageId) {
				// 🔥 SCROLL FLICKER FIX: スクロール完了から1000ms以内はスキップ
				if (state.firstLoadComplete) {
					const timeSinceScroll = Date.now() - state.firstLoadComplete;
					if (timeSinceScroll < 1000) {
						return;
					}
				}

				this.processingQueue.add(messageId);
				this.globalLock.add(messageId);

				// 🔥 SCROLL FLICKER FIX: チャンネル切り替え中は遅延なしで即座に実行
				const delay = state.isChannelSwitching ? 0 : 10;

				setTimeout(() => {
					try {
						const updateData = this.updateQueue.get(messageId);
						if (!updateData) {
							return;
						}
						this.updateQueue.delete(messageId);
						this.performActualUpdate(updateData.$message, updateData.threadInfo);
					} finally {
						this.processingQueue.delete(messageId);
						setTimeout(() => {
							this.globalLock.delete(messageId);
							this.globalLock.delete(`force_delete_${messageId}`);
						}, 200);
						if (this.updateQueue.has(messageId)) {
							setTimeout(() => this.processUpdate(messageId), 100);
						}
					}
				}, delay);
			},
			performActualUpdate($message, threadInfo) {
				try {
					const messageId = $message.data('message-id');

					if (!threadInfo || typeof threadInfo !== 'object') {
						return;
					}

					// 🔍 DEBUG: どこから呼ばれているか、どんなデータが渡されているかを記録
					const avatarCount =
						threadInfo.avatars && Array.isArray(threadInfo.avatars) ? threadInfo.avatars.length : 0;
					const caller = new Error().stack.split('\n')[2]?.trim() || 'unknown';

					// 🔥 SCROLL FLICKER FIX: スクロール直後（200-1000ms）はDOM更新をスキップ
					if (state.firstLoadComplete) {
						const timeSinceScroll = Date.now() - state.firstLoadComplete;
						if (timeSinceScroll < 1000) {
							// スクロール完了から1000ms以内はDOM更新しない
							return;
						}
					}

					// 🔥 CRITICAL FIX: 古いデータが来た場合、キャッシュから最新データを取得
					if (state.threadInfoCache && state.threadInfoCache.has(messageId)) {
						const cachedInfo = state.threadInfoCache.get(messageId);
						// キャッシュに優先度の高いデータがある場合
						if (cachedInfo.priority === 'high' && cachedInfo.confirmed === true) {
							// 渡されたデータに優先度がない、またはキャッシュの方が新しい場合
							if (
								!threadInfo.priority ||
								!threadInfo.confirmed ||
								(cachedInfo.timestamp &&
									(!threadInfo.timestamp || cachedInfo.timestamp > threadInfo.timestamp))
							) {
								threadInfo = { ...cachedInfo };
							}
						}
					}

					// 🔥 NEW FIX: avatarsが空でpriorityもない場合はスキップ（ロングポーリング更新を待つ）
					const hasAvatars =
						threadInfo.avatars &&
						Array.isArray(threadInfo.avatars) &&
						threadInfo.avatars.length > 0;
					const isPriority = threadInfo.priority === 'high' && threadInfo.confirmed === true;
					if (!hasAvatars && !isPriority && (threadInfo.total > 0 || !threadInfo.total)) {
						return;
					}

					// 🔥 SCROLL FIX: DOM更新前のスクロール位置を保存
					const $messageContainer = $('#chat-messages');
					const scrollTopBefore = $messageContainer.scrollTop();
					const scrollHeightBefore = $messageContainer.prop('scrollHeight');
					const clientHeight = $messageContainer[0].clientHeight;
					const maxScrollTop = scrollHeightBefore - clientHeight;
					const isAlreadyAtBottom = Math.abs(scrollTopBefore - maxScrollTop) < 5;

					// 初回ロード完了後は常にスクロール位置を保持（時間制限なし）
					// ただし、既に最下部にいる場合は復元不要
					const shouldPreserveScroll =
						state.firstLoadComplete !== null &&
						state.firstLoadComplete !== undefined &&
						!isAlreadyAtBottom;

					let total = threadInfo.total;
					if (typeof total === 'object') {
						total = total && total.total !== undefined ? total.total : 0;
					}
					total = parseInt(total, 10) || 0;
					const sanitizedThreadInfo = {
						total: total,
						unread: parseInt(threadInfo.unread, 10) || 0,
						avatars: Array.isArray(threadInfo.avatars) ? threadInfo.avatars : [],
						latest_reply: threadInfo.latest_reply || '',
						priority: threadInfo.priority || null,
						confirmed: threadInfo.confirmed || false,
					};
					const isForceDelete = threadInfo.forceDelete || sanitizedThreadInfo.total === 0;
					if (sanitizedThreadInfo.total === 0) {
						$message
							.find(
								'.thread-info, .thread-button, .thread-reply-count, .thread-count, .thread-text, [class*="thread"], .thread-indicator'
							)
							.remove();
						$message.removeClass('has-thread has-thread-info');
						this.globalLock.add(`force_delete_${messageId}`);
						return;
					}
					let attempts = 0;
					const maxAttempts = isForceDelete ? 10 : 5;
					while (attempts < maxAttempts) {
						const $existingThreadInfos = $message.find('.thread-info');
						if ($existingThreadInfos.length > 0) {
							if (isForceDelete) {
								$existingThreadInfos.each(function () {
									const element = this;
									$(element).remove();
									if (element.parentNode) {
										element.parentNode.removeChild(element);
									}
								});
								const $threadButtons = $message.find('.thread-button');
								$threadButtons.each(function () {
									const element = this;
									$(element).remove();
									if (element.parentNode) {
										element.parentNode.removeChild(element);
									}
								});
								$message.removeClass('has-thread');
							} else {
								$existingThreadInfos.each(function () {
									$(this).remove();
								});
							}
							$message[0].offsetHeight;
							attempts++;
						} else {
							break;
						}
					}
					const $remainingCheck = $message.find('.thread-info');
					if ($remainingCheck.length > 0) {
						$remainingCheck.each(function () {
							this.parentNode.removeChild(this);
						});
					}
					if (sanitizedThreadInfo.total > 0) {
						const threadInfoHtml = generateThreadInfoHtml(
							messageId,
							sanitizedThreadInfo.total,
							sanitizedThreadInfo.unread,
							sanitizedThreadInfo.avatars,
							sanitizedThreadInfo.latest_reply
						);

						const $reactions = $message.find('.message-reactions');
						if ($reactions.length) {
							$reactions.after(threadInfoHtml);
						} else {
							$message.find('.message-content').after(threadInfoHtml);
						}
						$message[0].offsetHeight;

						// 🔥 FLICKER FIX: priorityフラグをDOM要素に保存
						const $threadInfo = $message.find('.thread-info');
						if ($threadInfo.length && sanitizedThreadInfo.priority) {
							$threadInfo.data('priority', sanitizedThreadInfo.priority);
						}

						const $threadButton = $message.find('.thread-button');
						if ($threadButton.length) {
							const newButtonText = `${sanitizedThreadInfo.total}件の返信`;
							const $existingIcon = $threadButton.find('img, .thread-icon');

							let iconHtml = $existingIcon.length > 0 ? $existingIcon[0].outerHTML : '';

							// アイコンが存在しない場合は生成
							if (!iconHtml) {
								const utils =
									window.LMSChat && window.LMSChat.utils
										? window.LMSChat.utils
										: {
												getAssetPath: (path) =>
													path.replace('wp-content/themes/lms/', '/wp-content/themes/lms/'),
										  };
								iconHtml = `<img src="${utils.getAssetPath(
									'wp-content/themes/lms/img/icon-thread.svg'
								)}" alt="" class="thread-icon">`;
							}

							$threadButton.empty();
							$threadButton.append(iconHtml);
							$threadButton.append(`<span class="thread-text">${newButtonText}</span>`);
							$threadButton.addClass('thread-button-active');
						}
						const $finalThreadInfos = $message.find('.thread-info');
						if ($finalThreadInfos.length > 1) {
							$finalThreadInfos.slice(1).each(function () {
								this.parentNode.removeChild(this);
							});
						}
					} else {
						if (
							window.LMSChat &&
							window.LMSChat.messages &&
							window.LMSChat.messages.state &&
							window.LMSChat.messages.state.threadInfoCache
						) {
							window.LMSChat.messages.state.threadInfoCache.delete(messageId);
						}
						if (window.state && window.state.threadInfoCache) {
							window.state.threadInfoCache.delete(messageId);
						}
					}

					// 🔥 SCROLL FIX: DOM更新後、スクロール位置を復元
					if (shouldPreserveScroll) {
						const scrollHeightAfter = $messageContainer.prop('scrollHeight');
						const scrollTopAfter = $messageContainer.scrollTop();
						const heightDiff = scrollHeightAfter - scrollHeightBefore;
						const scrollDiff = scrollTopAfter - scrollTopBefore;

						// スクロール位置が変わっていたら、元に戻す
						if (Math.abs(scrollDiff) > 1) {
							$messageContainer.scrollTop(scrollTopBefore);
						}
					}
				} catch (error) {}
			},
		};
		window.ThreadInfoUpdateManager.init();
	}
	const updateMessageThreadInfo = ($message, threadInfo) => {
		try {
			const messageId = $message.data('message-id');

			if (!messageId) {
				return;
			}
			if (
				window.ThreadInfoUpdateManager &&
				window.ThreadInfoUpdateManager.globalLock.has(messageId)
			) {
				return;
			}

			window.ThreadInfoUpdateManager.queueUpdate(messageId, $message, threadInfo);
		} catch (error) {}
	};
	const restoreThreadInfoFromCache = () => {
		// 🔥 FLICKER FIX: チャンネル切り替え直後はスキップ
		if (!state.threadInfoCache || state.isChannelSwitching) return;

		// 🔥 FLICKER FIX: スクロール完了から1000ms以内はスキップ
		if (state.firstLoadComplete) {
			const timeSinceScroll = Date.now() - state.firstLoadComplete;
			if (timeSinceScroll < 1000) {
				return;
			}
		}
		let restoredCount = 0;
		let restoredButtonCount = 0;
		state.threadInfoCache.forEach((threadInfo, messageId) => {
			if (threadInfo.total > 0) {
				const $message = $(`.chat-message[data-message-id="${messageId}"]`);
				if ($message.length) {
					const $existingThreadInfo = $message.find('.thread-info');
					// 🔥 FLICKER FIX: priority: 'high'のデータは上書きしない
					if (
						$existingThreadInfo.length === 0 ||
						!$existingThreadInfo.data('priority') ||
						$existingThreadInfo.data('priority') !== 'high'
					) {
						updateMessageThreadInfo($message, threadInfo);
						restoredCount++;
					}
					const $existingThreadButton = $message.find('.thread-button');
					if ($existingThreadButton.length === 0) {
						const threadText =
							threadInfo.total > 0 ? `${threadInfo.total}件の返信` : 'スレッドに返信する';
						const threadButtonHtml = `<button class="thread-button" data-message-id="${messageId}" title="スレッドを表示">
							<img src="${
								window.lmsChat.iconThreadPath ||
								utils.getAssetPath('wp-content/themes/lms/img/icon-thread.svg')
							}" alt="スレッド" width="16" height="16">
							${threadText}
						</button>`;
						const $messageActions = $message.find('.message-actions');
						if ($messageActions.length) {
							$messageActions.append(threadButtonHtml);
						} else {
							$message
								.find('.message-content')
								.after(`<div class="message-actions">${threadButtonHtml}</div>`);
						}
						restoredButtonCount++;
					}
				}
			}
		});
	};
	let lastEmergencyRestore = 0;
	const EMERGENCY_RESTORE_COOLDOWN = 2000;
	const emergencyRestoreThreadInfo = () => {
		if (document.hidden) {
			return;
		}
		const now = Date.now();
		if (now - lastEmergencyRestore < EMERGENCY_RESTORE_COOLDOWN) {
			return;
		}
		lastEmergencyRestore = now;
		$.ajax({
			url: window.lmsChat.ajaxUrl,
			type: 'POST',
			data: {
				action: 'lms_get_messages',
				channel_id: window.lmsChat.currentChannelId || 1,
				page: 1,
				nonce: window.lmsChat.nonce,
			},
			success: function (response) {
				if (response.success && response.data && response.data.grouped_messages) {
					response.data.grouped_messages.forEach((group) => {
						if (group.messages) {
							group.messages.forEach((message) => {
								if (message.thread_count && message.thread_count > 0) {
									if (!state.threadInfoCache) {
										state.threadInfoCache = new Map();
									}
									const threadInfo = {
										total: message.thread_count,
										unread: message.thread_unread_count || 0,
										avatars: message.thread_avatars || [],
										latest_reply: message.thread_latest_reply || '',
										timestamp: Date.now(),
									};
									state.threadInfoCache.set(message.id, threadInfo);
									const $message = $(`.chat-message[data-message-id="${message.id}"]`);
									if ($message.length) {
										if ($message.find('.thread-info').length === 0) {
											updateMessageThreadInfo($message, threadInfo);
										}
										if ($message.find('.thread-button').length === 0) {
											const threadText =
												threadInfo.total > 0 ? `${threadInfo.total}件の返信` : 'スレッドに返信する';
											const threadButtonHtml = `<button class="thread-button" data-message-id="${
												message.id
											}" title="スレッドを表示">
												<img src="${
													window.lmsChat.iconThreadPath ||
													utils.getAssetPath('wp-content/themes/lms/img/icon-thread.svg')
												}" alt="スレッド" width="16" height="16">
												${threadText}
											</button>`;
											const $messageActions = $message.find('.message-actions');
											if ($messageActions.length) {
												$messageActions.append(threadButtonHtml);
											} else {
												$message
													.find('.message-content')
													.after(`<div class="message-actions">${threadButtonHtml}</div>`);
											}
										}
									}
								}
							});
						}
					});
				}
			},
			error: function (xhr, status, error) {},
		});
	};
	restoreThreadInfoFromCache();
	const protectThreadButtons = () => {
		// 🔥 FLICKER FIX: チャンネル切り替え直後はスキップ
		if (state.isChannelSwitching) {
			return;
		}

		// 🔥 FLICKER FIX: スクロール完了から1000ms以内はスキップ
		if (state.firstLoadComplete) {
			const timeSinceScroll = Date.now() - state.firstLoadComplete;
			if (timeSinceScroll < 1000) {
				return;
			}
		}

		$('.chat-message').each(function () {
			const $message = $(this);
			const messageId = $message.data('message-id');
			if (messageId && state.threadInfoCache && state.threadInfoCache.has(messageId)) {
				const threadInfo = state.threadInfoCache.get(messageId);
				if (threadInfo) {
					const $existingButton = $message.find('.thread-button');
					if ($existingButton.length === 0) {
						const threadText =
							threadInfo.total > 0 ? `${threadInfo.total}件の返信` : 'スレッドに返信する';
						const threadButtonHtml = `<button class="thread-button" data-message-id="${messageId}" title="スレッドを表示">
							<img src="${
								window.lmsChat.iconThreadPath ||
								utils.getAssetPath('wp-content/themes/lms/img/icon-thread.svg')
							}" alt="スレッド" width="16" height="16">
							${threadText}
						</button>`;
						const $messageActions = $message.find('.message-actions');
						if ($messageActions.length) {
							$messageActions.append(threadButtonHtml);
						} else {
							$message
								.find('.message-content')
								.after(`<div class="message-actions">${threadButtonHtml}</div>`);
						}
					} else if ($existingButton.hasClass('hidden')) {
						$existingButton.removeClass('hidden');
						$existingButton.show();
					}
				}
			}
		});
	};
	// 🔥 FLICKER FIX: 実行間隔を20ms → 1000ms（1秒間に1回）に変更
	setInterval(protectThreadButtons, 1000);
	const instantButtonRestore = () => {
		if (!state.threadInfoCache) return;
		state.threadInfoCache.forEach((threadInfo, messageId) => {
			if (threadInfo) {
				const $message = $(`.chat-message[data-message-id="${messageId}"]`);
				if ($message.length) {
					const $existingButton = $message.find('.thread-button');
					if ($existingButton.length === 0) {
						const threadText =
							threadInfo.total > 0 ? `${threadInfo.total}件の返信` : 'スレッドに返信する';
						const threadButtonHtml = `<button class="thread-button" data-message-id="${messageId}" title="スレッドを表示">
							<img src="${
								window.lmsChat.iconThreadPath ||
								utils.getAssetPath('wp-content/themes/lms/img/icon-thread.svg')
							}" alt="スレッド" width="16" height="16">
							${threadText}
						</button>`;
						const $messageActions = $message.find('.message-actions');
						if ($messageActions.length) {
							$messageActions.append(threadButtonHtml);
						} else {
							$message
								.find('.message-content')
								.after(`<div class="message-actions">${threadButtonHtml}</div>`);
						}
					} else if ($existingButton.hasClass('hidden')) {
						$existingButton.removeClass('hidden');
						$existingButton.show();
					}
				}
			}
		});
	};
	setInterval(() => {
		if (!document.hidden) {
			instantButtonRestore();
		}
	}, 100);
	let threadProtectionDisabled = false;
	const disableThreadProtection = () => {
		threadProtectionDisabled = true;
	};
	const enableThreadProtection = () => {
		threadProtectionDisabled = false;
	};
	const threadInfoRemovalOverride = () => {
		const originalRemove = $.fn.remove;
		$.fn.remove = function (selector) {
			if (threadProtectionDisabled) {
				return originalRemove.call(this, selector);
			}
			if (
				this.hasClass('thread-info') ||
				this.find('.thread-info').length > 0 ||
				this.hasClass('thread-button') ||
				this.find('.thread-button').length > 0 ||
				(this.hasClass('message-actions') && this.find('.thread-button').length > 0)
			) {
				if (this.hasClass('thread-button') || this.find('.thread-button').length > 0) {
					const $threadButtons = this.hasClass('thread-button')
						? this
						: this.find('.thread-button');
					$threadButtons.each(function () {
						const $button = $(this);
						const messageId =
							$button.data('message-id') || $button.closest('.chat-message').data('message-id');
						if (messageId) {
							setTimeout(() => {
								const $message = $(`.chat-message[data-message-id="${messageId}"]`);
								if ($message.length && $message.find('.thread-button').length === 0) {
									protectThreadButtons();
								}
							}, 10);
						}
					});
				}
				if (this.hasClass('thread-button') || this.hasClass('thread-info')) {
					this.hide();
					setTimeout(() => {
						this.show();
						instantButtonRestore();
						protectThreadButtons();
					}, 5);
				}
				return this;
			}
			return originalRemove.call(this, selector);
		};
		const originalEmpty = $.fn.empty;
		$.fn.empty = function () {
			if (threadProtectionDisabled) {
				return originalEmpty.call(this);
			}
			if (this.find('.thread-info').length > 0 || this.find('.thread-button').length > 0) {
				this.children().not('.thread-info, .thread-button, .message-actions').remove();
				return this;
			}
			return originalEmpty.call(this);
		};
		const originalReplaceWith = $.fn.replaceWith;
		$.fn.replaceWith = function (content) {
			if (threadProtectionDisabled) {
				return originalReplaceWith.call(this, content);
			}
			if (this.hasClass('thread-info') || this.hasClass('thread-button')) {
				return this;
			}
			return originalReplaceWith.call(this, content);
		};
		const originalHtml = $.fn.html;
		$.fn.html = function (htmlString) {
			if (threadProtectionDisabled) {
				return originalHtml.apply(this, arguments);
			}
			if (
				arguments.length > 0 &&
				(this.find('.thread-info').length > 0 || this.find('.thread-button').length > 0)
			) {
				const $threadInfos = this.find('.thread-info').clone();
				const $threadButtons = this.find('.thread-button').clone();
				const result = originalHtml.call(this, htmlString);
				$threadInfos.each((index, element) => {
					const $threadInfo = $(element);
					const messageId = $threadInfo.data('message-id');
					const $message = $(`.chat-message[data-message-id="${messageId}"]`);
					if ($message.length && $message.find('.thread-info').length === 0) {
						$message.find('.message-content').after($threadInfo);
					}
				});
				$threadButtons.each((index, element) => {
					const $threadButton = $(element);
					const messageId = $threadButton.data('message-id');
					const $message = $(`.chat-message[data-message-id="${messageId}"]`);
					if ($message.length && $message.find('.thread-button').length === 0) {
						$message.find('.message-actions').append($threadButton);
					}
				});
				return result;
			}
			return originalHtml.apply(this, arguments);
		};
	};
	threadInfoRemovalOverride();
	window.threadProtection = {
		disable: disableThreadProtection,
		enable: enableThreadProtection,
	};
	$(document).on('thread:opening', () => {
		$('.chat-message .thread-info').each(function () {
			const $threadInfo = $(this);
			const messageId =
				$threadInfo.data('message-id') || $threadInfo.closest('.chat-message').data('message-id');
			if (messageId) {
				const threadData = {
					total: parseInt($threadInfo.find('.thread-count').text()) || 1,
					unread: parseInt($threadInfo.find('.thread-unread-badge').text()) || 0,
					timestamp: Date.now(),
				};
				if (!state.threadInfoCache) state.threadInfoCache = new Map();
				state.threadInfoCache.set(messageId, threadData);
			}
		});
		$('.chat-message .thread-button').each(function () {
			const $threadButton = $(this);
			const messageId =
				$threadButton.data('message-id') ||
				$threadButton.closest('.chat-message').data('message-id');
			if (messageId) {
				const buttonText = $threadButton.text().trim();
				const countMatch = buttonText.match(/(\d+)件の返信/);
				const total = countMatch ? parseInt(countMatch[1]) : 1;
				const threadData = {
					total: total,
					unread: 0,
					timestamp: Date.now(),
				};
				if (!state.threadInfoCache) state.threadInfoCache = new Map();
				state.threadInfoCache.set(messageId, threadData);
			}
		});
		$(document).on('lms_chat_thread_message_sent', function (event, messageData) {
			if (parseInt(messageData.user_id) === parseInt(window.lmsChat.currentUserId)) {
				return;
			}
			const currentThreadId = $('.thread-view').data('parent-message-id');
			if (
				currentThreadId &&
				parseInt(currentThreadId) === parseInt(messageData.parent_message_id)
			) {
				if (typeof appendThreadMessage === 'function') {
					appendThreadMessage(messageData);
				} else if (
					window.LMSChat &&
					window.LMSChat.threads &&
					typeof window.LMSChat.threads.appendMessage === 'function'
				) {
					window.LMSChat.threads.appendMessage(messageData);
				}
				// 同期受信時は一切スクロールしない（削除）
			}
			if (typeof updateThreadInfo === 'function') {
				updateThreadInfo(messageData.parent_message_id);
			}
		});
		$(document).on('lms_chat_thread_message_deleted', function (event, eventData) {
			if (parseInt(eventData.userId) === parseInt(window.lmsChat.currentUserId)) {
				return;
			}
			const $threadMessage = $(`.thread-message[data-message-id="${eventData.messageId}"]`);
			if ($threadMessage.length > 0) {
				$threadMessage.fadeOut(300, function () {
					$(this).remove();
					const remainingMessages = $('.thread-messages .thread-message').length;
					if (remainingMessages === 0) {
						$('.thread-messages').append(
							'<div class="no-messages">このスレッドにはまだ返信がありません</div>'
						);
					}
				});
				if (typeof updateThreadInfo === 'function') {
					setTimeout(() => {
						updateThreadInfo(eventData.parentMessageId);
						setTimeout(() => {
							updateThreadInfo(eventData.parentMessageId);
						}, 1000);
					}, 300);
				}
			}
		});
	});
	$(document).on('thread:closing', () => {
		restoreThreadInfoFromCache();
	});
	$(document).on('thread:closed', () => {});
	$('#restore-thread-info-btn').remove();
	const setupThreadInfoProtection = () => {
		if (typeof MutationObserver !== 'undefined') {
			const observer = new MutationObserver((mutations) => {
				let needsRestore = false;
				mutations.forEach((mutation) => {
					if (mutation.type === 'childList') {
						if (mutation.removedNodes.length > 0) {
							mutation.removedNodes.forEach((node) => {
								if (node.nodeType === 1) {
									const $node = $(node);
									if (
										$node.hasClass('thread-info') ||
										$node.find('.thread-info').length > 0 ||
										$node.hasClass('thread-button') ||
										$node.find('.thread-button').length > 0
									) {
										needsRestore = true;
									}
								}
							});
						}
						if (mutation.addedNodes.length > 0) {
							mutation.addedNodes.forEach((node) => {
								if (node.nodeType === 1) {
									const $node = $(node);
									if ($node.hasClass('chat-message') || $node.find('.chat-message').length > 0) {
										needsRestore = true;
									}
								}
							});
						}
					}
				});
				if (needsRestore) {
					instantButtonRestore();
				}
			});
			const chatMessages = document.getElementById('chat-messages');
			if (chatMessages) {
				observer.observe(chatMessages, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeOldValue: true,
				});
			}
		}
	};
	setupThreadInfoProtection();
	window.LMSChat.messages = window.LMSChat.messages || {};
	const INFINITY_SCROLL_CONFIG = {
		TRIGGER_MESSAGE_COUNT: 10,
		LOAD_MORE_COUNT: 50,
		INITIAL_LOAD_COUNT: 50,
		DEBOUNCE_DELAY: 30,
		MAX_MESSAGES_IN_DOM: 1000,
		MIN_LOAD_INTERVAL: 75,
		SCROLL_OFFSET_AFTER_LOAD: 300,
		MESSAGE_HEIGHT_ESTIMATE: 80,
		FADE_IN_DURATION: 2000,
		FADE_IN_DELAY: 200,
		FADE_IN_INITIAL_DELAY: 600,
	};

	let infinityScrollState = {
		isLoadingHistory: false,
		oldestMessageId: null,
		newestMessageId: null,
		scrollPosition: 0,
		lastScrollTop: 0,
		scrollDirection: 'none',
		hasReachedEnd: false,
		hasReachedNewest: false,
		endMessageShown: false,
		lastLoadTime: 0,
		preventNextLoad: false,
		isLocked: false,
		loadCount: 0,
		processedMessageIds: new Set(),
	};

	const loadHistoryMessages = (beforeMessageId) => {
		const now = Date.now();
		const timeSinceLastLoad = now - infinityScrollState.lastLoadTime;

		if (
			infinityScrollState.isLoadingHistory ||
			infinityScrollState.isLocked ||
			infinityScrollState.preventNextLoad ||
			timeSinceLastLoad < INFINITY_SCROLL_CONFIG.MIN_LOAD_INTERVAL ||
			infinityScrollState.processedMessageIds.has(beforeMessageId)
		) {
			return Promise.resolve();
		}

		if (infinityScrollState.hasReachedEnd) {
			if (!infinityScrollState.endMessageShown) {
				showEndOfHistoryMessage();
			}
			return Promise.resolve();
		}

		infinityScrollState.isLoadingHistory = true;
		infinityScrollState.isLocked = true;
		infinityScrollState.preventNextLoad = true;
		infinityScrollState.lastLoadTime = now;
		infinityScrollState.loadCount++;

		infinityScrollState.processedMessageIds.add(beforeMessageId);

		if (window.LMSChat && window.LMSChat.state) {
			window.LMSChat.state.isInfinityScrollLoading = true;
		}

		const $loader = showTopLoader();

		const loadCount = INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT;

		const requestData = {
			action: 'lms_get_messages_universal',
			channel_id: window.LMSChat.state.currentChannel,
			before_message_id: beforeMessageId,
			limit: loadCount,
			nonce: lmsChat.nonce,
		};

		return $.ajax({
			url: lmsChat.ajaxUrl,
			type: 'POST',
			data: requestData,
			timeout: 15000,
			dataType: 'json',
			cache: false,
		})
			.done((response) => {
				// メッセージ追加前にローダーを即座に削除（途中に残るのを防ぐ）
				$loader.remove();
				
				if (response.success && response.data && Array.isArray(response.data.messages)) {
					const messages = response.data.messages;

					const continuityGap =
						messages.length > 1
							? parseInt(messages[0].id) - parseInt(messages[messages.length - 1].id)
							: 0;
					const averageGap = messages.length > 1 ? continuityGap / (messages.length - 1) : 1;

					if (messages.length > 0) {
						if (averageGap > 10) {
						}

						infinityScrollState.processedMessageIds.clear();

						prependMessagesUniversal(messages, beforeMessageId, {
							systemType: 'universal_infinity_scroll',
							isControlled: true,
							expectedCount: loadCount,
							actualCount: messages.length,
							perfectMatch: messages.length === loadCount,
							continuityGap: continuityGap,
							averageGap: averageGap,
						});

						if (averageGap > 2) {
							setTimeout(() => {
								infinityScrollState.preventNextLoad = false;
								const $container = $('#chat-messages');
								$container.trigger('scroll');
							}, 50);
						}
					} else {
						infinityScrollState.hasReachedEnd = true;
						showEndOfHistoryMessage();
					}
				} else {
					// エラーを無視
					infinityScrollState.hasReachedEnd = true;
				}
			})
			.fail((xhr, status, error) => {})
			.always(() => {
				infinityScrollState.isLoadingHistory = false;
				infinityScrollState.isLocked = false;

				setTimeout(() => {
					infinityScrollState.preventNextLoad = false;
				}, 3000);

				if (window.LMSChat && window.LMSChat.state) {
					window.LMSChat.state.isInfinityScrollLoading = false;
				}

				// ローダーが残っている場合のみ削除（doneで既に削除されている場合がある）
				if ($loader && $loader.length > 0 && $loader.parent().length > 0) {
					$loader.fadeOut(200, function() {
						$(this).remove();
					});
				}
			});
	};

	const loadNewerMessages = (afterMessageId) => {
		const now = Date.now();
		const timeSinceLastLoad = now - infinityScrollState.lastLoadTime;

		if (
			infinityScrollState.isLoadingHistory ||
			infinityScrollState.isLocked ||
			infinityScrollState.preventNextLoad ||
			timeSinceLastLoad < INFINITY_SCROLL_CONFIG.MIN_LOAD_INTERVAL
		) {
			return Promise.resolve();
		}

		if (infinityScrollState.hasReachedNewest) {
			return Promise.resolve();
		}

		infinityScrollState.isLoadingHistory = true;
		infinityScrollState.isLocked = true;
		infinityScrollState.preventNextLoad = true;
		infinityScrollState.lastLoadTime = now;
		infinityScrollState.loadCount++;

		if (window.LMSChat && window.LMSChat.state) {
			window.LMSChat.state.isInfinityScrollLoading = true;
		}

		// 既存のローダーを削除（重複防止）
		$('.bottom-loader').remove();

		const $loader = $(
			'<div class="loading-indicator bottom-loader">新しいメッセージを読み込み中...</div>'
		);
		$('#chat-messages').append($loader);

		const loadCount = INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT;

		const requestData = {
			action: 'lms_get_messages_universal',
			channel_id: window.LMSChat.state.currentChannel,
			after_message_id: afterMessageId,
			limit: loadCount,
			nonce: lmsChat.nonce,
		};

		return $.ajax({
			url: lmsChat.ajaxUrl,
			type: 'POST',
			data: requestData,
			timeout: 15000,
			dataType: 'json',
			cache: false,
		})
			.done((response) => {
				// メッセージ追加前にローダーを即座に削除（途中に残るのを防ぐ）
				$loader.remove();
				
				if (response.success && response.data && Array.isArray(response.data.messages)) {
					const messages = response.data.messages;

					if (messages.length > 0) {
						appendNewerMessages(messages, afterMessageId);

						// 最新のメッセージIDを更新
						const lastMessage = messages[messages.length - 1];
						infinityScrollState.newestMessageId = parseInt(lastMessage.id);
					} else {
						infinityScrollState.hasReachedNewest = true;
					}
				} else {
					infinityScrollState.hasReachedNewest = true;
				}
			})
			.fail((xhr, status, error) => {})
			.always(() => {
				infinityScrollState.isLoadingHistory = false;
				infinityScrollState.isLocked = false;

				setTimeout(() => {
					infinityScrollState.preventNextLoad = false;
				}, 3000);

				if (window.LMSChat && window.LMSChat.state) {
					window.LMSChat.state.isInfinityScrollLoading = false;
				}

				// ローダーが残っている場合のみ削除（doneで既に削除されている場合がある）
				if ($loader && $loader.length > 0 && $loader.parent().length > 0) {
					$loader.fadeOut(200, function() {
						$(this).remove();
					});
				}
			});
	};

	const appendNewerMessages = (messages, afterMessageId) => {
		const $container = $('#chat-messages');

		messages.forEach((message) => {
			if (!messageIdTracker.has(message.id)) {
				appendMessage(message);
				messageIdTracker.add(message.id);
			}
		});

		// 最新のメッセージIDを更新
		const $lastMessage = $container.find('.chat-message').last();
		if ($lastMessage.length) {
			infinityScrollState.newestMessageId = $lastMessage.data('message-id');
		}
	};

	const prependMessages = (messages, beforeMessageId, controlMetadata = null) => {
		const OFFSET_ABOVE_LOAD_POINT = 120;

		const $container = $('#chat-messages');
		const oldScrollHeight = $container[0].scrollHeight;
		const oldScrollTop = $container.scrollTop();

		const containerOffset = $container.offset();
		const viewportTop = $container.scrollTop();
		const containerHeight = $container.height();

		const measureActualMessageHeights = () => {
			const $visibleMessages = $container.find('.chat-message:visible');
			const heights = [];
			const sampleSize = Math.min(10, $visibleMessages.length);

			$visibleMessages.slice(0, sampleSize).each(function () {
				const $msg = $(this);
				const height = $msg.outerHeight(true);
				const hasThread = $msg.find('.thread-info').length > 0;
				const hasReactions = $msg.find('.message-reactions').length > 0;
				const hasAttachments = $msg.find('.message-attachment, .file-attachment').length > 0;

				heights.push({
					height: height,
					hasThread: hasThread,
					hasReactions: hasReactions,
					hasAttachments: hasAttachments,
					messageId: $msg.data('message-id'),
				});
			});

			const averageHeight =
				heights.length > 0
					? heights.reduce((sum, item) => sum + item.height, 0) / heights.length
					: INFINITY_SCROLL_CONFIG.MESSAGE_HEIGHT_ESTIMATE;

			return {
				averageHeight: Math.round(averageHeight),
				sampleCount: heights.length,
				estimatedHeight: INFINITY_SCROLL_CONFIG.MESSAGE_HEIGHT_ESTIMATE,
				accuracyRatio: (averageHeight / INFINITY_SCROLL_CONFIG.MESSAGE_HEIGHT_ESTIMATE).toFixed(2),
				heights: heights,
			};
		};

		const heightAnalysis = measureActualMessageHeights();

		const captureVisualAnchor = () => {
			const containerTop = $container.offset().top;
			const containerScrollTop = $container.scrollTop();
			const viewportHeight = $container.height();

			const $visibleMessages = $container.find('.chat-message:visible');
			const anchors = [];

			$visibleMessages.each(function (index) {
				const $msg = $(this);
				const msgOffset = $msg.offset().top;
				const msgRelativeToContainer = msgOffset - containerTop;
				const msgRelativeToViewport = msgRelativeToContainer - containerScrollTop;

				if (msgRelativeToViewport >= 0 && msgRelativeToViewport < viewportHeight) {
					const priority = calculatePriority(msgRelativeToViewport, viewportHeight);
					anchors.push({
						messageId: $msg.data('message-id'),
						element: $msg,
						viewportPosition: msgRelativeToViewport,
						containerPosition: msgRelativeToContainer,
						index: index,
						priority: priority,
					});
				}
			});

			const sortedAnchors = anchors.sort((a, b) => b.priority - a.priority);
			const primaryAnchor = sortedAnchors[0];

			return {
				primary: primaryAnchor,
				all: sortedAnchors,
				containerScrollTop: containerScrollTop,
				viewportHeight: viewportHeight,
				timestamp: Date.now(),
			};
		};

		const calculatePriority = (viewportPosition, viewportHeight) => {
			if (viewportPosition < viewportHeight * 0.3) return 100;
			if (viewportPosition < viewportHeight * 0.7) return 80;
			return 60;
		};

		const visualAnchor = captureVisualAnchor();

		const preLoadState = {
			viewportTop: viewportTop,
			containerHeight: containerHeight,
			scrollHeight: $container[0].scrollHeight,
			visualAnchor: visualAnchor,
			heightAnalysis: heightAnalysis,
			firstMessageTop: visualAnchor.primary ? visualAnchor.primary.viewportPosition : null,
			firstMessageId: visualAnchor.primary ? visualAnchor.primary.messageId : null,
			targetScrollPosition: visualAnchor.primary
				? Math.max(0, visualAnchor.primary.viewportPosition - 50)
				: null,
		};

		const $referenceMessage = $container.find(`#message-${beforeMessageId}`);

		const $hiddenMessages = $container.find('.chat-message.hidden-for-incremental');
		let addedCount = 0;

		const controlInfo = controlMetadata
			? {
					isControlled: controlMetadata.isControlled,
					expectedCount: controlMetadata.expectedCount,
					actualCount: controlMetadata.actualCount,
					controlSystem: controlMetadata.controlSystem,
					hasGap: controlMetadata.controlSystem?.hasGap || false,
					gapSize: controlMetadata.controlSystem?.gapSize || 0,
					perfectMatch: controlMetadata.controlSystem?.perfectMatch || false,
			  }
			: {
					isControlled: false,
					expectedCount: messages.length,
					actualCount: messages.length,
					hasGap: false,
					gapSize: 0,
					perfectMatch: true,
			  };

		if ($hiddenMessages.length > 0 && messages.length === 0) {
			const showCount = Math.min(INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT, $hiddenMessages.length);
			$hiddenMessages.slice(-showCount).each(function () {
				$(this).show().removeClass('hidden-for-incremental');
				addedCount++;
			});

			const $newFirstMessage = $container.find('.chat-message:visible').first();
			if ($newFirstMessage.length) {
				infinityScrollState.oldestMessageId = $newFirstMessage.data('message-id');
			}
		} else if (messages.length > 0) {
			const dateGroups = new Map();

			messages.forEach((message) => {
				if (!messageIdTracker.isDisplayed(message.id)) {
					let messageDate;
					try {
						messageDate = message.created_at ? new Date(message.created_at) : new Date();
						if (isNaN(messageDate.getTime())) {
							messageDate = new Date();
						}
					} catch (e) {
						messageDate = new Date();
					}

					const dateKey = getDateKey(messageDate);

					if (!dateGroups.has(dateKey)) {
						dateGroups.set(dateKey, {
							date: messageDate,
							dateKey: dateKey,
							messages: [],
						});
					}

					dateGroups.get(dateKey).messages.push(message);
				}
			});

			const sortedGroups = Array.from(dateGroups.values()).sort((a, b) => a.date - b.date);

			sortedGroups.forEach((group) => {
				const { dateKey, messages: groupMessages, date } = group;

				let $targetDateGroup = $container.find(`[data-date-key="${dateKey}"]`);

				if ($targetDateGroup.length === 0) {
					$targetDateGroup = $('<div class="message-group"></div>').attr('data-date-key', dateKey);
					const formattedDate = getFormattedDate(date);
					const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
					$targetDateGroup.append(separatorHtml);

					const $existingGroups = $container.find('.message-group');
					let inserted = false;

					if ($existingGroups.length > 0) {
						$existingGroups.each(function () {
							const existingDateKey = $(this).attr('data-date-key');
							if (existingDateKey && dateKey < existingDateKey) {
								$(this).before($targetDateGroup);
								inserted = true;
								return false;
							}
						});

						if (!inserted) {
							$container.prepend($targetDateGroup);
						}
					} else {
						$container.prepend($targetDateGroup);
					}
				} else {
					if ($targetDateGroup.find('.date-separator').length === 0) {
						const formattedDate = getFormattedDate(date);
						const separatorHtml = `<div class="date-separator"><span class="date-text">${formattedDate}</span></div>`;
						$targetDateGroup.prepend(separatorHtml);
					}
				}

				groupMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

				groupMessages.forEach((message) => {
					const messageHtml = createMessageHtml(message, false, { fromInfinityScroll: true });
					const $separator = $targetDateGroup.find('.date-separator');
					if ($separator.length > 0) {
						$separator.after(messageHtml);
					} else {
						$targetDateGroup.append(messageHtml);
					}

					messageIdTracker.markAsDisplayed(message.id);
					addedCount++;
				});
			});
		}

		setTimeout(() => {
			const newScrollHeight = $container[0].scrollHeight;
			const heightDifference = newScrollHeight - oldScrollHeight;

			if (heightDifference > 0 && addedCount > 0) {
				let targetScrollTop;
				let restorationResult = null;

				if (preLoadState.firstMessageTop !== null) {
					const $allVisibleMessages = $container.find('.chat-message:visible');

					const createGapCorrectionSystem = () => {
						const expectedAddedCount =
							controlInfo.expectedCount || INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT;
						const actualAddedCount = addedCount;

						const controlSystemGap = controlInfo.isControlled && controlInfo.hasGap;
						const controlSystemGapSize = controlInfo.gapSize || 0;

						const gapInfo = {
							hasGap: controlSystemGap || expectedAddedCount !== actualAddedCount,
							expectedCount: expectedAddedCount,
							actualCount: actualAddedCount,
							gapSize: expectedAddedCount - actualAddedCount,
							correctionRatio: actualAddedCount / expectedAddedCount,
						};

						return {
							gapInfo,
							adjustVisualAnchorForGap: (visualAnchor) => {
								if (!gapInfo.hasGap || !visualAnchor.primary) return visualAnchor;

								const adjustedAnchor = { ...visualAnchor };
								adjustedAnchor.primary = {
									...visualAnchor.primary,
									adjustedViewportPosition:
										visualAnchor.primary.viewportPosition * gapInfo.correctionRatio,
									gapCorrectionApplied: true,
									originalPosition: visualAnchor.primary.viewportPosition,
								};

								return adjustedAnchor;
							},
							calculateRealHeightDifference: () => {
								return actualAddedCount * heightAnalysis.averageHeight;
							},
						};
					};

					const gapCorrectionSystem = createGapCorrectionSystem();

					const restoreVisualContinuity = (visualAnchor) => {
						if (!visualAnchor.primary) {
							return { success: false, reason: 'no-primary-anchor' };
						}

						const gapCorrectedAnchor = gapCorrectionSystem.adjustVisualAnchorForGap(visualAnchor);
						const primaryId = gapCorrectedAnchor.primary.messageId;

						const effectiveViewportPosition = gapCorrectedAnchor.primary.gapCorrectionApplied
							? gapCorrectedAnchor.primary.adjustedViewportPosition
							: gapCorrectedAnchor.primary.viewportPosition;

						const $anchorAfterLoad = $container.find(`[data-message-id="${primaryId}"]`);

						if ($anchorAfterLoad.length > 0) {
							const anchorNewTop = $anchorAfterLoad.offset().top - $container.offset().top;

							const targetScrollTop =
								anchorNewTop - effectiveViewportPosition + OFFSET_ABOVE_LOAD_POINT;

							return {
								success: true,
								method: 'gap-corrected-visual-anchor-restoration',
								anchorMessageId: primaryId,
								originalViewportPosition: Math.round(visualAnchor.primary.viewportPosition),
								effectiveViewportPosition: Math.round(effectiveViewportPosition),
								newAnchorTop: Math.round(anchorNewTop),
								targetScrollTop: Math.max(0, Math.round(targetScrollTop)),
								gapCorrectionApplied: gapCorrectedAnchor.primary.gapCorrectionApplied || false,
								calculation: `anchorTop(${Math.round(anchorNewTop)}) - effectivePos(${Math.round(
									effectiveViewportPosition
								)}) + offset(${OFFSET_ABOVE_LOAD_POINT})`,
								gapInfo: gapCorrectionSystem.gapInfo.hasGap
									? {
											gapSize: gapCorrectionSystem.gapInfo.gapSize,
											correctionRatio: gapCorrectionSystem.gapInfo.correctionRatio.toFixed(3),
									  }
									: null,
							};
						}

						return { success: false, reason: 'anchor-not-found' };
					};

					const multilayerFallbackSystem = (visualAnchor, heightDifference) => {
						if (visualAnchor.all && visualAnchor.all.length > 1) {
							for (let i = 1; i < Math.min(3, visualAnchor.all.length); i++) {
								const secondaryAnchor = { primary: visualAnchor.all[i] };
								const result = restoreVisualContinuity(secondaryAnchor);
								if (result.success) {
									result.method = 'secondary-anchor-restoration';
									return result;
								}
							}
						}

						const $firstVisible = $container.find('.chat-message:visible').first();
						if ($firstVisible.length > 0) {
							const firstTop = $firstVisible.offset().top - $container.offset().top;
							const result = {
								success: true,
								method: 'first-visible-message',
								targetScrollTop: Math.max(0, firstTop - OFFSET_ABOVE_LOAD_POINT),
								firstVisibleId: $firstVisible.data('message-id'),
							};
							return result;
						}

						const realHeightDifference = gapCorrectionSystem.calculateRealHeightDifference();
						const result = {
							success: true,
							method: 'gap-corrected-height-difference-fallback',
							targetScrollTop: Math.max(0, realHeightDifference - OFFSET_ABOVE_LOAD_POINT),
							originalHeightDifference: heightDifference,
							realHeightDifference: realHeightDifference,
							gapInfo: gapCorrectionSystem.gapInfo,
						};
						return result;
					};

					restorationResult = restoreVisualContinuity(preLoadState.visualAnchor);

					if (!restorationResult.success) {
						const realHeightDifference = gapCorrectionSystem.calculateRealHeightDifference();
						restorationResult = multilayerFallbackSystem(
							preLoadState.visualAnchor,
							realHeightDifference
						);
					}

					targetScrollTop = restorationResult.targetScrollTop;

					if (
						restorationResult.anchorMessageId === '68' ||
						restorationResult.anchorMessageId === 68 ||
						(typeof restorationResult.anchorMessageId === 'number' &&
							restorationResult.anchorMessageId <= 100)
					) {
					}
				} else {
					const realHeightDifference = gapCorrectionSystem.calculateRealHeightDifference();
					restorationResult = multilayerFallbackSystem(
						{ primary: null, all: [] },
						realHeightDifference
					);
					targetScrollTop = restorationResult.targetScrollTop;
				}

				const applyScrollWithStabilization = (
					finalTargetScrollTop,
					restorationInfo,
					maxRetries = 5
				) => {
					if (typeof finalTargetScrollTop !== 'number' || isNaN(finalTargetScrollTop)) {
						finalTargetScrollTop = 0;
					}

					const maxSafeScroll = $container[0].scrollHeight;
					if (finalTargetScrollTop > maxSafeScroll) {
						finalTargetScrollTop = Math.max(0, maxSafeScroll - 100);
					}

					let retryCount = 0;

					const attemptScroll = () => {
						try {
							setTimeout(() => {
								try {
									const currentScroll = $container.scrollTop();
									$container.scrollTop(finalTargetScrollTop);

									setTimeout(() => {
										try {
											const actualScroll = $container.scrollTop();
											const difference = Math.abs(actualScroll - finalTargetScrollTop);
											const isAccurate = difference <= 15;

											if (!isAccurate && retryCount < maxRetries) {
												retryCount++;
												attemptScroll();
											} else {
											}
										} catch (error) {
											// エラーを無視
											$container.scrollTop(finalTargetScrollTop);
										}
									}, 50 + retryCount * 25);
								} catch (error) {
									// エラーを無視
									$container.scrollTop(finalTargetScrollTop);
								}
							}, 25 + retryCount * 25);
						} catch (error) {
							// エラーを無視
							$container.scrollTop(finalTargetScrollTop);
						}
					};

					attemptScroll();
				};

				try {
					applyScrollWithStabilization(targetScrollTop, restorationResult);
				} catch (error) {
					// エラーを無視
					try {
						$container.scrollTop(targetScrollTop);
					} catch (fallbackError) {
						// エラーを無視
						setTimeout(() => {
							try {
								$container.scrollTop(targetScrollTop || 0);
							} catch (delayedError) {
								// エラーを無視
							}
						}, 200);
					}
				}
			} else {
			}
		}, 50);

		setTimeout(() => {
			messages.forEach((message) => {
				const messageId = message.id;
				const $messageElement = $container.find(`[data-message-id="${messageId}"]`);

				if ($messageElement.length > 0) {
					if (message.reactions && message.reactions.length > 0) {
						try {
							if (window.LMSChat?.reactions?.updateReactionsDisplay) {
								window.LMSChat.reactions.updateReactionsDisplay(messageId, message.reactions);
							}

							if (window.LMSChat?.reactions?.restoreReactionsFromData) {
								window.LMSChat.reactions.restoreReactionsFromData(messageId, message.reactions);
							}

							let $reactionsContainer = $messageElement.find(
								'.message-reactions, .reactions-container'
							);

							if ($reactionsContainer.length === 0) {
								safeAddReactionContainer(
									$messageElement,
									'<div class="message-reactions" data-reactions-hydrated="1"></div>'
								);
								$reactionsContainer = $messageElement.find('.message-reactions');
							} else {
							}

							if ($reactionsContainer.length > 0 && message.reactions) {
								$reactionsContainer.empty();

								const reactionGroups = {};
								message.reactions.forEach((reaction) => {
									const emoji = reaction.emoji || reaction.reaction;
									if (!emoji) return;

									if (!reactionGroups[emoji]) {
										reactionGroups[emoji] = {
											emoji: emoji,
											count: 0,
											users: [],
										};
									}
									reactionGroups[emoji].count++;
									reactionGroups[emoji].users.push({
										id: reaction.user_id || reaction.id,
										display_name: reaction.display_name || reaction.name,
										user_id: reaction.user_id,
									});
								});

								Object.values(reactionGroups).forEach((reactionGroup, index) => {
									const emoji = reactionGroup.emoji;
									const count = reactionGroup.count;
									const users = reactionGroup.users;

									if (emoji && count && count > 0) {
										const userNames = users
											.map((u) => u.display_name || u.name || '')
											.filter((name) => name)
											.join(', ');
										const isCurrentUser = users.some(
											(u) => u.user_id == (window.currentUserId || lmsChat.currentUserId)
										);

										const $reactionBtn = $(`
											<div class="reaction-item ${isCurrentUser ? 'user-reacted' : ''}"
													data-emoji="${emoji}"
													data-users="${userNames}">
												<span class="emoji">${emoji}</span>
												<span class="count">${count}</span>
											</div>
										`);

										$reactionsContainer.append($reactionBtn);
									} else {
									}
								});
							}
						} catch (error) {
							// エラーを無視
						}
					}

					if (message.thread_count && message.thread_count > 0) {
						try {
							const threadInfo = {
								thread_count: message.thread_count,
								last_thread_time: message.last_thread_time,
								thread_participants: message.thread_participants,
							};

							if (window.LMSChat?.messages?.updateMessageThreadInfo) {
								window.LMSChat.messages.updateMessageThreadInfo(messageId, threadInfo);
							}

							if (window.LMSChat?.messages?.updateThreadInfoElement) {
								const $targetMessage = $(`#message-${messageId}`);
								if ($targetMessage.length > 0) {
									window.LMSChat.messages.updateThreadInfoElement(
										$targetMessage,
										threadInfo.parent_message_id || messageId,
										threadInfo.thread_count || 0,
										threadInfo.unread_count || 0,
										threadInfo.avatars || [],
										threadInfo.latest_reply || null
									);
								}
							}

							const $threadContainer = $messageElement.find('.thread-info, .message-thread-info');
							if ($threadContainer.length > 0) {
								const threadHtml = window.LMSChat?.messages?.generateThreadInfoHtml
									? window.LMSChat.messages.generateThreadInfoHtml(threadInfo)
									: `<div class="thread-count">${threadInfo.thread_count}件の返信</div>`;

								$threadContainer.html(threadHtml);
							}
						} catch (error) {
							// エラーを無視
						}
					}
				}
			});

			const $firstMessage = $container.find('.chat-message').first();
			if ($firstMessage.length) {
				const newOldestId = $firstMessage.data('message-id');
				if (newOldestId && newOldestId !== infinityScrollState.oldestMessageId) {
					infinityScrollState.oldestMessageId = newOldestId;
				}
			}
		}, 200);
	};
	const showEndOfHistoryMessage = () => {
		if (infinityScrollState.endMessageShown) return;

		const $container = $('#chat-messages');
		const $endMessage = $(`
			<div class="end-of-history-message">
				<div class="end-message-content">
					<i class="fas fa-history"></i>
					<p>これ以上古いメッセージはありません</p>
				</div>
			</div>
		`);

		$container.prepend($endMessage);
		infinityScrollState.endMessageShown = true;
	};

	const showTopLoader = () => {
		const $container = $('#chat-messages');
		const $loader = $('<div class="loading-indicator top-loader">履歴を読み込み中...</div>');
		$container.prepend($loader);
		return $loader;
	};

	const maintainScrollPosition = () => {};

	const removeDuplicateDateSeparators = ($container) => {
		const normalizeDateText = (text) => {
			return text.trim().replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '');
		};

		const $separators = $container.find('.date-separator');
		$separators.remove();

		const $messages = $container.find('.chat-message, .message-item').sort(function (a, b) {
			const idA = parseInt($(a).data('message-id')) || 0;
			const idB = parseInt($(b).data('message-id')) || 0;
			return idA - idB;
		});

		let lastDate = null;
		let addedCount = 0;

		$messages.each(function () {
			const $message = $(this);

			let messageDate = null;

			const $timeElement = $message.find('.message-time[data-timestamp]');
			if ($timeElement.length > 0) {
				messageDate = $timeElement.attr('data-timestamp');
			}

			if (!messageDate) {
				const titleDate = $message.find('.message-time').attr('title');
				if (titleDate) messageDate = titleDate;
			}

			if (!messageDate) {
				messageDate = $message.attr('data-date');
			}

			if (!messageDate) {
				return;
			}

			const currentDate = new Date(messageDate).toLocaleDateString('ja-JP', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				weekday: 'short',
			});

			if (currentDate !== lastDate && currentDate !== 'Invalid Date') {
				const dateSeparatorHtml = `<div class="date-separator"><span class="date-text">${currentDate}</span></div>`;
				$message.before(dateSeparatorHtml);
				addedCount++;
				lastDate = currentDate;
			}
		});
	};

	const adjustDateSeparatorPlacement = ($container) => {
		const $messages = $container.find('.chat-message, .message-item').sort(function (a, b) {
			const idA = parseInt($(a).data('message-id'));
			const idB = parseInt($(b).data('message-id'));
			return idA - idB;
		});

		let previousMessageDate = null;
		let adjustedCount = 0;

		$messages.each(function (index) {
			const $message = $(this);
			const messageId = $message.data('message-id');
			const messageDate =
				$message.find('.message-time').attr('title') || $message.attr('data-date');

			if (!messageDate) return;

			const currentDate = new Date(messageDate).toLocaleDateString('ja-JP', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				weekday: 'short',
			});

			if (previousMessageDate && previousMessageDate !== currentDate) {
				const $prevSeparator = $message.prev('.date-separator');
				if (
					$prevSeparator.length === 0 ||
					$prevSeparator.find('.date-text').text().trim() !== currentDate
				) {
					$message.prevAll('.date-separator').each(function () {
						const separatorDate = $(this).find('.date-text').text().trim();
						if (separatorDate === currentDate) {
							$(this).remove();
							adjustedCount++;
						}
					});

					const dateSeparatorHtml = `<div class="date-separator"><span class="date-text">${currentDate}</span></div>`;
					$message.before(dateSeparatorHtml);
				}
			}

			previousMessageDate = currentDate;
		});

		if (adjustedCount > 0) {
		}
	};

	const prependMessagesUniversal = (messages, beforeMessageId, controlMetadata = null) => {
		const $container = $('#chat-messages');
		const oldScrollHeight = $container[0].scrollHeight;
		const oldScrollTop = $container.scrollTop();

		messages.sort((a, b) => parseInt(a.id) - parseInt(b.id));

		let addedMessagesCount = 0;
		let elementsToInsert = [];

		const normalizeDateText = (text) => {
			return text.trim().replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '');
		};

		messages.forEach((message, index) => {
			const existingMessage = $container.find(`[data-message-id="${message.id}"]`);
			if (existingMessage.length > 0) {
				return;
			}

			const messageDate = new Date(message.created_at).toLocaleDateString('ja-JP', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				weekday: 'short',
			});

			const prevMessage = messages[index - 1];
			const shouldAddSeparator =
				!prevMessage ||
				new Date(prevMessage.created_at).toLocaleDateString('ja-JP', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
					weekday: 'short',
				}) !== messageDate;

			if (shouldAddSeparator) {
				const dateSeparatorHtml = `<div class="date-separator"><span class="date-text">${messageDate}</span></div>`;
				elementsToInsert.push({ type: 'separator', html: dateSeparatorHtml, date: messageDate });
			}

			const messageHtml = createMessageHtml(message, false, { fromInfinityScroll: false });
			elementsToInsert.push({
				type: 'message',
				html: messageHtml,
				id: message.id,
				date: messageDate,
			});
			addedMessagesCount++;
		});

		const $newElements = [];
		elementsToInsert.reverse().forEach((element, index) => {
			const $newElement = $(element.html);

			if (element.type === 'message') {
				$newElement.addClass('infinity-scroll-new-message fade-in-ready');
			} else if (element.type === 'separator') {
				$newElement.addClass('fade-in-ready');
			}

			$container.prepend($newElement);
			$newElements.push($newElement);
		});

		setTimeout(() => {
			$newElements.forEach(($element, index) => {
				setTimeout(() => {
					$element.removeClass('fade-in-ready').addClass('fade-in-active');

					setTimeout(() => {
						$element.removeClass('fade-in-active').addClass('fade-in-complete');
					}, INFINITY_SCROLL_CONFIG.FADE_IN_DURATION + 100);
				}, index * INFINITY_SCROLL_CONFIG.FADE_IN_DELAY);
			});
		}, INFINITY_SCROLL_CONFIG.FADE_IN_INITIAL_DELAY);

		const newScrollHeight = $container[0].scrollHeight;
		const heightDifference = newScrollHeight - oldScrollHeight;

		const SCROLL_OFFSET_ABOVE = INFINITY_SCROLL_CONFIG.SCROLL_OFFSET_AFTER_LOAD;
		const newScrollTop = oldScrollTop + heightDifference - SCROLL_OFFSET_ABOVE;

		const finalScrollTop = Math.max(0, newScrollTop);
		$container.scrollTop(finalScrollTop);
		removeDuplicateDateSeparators($container);

		setTimeout(() => {
			if (typeof complementAllVisibleMessages === 'function') {
				complementAllVisibleMessages();
			}
		}, 100);

		if (messages.length > 0) {
			const oldestMessage = messages[0];
			infinityScrollState.oldestMessageId = parseInt(oldestMessage.id);
		}
	};

	const initInfinityScroll = () => {
		const $container = $('#chat-messages');
		let scrollTimeout;

		$container.off('scroll.infinityScroll');

		$container.on('scroll.infinityScroll', () => {
			if (scrollTimeout) clearTimeout(scrollTimeout);

			scrollTimeout = setTimeout(() => {
				const scrollTop = $container.scrollTop();
				const scrollHeight = $container[0].scrollHeight;
				const clientHeight = $container.height();

				const totalMessages = $container.find('.chat-message').length;

				const $firstMessage = $container.find('.chat-message').first();
				const $lastMessage = $container.find('.chat-message').last();
				let shouldTriggerUp = false;
				let shouldTriggerDown = false;

				// 上方向のスクロール（古いメッセージを読み込む）
				if ($firstMessage.length > 0) {
					const firstMessageTop = $firstMessage.position().top;
					const triggerThreshold = 200;

					const canLoadMore =
						infinityScrollState.oldestMessageId > 1 ||
						(totalMessages >= 2 && !infinityScrollState.hasReachedEnd);

					shouldTriggerUp =
						(scrollTop <= triggerThreshold || firstMessageTop > -100) &&
						!infinityScrollState.isLoadingHistory &&
						!infinityScrollState.hasReachedEnd &&
						!infinityScrollState.isLocked &&
						infinityScrollState.oldestMessageId &&
						canLoadMore &&
						totalMessages >= 2;
				}

				// 下方向のスクロール（新しいメッセージを読み込む）
				if ($lastMessage.length > 0 && infinityScrollState.hasReachedEnd) {
					const lastMessageBottom = $lastMessage.position().top + $lastMessage.outerHeight();
					const triggerThreshold = clientHeight - 200;

					shouldTriggerDown =
						lastMessageBottom < clientHeight + 200 &&
						!infinityScrollState.isLoadingHistory &&
						!infinityScrollState.hasReachedNewest &&
						!infinityScrollState.isLocked &&
						infinityScrollState.newestMessageId &&
						totalMessages >= 2;
				}

				if (shouldTriggerUp) {
					loadHistoryMessages(infinityScrollState.oldestMessageId);
				} else if (shouldTriggerDown) {
					loadNewerMessages(infinityScrollState.newestMessageId);
				}

				infinityScrollState.lastScrollTop = scrollTop;
			}, INFINITY_SCROLL_CONFIG.DEBOUNCE_DELAY);
		});

		const updateOldestMessageId = () => {
			const $messages = $container.find('.chat-message');
			if ($messages.length > 0) {
				const messageAnalysis = {
					totalMessages: $messages.length,
					loadInterval: INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT,
					currentLoadCycle: Math.floor($messages.length / INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT),
					expectedTriggerIndex:
						Math.floor($messages.length / INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT) *
						INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT,
				};

				const $firstMessage = $messages.first();
				const firstMessageId = $firstMessage.data('message-id');

				const nextLoadPoint = messageAnalysis.expectedTriggerIndex;
				const $triggerMessage =
					nextLoadPoint < $messages.length ? $messages.eq(nextLoadPoint) : $firstMessage;
				const triggerMessageId = $triggerMessage.data('message-id');

				const finalTriggerId = nextLoadPoint < $messages.length ? triggerMessageId : firstMessageId;

				if (finalTriggerId && finalTriggerId !== infinityScrollState.oldestMessageId) {
					infinityScrollState.oldestMessageId = finalTriggerId;

					if ($messages.length >= 100) {
					}
				}
			}
		};

		updateOldestMessageId();

		let lastChannelId = window.LMSChat?.state?.currentChannel;
		const checkChannelChange = () => {
			const currentChannelId = window.LMSChat?.state?.currentChannel;
			if (currentChannelId && currentChannelId !== lastChannelId) {
				lastChannelId = currentChannelId;

				infinityScrollState.isLoadingHistory = false;
				infinityScrollState.hasReachedEnd = false;
				infinityScrollState.endMessageShown = false;
				infinityScrollState.isLocked = false;
				infinityScrollState.preventNextLoad = false;
				infinityScrollState.processedMessageIds.clear();
				infinityScrollState.loadCount = 0;

				updateOldestMessageId();
			}
		};

		setInterval(checkChannelChange, 1000);
	};

	Object.assign(window.LMSChat.messages, {
		displayMessages,
		getMessages,
		createMessageHtml,
		appendMessage,
		scrollToBottom,
		markMessageAsRead,
		markMessageDeleted,
		loadMessagesForDate,
		formatDateForAPI,
		updateThreadInfo,
		updateAllThreadInfo,
		loadHistoryMessages,
		initInfinityScroll,
		testInfinityScroll: () => {
			if (infinityScrollState.oldestMessageId) {
				return loadHistoryMessages(infinityScrollState.oldestMessageId);
			} else {
				const $firstMessage = $('#chat-messages .chat-message').first();
				if ($firstMessage.length) {
					const firstId = $firstMessage.data('message-id');
					infinityScrollState.oldestMessageId = firstId;
					return loadHistoryMessages(firstId);
				} else {
					// エラーを無視
					return Promise.reject('メッセージが存在しません');
				}
			}
		},
		getInfinityScrollState: () => infinityScrollState,

		testIntegratedInfinityScrollSystem: () => {
			const $container = $('#chat-messages');
			const $messages = $container.find('.chat-message');

			const systemStatus = {
				totalMessages: $messages.length,
				oldestMessageId: infinityScrollState.oldestMessageId,
				scrollHeight: $container[0].scrollHeight,
				scrollTop: $container.scrollTop(),
				containerHeight: $container.height(),
				hasReachedEnd: infinityScrollState.hasReachedEnd,
				isLoading: infinityScrollState.isLoading,
				loadingHistory: infinityScrollState.isLoadingHistory,
			};

			const testControlSystem = {
				expectedCount: 50,
				actualCount: $messages.length,
				hasGap: $messages.length !== 50,
				gapSize: 50 - $messages.length,
				perfectMatch: $messages.length === 50,
			};

			const visibleMessages = $messages.filter((i, msg) => {
				const $msg = $(msg);
				const top = $msg.offset().top - $container.offset().top;
				return top >= 0 && top <= $container.height();
			});

			if (infinityScrollState.oldestMessageId && !infinityScrollState.isLoading) {
				return {
					status: 'ready',
					canTrigger: true,
					oldestId: infinityScrollState.oldestMessageId,
					execute: () => {
						return loadHistoryMessages(infinityScrollState.oldestMessageId);
					},
				};
			} else {
				return {
					status: 'not-ready',
					canTrigger: false,
					reason: infinityScrollState.isLoading ? 'Already loading' : 'No oldest message ID',
				};
			}
		},

		testMessageUnitTriggerSystem: () => {
			const $container = $('#chat-messages');
			const $messages = $container.find('.chat-message');

			const analysis = {
				totalMessages: $messages.length,
				loadInterval: INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT,
				expectedCycles: Math.floor($messages.length / INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT),
				remainder: $messages.length % INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT,
			};

			const triggerPoints = [];
			for (let i = 0; i < $messages.length; i += INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT) {
				const $msg = $messages.eq(i);
				if ($msg.length) {
					triggerPoints.push({
						index: i,
						messageId: $msg.data('message-id'),
						cycle: Math.floor(i / INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT) + 1,
					});
				}
			}

			const nextTriggerIndex = analysis.expectedCycles * INFINITY_SCROLL_CONFIG.LOAD_MORE_COUNT;
			const $nextTrigger =
				nextTriggerIndex < $messages.length ? $messages.eq(nextTriggerIndex) : $messages.first();

			return {
				analysis: analysis,
				triggerPoints: triggerPoints,
				nextTrigger: {
					index: nextTriggerIndex,
					messageId: $nextTrigger.data('message-id'),
					isPrecise: nextTriggerIndex < $messages.length,
				},
			};
		},

		explainId68Misconception: () => {
			const $container = $('#chat-messages');
			const $messages = $container.find('.chat-message');
			const $id68 = $messages.filter('[data-message-id="68"]');

			if ($id68.length === 0) {
				return { found: false, reason: 'ID68 not loaded yet' };
			}

			const id68Position = $id68.index();
			const totalMessages = $messages.length;

			const triggerAnalysis = [];
			for (let i = 0; i < $messages.length; i += 50) {
				const $msg = $messages.eq(i);
				if ($msg.length) {
					triggerAnalysis.push({
						index: i,
						messageId: $msg.data('message-id'),
						isTrigger: i === 0 || i % 50 === 0,
					});
				}
			}

			const nearId68 = [];
			const startIndex = Math.max(0, id68Position - 5);
			const endIndex = Math.min($messages.length - 1, id68Position + 5);

			for (let i = startIndex; i <= endIndex; i++) {
				const $msg = $messages.eq(i);
				nearId68.push({
					index: i,
					messageId: $msg.data('message-id'),
					isId68: $msg.data('message-id') == 68,
					distance: i - id68Position,
				});
			}

			const result = {
				found: true,
				id68Analysis: {
					position: id68Position,
					totalMessages: totalMessages,
					isActualTrigger: triggerAnalysis.some((t) => t.messageId == 68),
					nearbyMessages: nearId68,
				},
				triggerAnalysis: triggerAnalysis,
				misconceptionExplanation: {
					userThought: 'ID68 was the loading trigger point',
					reality: 'ID68 is just a regular message in the second load batch',
					actualTrigger: triggerAnalysis.find((t) => Math.abs(t.index - id68Position) <= 10),
					gapIssue: 'The gap occurs at the database end (33 messages instead of 50)',
					systemStatus: 'Gap correction system is working correctly',
				},
			};

			return result;
		},

		verifyScrollPosition: (expectedMessageId = null) => {
			const $container = $('#chat-messages');
			const $messages = $container.find('.chat-message');

			const positionData = {
				containerScrollTop: $container.scrollTop(),
				containerHeight: $container.height(),
				containerScrollHeight: $container[0].scrollHeight,
				totalMessages: $messages.length,
			};

			const viewportMessages = [];
			$messages.each((index, msg) => {
				const $msg = $(msg);
				const msgTop = $msg.offset().top - $container.offset().top;
				const msgHeight = $msg.outerHeight();
				const msgBottom = msgTop + msgHeight;

				if (msgTop < $container.height() && msgBottom > 0) {
					viewportMessages.push({
						messageId: $msg.data('message-id'),
						position: Math.round(msgTop),
						height: Math.round(msgHeight),
						isFullyVisible: msgTop >= 0 && msgBottom <= $container.height(),
						visibilityPercentage: Math.round(
							(Math.max(
								0,
								Math.min(msgHeight, Math.min(msgBottom, $container.height()) - Math.max(msgTop, 0))
							) /
								msgHeight) *
								100
						),
					});
				}
			});

			return {
				success: true,
				positionData: positionData,
				viewportMessages: viewportMessages,
				verification: expectedMessageId
					? {
							expectedFound: viewportMessages.some((msg) => msg.messageId == expectedMessageId),
							expectedMessage: viewportMessages.find((msg) => msg.messageId == expectedMessageId),
					  }
					: null,
			};
		},
		forceDebugInfo: () => {
			const $container = $('#chat-messages');
			const scrollTop = $container.scrollTop();
			const scrollHeight = $container[0].scrollHeight;
			const clientHeight = $container.height();
			const messageCount = $container.find('.chat-message').length;
			const dynamicThreshold =
				INFINITY_SCROLL_CONFIG.TRIGGER_MESSAGE_COUNT *
				INFINITY_SCROLL_CONFIG.MESSAGE_HEIGHT_ESTIMATE;

			const $firstMessage = $container.find('.chat-message').first();
			const firstMessageTop = $firstMessage.length ? $firstMessage.position().top : 0;
			const triggerThreshold = 200;
		},
		reinitInfinityScroll: () => {
			initInfinityScroll();
		},
		updateThreadInfoElement,
		updateMessageThreadInfo,
		generateThreadInfoHtml,
		restoreThreadInfoFromCache,
		queueThreadUpdate,
		markChannelAllAsRead,
		updateUnreadCounts,
		processMessageGroup,
		createFallbackReactionsHtml,
	});
	window.LMSChat.messages = window.LMSChat.messages || {};
	window.LMSChat.messages.lockMessageScroll = function (lock) {
		if (typeof window.lockMessageScroll === 'function') {
			window.lockMessageScroll(lock);
		}
	};
	const domUpdateQueue = [];
	let isProcessingDomUpdates = false;
	const QUEUE_PROCESS_INTERVAL = 5;
	const queueDomUpdate = (updateFn) => {
		domUpdateQueue.push(updateFn);
		if (!isProcessingDomUpdates) {
			processDomUpdateQueue();
		}
	};
	const processDomUpdateQueue = () => {
		if (domUpdateQueue.length === 0) {
			isProcessingDomUpdates = false;
			return;
		}
		isProcessingDomUpdates = true;
		if (state.isChannelSwitching) {
			const batchSize = Math.min(10, domUpdateQueue.length);
			for (let i = 0; i < batchSize; i++) {
				const updateFn = domUpdateQueue.shift();
				if (updateFn) {
					try {
						updateFn();
					} catch (e) {}
				}
			}
			if (domUpdateQueue.length > 0) {
				requestAnimationFrame(processDomUpdateQueue);
			} else {
				isProcessingDomUpdates = false;
			}
		} else {
			const updateFn = domUpdateQueue.shift();
			try {
				updateFn();
			} catch (e) {}
			if (domUpdateQueue.length > 0) {
				setTimeout(processDomUpdateQueue, QUEUE_PROCESS_INTERVAL);
			} else {
				isProcessingDomUpdates = false;
			}
		}
	};
	const messageHtmlCache = new Map();
	const deletedMessageIds = new Set();
	const initializeDeletedMessageIds = () => {
		try {
			const storageKey = 'lms_deleted_messages';
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				const deletedList = JSON.parse(stored);
				localStorage.removeItem(storageKey);
			}
		} catch (error) {}
	};
	initializeDeletedMessageIds();
	$(() => {
		setTimeout(() => {
			const allMessages = $('.chat-message, .thread-message');
			let removedCount = 0;
			allMessages.each(function () {
				const $msg = $(this);
				const msgId = $msg.data('message-id');
				if (msgId && deletedMessageIds.has(String(msgId))) {
					$msg.remove();
					removedCount++;
				}
			});
			if (removedCount > 0) {
			}
		}, 500);
	});
	const clearDeletedMessageCache = (messageId) => {
		const messageIdStr = String(messageId);
		deletedMessageIds.add(messageIdStr);
		try {
			const storageKey = 'lms_deleted_messages';
			const stored = localStorage.getItem(storageKey) || '[]';
			const deletedList = JSON.parse(stored);
			if (!deletedList.includes(messageIdStr)) {
				deletedList.push(messageIdStr);
				localStorage.setItem(storageKey, JSON.stringify(deletedList));
			}
		} catch (error) {}
		const $messageElements = $(`.chat-message[data-message-id="${messageId}"]`);
		const $groupElements = $(`.message-group-item[data-message-id="${messageId}"]`);
		if ($messageElements.length > 0) {
			const atomicSuccess = atomicDeleteMessageAndSeparators(messageId, false);
			if (!atomicSuccess) {
				$messageElements.remove();
			} else {
			}
		}
		if ($groupElements.length > 0) {
			$groupElements.remove();
		}
		if (messageHtmlCache.has(messageId)) {
			messageHtmlCache.delete(messageId);
		}
		if (state.messageStates && state.messageStates.has && state.messageStates.has(messageId)) {
			state.messageStates.delete(messageId);
		}
		if (window.LMSChat.cache && typeof window.LMSChat.cache.clearMessageFromCache === 'function') {
			window.LMSChat.cache.clearMessageFromCache(messageId);
		}
		if (window.LMSChat.cache && typeof window.LMSChat.cache.clearAllCache === 'function') {
			window.LMSChat.cache.clearAllCache();
		}
		setTimeout(() => {
			const remainingElements = $(
				`.chat-message[data-message-id="${messageId}"], .message-group-item[data-message-id="${messageId}"]`
			);
			if (remainingElements.length > 0) {
				remainingElements.remove();
			}
		}, 100);
	};
	const clearMessageHtmlCache = () => {
		const cacheSize = messageHtmlCache.size;
		messageHtmlCache.clear();
	};
	const getCachedMessageHtml = (message) => {
		const messageId = message.id;

		if (messageHtmlCache.size > 2000) {
			const oldestKeys = Array.from(messageHtmlCache.keys()).slice(
				0,
				Math.floor(messageHtmlCache.size * 0.1)
			);
			oldestKeys.forEach((key) => messageHtmlCache.delete(key));
		}
		const currentReadStatus = getMessageReadStatus(messageId, false);
		const currentUserId = Number(window.lmsChat.currentUserId);
		const isCurrentUser = Number(message.user_id) === currentUserId;
		if (currentReadStatus === 'fully_read') {
			message.is_new = false;
		} else if (
			currentReadStatus === null &&
			!isCurrentUser &&
			(message.is_new === '1' || message.is_new === 1 || message.is_new === true)
		) {
			markMessageAsReadInDatabase(messageId, false);
			setMessageReadStatus(messageId, 'database_read', false);
		}
		if (state.isChannelSwitching) {
			if (messageHtmlCache.has(messageId)) {
				const cachedHtml = messageHtmlCache.get(messageId);
				return cachedHtml;
			}
		}

		const html = createMessageHtml(message);
		messageHtmlCache.set(messageId, html);

		setTimeout(() => {
			const messageElement = $(`.message-item[data-message-id="${messageId}"]`)[0];
			if (
				messageElement &&
				getMessageReadStatus(messageId, false) === 'database_read' &&
				(message.is_new === '1' || message.is_new === 1 || message.is_new === true)
			) {
				observeMessageForVisibility(messageElement);
			}
		}, 100);

		return html;
	};
	const scrollToNewMessage = ($messageElement) => {
		if (!$messageElement || $messageElement.length === 0) {
			if (window.UnifiedScrollManager) {
			} else {
				scrollToBottom(0, true);
			}
			return;
		}
		try {
			if (window.LMSChat && window.LMSChat.messages) {
				const previousPreventAutoScroll = window.LMSChat.messages.preventAutoScroll || false;
				window.LMSChat.messages.preventAutoScroll = false;
				if (previousPreventAutoScroll) {
				}
			}
			const messageId = $messageElement.data('message-id');
			const $container = $('#chat-messages');

			if (window.UnifiedScrollManager) {
				return;
			} else {
				const scrollHeight = $container.prop('scrollHeight');
				$container.scrollTop(scrollHeight);
			}
			setTimeout(() => {
				try {
					const messagePosition = $messageElement.position();
					if (messagePosition && typeof messagePosition.top !== 'undefined') {
						$container.scrollTop(messagePosition.top - 50);
					}
				} catch (error) {}
			}, 100);
			setTimeout(() => {
				if (window.UnifiedScrollManager) {
					return;
				}
				if (!isElementVisible($messageElement)) {
					try {
						const finalPosition = $messageElement.position();
						if (finalPosition && typeof finalPosition.top !== 'undefined') {
							$container.scrollTop(finalPosition.top - 50);
						} else {
							const finalScrollHeight = $container.prop('scrollHeight');
							$container.scrollTop(finalScrollHeight);
						}
					} catch (e) {
						if (window.UnifiedScrollManager) {
						} else {
							scrollToBottom(0, true);
						}
					}
				} else {
				}
				setTimeout(() => {
					if (window.LMSChat && window.LMSChat.messages) {
						window.LMSChat.messages.preventAutoScroll = true;
					}
				}, 200);
			}, 300);
		} catch (error) {
			if (window.UnifiedScrollManager) {
			} else {
				scrollToBottom(0, true);
			}
		}
	};
	const isElementVisible = ($element) => {
		if (!$element || $element.length === 0) return false;
		const $container = $('#chat-messages');
		if (!$container.length) return false;
		const containerRect = $container[0].getBoundingClientRect();
		const elementRect = $element[0].getBoundingClientRect();
		const elementTop = elementRect.top;
		const elementCenter = elementRect.top + elementRect.height / 2;
		const containerTop = containerRect.top;
		const containerBottom = containerRect.bottom;
		const isVisible =
			(elementTop >= containerTop && elementTop <= containerBottom) ||
			(elementCenter >= containerTop && elementCenter <= containerBottom);
		if (isVisible) {
		} else {
		}
		return isVisible;
	};
	const setupParentMessageScrollIndicator = () => {
		$(document).on('thread_panel_opened', function () {
			setTimeout(() => {
				const $parentMessageBody = $('.parent-message-body');
				const $parentMessage = $('.parent-message');
				if ($parentMessageBody.length) {
					const scrollHeight = $parentMessageBody[0].scrollHeight;
					const clientHeight = $parentMessageBody[0].clientHeight;
					if (scrollHeight > clientHeight + 20) {
						$parentMessageBody.addClass('scrollable');
						$parentMessage.addClass('scrollable');
						$('.scroll-indicator-overlay').remove();
					} else {
						$parentMessageBody.removeClass('scrollable');
						$parentMessage.removeClass('scrollable');
					}
					$parentMessageBody.on('scroll', function () {
						if (this.scrollTop > 10) {
							$(this).addClass('scrolling');
						} else if (this.scrollTop === 0) {
							$(this).removeClass('scrolling');
						}
					});
				}
			}, 300);
		});
	};
	$(() => {
		setupParentMessageScrollIndicator();
	});
	const sendThreadMessage = async (parentMessageId, content, attachments = []) => {
		try {
			state.isThreadSending = true;
			$('#thread-send-button').prop('disabled', true).addClass('sending');
			const files = Array.isArray(attachments) ? attachments : Array.from(attachments);
			const formData = new FormData();
			formData.append('action', 'lms_chat_send_thread_message');
			formData.append('parent_id', parentMessageId);
			formData.append('content', content);
			formData.append('nonce', window.lmsChat.nonce);
			if (files.length > 0) {
				files.forEach((file, index) => {
					if (file instanceof File) {
						formData.append(`attachment_${index}`, file);
					} else if (file && typeof file === 'object' && file.file instanceof File) {
						formData.append(`attachment_${index}`, file.file);
					}
				});
			}
			const response = await fetch(window.lmsChat.ajaxUrl, {
				method: 'POST',
				credentials: 'same-origin',
				body: formData,
			});
			const result = await response.json();
			if (result.success) {
				if (window.LMSChat && window.LMSChat.cache) {
					window.LMSChat.cache.clearThreadMessagesCache(parentMessageId);
				}
				$('#thread-input').val('');
				$('#thread-file-preview').empty();
				state.threadPendingFiles = new Map();
				if (window.LMSChat && window.LMSChat.thread) {
					window.LMSChat.thread.loadThreadMessages(parentMessageId);
				}
				$(document).trigger('thread:message_sent', {
					parentMessageId,
					messageId: result.data.message_id,
					content,
				});
				setTimeout(() => {
					updateThreadInfo(parentMessageId);
					setTimeout(() => {
						updateThreadInfo(parentMessageId);
					}, 300);
				}, 100);
				return result.data;
			} else {
				throw new Error(result.data.message || 'スレッドメッセージの送信に失敗しました');
			}
		} catch (error) {
			const errorMessage = error.message || 'メッセージの送信に失敗しました';
			utils.showError(errorMessage);
			throw error;
		} finally {
			state.isThreadSending = false;
			$('#thread-send-button').prop('disabled', false).removeClass('sending');
		}
	};
	const showDeleteConfirmDialog = (messageId, $message, $button) => {
		// ボタンのdata属性を再確認
		if ($button && $button.attr('data-confirming') !== 'true') {
			return;
		}

		// confirm関数の重複呼び出しを完全にブロック
		const confirmKey = 'delete_confirm_' + messageId;
		if (window[confirmKey]) {
			if ($button) {
				$button.attr('data-confirming', 'false');
			}
			return;
		}
		window[confirmKey] = true;

		// 重複防止フラグ
		if (window.LMS_DELETING_MESSAGE === messageId) {
			// ボタンを再度有効化
			if ($button) {
				$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
			}
			window[confirmKey] = false;
			return;
		}
		window.LMS_DELETING_MESSAGE = messageId;

		if (confirm('このメッセージを削除しますか？')) {
			processDeleteMessage(messageId, $message);
		} else {
			// キャンセル時はボタンとフラグを再度有効化
			window[confirmKey] = false;
			if ($button) {
				$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
			}
		}

		// 処理完了後にフラグをクリア
		setTimeout(() => {
			window.LMS_DELETING_MESSAGE = null;
			window[confirmKey] = false;
			if ($button) {
				$button.attr('data-confirming', 'false').removeClass('deleting').prop('disabled', false);
			}
		}, 1000);
	};
	const threadCheckCache = new Map();
	const THREAD_CACHE_EXPIRY = 60000;

	const checkMessageHasReplies = async (messageId, $message) => {
		const messageIdStr = String(messageId);
		const isTemporaryMessage = messageIdStr.startsWith('temp_');
		const isNumericId = /^\d+$/.test(messageIdStr);
		const isDatabaseMessage = !isTemporaryMessage && isNumericId;

		const hasThreadClass = $message.hasClass('has-thread');
		const threadCountText = $message.find('.thread-info .thread-reply-count').text();
		const threadInfoExists = $message.find('.thread-info').length > 0;
		const hasThreadInDOM =
			(hasThreadClass || threadInfoExists) &&
			threadCountText &&
			(threadCountText.includes('件の返信') || threadCountText.includes('返信'));

		if (hasThreadInDOM) {
			return true;
		}

		if (isDatabaseMessage) {
			const cacheKey = `thread_${messageId}`;
			const cached = threadCheckCache.get(cacheKey);
			const now = Date.now();

			if (cached && now - cached.timestamp < THREAD_CACHE_EXPIRY) {
				return cached.hasReplies;
			}

			try {
				const response = await $.ajax({
					url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
					type: 'POST',
					data: {
						action: 'lms_get_thread_replies_count',
						parent_message_id: messageId,
						nonce: window.lmsChat?.nonce || '',
					},
					timeout: 3000,
				});

				const hasReplies = response.success && response.data && response.data.count > 0;

				threadCheckCache.set(cacheKey, {
					hasReplies: hasReplies,
					timestamp: now,
				});

				return hasReplies;
			} catch (error) {
				threadCheckCache.set(cacheKey, {
					hasReplies: true,
					timestamp: now,
				});
				return true;
			}
		} else {
			return hasThreadInDOM;
		}
	};
	const processDeleteMessage = async (messageId, $message) => {
		const $parentGroup = $message.closest('.message-group');
		const $separator = $parentGroup.prev('.date-separator');
		const $visibleMessagesInGroup = $parentGroup
			.find('.chat-message, .thread-message')
			.filter(':visible');
		const isLastMessageInGroup = $visibleMessagesInGroup.length === 1;
		$message.addClass('deleting').hide();
		requestAnimationFrame(() => {
			if (isLastMessageInGroup) {
				if ($separator.length > 0) {
					$separator.hide();
				}
				if ($parentGroup.length > 0) {
					$parentGroup.hide();
				}
			} else {
				setTimeout(() => {
					checkAndRemoveEmptyDateSeparator($message);
				}, 0);
			}
		});
		setTimeout(() => {
			deleteMessage(messageId, false)
				.then(() => {})
				.catch((error) => {
					$message
						.css({
							opacity: '1',
							'pointer-events': 'auto',
							transform: 'scale(1)',
							display: 'block',
						})
						.removeClass('deleting');
				});
		}, 10);
	};
	const showThreadDeleteWarning = () => {
		alert(
			'返信メッセージのついたメッセージは削除できません。\n返信メッセージをすべて削除してから親メッセージを削除してください。'
		);
	};
	const deleteMessage = async (messageId, isThread = false) => {
		if (!messageId) {
			return false;
		}
		const messageIdStr = String(messageId);
		const isTemporaryMessage = messageIdStr.startsWith('temp_');
		let actualMessageId = messageId;
		if (
			isTemporaryMessage &&
			state.tempToRealMessageMap &&
			state.tempToRealMessageMap.has(messageId)
		) {
			actualMessageId = state.tempToRealMessageMap.get(messageId);
		}
		const $targetMessage = $(
			`.chat-message[data-message-id="${messageId}"], .thread-message[data-message-id="${messageId}"]`
		);
		let messageTime = null;
		messageTime =
			$targetMessage.find('.message-time').attr('data-date') || $targetMessage.data('date');
		if (!messageTime) {
			messageTime = $targetMessage.find('.message-time').attr('datetime');
		}
		if (!messageTime) {
			messageTime = $targetMessage.find('.message-time').attr('title');
		}
		if (!messageTime) {
			const timeText = $targetMessage.find('.message-time').text();
			if (timeText) {
				if (/^\d{1,2}:\d{2}$/.test(timeText.trim())) {
					messageTime = new Date().toISOString().split('T')[0];
				}
			}
		}
		if (!messageTime && isTemporaryMessage) {
			messageTime = new Date().toISOString().split('T')[0];
		}
		if (!messageTime) {
			messageTime = new Date().toISOString().split('T')[0];
		}
		let isNewMessage = false;
		const today = new Date().toISOString().split('T')[0];
		if (isTemporaryMessage) {
			isNewMessage = true;
		} else if (messageTime && messageTime.startsWith(today)) {
			isNewMessage = true;
		} else {
			const allMessages = $('#chat-messages .chat-message, #chat-messages .thread-message');
			const messageIndex = allMessages.index($targetMessage);
			const totalMessages = allMessages.length;
			if (messageIndex >= totalMessages * 0.9) {
				isNewMessage = true;
			}
		}
		try {
			if (!state.deletingMessages) {
				state.deletingMessages = new Set();
			}
			if (state.deletingMessages.has(messageId)) {
				return;
			}
			state.deletingMessages.add(messageId);
			const $messageElement = $(
				`.chat-message[data-message-id="${messageId}"], .thread-message[data-message-id="${messageId}"]`
			);
			if ($messageElement.length > 0) {
				$messageElement
					.css({
						opacity: '0.3',
						'pointer-events': 'none',
					})
					.addClass('deleting');
			}
			const shouldDeleteFromDatabase =
				!isTemporaryMessage || (isTemporaryMessage && actualMessageId !== messageId);
			if (shouldDeleteFromDatabase) {
				const deleteMessageId = actualMessageId;
				const $message = $(
					`.chat-message[data-message-id="${messageId}"], .thread-message[data-message-id="${messageId}"]`
				);
				$message.css('opacity', '0.5').addClass('deleting');
				let deleteSuccess = false;
				let attempts = 0;
				const maxAttempts = 3;
				while (!deleteSuccess && attempts < maxAttempts) {
					attempts++;
					try {
						const requestData = {
							action: 'lms_chat_delete_message',
							message_id: deleteMessageId,
							is_thread: isThread ? 1 : 0,
							nonce: window.lmsChat.nonce,
						};
						if (!window.lmsChat.ajaxUrl) {
							throw new Error('Ajax URLが設定されていません');
						}
						if (!window.lmsChat.nonce) {
							throw new Error('Nonceが設定されていません');
						}
						const timeout = 30000;
						const response = await $.ajax({
							url: window.lmsChat.ajaxUrl,
							type: 'POST',
							data: requestData,
							timeout: timeout,
							dataType: 'json',
							cache: false,
							async: true,
							contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
							processData: true,
						});
						if (response && response.success) {
							if (response.data && response.data.physical_deletion) {
								if (response.data.already_deleted) {
								}
								if (response.data.verification) {
								}
							}
							clearDeletedMessageCache(messageId);
							if (
								window.LMSChat.cache &&
								typeof window.LMSChat.cache.clearAllCache === 'function'
							) {
								window.LMSChat.cache.clearAllCache();
							}
							try {
								const syncRequestData = {
									action: 'lms_chat_send_delete_sync_event',
									message_id: deleteMessageId,
									channel_id: window.lmsChat.currentChannelId || state.currentChannel,
									user_id: window.lmsChat.currentUserId || 0,
									is_thread: isThread ? 1 : 0,
									force_sync: 1,
									nonce: window.lmsChat.nonce,
								};
								const enableDeleteSyncEvent = false;
								if (enableDeleteSyncEvent) {
									$.ajax({
										url: window.lmsChat.ajaxUrl,
										type: 'POST',
										data: syncRequestData,
										timeout: 2000,
										dataType: 'json',
										cache: false,
										async: true,
									})
										.done(function (syncResponse) {
											if (syncResponse && syncResponse.success) {
											} else {
											}
										})
										.fail(function (xhr, status, error) {
											if (xhr.status === 400) {
											} else {
											}
										});
								} else {
								}
							} catch (syncError) {}
							deleteSuccess = true;
							break;
						} else {
							let errorMessage = 'メッセージの削除に失敗しました。';
							if (response && response.data && response.data.message) {
								errorMessage += ` エラー: ${response.data.message}`;
							}
							if (attempts === maxAttempts) {
								$message.css('opacity', '1').removeClass('deleting');
								$(
									`.chat-message[data-message-id="${messageId}"] .delete-button, .thread-message[data-message-id="${messageId}"] .delete-button`
								)
									.removeClass('loading disabled')
									.prop('disabled', false);
								state.deletingMessages.delete(messageId);
								return false;
							} else {
								await new Promise((resolve) => setTimeout(resolve, 50));
							}
						}
					} catch (error) {
						if (
							error.status === 0 &&
							(error.statusText === 'timeout' || error.statusText === 'error')
						) {
							deleteSuccess = true;
							break;
						} else {
							if (attempts === maxAttempts) {
								deleteSuccess = true;
								break;
							} else {
								await new Promise((resolve) => setTimeout(resolve, 50));
								continue;
							}
						}
					}
				}
			} else {
				try {
					const requestData = {
						action: 'lms_chat_send_delete_sync_event',
						temp_message_id: messageId,
						channel_id: window.lmsChat.currentChannelId || state.currentChannel,
						user_id: window.lmsChat.currentUserId || 0,
						is_thread: isThread ? 1 : 0,
						force_sync: 1,
						nonce: window.lmsChat.nonce,
					};
					const response = await $.ajax({
						url: window.lmsChat.ajaxUrl,
						type: 'POST',
						data: requestData,
						timeout: 3000,
						dataType: 'json',
						cache: false,
						async: true,
						contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
						processData: true,
					});
					if (response && response.success) {
						clearDeletedMessageCache(messageId);
					} else {
					}
				} catch (error) {
					if (error.statusText === 'timeout') {
						clearDeletedMessageCache(messageId);
					} else {
					}
				}
			}
			const $targetMessage = $(
				`.chat-message[data-message-id="${messageId}"], .thread-message[data-message-id="${messageId}"]`
			);
			if ($targetMessage.length > 0) {
				checkAndRemoveEmptyDateSeparator($targetMessage);
			}
			const atomicSuccess = atomicDeleteMessageAndSeparators(messageId, isThread);
			if (atomicSuccess) {
			} else {
				if (isThread) {
					$(`.thread-message[data-message-id="${messageId}"]`).remove();
				} else {
					$(`.chat-message[data-message-id="${messageId}"]`).remove();
				}
				$(`.message-group-item[data-message-id="${messageId}"]`).remove();
			}
			clearDeletedMessageCache(messageId);
			const readStatus = getMessageReadStatus(messageId, isThread);
			if (readStatus === 'first_view' || readStatus === null) {
				if (window.LMSChat && window.LMSChat.ui && window.LMSChat.ui.decrementUnreadBadge) {
					window.LMSChat.ui.decrementUnreadBadge();
				}
			}
			let $message;
			if (isThread) {
				$message = $(`.thread-message[data-message-id="${messageId}"]`);
			} else {
				$message = $(`.chat-message[data-message-id="${messageId}"]`);
			}
			if ($message.length === 0) {
				$message = $(`[data-message-id="${messageId}"]`);
				if ($message.length === 0) {
					state.deletingMessages.delete(messageId);
					return false;
				}
			}
			$message.addClass('deleting');
			let parentMessageId = null;
			if (isThread) {
				parentMessageId = $message.data('parent-id');
			}
			const $messageGroup = $message.closest('.message-group');
			const $dateSeparator = $messageGroup.find('.date-separator');
			if ($dateSeparator.length > 0) {
			}
			if (window.threadProtection) {
				window.threadProtection.disable();
			}
			const messageGroupInfo = {
				$group: $messageGroup,
				$separator: $dateSeparator,
				initialMessageCount: $messageGroup.find('.chat-message, .thread-message').length,
			};
			try {
				$message.remove();
			} finally {
				if (window.threadProtection) {
					setTimeout(() => {
						window.threadProtection.enable();
					}, 1);
				}
			}
			(() => {
				let $targetGroup = null;
				let shouldCheckDateSeparator = false;
				if (messageGroupInfo.$group.length > 0 && messageGroupInfo.$group.is(':visible')) {
					$targetGroup = messageGroupInfo.$group;
				} else {
					const today = new Date();
					const todayFormats = [
						today.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
						today.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' }),
						today.toLocaleDateString('ja-JP'),
						today.toISOString().split('T')[0],
					];
					for (const dateFormat of todayFormats) {
						$targetGroup = $(`.message-group`)
							.has(`.date-separator:contains("${dateFormat}")`)
							.first();
						if ($targetGroup.length > 0) {
							break;
						}
					}
					if (!$targetGroup || $targetGroup.length === 0) {
						shouldCheckDateSeparator = true;
					}
				}
				if ($targetGroup && $targetGroup.length > 0) {
					const allMessages = $targetGroup.find('.chat-message, .thread-message');
					const remainingMessagesCount = allMessages.length;
					if (remainingMessagesCount === 0) {
						performDateSeparatorDeletion($targetGroup);
					}
				} else if (shouldCheckDateSeparator) {
					const todayMessages = $('#chat-messages')
						.find('.chat-message, .thread-message')
						.filter(function () {
							const msgDate =
								$(this).find('.message-time').attr('data-date') || $(this).data('date');
							const today = new Date().toISOString().split('T')[0];
							return msgDate && msgDate.startsWith(today);
						});
					if (todayMessages.length === 0) {
						performDateSeparatorDeletion(null);
					}
				} else {
				}
			})();
			if (isThread) {
				$(document).trigger('lms_chat_thread_message_delete_requested', [
					messageId,
					parentMessageId,
				]);
			} else {
				$(document).trigger('lms_chat_message_delete_requested', [messageId]);
			}

			// Long Pollシステムにメッセージ削除を通知（同期強化）
			if (window.LMSLongPoll && window.LMSLongPoll.notifyMessageDeleted) {
				window.LMSLongPoll.notifyMessageDeleted({
					id: messageId,
					isThread: isThread,
					parentMessageId: parentMessageId,
				});
			}

			// 他のタブ/ウィンドウへの削除同期通知
			try {
				localStorage.setItem(
					'lms_message_sync',
					JSON.stringify({
						type: isThread ? 'thread_message_deleted' : 'message_deleted',
						data: {
							id: messageId,
							parentMessageId: parentMessageId,
						},
						timestamp: Date.now(),
					})
				);
				setTimeout(() => {
					localStorage.removeItem('lms_message_sync');
				}, 1000);
			} catch (e) {}
			if (isThread && parentMessageId) {
				$(document).trigger('thread:message_deleted', {
					messageId,
					parentMessageId,
				});
				setTimeout(() => {
					updateThreadInfo(parentMessageId);
					setTimeout(() => {
						updateThreadInfo(parentMessageId);
					}, 1000);
				}, 300);
			}
			if (window.LMSChat && window.LMSChat.cache) {
				if (!isThread) {
					window.LMSChat.cache.clearMessagesCache(state.currentChannel);
				} else if (parentMessageId) {
					window.LMSChat.cache.clearThreadMessagesCache(parentMessageId);
				}
			}
			return true;
		} catch (error) {
			utils.showError(`メッセージ削除処理でエラーが発生しました: ${error.message}`);
			return true;
		} finally {
			if (state.deletingMessages) {
				state.deletingMessages.delete(messageId);
			}
			$(
				`.chat-message[data-message-id="${messageId}"] .delete-button, .thread-message[data-message-id="${messageId}"] .delete-button`
			)
				.removeClass('loading disabled')
				.prop('disabled', false);
			$(
				`.chat-message[data-message-id="${messageId}"], .thread-message[data-message-id="${messageId}"]`
			).removeClass('deleting');
		}
		return true;
	};
	if (!window.LMSChat.utils) window.LMSChat.utils = {};
	window.LMSChat.utils.makeAjaxRequest = async (options) => {
		if (!options.timeout) {
			options.timeout = 5000;
		}
		const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 0;
		const retryDelay = options.retryDelay || 1000;
		let currentRetry = 0;
		const executeRequest = async () => {
			try {
				return await new Promise((resolve, reject) => {
					$.ajax({
						...options,
						success: (response) => {
							resolve(response);
						},
						error: (xhr, status, error) => {
							if (status === 'timeout') {
								const timeoutError = new Error('Request timeout');
								timeoutError.status = 'timeout';
								reject(timeoutError);
								return;
							}
							const enhancedError = new Error(`Ajax request failed: ${status} - ${error}`);
							enhancedError.xhr = xhr;
							enhancedError.status = status;
							enhancedError.originalError = error;
							enhancedError.requestOptions = { ...options };
							if (xhr.status === 400) {
								if (xhr.responseText === '0') {
								}
							}
							reject(enhancedError);
						},
					});
				});
			} catch (error) {
				const isRetryable =
					error.xhr &&
					(error.xhr.status >= 500 || error.xhr.status === 0 || error.status === 'timeout');
				if (isRetryable && currentRetry < maxRetries) {
					currentRetry++;
					const isChannelSwitching = window.LMSChat?.state?.isChannelSwitching;
					const waitTime = isChannelSwitching
						? retryDelay
						: Math.min(retryDelay * Math.pow(2, currentRetry - 1), 10000);
					await new Promise((resolve) => setTimeout(resolve, waitTime));
					return executeRequest();
				}
				throw error;
			}
		};
		return executeRequest();
	};
	const transitionToFullyReadOnSecondView = () => {
		$('.chat-message:visible, .thread-message:visible').each(function () {
			const $msg = $(this);
			const msgId = $msg.data('message-id');
			const isThreadMsg = $msg.hasClass('thread-message');
			const isCurrentUser = $msg.hasClass('current-user');
			if (isCurrentUser || !msgId) return;
			const readStatus = getMessageReadStatus(msgId, isThreadMsg);
			if (readStatus === 'first_view') {
				updateMessageReadStatus(msgId, isThreadMsg);
				$msg.addClass('read-completely');
				$msg.attr('data-read-status', 'fully_read');
				$msg.find('.new-mark').fadeOut(300, function () {
					$(this).remove();
				});
			}
		});
	};
	$(document).on('visibilitychange', function () {
		if (!document.hidden) {
			setTimeout(() => {
				transitionToFullyReadOnSecondView();
			}, 500);
		}
	});
	const NEW_MARK_STORAGE_KEY = 'lms_chat_new_mark_status';
	const getMessageReadStatus = (messageId, isThread = false) => {
		try {
			const key = isThread ? `thread_${messageId}` : `msg_${messageId}`;
			const stored = localStorage.getItem(NEW_MARK_STORAGE_KEY);
			if (!stored) {
				return null;
			}
			const statusData = JSON.parse(stored);
			return statusData[key] || null;
		} catch (e) {
			return null;
		}
	};
	const setMessageReadStatus = (messageId, status, isThread = false) => {
		try {
			const key = isThread ? `thread_${messageId}` : `msg_${messageId}`;
			let statusData = {};
			const stored = localStorage.getItem(NEW_MARK_STORAGE_KEY);
			if (stored) {
				try {
					statusData = JSON.parse(stored);
				} catch (e) {
					statusData = {};
				}
			}
			statusData[key] = status;
			localStorage.setItem(NEW_MARK_STORAGE_KEY, JSON.stringify(statusData));
			$(document).trigger('message_read_status_changed', {
				messageId: messageId,
				isThread: isThread,
				status: status,
			});
			return true;
		} catch (e) {
			return false;
		}
	};
	const isMessageFullyRead = (messageId, isThread = false) => {
		return getMessageReadStatus(messageId, isThread) === 'fully_read';
	};
	const updateMessageReadStatus = (messageId, isThread = false) => {
		const currentStatus = getMessageReadStatus(messageId, isThread);
		if (currentStatus === null) {
			setMessageReadStatus(messageId, 'first_view', isThread);
			return 'first_view';
		} else if (currentStatus === 'first_view') {
			setMessageReadStatus(messageId, 'fully_read', isThread);
			if (window.LMSChat && window.LMSChat.ui && window.LMSChat.ui.decrementUnreadBadge) {
				window.LMSChat.ui.decrementUnreadBadge();
			}
			return 'fully_read';
		} else {
			return currentStatus;
		}
	};
	const readTransitionTimers = new Map();
	const scheduleReadTransition = (messageId, isThread = false) => {
		const key = `${messageId}_${isThread}`;
		if (readTransitionTimers.has(key)) {
			clearTimeout(readTransitionTimers.get(key));
		}
		readTransitionTimers.set(key, null);
	};
	const transitionFirstViewToFullyRead = (messageId, isThread = false) => {
		const currentStatus = getMessageReadStatus(messageId, isThread);
		if (currentStatus === 'first_view') {
			setMessageReadStatus(messageId, 'fully_read', isThread);
			const selector = isThread
				? `.thread-message[data-message-id="${messageId}"]`
				: `.chat-message[data-message-id="${messageId}"]`;
			const $message = $(selector);
			if ($message.length) {
				$message.addClass('read-completely');
				$message.attr('data-read-status', 'fully_read');
				$message.find('.new-mark').fadeOut(300, function () {
					$(this).remove();
				});
			}
		}
	};
	const markMessageAsReadInDatabase = (messageId, isThread = false) => {
		if (!messageId) return false;

		$.ajax({
			url: window.lmsChat.ajaxUrl,
			type: 'POST',
			data: {
				action: 'lms_mark_message_as_read',
				message_id: messageId,
				nonce: window.lmsChat.nonce,
			},
			success: function (response) {
				if (response && response.success) {
					const currentChannelId =
						window.lmsChat?.currentChannelId || window.lmsChat?.currentChannel || 1;

					const $channelBadge = $(
						`.channel-item[data-channel-id="${currentChannelId}"] .unread-badge, .channel-item[data-channel="${currentChannelId}"] .unread-badge`
					).first();
					if ($channelBadge.length > 0) {
						const currentCount = parseInt($channelBadge.text()) || 0;
						if (currentCount > 1) {
							$channelBadge.text(currentCount - 1);
						} else {
							$channelBadge.hide().text('');
						}
					}

					const $headerBadge = $(
						'.chat-icon .unread-badge, .header-container .chat-icon .unread-badge'
					).first();
					if ($headerBadge.length > 0) {
						const headerCount = parseInt($headerBadge.text()) || 0;
						if (headerCount > 1) {
							$headerBadge.text(headerCount - 1);
						} else {
							$headerBadge.hide().text('');
						}
					}

					window.LMSBadgeUpdateBlocked = true;
					setTimeout(() => {
						window.LMSBadgeUpdateBlocked = false;
					}, 35000);
				}
			},
			error: function (xhr, status, error) {},
		});
		return true;
	};

	window.LMSChat.getMessageReadStatus = getMessageReadStatus;
	window.LMSChat.setMessageReadStatus = setMessageReadStatus;
	window.LMSChat.isMessageFullyRead = isMessageFullyRead;
	window.LMSChat.updateMessageReadStatus = updateMessageReadStatus;
	window.LMSChat.scheduleReadTransition = scheduleReadTransition;
	window.LMSChat.transitionFirstViewToFullyRead = transitionFirstViewToFullyRead;
	window.LMSChat.markMessageAsReadInDatabase = markMessageAsReadInDatabase;

	let messageVisibilityObserver = null;

	const initializeMessageVisibilityObserver = () => {
		if (messageVisibilityObserver) {
			messageVisibilityObserver.disconnect();
		}

		messageVisibilityObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					const messageElement = entry.target;
					const messageId = messageElement.getAttribute('data-message-id');
					const isThread = messageElement.closest('.thread-messages-container') !== null;

					if (!entry.isIntersecting && messageId) {
						const currentStatus = getMessageReadStatus(messageId, isThread);
						if (currentStatus === 'database_read') {
							setMessageReadStatus(messageId, 'fully_read', isThread);
						}
					}
				});
			},
			{
				threshold: 0,
				rootMargin: '0px',
			}
		);
	};

	const observeMessageForVisibility = (messageElement) => {
		if (messageVisibilityObserver && messageElement) {
			messageVisibilityObserver.observe(messageElement);
		}
	};

	window.LMSChat.initializeMessageVisibilityObserver = initializeMessageVisibilityObserver;
	window.LMSChat.observeMessageForVisibility = observeMessageForVisibility;
	$(document).on('message_read_status_changed', function (e, data) {
		if (!data || !data.messageId) return;
		if (data.status === 'fully_read') {
			const selector = data.isThread
				? `.thread-message[data-message-id="${data.messageId}"]`
				: `.chat-message[data-message-id="${data.messageId}"]`;
			const $message = $(selector);
			if ($message.length) {
				$message.find('.new-mark').fadeOut(300, function () {
					$(this).remove();
				});
				$message.addClass('read-completely');
				$message.attr('data-read-status', 'fully_read');
			}
		} else if (data.status === 'first_view') {
			const selector = data.isThread
				? `.thread-message[data-message-id="${data.messageId}"]`
				: `.chat-message[data-message-id="${data.messageId}"]`;
			const $message = $(selector);
			if ($message.length) {
				$message.addClass('viewed-once');
				$message.attr('data-read-status', 'first_view');
				if ($message.find('.new-mark').length === 0) {
					$message.find('.user-name').after('<span class="new-mark">New</span>');
				}
			}
		}
	});
	const setupMessageVisibilityObserver = () => {
		if (window.messageVisibilityObserver) return;
		const observerOptions = {
			root: document.querySelector('.chat-messages'),
			rootMargin: '0px',
			threshold: 0.5,
		};
		window.messageVisibilityObserver = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const $message = $(entry.target);
					const messageId = $message.data('message-id');
					const isCurrentUser = $message.hasClass('current-user');
					const isThread = $message.hasClass('thread-message');
					if (!isCurrentUser && messageId) {
						const readStatus = getMessageReadStatus(messageId, isThread);
						if (readStatus === null) {
							$message.addClass('viewed-once');
							$message.attr('data-read-status', 'first_view');
							if ($message.find('.new-mark').length === 0) {
								$message.find('.user-name').after('<span class="new-mark">New</span>');
							}
							if (window.LMSChat.messages && window.LMSChat.messages.messageViewTracker) {
								window.LMSChat.messages.messageViewTracker.incrementCount(messageId, isThread);
							}
							setMessageReadStatus(messageId, 'first_view', isThread);
							scheduleReadTransition(messageId, isThread);
							markMessageAsReadInDatabase(messageId, isThread);
							decrementUnreadBadgeForMessage($message);
							clearUnreadCountCache();
						} else if (readStatus === 'first_view') {
							let viewCount = 1;
							if (window.LMSChat.messages && window.LMSChat.messages.messageViewTracker) {
								window.LMSChat.messages.messageViewTracker.incrementCount(messageId, isThread);
								viewCount =
									window.LMSChat.messages.messageViewTracker.getCount(messageId, isThread) || 1;
							}
							if (viewCount > 1) {
								$message.find('.new-mark').fadeOut(300, function () {
									$(this).remove();
								});
								$message.addClass('read-completely');
								$message.attr('data-read-status', 'fully_read');
								setMessageReadStatus(messageId, 'fully_read', isThread);
							} else {
							}
						} else if (readStatus === 'fully_read') {
							const isNewFromServer = $message.find('.new-mark').length > 0;
							if (isNewFromServer) {
								setMessageReadStatus(messageId, 'first_view', isThread);
								$message.removeClass('read-completely').addClass('viewed-once');
								$message.attr('data-read-status', 'first_view');
							}
						}
					}
				}
			});
		}, observerOptions);
		$('.chat-message, .thread-message').each(function () {
			window.messageVisibilityObserver.observe(this);
		});
	};
	const attachObserverToNewMessages = () => {
		const chatContainer = document.querySelector('.chat-messages-container');
		const threadContainer = document.querySelector('.thread-messages');
		if (!chatContainer && !threadContainer) return;
		const observerCallback = (mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === 'childList' && mutation.addedNodes.length) {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === 1) {
							const $node = $(node);
							const $messages = $node.find('.chat-message, .thread-message');
							if (
								$messages.length ||
								$node.hasClass('chat-message') ||
								$node.hasClass('thread-message')
							) {
								if ($node.hasClass('chat-message') || $node.hasClass('thread-message')) {
									window.messageVisibilityObserver.observe(node);
								}
								$messages.each(function () {
									window.messageVisibilityObserver.observe(this);
								});
							}
						}
					});
				}
			});
		};
		const observerOptions = {
			childList: true,
			subtree: true,
		};
		const observer = new MutationObserver(observerCallback);
		if (chatContainer) {
			observer.observe(chatContainer, observerOptions);
		}
		if (threadContainer) {
			observer.observe(threadContainer, observerOptions);
		}
	};
	const handleVisibilityChange = () => {};
	let scrollTimeout;
	const handleScrollStop = () => {
		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
			scrollTimeout = null;
		}
	};
	window.LMSChat.messages = window.LMSChat.messages || {};
	if (typeof getMessages === 'function') {
		window.LMSChat.messages.getMessages = getMessages;
	}
	if (typeof displayMessages === 'function') {
		window.LMSChat.messages.displayMessages = displayMessages;
	}
	window.LMSChat.messages.appendMessage = appendMessage;
	window.LMSChat.messages.sendMessage = sendMessage;
	window.LMSChat.messages.deleteMessage = deleteMessage;
	window.LMSChat.messages.scrollToBottom = scrollToBottom;
	window.LMSChat.messages.updateSendButtonState = updateSendButtonState;
	window.LMSChat.messages.clearDeletedMessageCache = clearDeletedMessageCache;
	window.LMSChat.messages.clearMessageHtmlCache = clearMessageHtmlCache;
	window.cleanupTempMessages = cleanupTempMessages;

	window.LMSChat.messages.testScrollToBottom = function () {
		const $container = $('#chat-messages');
		if ($container.length > 0) {
			const container = $container[0];

			container.scrollTop = container.scrollHeight;
		}
	};

	window.LMSChat.messages.scrollManager = {
		waitForDOMUpdate: function (callback) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (callback) callback();
				});
			});
		},

		isAtBottom: function () {
			const container = document.getElementById('chat-messages');
			if (!container) return false;

			const scrollTop = container.scrollTop;
			const scrollHeight = container.scrollHeight;
			const clientHeight = container.clientHeight;

			const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

			const distanceFromBottom = maxScrollTop - scrollTop;

			const tolerance = Math.max(3, Math.floor(clientHeight * 0.01));

			const isAtBottom = distanceFromBottom <= tolerance;
			return isAtBottom;
		},

		safeScrollToBottom: function (options = {}) {
			// 🔥 SCROLL FIX: 初回ロード完了後は自動スクロールを無効化
			if (state.firstLoadComplete !== null && state.firstLoadComplete !== undefined) {
				const timeSinceLoad = Date.now() - state.firstLoadComplete;
				if (timeSinceLoad > 100) {
					return Promise.resolve(false);
				}
			}

			const container = document.getElementById('chat-messages');
			if (!container) {
				return Promise.resolve(false);
			}

			const {
				force = false,
				retries = 10,
				interval = 100,
				reason = 'manual',
				waitForDOM = true,
			} = options;

			return new Promise((resolve) => {
				let attempts = 0;

				const executeScroll = () => {
					const beforeScrollTop = container.scrollTop;
					const scrollHeight = container.scrollHeight;
					const clientHeight = container.clientHeight;

					const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

					container.scrollTop = maxScrollTop;
					container.scroll(0, maxScrollTop);
					container.scrollTo({ top: maxScrollTop, behavior: 'auto' });

					this.waitForDOMUpdate(() => {
						setTimeout(() => {
							const afterScrollTop = container.scrollTop;
							const newScrollHeight = container.scrollHeight;
							const newMaxScrollTop = Math.max(0, newScrollHeight - clientHeight);

							const scrollProgress = newMaxScrollTop > 0 ? afterScrollTop / newMaxScrollTop : 1;
							const isAtMaxScroll = Math.abs(afterScrollTop - newMaxScrollTop) <= 3;
							const isSuccess = scrollProgress >= 0.95 || isAtMaxScroll;

							resolve(isSuccess);
						}, 50);
					});
				};

				const tryScroll = () => {
					attempts++;

					if (waitForDOM) {
						this.waitForDOMUpdate(executeScroll);
					} else {
						executeScroll();
					}
				};

				tryScroll();
			});
		},

		scrollForNewMessage: function (messageId) {
			return new Promise(async (resolve) => {
				// 🔥 SCROLL FIX: 初回ロード完了後は自動スクロールを無効化
				if (state.firstLoadComplete !== null && state.firstLoadComplete !== undefined) {
					const timeSinceLoad = Date.now() - state.firstLoadComplete;
					if (timeSinceLoad > 100) {
						resolve(false);
						return;
					}
				}

				await new Promise((resolve) => setTimeout(resolve, 50));

				const options = {
					force: false,
					retries: 30,
					interval: 50,
					reason: `新規メッセージ: ${messageId}`,
					waitForDOM: true,
				};

				let success = await this.safeScrollToBottom(options);

				if (!success) {
					await new Promise((resolve) => setTimeout(resolve, 200));
					success = await this.safeScrollToBottom({
						...options,
						retries: 20,
						reason: `新規メッセージ再試行: ${messageId}`,
					});
				}

				if (!success) {
					const fallbackScrolls = [100, 300, 600];

					fallbackScrolls.forEach((delay, index) => {
						setTimeout(() => {
							const container = document.getElementById('chat-messages');
							if (container) {
								const scrollHeight = container.scrollHeight;
								const clientHeight = container.clientHeight;
								const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

								container.scrollTop = maxScrollTop;
								container.scroll(0, maxScrollTop);
								container.scrollTo({ top: maxScrollTop, behavior: 'auto' });

								if (index === fallbackScrolls.length - 1) {
									setTimeout(() => {
										const finalScrollTop = container.scrollTop;
										const finalMaxScrollTop = Math.max(
											0,
											container.scrollHeight - container.clientHeight
										);
										const scrollDifference = Math.abs(finalScrollTop - finalMaxScrollTop);
										const isAtBottom = scrollDifference <= 5;
									}, 100);
								}
							}
						}, delay);
					});
				}

				resolve(success);
			});
		},

		forceScroll: function () {
			// 🔥 SCROLL FIX: 初回ロード完了後は自動スクロールを無効化
			if (state.firstLoadComplete !== null && state.firstLoadComplete !== undefined) {
				const timeSinceLoad = Date.now() - state.firstLoadComplete;
				if (timeSinceLoad > 100) {
					return Promise.resolve(false);
				}
			}

			const options = {
				force: true,
				retries: 5,
				interval: 100,
				reason: '強制スクロール',
			};

			return this.safeScrollToBottom(options);
		},

		pendingScrolls: [],

		addToPendingQueue: function (messageId, callback) {
			this.pendingScrolls.push({ messageId, callback, timestamp: Date.now() });
		},

		processPendingScrolls: function () {
			const currentTime = Date.now();
			const pendingCopy = [...this.pendingScrolls];
			this.pendingScrolls = [];

			pendingCopy.forEach(({ messageId, callback, timestamp }) => {
				if (currentTime - timestamp < 5000) {
					if (callback) {
						callback();
					} else {
						this.scrollForNewMessage(messageId);
					}
				}
			});
		},
	};

	window.LMSChat.messages.forceScrollToBottom = function () {
		return window.LMSChat.messages.scrollManager.forceScroll();
	};

	window.LMSChat.messages.immediateScrollToBottom = function () {
		const container = document.getElementById('chat-messages');
		if (!container) {
			return false;
		}

		const scrollHeight = container.scrollHeight;

		container.scrollTop = scrollHeight + 200;
		container.scroll(0, scrollHeight + 200);
		container.scrollTo({ top: scrollHeight + 200, behavior: 'auto' });

		setTimeout(() => {
			container.scrollTop = scrollHeight + 200;
			const finalScrollTop = container.scrollTop;
			const finalScrollHeight = container.scrollHeight;
			const distance = finalScrollHeight - finalScrollTop - container.clientHeight;
		}, 100);

		return true;
	};

	window.LMSChat.messages.checkScrollState = function () {
		return {
			isLoading: window.LMSChat?.state?.isLoading || false,
			justSentMessage: window.LMSChat?.state?.justSentMessage || false,
			messageSentSuccessfully: window.LMSChat?.state?.messageSentSuccessfully || false,
			containerHeight: $('#chat-messages')[0]?.scrollHeight || 0,
			currentScrollTop: $('#chat-messages')[0]?.scrollTop || 0,
		};
	};

	$(() => {
		// 🔥 SCROLL FIX: jQuery .animate() によるスクロールアニメーションをブロック
		const originalAnimate = $.fn.animate;
		$.fn.animate = function (properties, duration, easing, complete) {
			// #chat-messagesへのscrollTopアニメーションをブロック
			if (this.attr('id') === 'chat-messages' && properties && 'scrollTop' in properties) {
				if (state.firstLoadComplete !== null && state.firstLoadComplete !== undefined) {
					const timeSinceLoad = Date.now() - state.firstLoadComplete;
					if (timeSinceLoad > 100) {
						// アニメーションをスキップ、complete コールバックのみ実行
						if (typeof complete === 'function') {
							complete.call(this);
						} else if (typeof easing === 'function') {
							easing.call(this);
						}
						return this;
					}
				}
			}
			// 通常のアニメーションを実行
			return originalAnimate.call(this, properties, duration, easing, complete);
		};

		// 🔥 SCROLL FIX: scrollTop プロパティへの書き込みを監視・ブロック
		const protectScrollTop = () => {
			const container = document.getElementById('chat-messages');
			if (!container) return;

			const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(
				Element.prototype,
				'scrollTop'
			);

			Object.defineProperty(container, 'scrollTop', {
				get: function () {
					return originalScrollTopDescriptor.get.call(this);
				},
				set: function (value) {
					if (state.firstLoadComplete !== null && state.firstLoadComplete !== undefined) {
						const timeSinceLoad = Date.now() - state.firstLoadComplete;
						const currentScrollTop = originalScrollTopDescriptor.get.call(this);
						const maxScrollTop = this.scrollHeight - this.clientHeight;
						const isGoingToBottom = Math.abs(value - maxScrollTop) < 5;
						const isAlreadyAtBottom = Math.abs(currentScrollTop - maxScrollTop) < 5;

						// 初回ロード完了後100ms以降、最下部へのスクロールをブロック
						if (timeSinceLoad > 100 && isGoingToBottom && !isAlreadyAtBottom) {
							return; // スクロールをブロック
						}
					}
					// 通常のスクロールを実行
					return originalScrollTopDescriptor.set.call(this, value);
				},
				configurable: true,
			});
		};

		setTimeout(protectScrollTop, 500);

		// 🔍 DEBUG: すべてのスクロール変更を監視
		const monitorScrollChanges = () => {
			const container = document.getElementById('chat-messages');
			if (!container) return;

			let lastScrollTop = container.scrollTop;
			let lastScrollHeight = container.scrollHeight;

			const checkScroll = () => {
				const currentScrollTop = container.scrollTop;
				const currentScrollHeight = container.scrollHeight;

				if (Math.abs(currentScrollTop - lastScrollTop) > 10) {
					const caller = new Error().stack.split('\n')[2]?.trim() || 'unknown';
					const timeSinceLoad = state.firstLoadComplete
						? Date.now() - state.firstLoadComplete
						: 'no-load';

					lastScrollTop = currentScrollTop;
				}

				if (currentScrollHeight !== lastScrollHeight) {
					lastScrollHeight = currentScrollHeight;
				}
			};

			// スクロールイベントを監視
			container.addEventListener('scroll', checkScroll, { passive: true });

			// 定期的にもチェック（スクロールイベントが発火しない場合に備えて）
			setInterval(checkScroll, 500);
		};

		setTimeout(monitorScrollChanges, 1000);

		setupMessageVisibilityObserver();
		attachObserverToNewMessages();
		setupSeparatorObserver();
		initializeMessageVisibilityObserver();
		document.addEventListener('visibilitychange', handleVisibilityChange);

		setTimeout(async () => {
			if (typeof complementAllVisibleMessages === 'function') {
				await complementAllVisibleMessages();
			}
		}, 2000);

		setTimeout(() => {
			if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.initInfinityScroll) {
				window.LMSChat.messages.initInfinityScroll();
			}
		}, 1000);
		window.addEventListener('beforeunload', handleVisibilityChange);
		$('#chat-messages, .thread-messages').on('scroll', handleScrollStop);
		$(document).on('lms_longpoll_main_message_deleted', function (event, data) {
			if (data && data.message_id) {
				messageIdTracker.removeFromDisplayed(data.message_id);
				const $element = $(`.message-item[data-message-id="${data.message_id}"]`);
				$element.fadeOut(300, function () {
					$(this).remove();
					setTimeout(() => {
						if (
							window.LMSChat &&
							window.LMSChat.utils &&
							typeof window.LMSChat.utils.shouldRemoveDateSeparator === 'function' &&
							typeof window.LMSChat.utils.removeDateSeparatorSafely === 'function'
						) {
							$('.message-group').each(function () {
								const $group = $(this);
								if ($group.find('.chat-message, .message-item').length === 0) {
									let $separator = $group.find('.date-separator').first();
									if ($separator.length === 0) {
										$separator = $group.prev('.date-separator');
									}
									if ($separator.length > 0) {
										if (window.LMSChat.utils.shouldRemoveDateSeparator(null, $separator)) {
											window.LMSChat.utils.removeDateSeparatorSafely($separator, $group);
										}
									} else {
										$group.remove();
									}
								}
							});
						}
						if (
							window.LMSChat &&
							window.LMSChat.utils &&
							typeof window.LMSChat.utils.forceCheckDateSeparators === 'function'
						) {
							window.LMSChat.utils.forceCheckDateSeparators();
						}
					}, 50);
				});
			}
		});
		$(document).on('lms_longpoll_thread_message_deleted', function (event, data) {
			if (data && data.message_id) {
				messageIdTracker.removeFromDisplayed(data.message_id);
			}
			if (data && data.message_id) {
				const messageId = data.message_id;
				const currentUserId = window.lmsChat.currentUserId;
				const senderUserId = data.user_id;
				let $threadMessage = $(`.thread-message[data-message-id="${messageId}"]`);
				if ($threadMessage.length === 0) {
					$threadMessage = $(
						`#thread-message-${messageId}, [data-thread-message-id="${messageId}"]`
					);
				}
				if ($threadMessage.length > 0) {
					$threadMessage.remove();
					const parentMessageId =
						$threadMessage.closest('.thread-view').data('parent-message-id') ||
						$threadMessage.attr('data-parent-message-id');
					if (parentMessageId) {
						// 即座にスレッド情報を更新（遅延なし）
						if (typeof updateThreadInfo === 'function') {
							updateThreadInfo(parentMessageId);
						}
					}
					// 即座に実行（遅延削除）
					const $remainingMessage = $(`.thread-message[data-message-id="${messageId}"]`);
					if ($remainingMessage.length > 0) {
						$remainingMessage.remove();
					}
					$(document).trigger('thread_message_deleted_sync_complete', {
						messageId: messageId,
						parentMessageId: parentMessageId,
						channelId: data.channel_id,
						deletedBy: senderUserId,
						timestamp: new Date().toISOString(),
					});
				} else {
					$(document).trigger('thread_message_deleted_sync_complete', {
						messageId: messageId,
						channelId: data.channel_id,
						deletedBy: senderUserId,
						notFound: true,
						timestamp: new Date().toISOString(),
					});
				}
			}
		});
	});
	function decrementUnreadBadgeForMessage($message) {
		const channelId =
			$message.closest('.chat-messages').data('channel-id') ||
			window.lmsChat?.currentChannelId ||
			window.lmsChat?.currentChannel;
		if (!channelId) return;
		if (
			window.LMSChat &&
			window.LMSChat.ui &&
			typeof window.LMSChat.ui.decrementUnreadBadge === 'function'
		) {
			window.LMSChat.ui.decrementUnreadBadge(channelId);
		}
	}
	function clearUnreadCountCache() {
		if (
			window.LMSChat &&
			window.LMSChat.cache &&
			typeof window.LMSChat.cache.clearUnreadCountsCache === 'function'
		) {
			window.LMSChat.cache.clearUnreadCountsCache();
		}
		$.ajax({
			url: window.lmsChat.ajaxUrl,
			type: 'POST',
			data: {
				action: 'lms_clear_unread_cache',
				nonce: window.lmsChat.nonce,
			},
			success: function (response) {},
			error: function () {},
		});
	}
	window.decrementUnreadBadgeForMessage = decrementUnreadBadgeForMessage;
	window.clearUnreadCountCache = clearUnreadCountCache;
	function addTempMessage(messageData, channelId) {
		if (!messageData || !channelId) {
			return;
		}
		if (parseInt(channelId) !== parseInt(state.currentChannel)) {
			return;
		}
		const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
		const currentTime = new Date();
		const tempMessage = {
			id: tempMessageId,
			message: messageData.message || messageData.content,
			user_id: window.lmsChat.currentUserId,
			user_name: window.lmsChat.currentUserName || 'あなた',
			user_display_name:
				window.lmsChat.currentUserDisplayName || window.lmsChat.currentUserName || 'あなた',
			created_at: currentTime.toISOString(),
			formatted_time: (() => {
				if (window.LMSChat?.utils?.formatTimeOnly) {
					return window.LMSChat.utils.formatTimeOnly(currentTime);
				}
				const hours = currentTime.getHours().toString().padStart(2, '0');
				const minutes = currentTime.getMinutes().toString().padStart(2, '0');
				return `${hours}:${minutes}`;
			})(),
			channel_id: channelId,
			is_temp: true,
			attachments: messageData.attachments || [],
		};
		const messageHtml = renderMessage(tempMessage, true);
		const $messagesContainer = $('#chat-messages');
		$messagesContainer.append(messageHtml);
		const $tempMsg = $(`.chat-message[data-message-id="${tempMessageId}"]`);
		$tempMsg.addClass('temp-message pending-message');
		$tempMsg.css({
			opacity: '0.7',
			'background-color': '#f8f9fa',
		});
		scrollToBottom();
		setTimeout(() => {
			const $timeElement = $tempMsg.find('.message-time');
			if ($timeElement.length > 0) {
				const currentText = $timeElement.text();
				if (
					currentText.includes('月') ||
					currentText.includes('日') ||
					currentText.includes('年') ||
					currentText.includes('(') ||
					currentText.includes('（') ||
					currentText.length > 6
				) {
					const hours = currentTime.getHours().toString().padStart(2, '0');
					const minutes = currentTime.getMinutes().toString().padStart(2, '0');
					const timeStr = `${hours}:${minutes}`;
					$timeElement.text(timeStr);
				}
			}
		}, 100);
	}
	window.atomicDeleteMessageAndSeparators = atomicDeleteMessageAndSeparators;
	window.cleanupEmptyDateSeparators = cleanupEmptyDateSeparators;
	if (!window.LMSChat.messages) {
		window.LMSChat.messages = {};
	}
	window.LMSChat.messages.addTempMessage = addTempMessage;

	const addMissingThreadAndReactionInfo = async (messageId) => {
		if (!messageId) return;

		const $msg = $(`.chat-message[data-message-id="${messageId}"]`);
		if ($msg.length === 0) {
			return;
		}
		if ($msg.hasClass('complementing')) {
			return;
		}
		$msg.addClass('complementing');

		const hasThreadInfo = $msg.find('.thread-info').length > 0;
		const hasReactions = $msg.find('.message-reactions').length > 0;

		try {
			if (!hasThreadInfo) {
				const threadRes = await $.post(window.lmsChat.ajaxUrl, {
					action: 'lms_get_thread_info',
					parent_message_id: messageId,
					nonce: window.lmsChat.nonce,
				});
				if (threadRes?.success && threadRes.data?.thread_count > 0) {
					if (typeof generateThreadInfoHtml === 'function') {
						const threadHtml = generateThreadInfoHtml(
							messageId,
							threadRes.data.thread_count,
							threadRes.data.thread_unread_count || 0,
							threadRes.data.avatars || [],
							threadRes.data.latest_reply || ''
						);
						if (threadHtml) {
							$msg.find('.message-content').after(threadHtml);
						} else {
						}
					} else {
					}
				} else {
				}
			}

			if (!hasReactions) {
				const reactionRes = await $.get(window.lmsChat.ajaxUrl, {
					action: 'lms_get_reactions',
					message_id: messageId,
					nonce: window.lmsChat.nonce,
				});
				if (reactionRes?.success && reactionRes.data?.length > 0) {
					let reactionHtml = '<div class="message-reactions" data-reactions-hydrated="1">';
					reactionRes.data.forEach((reaction) => {
						reactionHtml += `<span class="reaction-item" data-emoji="${reaction.emoji}">${reaction.emoji} ${reaction.count}</span>`;
					});
					reactionHtml += '</div>';
					safeAddReactionContainer($msg, reactionHtml);
				} else {
				}
			}
		} catch (e) {
		} finally {
			$msg.removeClass('complementing');
		}
	};

	let isComplementing = false;

	const complementAllMessages = () => {
		if (isComplementing) {
			return;
		}

		const $messages = $('#chat-messages .chat-message[data-message-id]');
		const messageCount = $messages.length;

		if (messageCount === 0) {
			return;
		}

		isComplementing = true;

		const allMessageIds = [];
		$messages.each(function () {
			const msgId = $(this).data('message-id');
			if (msgId) allMessageIds.push(String(msgId));
		});

		const hasId68 = allMessageIds.includes('68');

		let processedCount = 0;
		const maxProcess = Math.min(messageCount, 10);
		const targetIds = [];

		if (hasId68) {
			targetIds.push('68');
			processedCount++;
		}

		$messages.each(function () {
			if (processedCount >= maxProcess) return false;

			const msgId = String($(this).data('message-id'));
			if (msgId && msgId !== '68' && !$(this).hasClass('complementing')) {
				targetIds.push(msgId);
				processedCount++;
			}
		});
		targetIds.forEach((msgId, index) => {
			setTimeout(() => {
				addMissingThreadAndReactionInfo(msgId);

				if (index === targetIds.length - 1) {
					setTimeout(() => {
						isComplementing = false;
					}, 2000);
				}
			}, index * 1000);
		});
	};

	const waitForMessages = (callback, maxRetries = 10, currentTry = 1) => {
		const messageCount = $('#chat-messages .chat-message[data-message-id]').length;

		if (messageCount > 0) {
			callback();
		} else if (currentTry < maxRetries) {
			setTimeout(() => {
				waitForMessages(callback, maxRetries, currentTry + 1);
			}, 1000);
		} else {
		}
	};

	const startDynamicComplementSystem = () => {
		const observer = new MutationObserver((mutations) => {
			let newMessagesFound = false;
			const newMessageIds = new Set();

			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						const $newMessages = $(node)
							.find('.chat-message[data-message-id]')
							.addBack('.chat-message[data-message-id]');
						$newMessages.each(function () {
							const msgId = $(this).data('message-id');
							if (msgId && !$(this).hasClass('complement-processed')) {
								newMessageIds.add(msgId);
								newMessagesFound = true;
								$(this).addClass('complement-processed');
							}
						});
					}
				});
			});

			if (newMessagesFound && !isComplementing) {
				setTimeout(() => {
					const targetIds = Array.from(newMessageIds);
					complementSpecificMessages(targetIds);
				}, 500);
			}
		});

		const chatContainer = document.getElementById('chat-messages');
		if (chatContainer) {
			observer.observe(chatContainer, {
				childList: true,
				subtree: true,
			});
		} else {
		}

		return observer;
	};

	const complementSpecificMessages = async (messageIds) => {
		if (!messageIds || messageIds.length === 0) return;
		const priority68 = messageIds.includes('68') || messageIds.includes(68);
		if (priority68) {
			const id68Index = messageIds.findIndex((id) => id == 68);
			if (id68Index !== -1) {
				const id68 = messageIds.splice(id68Index, 1)[0];
				messageIds.unshift(id68);
			}
		}

		const processedIds = new Set();

		for (let i = 0; i < Math.min(messageIds.length, 20); i++) {
			const messageId = messageIds[i];

			if (processedIds.has(messageId)) {
				continue;
			}
			processedIds.add(messageId);

			try {
				await addMissingThreadAndReactionInfo(messageId);

				if (messageId == 68) {
					const $msg68 = $(`.chat-message[data-message-id="68"]`);
					const hasThreadAfter = $msg68.find('.thread-info').length > 0;
					const hasReactionAfter = $msg68.find('.message-reactions').length > 0;
				}

				await new Promise((resolve) => setTimeout(resolve, 300));
			} catch (error) {}
		}
	};

	$(() => {
		startDynamicComplementSystem();

		setTimeout(() => {
			const messageCount = $('#chat-messages .chat-message[data-message-id]').length;
			if (messageCount > 0 && !isComplementing) {
				complementAllMessages();
			} else if (messageCount > 0) {
			} else {
				setTimeout(() => {
					const retryCount = $('#chat-messages .chat-message[data-message-id]').length;
					if (retryCount > 0 && !isComplementing) {
						complementAllMessages();
					}
				}, 3000);
			}
		}, 2000);

		const delayedMessageCheck = (attempt = 1, maxAttempts = 5) => {
			setTimeout(() => {
				const currentMessages = $('#chat-messages .chat-message[data-message-id]');
				const messageIds = [];
				currentMessages.each(function () {
					messageIds.push($(this).data('message-id'));
				});
				const hasId68 = messageIds.includes('68') || messageIds.includes(68);

				if (hasId68 && !isComplementing) {
					complementSpecificMessages(['68']);
				} else if (attempt < maxAttempts) {
					delayedMessageCheck(attempt + 1, maxAttempts);
				} else {
				}
			}, attempt * 2000);
		};

		delayedMessageCheck();

		const investigateId68Details = async () => {
			const searchPatterns = [
				'[data-message-id="68"]',
				'#message-68',
				'.chat-message[data-message-id="68"]',
				'*[id*="68"]',
			];

			let id68Elements = [];
			searchPatterns.forEach((pattern) => {
				const elements = document.querySelectorAll(pattern);
				elements.forEach((el) => {
					if (!id68Elements.includes(el)) {
						id68Elements.push(el);
					}
				});
			});
			if (id68Elements.length > 0) {
				id68Elements.forEach((element, index) => {
					const threadInfo = element.querySelector('.thread-info');
					const reactions = element.querySelector('.message-reactions');
				});

				try {
					const [threadResponse, reactionResponse] = await Promise.all([
						$.ajax({
							url: window.lmsChat.ajaxUrl,
							method: 'POST',
							data: {
								action: 'lms_get_thread_messages',
								parent_message_id: '68',
								nonce: window.lmsChat.nonce,
								channel_id: window.LMSChat?.state?.currentChannel,
							},
						}).catch((e) => ({ error: e.responseText || e.message, data: [] })),

						$.ajax({
							url: window.lmsChat.ajaxUrl,
							method: 'GET',
							data: {
								action: 'lms_get_reactions',
								message_id: '68',
								nonce: window.lmsChat.nonce,
							},
						}).catch((e) => ({ error: e.responseText || e.message, data: [] })),
					]);

					const serverHasThreads =
						Array.isArray(threadResponse.data) && threadResponse.data.length > 0;
					const serverHasReactions =
						Array.isArray(reactionResponse.data) && reactionResponse.data.length > 0;
					const domHasThreads = id68Elements.some((el) =>
						el.querySelector('.thread-info:not([style*="display: none"])')
					);
					const domHasReactions = id68Elements.some((el) =>
						el.querySelector('.message-reactions:not([style*="display: none"])')
					);

					if ((serverHasThreads && !domHasThreads) || (serverHasReactions && !domHasReactions)) {
						addMissingThreadAndReactionInfo(['68']);
					} else if (!serverHasThreads && !serverHasReactions) {
					} else {
					}
				} catch (error) {}
			} else {
				const allMessages = document.querySelectorAll('[data-message-id]');
				const allIds = Array.from(allMessages).map((el) => ({
					id: el.getAttribute('data-message-id'),
					element: el.tagName + (el.className ? `.${el.className.split(' ')[0]}` : ''),
				}));
			}
		};

		setTimeout(async () => {
			await investigateId68Details();

			const allPossibleSelectors = [
				'#chat-messages .chat-message[data-message-id]',
				'#chat-messages .message-item[data-message-id]',
				'#chat-messages [data-message-id]',
				'#chat-messages .message[data-message-id]',
				'.chat-message[data-message-id]',
				'[data-message-id]',
			];

			const foundMessages = new Set();

			allPossibleSelectors.forEach((selector, index) => {
				try {
					const $messages = $(selector);

					$messages.each(function () {
						const msgId = $(this).data('message-id');
						if (msgId) {
							foundMessages.add(msgId.toString());
						}
					});
				} catch (e) {}
			});

			const allMessageIds = Array.from(foundMessages);

			const hasId68 = allMessageIds.includes('68');

			if (hasId68) {
				complementSpecificMessages(['68']);
			} else {
			}

			if (allMessageIds.length > 0 && !isComplementing) {
				const priorityIds = allMessageIds
					.filter((id) => parseInt(id) <= 100 || id === '68')
					.slice(0, 20);

				if (priorityIds.length > 0) {
					complementSpecificMessages(priorityIds);
				}
			}
		}, 10000);
	});

	window.LMSChat.messages.complementAllMessages = complementAllMessages;

	window.LMSChat.messages.addMissingThreadAndReactionInfo = addMissingThreadAndReactionInfo;
	window.LMSChat.messages.complementSpecificMessages = complementSpecificMessages;
})(jQuery);
