/**
 * Service Worker ファイル - バージョン 2.0.3
 * このファイルはサイトルートにコピーされ、ページのリソースキャッシュなどを管理します。
 * プッシュ通知の受信・表示を処理します。
 * 最終更新: 2025-06-06
 */

// グローバル変数として現在のユーザーIDを保持
let currentUserId = null;

// デバッグモード
const DEBUG = false;
// すべての通知を表示するモード（テスト用）
const SHOW_ALL_NOTIFICATIONS = false;
// キャッシュバスティング用のバージョン
const SW_VERSION = '1.2.4';
const CACHE_NAME = 'lms-chat-cache-' + SW_VERSION;

// キャッシュするアセット
const STATIC_ASSETS = [
	'/wp-content/themes/lms/js/lz-string.min.js',
	'/wp-content/themes/lms/js/chat-core.js',
	'/wp-content/themes/lms/js/chat-ui.js',
	'/wp-content/themes/lms/js/chat-messages.js',
	'/wp-content/themes/lms/js/chat-reactions.js',
	'/wp-content/themes/lms/js/chat-threads.js',
	'/wp-content/themes/lms/js/chat-search.js',
	'/wp-content/themes/lms/js/emoji-picker.js',
	'/wp-content/themes/lms/img/icon-thread.svg',
	'/wp-content/themes/lms/img/icon-emoji.svg',
	'/wp-content/themes/lms/img/icon-download.svg',
	'/wp-content/themes/lms/img/default-avatar.png',
	'/wp-content/themes/lms/style.css',
];

// メディアアセットのキャッシュ設定
const MEDIA_CACHE_NAME = 'lms-media-cache-' + SW_VERSION;
const MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];

// APIレスポンスのキャッシュ設定
const API_CACHE_NAME = 'lms-api-cache-' + SW_VERSION;
const API_CACHE_DURATION = 60 * 60 * 1000; // 1時間（ミリ秒）

// デバッグログ
function debugLog(...args) {
	// デバッグモードが無効なので何もしない
}

// Long polling Ajax通信をService Workerで妨害しないためのURL判定
function isLongPollingRequest(url) {
	const urlObj = new URL(url);
	return urlObj.searchParams.has('action') && 
		   urlObj.searchParams.get('action') === 'lms_get_comprehensive_unread_counts';
}

// Ajax通信をService Workerで妨害しないためのURL判定
function isChatAjaxRequest(url) {
	const urlObj = new URL(url);
	const chatActions = [
		'lms_chat_sse',
		'lms_chat_ping',
		'lms_send_message',
		'lms_delete_message',
		'lms_get_messages',
		'lms_upload_file'
	];
	
	return urlObj.pathname.includes('admin-ajax.php') && 
		   chatActions.some(action => 
			   urlObj.searchParams.get('action') === action
		   );
}

// 初期化時のログ
debugLog('Service Worker initialized at', new Date().toISOString());
debugLog(
	'初期化完了 - バージョン:',
	SW_VERSION,
	'DEBUG:',
	DEBUG,
	'SHOW_ALL_NOTIFICATIONS:',
	SHOW_ALL_NOTIFICATIONS
);

