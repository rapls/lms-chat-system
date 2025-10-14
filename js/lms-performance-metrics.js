/**
 * LMS パフォーマンス計測モジュール
 * フェーズ0: 既存システムの実測データ収集
 *
 * 収集メトリクス:
 * - QPS (リクエスト/秒)
 * - P95 レイテンシ
 * - キャッシュヒット率
 * - 同時接続ユーザー数推定
 * - タイムアウト発生率
 */

(function() {
    'use strict';

    // 計測データストレージ
    const MetricsStorage = {
        storageKey: 'lms_performance_metrics',
        maxSamples: 1000, // 最大サンプル数

        /**
         * メトリクスデータを取得
         */
        get: function() {
            try {
                const data = localStorage.getItem(this.storageKey);
                return data ? JSON.parse(data) : this.getDefaultStructure();
            } catch (e) {
                return this.getDefaultStructure();
            }
        },

        /**
         * メトリクスデータを保存
         */
        set: function(data) {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(data));
            } catch (e) {
                // LocalStorage容量超過時は古いデータを削除
                this.cleanup();
            }
        },

        /**
         * デフォルト構造取得
         */
        getDefaultStructure: function() {
            return {
                session_start: Date.now(),
                requests: [],
                cache_hits: [],
                errors: [],
                timeouts: [],
                summary: {
                    total_requests: 0,
                    total_cache_hits: 0,
                    total_cache_misses: 0,
                    total_errors: 0,
                    total_timeouts: 0
                }
            };
        },

        /**
         * 古いデータをクリーンアップ
         */
        cleanup: function() {
            const data = this.get();
            // 各配列を最新500件に制限
            if (data.requests.length > 500) {
                data.requests = data.requests.slice(-500);
            }
            if (data.cache_hits.length > 500) {
                data.cache_hits = data.cache_hits.slice(-500);
            }
            if (data.errors.length > 500) {
                data.errors = data.errors.slice(-500);
            }
            if (data.timeouts.length > 500) {
                data.timeouts = data.timeouts.slice(-500);
            }
            this.set(data);
        }
    };

    // パフォーマンスメトリクスコレクター
    window.LMSPerformanceMetrics = {
        version: '1.0.0',
        enabled: true,

        /**
         * ロングポーリングリクエストを記録
         */
        recordRequest: function(params) {
            if (!this.enabled) return;

            const data = MetricsStorage.get();

            const record = {
                timestamp: Date.now(),
                type: params.type || 'unknown', // 'unified' or 'basic'
                duration: params.duration || 0,
                status: params.status || 'success', // 'success', 'timeout', 'error'
                cache_hit: params.cache_hit || false,
                response_size: params.response_size || 0,
                events_count: params.events_count || 0
            };

            data.requests.push(record);
            data.summary.total_requests++;

            // ステータス別集計
            if (record.status === 'timeout') {
                data.timeouts.push({
                    timestamp: record.timestamp,
                    type: record.type
                });
                data.summary.total_timeouts++;
            } else if (record.status === 'error') {
                data.errors.push({
                    timestamp: record.timestamp,
                    type: record.type,
                    duration: record.duration
                });
                data.summary.total_errors++;
            }

            // サンプル数制限
            if (data.requests.length > MetricsStorage.maxSamples) {
                data.requests.shift();
            }

            MetricsStorage.set(data);
        },

        /**
         * キャッシュヒット/ミスを記録
         */
        recordCacheAccess: function(params) {
            if (!this.enabled) return;

            const data = MetricsStorage.get();

            const record = {
                timestamp: Date.now(),
                key: params.key || 'unknown',
                hit: params.hit || false,
                layer: params.layer || 'unknown', // 'memory', 'apcu', 'redis', etc.
                data_size: params.data_size || 0
            };

            data.cache_hits.push(record);

            if (record.hit) {
                data.summary.total_cache_hits++;
            } else {
                data.summary.total_cache_misses++;
            }

            // サンプル数制限
            if (data.cache_hits.length > MetricsStorage.maxSamples) {
                data.cache_hits.shift();
            }

            MetricsStorage.set(data);
        },

        /**
         * メトリクスサマリーを計算
         */
        getSummary: function() {
            const data = MetricsStorage.get();
            const now = Date.now();
            const sessionDuration = (now - data.session_start) / 1000; // 秒

            // 直近1分間のデータでQPS計算
            const oneMinuteAgo = now - 60000;
            const recentRequests = data.requests.filter(r => r.timestamp > oneMinuteAgo);
            const qps = recentRequests.length / 60;

            // レイテンシ計算（成功したリクエストのみ）
            const successRequests = data.requests
                .filter(r => r.status === 'success' && r.duration > 0)
                .map(r => r.duration);

            const latencies = {
                avg: 0,
                p50: 0,
                p95: 0,
                p99: 0
            };

            if (successRequests.length > 0) {
                const sorted = successRequests.sort((a, b) => a - b);
                const sum = sorted.reduce((a, b) => a + b, 0);

                latencies.avg = Math.round(sum / sorted.length);
                latencies.p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
                latencies.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                latencies.p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
            }

            // キャッシュヒット率
            const totalCacheAccess = data.summary.total_cache_hits + data.summary.total_cache_misses;
            const cacheHitRate = totalCacheAccess > 0
                ? ((data.summary.total_cache_hits / totalCacheAccess) * 100).toFixed(2)
                : 0;

            // タイムアウト率
            const timeoutRate = data.summary.total_requests > 0
                ? ((data.summary.total_timeouts / data.summary.total_requests) * 100).toFixed(2)
                : 0;

            // エラー率
            const errorRate = data.summary.total_requests > 0
                ? ((data.summary.total_errors / data.summary.total_requests) * 100).toFixed(2)
                : 0;

            return {
                session_duration_sec: Math.round(sessionDuration),
                total_requests: data.summary.total_requests,
                qps: qps.toFixed(2),
                latency_ms: latencies,
                cache_hit_rate_percent: cacheHitRate,
                timeout_rate_percent: timeoutRate,
                error_rate_percent: errorRate,
                total_timeouts: data.summary.total_timeouts,
                total_errors: data.summary.total_errors,
                recent_requests_1min: recentRequests.length
            };
        },

        /**
         * 詳細レポートを生成
         */
        getDetailedReport: function() {
            const data = MetricsStorage.get();
            const summary = this.getSummary();

            // 時間帯別のQPS分析（10分間隔）
            const timeSlots = {};
            data.requests.forEach(r => {
                const slot = Math.floor(r.timestamp / 600000) * 600000; // 10分単位
                if (!timeSlots[slot]) {
                    timeSlots[slot] = { count: 0, totalDuration: 0, timeouts: 0 };
                }
                timeSlots[slot].count++;
                timeSlots[slot].totalDuration += r.duration;
                if (r.status === 'timeout') {
                    timeSlots[slot].timeouts++;
                }
            });

            // キャッシュレイヤー別ヒット率
            const cacheByLayer = {};
            data.cache_hits.forEach(c => {
                if (!cacheByLayer[c.layer]) {
                    cacheByLayer[c.layer] = { hits: 0, misses: 0 };
                }
                if (c.hit) {
                    cacheByLayer[c.layer].hits++;
                } else {
                    cacheByLayer[c.layer].misses++;
                }
            });

            return {
                summary: summary,
                time_slots: timeSlots,
                cache_by_layer: cacheByLayer,
                raw_data_samples: {
                    requests: data.requests.slice(-10),
                    cache_hits: data.cache_hits.slice(-10),
                    errors: data.errors.slice(-5),
                    timeouts: data.timeouts.slice(-5)
                }
            };
        },

        /**
         * コンソールにレポート出力
         */
        printReport: function() {
            const report = this.getDetailedReport();

            console.group('📊 LMS Performance Metrics Report');
            console.groupEnd();

            return report;
        },

        /**
         * メトリクスをリセット
         */
        reset: function() {
            MetricsStorage.set(MetricsStorage.getDefaultStructure());
        },

        /**
         * CSVエクスポート（分析用）
         */
        exportCSV: function() {
            const data = MetricsStorage.get();

            let csv = 'timestamp,type,duration,status,cache_hit,events_count\n';
            data.requests.forEach(r => {
                csv += `${r.timestamp},${r.type},${r.duration},${r.status},${r.cache_hit},${r.events_count}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lms-metrics-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        },

        /**
         * 計測を有効化/無効化
         */
        setEnabled: function(enabled) {
            this.enabled = enabled;
        }
    };

    // グローバル初期化

    // コンソールから簡単にアクセスできるショートカット
    window.metrics = window.LMSPerformanceMetrics;

})();
