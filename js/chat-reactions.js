(function ($) {
	'use strict';
	window.LMSChat = window.LMSChat || {};
	const state = window.LMSChat.state = window.LMSChat.state || {};
	const utils = window.LMSChat.utils = window.LMSChat.utils || {};

	// Ajax設定動的取得（FIXED DELETE成功パターン）
	const getAjaxConfig = function() {
		if (window.lmsAjax) return window.lmsAjax;
		if (window.ajaxurl) {
			return {
				ajaxurl: window.ajaxurl,
				nonce: window.lms_nonce || '',
				user_id: window.lms_user_id || '2'
			};
		}
		if (window.wp && window.wp.ajax) {
			return {
				ajaxurl: window.wp.ajax.url,
				nonce: window.wp.ajax.nonce || '',
				user_id: '2'
			};
		}
		return {
			ajaxurl: '/wp-admin/admin-ajax.php',
			nonce: '',
			user_id: '2'
		};
	};
	if (!window.LMSChat.globalReactionLock) {
		window.LMSChat.globalReactionLock = new Map();
	}
	
	// Ultimate Reaction Fix統合: 処理中ロック（3秒間の重複防止）
	if (!window.LMSChat.ultimateProcessingLock) {
		window.LMSChat.ultimateProcessingLock = new Set();
	}
	if (!state.processingReactions) {
		state.processingReactions = new Set();
	}
	if (!state.lastReactionUpdate) {
		state.lastReactionUpdate = new Map();
	}
	if (!state.lastClickTime) {
		state.lastClickTime = new Map();
	}
	const REACTION_DEBUG = false;
	const EVENT_NS = '.lmsChatReactions';
	const ensureMessageIdString = (value) => {
		if (value === undefined || value === null || value === '') {
			return null;
		}
		return String(value);
	};
	const findThreadMessageElement = (messageId) => {
		const idString = ensureMessageIdString(messageId);
		if (!idString) {
			return $();
		}
		const selectors = [
			`#thread-messages .chat-message[data-message-id="${idString}"]`,
			`.thread-message[data-message-id="${idString}"]`,
		];
		for (const selector of selectors) {
			const $candidate = $(selector);
			if ($candidate.length) {
				return $candidate.first();
			}
		}
		return $();
	};
	// 確実な削除処理（FIXED DELETE成功パターン）
	const directReactionRemoval = function(messageId, emoji) {
		const idString = ensureMessageIdString(messageId);
		const selectors = [
			`#thread-messages .chat-message[data-message-id="${idString}"] .reaction-item[data-emoji="${emoji}"]`,
			`[data-message-id="${idString}"] .reaction-item[data-emoji="${emoji}"]`,
			`.chat-message[data-message-id="${idString}"] .message-reactions .reaction-item[data-emoji="${emoji}"]`
		];

		let deleted = false;
		selectors.forEach(selector => {
			const elements = document.querySelectorAll(selector);
			elements.forEach(el => {
				if (el.classList.contains('user-reacted')) {
					el.remove();
					deleted = true;
				}
			});
		});

		// 空コンテナ削除
		if (deleted) {
			const containers = document.querySelectorAll(`[data-message-id="${idString}"] .message-reactions`);
			containers.forEach(container => {
				if (container.children.length === 0) {
					container.remove();
				}
			});
		}
		return deleted;
	};

	const resolveReactionContext = ($target) => {
		if (!$target || !$target.length) {
			return { messageId: null, isThread: false, $message: $() };
		}
		let messageId = ensureMessageIdString($target.data('message-id'));
		if (!messageId) {
			messageId = ensureMessageIdString($target.attr('data-message-id'));
		}
		const candidateElements = [
			$target.closest('.thread-message[data-message-id]'),
			$target.closest('#thread-messages .chat-message[data-message-id]'),
			$target.closest('.parent-message[data-message-id]'),
			$target.closest('.chat-message[data-message-id]'),
		];
		let $message = $();
		for (const $candidate of candidateElements) {
			if ($candidate && $candidate.length) {
				$message = $candidate;
				break;
			}
		}
		if (!$message.length && messageId) {
			const selector = `[data-message-id="${messageId}"]`;
			$message = $(`#thread-messages .chat-message${selector}`).first();
			if (!$message.length) {
				$message = $(`.thread-message${selector}`).first();
			}
			if (!$message.length) {
				$message = $(`.chat-message${selector}`).first();
			}
			if (!$message.length) {
				$message = $(`.parent-message${selector}`).first();
			}
		}
		if ($message.length && !messageId) {
			messageId = ensureMessageIdString($message.data('message-id'));
			if (!messageId) {
				messageId = ensureMessageIdString($message.attr('data-message-id'));
			}
		}
		const withinParentMessage = $target.closest('.parent-message, .parent-message-reactions').length > 0;
		if (!messageId && withinParentMessage && state.currentThread) {
			messageId = ensureMessageIdString(state.currentThread);
		}
		const isThread = Boolean(
			($message.length && ($message.hasClass('thread-message') || $message.closest('#thread-messages').length > 0)) && !withinParentMessage
		);
		return {
			messageId: messageId || null,
			isThread,
			$message: $message.length ? $message : $(),
		};
	};
	window.LMSChat.preventDuplicateReaction = (messageId, emoji, source) => {
		const lockKey = `${messageId}-${emoji}`;
		const now = Date.now();
		const lastExecution = window.LMSChat.globalReactionLock.get(lockKey) || 0;
		if (now - lastExecution < 1000) {
			return true;
		}
		window.LMSChat.globalReactionLock.set(lockKey, now);
		return false;
	};
	const init = () => {
		if (window.LMSChat.reactionCore && window.LMSChat.reactionCore.state) {
			window.LMSChat.reactionCore.state.debug = REACTION_DEBUG;
		}
		const modules = [
			'reactionCore',
			'reactionUI',
			'reactionActions',
			'reactionSync',
			'reactionCache',
		];
		const missingModules = modules.filter((module) => !window.LMSChat[module]);
		if (missingModules.length > 0) {
			missingModules.forEach((module) => {
				if (!window.LMSChat[module]) {
					window.LMSChat[module] = {
						toggleReaction: function (messageId, emoji, isThread) {
							return Promise.resolve(false);
						},
						toggleThreadReaction: function (messageId, emoji) {
							return Promise.resolve(false);
						},
					};
				}
			});
		}
		migrateBackwardCompatibility();
	};
	const migrateBackwardCompatibility = () => {
		window.LMSChat.reactions = window.LMSChat.reactions || {};
		window.LMSChat.reactions.createReactionsHtml = createReactionsHtml;
		if (window.LMSChat.reactionActions) {
			window.LMSChat.toggleReaction = window.LMSChat.reactionActions.toggleReaction;
			window.LMSChat.toggleThreadReaction = window.LMSChat.reactionActions.toggleThreadReaction;
			window.LMSChat.reactions.toggleReaction = window.LMSChat.reactionActions.toggleReaction;
			window.LMSChat.reactions.toggleThreadReaction =
				window.LMSChat.reactionActions.toggleThreadReaction;
		}
		if (window.LMSChat.reactionUI) {
			window.LMSChat.updateMessageReactions = window.LMSChat.reactionUI.updateMessageReactions;
			window.LMSChat.updateThreadMessageReactions =
				window.LMSChat.reactionUI.updateThreadMessageReactions;
			window.LMSChat.reactions.updateMessageReactions =
				window.LMSChat.reactionUI.updateMessageReactions;
			window.LMSChat.reactions.updateThreadMessageReactions =
				window.LMSChat.reactionUI.updateThreadMessageReactions;
		}
		if (typeof window.toggleReaction === 'undefined' && window.LMSChat.reactionActions) {
			window.toggleReaction = window.LMSChat.reactionActions.toggleReaction;
		}
		if (typeof window.toggleThreadReaction === 'undefined' && window.LMSChat.reactionActions) {
			window.toggleThreadReaction = window.LMSChat.reactionActions.toggleThreadReaction;
		}
		if (window.LMSChat.reactionCache) {
			window.LMSChat.reactions.getReactionsCache = window.LMSChat.reactionCache.getReactionsCache;
			window.LMSChat.reactions.getThreadReactionsCache =
				window.LMSChat.reactionCache.getThreadReactionsCache;
			window.LMSChat.reactions.setReactionsCache = window.LMSChat.reactionCache.setReactionsCache;
			window.LMSChat.reactions.setThreadReactionsCache =
				window.LMSChat.reactionCache.setThreadReactionsCache;
			if (!window.LMSChat.cache) {
				window.LMSChat.cache = {};
			}
			window.LMSChat.cache.getReactionsCache = window.LMSChat.reactionCache.getReactionsCache;
			window.LMSChat.cache.getThreadReactionsCache =
				window.LMSChat.reactionCache.getThreadReactionsCache;
			window.LMSChat.cache.setReactionsCache = window.LMSChat.reactionCache.setReactionsCache;
			window.LMSChat.cache.setThreadReactionsCache =
				window.LMSChat.reactionCache.setThreadReactionsCache;
			window.LMSChat.cache.clearReactionsCache = window.LMSChat.reactionCache.clearReactionsCache;
			window.LMSChat.cache.clearThreadReactionsCache =
				window.LMSChat.reactionCache.clearThreadReactionsCache;
			window.LMSChat.cache.clearAllReactionsCache =
				window.LMSChat.reactionCache.clearAllReactionsCache;
		}
		else if (window.LMSChat.cache) {
			if (!window.LMSChat.reactionCache) {
				window.LMSChat.reactionCache = {};
			}
			if (window.LMSChat.cache.getReactionsCache) {
				window.LMSChat.reactionCache.getReactionsCache = window.LMSChat.cache.getReactionsCache;
			}
			if (window.LMSChat.cache.getThreadReactionsCache) {
				window.LMSChat.reactionCache.getThreadReactionsCache =
					window.LMSChat.cache.getThreadReactionsCache;
			}
			if (window.LMSChat.cache.setReactionsCache) {
				window.LMSChat.reactionCache.setReactionsCache = window.LMSChat.cache.setReactionsCache;
			}
			if (window.LMSChat.cache.setThreadReactionsCache) {
				window.LMSChat.reactionCache.setThreadReactionsCache =
					window.LMSChat.cache.setThreadReactionsCache;
			}
		}
		if (window.LMSChat.reactionSync) {
			window.LMSChat.reactions.isReactionProcessing =
				window.LMSChat.reactionSync.isReactionProcessing;
			window.LMSChat.reactions.markReactionProcessing =
				window.LMSChat.reactionSync.markReactionProcessing;
			window.LMSChat.reactions.clearReactionProcessing =
				window.LMSChat.reactionSync.clearReactionProcessing;
			window.LMSChat.reactions.pollReactions = () => {
				if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.pollReactions) {
					return window.LMSChat.reactionSync.pollReactions();
				}
				return false;
			};
			window.LMSChat.reactions.pollThreadReactions = () => {
				if (window.LMSChat.reactionSync && window.LMSChat.reactionSync.pollThreadReactions) {
					return window.LMSChat.reactionSync.pollThreadReactions();
				}
				return false;
			};
		}
	};
	const formatUserNames = (users, maxDisplayUsers = 3) => {
		if (users.length <= maxDisplayUsers) {
			return users.join(', ');
		}
		const displayedUsers = users.slice(0, maxDisplayUsers);
		const remainingCount = users.length - maxDisplayUsers;
		return `${displayedUsers.join(', ')} +${remainingCount}`;
	};
	const createReactionsHtml = (reactions) => {
		// Creating reactions HTML

		if (!reactions || reactions.length === 0) {
			// No reactions, returning empty
			return '';
		}

		const groupedReactions = {};
		reactions.forEach((reaction, index) => {
			// Processing reaction
			const emoji = reaction.reaction || reaction.emoji;

			if (!emoji) {
				// Missing emoji, skipping
				return;
			}

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

		// Reactions grouped

		let html = '<div class="message-reactions" data-reactions-hydrated="1">';
		let itemCount = 0;

		Object.values(groupedReactions).forEach((group) => {
			// Processing group

			if (!group.count || group.count <= 0) {
				// No count, skipping
				return;
			}

			const formattedUserNames = formatUserNames(group.users);
			const currentUserId = parseInt(lmsChat.currentUserId);
			const userReacted = group.userIds.includes(currentUserId);
			const userReactedClass = userReacted ? 'user-reacted' : '';

			const itemHtml = `<div class="reaction-item ${userReactedClass}" data-emoji="${group.emoji}" data-users="${formattedUserNames}" data-user-ids="${group.userIds.join(',')}">
                <span class="emoji">${group.emoji}</span>
                <span class="count">${group.count}</span>
            </div>`;

			html += itemHtml;
			itemCount++;

			// Item added
		});

		html += '</div>';

		// Final HTML generated

		return html;
	};
	const syncReactionCaches = (messageId, reactions, isThread = false) => {
		if (!window.LMSChat || !messageId) {
			return;
		}
		const hasReactions = Array.isArray(reactions) && reactions.length > 0;
		if (window.LMSChat.reactionCache) {
			if (isThread) {
				if (hasReactions && window.LMSChat.reactionCache.setThreadReactionsCache) {
					window.LMSChat.reactionCache.setThreadReactionsCache(messageId, reactions);
				} else if (!hasReactions && window.LMSChat.reactionCache.clearThreadReactionsCache) {
					window.LMSChat.reactionCache.clearThreadReactionsCache(messageId);
				}
			} else {
				if (hasReactions && window.LMSChat.reactionCache.setReactionsCache) {
					window.LMSChat.reactionCache.setReactionsCache(messageId, reactions);
				} else if (!hasReactions && window.LMSChat.reactionCache.clearReactionsCache) {
					window.LMSChat.reactionCache.clearReactionsCache(messageId);
				}
			}
		}
		if (window.LMSChat.cache) {
			if (isThread) {
				if (hasReactions && window.LMSChat.cache.setThreadReactionsCache) {
					window.LMSChat.cache.setThreadReactionsCache(messageId, reactions);
				} else if (!hasReactions && window.LMSChat.cache.threadReactions instanceof Map) {
					window.LMSChat.cache.threadReactions.delete(messageId);
				}
			} else {
				if (hasReactions && window.LMSChat.cache.setReactionsCache) {
					window.LMSChat.cache.setReactionsCache(messageId, reactions);
				} else if (!hasReactions && window.LMSChat.cache.reactions instanceof Map) {
					window.LMSChat.cache.reactions.delete(messageId);
				}
			}
		}
	};
	const toggleReaction = async (messageId, emoji, isThread = false) => {
		try {
			if (window.LMSChat.preventDuplicateReaction(messageId, emoji, 'MAIN-REACTIONS')) {
				return false;
			}
			const requestKey = `${messageId}-${emoji}`;
			if (state.processingReactions.has(requestKey)) {
				return false;
			}
			const $threadMessage = findThreadMessageElement(messageId);
			if ($threadMessage.length > 0) {
				isThread = true;
			}
			if (isThread) {
				return await toggleThreadReaction(messageId, emoji);
			}
			if (!lmsChat.currentUserId) {
				utils.showError('ユーザーIDが設定されていません。ログインしてください。');
				return false;
			}
			state.processingReactions.add(requestKey);
			$('.reaction-tooltip').remove();
			let $message;
			if (state.currentThread && String(messageId) === String(state.currentThread)) {
				$message = $('.parent-message-reactions');
				if ($message.length === 0) {
					$message = $('.parent-message');
				}
			} else {
				$message = $(`.chat-message[data-message-id="${messageId}"]`);
			}
			const $existingReaction = $message.find(`.reaction-item[data-emoji="${emoji}"]`);
			const hasExistingReaction = $existingReaction.length > 0;
			const isUserReacted = hasExistingReaction && $existingReaction.hasClass('user-reacted');
			const isRemoving = isUserReacted;
			const data = {
				action: 'lms_toggle_reaction',
				message_id: messageId,
				emoji: emoji,
				nonce: lmsChat.nonce,
				user_id: lmsChat.currentUserId,
			};
			const response = await $.ajax({
				url: lmsChat.ajaxUrl,
				type: 'POST',
				data: data,
				timeout: 15000,
				cache: false,
			});
			if (response.success) {
				if (response.data !== null && response.data !== undefined) {
					if (state.currentThread && String(messageId) === String(state.currentThread)) {
						updateMessageReactions(messageId, response.data, true);
						updateParentMessageReactions(response.data);
					} else {
						updateMessageReactions(messageId, response.data, true);
					}
					const eventName = isRemoving ? 'reaction:removed' : 'reaction:added';
					$(document).trigger(eventName, {
						messageId: messageId,
						reaction: emoji,
						userId: window.lmsChat.currentUserId,
					});
					state.lastReactionUpdate.set(messageId, Date.now());
					state.processingReactions.delete(requestKey);
					return true;
				}
				return false;
			} else {
				state.processingReactions.delete(requestKey);
				utils.showError(response.data || 'リアクションの更新に失敗しました');
				return false;
			}
		} catch (error) {
			state.processingReactions.delete(requestKey);
			utils.showError('リアクションの処理中にエラーが発生しました');
			return false;
		}
	};
	const toggleThreadReaction = async (messageId, emoji) => {
		// Thread reaction operation started

		if (!messageId || !emoji) {
			return false;
		}
		if (window.LMSChat.preventDuplicateReaction(messageId, emoji)) {
			return false;
		}
		const requestKey = `thread-${messageId}-${emoji}`;
		if (state.processingReactions.has(requestKey)) {
			return false;
		}

		// Ajax設定を動的取得（FIXED DELETE成功パターン）
		const ajaxConfig = getAjaxConfig();
		if (!ajaxConfig.ajaxurl) {
			if (utils.showError) {
				utils.showError('Ajax URLが取得できません。');
			}
			return false;
		}

		state.processingReactions.add(requestKey);
		const releaseProcessing = () => state.processingReactions.delete(requestKey);
		const cleanupTimer = setTimeout(releaseProcessing, 15000);

		try {
			$('.reaction-tooltip').remove();
			const $message = findThreadMessageElement(messageId);
			const $existingReaction = $message.find(`.reaction-item[data-emoji="${emoji}"]`).first();
			const isUserReacted = $existingReaction.length > 0 && $existingReaction.hasClass('user-reacted');

			const action = isUserReacted ? 'DELETE' : 'ADD'; // 🔥 action変数を明示的に定義

			// Reaction operation details

			// 削除の場合は即座にDOM削除（FIXED DELETE成功パターン）
			if (isUserReacted) {
				directReactionRemoval(messageId, emoji);
			}

			// Ajax呼び出し前のデバッグ情報（開発環境のみ）
			if (window.lmsAjax && window.lmsAjax.wpDebug) {
			}

			const response = await $.ajax({
				url: ajaxConfig.ajaxurl,
				type: 'POST',
				data: {
					action: 'lms_toggle_thread_reaction',
					message_id: messageId,
					emoji: emoji,
					nonce: ajaxConfig.nonce,
					user_id: ajaxConfig.user_id,
					is_removing: isUserReacted ? '1' : '0',
				},
				timeout: 15000,
				cache: false,
			});

			clearTimeout(cleanupTimer);
			releaseProcessing();

			// Server response received

			if (!response || !response.success) {
				if (utils.showError) {
					utils.showError((response && response.data) || 'リアクションの更新に失敗しました');
				}
				// DOM削除が失敗した場合はリロード
				if (isUserReacted) {
					location.reload();
				}
				return false;
			}

			// 追加の場合のみDOM更新（削除は既に完了）
			if (!isUserReacted) {
				const reactions = response.data && response.data.reactions ? response.data.reactions : (response.data || []);
				updateThreadMessageReactions(messageId, reactions, true);
			}

			state.lastReactionUpdate.set(messageId, Date.now());

			const eventName = isUserReacted ? 'reaction:removed' : 'reaction:added';
			$(document).trigger(eventName, {
				messageId,
				reaction: emoji,
				userId: ajaxConfig.user_id,
				isThread: true,
			});

			// Local processing completed, waiting for sync

			// 🔥 削除操作の場合は即座に他ユーザーに通知（特別処理）
			if (action === 'DELETE') {
				// Immediate sync for delete operation
				setTimeout(() => {
					// 削除操作専用の即座同期
					const threadId = window.LMSChat?.state?.currentThread || new URLSearchParams(window.location.search).get('thread');
					if (threadId) {
						$(document).trigger('lms_thread_reaction_deleted', {
							threadId: threadId,
							messageId: messageId,
							emoji: emoji,
							timestamp: Date.now()
						});
					}
				}, 200); // 200ms後に即座実行
			}

			// 🔥 新しい独立同期システムに即座通知
			if (window.ThreadReactionSync && window.ThreadReactionSync.pollReactions) {
				// Immediate polling request to independent sync system
				setTimeout(() => {
					window.ThreadReactionSync.pollReactions();
				}, 200); // 200ms後に実行（高速化）
			} else {
				// Independent sync system not found, using fallback
				// フォールバック: 手動でサーバーをポーリング
				setTimeout(() => {
					// 🔥 即座同期のためポーリング制限を一時的に解除
					if (window.LMSChatReactionFallbackSync) {
						window.LMSChatReactionFallbackSync.lastPollTime = 0;
						window.LMSChatReactionFallbackSync.pollReactions();
					}

					// 🔥 削除操作の場合はより積極的な即座同期
					if (action === 'DELETE') {
						// Additional sync for delete operation
						setTimeout(() => {
							if (window.LMSChatReactionFallbackSync) {
								window.LMSChatReactionFallbackSync.lastPollTime = 0;
								window.LMSChatReactionFallbackSync.pollReactions();
							}
						}, 1000); // 1秒後にもう一度実行

						setTimeout(() => {
							if (window.LMSChatReactionFallbackSync) {
								window.LMSChatReactionFallbackSync.lastPollTime = 0;
								window.LMSChatReactionFallbackSync.pollReactions();
							}
						}, 2000); // 2秒後にもう一度実行
					}

					window.LMSChatReactionFallbackSync = window.LMSChatReactionFallbackSync || {
						isPolling: false,
						pollReactions: function() {
							// 重複実行防止
							if (this.isPolling) {
								return;
							}
							this.isPolling = true;
							
							// 実行完了後にフラグを解除
							const resetFlag = () => {
								this.isPolling = false;
							};
							
							// 5秒後に強制解除
							setTimeout(resetFlag, 5000);
							const threadId = window.LMSChat?.state?.currentThread || new URLSearchParams(window.location.search).get('thread');
							if (!threadId) return;

							// Fallback sync execution
							$.ajax({
								url: window.lms_ajax_obj?.ajax_url || '/wp-admin/admin-ajax.php',
								type: 'POST',
								data: {
									action: 'lms_get_thread_reaction_updates',
									thread_id: threadId,
									last_timestamp: 0,
									nonce: window.lms_ajax_obj?.nonce || window.lmsAjax?.nonce || window.lms_nonce || ''
								},
								success: function(response) {
									// Fallback sync result received

									// 🔥 CRITICAL FIX: 取得したデータをUIに反映
									if (response.success && response.data && response.data.length > 0) {
										// Starting UI update with fallback sync data

										response.data.forEach((update, index) => {
											// Processing individual update

											// Method 1: ThreadReactionUnified
											if (window.LMSChat?.threadReactionUnified?.updateReactions) {
												window.LMSChat.threadReactionUnified.updateReactions(update.message_id, update.reactions, {
													source: 'fallback_sync',
													serverTimestamp: update.timestamp
												});
												// UI update completed via ThreadReactionUnified
											}
											// Method 2: reactionUI (フォールバック)
											else if (window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
												window.LMSChat.reactionUI.updateThreadMessageReactions(update.message_id, update.reactions, true, true);
												// UI update completed via reactionUI
											}
											// Method 3: 直接DOM操作 (最終手段)
											else {
												// Direct DOM operation for UI update (ドリフト防止版)
												const $message = $(`.chat-message[data-message-id="${update.message_id}"]`);
												if ($message.length > 0) {
													// ドリフト防止: 既存要素の確認を厳密化
													let $reactionsContainer = $message.find('.message-reactions');
													
													// 重複要素をクリーンアップ
													if ($reactionsContainer.length > 1) {
														$reactionsContainer.slice(1).remove();
														$reactionsContainer = $reactionsContainer.first();
													}
													
													// ドリフト防止: レイアウト測定
													const beforeRect = $message[0].getBoundingClientRect();
													
													if ($reactionsContainer.length === 0) {
														// DocumentFragment使用でリフロー削減
														const fragment = document.createDocumentFragment();
														const reactionsDiv = document.createElement('div');
														reactionsDiv.className = 'message-reactions';
														fragment.appendChild(reactionsDiv);
														$message[0].appendChild(fragment);
														$reactionsContainer = $message.find('.message-reactions');
													}

													// 安全な内容更新
													if (update.reactions && update.reactions.length > 0) {
														const reactionsHtml = createReactionsHtml(update.reactions);
														if (reactionsHtml && $reactionsContainer.length > 0) {
															const tempDiv = document.createElement('div');
															tempDiv.innerHTML = reactionsHtml;
															const newReactionsElement = tempDiv.firstChild;
															
															if (newReactionsElement && newReactionsElement.classList.contains('message-reactions')) {
																$reactionsContainer[0].parentNode.replaceChild(newReactionsElement, $reactionsContainer[0]);
															}
														}
													} else {
														$reactionsContainer.empty();
													}

													// ドリフト検出と補正
													const afterRect = $message[0].getBoundingClientRect();
													const heightDiff = afterRect.height - beforeRect.height;
													const topDiff = afterRect.top - beforeRect.top;
													
													if (Math.abs(heightDiff) > 2 || Math.abs(topDiff) > 2) {
														if (window.ThreadDriftGuard?.performCorrection) {
															window.ThreadDriftGuard.performCorrection({
																messageId: update.message_id,
																source: 'chat_reactions_fallback',
																heightDrift: heightDiff,
																topDrift: topDiff
															});
														}
													}
													
													// Direct DOM operation completed
												}
											}
										});
									}
								},
								error: (xhr, status, error) => {
									// Ajax失敗時にフラグをリセット
									this.isPolling = false;
								},
								complete: () => {
									// Ajax完了時にフラグをリセット（成功・失敗共通）
									this.isPolling = false;
								}
				});
			}
		};
		window.LMSChatReactionFallbackSync.pollReactions();
				}, 500);
			}

			return true;
		} catch (error) {
			clearTimeout(cleanupTimer);
			releaseProcessing();

			// 詳細なエラー情報を出力
			if (error && error.readyState === 0) {
			}

			if (utils.showError) {
				utils.showError('リアクションの処理中にエラーが発生しました');
			}
			return false;
		}
	};
	const showReactionPicker = ($button, callback) => {
		if (window.showEmojiPicker) {
			window.showEmojiPicker($button, callback);
		}
	};
	const updateMessageReactions = (messageId, reactions, forceUpdate = false, skipAnimation = false) => {
		if (!forceUpdate && state.processingReactions && reactions) {
			let hasProcessingReactions = false;
			for (const reaction of reactions) {
				const requestKey = `${messageId}-${reaction.reaction}`;
				if (state.processingReactions.has(requestKey)) {
					hasProcessingReactions = true;
					break;
				}
			}
			if (hasProcessingReactions) {
				return;
			}
		}
		const lastUpdate = state.lastReactionUpdate.get(messageId);
		if (!forceUpdate && lastUpdate && (Date.now() - lastUpdate < 2000)) {
			return;
		}
		const $message = $(`.chat-message[data-message-id="${messageId}"]`);
		if ($message.length) {
			$message.find('.message-reactions .reaction-item').removeClass('processing');
			
			// 既存コンテナを適切に処理して新しいリアクションを表示
			const $existingReactions = $message.find('.message-reactions');
			
			if (!reactions || reactions.length === 0) {
				// リアクションがない場合は既存コンテナを削除
				$existingReactions.remove();
				syncReactionCaches(messageId, []);
				return;
			}
			
			const reactionsHtml = createReactionsHtml(reactions);
			
			if ($existingReactions.length > 0) {
				// 既存コンテナがある場合は内容を置換
				$existingReactions.replaceWith(reactionsHtml);
			} else {
				// 既存コンテナがない場合は新規作成
				const $threadInfo = $message.find('.thread-info');
				if ($threadInfo.length) {
					$threadInfo.before(reactionsHtml);
				} else {
					$message.find('.message-content').after(reactionsHtml);
				}
			}
		}
		syncReactionCaches(messageId, reactions);
		if (state.currentThread && String(messageId) === String(state.currentThread)) {
			const $parentMessageReactions = $('.parent-message-reactions');
			$parentMessageReactions.find('.reaction-item').removeClass('processing');
			$parentMessageReactions.remove();
			if (!reactions || !reactions.length) {
				syncReactionCaches(messageId, [], true);
				$('.parent-message').addClass('no-reactions');
				return;
			}
			const reactionsHtml = createReactionsHtml(reactions);
			$('.parent-message').after(`<div class="parent-message-reactions">${reactionsHtml}</div>`);
			$('.parent-message').removeClass('no-reactions');
			syncReactionCaches(messageId, reactions, true);
		}
	};
	const updateThreadMessageReactions = (messageId, reactions, forceUpdate = false) => {
		if (!messageId) {
			return;
		}
		if (!forceUpdate && state.processingReactions) {
			let hasProcessingReactions = false;
			if (reactions) {
				for (const reaction of reactions) {
					const requestKey = `thread-${messageId}-${reaction.reaction}`;
					if (state.processingReactions.has(requestKey)) {
						hasProcessingReactions = true;
						break;
					}
				}
			}
			if (hasProcessingReactions) {
				return;
			}
		}
		const lastUpdate = state.lastReactionUpdate.get(messageId);
		if (!forceUpdate && lastUpdate && (Date.now() - lastUpdate < 3000)) {
			return;
		}
		const $message = findThreadMessageElement(messageId);
		if (!$message.length) {
			return;
		}
		$message.find('.message-reactions .reaction-item').removeClass('processing');
		const $existingReactions = $message.find('.message-reactions');
		if (!reactions || !reactions.length) {
			$existingReactions.remove();
			syncReactionCaches(messageId, [], true);
			state.lastReactionUpdate.set(messageId, Date.now());
			return;
		}
		const reactionsHtml = createReactionsHtml(reactions);
		if ($existingReactions.length) {
			$existingReactions.replaceWith(reactionsHtml);
		} else {
			const $messageContent = $message.find('.message-content');
			if ($messageContent.length) {
				$messageContent.after(reactionsHtml);
			} else {
				$message.append(reactionsHtml);
			}
		}
		syncReactionCaches(messageId, reactions, true);
		state.lastReactionUpdate.set(messageId, Date.now());

		// 🔥 即座に空要素をチェック（遅延なし）
		const cleanupEmptyReactions = () => {
			const $messageElement = findThreadMessageElement(messageId);
			if (!$messageElement.length) {
				return;
			}
			const $container = $messageElement.find('.message-reactions');
			$container.find('.reaction-item').each(function () {
				const $item = $(this);
				const $countElement = $item.find('.count');
				const countText = $countElement.text().trim();
				const count = parseInt(countText, 10);
				const emoji = $item.data('emoji');

				// 🔥 厳格な空要素チェック: countが0、NaN、空文字、または絵文字がない場合
				if (!emoji || isNaN(count) || count <= 0 || countText === '') {
					// Empty reaction element removed
					$item.remove();
				}
			});
			if ($container.length && $container.find('.reaction-item').length === 0) {
				// Empty reaction container removed
				$container.remove();
				syncReactionCaches(messageId, [], true);
			}
		};

		// 即座に実行
		cleanupEmptyReactions();

		// 100ms後にも実行（保険）
		setTimeout(cleanupEmptyReactions, 100);
	};
	const setupReactionEventListeners = () => {
		$(document)
			.off('mouseenter', '.reaction-item')
			.off('mouseleave', '.reaction-item')
			.off('click', '.reaction-item')
			.off('click', '.add-reaction, .action-button.add-reaction')
			.off(`mouseenter${EVENT_NS}`, '.reaction-item')
			.off(`mouseleave${EVENT_NS}`, '.reaction-item')
			.off(`click${EVENT_NS}`, '.reaction-item')
			.off(`click${EVENT_NS}`, '.add-reaction, .action-button.add-reaction');
		$(document).on(`mouseenter${EVENT_NS}`, '.reaction-item', function () {
			const users = $(this).data('users');
			if (!users) {
				return;
			}
			$('.reaction-tooltip').remove();
			const $tooltip = $('<div class="reaction-tooltip"></div>').text(users);
			$('body').append($tooltip);
			const rect = this.getBoundingClientRect();
			const tooltipHeight = $tooltip.outerHeight();
			const top = rect.top < tooltipHeight + 10 ? rect.bottom + 5 : rect.top - tooltipHeight - 5;
			$tooltip.css({
				top: top + window.scrollY,
				left: rect.left + (rect.width - $tooltip.outerWidth()) / 2 + window.scrollX,
				zIndex: 9999,
			});
		});
		$(document).on(`mouseleave${EVENT_NS}`, '.reaction-item', () => {
			$('.reaction-tooltip').remove();
		});
		$(document).on(`click${EVENT_NS}`, '.reaction-item', async function (e) {
			e.preventDefault();
			e.stopImmediatePropagation();
			e.stopPropagation();

			const $item = $(this);
			if ($item.hasClass('processing')) {
				return;
			}

			try {
				$item.addClass('processing');
				$('.reaction-tooltip').remove();

				const emoji = $item.data('emoji') || $item.attr('data-emoji');
				if (!emoji) {
					return;
				}

				const context = resolveReactionContext($item);
				if (!context.messageId) {
					return;
				}

				// FIXED DELETE成功パターンのロジック使用
				if (context.isThread) {
					await toggleThreadReaction(context.messageId, emoji);
				} else {
					await toggleReaction(context.messageId, emoji, false);
				}

			} catch (error) {
				if (utils.showError) {
					utils.showError('リアクションの処理中にエラーが発生しました');
				}
			} finally {
				$item.removeClass('processing');
			}
		});
		$(document).on(`click${EVENT_NS}`, '.add-reaction, .action-button.add-reaction', function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $button = $(this);
			const context = resolveReactionContext($button);
			let messageId = ensureMessageIdString($button.data('message-id')) || context.messageId;
			let isThread = Boolean(context.isThread);
			if (!messageId && isThread && state.currentThread) {
				messageId = ensureMessageIdString(state.currentThread);
			}
			if (!messageId && !isThread) {
				const $fallback = $button.closest('.parent-message');
				if ($fallback.length) {
					messageId = ensureMessageIdString($fallback.data('message-id'));
				}
			}
			if (!messageId) {
				return;
			}
			state.currentReactionMessageId = messageId;
			state.currentReactionIsThread = isThread;
			const handleEmojiSelection = (emojiValue) => {
				if (!emojiValue) {
					return;
				}
				const trimmed = `${emojiValue}`.trim();
				if (!trimmed) {
					return;
				}
				if (isThread) {
					toggleThreadReaction(messageId, trimmed);
				} else {
					toggleReaction(messageId, trimmed, false);
				}
			};
			let pickerShown = false;
			if (window.LMSChat.reactionActions && window.LMSChat.reactionActions.showReactionPicker) {
				try {
					window.LMSChat.reactionActions.showReactionPicker($button, messageId, isThread);
					pickerShown = true;
				} catch (error) {}
			} else if (window.LMSChat.emojiPicker && window.LMSChat.emojiPicker.showPicker) {
				try {
					window.LMSChat.emojiPicker.showPicker($button, messageId, isThread, handleEmojiSelection);
					pickerShown = true;
				} catch (error) {}
			} else if (window.showEmojiPicker) {
				try {
					window.showEmojiPicker($button, handleEmojiSelection);
					pickerShown = true;
				} catch (error) {}
			}
			if (!pickerShown) {
				const emoji = prompt('絵文字を入力してください（例：😀）:');
				handleEmojiSelection(emoji);
			}
		});
		window.LMSChat.eventListenersSetup = true;
	};
	const startReactionPolling = () => {
		if (state.reactionPollingInterval) {
			clearInterval(state.reactionPollingInterval);
		}
	};
	const updateParentMessageReactions = (reactions) => {
		const $parentMessage = $('.parent-message');
		if ($parentMessage.length === 0) {
			return;
		}
		const $parentMessageReactions = $('.parent-message-reactions');
		$parentMessageReactions.remove();
		if (!reactions || !reactions.length) {
			$parentMessage.addClass('no-reactions');
			return;
		}
		const reactionsHtml = createReactionsHtml(reactions);
		if (!reactionsHtml) {
			$parentMessage.addClass('no-reactions');
			return;
		}
		$parentMessage.after(`<div class="parent-message-reactions">${reactionsHtml}</div>`);
		$parentMessage.removeClass('no-reactions');
	};
	const updateParentMessageShadow = () => {
		const $parentMessage = $('#thread-panel .parent-message');
		if ($parentMessage.length === 0) return;
		const hasReactions = $('#thread-panel .parent-message-reactions').length > 0;
		if (!hasReactions) {
			$parentMessage.addClass('no-reactions');
		} else {
			$parentMessage.removeClass('no-reactions');
		}
	};
	window.toggleReaction = toggleReaction;
	window.toggleThreadReaction = toggleThreadReaction;
	window.updateMessageReactions = updateMessageReactions;
	window.updateThreadMessageReactions = updateThreadMessageReactions;
	$(document).ready(() => {
		try {
			init();
			setupReactionEventListeners();

			// 🔥 フォールバック同期の定期実行（他ユーザーからの変更を受信）
			const initFallbackSync = () => {
				if (!window.LMSChatReactionFallbackSync) {
					window.LMSChatReactionFallbackSync = {
						pollReactions: function() {
							const threadId = window.LMSChat?.state?.currentThread || new URLSearchParams(window.location.search).get('thread');
							if (!threadId) return;


							// 🔥 無限ループ防止: 最後の同期から5秒以内は処理をスキップ
							const now = Date.now();
							if (window.LMSChatReactionFallbackSync.lastPollTime &&
								(now - window.LMSChatReactionFallbackSync.lastPollTime) < 5000) {

								return;
							}
							window.LMSChatReactionFallbackSync.lastPollTime = now;

							$.ajax({
								url: window.lms_ajax_obj?.ajax_url || '/wp-admin/admin-ajax.php',
								type: 'POST',
								data: {
									action: 'lms_get_thread_reaction_updates',
									thread_id: threadId,
									last_timestamp: window.LMSChatReactionFallbackSync.lastTimestamp || 0,
									nonce: window.lms_ajax_obj?.nonce || window.lmsAjax?.nonce || window.lms_nonce || ''
								},
								success: function(response) {


									if (response.success && response.data) {


										// 🔥 削除の場合（空の配列）の処理改善
										if (response.data.length === 0) {
											// タイムスタンプを現在時刻に更新して不要な同期を防止
											window.LMSChatReactionFallbackSync.lastTimestamp = Math.floor(Date.now() / 1000);

											// 🔥 無限ループ防止: 前回の削除同期から5秒以内は全体クリアをスキップ
											const now = Date.now();
											if (!window.LMSChatReactionFallbackSync.lastFullClear ||
												(now - window.LMSChatReactionFallbackSync.lastFullClear) > 5000) {
												window.LMSChatReactionFallbackSync.lastFullClear = now;

												// スレッド内の全メッセージのリアクションをクリア（削除同期）
												const threadId = window.LMSChat?.state?.currentThread || new URLSearchParams(window.location.search).get('thread');
												if (threadId) {
													// 🔥 空のリアクション要素のみを削除（正常なリアクションは保持）
													$(`.chat-message .reaction-item`).each(function() {
														const $item = $(this);
														const count = parseInt($item.find('.count').text(), 10);
														const emoji = $item.data('emoji');
														if (!emoji || isNaN(count) || count <= 0) {
															$item.remove();
														}
													});

													// 🔥 空のコンテナのみ削除
													$(`.message-reactions`).each(function() {
														const $container = $(this);
														if ($container.find('.reaction-item').length === 0) {
															$container.remove();
														}
													});


												}
											} else {

											}
											return;
										}

										response.data.forEach((update) => {
											// タイムスタンプ更新
											if (update.timestamp > (window.LMSChatReactionFallbackSync.lastTimestamp || 0)) {
												window.LMSChatReactionFallbackSync.lastTimestamp = update.timestamp;
											}

											// 🔥 UI更新システムの存在確認とログ


											// 🔥 UI更新（直接DOM操作を最優先）
											let uiUpdated = false;

											// 1. 直接DOM操作（最優先 - 確実な正しいHTML生成）
											if (!uiUpdated) {
												try {
													const $message = $(`.chat-message[data-message-id="${update.message_id}"], [data-message-id="${update.message_id}"]`);


													if ($message.length > 0) {
														let $reactionsContainer = $message.find('.message-reactions');

														// リアクションがある場合
														if (update.reactions && update.reactions.length > 0) {


															const reactionsHtml = createReactionsHtml(update.reactions);


															if (reactionsHtml && reactionsHtml.trim()) {
																if ($reactionsContainer.length > 0) {
																	$reactionsContainer.replaceWith(reactionsHtml);
																} else {
																	$message.append(reactionsHtml);
																}

																uiUpdated = true;
															} else {

																// HTMLが生成できない場合は削除
																if ($reactionsContainer.length > 0) {
																	$reactionsContainer.remove();

																}
															}
														} else {
															// リアクションがない場合は削除
															if ($reactionsContainer.length > 0) {
																$reactionsContainer.remove();

																uiUpdated = true;
															}
														}
													} else {

													}
												} catch (error) {
													// 直接DOM操作エラー（最優先）
												}
											}

											// 2. ThreadReactionUnified
											if (!uiUpdated && window.LMSChat?.threadReactionUnified?.updateReactions) {
												try {
													window.LMSChat.threadReactionUnified.updateReactions(update.message_id, update.reactions, {
														source: 'periodic_fallback_sync',
														serverTimestamp: update.timestamp
													});

													uiUpdated = true;
												} catch (error) {
													// ThreadReactionUnified エラー
												}
											}

											// 2. reactionUI（現在問題があるため無効化）
											if (!uiUpdated && false && window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
												try {
													const validReactions = update.reactions ? update.reactions.filter(r => r.count && r.count > 0) : [];
													if (validReactions.length > 0) {
														window.LMSChat.reactionUI.updateThreadMessageReactions(update.message_id, validReactions, true, true);

														uiUpdated = true;
													}
												} catch (error) {
													// reactionUI エラー
												}
											}

											// 3. グローバル関数（現在問題があるため無効化）
											if (!uiUpdated && false && window.updateThreadMessageReactions) {
												try {
													const validReactions = update.reactions ? update.reactions.filter(r => r.count && r.count > 0) : [];
													window.updateThreadMessageReactions(update.message_id, validReactions, true);

													uiUpdated = true;
												} catch (error) {
													// Global関数 エラー
												}
											}


											if (!uiUpdated) {
												// UI更新に失敗
											}
										});
									}
								},
								error: function(xhr, status, error) {
									// 定期フォールバック同期エラー
								}
							});
						},
						lastTimestamp: 0,
						lastPollTime: 0,
						lastFullClear: 0
					};
				}

				// 10秒後に開始（初期化完了待ち・ドリフト防止のため遅延延長）
				setTimeout(() => {
					// 重複実行防止フラグを設定
					if (!window.LMSChatReactionFallbackSync.isPolling) {
						window.LMSChatReactionFallbackSync.pollReactions();
					}

					// 60秒間隔で定期実行（ドリフト防止のため間隔延長）
					setInterval(() => {
						// 重複実行防止チェック
						if (window.LMSChatReactionFallbackSync.isPolling) {
							return;
						}
						window.LMSChatReactionFallbackSync.pollReactions();
					}, 60000);


				}, 10000);
			};

			initFallbackSync();

			// 🔥 削除操作の即座同期イベントリスナー
			$(document).on('lms_thread_reaction_deleted', function(event, data) {
				// Delete sync log removed

				// 該当メッセージの該当絵文字リアクションを即座に削除
				if (data.messageId && data.emoji) {
					// 🔥 複数のセレクターで確実に要素を見つける
					const possibleSelectors = [
						`.chat-message[data-message-id="${data.messageId}"]`,
						`.message[data-message-id="${data.messageId}"]`,
						`[data-message-id="${data.messageId}"]`
					];

					let $message = $();
					for (const selector of possibleSelectors) {
						$message = $(selector);
						if ($message.length > 0) {
							// Delete sync log removed
							break;
						}
					}

					if ($message.length > 0) {
						// 🔥 より厳密なリアクション要素検索
						let $reactionItem = $message.find(`.reaction-item[data-emoji="${data.emoji}"]`);

						// 🔥 絵文字で直接検索も試行
						if ($reactionItem.length === 0) {
							$reactionItem = $message.find('.reaction-item').filter(function() {
								const $this = $(this);
								const emoji = $this.data('emoji') || $this.find('.emoji').text().trim();
								return emoji === data.emoji;
							});
						}

						// 🔥 全てのリアクションコンテナで検索
						if ($reactionItem.length === 0) {
							$(`.message-reactions .reaction-item`).each(function() {
								const $this = $(this);
								const emoji = $this.data('emoji') || $this.find('.emoji').text().trim();
								const messageContainer = $this.closest('[data-message-id]');
								if (emoji === data.emoji && messageContainer.data('message-id') == data.messageId) {
									$reactionItem = $this;
									return false;
								}
							});
						}

						// Delete sync log removed

						if ($reactionItem.length > 0) {
							// Delete sync log removed
							$reactionItem.remove();

							// コンテナが空になった場合は削除
							const $container = $message.find('.message-reactions');
							if ($container.length && $container.find('.reaction-item').length === 0) {
								$container.remove();
								// Delete sync log removed
							}

							// 🔥 削除完了を他のユーザーにも即座に反映（イベント配信）
							$(document).trigger('lms_reaction_ui_updated', {
								messageId: data.messageId,
								action: 'removed',
								emoji: data.emoji,
								source: 'delete_sync'
							});
						} else {
							// Delete sync log removed
						}
					} else {
						// Delete sync log removed
					}
				}
			});

		} catch (error) {
		}
	});

	// === Ultimate Reaction Fix統合機能 ===
	// 既存のリアクション処理を完全に迂回する緊急修正ハンドラー
	function setupUltimateReactionFix() {
		// 既存のすべてのリアクションクリックハンドラーを無効化
		$(document).off('click.ultimateFix');
		
		// 完全な新しいクリックハンドラー（すべての既存ハンドラーを迂回）
		$(document).on('click.ultimateFix', '.reaction-item', async function(e) {
			e.preventDefault();
			e.stopImmediatePropagation(); // 他のすべてのハンドラーを完全に停止
			
			const $reaction = $(this);
			const emoji = $reaction.data('emoji');
			
			// メッセージIDを特定
			let messageId;
			let isThread = false;
			
			const $threadMessage = $reaction.closest('.thread-message[data-message-id]');
			const $chatMessage = $reaction.closest('.chat-message[data-message-id]');
			const $parentReactions = $reaction.closest('.parent-message-reactions');
			
			if ($threadMessage.length > 0) {
				messageId = $threadMessage.data('message-id');
				isThread = true;
			} else if ($parentReactions.length > 0) {
				messageId = $('.parent-message').data('message-id') || window.LMSChat?.state?.currentThread;
				isThread = false;
			} else if ($chatMessage.length > 0) {
				messageId = $chatMessage.data('message-id');
				isThread = false;
			}
			
			if (!messageId || !emoji) {
				return;
			}
			
			// Ultimate処理中ロック（3秒間）
			const lockKey = `${messageId}-${emoji}`;
			if (window.LMSChat.ultimateProcessingLock.has(lockKey)) {
				return;
			}
			
			window.LMSChat.ultimateProcessingLock.add(lockKey);
			
			// 3秒後に自動解除
			setTimeout(() => {
				window.LMSChat.ultimateProcessingLock.delete(lockKey);
			}, 3000);
			
			try {
				// 現在の状態を判定
				const isUserReacted = $reaction.hasClass('user-reacted');
				const isRemoving = isUserReacted;
				
				// フリッカー防止：UI状態を即座に更新
				if (isRemoving) {
					$reaction.removeClass('user-reacted').addClass('processing');
				} else {
					$reaction.addClass('user-reacted processing');
				}
				
				// Ajax リクエスト
				const ajaxConfig = getAjaxConfig();
				const ajaxAction = isThread ? 'lms_toggle_thread_reaction' : 'lms_toggle_reaction';
				const ajaxData = {
					action: ajaxAction,
					message_id: messageId,
					emoji: emoji,
					nonce: ajaxConfig.nonce,
					user_id: ajaxConfig.user_id,
					is_removing: isRemoving
				};
				
				const response = await $.ajax({
					url: ajaxConfig.ajaxurl,
					type: 'POST',
					data: ajaxData,
					timeout: 15000,
					cache: false
				});
				
				if (response.success) {
					// サーバーからの最新リアクションデータで更新
					const reactions = response.data.reactions || response.data;
					
					if (isThread && window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
						window.LMSChat.reactionUI.updateThreadMessageReactions(messageId, reactions, true);
					} else if (!isThread && window.LMSChat?.reactionUI?.updateMessageReactions) {
						window.LMSChat.reactionUI.updateMessageReactions(messageId, reactions, true);
					}
					
					// カスタムイベントを発火
					const action = response.data.removed || response.data.action === 'removed' ? 'removed' : 'added';
					$(document).trigger(`reaction:${action}`, {
						messageId: messageId,
						reaction: emoji,
						userId: ajaxConfig.user_id,
						isThread: isThread
					});
					
				} else {
					throw new Error(response.data || 'Server returned error');
				}
				
			} catch (error) {
				// エラー時はUI状態を元に戻す
				$reaction.removeClass('processing');
				if (isRemoving) {
					$reaction.addClass('user-reacted');
				} else {
					$reaction.removeClass('user-reacted');
				}
				
				// エラー表示
				if (utils.showError) {
					utils.showError('リアクションの処理中にエラーが発生しました');
				}
			}
		});
	}
	
	// DOM準備完了後に設定（遅延実行で既存システム初期化後に適用）
	$(document).ready(function() {
		setTimeout(setupUltimateReactionFix, 2000);
	});
	
	// グローバル関数として公開
	window.setupUltimateReactionFix = setupUltimateReactionFix;

})(jQuery);