// ユーザーIDを設定するメッセージを受け取るイベントリスナー
// 統合されたメッセージハンドラ（最初の定義）
self.addEventListener('message', function (event) {
	// メッセージタイプをチェック
	if (!event.data || !event.data.type) {
		debugLog('[Service Worker] 不明なメッセージ:', event.data);
		return;
	}

	const messageType = event.data.type;
	debugLog('[Service Worker] メッセージ受信:', messageType);

	// ユーザーID設定メッセージ処理
	if (messageType === 'SET_USER_ID') {
		const userId = parseInt(event.data.userId, 10);
		const previousUserId = currentUserId;
		currentUserId = userId;

		// MessageChannel APIを使用した応答（安全なチェック付き）
		if (event.ports && event.ports[0]) {
			try {
				event.ports[0].postMessage({
					result: 'success',
					userId: currentUserId,
					timestamp: Date.now(),
				});
			} catch (error) {
			}
		}

		debugLog(
			'[Service Worker] ユーザーIDを設定しました:',
			currentUserId,
			'前回:',
			previousUserId
		);
		return;
	}

	// SKIP_WAITINGメッセージ処理
	if (messageType === 'SKIP_WAITING') {
		self.skipWaiting();
		return;
	}

	// キャッシュクリアリクエスト処理
	if (messageType === 'CLEAR_CACHE') {
		event.waitUntil(
			caches
				.keys()
				.then((cacheNames) => {
					return Promise.all(
						cacheNames
							.filter(
								(cacheName) =>
									cacheName.startsWith('lms-chat-cache-') ||
									cacheName.startsWith('lms-media-cache-') ||
									cacheName.startsWith('lms-api-cache-')
							)
							.map((cacheName) => {
								return caches.delete(cacheName);
							})
					);
				})
				.then(() => {
					if (event.ports && event.ports[0]) {
						try {
							event.ports[0].postMessage({ success: true });
						} catch (error) {
						}
					}
				})
				.catch((error) => {
					if (event.ports && event.ports[0]) {
						try {
							event.ports[0].postMessage({ success: false, error: error.message });
						} catch (responseError) {
						}
					}
				})
		);
		return;
	}

	// キャッシュリフレッシュリクエスト処理
	if (messageType === 'REFRESH_CACHE' || messageType === 'REFRESH_STATIC_CACHE') {
		event.waitUntil(
			caches
				.open(CACHE_NAME)
				.then((cache) => {
					return cache.addAll(STATIC_ASSETS);
				})
				.then(() => {
					if (event.ports && event.ports[0]) {
						try {
							event.ports[0].postMessage({ success: true });
						} catch (error) {
						}
					}
				})
				.catch((error) => {
					if (event.ports && event.ports[0]) {
						try {
							event.ports[0].postMessage({ success: false, error: error.message });
						} catch (responseError) {
						}
					}
				})
		);
		return;
	}

	// CLEAR_CACHESメッセージ処理（別名対応）
	if (messageType === 'CLEAR_CACHES') {
		event.waitUntil(
			caches
				.keys()
				.then((cacheNames) => {
					return Promise.all(
						cacheNames
							.filter((cacheName) => {
								return cacheName.startsWith('lms-');
							})
							.map((cacheName) => {
								return caches.delete(cacheName);
							})
					);
				})
				.then(() => {
					if (event.ports && event.ports[0]) {
						try {
							event.ports[0].postMessage({ success: true });
						} catch (error) {
						}
					}
				})
				.catch((error) => {
					if (event.ports && event.ports[0]) {
						try {
							event.ports[0].postMessage({ success: false, error: error.message });
						} catch (responseError) {
						}
					}
				})
		);
		return;
	}

	debugLog('[Service Worker] 未対応メッセージタイプ:', messageType);
});

// プッシュ通知を受信したときの処理
self.addEventListener('push', function (event) {
	if (!event.data) {
		// データがない場合でもデフォルト通知を表示
		event.waitUntil(
			self.registration.showNotification('新しい通知', {
				body: 'メッセージを受信しました',
				icon: '/wp-content/themes/lms/img/icon-notification.svg',
				badge: '/wp-content/themes/lms/img/icon-notification.svg',
			})
		);
		return;
	}

	try {
		// データをJSONとしてパース
		const data = event.data.json();

		// 通知データから情報を抽出
		const sender_id = data.data && data.data.senderId ? parseInt(data.data.senderId, 10) : null;

		// recipientIdとcurrentUserIdの両方をチェック（互換性のため）
		const recipient_id = data.data
			? (data.data.recipientId ? parseInt(data.data.recipientId, 10) : null) ||
			  (data.data.currentUserId ? parseInt(data.data.currentUserId, 10) : null)
			: null;

		// 「全員宛て」かどうかを判定（通常はrecipient_id=1の場合が全員宛て）
		const is_to_all = recipient_id === 1;

		const is_test = data.data && data.data.testMode === true;

		// メッセージがエラーなく処理できることを確認
		if (!currentUserId || isNaN(currentUserId)) {
			// currentUserIdが設定されていない場合でも通知を表示（デバッグモード時）
		}

		// 通知表示の条件をさらに改善:
		// - デバッグモード中は常に表示
		// - テスト通知は常に表示
		// - 自分が送信したメッセージの通知はスキップ
		// - 全員宛てのメッセージは常に表示（自分が送信した場合を除く）
		// - 特定ユーザー宛ての場合、自分宛ての場合のみ表示

		// 実際に通知をスキップする条件
		let skipNotification = false;
		let skipReason = '';

		if (is_test) {
			// テスト通知は常に表示
			skipNotification = false;
		} else if (SHOW_ALL_NOTIFICATIONS) {
			// デバッグモード中は常に表示
			skipNotification = false;
		} else if (sender_id && currentUserId && sender_id === currentUserId) {
			// 自分が送信したメッセージは通知しない
			skipReason = '自分が送信した通知のためスキップします';
			skipNotification = true;
		} else if (is_to_all) {
			// 全員宛てのメッセージは表示（自分が送信した場合を除く）
			skipNotification = false;
		} else if (recipient_id && currentUserId && recipient_id !== currentUserId) {
			// 特定ユーザー宛てで、自分宛てでない場合はスキップ
			skipReason = '自分宛てでない通知のためスキップします';
			skipNotification = true;
		}

		// 通知をスキップする場合
		if (skipNotification) {
			return;
		}

		// 通知オプションを設定
		const options = {
			body: data.body || 'メッセージを受信しました',
			icon: data.icon || '/wp-content/themes/lms/img/icon-notification.svg',
			badge: data.badge || '/wp-content/themes/lms/img/icon-notification.svg',
			data: data.data || {},
			tag: is_test ? 'test-notification-' + Date.now() : 'chat-notification-' + Date.now(), // テスト通知の場合は別のタグを使用
			requireInteraction: true,
			renotify: true,
			timestamp: data.timestamp || Date.now(),
			vibrate: [100, 50, 100], // バイブレーションパターンを追加
			actions: [
				{
					action: 'open',
					title: 'メッセージを開く',
				},
			],
		};

		// 通知を表示
		event.waitUntil(
			self.registration
				.showNotification(data.title || 'プッシュ通知', options)
				.then(() => {
					return self.registration.getNotifications();
				})
				.catch((error) => {
					// エラーが発生した場合でもフォールバック通知を試みる
					if (is_test) {
						return self.registration.showNotification('テスト通知', {
							body: 'これはフォールバックテスト通知です',
							icon: '/wp-content/themes/lms/img/icon-notification.svg',
							tag: 'fallback-test-' + Date.now(),
						});
					}
				})
		);
	} catch (error) {
		// エラーが発生した場合でもシンプルな通知を表示
		event.waitUntil(
			self.registration.showNotification('新着メッセージ', {
				body: 'メッセージが届いています',
				icon: '/wp-content/themes/lms/img/icon-notification.svg',
				tag: 'error-fallback-' + Date.now(),
			})
		);
	}
});

