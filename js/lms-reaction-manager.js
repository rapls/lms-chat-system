/**
 * LMS統合リアクション管理システム
 * Long Polling連携の新しいリアクション同期システム
 */
(function ($) {
	'use strict';

	if (!window.LMSChat) {
		window.LMSChat = {};
	}

	/**
	 * 統合リアクションマネージャークラス
	 */
	class LMSReactionManager {
		constructor() {
			this.state = new Map();
			this.pendingActions = new Map();
			this.processingActions = new Set();
			this.config = {
				maxRetries: 3,
				retryDelay: 1000,
				debounceTime: 300
			};
			this.isInitialized = false;
			
			this.init();
		}

		/**
		 * 初期化
		 */
		init() {
			if (this.isInitialized) {
				return;
			}

			this.initEventListeners();
			this.isInitialized = true;
			
			
			// 初期化完了イベント
			$(document).trigger('reactionManager:initialized');
		}

		/**
		 * イベントリスナーの初期化
		 */
		initEventListeners() {
			// Long Pollingからの同期イベント
			$(document).on('reaction:synced', (e, data) => {
				this.handleSyncedReaction(data);
			});

			// ユーザークリックイベント
			$(document).on('click', '.reaction-trigger', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.handleUserAction(e);
			});

			// 既存のリアクション要素クリック
			$(document).on('click', '.reaction-item', (e) => {
				e.preventDefault();
				e.stopPropagation();
				
				// スレッドメッセージ内のリアクションは既存システムに委譲
				if ($(e.target).closest('.thread-message, .parent-message').length > 0) {
					return;
				}
				
				this.handleReactionItemClick(e);
			});

			// 絵文字ピッカーからのイベント
			$(document).on('reaction:picker:selected', (e, data) => {
				this.handlePickerSelection(data);
			});

			// リアクション削除イベント
			$(document).on('reaction:remove', (e, data) => {
				this.handleReactionRemove(data);
			});
		}

		/**
		 * Long Pollingから同期されたリアクションを処理
		 * @param {object} data リアクションデータ
		 */
		handleSyncedReaction(data) {
			const { messageId, reactions, isThread, source } = data;
			
			// 自分が処理中のアクションは無視（重複防止）
			if (this.isProcessingMessage(messageId)) {
				return;
			}
			
			// 状態更新
			this.updateState(messageId, reactions, isThread);
			
			// UI更新（Long Pollingからの場合は強制更新）
			this.updateUI(messageId, reactions, isThread, true);
			
		}

		/**
		 * ユーザーアクションの処理
		 * @param {Event} event クリックイベント
		 */
		async handleUserAction(event) {
			const $target = $(event.currentTarget);
			const messageId = $target.data('message-id') || $target.closest('.chat-message').data('message-id');
			const emoji = $target.data('emoji');

			if (!messageId || !emoji) {
				return;
			}

			await this.toggleReaction(messageId, emoji);
		}

		/**
		 * リアクションアイテムのクリック処理
		 * @param {Event} event クリックイベント
		 */
		async handleReactionItemClick(event) {
			const $item = $(event.currentTarget);
			const messageId = $item.closest('.chat-message').data('message-id');
			const emoji = $item.data('emoji');

			if (!messageId || !emoji) {
				return;
			}

			await this.toggleReaction(messageId, emoji);
		}

		/**
		 * 絵文字ピッカーからの選択処理
		 * @param {object} data ピッカーデータ
		 */
		async handlePickerSelection(data) {
			const { messageId, emoji } = data;
			
			if (!messageId || !emoji) {
				return;
			}

			await this.toggleReaction(messageId, emoji);
		}

		/**
		 * リアクション削除処理
		 * @param {object} data 削除データ
		 */
		async handleReactionRemove(data) {
			const { messageId, emoji } = data;
			
			if (!messageId || !emoji) {
				return;
			}

			await this.removeReaction(messageId, emoji);
		}

		/**
		 * リアクションの追加/削除（トグル）
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 */
		async toggleReaction(messageId, emoji) {
			const actionKey = `${messageId}:${emoji}`;
			
			// 重複処理防止
			if (this.processingActions.has(actionKey)) {
				return;
			}

			// 処理中フラグ設定
			this.processingActions.add(actionKey);

			try {
				// 楽観的UI更新
				this.optimisticUpdate(messageId, emoji);

				// サーバーリクエスト
				const response = await this.sendToServer(messageId, emoji, 'toggle');

				if (!response.success) {
					// ロールバック
					this.rollbackUpdate(messageId, emoji);
					this.showError(response.data || 'リアクションの更新に失敗しました');
				} else {
					// サーバーからの正しいデータでUI更新
					if (response.data) {
						this.updateState(messageId, response.data);
						this.updateUI(messageId, response.data, false, true);
					}
					
					// 成功イベント発火
					$(document).trigger('reaction:success', {
						messageId,
						emoji,
						action: 'toggle'
					});
				}
			} catch (error) {
				// エラー時のロールバック
				this.rollbackUpdate(messageId, emoji);
				this.showError('リアクション処理中にエラーが発生しました');
			} finally {
				// 処理完了フラグ削除
				this.processingActions.delete(actionKey);
			}
		}

		/**
		 * リアクションの削除
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 */
		async removeReaction(messageId, emoji) {
			const actionKey = `${messageId}:${emoji}`;
			
			if (this.processingActions.has(actionKey)) {
				return;
			}

			this.processingActions.add(actionKey);

			try {
				// 楽観的UI更新（削除）
				this.optimisticRemove(messageId, emoji);

				// サーバーリクエスト
				const response = await this.sendToServer(messageId, emoji, 'remove');

				if (!response.success) {
					this.rollbackRemove(messageId, emoji);
					this.showError(response.data || 'リアクションの削除に失敗しました');
				} else {
					if (response.data) {
						this.updateState(messageId, response.data);
						this.updateUI(messageId, response.data, false, true);
					}
				}
			} catch (error) {
				this.rollbackRemove(messageId, emoji);
				this.showError('リアクション削除中にエラーが発生しました');
			} finally {
				this.processingActions.delete(actionKey);
			}
		}

		/**
		 * サーバーにリクエスト送信
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 * @param {string} action アクション
		 * @returns {Promise} レスポンス
		 */
		async sendToServer(messageId, emoji, action) {
			const isRemoving = action === 'remove';
			
			return new Promise((resolve, reject) => {
				$.ajax({
					url: window.lmsChat.ajaxUrl,
					type: 'POST',
					data: {
						action: this.isThreadMessage(messageId) ? 'lms_toggle_thread_reaction' : 'lms_toggle_reaction',
						message_id: messageId,
						emoji: emoji,
						nonce: window.lmsChat.nonce,
						user_id: window.lmsChat.currentUserId,
						is_removing: isRemoving ? 1 : 0,
					},
					timeout: 15000,
					cache: false,
					success: resolve,
					error: (xhr, status, error) => {
						resolve({
							success: false,
							data: this.parseErrorResponse(xhr, status, error)
						});
					}
				});
			});
		}

		/**
		 * エラーレスポンスの解析
		 * @param {object} xhr XHRオブジェクト
		 * @param {string} status ステータス
		 * @param {string} error エラー
		 * @returns {string} エラーメッセージ
		 */
		parseErrorResponse(xhr, status, error) {
			if (xhr.status === 400) {
				try {
					const errorResponse = JSON.parse(xhr.responseText);
					return errorResponse.data || 'パラメータが無効です';
				} catch (parseError) {
					return '無効なパラメータが送信されました';
				}
			}
			return 'ネットワークエラーが発生しました';
		}

		/**
		 * 楽観的UI更新
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 */
		optimisticUpdate(messageId, emoji) {
			// 実装は既存のUI更新ロジックを使用
			// この部分は一時的な表示更新
		}

		/**
		 * ロールバック処理
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 */
		rollbackUpdate(messageId, emoji) {
			// 元の状態に戻す
			// サーバーから最新データを取得して復元
		}

		/**
		 * 楽観的削除
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 */
		optimisticRemove(messageId, emoji) {
			// 削除の楽観的更新
		}

		/**
		 * 削除のロールバック
		 * @param {number} messageId メッセージID
		 * @param {string} emoji 絵文字
		 */
		rollbackRemove(messageId, emoji) {
			// 削除のロールバック
		}

		/**
		 * 状態更新
		 * @param {number} messageId メッセージID
		 * @param {Array} reactions リアクション配列
		 * @param {boolean} isThread スレッドかどうか
		 */
		updateState(messageId, reactions, isThread = false) {
			const key = isThread ? `thread_${messageId}` : `${messageId}`;
			this.state.set(key, {
				reactions: reactions,
				isThread: isThread,
				lastUpdate: Date.now()
			});
		}

		/**
		 * UI更新
		 * @param {number} messageId メッセージID
		 * @param {Array} reactions リアクション配列
		 * @param {boolean} isThread スレッドかどうか
		 * @param {boolean} force 強制更新かどうか
		 */
		updateUI(messageId, reactions, isThread = false, force = false) {
			try {
				// 既存のリアクションUI更新機能を使用
				if (window.LMSChat?.reactionUI) {
					if (isThread && window.LMSChat.reactionUI.updateThreadMessageReactions) {
						window.LMSChat.reactionUI.updateThreadMessageReactions(messageId, reactions, false);
					} else if (window.LMSChat.reactionUI.updateMessageReactions) {
						window.LMSChat.reactionUI.updateMessageReactions(messageId, reactions, false);
					}
				}
			} catch (error) {
			}
		}

		/**
		 * メッセージが処理中かどうかチェック
		 * @param {number} messageId メッセージID
		 * @returns {boolean} 処理中かどうか
		 */
		isProcessingMessage(messageId) {
			for (const actionKey of this.processingActions) {
				if (actionKey.startsWith(`${messageId}:`)) {
					return true;
				}
			}
			return false;
	}

	/**
	 * メッセージがスレッドメッセージかどうかを判定
	 * @param {number} messageId メッセージID
	 * @returns {boolean} スレッドメッセージかどうか
	 */
	isThreadMessage(messageId) {
		// DOM要素から判定
		const $threadMessage = $(`.thread-message[data-message-id="${messageId}"]`);
		if ($threadMessage.length > 0) {
			return true;
		}

		// 現在スレッド表示中の場合
		if (window.LMSChat?.state?.currentThread) {
			return true;
		}

		// #thread-panel内のメッセージの場合
		const $threadPanel = $('#thread-panel');
		if ($threadPanel.length > 0 && $threadPanel.is(':visible')) {
			const $messageInPanel = $threadPanel.find(`[data-message-id="${messageId}"]`);
			if ($messageInPanel.length > 0) {
				return true;
			}
		}

		return false;
	}

		/**
		 * エラー表示
		 * @param {string} message エラーメッセージ
		 */
		showError(message) {
			if (window.LMSChat?.utils?.showError) {
				window.LMSChat.utils.showError(message);
			} else {
			}
		}

		/**
		 * 統計情報を取得
		 * @returns {object} 統計情報
		 */
		getStats() {
			return {
				stateSize: this.state.size,
				pendingActions: this.pendingActions.size,
				processingActions: this.processingActions.size,
				isInitialized: this.isInitialized
			};
		}

		/**
		 * クリーンアップ
		 */
		destroy() {
			$(document).off('reaction:synced reaction:picker:selected reaction:remove');
			$(document).off('click', '.reaction-trigger, .reaction-item');
			
			this.state.clear();
			this.pendingActions.clear();
			this.processingActions.clear();
			this.isInitialized = false;
			
		}
	}

	// グローバル初期化
	$(document).ready(() => {
		// 既存のマネージャーがあれば削除
		if (window.LMSReactionManager) {
			window.LMSReactionManager.destroy();
		}
		
		// 新しいマネージャーを作成
		window.LMSReactionManager = new LMSReactionManager();
		
		// LMSChatオブジェクトにも追加
		if (!window.LMSChat) {
			window.LMSChat = {};
		}
		window.LMSChat.reactionManager = window.LMSReactionManager;
		
	});

})(jQuery);
