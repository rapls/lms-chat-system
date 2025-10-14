/**
 * スレッド情報リアルタイム同期システム
 * スレッドメッセージの追加・削除を監視し、親メッセージのスレッド情報（件数、アイコン）をリアルタイムに更新
 * サーバー負荷を最小限に抑えながら、開閉状態に関わらず常に最新の情報を表示
 */

(function() {
	'use strict';

	// グローバルネームスペースに配置
	window.LMSThreadSync = {
		// 設定
		config: {
			pollInterval: 120000, // 2分間隔（サーバー負荷軽減）
			retryDelay: 5000,     // エラー時の再試行間隔
			maxRetries: 3         // 最大再試行回数
		},

		// 状態管理
		state: {
			isPolling: false,
			lastCheck: 0,
			pollTimer: null,
			retryCount: 0,
			isActive: true
		},

		// 初期化
		init: function() {
			if (this.state.isPolling) {
				return;
			}

			// 初期タイムスタンプを設定（現在時刻）
			this.state.lastCheck = Math.floor(Date.now() / 1000);
			this.state.isPolling = true;

			// ページ可視性APIでポーリングを制御
			this.setupVisibilityListener();

			// ポーリング開始
			this.startPolling();
		},

		// ポーリング開始
		startPolling: function() {
			if (!this.state.isActive) {
				return;
			}

			// 既存のタイマーをクリア
			if (this.state.pollTimer) {
				clearTimeout(this.state.pollTimer);
			}

			// 即座に1回実行
			this.checkThreadUpdates();

			// 定期実行を設定
			this.state.pollTimer = setInterval(() => {
				if (this.state.isActive) {
					this.checkThreadUpdates();
				}
			}, this.config.pollInterval);
		},

		// ポーリング停止
		stopPolling: function() {
			if (this.state.pollTimer) {
				clearInterval(this.state.pollTimer);
				this.state.pollTimer = null;
			}
			this.state.isPolling = false;
		},

		// ページ可視性リスナー設定
		setupVisibilityListener: function() {
			document.addEventListener('visibilitychange', () => {
				if (document.hidden) {
					// ページが非表示になったらポーリング停止
					this.state.isActive = false;
					this.stopPolling();
				} else {
					// ページが表示されたらポーリング再開
					this.state.isActive = true;
					this.startPolling();
				}
			});
		},

		// スレッド更新をチェック
		checkThreadUpdates: function() {
			const self = this;

			$.ajax({
				url: lmsAjax.ajaxurl,
				type: 'POST',
				data: {
					action: 'lms_get_thread_updates',
					nonce: lmsAjax.nonce,
					last_check: self.state.lastCheck
				},
				success: function(response) {
				if (response.success && response.data) {
					// タイムスタンプを更新
					self.state.lastCheck = response.data.timestamp || Math.floor(Date.now() / 1000);
					self.state.retryCount = 0; // 成功したらリトライカウントをリセット

					// 更新を処理
					if (response.data.updates && response.data.updates.length > 0) {
						self.processUpdates(response.data.updates, response.data.thread_summaries || {});
					}
				} else {
					self.handleError('サーバーエラー: ' + (response.data || '不明なエラー'));
				}
				},
				error: function(xhr, status, error) {
					self.handleError('通信エラー: ' + error);
				}
			});
		},

		// 更新情報を処理
		processUpdates: function(updates, threadSummaries) {
			const threadCountChanges = new Map(); // parent_message_id -> count change

			updates.forEach(update => {
				if (update.type === 'thread_message_new') {
					// 新規メッセージ: カウント+1
					const threadId = update.thread_id || update.message.parent_message_id;
					const currentChange = threadCountChanges.get(threadId) || 0;
					threadCountChanges.set(threadId, currentChange + 1);

					// スレッドが開いている場合はメッセージも追加
					this.appendThreadMessageIfOpen(threadId, update.message);

				} else if (update.type === 'thread_message_deleted') {
					// 削除: カウント-1
					const threadId = update.thread_id;
					const currentChange = threadCountChanges.get(threadId) || 0;
					threadCountChanges.set(threadId, currentChange - 1);

					// スレッドが開いている場合はメッセージも削除
					this.removeThreadMessageIfOpen(threadId, update.message_id);
				}
			});

			// サーバーから受け取ったスレッド集約情報を使用してUIを更新
			if (threadSummaries && Object.keys(threadSummaries).length > 0) {
				Object.keys(threadSummaries).forEach(threadId => {
					this.updateThreadInfo(threadId, threadSummaries[threadId]);
				});
			} else {
				// フォールバック: 件数のみの更新
				threadCountChanges.forEach((change, threadId) => {
					this.updateThreadCount(threadId, change);
				});
			}
		},

		// スレッドが開いている場合、メッセージを追加
		appendThreadMessageIfOpen: function(threadId, message) {
			const $threadContainer = $(`.thread-container[data-parent-message-id="${threadId}"]`);
			if ($threadContainer.length === 0 || !$threadContainer.is(':visible')) {
				return; // スレッドが開いていない
			}

			// chat-threads.js の appendMessage 関数を利用
			if (window.LMSChat && window.LMSChat.threads && window.LMSChat.threads.appendMessage) {
				window.LMSChat.threads.appendMessage(message, threadId);
			}
		},

		// スレッドが開いている場合、メッセージを削除
		removeThreadMessageIfOpen: function(threadId, messageId) {
			const $threadContainer = $(`.thread-container[data-parent-message-id="${threadId}"]`);
			if ($threadContainer.length === 0 || !$threadContainer.is(':visible')) {
				return; // スレッドが開いていない
			}

			// メッセージを削除
			$threadContainer.find(`.thread-message[data-message-id="${messageId}"]`).remove();
		},

		// スレッド情報を完全に更新（件数・アバター・未読数・最新返信）
	updateThreadInfo: function(parentMessageId, threadInfo) {
		
		// updateThreadInfoCompleteを使用して更新
		if (window.LMSChat?.messages?.updateThreadInfoComplete) {
			const normalizedInfo = {
				count: threadInfo.count || threadInfo.total || 0,
				unread: threadInfo.unread_count || threadInfo.unread || 0,
				avatars: threadInfo.avatars || [],
				latest_reply: threadInfo.latest_reply || ''
			};
			window.LMSChat.messages.updateThreadInfoComplete(parentMessageId, normalizedInfo, { source: 'chat-thread-sync' });
		} else {
			// フォールバック: 既存の実装を使用
			const $parentMessage = $(`.chat-message[data-message-id="${parentMessageId}"]`);
			if ($parentMessage.length === 0) {
				return;
			}

			const count = threadInfo.count || 0;
			const unreadCount = threadInfo.unread_count || 0;
			const avatars = threadInfo.avatars || [];
			const latestReply = threadInfo.latest_reply || '';

			// 既存のスレッド情報を削除
			$parentMessage.find('.thread-info').remove();

			if (count === 0) {
				// カウントが0の場合はスレッドボタンも削除
				$parentMessage.find('.thread-button').remove();
				$parentMessage.removeClass('has-thread');
				return;
			}

			// generateThreadInfoHtml を使用して新しいスレッド情報HTMLを生成
			let threadInfoHtml = '';
			if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.generateThreadInfoHtml) {
				threadInfoHtml = window.LMSChat.messages.generateThreadInfoHtml(
					parentMessageId,
					count,
					unreadCount,
					avatars,
					latestReply
				);
			} else {
				// フォールバック: 基本的なHTMLを生成
				threadInfoHtml = this.generateBasicThreadInfoHtml(parentMessageId, count, unreadCount);
			}

			// スレッド情報を挿入
			if (threadInfoHtml) {
				$parentMessage.find('.message-content').after(threadInfoHtml);
				$parentMessage.addClass('has-thread');
			}

			// data属性も更新
			$parentMessage.attr('data-thread-count', count);
			$parentMessage.data('thread-count', count);

			// スレッドボタンが存在しない場合は追加
			if ($parentMessage.find('.thread-button').length === 0) {
				const $messageActions = $parentMessage.find('.message-actions');
				if ($messageActions.length > 0) {
					const threadButton = `
						<button class="thread-button" data-parent-message-id="${parentMessageId}">
							<i class="fas fa-comment-dots"></i> 返信
						</button>
					`;
					$messageActions.append(threadButton);
				}
			}
		}
	},

		// 基本的なスレッド情報HTMLを生成（フォールバック用）
		generateBasicThreadInfoHtml: function(messageId, count, unreadCount) {
			const unreadBadge = unreadCount > 0 
				? `<span class="thread-unread-badge">${unreadCount}</span>` 
				: '';
			
			return `
				<div class="thread-info" data-message-id="${messageId}">
					<div class="thread-info-avatars">
						<img src="${lmsAjax.themeUrl}/img/default-avatar.png" alt="ユーザー" class="thread-avatar">
					</div>
					<div class="thread-info-text">
						<div class="thread-info-status">
							<span class="thread-reply-count">${count}件の返信</span>
							${unreadBadge}
						</div>
					</div>
				</div>
			`;
		},

		// スレッド件数を更新
		updateThreadCount: function(parentMessageId, changeAmount) {
			const $parentMessage = $(`.chat-message[data-message-id="${parentMessageId}"]`);
			if ($parentMessage.length === 0) {
				return;
			}

			// 現在のカウントを取得
			let currentCount = 0;
			const $threadInfo = $parentMessage.find('.thread-info');
			const $threadButton = $parentMessage.find('.thread-button');

			if ($threadInfo.length > 0) {
				const $countEl = $threadInfo.find('.thread-count, .thread-reply-count');
				if ($countEl.length > 0) {
					const countText = $countEl.text();
					const matches = countText.match(/(\d+)/);
					if (matches) {
						currentCount = parseInt(matches[1], 10) || 0;
					}
				}
			}

			// 新しいカウントを計算
			const newCount = Math.max(0, currentCount + changeAmount);

			// UIを更新
			if (newCount === 0) {
				// カウントが0になったらスレッド情報を削除
				$threadInfo.remove();
				$threadButton.remove();
				$parentMessage.removeClass('has-thread');
			} else if ($threadInfo.length > 0) {
				// 既存のスレッド情報を更新
				const $countEl = $threadInfo.find('.thread-count, .thread-reply-count');
				if ($countEl.length > 0) {
					$countEl.text(`${newCount}件の返信`);
				}
			} else {
				// スレッド情報が存在しない場合は新規作成
				this.createThreadInfo($parentMessage, parentMessageId, newCount);
			}

			// data属性も更新
			$parentMessage.attr('data-thread-count', newCount);
			$parentMessage.data('thread-count', newCount);
		},

		// スレッド情報を新規作成
		createThreadInfo: function($parentMessage, parentMessageId, count) {
			// スレッドボタンを追加
			const $messageActions = $parentMessage.find('.message-actions');
			if ($messageActions.length > 0 && $messageActions.find('.thread-button').length === 0) {
				const threadButton = `
					<button class="thread-button" data-parent-message-id="${parentMessageId}">
						<i class="fas fa-comment-dots"></i> 返信
					</button>
				`;
				$messageActions.append(threadButton);
			}

			// スレッド情報を追加
			if ($parentMessage.find('.thread-info').length === 0) {
				const threadInfo = `
					<div class="thread-info">
						<span class="thread-icon">💬</span>
						<span class="thread-count">${count}件の返信</span>
					</div>
				`;
				$parentMessage.find('.message-content').after(threadInfo);
			}

			$parentMessage.addClass('has-thread');
		},

		// エラーハンドリング
		handleError: function(errorMessage) {
			this.state.retryCount++;

			if (this.state.retryCount >= this.config.maxRetries) {
				// 最大再試行回数を超えたらポーリング停止
				this.stopPolling();
				return;
			}

			// 一定時間後に再試行
			setTimeout(() => {
				if (this.state.isActive) {
					this.checkThreadUpdates();
				}
			}, this.config.retryDelay);
		},

		// クリーンアップ
		destroy: function() {
			this.stopPolling();
			this.state.isPolling = false;
			this.state.isActive = false;
		}
	};

	// ページ読み込み完了後に初期化
	$(document).ready(function() {
		// チャットが初期化されるまで待機
		const waitForChatInit = setInterval(() => {
			if (window.LMSChat && window.LMSChat.state) {
				clearInterval(waitForChatInit);
				
				// チャットシステムが完全に初期化された後に開始
				setTimeout(() => {
					window.LMSThreadSync.init();
				}, 2000);
			}
		}, 500);

		// 10秒経っても初期化されない場合はタイムアウト
		setTimeout(() => {
			clearInterval(waitForChatInit);
		}, 10000);
	});

	// ページ離脱時のクリーンアップ
	$(window).on('beforeunload', function() {
		if (window.LMSThreadSync) {
			window.LMSThreadSync.destroy();
		}
	});

})();
