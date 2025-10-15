(function ($) {
	'use strict';

	// デバッグコード削除済み

	window.LMSChat = window.LMSChat || {};

	/**
	 * 統合ロングポーリングクライアント（完全移行版）
	 *
	 * 既存のショートポーリングシステムを完全に置き換え、
	 * 効率的なロングポーリング接続を提供
	 */
	class LMSUnifiedLongPoll {
		constructor(options = {}) {
			this.config = Object.assign({
				endpoint: (typeof lmsLongPollConfig !== 'undefined' && lmsLongPollConfig?.endpoint) || '/wp-admin/admin-ajax.php?action=lms_unified_long_poll',
				timeout: 7000, // 7秒（PHP 5秒+余裕2秒、タイムアウト整合）
				maxConnections: 1, // 1のまま（適切）
				retryDelay: 2000, // 8秒→2秒（高速リトライ）
				maxRetries: 5, // 2→5（短時間リトライで安定性確保）
				debugMode: false, // デバッグ無効化
				batchSize: 20, // 10→20（効率向上）
				compressionEnabled: true // 圧縮有効化（転送量削減）
			}, options);

			this.state = {
			isActive: false,
			isConnecting: false,
			connectionId: null,
			eventHandlers: new Map(),
			retryCount: 0,
			lastEventId: 0,
			processedEventIds: new Set(), // 処理済みイベントID追跡
			lastProcessedTime: Date.now(), // 最後の処理時刻
			activeRequests: 0, // 同時リクエスト数追跡
			maxConcurrentRequests: 2 // 最大同時リクエスト数制限
		};

			this.connections = [];
			this.eventQueue = [];

			// イベントハンドラーの初期化
			this.initEventHandlers();

			// Debug output removed
		}

		/**
		 * イベントハンドラーの初期化
		 */
		initEventHandlers() {
			// デフォルトのイベントハンドラー
			this.on('message_create', this.handleMessageCreate.bind(this));
			this.on('message_delete', this.handleMessageDelete.bind(this));
			this.on('thread_create', this.handleThreadCreate.bind(this));
			this.on('thread_delete', this.handleThreadDelete.bind(this));
			this.on('reaction_update', this.handleReactionUpdate.bind(this));
			this.on('thread_reaction', this.handleThreadReactionUpdate.bind(this));
			this.on('thread_reaction_update', this.handleThreadReactionUpdate.bind(this)); // サーバーから送信される実際のイベントタイプ
		}

		/**
		 * イベントハンドラーの登録
		 */
		on(eventType, handler) {
			if (!this.state.eventHandlers.has(eventType)) {
				this.state.eventHandlers.set(eventType, []);
			}
			this.state.eventHandlers.get(eventType).push(handler);
		}

		/**
		 * イベントの発火
		 */
		emit(eventType, data) {
			const handlers = this.state.eventHandlers.get(eventType);
			if (handlers) {
				handlers.forEach(handler => {
					try {
						handler(data);
					} catch (error) {
						// Debug output removed
					}
				});
			}
		}

		/**
		 * ロングポーリング開始
		 */
		async start(eventTypes = 'all') {
		if (this.state.isActive) {
			return;
		}

		this.state.isActive = true;
		this.state.connectionId = 'conn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
		this.startPolling();
	}

		/**
		 * ポーリングの開始
		 */
		async startPolling() {
			// Debug output removed

			if (!this.state.isActive) {
				return;
			}

			this.state.isConnecting = true;
			// Debug output removed

			try {
				const response = await this.makeRequest();
				// Debug output removed

				if (response && response.success && response.data) {
					this.processEvents(response.data.events || []);
					this.state.retryCount = 0;
				}
			} catch (error) {
				// Debug output removed
				this.handleError(error);
			} finally {
				this.state.isConnecting = false;
			}

			// 次のポーリングをスケジュール（エラー時バックオフ機能付き）
			if (this.state.isActive) {
				// エラー回数に応じてバックオフ間隔を計算（最大5分）
				const baseInterval = 2000; // 2秒（30秒→2秒で15倍高速化、数秒以内の同期実現）
				const backoffMultiplier = Math.min(Math.pow(2, this.state.retryCount), 10); // 最大10倍
				const interval = Math.min(baseInterval * backoffMultiplier, 300000); // 最大5分
				
				setTimeout(() => this.startPolling(), interval);
			}
		}

		/**
		 * Ajax リクエストの実行
		 */
		async makeRequest() {
		// 同時リクエスト数制限チェック
		if (this.state.activeRequests >= this.state.maxConcurrentRequests) {
			throw new Error('Too many concurrent requests');
		}

		this.state.activeRequests++;

		// 📊 Phase 0: 計測開始
		const metricsStartTime = Date.now();

		const data = {
			action: 'lms_unified_long_poll',
			channel_id: this.getCurrentChannelId(),
			thread_id: this.getCurrentThreadId(),
			last_event_id: this.state.lastEventId,
			connection_id: this.state.connectionId,
			nonce: lmsLongPollConfig?.nonce || '',
			nonce_action: lmsLongPollConfig?.nonce_action || 'lms_ajax_nonce'
		};

		
			return new Promise((resolve, reject) => {
				$.ajax({
					url: lmsLongPollConfig?.ajaxUrl || '/wp-admin/admin-ajax.php',
					method: 'POST',
					data: data,
					timeout: this.config.timeout,
					success: (response) => {
					this.state.activeRequests--;

					// 📊 Phase 0: 成功を記録
					if (window.LMSPerformanceMetrics) {
						const duration = Date.now() - metricsStartTime;
						const eventsCount = (response && response.data && response.data.events)
							? response.data.events.length
							: 0;

						window.LMSPerformanceMetrics.recordRequest({
							type: 'unified',
							duration: duration,
							status: 'success',
							cache_hit: false,
							response_size: JSON.stringify(response).length,
							events_count: eventsCount
						});
					}

					resolve(response);
				},
				error: (xhr, status, error) => {
					this.state.activeRequests--;

					// 📊 Phase 0: エラー/タイムアウトを記録
					if (window.LMSPerformanceMetrics) {
						const duration = Date.now() - metricsStartTime;
						const isTimeout = status === 'timeout';

						window.LMSPerformanceMetrics.recordRequest({
							type: 'unified',
							duration: duration,
							status: isTimeout ? 'timeout' : 'error',
							cache_hit: false,
							response_size: 0,
							events_count: 0
						});
					}

					reject(new Error(`Ajax error: ${status} - ${error}`));
				}
				});
			});
		}

		/**
		 * イベントの処理
		 */
		processEvents(events) {
			if (!Array.isArray(events)) {
				return;
			}

			// 重複イベント防止とフィルタリング
			const newEvents = events.filter(event => {
				const eventId = parseInt(event.id);
				
				// 既に処理済みのイベントをスキップ
				if (this.state.processedEventIds.has(eventId)) {
					// Debug output removed
					return false;
				}
				
				// 古すぎるイベント（1時間以上前）をスキップ
				const eventTime = new Date(event.created_at || event.timestamp);
				const hourAgo = Date.now() - (60 * 60 * 1000);
				if (eventTime.getTime() < hourAgo) {
					// Debug output removed
					return false;
				}
				
				return true;
			});

			newEvents.forEach(event => {
				const eventId = parseInt(event.id);
				
				// 処理済みイベントとして記録
				this.state.processedEventIds.add(eventId);
				
				// lastEventId更新
				if (eventId > this.state.lastEventId) {
					this.state.lastEventId = eventId;
					// Debug output removed
				}

				// イベント処理
				this.emit(event.event_type || event.type, event);
			});

			// メモリ使用量制御: 処理済みイベントIDの古いものを削除（最新500件のみ保持）
			if (this.state.processedEventIds.size > 500) {
				const idsArray = Array.from(this.state.processedEventIds).sort((a, b) => b - a);
				this.state.processedEventIds = new Set(idsArray.slice(0, 500));
				// Debug output removed
			}

			// Debug output removed`);
		}

		/**
		 * エラーハンドリング
		 */
		handleError(error) {
			this.state.retryCount++;

			if (this.state.retryCount >= this.config.maxRetries) {
				// Debug output removed
				this.stop();
				return;
			}

			// Debug output removed
		}

		/**
		 * ロングポーリング停止
		 */
		stop() {
			this.state.isActive = false;
			this.state.isConnecting = false;
			// Debug output removed
		}

		/**
		 * 現在のチャンネルIDを取得
		 */
		getCurrentChannelId() {
			return window.LMSChat?.state?.currentChannel || 1;
		}

		/**
		 * 現在のスレッドIDを取得
		 */
		getCurrentThreadId() {
			return window.LMSChat?.state?.currentThread || 0;
		}

		/**
		 * ステータス取得
		 */
		getStatus() {
			return {
				isActive: this.state.isActive,
				isConnecting: this.state.isConnecting,
				connectionId: this.state.connectionId,
				retryCount: this.state.retryCount,
				lastEventId: this.state.lastEventId
			};
		}

		/**
		 * メッセージ作成イベントハンドラー
		 */
		handleMessageCreate(event) {
			// Debug output removed

			// チャンネル切り替え中は処理をスキップ
			if (window.LMSChat?.state?.isChannelSwitching) {
				return;
			}

			// チャンネル未選択時は処理しない
			const currentChannelName = $('#current-channel-name .channel-header-text').text();
			if (!currentChannelName || currentChannelName === 'チャンネルを選択してください') {
				// Debug output removed
				return;
			}

			// 現在のチャンネルと異なるメッセージは処理しない
			const currentChannelId = window.LMSChat?.state?.currentChannel;
			if (currentChannelId && event.channel_id && parseInt(event.channel_id) !== parseInt(currentChannelId)) {
				// Debug output removed
				return;
			}

			// 既存のappendMessage関数を使用（最優先）
			if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.appendMessage) {
				// Debug output removed
				
				// イベントデータからメッセージデータを構築
				const messageData = this.buildMessageDataFromEvent(event);
				if (messageData) {
					window.LMSChat.messages.appendMessage(messageData, { fromLongPoll: true });
					// Debug output removed
					return;
				}
			}

			// フォールバック: より簡潔なメッセージ表示を試行
			// Debug output removed
			this.constructAndDisplayMessage(event);
		}

		/**
		 * メッセージ削除イベントハンドラー
		 */
		handleMessageDelete(event) {
			// Debug output removed

			// 既存のhandleDeletedMessage関数を試行
			if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.handleDeletedMessage) {
				window.LMSChat.messages.handleDeletedMessage(event.data);
			} else {
				// フォールバック: 直接メッセージを削除する
				// Debug output removed
				this.displayDeletedMessage(event);
			}

			// メッセージ削除後に空の日付セパレーターをチェック・削除
			// 複数回試行して確実に削除
			setTimeout(() => {
				if (this.forceRemoveAllEmptyDateSeparators) {
					this.forceRemoveAllEmptyDateSeparators();
				}
			}, 100);
			
			// さらに遅延実行で確実性を上げる
			setTimeout(() => {
				if (this.forceRemoveAllEmptyDateSeparators) {
					this.forceRemoveAllEmptyDateSeparators();
				}
			}, 500);
			
			// 最終確認
			setTimeout(() => {
				if (this.forceRemoveAllEmptyDateSeparators) {
					this.forceRemoveAllEmptyDateSeparators();
				}
			}, 1000);
		}

	/**
	 * スレッドメッセージ作成イベントハンドラー
	 */
	handleThreadCreate(event) {
		if (window.LMSChat && window.LMSChat.threads && window.LMSChat.threads.handleNewMessage) {
			window.LMSChat.threads.handleNewMessage(event.data);
		}

		$(document).trigger('lms_longpoll_thread_message_posted', event.data);

		const parentMessageId = event.data?.parent_message_id || event.data?.parentMessageId;

		if (parentMessageId && typeof window.refreshThreadInfo === 'function') {
			try {
				window.refreshThreadInfo(parentMessageId, { optimisticData: { delta: +1 } });
			} catch (error) {
				// エラー時も処理継続
			}
		}
	}

	/**
	 * スレッドメッセージ削除イベントハンドラー
	 */
	handleThreadDelete(event) {
		if (window.LMSChat && window.LMSChat.threads && window.LMSChat.threads.handleDeletedMessage) {
			window.LMSChat.threads.handleDeletedMessage(event.data);
		}

		$(document).trigger('lms_longpoll_thread_message_deleted', event.data);

		const parentMessageId = event.data?.parent_message_id || event.data?.parentMessageId;

		if (parentMessageId && typeof window.refreshThreadInfo === 'function') {
			try {
				window.refreshThreadInfo(parentMessageId, { optimisticData: { delta: -1 } });
			} catch (error) {
				// エラー時も処理継続
			}
		}
	}
		/**
		 * リアクション更新イベントハンドラー
		 */
		handleReactionUpdate(event) {
			try {
				const messageId = event.message_id || event.data?.message_id;
				const reactions = event.data?.reactions;
				
				if (!messageId) {
					return;
				}

				// メインメッセージのリアクション更新
				if (window.LMSChat && window.LMSChat.reactionUI && window.LMSChat.reactionUI.updateMessageReactions) {
					window.LMSChat.reactionUI.updateMessageReactions(messageId, reactions, false, true);
				} else if (window.LMSChat && window.LMSChat.updateMessageReactions) {
					window.LMSChat.updateMessageReactions(messageId, reactions);
				}

				// イベントをトリガー
				$(document).trigger('reaction:updated', {
					messageId: messageId,
					reactions: reactions,
					timestamp: Date.now()
				});
			} catch (error) {
				// エラーハンドリング（本番環境ではログ無し）
			}
		}

		/**
		 * スレッドリアクション更新イベントハンドラー
		 */
		handleThreadReactionUpdate(event) {
		// 時間ベース更新頻度制限システム
		const messageId = event.message_id || event.data?.message_id;
		const threadId = event.thread_id || event.data?.thread_id;
		const reactions = event.data?.reactions || [];
		
		if (!messageId || !threadId) {
			return;
		}
		
		// 時間ベースの更新頻度制限（同一メッセージは500ms以内の更新を制限）
		const now = Date.now();
		const updateKey = `thread_${messageId}`;
		
		if (!this.state.lastUpdateTimes) {
			this.state.lastUpdateTimes = new Map();
		}
		
		const lastUpdateTime = this.state.lastUpdateTimes.get(updateKey);
		if (lastUpdateTime && (now - lastUpdateTime) < 500) {
			// 500ms以内の更新は無視（UI更新頻度制限）
			return;
		}
		
		// 更新時刻を記録
		this.state.lastUpdateTimes.set(updateKey, now);
		
		// メモリ使用量制御（100件超過で古いものを削除）
		if (this.state.lastUpdateTimes.size > 100) {
			const entries = Array.from(this.state.lastUpdateTimes.entries());
			this.state.lastUpdateTimes.clear();
			// 最新50件のみ保持
			entries.slice(-50).forEach(([key, time]) => 
				this.state.lastUpdateTimes.set(key, time)
			);
		}

		try {
				
				if (!messageId || !threadId) {
					return;
				}

				// スレッドメッセージのリアクション更新（統一システム経由）
				let unifiedSystem = window.LMSChat?.threadReactionUnified;
				
				// 統一システムが見つからない場合のリトライ機能
				if (!unifiedSystem) {
					// 統一システム初回検出失敗、リトライ中
					
					// 短時間待機後にリトライ
					setTimeout(() => {
						const retryUnifiedSystem = window.LMSChat?.threadReactionUnified;
						if (retryUnifiedSystem) {
							// 統一システム遅延検出成功
							this.processThreadReactionUpdate(messageId, threadId, reactions, retryUnifiedSystem);
						} else {
							this.fallbackThreadReactionUpdate(messageId, reactions);
						}
					}, 150);
					return;
				}
				
				if (unifiedSystem) {
					let shouldUpdateUI = true;
					
					// 楽観的UI更新の競合保護チェック
					if (window.LMSChat.optimisticProtection) {
						const now = Date.now();
						const currentUserId = window.lmsChat?.currentUserId;
						
						// 各リアクションの保護状態をチェック
						for (const reaction of reactions) {
							const protectionKey = `thread_${messageId}_${reaction.emoji}_${currentUserId}`;
							const protection = window.LMSChat.optimisticProtection.get(protectionKey);
							
							if (protection && protection.expires > now) {
								// 保護期間中は楽観的更新を優先
								shouldUpdateUI = false;
								break;
							}
						}
						
						// 期限切れの保護エントリをクリーンアップ
						for (const [key, protection] of window.LMSChat.optimisticProtection.entries()) {
							if (protection.expires <= now) {
								window.LMSChat.optimisticProtection.delete(key);
							}
						}
					}
						
					if (shouldUpdateUI) {
						// スレッドリアクションUI更新実行
						
						unifiedSystem.updateReactions(messageId, reactions, {
							source: 'unified-longpoll',
							timestamp: Date.now(),
							threadId: threadId
						});
					} else {
						// スレッドリアクションUI更新スキップ (保護期間中)
					}
				}

				// リアクションキャッシュを更新
				if (window.LMSChat && window.LMSChat.reactionCache && window.LMSChat.reactionCache.setThreadReactionsCache) {
					window.LMSChat.reactionCache.setThreadReactionsCache(messageId, reactions);
				}

				// イベントをトリガー
				$(document).trigger('thread_reaction:updated', {
					messageId: messageId,
					threadId: threadId,
					reactions: reactions,
					timestamp: Date.now()
				});
			} catch (error) {
				// エラーハンドリング（本番環境ではログ無し）
			}
		}

		/**
		 * イベントデータからメッセージデータを構築
		 */
		buildMessageDataFromEvent(event) {
			try {
				// イベントから必要なデータを抽出 - フェーズ1修正により直接取得可能
				const messageId = event.message_id || event.data?.message_id;
				const channelId = event.channel_id;     // 🔥 修正: 直接取得（フェーズ1修正により復旧）
				const userId = event.user_id;           // 🔥 修正: 直接取得（フェーズ1修正により復旧）
				
				// Debug output removed

				// イベントデータに完全な詳細情報が含まれているかチェック
				// 🔥 修正: より柔軟な判定条件に変更
				if (event.data && typeof event.data === 'object' && 
					channelId && userId && 
					(event.data.user_name || event.data.display_name) &&    // ユーザー名のいずれかがあればOK
					(event.data.message || event.data.content)) {           // メッセージのいずれかがあればOK
					
					// 詳細データが完全に含まれている場合はそのまま使用
					const messageData = {
						id: messageId,
						message_id: messageId,
						channel_id: channelId,
						user_id: userId,
						user_name: event.data.user_name,
						display_name: event.data.user_name,      // 🔥 追加: appendMessage用
						message: event.data.message || event.data.content,
						content: event.data.message || event.data.content,  // 🔥 追加: 互換性
						created_at: event.data.created_at || new Date().toISOString(),
						timestamp: event.data.timestamp || event.data.created_at || new Date().toISOString(),
						// appendMessage関数が期待する追加フィールド
						is_current_user: userId && userId == (window.lmsChat?.currentUserId || $('#chat-messages').data('current-user-id')),
						read_status: null,
						deleted_at: null,     // 🔥 追加: 削除状態確認用
						is_deleted: 0         // 🔥 追加: 削除状態確認用
					};

					// Debug output removed
					return messageData;
				}

				// データが不完全な場合はnullを返して、Ajaxで詳細取得するフォールバックに任せる
				// Debug output removed
				return null;

			} catch (error) {
				// Debug output removed
				return null;
			}
		}

		/**
		 * メッセージをイベントデータから構築して表示
		 */
		constructAndDisplayMessage(event) {
			try {
				const messageId = event.message_id || event.data?.message_id;
				const channelId = event.channel_id || event.data?.channel_id || window.LMSChat?.state?.currentChannel;
				const userId = event.user_id || event.data?.user_id;
				
				// Debug output removed

				// チャンネル切り替え中は処理をスキップ
				if (window.LMSChat?.state?.isChannelSwitching) {
					return;
				}

				// チャンネル未選択時は処理しない
				const currentChannelName = $('#current-channel-name .channel-header-text').text();
				if (!currentChannelName || currentChannelName === 'チャンネルを選択してください') {
					// Debug output removed
					return;
				}

				// 現在のチャンネルと異なるメッセージは処理しない
				const currentChannelId = window.LMSChat?.state?.currentChannel;
				if (currentChannelId && channelId && parseInt(channelId) !== parseInt(currentChannelId)) {
					// Debug output removed
					return;
				}

				// Ajax でメッセージ詳細を取得してから表示
				const self = this;
				$.ajax({
					url: window.lmsLongPollConfig?.ajaxUrl || '/wp-admin/admin-ajax.php',  // 🔥 修正: 設定値使用
					method: 'POST',
					data: {
						action: 'lms_get_message_details',
						message_id: messageId,
						nonce: window.lmsLongPollConfig?.nonce || window.lms_ajax_obj?.nonce || ''
					},
					timeout: 10000,  // 🔥 修正: タイムアウト延長（5秒→10秒）
					success: function(response) {
						if (response.success && response.data) {
							// Debug output removed
							
							// 取得したデータでappendMessage呼び出し
							if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.appendMessage) {
								window.LMSChat.messages.appendMessage(response.data, { fromLongPoll: true });
								// Debug output removed
							}
						} else {
							// Debug output removed
							self.fallbackMessageConstruction(event, messageId, channelId, userId, currentChannelId);
						}
					},
					error: function(xhr, status, error) {
						// Debug output removed
						self.fallbackMessageConstruction(event, messageId, channelId, userId, currentChannelId);
					}
				});
			} catch (error) {
				// Debug output removed
			}
		}
		
		fallbackMessageConstruction(event, messageId, channelId, userId, currentChannelId) {
			// メッセージデータを構築（イベントデータ + デフォルト値）
			const messageData = {
				id: messageId,
				message_id: messageId,
				channel_id: channelId || currentChannelId,
				user_id: userId,
				user_name: event.data?.user_name || event.data?.display_name || '取得中...',      // 🔥 修正: より適切なフォールバック
				message: event.data?.message || event.data?.content || '内容を取得中...',     // 🔥 修正: より適切なフォールバック
				created_at: event.data?.created_at || new Date().toISOString(),
				timestamp: event.data?.timestamp || new Date().toISOString(),
				is_current_user: false,
				read_status: null,
				formatted_time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
			};

				// Debug output removed

			// 既存のappendMessage関数を使用
			if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.appendMessage) {
				window.LMSChat.messages.appendMessage(messageData, { fromLongPoll: true });
				// Debug output removed
			} else {
				// Debug output removed
				this.displayNewMessage(event);
			}
		}

		/**
		 * 新しいメッセージを直接表示するフォールバック関数
		 */
		displayNewMessage(event) {
			try {
				// チャンネル未選択時は表示しない
				const currentChannelName = $('#current-channel-name .channel-header-text').text();
				if (!currentChannelName || currentChannelName === 'チャンネルを選択してください') {
					// Debug output removed
					return;
				}
				
				// 現在のチャンネルと異なるメッセージは表示しない
				const currentChannelId = window.LMSChat?.state?.currentChannel;
				if (currentChannelId && event.channel_id && parseInt(event.channel_id) !== parseInt(currentChannelId)) {
					// Debug output removed
					return;
				}
				
				const messageId = event.message_id;
				const channelId = event.channel_id;
				
				// 既に詳細取得に失敗したメッセージは簡易表示に直行
				const failedKey = `failed_${messageId}`;
				if (this.state.processedEventIds.has(failedKey)) {
					// Debug output removed
					this.displaySimpleMessage(event);
					return;
				}
				
				// 既存のメッセージが存在するかチェック（より詳細なセレクター）
				const existingMessage = $(`.message-item[data-message-id="${messageId}"], .message[data-id="${messageId}"], [data-message-id="${messageId}"]`);
				if (existingMessage.length > 0) {
					// Debug output removed
					return;
				}
				
				// Debug output removed

				// Ajax でメッセージデータを取得して表示
				$.ajax({
					url: '/wp-admin/admin-ajax.php',
					method: 'POST',
					data: {
						action: 'lms_get_message_details',
						message_id: messageId,
						channel_id: channelId,
						nonce: window.lmsLongPollConfig?.nonce || window.lms_ajax_obj?.nonce || ''
					},
					timeout: 10000,
					success: (response) => {
						// Debug output removed
						if (response.success && response.data) {
							// 既存のappendMessage関数を使用
							if (window.LMSChat && window.LMSChat.messages && window.LMSChat.messages.appendMessage) {
								// Debug output removed
								window.LMSChat.messages.appendMessage(response.data, { fromLongPoll: true });
								// Debug output removed
							} else {
								// フォールバック: 直接チャットに追加
								this.appendMessageToChat(response.data);
								// Debug output removed
							}
						} else {
							// Debug output removed
							
							// 失敗をキャッシュに記録して今後のリクエストを回避
							const failedKey = `failed_${messageId}`;
							this.state.processedEventIds.add(failedKey);
							
							// エラーの詳細を表示
							if (response.data && response.data.message) {
								// Debug output removed
							}
							
							// フォールバック: メッセージが見つからない場合でも簡易表示
							// Debug output removed
							this.displaySimpleMessage(event);
						}
					},
					error: (xhr, status, error) => {
						// Debug output removed
						
						// Ajaxエラー時も失敗をキャッシュに記録
						const failedKey = `failed_${messageId}`;
						this.state.processedEventIds.add(failedKey);
						
						// フォールバック表示
						this.displaySimpleMessage(event);
					}
				});
			} catch (error) {
				// Debug output removed
			}
		}

		/**
		 * メッセージを削除表示するフォールバック関数
		 */
		displayDeletedMessage(event) {
			try {
				const messageId = event.message_id;
				const messageElement = $(`[data-message-id="${messageId}"]`);
				
				if (messageElement.length > 0) {
					// 🔥 修正: 削除処理の重複を防ぐ
					if (messageElement.hasClass('deleting')) {
						// Debug output removed
						return;
					}
					
					// 削除中マークを追加
					messageElement.addClass('deleting');
					
					// メッセージの日付を取得（削除前に）
					const messageDate = this.getMessageDate(messageElement);
					
					messageElement.fadeOut(300, function() {
						$(this).remove();
						// Debug output removed
						
						// 🔥 修正: DOM更新が完全に完了してから日付セパレーターチェック
						if (messageDate) {
							// requestAnimationFrameを使用してDOM更新完了を保証
							requestAnimationFrame(() => {
								setTimeout(() => {
									window.UnifiedLongPollClient.checkAndRemoveDateSeparator(messageDate);
								}, 100);  // さらに確実な遅延
							});
						}
					});
				} else {
						// 🔥 追加: より詳細なデバッグ情報
					// Debug output removed
					// Debug output removed
					
					// 🔥 修正: メッセージが見つからない場合でも包括的な日付セパレーターチェックを実行
					// Debug output removed
					
					// 複数の日付フォーマットで試行
					const today = new Date();
					const dateFormats = [
						today.toISOString().split('T')[0],  // 2025-09-20
						today.toDateString(),               // Sat Sep 20 2025
						today.toLocaleDateString('ja-JP'),  // 2025/9/20
						`${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`, // 2025年9月20日
						`${today.getMonth() + 1}月${today.getDate()}日`, // 9月20日
						`${today.getDate()}日`, // 20日
					];
					
					if (window.UnifiedLongPollClient && window.UnifiedLongPollClient.checkAndRemoveDateSeparator) {
						dateFormats.forEach((dateFormat, index) => {
							requestAnimationFrame(() => {
								setTimeout(() => {
									// Debug output removed
									window.UnifiedLongPollClient.checkAndRemoveDateSeparator(dateFormat);
								}, 100 * (index + 1));  // 時間差で実行
							});
						});
					}
					
					// 🔥 追加: 強制的なセパレーター削除も試行
					setTimeout(() => {
						// Debug output removed
						window.UnifiedLongPollClient.forceRemoveAllEmptyDateSeparators();
					}, 1000);
				}
			} catch (error) {
				// Debug output removed
			}
		}

		/**
		 * メッセージ要素から日付を取得
		 */
		getMessageDate(messageElement) {
			try {
				// メッセージの日付を様々な方法で取得を試行
				const timestamp = messageElement.find('[data-timestamp]').attr('data-timestamp') ||
					messageElement.find('.message-time').attr('data-timestamp') ||
					messageElement.attr('data-timestamp');

				if (timestamp) {
					const date = new Date(timestamp);
					return date.toDateString(); // "Mon Jan 01 2024" 形式
				}

				// フォールバック: 現在の日付
				return new Date().toDateString();
			} catch (error) {
				// Debug output removed
				return null;
			}
		}

		/**
		 * 日付セパレーターのチェックと削除
		 */
		checkAndRemoveDateSeparator(targetDate) {
			try {
				// Debug output removed

				// その日付のメッセージが他にあるかチェック（削除済み除外）
				const messagesOnDate = this.getMessagesForDate(targetDate);
				
				// 🔥 修正: 詳細デバッグ情報追加
				const allMessages = $('.chat-message, .message-item, [data-message-id]').length;
				const visibleMessages = $('.chat-message:visible, .message-item:visible, [data-message-id]:visible').length;
				const deletedMessages = $('.message-deleted, .deleted-message, [data-deleted="true"]').length;
				
				// Debug output removed
				
				if (messagesOnDate.length === 0) {
					// Debug output removed
					this.removeDateSeparator(targetDate);
				} else {
					// Debug output removed
				}
			} catch (error) {
				// Debug output removed
			}
		}

		/**
		 * 指定日付のメッセージを取得
		 */
		getMessagesForDate(targetDate) {
			const messages = [];
			let debugInfo = {
				total: 0,
				visible: 0,
				excluded: 0,
				targetMatches: 0,
				sampleDates: []
			};
			
			// 🔥 修正: 詳細なデバッグ情報付きでメッセージを検索
			$('.chat-message, .message-item, [data-message-id]').each(function() {
				debugInfo.total++;
				const messageElement = $(this);
				
				// 可視性チェック
				if (!messageElement.is(':visible')) {
					debugInfo.excluded++;
					return;
				}
				debugInfo.visible++;
				
				// 削除状態チェック
				if (messageElement.hasClass('message-deleted') || 
					messageElement.hasClass('deleted-message') || 
					messageElement.hasClass('deleting') ||
					messageElement.hasClass('hidden') ||
					messageElement.attr('data-deleted') === 'true') {
					debugInfo.excluded++;
					return;
				}
				
				const messageDate = window.UnifiedLongPollClient.getMessageDate(messageElement);
				
				// サンプル日付を収集（最初の10個）
				if (debugInfo.sampleDates.length < 10) {
					debugInfo.sampleDates.push(messageDate);
				}
				
				if (messageDate === targetDate) {
					debugInfo.targetMatches++;
					messages.push(messageElement);
				}
			});
			
			// 🔥 追加: 詳細デバッグログ
			// Debug output removed
			
			return messages;
		}

		/**
		 * 日付セパレーターを削除
		 */
		removeDateSeparator(targetDate) {
			try {
				// 🔥 修正: より包括的な日付セパレーターのセレクターを試行
				const dateSelectors = [
					'.date-separator',
					'.message-date-separator', 
					'.chat-date-separator',
					'.date-divider',
					'[data-date-separator]',
					'.day-separator',
					'.message-group-separator', 
					'.timestamp-separator',
					'h3', 'h4', 'h5',  // 🔥 追加: 見出し要素も確認
					'[class*="date"]', 
					'[class*="separator"]',
					'[id*="date"]',
					'[id*="separator"]',
					'div:contains("2025年9月20日")', // 🔥 追加: 具体的な日付を含む要素
					'div:contains("9月20日")',
					'div:contains("20日")'
				];

				let removed = false;
				let foundSeparators = [];
				
				// 🔥 修正: まず全ての日付セパレーターを検索してデバッグ
				const self = this;
				dateSelectors.forEach(function(selector) {
					$(selector).each(function() {
						const separatorElement = $(this);
						const separatorText = separatorElement.text();
						foundSeparators.push({
							selector,
							text: separatorText,
							visible: separatorElement.is(':visible'),
							element: separatorElement[0]
						});
						
						// 日付セパレーターのテキストに対象日付が含まれているかチェック
						if (self.isDateMatch(separatorText, targetDate)) {
							// Debug output removed
							separatorElement.fadeOut(300, function() {
								$(this).remove();
								// Debug output removed
								removed = true;
							});
						}
					});
				});

				// 🔥 追加: 詳細デバッグ情報
				// Debug output removed

				if (!removed && foundSeparators.length > 0) {
					// Debug output removed
				} else if (!removed) {
					// Debug output removed
				}

			} catch (error) {
				// Debug output removed
			}
		}

		/**
		 * 日付マッチング
		 */
		isDateMatch(separatorText, targetDate) {
			try {
				const targetDateObj = new Date(targetDate);
				const targetYear = targetDateObj.getFullYear();
				const targetMonth = targetDateObj.getMonth() + 1;
				const targetDay = targetDateObj.getDate();

				// 様々な日付フォーマットに対応
				const patterns = [
					`${targetYear}/${targetMonth}/${targetDay}`,
					`${targetYear}-${targetMonth.toString().padStart(2, '0')}-${targetDay.toString().padStart(2, '0')}`,
					`${targetMonth}/${targetDay}`,
					`${targetMonth}月${targetDay}日`
				];

				// 🔥 追加: 詳細マッチング情報
				const matchResult = patterns.some(pattern => separatorText.includes(pattern));
				
				if (window.lmsDebugMode || separatorText.includes('2025')) {  // デバッグモードまたは現在年を含む場合
					// Debug output removed
				}

				return matchResult;
			} catch (error) {
				// Debug output removed
				return false;
			}
		}

		/**
		 * すべての空の日付セパレーターを強制削除
		 */
		forceRemoveAllEmptyDateSeparators() {
			try {
				// Debug output removed
				
				// チャンネル選択状態に関係なく、すべてのコンテナから検索
				const containerSelectors = [
					'#chat-messages',
					'.chat-messages',
					'.messages-container',
					'.chat-message-list',
					'#messages-container',
					'.message-container',
					'body' // 最終的にbody全体を検索
				];
				
				// 日付セパレーター候補を検索（包括的なセレクター）
				const separatorSelectors = [
					'.chat-separator',
					'.date-separator', 
					'.message-separator',
					'.day-separator',
					'[class*="separator"]',
					'[class*="divider"]',
					'.separator',
					'.divider'
				];
				
				let removedCount = 0;
				
				// 各コンテナで検索
				containerSelectors.forEach(containerSelector => {
					const $container = $(containerSelector);
					if ($container.length === 0) return;
					
					separatorSelectors.forEach(selector => {
						const separators = $container.find(selector);
					
						separators.each((index, element) => {
							const $separator = $(element);
							const separatorText = $separator.text().trim();
							
							// 日付パターンをチェック
							const datePatterns = [
								/^[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日/,
								/^[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}/,
								/^[0-9]{4}-[0-9]{2}-[0-9]{2}/,
								/^今日$/,
								/^昨日$/,
								/^Yesterday$/,
								/^Today$/
							];
							
							const isDateSeparator = datePatterns.some(pattern => pattern.test(separatorText));
							
							if (isDateSeparator) {
								// このセパレーターより後のメッセージをチェック
								let hasVisibleMessages = false;
								let $nextElement = $separator.next();
								
								// 次のセパレーターまたは終端まで調べる
								while ($nextElement.length > 0) {
									// 次のセパレーターに到達したかチェック
									let isNextSeparator = false;
									separatorSelectors.forEach(sepSelector => {
										if ($nextElement.is(sepSelector)) {
											const nextText = $nextElement.text().trim();
											if (datePatterns.some(pattern => pattern.test(nextText))) {
												isNextSeparator = true;
											}
										}
									});
									
									if (isNextSeparator) {
										break;
									}
									
									// メッセージかどうかチェック
									if ($nextElement.hasClass('message') || 
										$nextElement.hasClass('chat-message') ||
										$nextElement.find('.message, .chat-message').length > 0) {
										
										// 削除されていないメッセージがあるかチェック
										if ($nextElement.is(':visible') && 
											!$nextElement.hasClass('deleted') &&
											!$nextElement.hasClass('message-deleted') &&
											!$nextElement.find('.deleted, .message-deleted').length) {
											hasVisibleMessages = true;
											break;
										}
									}
									
									$nextElement = $nextElement.next();
								}
								
								// 表示可能なメッセージがない場合はセパレーターを削除
								if (!hasVisibleMessages) {
										// Debug output removed
									$separator.remove();
									removedCount++;
								}
							}
						});
					});
				});
				
				// Debug output removed
				return removedCount;
				
			} catch (error) {
				// Debug output removed
				return 0;
			}
		}

		/**
		 * チャットにメッセージを追加する
		 */
		appendMessageToChat(messageData) {
			try {
				// メッセージコンテナを探す（より多くのセレクターを試行）
				const chatContainer = $('#chat-messages, .chat-messages, .messages-container, .chat-message-list, #messages-container, .message-container').first();
				
				// Debug output removed
				
				if (chatContainer.length === 0) {
					// Debug output removed
					// 代替案: 任意のメッセージコンテナを探す
					const fallbackContainer = $('body').find('*').filter(function() {
						return $(this).attr('id') && $(this).attr('id').includes('message');
					}).first();
					
					if (fallbackContainer.length > 0) {
						// Debug output removed);
						this.appendToFallbackContainer(fallbackContainer, messageData);
						return;
					}
					
					// Debug output removed
					return;
				}

				// 簡単なメッセージHTMLを生成
				const messageHtml = `
					<div class="message-item" data-message-id="${messageData.id}">
						<div class="message-content">
							<strong>${messageData.user_name || 'Unknown'}</strong>: 
							${messageData.message || ''}
						</div>
						<div class="message-time">${messageData.created_at || ''}</div>
					</div>
				`;

				// メッセージを追加
				chatContainer.append(messageHtml);
				
				// 最下部にスクロール
				chatContainer.scrollTop(chatContainer[0].scrollHeight);
				
				// Debug output removed
				
			} catch (error) {
				// Debug output removed
			}
		}

		/**
		 * フォールバックコンテナにメッセージを追加
		 */
		appendToFallbackContainer(container, messageData) {
			try {
				const messageHtml = `
					<div class="unified-longpoll-message" data-message-id="${messageData.id}" style="padding: 10px; border: 1px solid #ddd; margin: 5px 0; background: #f9f9f9;">
						<strong>${messageData.user_name || 'Unknown'}</strong>: ${messageData.message || ''}
						<br><small>${messageData.created_at || ''}</small>
					</div>
				`;
				container.append(messageHtml);
				// Debug output removed);
			} catch (error) {
				// Debug output removed
			}
		}

		/**
		 * 簡易メッセージ表示（データベースから詳細を取得できない場合のフォールバック）
		 */
		displaySimpleMessage(event) {
			try {
				// チャンネル未選択時は表示しない
				const currentChannelName = $('#current-channel-name .channel-header-text').text();
				if (!currentChannelName || currentChannelName === 'チャンネルを選択してください') {
					// Debug output removed
					return;
				}
				
				// 現在のチャンネルと異なるメッセージは表示しない
				const currentChannelId = window.LMSChat?.state?.currentChannel;
				if (currentChannelId && event.channel_id && parseInt(event.channel_id) !== parseInt(currentChannelId)) {
					// Debug output removed
					return;
				}
				
				// Debug output removed
				
				const messageId = event.message_id || event.data?.message_id;
			const channelId = event.channel_id || event.data?.channel_id;
			const userId = event.user_id || event.data?.user_id;
			// ユーザー名の取得（優先順位付き）
			let userName = event.user_name || event.data?.user_name;
			if (!userName) {
				// 現在のユーザーIDと一致するかチェック
				const currentUserId = $('#chat-messages').data('current-user-id');
				if (userId && parseInt(userId) === parseInt(currentUserId)) {
					userName = '自分';
				} else if (userId) {
					userName = `ユーザー${userId}`;
				} else {
					userName = 'ゲストユーザー';
				}
			}
				
				if (!messageId) {
					// Debug output removed
					return;
				}

				// 既存のメッセージが存在するかチェック
				const existingMessage = $(`.message-item[data-message-id="${messageId}"], .message[data-id="${messageId}"], [data-message-id="${messageId}"]`);
				if (existingMessage.length > 0) {
					// Debug output removed
					return;
				}

				// メッセージコンテナを探す
				const chatContainer = $('#chat-messages, .chat-messages, .messages-container, .chat-message-list, #messages-container, .message-container').first();
				
				if (chatContainer.length === 0) {
					// Debug output removed
					return;
				}

				// 正しいメッセージフォーマットで簡易表示HTMLを生成
				const currentTime = new Date().toLocaleTimeString('ja-JP', {
					hour: '2-digit',
					minute: '2-digit'
				});
				
				const messageHtml = `
					<div class="chat-message complement-processed viewed-once" data-message-id="${messageId}" data-user-id="${userId}" data-read-status="null">
						<div class="message-header">
							<div class="message-meta">
								<span class="message-time" data-timestamp="${new Date().toISOString()}">${currentTime}</span>
								<span class="user-name other-user-name">${userName}</span>
							</div>
							<a href="#" class="thread-button" data-message-id="${messageId}">
								<img src="https://lms.local/wp-content/themes/lms/img/icon-thread.svg" alt="" class="thread-icon">
								<span class="thread-text">スレッドに返信する</span>
							</a>
						</div>
						<div class="message-content">
							<div class="message-text">新しいメッセージ (ID: ${messageId}) ※簡易表示</div>
							<div class="message-actions">
								<button class="action-button add-reaction" aria-label="リアクションを追加">
									<img src="https://lms.local/wp-content/themes/lms/img/icon-emoji.svg" alt="絵文字" width="20" height="20">
								</button>
							</div>
						</div>
						<div class="message-reactions" data-reactions-hydrated="0"></div>
					</div>
				`;

				// メッセージを追加
				chatContainer.append(messageHtml);
				
				// 最下部にスクロール
				chatContainer.scrollTop(chatContainer[0].scrollHeight);
				
				// Debug output removed
				
			} catch (error) {
				// Debug output removed
			}
				}

		/**
		 * スレッドリアクション更新の処理（ヘルパー関数）
		 */
		processThreadReactionUpdate(messageId, threadId, reactions, unifiedSystem) {
			try {
				let shouldUpdateUI = true;
				
				// 楽観的UI更新の競合保護チェック
				if (window.LMSChat.optimisticProtection) {
					const now = Date.now();
					const currentUserId = window.lmsChat?.currentUserId;
					
					// 各リアクションの保護状態をチェック
					for (const reaction of reactions) {
						const protectionKey = `thread_${messageId}_${reaction.emoji}_${currentUserId}`;
						const protection = window.LMSChat.optimisticProtection.get(protectionKey);
						
						if (protection && protection.expires > now) {
							// 保護期間中は楽観的更新を優先
							shouldUpdateUI = false;
							break;
						}
					}
					
					// 期限切れの保護エントリをクリーンアップ
					for (const [key, protection] of window.LMSChat.optimisticProtection.entries()) {
						if (protection.expires <= now) {
							window.LMSChat.optimisticProtection.delete(key);
						}
					}
				}
					
		if (shouldUpdateUI) {
			unifiedSystem.updateReactions(messageId, reactions, {
				source: 'unified-longpoll',
				timestamp: Date.now(),
				threadId: threadId
			});
		} else {
			// スレッドリアクションUI更新スキップ (保護期間中)
		}
			} catch (error) {
			}
		}

		/**
		 * フォールバック用のスレッドリアクション更新
		 */
		fallbackThreadReactionUpdate(messageId, reactions) {
			try {
			if (window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
					window.LMSChat.reactionUI.updateThreadMessageReactions(messageId, reactions, true, true);
				} else if (window.LMSChat?.updateThreadMessageReactions) {
					window.LMSChat.updateThreadMessageReactions(messageId, reactions);
				} else {
				}
			} catch (error) {
			}
		}
	}

	// グローバルインスタンスを作成
	window.UnifiedLongPollClient = new LMSUnifiedLongPoll();

	// 初期化
	$(document).ready(function() {
		if (window.lmsLongPollConfig && (window.lmsLongPollConfig.enabled || window.lmsLongPollConfig.features?.longpoll_enabled)) {
			// Debug output removed
			window.UnifiedLongPollClient.start();
		}
	});

})(jQuery);
