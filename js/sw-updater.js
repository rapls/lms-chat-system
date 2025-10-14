/**
 * サービスワーカーを強制的に更新するスクリプト
 * サービスワーカーの動作に問題があるときに実行してください
 */
(function () {
	'use strict';
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker
			.getRegistrations()
			.then(function (registrations) {
				const unregisterPromises = registrations.map(function (registration) {
					return registration.unregister().then(function (success) {
						if (success) {
						} else {
						}
						return success;
					});
				});
				return Promise.all(unregisterPromises).then(function (results) {
					const allSuccess = results.every(function (success) {
						return success;
					});
					if (allSuccess) {
						try {
							localStorage.removeItem('sw_last_update');
							localStorage.removeItem('sw_version');
						} catch (e) {}
						setTimeout(function () {
							window.location.reload(true);
						}, 1000);
					}
				});
			})
			.catch(function (error) {
			});
	} else {
	}
})();
