/**
 * LMS統合キャッシュシステム
 * メモリキャッシュ、LocalStorage、SessionStorageを統合管理
 * キャッシュヒット率の監視機能付き
 */

(function($) {
	'use strict';

	class LMSUnifiedCacheSystem {
		constructor() {
			this.memoryCache = new Map();
			this.stats = {
				hits: 0,
				misses: 0,
				sets: 0,
				deletes: 0,
				evictions: 0
			};
			this.maxMemoryEntries = 1000;
			this.defaultTTL = 300000; // 5分
			this.storagePrefix = 'lms_cache_';
			
			this.init();
		}

		init() {
			// 定期的なクリーンアップ
			setInterval(() => {
				this.cleanup();
			}, 60000); // 1分間隔

			// ページ離脱時のクリーンアップ
			$(window).on('beforeunload', () => {
				this.persistImportantData();
			});

			this.logEvent('CACHE', 'Unified cache system initialized', 'success');
		}

		/**
		 * キャッシュからデータを取得
		 * @param {string} key キー
		 * @param {string} storage ストレージタイプ ('memory', 'local', 'session')
		 * @returns {*} データまたはnull
		 */
		get(key, storage = 'memory') {
			const fullKey = this.getFullKey(key);
			let data = null;

			try {
				switch (storage) {
					case 'memory':
						data = this.getFromMemory(fullKey);
						break;
					case 'local':
						data = this.getFromLocalStorage(fullKey);
						break;
					case 'session':
						data = this.getFromSessionStorage(fullKey);
						break;
					default:
						// 全ストレージから検索
						data = this.getFromMemory(fullKey) || 
							   this.getFromLocalStorage(fullKey) || 
							   this.getFromSessionStorage(fullKey);
				}

				if (data !== null) {
					this.stats.hits++;
				} else {
					this.stats.misses++;
				}

				return data;
			} catch (error) {
				this.logEvent('CACHE', `Error getting key ${key}: ${error.message}`, 'error');
				this.stats.misses++;
				return null;
			}
		}

		/**
		 * キャッシュにデータを設定
		 * @param {string} key キー
		 * @param {*} value 値
		 * @param {number} ttl TTL（ミリ秒）
		 * @param {string} storage ストレージタイプ
		 */
		set(key, value, ttl = this.defaultTTL, storage = 'memory') {
			const fullKey = this.getFullKey(key);
			const expiryTime = Date.now() + ttl;

			try {
				const cacheItem = {
					value: value,
					expiry: expiryTime,
					created: Date.now(),
					accessed: Date.now(),
					accessCount: 0
				};

				switch (storage) {
					case 'memory':
						this.setToMemory(fullKey, cacheItem);
						break;
					case 'local':
						this.setToLocalStorage(fullKey, cacheItem);
						break;
					case 'session':
						this.setToSessionStorage(fullKey, cacheItem);
						break;
					default:
						this.setToMemory(fullKey, cacheItem);
				}

				this.stats.sets++;
			} catch (error) {
				this.logEvent('CACHE', `Error setting key ${key}: ${error.message}`, 'error');
			}
		}

		/**
		 * キャッシュからデータを削除
		 */
		delete(key, storage = 'all') {
			const fullKey = this.getFullKey(key);

			try {
				if (storage === 'all' || storage === 'memory') {
					this.memoryCache.delete(fullKey);
				}
				if (storage === 'all' || storage === 'local') {
					localStorage.removeItem(fullKey);
				}
				if (storage === 'all' || storage === 'session') {
					sessionStorage.removeItem(fullKey);
				}

				this.stats.deletes++;
			} catch (error) {
				this.logEvent('CACHE', `Error deleting key ${key}: ${error.message}`, 'error');
			}
		}

		/**
		 * メモリキャッシュから取得
		 */
		getFromMemory(key) {
			const item = this.memoryCache.get(key);
			if (!item) return null;

			if (Date.now() > item.expiry) {
				this.memoryCache.delete(key);
				this.stats.evictions++;
				return null;
			}

			item.accessed = Date.now();
			item.accessCount++;
			return item.value;
		}

		/**
		 * メモリキャッシュに設定
		 */
		setToMemory(key, item) {
			// メモリキャッシュのサイズ制限
			if (this.memoryCache.size >= this.maxMemoryEntries) {
				this.evictLRU();
			}

			this.memoryCache.set(key, item);
		}

		/**
		 * LocalStorageから取得
		 */
		getFromLocalStorage(key) {
			try {
				const stored = localStorage.getItem(key);
				if (!stored) return null;

				const item = JSON.parse(stored);
				if (Date.now() > item.expiry) {
					localStorage.removeItem(key);
					this.stats.evictions++;
					return null;
				}

				return item.value;
			} catch (error) {
				localStorage.removeItem(key);
				return null;
			}
		}

		/**
		 * LocalStorageに設定
		 */
		setToLocalStorage(key, item) {
			try {
				localStorage.setItem(key, JSON.stringify(item));
			} catch (error) {
				// ストレージ容量不足の場合、古いアイテムを削除
				this.cleanupLocalStorage();
				try {
					localStorage.setItem(key, JSON.stringify(item));
				} catch (retryError) {
					this.logEvent('CACHE', 'LocalStorage is full and cleanup failed', 'error');
				}
			}
		}

		/**
		 * SessionStorageから取得
		 */
		getFromSessionStorage(key) {
			try {
				const stored = sessionStorage.getItem(key);
				if (!stored) return null;

				const item = JSON.parse(stored);
				if (Date.now() > item.expiry) {
					sessionStorage.removeItem(key);
					this.stats.evictions++;
					return null;
				}

				return item.value;
			} catch (error) {
				sessionStorage.removeItem(key);
				return null;
			}
		}

		/**
		 * SessionStorageに設定
		 */
		setToSessionStorage(key, item) {
			try {
				sessionStorage.setItem(key, JSON.stringify(item));
			} catch (error) {
				this.cleanupSessionStorage();
				try {
					sessionStorage.setItem(key, JSON.stringify(item));
				} catch (retryError) {
					this.logEvent('CACHE', 'SessionStorage is full and cleanup failed', 'error');
				}
			}
		}

		/**
		 * LRU（Least Recently Used）によるメモリキャッシュの削除
		 */
		evictLRU() {
			let oldestKey = null;
			let oldestTime = Date.now();

			for (const [key, item] of this.memoryCache) {
				if (item.accessed < oldestTime) {
					oldestTime = item.accessed;
					oldestKey = key;
				}
			}

			if (oldestKey) {
				this.memoryCache.delete(oldestKey);
				this.stats.evictions++;
			}
		}

		/**
		 * 期限切れアイテムのクリーンアップ
		 */
		cleanup() {
			const now = Date.now();
			let cleanedCount = 0;

			// メモリキャッシュのクリーンアップ
			for (const [key, item] of this.memoryCache) {
				if (now > item.expiry) {
					this.memoryCache.delete(key);
					cleanedCount++;
				}
			}

			if (cleanedCount > 0) {
				this.stats.evictions += cleanedCount;
				this.logEvent('CACHE', `Cleaned up ${cleanedCount} expired memory cache items`, 'info');
			}
		}

		/**
		 * LocalStorageのクリーンアップ
		 */
		cleanupLocalStorage() {
			try {
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key && key.startsWith(this.storagePrefix)) {
						const stored = localStorage.getItem(key);
						try {
							const item = JSON.parse(stored);
							if (Date.now() > item.expiry) {
								localStorage.removeItem(key);
								i--; // インデックス調整
							}
						} catch (error) {
							localStorage.removeItem(key);
							i--; // インデックス調整
						}
					}
				}
			} catch (error) {
				this.logEvent('CACHE', 'Error during localStorage cleanup', 'error');
			}
		}

		/**
		 * SessionStorageのクリーンアップ
		 */
		cleanupSessionStorage() {
			try {
				for (let i = 0; i < sessionStorage.length; i++) {
					const key = sessionStorage.key(i);
					if (key && key.startsWith(this.storagePrefix)) {
						const stored = sessionStorage.getItem(key);
						try {
							const item = JSON.parse(stored);
							if (Date.now() > item.expiry) {
								sessionStorage.removeItem(key);
								i--; // インデックス調整
							}
						} catch (error) {
							sessionStorage.removeItem(key);
							i--; // インデックス調整
						}
					}
				}
			} catch (error) {
				this.logEvent('CACHE', 'Error during sessionStorage cleanup', 'error');
			}
		}

		/**
		 * 重要なデータの永続化
		 */
		persistImportantData() {
			// 統計情報を保存
			try {
				localStorage.setItem(this.storagePrefix + 'stats', JSON.stringify(this.stats));
			} catch (error) {
				// 無視
			}
		}

		/**
		 * キャッシュ統計の取得
		 */
		getStats() {
			const total = this.stats.hits + this.stats.misses;
			const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : '0.00';
			
			return {
				...this.stats,
				hitRate: hitRate,
				memorySize: this.memoryCache.size,
				localStorageKeys: this.getStorageKeyCount('local'),
				sessionStorageKeys: this.getStorageKeyCount('session')
			};
		}

		/**
		 * ストレージのキー数を取得
		 */
		getStorageKeyCount(type) {
			let count = 0;
			try {
				const storage = type === 'local' ? localStorage : sessionStorage;
				for (let i = 0; i < storage.length; i++) {
					const key = storage.key(i);
					if (key && key.startsWith(this.storagePrefix)) {
						count++;
					}
				}
			} catch (error) {
				// 無視
			}
			return count;
		}

		/**
		 * フルキーの生成
		 */
		getFullKey(key) {
			return this.storagePrefix + key;
		}

		/**
		 * ログイベント（デバッグモニター用）
		 */
		logEvent(category, message, level = 'info') {
			if (window.longPollDebugMonitor) {
				window.longPollDebugMonitor.logEvent(category, message, level);
			}
		}

		/**
		 * キャッシュの完全クリア
		 */
		clear(storage = 'all') {
			if (storage === 'all' || storage === 'memory') {
				this.memoryCache.clear();
			}

			if (storage === 'all' || storage === 'local') {
				this.clearStorage(localStorage);
			}

			if (storage === 'all' || storage === 'session') {
				this.clearStorage(sessionStorage);
			}

			this.logEvent('CACHE', `Cache cleared: ${storage}`, 'info');
		}

		/**
		 * ストレージクリア
		 */
		clearStorage(storage) {
			try {
				const keysToRemove = [];
				for (let i = 0; i < storage.length; i++) {
					const key = storage.key(i);
					if (key && key.startsWith(this.storagePrefix)) {
						keysToRemove.push(key);
					}
				}
				keysToRemove.forEach(key => storage.removeItem(key));
			} catch (error) {
				this.logEvent('CACHE', 'Error clearing storage', 'error');
			}
		}
	}

	// グローバルインスタンス
	window.LMSCache = new LMSUnifiedCacheSystem();

	// 初期化完了ログ
	$(document).ready(function() {
	});

})(jQuery);