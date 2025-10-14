(function ($) {
	'use strict';
	const { state, utils } = window.LMSChat;
	const logDebug = (window.LMSChat.reactionCore && window.LMSChat.reactionCore.logDebug) || (() => {});
	const recentlyUsedEmojis = {
		maxItems: 16,
		storageKey: 'lms_recently_used_emojis',
		add(emoji) {
			try {
				let emojis = this.get();
				emojis = emojis.filter((e) => e !== emoji);
				emojis.unshift(emoji);
				if (emojis.length > this.maxItems) {
					emojis = emojis.slice(0, this.maxItems);
				}
				localStorage.setItem(this.storageKey, JSON.stringify(emojis));
			} catch (error) {
			}
		},
		get() {
			try {
				const stored = localStorage.getItem(this.storageKey);
				return stored ? JSON.parse(stored) : [];
			} catch (error) {
				return [];
			}
		},
	};
	const initEmojiPicker = () => {
		$('.emoji-picker').remove();
		const emojiData = {
			frequently: function () {
				return recentlyUsedEmojis.get();
			},
			smileys: [
				'😀',
				'😃',
				'😄',
				'😁',
				'😆',
				'😅',
				'🤣',
				'😂',
				'🙂',
				'🙃',
				'😉',
				'😊',
				'😇',
				'🥰',
				'😍',
				'🤩',
				'😘',
				'😗',
				'😚',
				'😙',
				'😋',
				'😛',
				'😜',
				'🤪',
				'😝',
				'🤑',
				'🤗',
				'🤭',
				'🤫',
				'🤔',
				'🤐',
				'🤨',
				'😐',
				'😑',
				'😶',
				'😏',
				'😒',
				'🙄',
				'😬',
				'🤥',
			],
			gestures: [
				'👍',
				'👎',
				'👌',
				'✌️',
				'🤞',
				'🤟',
				'🤘',
				'🤙',
				'👈',
				'👉',
				'👆',
				'👇',
				'☝️',
				'👋',
				'🤚',
				'🖐️',
				'✋',
				'🖖',
				'👏',
				'🙌',
				'👐',
				'🤲',
				'🙏',
				'✍️',
				'💅',
				'🤳',
				'💪',
				'👂',
				'👃',
				'🧠',
				'👣',
				'👀',
				'👁️',
				'👅',
				'👄',
			],
			gestures2: [
				'🙇',
				'🙇🏻',
				'🙇‍♀️',
				'🙇🏻‍♀️',
				'💁‍♀️',
				'💁‍♂️',
				'🙅‍♀️',
				'🙅‍♂️',
				'🙆‍♀️',
				'🙆‍♂️',
				'🙋‍♀️',
				'🙋‍♂️',
				'🙍‍♂️',
				'🙍',
				'🤦‍♀️',
				'🤦‍♂️',
				'🤷‍♀️',
				'🤷‍♂️',
				'🧏‍♀️',
				'🧏‍♂️',
				'🙇‍♂️',
				'🙇🏼',
				'🙇🏼‍♀️',
				'🙇🏼‍♂️',
				'💁',
				'💁🏼',
				'💁🏼‍♀️',
				'💁🏼‍♂️',
				'🙅',
				'🙅🏼',
				'🙅🏼‍♀️',
				'🙅🏼‍♂️',
				'🙆',
				'🙆🏼',
				'🙆🏼‍♀️',
				'🙆🏼‍♂️',
				'🙋',
				'🙋🏼',
				'🙋🏼‍♀️',
				'🙋🏼‍♂️',
				'🙍',
				'🙍🏼',
				'🙍🏼‍♀️',
				'🙍🏼‍♂️',
				'🤦',
				'🤦🏼',
				'🤦🏼‍♀️',
				'🤦🏼‍♂️',
				'🤷',
				'🤷🏼',
				'🤷🏼‍♀️',
				'🤷🏼‍♂️',
				'🧏',
				'🧏🏼',
				'🧏🏼‍♀️',
				'🧏🏼‍♂️',
			],
			evaluation: [
				'💯',
				'🔟',
				'⭐',
				'🌟',
				'✨',
				'🏆',
				'🥇',
				'🥈',
				'🥉',
				'🏅',
				'🎖️',
				'🎗️',
				'🎀',
				'🎊',
				'🎉',
				'📈',
				'📉',
				'📊',
				'✅',
				'❌',
				'❓',
				'❗',
				'‼️',
				'⁉️',
				'❕',
				'❔',
			],
			symbols: [
				'❤️',
				'🧡',
				'💛',
				'💚',
				'💙',
				'💜',
				'🖤',
				'🤍',
				'🤎',
				'💔',
				'❣️',
				'💕',
				'💞',
				'💓',
				'💗',
				'💖',
				'💘',
				'💝',
				'💟',
				'☮️',
				'✝️',
				'☪️',
				'🕉️',
				'☸️',
				'✡️',
				'🔯',
				'🕎',
				'☯️',
				'☦️',
				'🛐',
				'⛎',
				'♈',
				'♉',
				'♊',
				'♋',
				'♌',
				'♍',
				'♎',
				'♏',
				'♐',
			],
			objects: [
				'💡',
				'📱',
				'💻',
				'⌨️',
				'🖥️',
				'🖨️',
				'📷',
				'🎮',
				'🎲',
				'🎯',
				'🎨',
				'🎭',
				'🎪',
				'📚',
				'📖',
				'📝',
				'✏️',
				'📏',
				'📐',
				'🔒',
				'🔓',
				'🔑',
				'🔨',
				'⚒️',
				'🛠️',
				'⛏️',
				'✂️',
				'📌',
				'📍',
				'📎',
				'🔗',
				'🧮',
			],
			food: [
				'🍎',
				'🍐',
				'🍊',
				'🍋',
				'🍌',
				'🍉',
				'🍇',
				'🍓',
				'🫐',
				'🍈',
				'🍒',
				'🍑',
				'🥭',
				'🍍',
				'🥥',
				'🥝',
				'🍅',
				'🥑',
				'🥦',
				'🥬',
				'🥒',
				'🌶️',
				'🫑',
				'🥕',
				'🧄',
				'🧅',
				'🥔',
				'🍠',
				'🥐',
				'🥯',
				'🍞',
				'🥖',
			],
		};
		let pickerHtml = `
        <div class="emoji-picker">
            <div class="emoji-picker-header">
                <div class="emoji-picker-title">絵文字を選択</div>
                <div class="emoji-picker-close">×</div>
            </div>
            <div class="emoji-categories">
                <div class="emoji-category active" data-category="frequently">🕒</div>
                <div class="emoji-category" data-category="smileys">😀</div>
                <div class="emoji-category" data-category="gestures">👍</div>
                <div class="emoji-category" data-category="gestures2">🙇</div>
                <div class="emoji-category" data-category="evaluation">💯</div>
                <div class="emoji-category" data-category="symbols">❤️</div>
                <div class="emoji-category" data-category="objects">💡</div>
                <div class="emoji-category" data-category="food">🍎</div>
            </div>
            <div class="emoji-list"></div>
        </div>`;
		document.body.insertAdjacentHTML('beforeend', pickerHtml);
		const pickerElement = document.querySelector('.emoji-picker');
		initDraggable(pickerElement);
		return { pickerElement, emojiData };
	};
	const initDraggable = (element) => {
		const header = element.querySelector('.emoji-picker-header');
		let isDragging = false;
		let offsetX, offsetY;
		header.addEventListener('mousedown', (e) => {
			isDragging = true;
			offsetX = e.clientX - element.getBoundingClientRect().left;
			offsetY = e.clientY - element.getBoundingClientRect().top;
			element.classList.add('dragging');
			document.body.style.cursor = 'move';
		});
		document.addEventListener('mousemove', (e) => {
			if (!isDragging) return;
			if (element.classList.contains('position-top')) {
				let left = e.clientX - offsetX;
				const windowWidth = window.innerWidth;
				const pickerWidth = element.offsetWidth;
				if (left < 0) left = 0;
				if (left + pickerWidth > windowWidth) left = windowWidth - pickerWidth;
				element.style.left = `${left}px`;
				return;
			}
			let left = e.clientX - offsetX;
			let top = e.clientY - offsetY;
			const windowWidth = window.innerWidth;
			const windowHeight = window.innerHeight;
			const pickerWidth = element.offsetWidth;
			const pickerHeight = element.offsetHeight;
			if (left < 0) left = 0;
			if (left + pickerWidth > windowWidth) left = windowWidth - pickerWidth;
			if (top < 0) top = 0;
			if (top + pickerHeight > windowHeight) top = windowHeight - pickerHeight;
			element.style.left = `${left}px`;
			element.style.top = `${top}px`;
		});
		document.addEventListener('mouseup', () => {
			if (isDragging) {
				isDragging = false;
				element.classList.remove('dragging');
				document.body.style.cursor = '';
			}
		});
		element.querySelector('.emoji-picker-close').addEventListener('click', () => {
			element.classList.remove('active');
		});
	};
	const showEmojiCategory = (category, emojiData) => {
		const $emojiList = $('.emoji-list');
		$emojiList.empty();
		let emojis = [];
		if (typeof emojiData[category] === 'function') {
			emojis = emojiData[category]();
		} else {
			emojis = emojiData[category] || [];
		}
		if (emojis.length === 0 && category === 'frequently') {
			$emojiList.html('<div class="emoji-empty-message">最近使用した絵文字はありません</div>');
			return;
		} else if (emojis.length === 0) {
			$emojiList.html('<div class="emoji-empty-message">絵文字がありません</div>');
			return;
		}
		emojis.forEach((emoji) => {
			if (emoji && emoji.trim().length > 0) {
				const $item = $('<div class="emoji-item" data-emoji="' + emoji + '"></div>').text(emoji);
				$emojiList.append($item);
			}
		});
	};
	const addEmojiToMessage = (emoji) => {
		const $input = $('#chat-input');
		const currentText = $input.val();
		$input.val(currentText + emoji);
		$input.focus();
	};
	const handleEmojiSelect = async (emoji, messageId, isThread) => {
		try {
			if (!emoji || emoji.length === 0) {
				utils.showError('絵文字の選択に失敗しました');
				return false;
			}
			if (!messageId) {
				messageId = state.currentReactionMessageId;
				if (!messageId) {
					utils.showError('リアクションの対象メッセージが見つかりません');
					return false;
				}
			}
			const picker = document.querySelector('.emoji-picker');
			if (picker) {
				picker.classList.remove('active');
				picker.classList.remove('position-top');
			}
			let result = false;
			if (isThread) {
				if (typeof window.toggleThreadReaction === 'function') {
					result = await window.toggleThreadReaction(messageId, emoji);
				}
			} else {
				if (typeof window.toggleReaction === 'function') {
					result = await window.toggleReaction(messageId, emoji, false);  
				}
			}
			state.currentReactionMessageId = null;
			state.currentReactionIsThread = false;
			if (result) {
				recentlyUsedEmojis.add(emoji);
			}
			return result;
		} catch (error) {
			utils.showError('リアクションの処理中にエラーが発生しました。');
			return false;
		}
	};
	const addReaction = async (messageId, emoji, isThread = false) => {
		try {
			if (!messageId || !emoji) {
				utils.showError('リアクションの処理に失敗しました');
				return false;
			}
			if (!lmsChat.currentUserId) {
				utils.showError('ユーザーIDが設定されていません。ログインしてください。');
				return false;
			}
			

			const isParentMessage = window.LMSChat.state.currentThread === messageId;
			let isRemovingReaction = false;
			if (isThread) {
				const $threadMessage = $(`.thread-message[data-message-id="${messageId}"]`);
				if ($threadMessage.length > 0) {
					const $existingReaction = $threadMessage.find(`.reaction-item[data-emoji="${emoji}"]`);
					if ($existingReaction.length > 0 && $existingReaction.hasClass('user-reacted')) {
						isRemovingReaction = true;
					}
				}
			} else {
				let $message;
				if (isParentMessage) {
					$message = $('.parent-message-reactions');
					if ($message.length === 0) {
						$message = $('.parent-message');
					}
				} else {
					$message = $(`.chat-message[data-message-id="${messageId}"]`);
				}
				if ($message.length > 0) {
					const $existingReaction = $message.find(`.reaction-item[data-emoji="${emoji}"]`);
					if ($existingReaction.length > 0) {
						const userReacted = $existingReaction.hasClass('user-reacted');
						if (userReacted) {
							isRemovingReaction = true;
							const currentCount = parseInt($existingReaction.find('.count').text() || '1');
							if (currentCount <= 1) {
								$existingReaction.remove();
							} else {
								const newCount = currentCount - 1;
								$existingReaction.find('.count').text(newCount);
								$existingReaction.removeClass('user-reacted');
							}
						}
					}
				}
			}
			if (window.LMSChat.reactions) {
				let result;
				if (isThread) {
					if (window.LMSChat.reactions.toggleThreadReaction) {
						result = await window.LMSChat.reactions.toggleThreadReaction(messageId, emoji);
					} else if (window.toggleThreadReaction) {
						result = await window.toggleThreadReaction(messageId, emoji);
					}
				} else {
					result = await window.LMSChat.reactions.toggleReaction(messageId, emoji, false);
					if (isParentMessage) {
						if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.pollReactions) {
							window.LMSChat.reactionSync.pollReactions();
						}
						else if (window.LMSChat.reactions && window.LMSChat.reactions.pollReactions) {
							window.LMSChat.reactions.pollReactions();
						}
					}
				}
				if (result && !isRemovingReaction) {
					recentlyUsedEmojis.add(emoji);
				}
				return result;
			}
			
			// スレッドリアクションの場合は永続的保護を設定（サーバーリクエスト前）
			if (isThread && window.LMSChat.reactionSync && window.LMSChat.reactionSync.addPersistentThreadProtection) {
				const action = isRemovingReaction ? 'remove' : 'add';
				logDebug(`[スレッドリアクション送信] メッセージ${messageId}に${emoji}を${action} - 保護設定開始`);
				window.LMSChat.reactionSync.addPersistentThreadProtection(messageId, `user_${action}_${emoji}`);
			}
			
			const data = {
				action: isThread ? 'lms_toggle_thread_reaction' : 'lms_toggle_reaction',
				message_id: messageId,
				emoji: emoji,
				nonce: lmsChat.nonce,
				user_id: lmsChat.currentUserId,
			};
			logDebug(`[スレッドリアクション送信] Ajaxリクエスト開始:`, {
				action: data.action,
				messageId: messageId,
				emoji: emoji,
				isRemoving: isRemovingReaction,
				isThread: isThread
			});
			
			const response = await $.ajax({
				url: lmsChat.ajaxUrl,
				type: 'POST',
				data: data,
			});
			if (response.success) {
				logDebug(`[スレッドリアクション送信] サーバー成功レスポンス:`, {
					messageId: messageId,
					emoji: emoji,
					responseData: response.data,
					isThread: isThread
				});
				
				if (!isRemovingReaction) {
					recentlyUsedEmojis.add(emoji);
				}
				if (response.data && (window.LMSChat.reactions || window.LMSChat.reactionUI)) {
					if (isThread) {
						// スレッドリアクション成功 - サーバー確認後の保護解除
						if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.clearThreadProtectionOnSuccess) {
							window.LMSChat.reactionSync.clearThreadProtectionOnSuccess(messageId);
						}
						
						// 正しいスレッドリアクション更新関数を使用
						if (window.LMSChat.reactionUI && window.LMSChat.reactionUI.updateThreadMessageReactions) {
							window.LMSChat.reactionUI.updateThreadMessageReactions(messageId, response.data, false, true);
						} else if (window.LMSChat.reactions && window.LMSChat.reactions.updateThreadMessageReactions) {
							window.LMSChat.reactions.updateThreadMessageReactions(messageId, response.data);
						}
						
						// スレッドリアクション用のポーリングも追加
						if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.pollThreadReactions) {
							window.LMSChat.reactionSync.pollThreadReactions();
						}
						else if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.pollReactions) {
							window.LMSChat.reactionSync.pollReactions();
						}
						else if (window.LMSChat.reactions && window.LMSChat.reactions.pollReactions) {
							window.LMSChat.reactions.pollReactions();
						}
					} else {
						if (window.LMSChat.reactionUI && window.LMSChat.reactionUI.updateMessageReactions) {
							window.LMSChat.reactionUI.updateMessageReactions(messageId, response.data, false, true);
						} else if (window.LMSChat.reactions && window.LMSChat.reactions.updateMessageReactions) {
							window.LMSChat.reactions.updateMessageReactions(messageId, response.data);
						}
						if (isParentMessage) {
							if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.pollReactions) {
								window.LMSChat.reactionSync.pollReactions();
							}
							else if (window.LMSChat.reactions && window.LMSChat.reactions.pollReactions) {
								window.LMSChat.reactions.pollReactions();
							}
						}
					}
				}
				return true;
			} else {
				utils.showError(response.data || 'リアクションの処理に失敗しました');
				return false;
			}
		} catch (error) {
			logDebug(`[スレッドリアクション送信] エラー発生:`, {
				messageId: messageId,
				emoji: emoji,
				isThread: isThread,
				error: error.message || error
			});
			
			// エラー時は設定した永続的保護を解除
			if (isThread && window.LMSChat.reactionSync && window.LMSChat.reactionSync.clearThreadProtectionOnSuccess) {
				window.LMSChat.reactionSync.clearThreadProtectionOnSuccess(messageId);
			}
			utils.showError('リアクションの処理中にエラーが発生しました');
			return false;
		}
	};
	const setupEmojiPicker = () => {
		const { pickerElement, emojiData } = initEmojiPicker();
		$(document).on('click', '.emoji-category', function () {
			const category = $(this).data('category');
			$('.emoji-category').removeClass('active');
			$(this).addClass('active');
			showEmojiCategory(category, emojiData);
		});
		$(document).on('click', '.emoji-item', async function () {
			const emoji = $(this).data('emoji') || $(this).text().trim();
			if (!emoji || emoji.length === 0) {
				utils.showError('絵文字の選択に失敗しました');
				return;
			}
			const messageId = state.currentReactionMessageId;
			const isThread = state.currentReactionIsThread;
			if (messageId) {
				if (messageId && emoji) {
					await handleEmojiSelect(emoji, messageId, isThread);
				} else {
					utils.showError('リアクションの処理に失敗しました');
				}
			} else {
				addEmojiToMessage(emoji);
			}
		});
		$(document).on('click', '.add-reaction', function (e) {
			e.stopPropagation();
			const messageElement = $(this).closest('.chat-message, .thread-message, .parent-message');
			const messageId = $(this).data('message-id') || messageElement.data('message-id');
			const isThread =
				messageElement.hasClass('thread-message') || messageElement.hasClass('parent-message');
			state.currentReactionMessageId = messageId;
			state.currentReactionIsThread = isThread;
			const buttonRect = this.getBoundingClientRect();
			const windowHeight = window.innerHeight;
			const windowWidth = window.innerWidth;
			const pickerHeight = 400;
			const pickerWidth = 320;
			let top = buttonRect.bottom + 5;
			let left = buttonRect.left - pickerWidth / 2 + buttonRect.width / 2;
			let useBottomPosition = false;
			if (top + pickerHeight > windowHeight) {
				useBottomPosition = true;
				top = null;
			}
			if (left < 10) {
				left = 10;
			}
			if (left + pickerWidth > windowWidth - 10) {
				left = windowWidth - pickerWidth - 10;
			}
			if (useBottomPosition) {
				pickerElement.style.top = '';
				pickerElement.style.bottom = '145px';
				pickerElement.classList.add('position-top');
			} else {
				pickerElement.style.bottom = '';
				pickerElement.style.top = `${top}px`;
				pickerElement.classList.remove('position-top');
			}
			pickerElement.style.left = `${left}px`;
			pickerElement.classList.add('active');
			showEmojiCategory('frequently', emojiData);
		});
		$(document).on('click', '.emoji-picker, .emoji-item', function (e) {
			e.stopPropagation();
		});
		$(document).on('keydown', function (e) {
			if (e.key === 'Escape') {
				pickerElement.classList.remove('active');
			}
		});
		$(document).on('click', function (e) {
			const picker = document.querySelector('.emoji-picker');
			if (!picker || !picker.classList.contains('active')) return;
			if (
				picker.contains(e.target) ||
				e.target.classList.contains('add-reaction') ||
				$(e.target).closest('.add-reaction').length > 0
			) {
				return;
			}
			picker.classList.remove('active');
		});
	};
	function closeEmojiPicker() {
		$('.emoji-picker').removeClass('active');
		state.activePicker = null;
	}
	const showPicker = ($button, messageIdOrCallback, isThreadOrCallback, customCallback) => {
		const { pickerElement, emojiData } = initEmojiPicker();
		let messageId = null;
		let isThread = false;
		let callback = null;
		if (typeof messageIdOrCallback === 'function') {
			callback = messageIdOrCallback;
		} else {
			messageId = messageIdOrCallback;
			if (typeof isThreadOrCallback === 'boolean') {
				isThread = isThreadOrCallback;
				if (typeof customCallback === 'function') {
					callback = customCallback;
				}
			} else if (typeof isThreadOrCallback === 'function') {
				callback = isThreadOrCallback;
			}
		}
		if (messageId) {
			state.currentReactionMessageId = messageId;
			state.currentReactionIsThread = isThread;
		}
		if (callback) {
			state.customEmojiCallback = callback;
		}
		const buttonRect = $button[0].getBoundingClientRect();
		const windowHeight = window.innerHeight;
		const windowWidth = window.innerWidth;
		const pickerHeight = 400;
		const pickerWidth = 320;
		const $threadPanel = $('#thread-panel, .thread-panel');
		const isInThreadPanel = $threadPanel.length > 0 && $threadPanel.is(':visible') && $button.closest('#thread-panel, .thread-panel').length > 0;
		let top = buttonRect.bottom + 5;
		let left = buttonRect.left - pickerWidth / 2 + buttonRect.width / 2;
		let useBottomPosition = false;
		if (isInThreadPanel) {
			const threadPanelRect = $threadPanel[0].getBoundingClientRect();
			const relativeLeft = buttonRect.left - threadPanelRect.left;
			const relativeTop = buttonRect.top - threadPanelRect.top;
			left = Math.max(10, Math.min(threadPanelRect.left + relativeLeft - pickerWidth / 2, threadPanelRect.right - pickerWidth - 10));
			if (buttonRect.bottom + pickerHeight > threadPanelRect.bottom) {
				useBottomPosition = true;
				top = null;
			} else {
				top = buttonRect.bottom + 5;
			}
		}
		if (top + pickerHeight > windowHeight) {
			useBottomPosition = true;
			top = null;
		}
		if (left < 10) {
			left = 10;
		}
		if (left + pickerWidth > windowWidth - 10) {
			left = windowWidth - pickerWidth - 10;
		}
		if (useBottomPosition) {
			pickerElement.style.top = '';
			pickerElement.style.bottom = '145px';
			pickerElement.classList.add('position-top');
		} else {
			pickerElement.style.bottom = '';
			pickerElement.style.top = `${top}px`;
			pickerElement.classList.remove('position-top');
		}
		pickerElement.style.left = `${left}px`;
		pickerElement.style.zIndex = '10001';
		pickerElement.classList.add('active');
		showEmojiCategory('frequently', emojiData);
	};
	window.LMSChat.emojiPicker = {
		initEmojiPicker,
		showEmojiPicker: initEmojiPicker,
		showPicker,
		addReaction,
		setupEmojiPicker,
		closeEmojiPicker,
	};
	window.showEmojiPicker = (button, callbackOrMessageId, isThreadOrCallback) => {
		if (typeof button === 'string') {
			button = $(button);
		} else if (!(button instanceof jQuery)) {
			button = $(button);
		}
		showPicker(button, callbackOrMessageId, isThreadOrCallback);
	};
	$(document).ready(() => {
		if (!window.LMSChat || !window.LMSChat.utils || !window.LMSChat.utils.validateChatConfig) {
			return;
		}
		if (!window.LMSChat.utils.validateChatConfig()) return;
		setupEmojiPicker();
	});
})(jQuery);
