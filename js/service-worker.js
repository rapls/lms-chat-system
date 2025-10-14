let currentUserId = null;
const SHOW_ALL_NOTIFICATIONS = false;
const SW_VERSION = '2.0.0-1754805836';
const CACHE_NAME = 'lms-chat-cache-' + SW_VERSION;
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
const MEDIA_CACHE_NAME = 'lms-media-cache-' + SW_VERSION;
const MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
const API_CACHE_NAME = 'lms-api-cache-' + SW_VERSION;
const API_CACHE_DURATION = 60 * 60 * 1000;
self.addEventListener('message', function (event) {
	if (event.data && event.data.type === 'SET_USER_ID') {
		const userId = parseInt(event.data.userId, 10);
		const previousUserId = currentUserId;
		currentUserId = userId;
		if (event.ports && event.ports[0]) {
			event.ports[0].postMessage({
				result: 'success',
				userId: currentUserId,
				timestamp: Date.now(),
			});
		}
	} else if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
self.addEventListener('push', function (event) {
	if (!event.data) {
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
		const data = event.data.json();
		const sender_id = data.data && data.data.senderId ? parseInt(data.data.senderId, 10) : null;
		const recipient_id = data.data
			? (data.data.recipientId ? parseInt(data.data.recipientId, 10) : null) ||
			  (data.data.currentUserId ? parseInt(data.data.currentUserId, 10) : null)
			: null;
		const is_to_all = recipient_id === 1;
		const is_test = data.data && data.data.testMode === true;
		if (!currentUserId || isNaN(currentUserId)) {
		}
		let skipNotification = false;
		let skipReason = '';
		if (is_test) {
			skipNotification = false;
		} else if (SHOW_ALL_NOTIFICATIONS) {
			skipNotification = false;
		} else if (sender_id && currentUserId && sender_id === currentUserId) {
			skipReason = '自分が送信した通知のためスキップします';
			skipNotification = true;
		} else if (is_to_all) {
			skipNotification = false;
		} else if (recipient_id && currentUserId && recipient_id !== currentUserId) {
			skipReason = '自分宛てでない通知のためスキップします';
			skipNotification = true;
		}
		if (skipNotification) {
			return;
		}
		const options = {
			body: data.body || 'メッセージを受信しました',
			icon: data.icon || '/wp-content/themes/lms/img/icon-notification.svg',
			badge: data.badge || '/wp-content/themes/lms/img/icon-notification.svg',
			data: data.data || {},
			tag: is_test ? 'test-notification-' + Date.now() : 'chat-notification-' + Date.now(),
			requireInteraction: true,
			renotify: true,
			timestamp: data.timestamp || Date.now(),
			vibrate: [100, 50, 100],
			actions: [
				{
					action: 'open',
					title: 'メッセージを開く',
				},
			],
		};
		event.waitUntil(
			self.registration
				.showNotification(data.title || 'プッシュ通知', options)
				.then(() => {
					return self.registration.getNotifications();
				})
				.catch((error) => {
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
		event.waitUntil(
			self.registration.showNotification('新着メッセージ', {
				body: 'メッセージが届いています',
				icon: '/wp-content/themes/lms/img/icon-notification.svg',
				tag: 'error-fallback-' + Date.now(),
			})
		);
	}
});
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				return Promise.allSettled(
					STATIC_ASSETS.map(async url => {
						try {
							const response = await fetch(url);
							if (response.ok) {
								await cache.add(url);
								return url;
							} else {
								return null;
							}
						} catch (error) {
							return null;
						}
					})
				);
			})
			.then(() => {
				return self.skipWaiting();
			})
			.catch((error) => {
			})
	);
});
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((cacheName) => {
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
				return self.clients.claim();
			})
	);
});
self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (url.pathname.startsWith('/devtools/') || url.protocol === 'chrome-extension:') return;
	if (url.origin !== self.location.origin) {
		return;
	}
	if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
		event.respondWith(
			caches.match(request).then((cachedResponse) => {
				if (cachedResponse) {
					return cachedResponse;
				}
				return fetch(request).then((response) => {
					if (!response || response.status !== 200 || response.type !== 'basic') {
						return response;
					}
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
	if (url.pathname.endsWith('admin-ajax.php')) {
		if (
			request.method === 'POST' ||
			url.search.includes('action=lms_send_message') ||
			url.search.includes('action=lms_long_polling') ||
			url.search.includes('action=lms_chat_long_polling') ||
			url.search.includes('action=lms_get_messages')
		) {
			return;
		}
		event.respondWith(
			caches.match(request).then((cachedResponse) => {
				if (cachedResponse) {
					const cachedDate = new Date(cachedResponse.headers.get('date'));
					const now = new Date();
					if (now.getTime() - cachedDate.getTime() < API_CACHE_DURATION) {
						return cachedResponse;
					}
				}
				return fetch(request)
					.then((response) => {
						if (!response || response.status !== 200) {
							return response;
						}
						const responseToCache = response.clone();
						caches.open(API_CACHE_NAME).then((cache) => {
							cache.put(request, responseToCache);
						});
						return response;
					})
					.catch((error) => {
						return (
							cachedResponse ||
							new Response(JSON.stringify({ success: false, data: 'ネットワークエラー' }), {
								headers: { 'Content-Type': 'application/json' },
							})
						);
					});
			})
		);
		return;
	}
	if (STATIC_ASSETS.some((asset) => url.pathname.endsWith(asset))) {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (!response || response.status !== 200) {
						return caches.match(request);
					}
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});
					return response;
				})
				.catch(() => {
					return caches.match(request);
				})
		);
	}
});
self.addEventListener('notificationclick', function (event) {
	event.notification.close();
	let url = '/';
	let channelId = null;
	let messageId = null;
	if (event.notification.data) {
		url = event.notification.data.url || '/';
		channelId = event.notification.data.channelId || null;
		messageId = event.notification.data.messageId || null;
	}
	if (channelId) {
		url = url + (url.indexOf('?') === -1 ? '?' : '&') + 'channel=' + channelId;
		if (messageId) {
			url += '&message=' + messageId;
		}
	}
	const openWindow = () => {
		return self.clients
			.matchAll({
				type: 'window',
				includeUncontrolled: true,
			})
			.then((windowClients) => {
				for (let i = 0; i < windowClients.length; i++) {
					const client = windowClients[i];
					if (client.url.includes(self.location.origin)) {
						return client.focus().then((focusedClient) => {
							return focusedClient.navigate(url);
						});
					}
				}
				return self.clients.openWindow(url).catch((err) => {});
			});
	};
	event.waitUntil(openWindow());
});
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
	if (event.data && event.data.type === 'CLEAR_CACHES') {
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
					event.ports[0].postMessage({ success: true });
				})
				.catch((error) => {
					event.ports[0].postMessage({ success: false, error: error.message });
				})
		);
	}
	if (event.data && event.data.type === 'REFRESH_STATIC_CACHE') {
		event.waitUntil(
			caches
				.open(CACHE_NAME)
				.then((cache) => {
					return cache.addAll(STATIC_ASSETS);
				})
				.then(() => {
					event.ports[0].postMessage({ success: true });
				})
				.catch((error) => {
					event.ports[0].postMessage({ success: false, error: error.message });
				})
		);
	}
});
