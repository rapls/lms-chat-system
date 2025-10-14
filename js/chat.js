(function ($) {
	'use strict';
	$(document).ready(function () {
		window.LMSChat = window.LMSChat || {};
		window.LMSChat.thread = window.LMSChat.thread || {};
		window.LMSChat.reactions = window.LMSChat.reactions || {};
		if (!window.LMSChatBadgeController) {
			window.LMSChatBadgeController = {
				isThreadOpening: false,
				lockedUntil: 0,
				originalValues: {},
				lockBadges: function(durationMs = 8000) {
					if (this.startChannelSwitch) {
						this.startChannelSwitch();
					}
				},
				unlockBadges: function() {
					if (this.endChannelSwitch) {
						this.endChannelSwitch();
					}
				},
				isLocked: function() {
					if (this.isChannelSwitching !== undefined) {
						return this.isChannelSwitching || this.isSystemPaused || (Date.now() < this.lockedUntil);
					}
					return this.isThreadOpening || (Date.now() < this.lockedUntil);
				},
				updateWithServerData: function(serverData) {
					if (this.updateWithServerData && this.displayAccurateBadges) {
						this.currentValues = {
							totalUnread: serverData.total_unread || 0,
							channelUnread: serverData.channels || {},
							lastUpdate: Date.now()
						};
						this.displayAccurateBadges();
					}
				}
			};
		} else {
		}
		const basicOpenThread = function(messageId) {
			try {
				const $threadPanel = $('.thread-panel');
				if ($threadPanel.length === 0) {
					return false;
				}
				if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.currentThread == messageId) {
					return true;
				}
				if (window.LMSChat && window.LMSChat.state) {
					window.LMSChat.state.currentThread = messageId;
					window.LMSChat.state.lastThreadMessageId = 0;
				}
				window.LMSChatBadgeController.lockBadges(10000);
				$.ajax({
					url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
					type: 'POST',
					data: {
						action: 'lms_get_unread_count',
						nonce: window.lmsChat?.nonce
					},
					timeout: 3000,
					async: false,
					success: function(response) {
						if (response && response.success && response.data) {
							window.LMSChatBadgeController.updateWithServerData(response.data);
						}
					},
					error: function(xhr, status, error) {
						window.LMSChatBadgeController.unlockBadges();
					}
				});
				$threadPanel.css('display', 'block');
				$threadPanel.css('visibility', 'visible');
				$threadPanel.css('opacity', '1');
				$threadPanel.addClass('show');
				$threadPanel.addClass('open');
				$threadPanel.css('right', '0px');
				const $threadMessages = $threadPanel.find('.thread-messages');
				if ($threadMessages.length) {
					$threadMessages.html('<div class="loading">スレッドを読み込んでいます...</div>');
				}
				const $threadHeader = $threadPanel.find('.thread-header');
				if ($threadHeader.length) {
					$threadHeader.find('.parent-message-id').text(messageId);
				}
				$(document).trigger('thread:opened', [messageId]);
				setTimeout(() => {
					if (window.LMSChat && window.LMSChat.threads && typeof window.LMSChat.threads.loadThreadMessages === 'function') {
						window.LMSChat.threads.loadThreadMessages(messageId);
					} else if (typeof window.loadThreadMessages === 'function') {
						window.loadThreadMessages(messageId);
					} else {
						$.ajax({
							url: window.lmsChat.ajaxUrl,
							type: 'GET',
							data: {
								action: 'lms_get_thread_messages',
								parent_message_id: messageId,
								page: 1,
								nonce: window.lmsChat.nonce,
								_: Date.now()
							},
							timeout: 15000,
							success: function(response) {
								if (response && response.success && response.data && response.data.messages) {
									const $threadMessages = $('.thread-messages');
									$threadMessages.empty();
									if (response.data.messages.length > 0) {
										response.data.messages.forEach(function(message) {
											const messageHtml = `
												<div class="thread-message" data-message-id="${message.id}">
													<div class="thread-message-avatar">
														<img src="${message.avatar_url || '/wp-content/themes/lms/img/default-avatar.png'}" alt="${message.display_name}">
													</div>
													<div class="thread-message-content">
														<div class="thread-message-header">
															<span class="thread-message-user">${message.display_name}</span>
															<span class="thread-message-time">${message.formatted_time || ''}</span>
														</div>
														<div class="thread-message-text">${message.message}</div>
													</div>
												</div>
											`;
											$threadMessages.append(messageHtml);
										});
															if (window.UnifiedScrollManager) {
											window.UnifiedScrollManager.scrollThreadToBottom(0, false);
										} else {
											$threadMessages.scrollTop($threadMessages[0].scrollHeight);
										}
									} else {
										if (!window.LMSChatBadgeController.isLocked()) {
											window.LMSChatBadgeController.lockBadges(5000);
										}
										$.ajax({
											url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
											type: 'POST',
											data: {
												action: 'lms_get_unread_count',
												nonce: window.lmsChat?.nonce
											},
											timeout: 2000,
											async: false,
											success: function(response) {
												if (response && response.success && response.data) {
													window.LMSChatBadgeController.updateWithServerData(response.data);
												}
											},
											error: function(xhr, status, error) {
												window.LMSChatBadgeController.unlockBadges();
											}
										});
										$threadMessages.html('<div class="no-messages">このスレッドにはまだ返信がありません</div>');
									}
								} else {
									$('.thread-messages').html('<div class="no-messages">メッセージの読み込みに失敗しました</div>');
								}
							},
							error: function(xhr, status, error) {
								$('.thread-messages').html('<div class="no-messages">メッセージの読み込みでエラーが発生しました</div>');
							}
						});
					}
				}, 100);
				return true;
			} catch (error) {
				return false;
			}
		};
		window.openThread = function (messageId) {
			if (
				window.LMSChat &&
				window.LMSChat.thread &&
				typeof window.LMSChat.thread.openThread === 'function'
			) {
				return window.LMSChat.thread.openThread(messageId);
			}
			if (typeof window._actualOpenThread === 'function') {
				return window._actualOpenThread(messageId);
			}
			if (
				window.LMSChat &&
				window.LMSChat.threads &&
				typeof window.LMSChat.threads.openThread === 'function'
			) {
				return window.LMSChat.threads.openThread(messageId);
			}
			return basicOpenThread(messageId);
		};
		window.toggleThreadReaction = function (messageId, emoji) {
			if (!messageId || !emoji) {
				return Promise.resolve(false);
			}
			if (window.LMSChat.reactionActions && window.LMSChat.reactionActions.toggleThreadReaction) {
				return window.LMSChat.reactionActions.toggleThreadReaction(messageId, emoji);
			}
			else if (window.LMSChat.reactions && window.LMSChat.reactions.toggleThreadReaction) {
				return window.LMSChat.reactions.toggleThreadReaction(messageId, emoji);
			}
			return Promise.resolve(false);
		};
		window.toggleReaction = function (messageId, emoji) {
			if (!messageId || !emoji) {
				return Promise.resolve(false);
			}
			if (window.LMSChat.reactionActions && window.LMSChat.reactionActions.toggleReaction) {
				return window.LMSChat.reactionActions.toggleReaction(messageId, emoji, false);
			}
			else if (window.LMSChat.reactions && window.LMSChat.reactions.toggleReaction) {
				return window.LMSChat.reactions.toggleReaction(messageId, emoji, false);
			}
			return Promise.resolve(false);
		};
		$(document).on('click', '.thread-info, .thread-reply-count, .thread-count', function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $message = $(this).closest('.chat-message');
			let messageId = $message.data('message-id');
			if (typeof messageId === 'string' && (messageId.startsWith('temp_') || messageId.includes('temp_'))) {
				if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.tempToRealMessageMap) {
					const realMessageId = window.LMSChat.state.tempToRealMessageMap.get(messageId);
					if (realMessageId) {
						messageId = realMessageId;
					} else {
						if (window.LMSChat && window.LMSChat.utils && window.LMSChat.utils.showError) {
							window.LMSChat.utils.showError('メッセージの送信が完了するまでお待ちください');
						}
						return;
					}
				} else {
					if (window.LMSChat && window.LMSChat.utils && window.LMSChat.utils.showError) {
						window.LMSChat.utils.showError('メッセージの送信が完了するまでお待ちください');
					}
					return;
				}
			}
			if (messageId && typeof window.openThread === 'function') {
				window.openThread(messageId);
			} else {
			}
		});
		window.showEmojiPickerForThread = function ($button, messageId) {
			if (window.LMSChat && window.LMSChat.emojiPicker) {
				window.LMSChat.emojiPicker.showPicker($button, function (emoji) {
					if (window.LMSChat.reactions && window.LMSChat.reactions.toggleThreadReaction) {
						window.LMSChat.reactions.toggleThreadReaction(messageId, emoji);
					} else if (typeof window.toggleThreadReaction === 'function') {
						window.toggleThreadReaction(messageId, emoji);
					}
				});
			}
		};
		$(document).on('click', '.thread-button', function (e) {
			e.preventDefault();
			e.stopPropagation();
			let messageId = null;
			const $this = $(this);
			messageId = $this.data('message-id');
			if (!messageId) {
				const $message = $this.closest('.chat-message');
				messageId = $message.data('message-id');
			}
			if (typeof messageId === 'string' && (messageId.startsWith('temp_') || messageId.includes('temp_'))) {
				if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.tempToRealMessageMap) {
					const realMessageId = window.LMSChat.state.tempToRealMessageMap.get(messageId);
					if (realMessageId) {
						messageId = realMessageId;
					} else {
						if (window.LMSChat && window.LMSChat.utils && window.LMSChat.utils.showError) {
							window.LMSChat.utils.showError('メッセージの送信が完了するまでお待ちください');
						}
						return;
					}
				} else {
					if (window.LMSChat && window.LMSChat.utils && window.LMSChat.utils.showError) {
						window.LMSChat.utils.showError('メッセージの送信が完了するまでお待ちください');
					}
					return;
				}
			}
			if (messageId) {
				if (typeof window.openThread === 'function') {
					window.openThread(messageId);
				} else {
					openThreadDirectly(messageId);
				}
			}
		});
		$(document).on('click', function(e) {
			const $threadPanel = $('.thread-panel');
			if ($threadPanel.length && $threadPanel.hasClass('show')) {
				if (!$(e.target).closest('.thread-panel').length && 
					!$(e.target).closest('.thread-info, .thread-reply-count, .thread-count, .thread-button').length) {
					window.forceCloseThread();
				}
			}
		});
		$(document).on('keydown', function(e) {
			if (e.keyCode === 27) {
				const $threadPanel = $('.thread-panel');
				if ($threadPanel.length && $threadPanel.hasClass('show')) {
					window.forceCloseThread();
				}
			}
		});
		function openThreadDirectly(messageId) {
			const $threadPanel = $('.thread-panel');
			if (!$threadPanel.length) {
				return;
			}
			$threadPanel.removeClass('hide').addClass('show open');
			$threadPanel.css({
				'display': 'block',
				'visibility': 'visible',
				'opacity': '1',
				'right': '0px',
				'transform': 'translateX(0)'
			});
			const $threadHeader = $threadPanel.find('.thread-header');
			if ($threadHeader.length) {
				$threadHeader.find('.parent-message-id').text(messageId);
			}
			const $threadMessages = $('.thread-messages');
			if ($threadMessages.length) {
				$threadMessages.html('<div class="loading">読み込み中...</div>');
			}
			if (window.LMSChat && window.LMSChat.state) {
				window.LMSChat.state.currentThread = messageId;
			}
			$(document).trigger('thread:opened', [messageId]);
			loadThreadMessagesAjax(messageId);
		}
		function loadThreadMessagesAjax(messageId) {
			if (!window.lmsChat || !window.lmsChat.ajaxUrl) {
				$('.thread-messages').html('<div class="error">設定エラー</div>');
				return;
			}
			$.ajax({
				url: window.lmsChat.ajaxUrl,
				type: 'POST',
				dataType: 'json',
				data: {
					action: 'lms_get_thread_messages',
					parent_message_id: messageId,
					page: 1,
					nonce: window.lmsChat.nonce
				},
				timeout: 20000,
				success: function(response) {
					displayThreadMessages(response);
				},
				error: function(xhr, status, error) {
					$('.thread-messages').html('<div class="error">読み込みエラー<br><button onclick="loadThreadMessagesAjax(' + messageId + ')">再試行</button></div>');
				}
			});
		}
		function displayThreadMessages(response) {
			const $threadMessages = $('.thread-messages');
			if (response && response.success && response.data && response.data.messages) {
				const messages = response.data.messages;
				$threadMessages.empty();
				if (messages.length > 0) {
					messages.forEach(msg => {
						const canRenderReactions =
							msg.reactions &&
							msg.reactions.length > 0 &&
							window.LMSChat &&
							window.LMSChat.reactions &&
							typeof window.LMSChat.reactions.createReactionsHtml === 'function';
						let reactionsHtml = '';
						if (canRenderReactions) {
							try {
								reactionsHtml = window.LMSChat.reactions.createReactionsHtml(msg.reactions) || '';
								if (reactionsHtml && !reactionsHtml.includes('data-reactions-hydrated')) {
									reactionsHtml = reactionsHtml.replace(
										/<div class="message-reactions([^>]*)>/,
										'<div class="message-reactions$1" data-reactions-hydrated="1">'
									);
								}
							} catch (error) {
								reactionsHtml = '';
							}
						}
						if (!reactionsHtml) {
							reactionsHtml = '<div class="message-reactions" data-reactions-hydrated="0"></div>';
						}
						const html = `
							<div class="thread-message" data-message-id="${msg.id || ''}">
								<div class="thread-message-avatar">
									<img src="${msg.avatar_url || '/wp-content/themes/lms/img/default-avatar.png'}" alt="">
								</div>
								<div class="thread-message-content">
									<div class="thread-message-header">
										<span class="thread-message-user">${msg.display_name || 'ユーザー'}</span>
										<span class="thread-message-time">${msg.formatted_time || ''}</span>
									</div>
									<div class="thread-message-text">${msg.message || ''}</div>
								</div>
								${reactionsHtml}
								<div class="message-actions">
									<button class="add-reaction" title="リアクションを追加">😀</button>
									<button class="delete-thread-message" title="削除">🗑️</button>
								</div>
							</div>
						`;
						$threadMessages.append(html);
					});
					if (window.UnifiedScrollManager) {
						window.UnifiedScrollManager.scrollThreadToBottom(0, false);
					} else {
						$threadMessages.scrollTop($threadMessages[0].scrollHeight);
					}
				} else {
					if (!window.LMSChatBadgeController.isLocked()) {
						window.LMSChatBadgeController.lockBadges(5000);
					}
					$.ajax({
						url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
						type: 'POST',
						data: {
							action: 'lms_get_unread_count',
							nonce: window.lmsChat?.nonce
						},
						timeout: 2000,
						async: false,
						success: function(response) {
							if (response && response.success && response.data) {
								window.LMSChatBadgeController.updateWithServerData(response.data);
							}
						},
						error: function(xhr, status, error) {
							window.LMSChatBadgeController.unlockBadges();
						}
					});
					$threadMessages.html('<div class="no-messages">このスレッドにはまだ返信がありません</div>');
				}
			} else {
				$threadMessages.html('<div class="error">データの取得に失敗しました</div>');
			}
		}
		function closeThread() {
			if (window.LMSChat?.threads && typeof window.LMSChat.threads.closeThread === 'function') {
				const result = window.LMSChat.threads.closeThread();
				if (window.LMSChatBadgeController) {
					window.LMSChatBadgeController.unlockBadges();
				}
				return typeof result === 'undefined' ? true : result;
			}

			const $threadPanel = $('.thread-panel');

			if ($threadPanel.length && ($threadPanel.hasClass('show') || $threadPanel.hasClass('open') || $threadPanel.is(':visible'))) {
				$threadPanel.removeClass('show open closing');
				$threadPanel.removeAttr('data-current-thread-id');
				$threadPanel.css({
					'right': '',
					'opacity': '',
					'visibility': '',
					'transform': '',
					'display': ''
				});
				$('body').removeClass('thread-open');
				if (window.LMSChat?.state) {
					window.LMSChat.state.currentThread = null;
					window.LMSChat.state.lastThreadMessageId = 0;
				}
				if (window.LMSChatBadgeController) {
					window.LMSChatBadgeController.unlockBadges();
				}
				$(document).trigger('thread:closed');
				return true;
			}
			return false;
		}
		window.openThreadDirectly = openThreadDirectly;
		window.loadThreadMessagesAjax = loadThreadMessagesAjax;
		window.closeThread = closeThread;
	});
})(jQuery);
