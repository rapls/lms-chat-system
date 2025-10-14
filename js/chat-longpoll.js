(function ($) {
	'use strict';

	// グローバルフラグを設定（デバッグコマンド用）
	window.LMS_LONGPOLL_ACTIVE = true;
	window.LMS_BASIC_LONGPOLL_LOADED = true;
	window.LMS_SHORTPOLL_DISABLED = true; // ショートポーリングは無効

	// LMSChatオブジェクトの初期化
	window.LMSChat = window.LMSChat || {};
	window.LMSChat.state = window.LMSChat.state || {};

	// Long Pollingの状態管理
	let longPollState = {
		isConnected: false,
		isConnecting: false,
		isPaused: false,
		channelId: null,
		threadId: null,
		lastUpdate: null,
		lastMessageId: 0,
		lastEventId: 0,
		reconnectAttempts: 0,
		maxReconnectAttempts: 5,
		reconnectDelay: 5000,
		totalRequests: 0,
		messageEvents: 0,
		deleteEvents: 0,
		errorEvents: 0,
		listeners: new Map(),
		compressionEnabled: true,
		timeoutDuration: 30000, // 30秒のLong Polling
		currentXhr: null,
		pollDelayTimer: null,
		isInactiveMode: false,
		currentTimeout: 30000,
		currentPollDelay: 3000,
		lastReactionTimestamp: 0,
		lastThreadReactionTimestamp: 0,
		reactionPollingEnabled: true,
		reactionPollingInProgress: false,
		lastUserActivity: Date.now(),
		activeRequests: 0, // 同時リクエスト数追跡
		maxConcurrentRequests: 2, // 最大同時リクエスト数制限
		isActiveUser: true
	};

	const logDebug = (window.LMSChat.reactionCore && window.LMSChat.reactionCore.logDebug) || (() => {});

	// nonce取得関数
	function getNonce() {
		return window.lms_ajax_obj?.nonce || window.lms_chat_ajax?.nonce || '';
	}

	// ポーリング開始
	function connect(channelId, threadId) {
		// Long Polling connect呼び出し (debug log removed)

		const targetChannelId = parseInt(channelId, 10) || 0;
		const targetThreadId = parseInt(threadId, 10) || 0;
		const isSameTarget = longPollState.channelId === targetChannelId && longPollState.threadId === targetThreadId;

		if ((longPollState.isConnected || longPollState.isConnecting) && !isSameTarget) {
			disconnect(false);
		}

		if ((longPollState.isConnected || longPollState.isConnecting) && isSameTarget) {
			return;
		}

		longPollState.channelId = targetChannelId;
		longPollState.threadId = targetThreadId;
		longPollState.isConnecting = true;
		
		logDebug(`[Long Polling初期化] 状態更新完了:`, {
			channelId: longPollState.channelId,
			threadId: longPollState.threadId,
			isConnecting: longPollState.isConnecting
		});
		longPollState.reconnectAttempts = 0;
		longPollState.lastUpdate = null;
		longPollState.lastMessageId = 0;
		longPollState.isPaused = false;

		startPolling();
		startReactionPolling();
	}

	// ポーリング停止
	function disconnect(keepPaused = true) {

		longPollState.isConnected = false;
		longPollState.isConnecting = false;
		longPollState.isPaused = !!keepPaused;

		if (longPollState.currentXhr) {
			longPollState.currentXhr.abort();
			longPollState.currentXhr = null;
		}

		if (longPollState.pollDelayTimer) {
			clearTimeout(longPollState.pollDelayTimer);
			longPollState.pollDelayTimer = null;
		}
	}

	// メインのポーリング処理
	function startPolling() {
		// startPolling開始 (debug log removed)
		
		if (longPollState.isPaused || !longPollState.isConnecting) {
			// ポーリング停止条件 (debug log removed)
			return;
		}

		longPollState.totalRequests++;

		// 📊 Phase 0: 計測開始
		const metricsStartTime = Date.now();

		const requestData = {
			action: 'lms_unified_long_poll',
			channel_id: longPollState.channelId,
			thread_id: longPollState.threadId,
			last_update: longPollState.lastUpdate,
			last_timestamp: longPollState.lastUpdate || 0,
			last_message_id: longPollState.lastMessageId || 0,
			last_event_id: longPollState.lastEventId || 0,
			timeout: Math.max(1, Math.round(longPollState.timeoutDuration / 1000)),
			event_types: 'message_create,message_delete,thread_create,thread_delete,reaction_update,thread_reaction,thread_reaction_update',
			nonce: getNonce()
		};

		// Ajax リクエスト送信 (debug log removed)

		longPollState.currentXhr = $.ajax({
			url: window.lms_ajax_obj?.ajax_url || window.lms_chat_ajax?.ajax_url || '/wp-admin/admin-ajax.php',
			type: 'POST',
			data: requestData,
			timeout: longPollState.timeoutDuration, // 30秒
			dataType: 'json',
			success: function(response) {
			// Ajax成功 (debug log removed)

			longPollState.isConnected = true;
			longPollState.isConnecting = true;
			longPollState.reconnectAttempts = 0;

			// 📊 Phase 0: 成功を記録
			if (window.LMSPerformanceMetrics) {
				const duration = Date.now() - metricsStartTime;
				const eventsCount = (response && response.data && response.data.events)
					? response.data.events.length
					: 0;

				window.LMSPerformanceMetrics.recordRequest({
					type: 'basic',
					duration: duration,
					status: 'success',
					cache_hit: false,
					response_size: JSON.stringify(response).length,
					events_count: eventsCount
				});
			}

			if (response.success && response.data) {
				processLongPollResponse(response.data);
			}

			// 次のポーリングをスケジュール
			scheduleNextPoll();
		},
		error: function(xhr, status, error) {
			longPollState.errorEvents++;

			// 📊 Phase 0: エラー/タイムアウトを記録
			if (window.LMSPerformanceMetrics) {
				const duration = Date.now() - metricsStartTime;
				const isTimeout = status === 'timeout';

				window.LMSPerformanceMetrics.recordRequest({
					type: 'basic',
					duration: duration,
					status: isTimeout ? 'timeout' : 'error',
					cache_hit: false,
					response_size: 0,
					events_count: 0
				});
			}

					if (status === 'timeout') {
						// タイムアウトは正常な動作なので、すぐに次のポーリングを開始
						scheduleNextPoll();
					} else if (status !== 'abort') {
						// アボート以外のエラーの場合は再接続を試行
						handleReconnection();
					}
				}
		});
	}

	// 次のポーリングをスケジュール
	function scheduleNextPoll() {
		if (longPollState.isPaused) {
			return;
		}

		const delay = longPollState.isInactiveMode ? 10000 : 3000; // 非アクティブ時は10秒、通常時は3秒

		longPollState.pollDelayTimer = setTimeout(() => {
			startPolling();
		}, delay);
	}

	// 再接続処理
	function handleReconnection() {
		if (longPollState.reconnectAttempts >= longPollState.maxReconnectAttempts) {
			longPollState.isConnected = false;
			longPollState.isConnecting = false;
			return;
		}

		longPollState.reconnectAttempts++;
		const delay = longPollState.reconnectDelay * longPollState.reconnectAttempts;


		longPollState.pollDelayTimer = setTimeout(() => {
			startPolling();
		}, delay);
	}

	// 統合Long Polling形式を旧形式に変換する関数
	function convertUnifiedEventFormat(event) {
		// イベント変換開始 (debug log removed)

		// 既に旧形式の場合はそのまま返す
		if (event.type && (event.type.includes('main_message_') || event.type.includes('thread_message_'))) {
			// 既に旧形式 - そのまま返す (debug log removed)
			return event;
		}

		// 統合形式から旧形式への変換
		const typeMapping = {
			'message_create': 'main_message_created',
			'message_delete': 'main_message_deleted',
			'thread_create': 'thread_message_created',
			'thread_delete': 'thread_message_deleted'
		};

		const convertedType = typeMapping[event.type] || event.type;

		// タイプマッピング (debug log removed)

		// データ形式の統一
		const convertedEvent = {
			type: convertedType,
			data: {
				id: event.message_id,
				messageId: event.message_id,
				channelId: event.channel_id,
				threadId: event.thread_id,
				payload: event.data || {
					id: event.message_id,
					message_id: event.message_id
				}
			},
			timestamp: event.timestamp
		};

		// 変換完了 (debug log removed)

		return convertedEvent;
	}

	// Long Pollレスポンス処理（統合形式対応）
	function processLongPollResponse(payload) {
		// processLongPollResponse開始 (debug log removed)

		if (!payload) {
			// ペイロードなし - 処理終了 (debug log removed)
			return;
		}

		const events = Array.isArray(payload)
			? payload
			: (Array.isArray(payload.events) ? payload.events : []);

		// イベント配列作成 (debug log removed)

		if (!events.length) {
			const responseTimestamp = toNumericTimestamp(payload.timestamp);
			if (!Number.isNaN(responseTimestamp) && responseTimestamp > (toNumericTimestamp(longPollState.lastUpdate) || 0)) {
				longPollState.lastUpdate = responseTimestamp;
			}
			return;
		}

		let latestEventId = Number(longPollState.lastEventId) || 0;
		let latestTimestamp = toNumericTimestamp(longPollState.lastUpdate) || 0;

		events.forEach((event) => {
			// イベント処理開始 (debug log removed)

			if (!event) {
				// 空イベント - スキップ (debug log removed)
				return;
			}

			const eventId = Number(event.id || event.event_id || 0);
			if (!Number.isNaN(eventId) && eventId > latestEventId) {
				latestEventId = eventId;
			}

			const eventTimestamp = toNumericTimestamp(event.timestamp || event.data?.timestamp || 0);
			if (!Number.isNaN(eventTimestamp) && eventTimestamp > latestTimestamp) {
				latestTimestamp = eventTimestamp;
			}

			const rawType = (event.type || event.event_type || '').toString();
			const normalizedType = rawType.toLowerCase();
			
			// イベントタイプ分析 (debug log removed)

			if (normalizedType === 'reaction_update') {
				handleUnifiedReactionEvent(event);
				return;
			}

			if (normalizedType === 'thread_reaction' || normalizedType === 'thread_reaction_update') {
				handleUnifiedThreadReactionEvent(event);
				return;
			}

			if (!rawType && event.data?.type) {
				// 旧形式イベント
				const fallbackType = (event.data.type || '').toString().toLowerCase();
				if (fallbackType === 'reaction_update') {
					handleUnifiedReactionEvent(event);
					return;
				}
			}

			const convertedEvent = convertUnifiedEventFormat(event);
			
			// イベント変換完了 (debug log removed)

			switch (convertedEvent.type) {
				case 'main_message_posted':
				case 'main_message_created':
					// メインメッセージ作成イベント処理 (debug log removed)
					handleNewMessage(convertedEvent);
					break;
				case 'main_message_deleted':
					// メインメッセージ削除イベント処理 (debug log removed)
					handleDeletedMessage(convertedEvent);
					break;
				case 'thread_message_posted':
				case 'thread_message_created':
					// スレッドメッセージ作成イベント処理開始 (debug log removed)
					handleNewThreadMessage(convertedEvent);
					break;
				case 'thread_message_deleted':
					// スレッドメッセージ削除イベント処理開始 (debug log removed)
					handleDeletedThreadMessage(convertedEvent);
					break;
				default:
					// 未知のイベントタイプ (debug log removed)
					break;
			}

			const rawEventId =
				convertedEvent?.data?.messageId ||
				convertedEvent?.data?.id ||
				convertedEvent?.data?.message_id ||
				convertedEvent?.data?.payload?.id ||
				convertedEvent?.data?.payload?.message_id;

			if (rawEventId) {
				const numericEventId = parseInt(rawEventId, 10);
				if (!Number.isNaN(numericEventId) && numericEventId > longPollState.lastMessageId) {
					longPollState.lastMessageId = numericEventId;
				}
			}
		});

		const responseTimestamp = toNumericTimestamp(payload.timestamp);
		if (!Number.isNaN(responseTimestamp) && responseTimestamp > latestTimestamp) {
			latestTimestamp = responseTimestamp;
		}

		if (latestEventId > (Number(longPollState.lastEventId) || 0)) {
			longPollState.lastEventId = latestEventId;
		}

		if (latestTimestamp > (toNumericTimestamp(longPollState.lastUpdate) || 0)) {
			longPollState.lastUpdate = latestTimestamp;
		}
	}

	function handleUnifiedReactionEvent(event) {
		if (window.UnifiedLongPollClient && typeof window.UnifiedLongPollClient.handleReactionUpdate === 'function') {
			window.UnifiedLongPollClient.handleReactionUpdate(event);
			return;
		}

		try {
			const messageId = event.message_id || event.data?.message_id || event.data?.id;
			const reactions = normalizeReactionData(event.data?.reactions || event.reactions);

			if (!messageId) {
				return;
			}

			if (window.LMSChat?.reactionUI?.updateMessageReactions) {
				window.LMSChat.reactionUI.updateMessageReactions(messageId, reactions, false, true);
			} else if (window.LMSChat?.updateMessageReactions) {
				window.LMSChat.updateMessageReactions(messageId, reactions);
			}

			$(document).trigger('reaction:updated', {
				messageId: messageId,
				reactions: reactions,
				timestamp: Date.now()
			});
		} catch (error) {
			logDebug('[UnifiedReactionEvent] 処理エラー', { error });
		}
	}

	function handleUnifiedThreadReactionEvent(event) {

		if (window.UnifiedLongPollClient && typeof window.UnifiedLongPollClient.handleThreadReactionUpdate === 'function') {
			window.UnifiedLongPollClient.handleThreadReactionUpdate(event);
			return;
		}

		const messageId = event.message_id || event.data?.message_id;
		const threadId = event.thread_id || event.data?.thread_id || longPollState.threadId;
		const reactions = normalizeReactionData(event.data?.reactions || event.reactions);
		const fallbackTimestamp = Math.floor(Date.now() / 1000);
		const timestamp = toNumericTimestamp(event.timestamp || event.data?.timestamp || fallbackTimestamp) || fallbackTimestamp;


		if (!messageId) {
			return;
		}

		const update = {
			message_id: messageId,
			reactions: reactions,
			timestamp: timestamp,
			thread_id: threadId,
			is_thread: true
		};

		handleThreadReactionUpdates([update]);
	}

	function normalizeReactionData(raw) {
		if (!raw) {
			return [];
		}
		if (Array.isArray(raw)) {
			return raw;
		}
		if (typeof raw === 'string') {
			try {
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? parsed : [];
			} catch (error) {
				return [];
			}
		}
		if (typeof raw === 'object' && raw !== null) {
			if (Array.isArray(raw.reactions)) {
				return raw.reactions;
			}
			if (Array.isArray(raw)) {
				return raw;
			}
			return Object.values(raw);
		}
		return [];
	}

	function toNumericTimestamp(value) {
		if (value === null || value === undefined) {
			return NaN;
		}

		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}

		const direct = Number(value);
		if (!Number.isNaN(direct)) {
			return direct;
		}

		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) {
			return Math.floor(parsed / 1000);
		}

		return NaN;
	}

	// 新しいメッセージ処理
	function handleNewMessage(event) {
		longPollState.messageEvents++;

		// チャンネル切り替え中は処理をスキップ
		if (window.LMSChat?.state?.isChannelSwitching) {
			return;
		}

		const messagePayload = event?.data?.payload || event?.data;
		const messageId = messagePayload?.id || event?.data?.id || event?.data?.messageId;

		// 自分が送信したメッセージの重複防止
		if (messageId && window.LMSChat?.state?.recentSentMessageIds?.has(String(messageId))) {
			return;
		}

		// 既に存在するメッセージの重複防止
		if (messageId && $(`.chat-message[data-message-id="${messageId}"]`).length > 0) {
			return;
		}

		if (messagePayload && window.LMSChat?.messages?.appendMessage) {
			window.LMSChat.messages.appendMessage(messagePayload, { fromLongPoll: true });
		}

		// イベントを配信
		fireEvent('main_message_posted', event.data);
	}

	// メッセージ削除処理
	function handleDeletedMessage(event) {
		longPollState.deleteEvents++;

		const messageId =
			event?.data?.messageId ||
			event?.data?.id ||
			event?.data?.payload?.id ||
			event?.data?.payload?.messageId;

		if (messageId) {
			// メッセージが存在するかチェック
			const $message = $(`.chat-message[data-message-id="${messageId}"]`);
			if ($message.length > 0) {
				$message.remove();
			}
		}

		// イベントを配信
		fireEvent('main_message_deleted', {
			messageId,
			channelId: event?.data?.channelId || event?.data?.channel_id,
			payload: event?.data?.payload || null,
		});
	}

	// 新しいスレッドメッセージ処理
	function handleNewThreadMessage(event) {
		longPollState.messageEvents++;

		// チャンネル切り替え中は処理をスキップ
		if (window.LMSChat?.state?.isChannelSwitching) {
			return;
		}

		const messagePayload = event?.data?.payload || event?.data;
		const messageId = messagePayload?.id || event?.data?.id || event?.data?.messageId;

		// 自分が送信したメッセージの重複防止
		if (messageId && window.LMSChat?.state?.recentSentMessageIds?.has(String(messageId))) {
			return;
		}

		// 既に存在するメッセージの重複防止
		if (messageId && $(`.thread-message[data-message-id="${messageId}"]`).length > 0) {
			return;
		}

		// メッセージを追加（条件を緩和）
		if (messagePayload) {
			
			// 複数の方法でappendThreadMessage関数を試行
			if (window.LMSChat?.threads?.appendThreadMessage) {
				window.LMSChat.threads.appendThreadMessage(messagePayload);
			} else if (window.appendThreadMessage) {
				window.appendThreadMessage(messagePayload);
			} else if (typeof appendThreadMessage === 'function') {
				appendThreadMessage(messagePayload);
			}
		}

		// イベントを配信
		fireEvent('thread_message_posted', event.data);
	}

	// スレッドメッセージ削除処理
	function handleDeletedThreadMessage(event) {
		longPollState.deleteEvents++;

		const messageId =
			event?.data?.messageId ||
			event?.data?.id ||
			event?.data?.payload?.id ||
			event?.data?.payload?.messageId;

		if (messageId) {
			
			// 削除処理（条件を緩和）
			const $message = $(`.thread-message[data-message-id="${messageId}"]`);
			if ($message.length > 0) {
				$message.remove();
				
				// 残りメッセージ数をチェック
				const remainingMessages = $('.thread-messages .thread-message:visible').not('.deleting').length;
				if (remainingMessages === 0) {
					// 既存の空メッセージ通知を削除してから追加
					$('.thread-messages .no-messages').remove();
					$('.thread-messages').append(
						'<div class="no-messages">このスレッドにはまだ返信がありません</div>'
					);
				}
			} else {
			}
			
			// threads.jsの削除ハンドラーも呼び出し
			if (window.LMSChat?.threads?.handleDeletedMessage) {
				window.LMSChat.threads.handleDeletedMessage({ id: messageId, message_id: messageId });
			}
		}

		// イベントを配信
		fireEvent('thread_message_deleted', {
			messageId,
			channelId: event?.data?.channelId || event?.data?.channel_id,
			threadId: event?.data?.threadId || event?.data?.thread_id,
			payload: event?.data?.payload || null,
		});
	}

	// イベント配信
	function fireEvent(eventType, data) {
		// 統計更新
		switch (eventType) {
			case 'main_message_posted':
			case 'thread_message_posted':
				longPollState.messageEvents++;
				break;
			case 'main_message_deleted':
			case 'thread_message_deleted':
				longPollState.deleteEvents++;
				break;
			case 'error':
				longPollState.errorEvents++;
				break;
		}

		// リスナーへの配信
		if (longPollState.listeners.has(eventType)) {
			const listeners = longPollState.listeners.get(eventType);
			listeners.forEach((callback) => {
				try {
					callback(data);
				} catch (e) {
				}
			});
		}

		// jQueryイベントとして配信
		$(document).trigger('lms_longpoll_' + eventType, [data]);
	}

	// イベントリスナー追加
	function addEventListener(eventType, callback) {
		if (!longPollState.listeners.has(eventType)) {
			longPollState.listeners.set(eventType, []);
		}
		longPollState.listeners.get(eventType).push(callback);
	}

	// イベントリスナー削除
	function removeEventListener(eventType, callback) {
		if (!longPollState.listeners.has(eventType)) {
			return;
		}
		const listeners = longPollState.listeners.get(eventType);
		const index = listeners.indexOf(callback);
		if (index > -1) {
			listeners.splice(index, 1);
		}
	}

	// 統計情報取得
	function getStats() {
		return {
			isConnected: longPollState.isConnected,
			isConnecting: longPollState.isConnecting,
			totalRequests: longPollState.totalRequests,
			messageEvents: longPollState.messageEvents,
			deleteEvents: longPollState.deleteEvents,
			errorEvents: longPollState.errorEvents,
			reconnectAttempts: longPollState.reconnectAttempts,
			lastUpdate: longPollState.lastUpdate
		};
	}

	// 非アクティブモード設定
	function setInactiveMode(inactive) {
		longPollState.isInactiveMode = inactive;
	}

	// 現在のタイムアウト値取得
	function getCurrentTimeout() {
		return longPollState.currentTimeout;
	}

	// 現在のポーリング遅延取得
	function getCurrentPollDelay() {
		return longPollState.currentPollDelay;
	}

	// リアクション更新ポーリング（軽量版）
	function pollReactionUpdates() {
		// 同時リクエスト数制限チェック
		if (longPollState.activeRequests >= longPollState.maxConcurrentRequests) {
			return;
		}

		if (!longPollState.reactionPollingEnabled || longPollState.reactionPollingInProgress) {
			return;
		}

		longPollState.reactionPollingInProgress = true;

		// チャンネルメッセージのリアクション更新
		if (longPollState.channelId) {
			pollChannelReactions();
		}

		// スレッドメッセージのリアクション更新（アクティブなスレッドがある場合）
		if (longPollState.threadId) {
			logDebug('[thread-poll] スレッドリアクションポーリング実行', {
				threadId: longPollState.threadId,
				channelId: longPollState.channelId,
				timestamp: new Date().toISOString()
			});
			pollThreadReactions();
		} else {
			logDebug('[thread-poll] スレッドIDが未設定のためスレッドポーリングスキップ', {
				channelId: longPollState.channelId
			});
		}

		// 完了フラグリセット
		setTimeout(() => {
			longPollState.reactionPollingInProgress = false;
		}, 500);
	}

	// スレッドリアクションポーリング関数の定義
	function pollThreadReactions() {

		const pollStartTime = Date.now();
		logDebug(`[STEP1-POLL] pollThreadReactions実行開始:`, {
			startTime: new Date().toISOString(),
			timestamp: pollStartTime,
			interval: pollStartTime - (window.lastThreadPollTime || pollStartTime),
			threadId: longPollState.threadId,
			isActiveUser: longPollState.isActiveUser,
			activeRequests: longPollState.activeRequests
		});
		window.lastThreadPollTime = pollStartTime;

		logDebug('[thread-poll] pollThreadReactions開始', {
			threadId: longPollState.threadId,
			activeRequests: longPollState.activeRequests,
			maxConcurrent: longPollState.maxConcurrentRequests,
			lastTimestamp: longPollState.lastThreadReactionTimestamp
		});
		
		// 同時リクエスト数制限チェック
		if (longPollState.activeRequests >= longPollState.maxConcurrentRequests) {
			logDebug('[STEP1-POLL] 同時リクエスト制限のためスキップ');
			return;
		}

		logDebug(`[STEP1-POLL] スレッドリアクションポーリング開始:`, {
			threadId: longPollState.threadId,
			lastTimestamp: longPollState.lastThreadReactionTimestamp,
			action: 'lms_get_thread_reaction_updates'
		});
		
		$.ajax({
			url: window.lms_ajax_obj?.ajax_url || '/wp-admin/admin-ajax.php',
			type: 'POST',
			data: {
				action: 'lms_get_thread_reaction_updates',
				thread_id: longPollState.threadId,
				last_timestamp: longPollState.lastThreadReactionTimestamp,
				nonce: getNonce(),
			},
			timeout: 8000,
			beforeSend: function() {
				longPollState.activeRequests++;
			},
			success: function(response) {

				const pollEndTime = Date.now();
				logDebug(`[STEP1-POLL] ポーリング完了:`, {
					duration: pollEndTime - pollStartTime,
					success: response.success,
					dataLength: response.data ? response.data.length : 0,
					response: response
				});
				
				if (response.success && response.data && response.data.length > 0) {
					handleThreadReactionUpdates(response.data);
				}
				longPollState.activeRequests--;
			},
			error: function(xhr, status, error) {
				const pollEndTime = Date.now();
				logDebug(`[STEP1-POLL] ポーリングエラー:`, {
					duration: pollEndTime - pollStartTime,
					status: status,
					error: error,
					responseText: xhr.responseText
				});
				longPollState.activeRequests--;
			}
		});
	}

	// スレッドリアクション更新データ処理の分離
	function handleThreadReactionUpdates(updates) {
		logDebug(`[STEP1-RECEIVE] スレッドリアクション更新データ配列受信:`, {
			updateCount: updates.length,
			updates: updates.map(u => ({
				messageId: u.message_id,
				timestamp: u.timestamp,
				hasReactions: !!u.reactions,
				isThread: u.is_thread
			}))
		});
		
		updates.forEach((update) => {

			logDebug(`[STEP1-RECEIVE] 個別更新処理開始:`, {
				messageId: update.message_id,
				updateTimestamp: update.timestamp,
				rawReactions: update.reactions,
				isThread: update.is_thread
			});
			$(document).trigger('thread_reaction:longpoll_received', {
				messageId: update.message_id,
				threadId: update.thread_id || longPollState.threadId || null,
				timestamp: update.timestamp || Date.now(),
				source: 'longpoll'
			});
			
			try {
				let reactions;
				if (Array.isArray(update.reactions)) {
					reactions = update.reactions;
					logDebug(`[STEP1-RECEIVE] リアクションデータ形式: 配列型 (${reactions.length}件)`);
				} else if (!update.reactions || (typeof update.reactions === 'string' && update.reactions.trim() === '')) {
					logDebug(`[STEP1-RECEIVE] 空のリアクションデータ - スキップ`);
					return;
				} else {
					reactions = JSON.parse(update.reactions);
					logDebug(`[STEP1-RECEIVE] リアクションデータ形式: JSON文字列 → 配列変換完了 (${reactions ? reactions.length : 0}件)`);
				}

				// 統一システムを最優先で使用
				const unifiedSystem = window.LMSChat?.threadReactionUnified;
				
				if (unifiedSystem) {
					const serverTimestamp = update.timestamp || null;
					const parentThreadId = update.thread_id || longPollState.threadId || null;
					
					logDebug(`[STEP1-RECEIVE] ThreadReactionUnified経由でUI更新`, {
						messageId: update.message_id,
						reactionsCount: reactions.length,
						source: 'longpoll',
						threadId: parentThreadId,
						serverTimestamp: serverTimestamp
					});
					
					unifiedSystem.updateReactions(update.message_id, reactions, {
						source: 'longpoll',
						serverTimestamp: serverTimestamp,
						threadId: parentThreadId
					});
					
					logDebug(`[STEP1-RECEIVE] UI更新完了`, {
						messageId: update.message_id
					});
				} else {
					// フォールバック: 旧来の方式
					const reactionSync = window.LMSChat?.reactionSync;
					const shouldSkip = reactionSync?.shouldSkipUpdate && reactionSync.shouldSkipUpdate(`thread_${update.message_id}`);
					
					if (!shouldSkip && window.LMSChat && window.LMSChat.reactionUI && window.LMSChat.reactionUI.updateThreadMessageReactions) {
						
						logDebug(`[STEP1-RECEIVE] UI更新メソッド呼び出し開始 (fallback)`, {
							methodExists: !!window.LMSChat?.reactionUI?.updateThreadMessageReactions,
							messageId: update.message_id,
							reactionsCount: reactions.length,
							shouldSkip: shouldSkip
						});

						// 即座に実行（100ms遅延削除 - Phase 1A最適化）
						if (window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
							// 重複防止: 短時間内の同じメッセージの更新をスキップ
							const updateKey = `longpoll_thread_${update.message_id}`;
							const now = Date.now();
							if (!window.LMSChat.longpollLastUpdate) window.LMSChat.longpollLastUpdate = {};

							if (window.LMSChat.longpollLastUpdate[updateKey] &&
								(now - window.LMSChat.longpollLastUpdate[updateKey]) < 200) {
								logDebug('Skipping duplicate longpoll thread reaction update', { messageId: update.message_id });
								return;
							}
							window.LMSChat.longpollLastUpdate[updateKey] = now;

							window.LMSChat.reactionUI.updateThreadMessageReactions(update.message_id, reactions, true, true);
						}
					} else {
						logDebug(`[STEP1-RECEIVE] UI更新をスキップ`, {
							shouldSkip: shouldSkip,
							methodExists: !!window.LMSChat?.reactionUI?.updateThreadMessageReactions,
							storeAvailable: false
						});
					}
				}

				if (update.timestamp > longPollState.lastThreadReactionTimestamp) {
					longPollState.lastThreadReactionTimestamp = update.timestamp;
				}
			} catch (parseError) {
				logDebug(`[STEP1-RECEIVE] リアクションデータ処理エラー:`, {
					messageId: update.message_id,
					error: parseError,
					rawData: update.reactions
				});
			}
		});
	}

	// チャンネルリアクションポーリング
	function pollChannelReactions() {
		// 同時リクエスト数制限チェック
		if (longPollState.activeRequests >= longPollState.maxConcurrentRequests) {
			return;
		}

		$.ajax({
			url: window.lms_ajax_obj?.ajax_url || '/wp-admin/admin-ajax.php',
			type: 'POST',
			data: {
				action: 'lms_get_reaction_updates',
				channel_id: longPollState.channelId,
				last_timestamp: longPollState.lastReactionTimestamp,
				nonce: getNonce(),
			},
			timeout: 8000,
			beforeSend: function() {
				longPollState.activeRequests++;
			},
			success: function(response) {
				if (response.success && response.data && response.data.length > 0) {
				logDebug(`[Long Polling受信] スレッドリアクション更新データ配列受信:`, {
					updateCount: response.data.length,
					updates: response.data.map(u => ({
						messageId: u.message_id,
						timestamp: u.timestamp,
						hasReactions: !!u.reactions,
						isThread: u.is_thread
					}))
				});
				
				response.data.forEach((update) => {
					logDebug(`[Long Polling受信] スレッドリアクション個別更新処理開始:`, {
						messageId: update.message_id,
						updateTimestamp: update.timestamp,
						rawReactions: update.reactions,
						isThread: update.is_thread
					});
					
					try {
						let reactions;
						if (Array.isArray(update.reactions)) {
							reactions = update.reactions;
							logDebug(`[Long Polling受信] リアクションデータ形式: 配列型 (${reactions.length}件)`);
						} else if (!update.reactions || (typeof update.reactions === 'string' && update.reactions.trim() === '')) {
							logDebug(`[Long Polling受信] 空のリアクションデータ - スキップ`);
							return;
						} else {
							reactions = JSON.parse(update.reactions);
							logDebug(`[Long Polling受信] リアクションデータ形式: JSON文字列 → 配列変換完了 (${reactions ? reactions.length : 0}件)`);
						}

						if (window.LMSChat && window.LMSChat.reactionUI && window.LMSChat.reactionUI.updateThreadMessageReactions) {
								// スレッドリアクション同期の確実な実行（楽観的UI更新保護を大幅緩和）
							let shouldUpdateUI = true;
							
							// 極めて短い時間（300ms）のみ保護を適用
							const recentOptimisticUpdate = window.LMSChat?.reactionCore?.getLastProcessedReaction?.(update.message_id);
							if (recentOptimisticUpdate) {
								const now = Date.now();
								const timeDiff = now - recentOptimisticUpdate.timestamp;
								
								// 300ms以内で、かつ処理が完了していない場合のみスキップ
								shouldUpdateUI = !(
									timeDiff < 300 && 
									recentOptimisticUpdate.status === 'processing' && 
									!recentOptimisticUpdate.completedAt
								);
							}
							
							// 統一システムを最優先で使用
							const unifiedSystem = window.LMSChat?.threadReactionUnified;
							
							if (shouldUpdateUI && unifiedSystem) {
								const serverTimestamp = update.timestamp || null;
								logDebug(`[Long Polling受信] ThreadReactionUnified経由でスレッドリアクションUI更新:`, {
									messageId: update.message_id,
									reactionsCount: reactions ? reactions.length : 0,
									reactions: reactions,
									timestamp: update.timestamp,
									serverTimestamp: serverTimestamp,
									source: 'longpoll-detailed'
								});
								
								unifiedSystem.updateReactions(update.message_id, reactions, {
									source: 'longpoll-detailed',
									serverTimestamp: serverTimestamp
								});
								
							} else if (shouldUpdateUI) {
								// フォールバック: 旧来の方式
								const reactionSync = window.LMSChat?.reactionSync;
								const shouldSkipForConflict = reactionSync?.shouldSkipUpdate && reactionSync.shouldSkipUpdate(`thread_${update.message_id}`);
								
								if (!shouldSkipForConflict) {
									logDebug(`[Long Polling受信] スレッドリアクションUI更新実行 (fallback):`, {
										messageId: update.message_id,
										reactionsCount: reactions ? reactions.length : 0,
										reactions: reactions,
										timestamp: update.timestamp,
										shouldSkipForConflict: shouldSkipForConflict
									});

									// 即座に実行（50ms遅延削除 - Phase 1A最適化）
									if (window.LMSChat?.reactionUI?.updateThreadMessageReactions) {
										// 重複防止: 短時間内の同じメッセージの更新をスキップ
										const updateKey = `longpoll_thread_${update.message_id}`;
										const now = Date.now();
										if (!window.LMSChat.longpollLastUpdate) window.LMSChat.longpollLastUpdate = {};

										if (window.LMSChat.longpollLastUpdate[updateKey] &&
											(now - window.LMSChat.longpollLastUpdate[updateKey]) < 200) {
											logDebug('Skipping duplicate longpoll thread reaction update', { messageId: update.message_id });
											return;
										}
										window.LMSChat.longpollLastUpdate[updateKey] = now;

										window.LMSChat.reactionUI.updateThreadMessageReactions(update.message_id, reactions, true, true);
									}
								}
							} else {
								logDebug(`[Long Polling受信] スレッドリアクション更新をスキップ`, {
									shouldUpdateUI,
									storeAvailable: !!threadStore
								});
							}

							if (update.timestamp > longPollState.lastThreadReactionTimestamp) {
								longPollState.lastThreadReactionTimestamp = update.timestamp;
							}
						}
					} catch (parseError) {
					}
				});
				}
				longPollState.activeRequests--;
			},
			error: function(xhr, status, error) {
				longPollState.activeRequests--;
				// エラーは静かに処理
			}
		});
	}

	// リアクションポーリング開始
	function startReactionPolling() {
		logDebug('[thread-poll] startReactionPolling呼び出し', {
			currentChannel: longPollState.channelId,
			currentThread: longPollState.threadId,
			isActive: longPollState.isReactionPollingActive,
			timestamp: new Date().toISOString()
		});
		if (!longPollState.reactionPollingEnabled) {
			return;
		}


		// 緊急修正: サーバー過負荷防止のため大幅に間隔延長
		setInterval(() => {
			// 統合Long Pollingが動作中の場合は完全停止
			const isUnifiedLongPollActive = window.UnifiedLongPollClient && 
											window.UnifiedLongPollClient.state && 
											window.UnifiedLongPollClient.state.isActive;
			
			// サーバー過負荷防止: より厳格な条件と大幅な間隔延長
		if (!isUnifiedLongPollActive && 
			longPollState.reactionPollingEnabled && 
			!document.hidden && 
			!longPollState.reactionPollingInProgress &&
			longPollState.errorEvents < 5) { // エラーが多い場合は停止
			
			
			// メインチャットポーリング
			pollReactionUpdates();
			
			// 🔥 CRITICAL FIX: スレッドポーリングも同時実行
			if (longPollState.threadId && typeof pollThreadReactions === 'function') {
				pollThreadReactions();
			}
		}
		}, 30000); // 3秒→30秒に延長（90%負荷削減）

		// ページがアクティブになった時の処理
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden && longPollState.reactionPollingEnabled) {
				longPollState.reactionPollingInProgress = false;
				pollReactionUpdates();
			}
		});
	}

	// [STEP2-FIX] スレッド開始イベントリスナーを追加
	$(document).on('lms_thread_opened', function(event, threadId) {
		logDebug('[STEP2-EVENT] lms_thread_opened受信:', {
			threadId: threadId,
			timestamp: new Date().toISOString(),
			currentThreadId: longPollState.threadId,
			channelId: longPollState.channelId
		});

		// スレッドIDを設定
		longPollState.threadId = parseInt(threadId, 10) || 0;

		// ポーリング有効化
		longPollState.reactionPollingEnabled = true;
		longPollState.reactionPollingInProgress = false;

		logDebug('[STEP2-EVENT] スレッドポーリング設定更新:', {
			newThreadId: longPollState.threadId,
			reactionPollingEnabled: longPollState.reactionPollingEnabled,
			reactionPollingInProgress: longPollState.reactionPollingInProgress
		});

		// 即座にポーリングを開始
		setTimeout(() => {
			logDebug('[STEP2-EVENT] 即座スレッドポーリング実行');
			if (typeof pollThreadReactions === 'function') {
				pollThreadReactions();
			}
		}, 500);
		
		// 🔥 追加: 複数回実行して確実性を高める
		setTimeout(() => {
			if (typeof pollThreadReactions === 'function') {
				pollThreadReactions();
			}
		}, 2000);
	});

	// 第1段階: クライアント監視強化 - 診断機能
	window.LMS_THREAD_POLL_DIAGNOSTIC = {
		checkPollingStatus: function() {
			logDebug('🔍 [第1段階] Long Polling診断レポート');
			
			const status = {
				longPollState: { ...longPollState },
				isReactionPollingEnabled: longPollState.reactionPollingEnabled,
				isReactionPollingInProgress: longPollState.reactionPollingInProgress,
				threadId: longPollState.threadId,
				channelId: longPollState.channelId,
				activeRequests: longPollState.activeRequests,
				lastThreadPollTime: window.lastThreadPollTime,
				currentTime: Date.now()
			};
			
			logDebug('📊 現在の状態:', status);
			
			// ポーリング間隔チェック
			const timeSinceLastPoll = window.lastThreadPollTime ? 
				Date.now() - window.lastThreadPollTime : null;
			logDebug('⏱️ 最後のポーリングからの経過時間:', 
				timeSinceLastPoll ? `${timeSinceLastPoll}ms` : '未実行');
			
			// APIオブジェクト存在確認
			logDebug('🔌 API存在確認:', {
				'window.LMSChat.longPoll': !!window.LMSChat?.longPoll,
				'window.LMSLongPoll': !!window.LMSLongPoll,
				'pollThreadReactions': typeof pollThreadReactions
			});
			
			// 推奨アクション
			if (!longPollState.threadId) {
				logDebug('⚠️ threadIdが設定されていません');
			}
			if (!longPollState.reactionPollingEnabled) {
				logDebug('⚠️ リアクションポーリングが無効です');
			}
			if (longPollState.activeRequests >= longPollState.maxConcurrentRequests) {
				logDebug('⚠️ 最大同時リクエスト数に達しています');
			}
			
			logDebug();
			return status;
		},
		
		forcePolling: function() {
			logDebug('🚀 [第1段階] 強制ポーリング実行');
			if (typeof pollThreadReactions === 'function') {
				pollThreadReactions();
				return '強制ポーリングを実行しました';
			} else {
				return 'pollThreadReactions関数が見つかりません';
			}
		},

		// [STEP2-DIAGNOSIS] システム状態診断
		diagnoseSystem: function() {
			logDebug('🔍 [STEP2-DIAGNOSIS] システム状態診断:');
			logDebug('📊 ポーリング状態:', {
				threadId: longPollState.threadId,
				channelId: longPollState.channelId,
				reactionPollingEnabled: longPollState.reactionPollingEnabled,
				reactionPollingInProgress: longPollState.reactionPollingInProgress,
				activeRequests: longPollState.activeRequests,
				maxConcurrentRequests: longPollState.maxConcurrentRequests,
				errorEvents: longPollState.errorEvents,
				lastThreadReactionTimestamp: longPollState.lastThreadReactionTimestamp
			});

			logDebug('🔧 利用可能なポーリング関数:', {
				'chat-longpoll.js pollThreadReactions': typeof pollThreadReactions,
				'LMSChat.reactionSync.pollThreadReactions': typeof window.LMSChat?.reactionSync?.pollThreadReactions,
				'LMSChat.reactions.pollThreadReactions': typeof window.LMSChat?.reactions?.pollThreadReactions
			});

			logDebug('📡 Ajax設定:', {
				ajaxUrl: window.lms_ajax_obj?.ajax_url,
				hasNonce: typeof getNonce,
				currentUser: window.lms_ajax_obj?.current_user
			});

			// 直接ポーリングテスト実行
			logDebug('🚀 [STEP2-TEST] 直接ポーリングテスト実行中...');
			if (longPollState.threadId && typeof pollThreadReactions === 'function') {
				pollThreadReactions();
				return 'システム診断完了、テストポーリング実行';
			} else {
				return 'システム診断完了、threadIDまたはポーリング関数なし';
			}
		},

		// [STEP3-TEST] エンドポイント接続テスト
		testEndpointConnection: function(testThreadId = null) {
			const threadId = testThreadId || longPollState.threadId;
			if (!threadId) {
				logDebug('🚨 [STEP3-TEST] スレッドIDが設定されていません');
				return 'エラー: スレッドIDなし';
			}

			logDebug('🔗 [STEP3-TEST] エンドポイント接続テスト開始:', {
				threadId: threadId,
				endpoint: 'lms_get_thread_reaction_updates',
				timestamp: new Date().toISOString()
			});

			return $.ajax({
				url: window.lms_ajax_obj?.ajax_url || '/wp-admin/admin-ajax.php',
				type: 'POST',
				data: {
					action: 'lms_get_thread_reaction_updates',
					thread_id: threadId,
					last_timestamp: 0,
					nonce: getNonce(),
				},
				timeout: 5000,
			}).done(function(response) {
				logDebug('✅ [STEP3-TEST] エンドポイント接続成功:', {
					response: response,
					timestamp: new Date().toISOString()
				});
				return response;
			}).fail(function(xhr, status, error) {
				logDebug('❌ [STEP3-TEST] エンドポイント接続失敗:', {
					status: status,
					error: error,
					responseText: xhr.responseText,
					timestamp: new Date().toISOString()
				});
				return { error: `${status}: ${error}` };
			});
		},
		
		monitorNetwork: function() {
			logDebug('🌐 [第1段階] Network監視開始 - F12 → Network → XHR で以下を確認:');
			logDebug('- action=lms_get_thread_reaction_updates');
			logDebug('- 約3-30秒間隔でリクエスト発生');
			logDebug('- レスポンスにdata配列が含まれる');
			
			// 自動監視設定
			const originalXHR = window.XMLHttpRequest;
			const xhrLog = [];
			
			window.XMLHttpRequest = function() {
				const xhr = new originalXHR();
				const originalOpen = xhr.open;
				
				xhr.open = function(method, url, ...args) {
					if (url.includes('lms_get_thread_reaction_updates')) {
						const timestamp = new Date().toISOString();
						logDebug(`📡 [${timestamp}] Thread Reaction ポーリング開始:`, url);
						
						const originalOnLoad = xhr.onload;
						xhr.onload = function(e) {
							try {
								const response = JSON.parse(this.responseText);
								logDebug(`📨 [${timestamp}] ポーリング結果:`, {
									status: this.status,
									success: response.success,
									dataCount: response.data ? response.data.length : 0,
									data: response.data
								});
							} catch (err) {
								logDebug(`📨 [${timestamp}] レスポンス解析エラー:`, err);
							}
							if (originalOnLoad) originalOnLoad.call(this, e);
						};
					}
					return originalOpen.call(this, method, url, ...args);
				};
				return xhr;
			};
			
			return 'Network監視を開始しました（コンソールでリクエストを追跡中）';
		}
	};

	// API公開
	const longPollAPI = {
		connect: connect,
		disconnect: disconnect,
		fireEvent: fireEvent,
		addEventListener: addEventListener,
		removeEventListener: removeEventListener,
		getStats: getStats,
		getState: () => ({ ...longPollState }),
		setInactiveMode: setInactiveMode,
		getCurrentTimeout: getCurrentTimeout,
		getCurrentPollDelay: getCurrentPollDelay,
		isConnected: () => longPollState.isConnected,
		isConnecting: () => longPollState.isConnecting,
		compressionEnabled: () => longPollState.compressionEnabled,
		pollReactionUpdates: pollReactionUpdates,
		startReactionPolling: startReactionPolling,
		enableReactionPolling: () => { longPollState.reactionPollingEnabled = true; },
		disableReactionPolling: () => { longPollState.reactionPollingEnabled = false; },
		// 同期強化機能
		notifyMessageSent: (messageData) => {
			// 送信されたメッセージを即座に他のクライアントに同期

			// 送信直後にポーリングを実行して同期を強化（100ms遅延削除 - Phase 1A最適化）
			if (!longPollState.isPaused) {
				if (longPollState.currentXhr) {
					longPollState.currentXhr.abort();
				}
				startPolling();
			}
		},
		notifyMessageDeleted: (deleteData) => {
			// 削除されたメッセージを即座に他のクライアントに同期

			// 削除直後にポーリングを実行して同期を強化（100ms遅延削除 - Phase 1A最適化）
			if (!longPollState.isPaused) {
				if (longPollState.currentXhr) {
					longPollState.currentXhr.abort();
				}
				startPolling();
			}
		},
		debugState: () => {
			return {
				isConnected: longPollState.isConnected,
				isConnecting: longPollState.isConnecting,
				isPaused: longPollState.isPaused,
				channelId: longPollState.channelId,
				threadId: longPollState.threadId,
				lastUpdate: longPollState.lastUpdate,
				reconnectAttempts: longPollState.reconnectAttempts,
				totalRequests: longPollState.totalRequests,
				messageEvents: longPollState.messageEvents,
				deleteEvents: longPollState.deleteEvents,
				errorEvents: longPollState.errorEvents,
				compressionEnabled: longPollState.compressionEnabled,
				lastReactionTimestamp: longPollState.lastReactionTimestamp,
				lastThreadReactionTimestamp: longPollState.lastThreadReactionTimestamp,
				reactionPollingEnabled: longPollState.reactionPollingEnabled,
			};
		},
	};

	// グローバルに公開
	window.LMSLongPoll = longPollAPI;
	if (!window.LMSChat) {
		window.LMSChat = {};
	}
	window.LMSChat.LongPoll = longPollAPI;
	window.LMSChat.longpoll = longPollAPI; // デバッグツール互換性

	// LocalStorage監視による即座同期
	window.addEventListener('storage', (e) => {
		if (e.key === 'lms_message_sync' && e.newValue) {
			try {
				const syncData = JSON.parse(e.newValue);

				// 他のタブからの同期イベントの場合、即座にポーリング実行
				if (syncData.type === 'message_created' || syncData.type === 'message_deleted' ||
				    syncData.type === 'thread_message_deleted') {
					setTimeout(() => {
						if (longPollState.currentXhr) {
							longPollState.currentXhr.abort();
						}
						startPolling();
					}, 200);
				}
			} catch (e) {
			}
		}
	});

	// 🚨 EMERGENCY: 強制初期化関数
	function forceInitializeLongPolling() {
		// forceInitializeLongPolling実行 (debug log removed)

		window.LMS_INIT_ATTEMPTS = (window.LMS_INIT_ATTEMPTS || 0) + 1;

		// チャンネル1で強制接続 (debug log removed)
		connect(1);

		// 確実にstartPollingを呼び出し
		setTimeout(() => {
			// 1秒後にstartPolling強制実行 (debug log removed)
			if (!longPollState.isConnected && !longPollState.isConnecting) {
				longPollState.channelId = 1;
				longPollState.isConnecting = true;
				startPolling();
			}
		}, 1000);
	}

	// DOM Ready時の初期化
	$(document).ready(() => {
		
		// 🚨 EMERGENCY: 即座に強制初期化実行
		forceInitializeLongPolling();

		// 🔥 CRITICAL FIX: スレッドIDの自動検出とポーリング開始
		setTimeout(() => {
			const currentThread = window.LMSChat?.state?.currentThread;
			const threadFromURL = new URLSearchParams(window.location.search).get('thread');
			const detectedThreadId = currentThread || threadFromURL;
			
			
			if (detectedThreadId) {
				longPollState.threadId = parseInt(detectedThreadId, 10);
				longPollState.reactionPollingEnabled = true;
				
				
				// スレッドオープンイベント手動発火
				$(document).trigger('lms_thread_opened', [longPollState.threadId]);
				
				// 即座にポーリング開始
				if (typeof pollThreadReactions === 'function') {
					pollThreadReactions();
				}
			}
		}, 1000);

		// 自動接続開始（チャンネルIDが利用可能な場合）
		
		if (window.LMSChat?.state?.currentChannel) {
			connect(window.LMSChat.state.currentChannel);
		} else {
			// チャンネルIDがまだ利用できない場合、数秒後に再確認
			setTimeout(() => {
				
				if (window.LMSChat?.state?.currentChannel) {
					connect(window.LMSChat.state.currentChannel);
				} else {
					// テスト用のダミー接続（チャンネル1）
					connect(1);
				}
			}, 2000);
		}
	});

	// 🚨 ULTIMATE EMERGENCY: 絶対に動作する緊急バックアップシステム
	setTimeout(() => {
		// 5秒後の最終バックアップ実行 (debug log removed)
		
		// グローバルにアクセス可能な緊急システム
		window.EMERGENCY_SYNC_SYSTEM = {
			pollThreadMessages: function() {
				// threadメッセージポーリング実行 (debug log removed)

				if (!window.lms_ajax_obj?.ajax_url) {
					// Ajax設定なし - スキップ (debug log removed)
					return;
				}
				
				$.ajax({
					url: window.lms_ajax_obj.ajax_url,
					type: 'POST',
					data: {
						action: 'lms_unified_long_poll',
						channel_id: 1,
						thread_id: 0,
						last_event_id: 0,
						timeout: 10,
						event_types: 'thread_create,thread_delete',
						nonce: window.lms_ajax_obj.nonce
					},
					timeout: 15000,
					success: function(response) {
						// レスポンス受信 (debug log removed)

						if (response.success && response.data?.events) {
							response.data.events.forEach(event => {
								// イベント処理 (debug log removed)

								if (event.type === 'thread_create') {
									// スレッドメッセージ作成検出 (debug log removed)
									// 強制的にページ更新ではなく、イベント処理
									if (window.LMSChat?.threads?.appendThreadMessage) {
										window.LMSChat.threads.appendThreadMessage(event.data);
									}
								} else if (event.type === 'thread_delete') {
									// スレッドメッセージ削除検出 (debug log removed)
									// 強制的にDOM削除
									$(`.thread-message[data-message-id="${event.message_id}"]`).remove();
								}
							});
						}
					},
					error: function(xhr, status, error) {
						// エラー (debug log removed)
					}
				});
			},
			
			startPolling: function() {
				// 緊急ポーリング開始（60秒間隔） (debug log removed)
				setInterval(() => {
					this.pollThreadMessages();
				}, 60000); // 10秒→60秒間隔（負荷大幅削減）
			}
		};
		
		// 緊急システム開始
		window.EMERGENCY_SYNC_SYSTEM.startPolling();
		
		// 即座に1回実行
		window.EMERGENCY_SYNC_SYSTEM.pollThreadMessages();
		
	}, 5000);

})(jQuery);