// Service Workerのインストール処理
self.addEventListener('install', (event) => {
	// キャッシュの作成と事前読み込み
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {

				// addAllの代わりに、個別のfetch/putの処理に置き換える
				return Promise.allSettled(
					STATIC_ASSETS.map((url) => {
						return fetch(url, {
							credentials: 'same-origin',
							mode: 'no-cors', // クロスオリジンリソースも許可
							cache: 'no-cache', // キャッシュを使わず常に新しいリクエスト
						})
							.then((response) => {
								// no-corsモードではresponse.okがfalseになることがあるので、ステータスチェックを緩和
								if (response) {
									return cache.put(url, response);
								}
								throw new Error(
									`${url}の取得に失敗: ${response ? response.status : 'レスポンスなし'}`
								);
							})
							.catch((error) => {
								// エラーがあっても続行
								return Promise.resolve();
							});
					})
				);
			})
			.then((results) => {
				const succeeded = results.filter((r) => r.status === 'fulfilled').length;
				const failed = results.filter((r) => r.status === 'rejected').length;
					return self.skipWaiting();
			})
			.catch((error) => {
				// 全体的なエラーが発生しても続行（Service Workerのインストールを妨げない）
				return self.skipWaiting();
			})
	);
});

// Service Workerのアクティベーション処理
self.addEventListener('activate', (event) => {
	// 古いキャッシュの削除
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((cacheName) => {
							// 現在のバージョン以外のキャッシュを削除
							return (
								cacheName.startsWith('lms-') &&
								cacheName !== CACHE_NAME &&
								cacheName !== MEDIA_CACHE_NAME &&
								cacheName !== API_CACHE_NAME
							);
						})
						.map((cacheName) => {
								return caches.delete(cacheName);
						})
				);
			})
			.then(() => {

				// 制御下のすべてのクライアントに更新通知を送信
				self.clients.matchAll().then((clients) => {
					clients.forEach((client) => {
						client.postMessage({
							type: 'SW_UPDATED',
							version: SW_VERSION,
							timestamp: Date.now(),
						});
					});
				});

				// 制御下のすべてのクライアントを取得（アクティブ状態の場合のみ）
				if (self.registration && self.registration.active === self) {
					return self.clients.claim();
				} else {
					return Promise.resolve();
				}
			})
	);
});

