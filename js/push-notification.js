(function (window, document, $) {
	'use strict';
	class PushNotification {
		constructor(lmsPush) {
			this.serviceWorkerRegistration = null;
			this.subscription = null;
			this.userId = null;
			this.isInitialized = false;
			this.isSubscribed = false;
			this.hasUserIdSent = false;
			this.retryCount = 0;
			this.maxRetries = 3;
			this.nonceRefreshInterval = 30 * 60 * 1000;
			this.vapidPublicKey = lmsPush.vapidPublicKey;
			this.ajaxUrl = lmsPush.ajaxUrl;
			if (typeof lmsPush === 'undefined') {
				const pushDataElement = document.getElementById('lms-push-data');
				if (pushDataElement) {
					try {
						window.lmsPush = JSON.parse(pushDataElement.textContent);
					} catch (e) {
						window.lmsPush = {
							ajaxUrl: '/wp-admin/admin-ajax.php',
							isEnabled: false,
							nonce: '',
						};
					}
				} else {
					window.lmsPush = {
						ajaxUrl: '/wp-admin/admin-ajax.php',
						isEnabled: false,
						nonce: '',
					};
				}
			}
			this.setupNonceRefresh();
		}
		async init() {
			if (typeof lmsPush === 'undefined' || !lmsPush.isEnabled) {
				return false;
			}
			if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
				return false;
			}
			try {
				this.userId = this.getUserId();
				if (!this.userId) {
					setTimeout(() => this.init(), 5000);
					return false;
				}
				try {
					const swRegistration = await this.registerServiceWorker();
					if (!swRegistration) {
						return false;
					}
				} catch (swError) {
					this.disablePushNotifications();
					return false;
				}
				try {
					await this.checkSubscription();
				} catch (subError) {
					if (subError.message.includes('サーバー') || subError.message.includes('400') || subError.message.includes('timeout')) {
						return false;
					}
				}
				if (this.serviceWorkerRegistration && !this.hasUserIdSent) {
					try {
						await this.sendUserIdToServiceWorker();
					} catch (userIdError) {
					}
				}
				this.isInitialized = true;
				return true;
			} catch (error) {
				if (this.retryCount < this.maxRetries) {
					this.retryCount++;
					setTimeout(() => this.init(), 3000);
					return false;
				} else {
					this.disablePushNotifications();
					return false;
				}
			}
		}
		error(...args) {
		}
		setCookie(name, value, days) {
			const date = new Date();
			date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
			const expires = '; expires=' + date.toUTCString();
			document.cookie = name + '=' + value + expires + '; path=/';
		}
		getCookie(name) {
			const value = `; ${document.cookie}`;
			const parts = value.split(`; ${name}=`);
			if (parts.length === 2) return parts.pop().split(';').shift();
			return null;
		}
		shouldShowPrompt() {
			const lastDismissed = this.getCookie(this.COOKIE_NAME);
			if (!lastDismissed) return true;
			const lastDismissedTime = parseInt(lastDismissed, 10);
			return Date.now() - lastDismissedTime >= this.PROMPT_INTERVAL;
		}
		async unregisterExistingServiceWorkers() {
			try {
				if (this.isEnabled === false || (window.lmsPush && window.lmsPush.isEnabled === false)) {
					return;
				}
				const registrations = await navigator.serviceWorker.getRegistrations();
				if (registrations.length > 0) {
					for (const registration of registrations) {
						await registration.unregister();
					}
				}
			} catch (error) {
			}
		}
		async checkExistingSubscription() {
			try {
				if (this.isEnabled === false || (window.lmsPush && window.lmsPush.isEnabled === false)) {
					const $prompt = document.getElementById('notification-prompt');
					if ($prompt) $prompt.style.display = 'none';
					try {
						const registrations = await navigator.serviceWorker.getRegistrations();
						for (const registration of registrations) {
							try {
								const subscription = await registration.pushManager.getSubscription();
								if (subscription) {
									await subscription.unsubscribe();
								}
							} catch (e) {
							}
							try {
								await registration.unregister();
							} catch (e) {
							}
						}
						if (navigator.serviceWorker.controller) {
							navigator.serviceWorker.controller.postMessage({
								type: 'CLEANUP',
								timestamp: Date.now(),
							});
						}
					} catch (e) {
					}
					return null;
				}
				if (!this.serviceWorkerRegistration) {
					return;
				}
				const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
				if (subscription) {
					this.isSubscribed = true;
					await this.updateSubscriptionOnServer(subscription);
					await this.sendUserIdToServiceWorker();
					return subscription;
				} else {
					if (Notification.permission === 'granted') {
						const newSubscription = await this.setupPushSubscription();
						if (newSubscription) {
							await this.sendUserIdToServiceWorker();
						}
						return newSubscription;
					} else {
						const $prompt = document.getElementById('notification-prompt');
						if ($prompt) $prompt.style.display = 'block';
					}
				}
			} catch (error) {
				if (this.isEnabled === false || (window.lmsPush && window.lmsPush.isEnabled === false)) {
					return null;
				}
			}
		}
		async checkNotificationPermission() {
			if (Notification.permission === 'granted') {
				return 'granted';
			}
			return Notification.permission;
		}
		async setupPushSubscription() {
			try {
				if (!this.vapidPublicKey) {
					try {
						const vapidResponse = await fetch(`${this.ajaxUrl}?action=lms_get_vapid_key`);
						if (!vapidResponse.ok) {
							throw new Error(`VAPID鍵の取得に失敗しました: ${vapidResponse.status}`);
						}
						const vapidData = await vapidResponse.json();
						if (!vapidData.success || !vapidData.data || !vapidData.data.key) {
							throw new Error('VAPID鍵のレスポンスが無効です');
						}
						this.vapidPublicKey = vapidData.data.key;
					} catch (error) {
						return false;
					}
				}
				try {
					const convertedVapidKey = this.urlBase64ToUint8Array(this.vapidPublicKey);
					if (Notification.permission !== 'granted') {
						const permission = await Notification.requestPermission();
						if (permission !== 'granted') {
							return false;
						}
					}
					const existingSub = await this.serviceWorkerRegistration.pushManager.getSubscription();
					if (existingSub) {
						await existingSub.unsubscribe();
					}
					const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: convertedVapidKey,
					});
					const updateResult = await this.updateSubscriptionOnServer(subscription);
					if (updateResult) {
						this.subscription = subscription;
						this.isSubscribed = true;
						return true;
					} else {
						throw new Error('サーバーへの購読情報送信に失敗しました');
					}
				} catch (error) {
					if (error.message && error.message.includes('subscription exists')) {
						try {
							const currentSub = await this.serviceWorkerRegistration.pushManager.getSubscription();
							if (currentSub) {
								const updateResult = await this.updateSubscriptionOnServer(currentSub);
								if (updateResult) {
									this.subscription = currentSub;
									this.isSubscribed = true;
									return true;
								}
							}
						} catch (subError) {
							return false;
						}
					}
				}
			} catch (error) {
				return false;
			}
		}
		async updateSubscriptionOnServer(subscription) {
			try {
				if (!this.userId) {
					this.userId = this.getUserId();
					if (!this.userId) {
						return false;
					}
				}
				if (!subscription) {
					return false;
				}
				if (!lmsPush || !lmsPush.nonce) {
					await this.refreshNonce();
					if (!lmsPush || !lmsPush.nonce) {
						return false;
					}
				}
				const subscriptionJson = JSON.stringify(subscription);
				const formData = new FormData();
				formData.append('action', 'lms_save_push_subscription');
				formData.append('nonce', lmsPush.nonce);
				formData.append('user_id', this.userId);
				formData.append('subscription', subscriptionJson);
				let response;
				try {
					response = await fetch(lmsPush.ajaxUrl, {
						method: 'POST',
						body: formData,
						credentials: 'same-origin',
						signal: AbortSignal.timeout(5000)
					});
					if (!response.ok) {
						this.disablePushNotifications();
						throw new Error(`サーバーエラー: ${response.status}`);
					}
				} catch (networkError) {
					this.disablePushNotifications();
					throw new Error(`サーバー接続エラー: ${networkError.message}`);
				}
				const responseData = await response.json();
				if (!responseData.success) {
					if (
						responseData.data &&
						(responseData.data.includes('nonce') || responseData.data.includes('Nonce'))
					) {
						await this.refreshNonce();
						return await this.retryUpdateSubscription(subscription);
					}
					throw new Error(`購読情報の更新に失敗しました: ${responseData.data}`);
				}
				return true;
			} catch (error) {
				throw error;
			}
		}
		async retryUpdateSubscription(subscription) {
			try {
				if (!lmsPush || !lmsPush.nonce) {
					return false;
				}
				const formData = new FormData();
				formData.append('action', 'lms_save_push_subscription');
				formData.append('nonce', lmsPush.nonce);
				formData.append('user_id', this.userId);
				formData.append('subscription', JSON.stringify(subscription));
				try {
					const response = await fetch(lmsPush.ajaxUrl, {
						method: 'POST',
						body: formData,
						credentials: 'same-origin',
						signal: AbortSignal.timeout(5000)
					});
					if (!response.ok) {
						this.disablePushNotifications();
						return false;
					}
				} catch (networkError) {
					this.disablePushNotifications();
					return false;
				}
				const responseData = await response.json();
				if (!responseData.success) {
					throw new Error(`再試行後も購読情報の更新に失敗しました: ${responseData.data}`);
				}
				return true;
			} catch (error) {
				return false;
			}
		}
		async refreshNonce() {
			try {
				if (!lmsPush || !lmsPush.ajaxUrl) {
					return false;
				}
				const formData = new FormData();
				formData.append('action', 'lms_refresh_nonce');
				try {
					const response = await fetch(lmsPush.ajaxUrl, {
						method: 'POST',
						body: formData,
						credentials: 'same-origin',
						signal: AbortSignal.timeout(5000)
					});
					if (!response.ok) {
						this.disablePushNotifications();
						return false;
					}
				} catch (networkError) {
					this.disablePushNotifications();
					return false;
				}
				const responseData = await response.json();
				if (!responseData.success || !responseData.data.nonce) {
					throw new Error('nonceの更新に失敗しました');
				}
				lmsPush.nonce = responseData.data.nonce;
				return true;
			} catch (error) {
				return false;
			}
		}
		setupNonceRefresh() {
			if (this.nonceRefreshTimer) {
				clearInterval(this.nonceRefreshTimer);
			}
			this.nonceRefreshTimer = setInterval(() => {
				this.refreshNonce();
			}, this.nonceRefreshInterval);
		}
		updateSubscribeButton() {
			const $prompt = document.getElementById('notification-prompt');
			if (!$prompt) return;
			if (this.isEnabled === false || (window.lmsPush && window.lmsPush.isEnabled === false)) {
				$prompt.style.display = 'none';
				return;
			}
			if (Notification.permission === 'denied') {
				if (this.shouldShowPrompt()) {
					const promptHtml = `
						<div class="notification-message">
							<span>通知が拒否されています。ブラウザの設定から通知を有効にしてください。</span>
							<button type="button" class="close-notification" aria-label="閉じる">×</button>
						</div>
					`;
					$prompt.innerHTML = promptHtml;
					$prompt.style.display = 'block';
					const closeButton = $prompt.querySelector('.close-notification');
					if (closeButton) {
						closeButton.addEventListener('click', () => {
							$prompt.style.display = 'none';
							this.setCookie(this.COOKIE_NAME, Date.now().toString(), 30);
						});
					}
				} else {
					$prompt.style.display = 'none';
				}
			} else if (this.isSubscribed) {
				$prompt.style.display = 'none';
			} else {
				$prompt.style.display = 'block';
			}
		}
		urlBase64ToUint8Array(base64String) {
			try {
				const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
				const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
				if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
					throw new Error('Invalid base64 characters');
				}
				const rawData = window.atob(base64);
				const outputArray = new Uint8Array(rawData.length);
				for (let i = 0; i < rawData.length; ++i) {
					outputArray[i] = rawData.charCodeAt(i);
				}
				return outputArray;
			} catch (error) {
				throw error;
			}
		}
		showErrorMessage(message) {
			if (this.isEnabled === false || (window.lmsPush && window.lmsPush.isEnabled === false)) {
				return;
			}
			const $prompt = document.getElementById('notification-prompt');
			if (!$prompt) return;
			const errorHtml = `
				<div class="notification-message error">
					<span>通知の設定中にエラーが発生しました: ${message}</span>
					<button type="button" class="close-notification" aria-label="閉じる">×</button>
				</div>
			`;
			$prompt.innerHTML = errorHtml;
			$prompt.style.display = 'block';
			const closeButton = $prompt.querySelector('.close-notification');
			if (closeButton) {
				closeButton.addEventListener('click', () => {
					$prompt.style.display = 'none';
					this.setCookie(this.COOKIE_NAME, Date.now(), 30);
				});
			}
		}
		async registerServiceWorker() {
			try {
				if (!('serviceWorker' in navigator)) {
					return null;
				}
				const isSecureContext = 
					location.protocol === 'https:' ||
					location.hostname === 'localhost' ||
					location.hostname === '127.0.0.1' ||
					location.hostname.endsWith('.local');
				if (!('PushManager' in window)) {
					return null;
				}
				try {
					const registrations = await navigator.serviceWorker.getRegistrations();
					if (registrations.length > 0) {
						for (let registration of registrations) {
							try {
								const subscription = await registration.pushManager.getSubscription();
								if (subscription) {
									await subscription.unsubscribe();
								}
							} catch (e) {}
							await registration.unregister();
						}
					}
				} catch (error) {}
				const swUrl = this.getServiceWorkerUrl();
				const options = {
					scope: this.getServiceWorkerScope(),
					updateViaCache: 'none',
				};
				try {
					const registration = await navigator.serviceWorker.register(swUrl, options);
					if (!registration.active) {
						if (registration.installing) {
							await new Promise((resolve) => {
								const installingWorker = registration.installing;
								installingWorker.addEventListener('statechange', function () {
									if (installingWorker.state === 'activated') {
										resolve();
									}
								});
								setTimeout(() => {
									resolve();
								}, 10000);
							});
						} else if (registration.waiting) {
							registration.waiting.postMessage({ type: 'SKIP_WAITING' });
							await Promise.race([
								new Promise((resolve) => {
									navigator.serviceWorker.addEventListener(
										'controllerchange',
										() => {
											resolve();
										},
										{ once: true }
									);
								}),
								new Promise((resolve) =>
									setTimeout(() => {
										resolve();
									}, 5000)
								),
							]);
						}
					}
					else if (registration.active) {
						try {
							const messageChannel = new MessageChannel();
							messageChannel.port1.onmessage = (event) => {
							};
							registration.active.postMessage({ type: 'CLEAR_CACHES' }, [messageChannel.port2]);
							registration.update();
						} catch (error) {
						}
					}
					this.serviceWorkerRegistration = registration;
					navigator.serviceWorker.addEventListener('message', (event) => {
						if (event.data && event.data.type === 'SW_UPDATED') {
							if (
								confirm('アプリが更新されました。最新版を利用するためにページをリロードしますか？')
							) {
								window.location.reload();
							}
						}
					});
					return registration;
				} catch (error) {
					if (error.name === 'SecurityError') {
					} else if (error.name === 'TypeError' || error.message.includes('Not found')) {
						const alternativePaths = [
							`${window.location.origin}/wp-content/themes/lms/service-worker.js`,
							`${window.location.origin}/wp-content/themes/lms/js/service-worker.js`
						];
						for (const altUrl of alternativePaths) {
							try {
								const altRegistration = await navigator.serviceWorker.register(altUrl, {
									...options,
									scope: '/'
								});
								this.serviceWorkerRegistration = altRegistration;
								return altRegistration;
							} catch (altError) {}
						}
					} else {
					}
					return null;
				}
			} catch (error) {
				return null;
			}
		}
		getServiceWorkerUrl() {
			const baseUrl = window.location.origin;
			const swUrl = `${baseUrl}/service-worker.js`;
			return swUrl;
		}
		getServiceWorkerScope() {
			return '/';
		}
		async checkSubscription() {
			try {
				if (!this.serviceWorkerRegistration) {
					await this.registerServiceWorker();
					if (!this.serviceWorkerRegistration) {
						return false;
					}
				}
				await this.sendUserIdToServiceWorker();
				try {
					if (!this._userIdSendInterval) {
						this._userIdSendInterval = setInterval(() => {
							this.sendUserIdToServiceWorker().catch((err) => {});
						}, 10000);
					}
					if (document.visibilityState === 'visible') {
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState === 'visible') {
								this.sendUserIdToServiceWorker().catch((err) => {});
							}
						});
					}
				} catch (error) {}
				const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
				if (!subscription) {
					if (Notification.permission === 'granted') {
						const subscribeResult = await this.setupPushSubscription();
						return subscribeResult;
					} else if (Notification.permission === 'denied') {
						return false;
					} else {
						const permission = await Notification.requestPermission();
						if (permission === 'granted') {
							const subscribeResult = await this.setupPushSubscription();
							return subscribeResult;
						}
						return false;
					}
				}
				this.subscription = subscription;
				this.isSubscribed = true;
				try {
					await this.updateSubscriptionOnServer(subscription);
				} catch (e) {}
				return true;
			} catch (error) {
				if (
					error.name === 'NotAllowedError' ||
					(error.message && error.message.toLowerCase().includes('push service'))
				) {
				}
				return false;
			}
		}
		async sendUserIdToServiceWorker() {
			try {
				if (this.isEnabled === false || (window.lmsPush && window.lmsPush.isEnabled === false)) {
					return false;
				}
				if (!this.serviceWorkerRegistration) {
					await this.registerServiceWorker();
					if (!this.serviceWorkerRegistration) {
						return false;
					}
				}
				if (!this.serviceWorkerRegistration.active) {
					if (this.serviceWorkerRegistration.installing) {
						await new Promise((resolve) => {
							this.serviceWorkerRegistration.installing.addEventListener('statechange', (event) => {
								if (event.target.state === 'activated') {
									resolve();
								}
							});
							setTimeout(resolve, 5000);
						});
					} else {
						return false;
					}
				}
				let userId = null;
				if (window.lmsChat && typeof window.lmsChat.currentUserId !== 'undefined') {
					userId = parseInt(window.lmsChat.currentUserId, 10);
				} else if (window.lmsPush && typeof window.lmsPush.currentUserId !== 'undefined') {
					userId = parseInt(window.lmsPush.currentUserId, 10);
				}
				if (!userId || isNaN(userId) || userId <= 0) {
					const chatMessagesElement = document.getElementById('chat-messages');
					if (chatMessagesElement && chatMessagesElement.dataset.currentUserId) {
						userId = parseInt(chatMessagesElement.dataset.currentUserId, 10);
					}
					else {
						const userIdElement = document.getElementById('current-user-id');
						if (userIdElement && userIdElement.dataset.userId) {
							userId = parseInt(userIdElement.dataset.userId, 10);
						}
					}
					if (userId && !isNaN(userId) && userId > 0) {
						if (window.lmsPush) {
							window.lmsPush.currentUserId = userId;
						}
						if (window.lmsChat) {
							window.lmsChat.currentUserId = userId;
						}
					}
				}
				if (!userId || isNaN(userId) || userId <= 0) {
					return false;
				}
				const response = await new Promise((resolve, reject) => {
					const timeoutId = setTimeout(() => {
						resolve({ success: true, message: 'Timeout but assumed successful' });
					}, 3000);
					try {
						const messageChannel = new MessageChannel();
						messageChannel.port1.onmessage = (event) => {
							clearTimeout(timeoutId);
							resolve(event.data);
						};
						messageChannel.port1.onmessageerror = (error) => {
							clearTimeout(timeoutId);
							reject(new Error('Message channel error'));
						};
						if (!this.serviceWorkerRegistration.active) {
							throw new Error('Service Worker is not active when attempting to send message');
						}
						this.serviceWorkerRegistration.active.postMessage(
							{
								type: 'SET_USER_ID',
								userId: userId,
								timestamp: Date.now(),
							},
							[messageChannel.port2]
						);
					} catch (error) {
						clearTimeout(timeoutId);
						reject(error);
					}
				}).catch((err) => {
					return { success: true, message: 'No response from SW: ' + err.message };
				});
				this.hasUserIdSent = true;
				return true;
			} catch (error) {
				return false;
			}
		}
		async sendTestNotification(userId = null) {
			try {
				const targetUserId = userId || (this.userId ? this.userId : null);
				if (!targetUserId) {
					return false;
				}
				const timestamp = new Date().getTime();
				if (
					!this.nonce ||
					(this.lastNonceTime && Date.now() - this.lastNonceTime > this.nonceRefreshInterval)
				) {
					await this.refreshNonce();
				}
				if (!this.nonce) {
					return false;
				}
				const testNotificationData = {
					action: 'lms_test_push_notification',
					user_id: targetUserId,
					nonce: this.nonce,
					_: timestamp,
				};
				const fetchOptions = {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						Pragma: 'no-cache',
						Expires: '0',
					},
					body: new URLSearchParams(testNotificationData).toString(),
					credentials: 'same-origin',
				};
				const response = await fetch(this.ajaxUrl, fetchOptions);
				if (!response.ok) {
					throw new Error(
						`テスト通知の送信に失敗しました: ${response.status} ${response.statusText}`
					);
				}
				const responseData = await response.json();
				if (responseData.success) {
					return true;
				} else {
					return false;
				}
			} catch (error) {
				return false;
			}
		}
		getUserId() {
			if (typeof lmsPush !== 'undefined' && lmsPush && lmsPush.userId) {
				return lmsPush.userId;
			}
			if (typeof lmsChat !== 'undefined' && lmsChat && lmsChat.userId) {
				return lmsChat.userId;
			}
			const userIdElement = document.getElementById('lms-user-id');
			if (userIdElement && userIdElement.value) {
				return userIdElement.value;
			}
			const userIdDataElement = document.querySelector('[data-user-id]');
			if (userIdDataElement && userIdDataElement.dataset.userId) {
				return userIdDataElement.dataset.userId;
			}
			if (typeof wpData !== 'undefined' && wpData && wpData.userId) {
				return wpData.userId;
			}
			const userIdCookie = this.getCookie('lms_user_id');
			if (userIdCookie) {
				return userIdCookie;
			}
			return null;
		}
		disablePushNotifications() {
			try {
				this.isSubscribed = false;
				this.isInitialized = false;
				if (this.subscription) {
					this.subscription.unsubscribe().catch(() => {});
					this.subscription = null;
				}
				const notificationButton = document.querySelector('.notification-button');
				if (notificationButton) {
					notificationButton.style.display = 'none';
				}
				const notificationPrompt = document.querySelector('.notification-prompt');
				if (notificationPrompt) {
					notificationPrompt.style.display = 'none';
				}
			} catch (error) {
			}
		}
	}
	function shouldEnablePushNotifications() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			return false;
		}
		if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
			return false;
		}
		if (!document.getElementById('chat-messages')) {
			return false;
		}
		return true;
	}
	let pushNotificationInstance = null;
	let serviceWorkerRegistrationAttempted = false;
	setTimeout(() => {
		if (serviceWorkerRegistrationAttempted) {
			return;
		}
		serviceWorkerRegistrationAttempted = true;
		if ('serviceWorker' in navigator) {
			const tempPushNotification = new PushNotification(window.lmsPush || {});
			tempPushNotification.registerServiceWorker()
				.then(registration => {})
				.catch(error => {});
		}
	}, 100);
	document.addEventListener('DOMContentLoaded', async () => {
		if (pushNotificationInstance) {
			return;
		}
		try {
			if (typeof window.lmsPush === 'undefined') {
				window.lmsPush = {
					ajaxUrl: '/wp-admin/admin-ajax.php',
					nonce: '',
					isEnabled: true,
					vapidPublicKey: '',
					userId: document.getElementById('chat-messages')
						? document.getElementById('chat-messages').dataset.currentUserId
						: null,
				};
				const nonceFields = document.querySelectorAll('input[name="_wpnonce"]');
				if (nonceFields.length > 0) {
					window.lmsPush.nonce = nonceFields[0].value;
				}
			}
			const isPushEnabled = Boolean(window.lmsPush.enabled);
			if (!isPushEnabled) {
				const hideElements = () => {
					const notificationButton = document.querySelector('.notification-button');
					if (notificationButton) notificationButton.style.display = 'none';
					const notificationPrompt = document.querySelector('.notification-prompt');
					if (notificationPrompt) notificationPrompt.style.display = 'none';
				};
				hideElements();
				const pushNotification = new PushNotification(window.lmsPush);
				setTimeout(async () => {
					if (!serviceWorkerRegistrationAttempted) {
						serviceWorkerRegistrationAttempted = true;
						try {
							await pushNotification.registerServiceWorker();
						} catch (error) {}
					}
				}, 500);
				window.pushNotification = {
					isEnabled: false,
					init: () => Promise.resolve(false),
					setupPushSubscription: () => Promise.resolve(false),
					checkExistingSubscription: () => Promise.resolve(false),
					sendUserIdToServiceWorker: () => Promise.resolve(false),
					updateSubscriptionOnServer: () => Promise.resolve(false),
					disablePushNotifications: () => {},
					registerServiceWorker: () => pushNotification.registerServiceWorker()
				};
				return;
			}
			const isEnabled = Boolean(window.lmsPush.isEnabled);
			if (!isEnabled) {
				const hideElements = () => {
					const notificationButton = document.querySelector('.notification-button');
					if (notificationButton) {
						notificationButton.style.display = 'none';
					}
					const notificationPrompt = document.querySelector('.notification-prompt');
					if (notificationPrompt) {
						notificationPrompt.style.display = 'none';
					}
				};
				hideElements();
				if ('serviceWorker' in navigator) {
					navigator.serviceWorker
						.getRegistrations()
						.then((registrations) => {
							for (let registration of registrations) {
								registration.unregister().catch((error) => {});
							}
						})
						.catch((error) => {});
				}
				window.pushNotification = {
					isEnabled: false,
					init: () => Promise.resolve(false),
					setupPushSubscription: () => Promise.resolve(false),
					checkExistingSubscription: () => Promise.resolve(false),
					sendUserIdToServiceWorker: () => Promise.resolve(false),
					updateSubscriptionOnServer: () => Promise.resolve(false),
				};
				return;
			}
			const pushNotification = new PushNotification(window.lmsPush);
			window.pushNotification = pushNotification;
			pushNotificationInstance = pushNotification;
			try {
				await pushNotification.init();
			} catch (error) {}
			const notificationButton = document.querySelector('.notification-button');
			if (notificationButton) {
				const newButton = notificationButton.cloneNode(true);
				notificationButton.parentNode.replaceChild(newButton, notificationButton);
				newButton.addEventListener('click', () => {
					pushNotification.setupPushSubscription().catch((error) => {});
				});
			}
		} catch (error) {}
	});
})(window, document, jQuery);
