/**
 * LMS統合ロングポーリング連携ハブ
 * 統合ロングポーリングシステムと既存LMSChatコンポーネントを連携
 */

(function() {
	'use strict';

	class LMSLongPollIntegrationHub {
		constructor() {
			this.initialized = false;
			this.eventHandlers = new Map();
			this.uiComponents = {};
			this.debugMode = window.lmsDebugMode || false;
			
			this.init();
		}

		init() {
			if (this.initialized) {
				return;
			}

			this.log('統合ハブを初期化中...');
			
			// 既存UIコンポーネントの検出と登録
			this.detectUIComponents();
			
			// 統合ロングポーリングシステムとの連携設定
			this.setupLongPollIntegration();
			
			// イベントハンドラの登録
			this.registerEventHandlers();
			
			this.initialized = true;
			this.log('統合ハブの初期化完了');
		}

		detectUIComponents() {
			const components = {
				// メッセージ管理システム
				chatMessages: this.findComponent([
					'window.LMSChat?.messages',
					'window.chatMessages',
					'window.lmsChat?.messages'
				]),
				
				chatUI: this.findComponent([
					'window.LMSChat?.ui', 
					'window.LMSChatUI',
					'window.lmsChat?.ui'
				]),
				
				// リアクション管理システム
				reactionsUI: this.findComponent([
					'window.LMSReactionsUI',
					'window.LMSChat?.reactions',
					'window.lmsReactions'
				]),
				
				// スレッド管理システム
				threadsUI: this.findComponent([
					'window.LMSThreadsUI',
					'window.LMSChat?.threads',
					'window.lmsThreads'
				]),
				
				// バッジ管理システム
				badgeManager: this.findComponent([
					'window.LMSUnifiedBadgeManager',
					'window.LMSBadgeManager',
					'window.UnifiedBadgeManager'
				]),
				
				// スクロール管理システム
				scrollManager: this.findComponent([
					'window.UnifiedScrollManager',
					'window.LMSScrollManager',
					'window.scrollManager'
				])
			};

			this.uiComponents = components;
			this.log('UI コンポーネント検出結果:', components);
		}

		findComponent(paths) {
			for (const path of paths) {
				try {
					const component = this.getNestedProperty(window, path.replace('window.', ''));
					if (component) {
						return component;
					}
				} catch (e) {
					// 継続
				}
			}
			return null;
		}

		getNestedProperty(obj, path) {
			return path.split('.').reduce((current, prop) => {
				return current && current[prop] !== undefined ? current[prop] : null;
			}, obj);
		}

		setupLongPollIntegration() {
			// 統合ロングポーリングシステムとの連携
			if (window.unifiedLongPoll) {
				this.connectToLongPoll(window.unifiedLongPoll);
			} else {
				// ロングポーリングシステムの初期化を待機
				this.waitForLongPoll();
			}
		}

		waitForLongPoll() {
			const checkInterval = setInterval(() => {
				if (window.unifiedLongPoll) {
					this.connectToLongPoll(window.unifiedLongPoll);
					clearInterval(checkInterval);
				}
			}, 100);

			setTimeout(() => {
				clearInterval(checkInterval);
				this.log('統合ロングポーリングシステムが見つかりません', 'warn');
			}, 10000);
		}

		connectToLongPoll(longPollSystem) {
			this.log('統合ロングポーリングシステムに接続中...');
			
			// イベントリスナーの設定
			this.setupEventListeners(longPollSystem);
			
			this.log('統合ロングポーリングシステムに接続完了');
		}

		setupEventListeners(longPollSystem) {
			// メッセージ作成イベント
			if (longPollSystem.on) {
				longPollSystem.on('message_create', (data) => {
					this.handleMessageCreate(data);
				});

				longPollSystem.on('message_delete', (data) => {
					this.handleMessageDelete(data);
				});

				longPollSystem.on('reaction_add', (data) => {
					this.handleReactionAdd(data);
				});

				longPollSystem.on('reaction_remove', (data) => {
					this.handleReactionRemove(data);
				});

				longPollSystem.on('thread_create', (data) => {
					this.handleThreadCreate(data);
				});

				longPollSystem.on('thread_update', (data) => {
					this.handleThreadUpdate(data);
				});
			}
		}

		registerEventHandlers() {
			// メッセージ作成ハンドラ
			this.eventHandlers.set('message_create', [
				this.appendMessageToUI.bind(this),
				this.updateUnreadBadges.bind(this),
				this.triggerNotification.bind(this)
			]);

			// メッセージ削除ハンドラ
			this.eventHandlers.set('message_delete', [
				this.removeMessageFromUI.bind(this),
				this.updateUnreadBadges.bind(this)
			]);

			// リアクション追加ハンドラ
			this.eventHandlers.set('reaction_add', [
				this.updateReactionUI.bind(this)
			]);

			// リアクション削除ハンドラ
			this.eventHandlers.set('reaction_remove', [
				this.updateReactionUI.bind(this)
			]);

			// スレッド関連ハンドラ
			this.eventHandlers.set('thread_create', [
				this.updateThreadUI.bind(this)
			]);

			this.eventHandlers.set('thread_update', [
				this.updateThreadUI.bind(this)
			]);
		}

		// === イベントハンドラ実装 ===

		handleMessageCreate(data) {
			this.log('メッセージ作成イベント受信:', data);
			this.executeHandlers('message_create', data);
		}

		handleMessageDelete(data) {
			this.log('メッセージ削除イベント受信:', data);
			this.executeHandlers('message_delete', data);
		}

		handleReactionAdd(data) {
			this.log('リアクション追加イベント受信:', data);
			this.executeHandlers('reaction_add', data);
		}

		handleReactionRemove(data) {
			this.log('リアクション削除イベント受信:', data);
			this.executeHandlers('reaction_remove', data);
		}

		handleThreadCreate(data) {
			this.log('スレッド作成イベント受信:', data);
			this.executeHandlers('thread_create', data);
		}

		handleThreadUpdate(data) {
			this.log('スレッド更新イベント受信:', data);
			this.executeHandlers('thread_update', data);
		}

		executeHandlers(eventType, data) {
			const handlers = this.eventHandlers.get(eventType);
			if (!handlers) {
				return;
			}

			handlers.forEach(handler => {
				try {
					handler(data);
				} catch (error) {
					this.log(`ハンドラ実行エラー (${eventType}):`, error);
				}
			});
		}

		// === UI更新メソッド ===

		appendMessageToUI(data) {
			// 複数のメッセージ表示システムに対応
			const messageSystems = [
				this.uiComponents.chatMessages,
				window.LMSChat?.messages,
				window.chatMessages,
				window.lmsChat?.messages
			].filter(Boolean);

			for (const system of messageSystems) {
				if (system.appendMessage && typeof system.appendMessage === 'function') {
					try {
						system.appendMessage(data.message, data.isCurrentUser);
						this.log('メッセージをUIに追加:', data.message.id);
						break;
					} catch (error) {
						this.log('メッセージ追加エラー:', error);
					}
				}
			}

			// スクロール処理
			this.handleScrollAfterMessage(data);
		}

		removeMessageFromUI(data) {
			// メッセージ削除の処理
			const messageSystems = [
				this.uiComponents.chatMessages,
				window.LMSChat?.messages,
				window.chatMessages
			].filter(Boolean);

			for (const system of messageSystems) {
				if (system.removeMessage && typeof system.removeMessage === 'function') {
					try {
						system.removeMessage(data.messageId);
						this.log('メッセージをUIから削除:', data.messageId);
						break;
					} catch (error) {
						this.log('メッセージ削除エラー:', error);
					}
				}
			}
		}

		updateReactionUI(data) {
			// リアクション表示の更新
			const reactionSystems = [
				this.uiComponents.reactionsUI,
				window.LMSReactionsUI,
				window.LMSChat?.reactions
			].filter(Boolean);

			for (const system of reactionSystems) {
				if (system.updateReactionsDisplay && typeof system.updateReactionsDisplay === 'function') {
					try {
						system.updateReactionsDisplay(data.messageId, data.reactions);
						this.log('リアクションUIを更新:', data.messageId);
						break;
					} catch (error) {
						this.log('リアクション更新エラー:', error);
					}
				}
			}
		}

		updateThreadUI(data) {
			// スレッド表示の更新
			const threadSystems = [
				this.uiComponents.threadsUI,
				window.LMSThreadsUI,
				window.LMSChat?.threads
			].filter(Boolean);

			for (const system of threadSystems) {
				if (system.updateThreadDisplay && typeof system.updateThreadDisplay === 'function') {
					try {
						system.updateThreadDisplay(data.threadId, data.threadData);
						this.log('スレッドUIを更新:', data.threadId);
						break;
					} catch (error) {
						this.log('スレッド更新エラー:', error);
					}
				}
			}
		}

		updateUnreadBadges(data) {
			// 未読バッジの更新
			const badgeSystems = [
				this.uiComponents.badgeManager,
				window.LMSUnifiedBadgeManager,
				window.UnifiedBadgeManager
			].filter(Boolean);

			for (const system of badgeSystems) {
				if (system.updateBadges && typeof system.updateBadges === 'function') {
					try {
						system.updateBadges(data.channelId, data.unreadCount);
						this.log('バッジを更新:', data.channelId);
						break;
					} catch (error) {
						this.log('バッジ更新エラー:', error);
					}
				}
			}
		}

		triggerNotification(data) {
			// プッシュ通知のトリガー
			if (window.LMSPushNotification && data.shouldNotify) {
				try {
					window.LMSPushNotification.show(data.message);
					this.log('プッシュ通知を送信:', data.message.id);
				} catch (error) {
					this.log('プッシュ通知エラー:', error);
				}
			}
		}

		handleScrollAfterMessage(data) {
			// スクロール処理
			if (data.isCurrentUser) {
				// 自分のメッセージの場合は自動スクロール
				const scrollSystems = [
					this.uiComponents.scrollManager,
					window.UnifiedScrollManager,
					window.LMSScrollManager
				].filter(Boolean);

				for (const system of scrollSystems) {
					if (system.scrollToBottom && typeof system.scrollToBottom === 'function') {
						try {
							system.scrollToBottom(0, true, 'longpoll-integration');
							this.log('スクロールを実行');
							break;
						} catch (error) {
							this.log('スクロールエラー:', error);
						}
					}
				}
			}
		}

		// === デバッグ用メソッド ===

		getStatus() {
			return {
				initialized: this.initialized,
				uiComponents: Object.keys(this.uiComponents).reduce((acc, key) => {
					acc[key] = !!this.uiComponents[key];
					return acc;
				}, {}),
				eventHandlers: Array.from(this.eventHandlers.keys()),
				longPollConnected: !!window.unifiedLongPoll
			};
		}

		log(message, level = 'info') {
			if (!this.debugMode && level !== 'error') {
				return;
			}

			const prefix = '[LONGPOLL_INTEGRATION]';
			const timestamp = new Date().toISOString();
			
			switch (level) {
				case 'error':
						break;
				case 'warn':
						break;
				default:
			}
		}
	}

	// グローバル初期化
	document.addEventListener('DOMContentLoaded', function() {
		if (!window.lmsLongPollIntegrationHub) {
			window.lmsLongPollIntegrationHub = new LMSLongPollIntegrationHub();
		}
	});

	// 既にDOMが読み込まれている場合
	if (document.readyState !== 'loading') {
		if (!window.lmsLongPollIntegrationHub) {
			window.lmsLongPollIntegrationHub = new LMSLongPollIntegrationHub();
		}
	}

})();