// フェッチイベントの処理
self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);

	// Chrome DevToolsリクエストとchrome-extension URLは無視
	if (url.pathname.startsWith('/devtools/') || url.protocol === 'chrome-extension:') return;

	// 外部ドメイン（クロスオリジン）へのリクエストは処理しない
	// これによりTwitterなどの外部リソースへのフェッチが失敗するのを防ぐ
	if (url.origin !== self.location.origin) {
		// 外部ドメインへのリクエストは処理せず、ブラウザの通常のフェッチ処理に任せる
		return;
	}

	// スタイルシートとJavaScriptファイルは常にキャッシュから提供（ネットワークフォールバック）
	if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
		event.respondWith(
			caches.match(request).then((cachedResponse) => {
				if (cachedResponse) {
					return cachedResponse;
				}

				return fetch(request).then((response) => {
					// 有効なレスポンスのみキャッシュ
					if (!response || response.status !== 200 || response.type !== 'basic') {
						return response;
					}

					// レスポンスをクローンしてキャッシュに保存
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return response;
				});
			})
		);
		return;
	}

	// メディアファイルのキャッシング
	if (MEDIA_EXTENSIONS.some((ext) => url.pathname.toLowerCase().endsWith(ext))) {
		event.respondWith(
			caches.match(request).then((cachedResponse) => {
				if (cachedResponse) {
					return cachedResponse;
				}

				return fetch(request).then((response) => {
					if (!response || response.status !== 200) {
						return response;
					}

					// メディアキャッシュに保存
					const responseToCache = response.clone();
					caches.open(MEDIA_CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return response;
				});
			})
		);
		return;
	}

	// Long pollingとチャット関連のAjaxリクエストはService Workerで処理しない
	if (isLongPollingRequest(request.url) || isChatAjaxRequest(request.url)) {
		return; // Service Workerによる処理をスキップ
	}

	// その他のAPIリクエスト（AJAXエンドポイント）の処理
	if (url.pathname.endsWith('admin-ajax.php')) {
		// 通常のAjaxリクエストも直接ネットワークに転送（Service Worker干渉を防ぐ）
		return; // Service Workerによる処理をスキップ
	}

	// その他のリクエストはネットワークファーストで処理（静的アセットのみキャッシュ）
	if (STATIC_ASSETS.some((asset) => url.pathname.endsWith(asset))) {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (!response || response.status !== 200) {
						// 無効なレスポンスの場合はキャッシュから取得
						return caches.match(request).then((cachedResponse) => {
							return cachedResponse || response; // キャッシュがなければ元のレスポンスを返す
						});
					}

					// レスポンスをクローンしてキャッシュに保存
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return response;
				})
				.catch((error) => {
					// ネットワークエラー時はキャッシュから取得
					return caches.match(request).then((cachedResponse) => {
						if (cachedResponse) {
							return cachedResponse;
						}

						// キャッシュにもない場合は、汎用的なエラーレスポンスを返す
						if (request.destination === 'image') {
							// 画像の場合は空の画像データを返す
							return new Response('', { status: 404, statusText: 'Not Found' });
						} else {
							// その他のリソースの場合
							return new Response('リソースが見つかりません', {
								status: 404,
								statusText: 'Not Found',
							});
						}
					});
				})
		);
	}
});

/**
 * 通知クリック時の処理
 * 通知がクリックされたときに適切なページを開く
 */
self.addEventListener('notificationclick', function (event) {
	// 通知を閉じる
	event.notification.close();

	// 通知データから情報を取得
	let url = '/';
	let channelId = null;
	let messageId = null;

	if (event.notification.data) {
		url = event.notification.data.url || '/';
		channelId = event.notification.data.channelId || null;
		messageId = event.notification.data.messageId || null;
	}

	// チャンネルIDとメッセージIDがある場合はURLにパラメータを追加
	if (channelId) {
		url = url + (url.indexOf('?') === -1 ? '?' : '&') + 'channel=' + channelId;

		if (messageId) {
			url += '&message=' + messageId;
		}
	}

	// ウィンドウを開く処理
	const openWindow = () => {
		return self.clients
			.matchAll({
				type: 'window',
				includeUncontrolled: true,
			})
			.then((windowClients) => {
				// 既存のタブがあれば、そのタブにフォーカスしてURLを変更
				for (let i = 0; i < windowClients.length; i++) {
					const client = windowClients[i];
					if (client.url.includes(self.location.origin)) {
						return client.focus().then((focusedClient) => {
							return focusedClient.navigate(url);
						});
					}
				}

				// 既存のタブがなければ新しいウィンドウを開く
				return self.clients.openWindow(url).catch((err) => {});
			});
	};

	event.waitUntil(openWindow());
});

// 重複するメッセージハンドラを削除 - 統合された1つのハンドラで処理
