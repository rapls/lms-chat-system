/**
 * ロングポーリング移行後のパフォーマンス監視システム
 *
 * 【緊急無効化】パフォーマンス改善のため一時停止
 * サーバー負荷削減のためモニタリング機能を無効化
 *
 * @version 1.0.0
 */

(function($) {
    'use strict';
    // パフォーマンス改善のため監視機能を一時停止
    return;
    'use strict';

    /**
     * パフォーマンス監視システム
     */
    class PerformanceMonitor {
        constructor() {
            this.metrics = {
                requests: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    startTime: Date.now()
                },
                response: {
                    times: [],
                    average: 0,
                    min: Infinity,
                    max: 0
                },
                connections: {
                    active: 0,
                    peak: 0,
                    reconnects: 0
                },
                memory: {
                    initial: 0,
                    current: 0,
                    peak: 0
                },
                goals: {
                    requestReduction: 85, // 85%削減目標
                    responseImprovement: 96, // 96%改善目標
                    baselineRequests: 10, // ショートポーリング時のベースライン（毎分）
                    baselineResponse: 250 // ショートポーリング時のベースライン（ms）
                }
            };

            this.isMonitoring = false;
            this.monitorInterval = null;
            this.init();
        }

        init() {
            $(document).ready(() => {
                this.setupMonitoring();
                this.createDashboard();
                this.startMonitoring();
            });
        }

        /**
         * 監視システムセットアップ
         */
        setupMonitoring() {
            // 初期メモリ使用量記録
            if (window.performance && window.performance.memory) {
                this.metrics.memory.initial = window.performance.memory.usedJSHeapSize;
                this.metrics.memory.current = this.metrics.memory.initial;
            }

            // 統合ロングポーリングシステムとの連携
            if (window.unifiedLongPoll) {
                this.hookIntoLongPoll();
            }

            // グローバル参照設定
            window.performanceMonitor = this;
        }

        /**
         * ロングポーリングシステムへのフック
         */
        hookIntoLongPoll() {
            const originalMakeRequest = window.unifiedLongPoll.makeRequest;
            const self = this;

            window.unifiedLongPoll.makeRequest = function(data) {
                const startTime = Date.now();
                self.metrics.requests.total++;

                return originalMakeRequest.call(this, data)
                    .then(response => {
                        const responseTime = Date.now() - startTime;
                        self.recordSuccessfulRequest(responseTime);
                        return response;
                    })
                    .catch(error => {
                        const responseTime = Date.now() - startTime;
                        self.recordFailedRequest(responseTime);
                        throw error;
                    });
            };
        }

        /**
         * 成功リクエスト記録
         */
        recordSuccessfulRequest(responseTime) {
            this.metrics.requests.successful++;
            this.recordResponseTime(responseTime);
        }

        /**
         * 失敗リクエスト記録
         */
        recordFailedRequest(responseTime) {
            this.metrics.requests.failed++;
            this.recordResponseTime(responseTime);
        }

        /**
         * レスポンス時間記録
         */
        recordResponseTime(time) {
            this.metrics.response.times.push(time);
            
            // 最新100回のレスポンス時間のみ保持
            if (this.metrics.response.times.length > 100) {
                this.metrics.response.times.shift();
            }

            // 統計更新
            this.metrics.response.min = Math.min(this.metrics.response.min, time);
            this.metrics.response.max = Math.max(this.metrics.response.max, time);
            this.metrics.response.average = this.metrics.response.times.reduce((a, b) => a + b, 0) / this.metrics.response.times.length;
        }

        /**
         * ダッシュボード作成
         */
        createDashboard() {
            const dashboardHTML = `
                <div id="performance-dashboard" style="
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 350px;
                    background: rgba(0,0,0,0.9);
                    color: white;
                    border-radius: 10px;
                    padding: 15px;
                    z-index: 15000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
                    font-size: 12px;
                    display: none;
                    backdrop-filter: blur(10px);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="margin: 0; color: #00ff00;">📊 パフォーマンス監視</h4>
                        <div>
                            <button onclick="window.performanceMonitor.toggleMonitoring()" id="monitor-toggle" style="
                                background: #28a745;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                                margin-right: 5px;
                            ">一時停止</button>
                            <button onclick="document.getElementById('performance-dashboard').style.display='none'" style="
                                background: #dc3545;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">✕</button>
                        </div>
                    </div>
                    
                    <div id="metrics-display" style="line-height: 1.4;">
                        <!-- メトリクスがここに表示されます -->
                    </div>
                    
                    <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #333;">
                        <small style="color: #888;">Ctrl+Shift+P で表示切替</small>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', dashboardHTML);

            // キーボードショートカット設定（より確実な方法）
            const self = this;
            
            // より確実なキーボードハンドリング（最高優先度で確実に実行）
            const keyHandler = function(e) {
                const keyCode = e.which || e.keyCode || e.code;
                if (e.ctrlKey && e.shiftKey && keyCode === 80) { // Ctrl+Shift+P
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    // Debug output removed');
                    try {
                        self.toggleDashboard();
                        // Debug output removed
                    } catch (error) {
                        // Debug output removed
                    }
                    return false;
                }
            };

            // 自身のハンドラーのみクリアしてから登録
            $(document).off('keydown.performanceMonitor');
            
            // 最高優先度で複数の方法で登録
            $(document).on('keydown.performanceMonitor', keyHandler);
            document.addEventListener('keydown', keyHandler, true);
            window.addEventListener('keydown', keyHandler, true);
            
            // グローバル関数も作成
            window.showPerformanceDashboard = () => this.showDashboard();
            window.hidePerformanceDashboard = () => this.hideDashboard();
            window.togglePerformanceDashboard = () => this.toggleDashboard();
            
            // 初期化確認ログ
            setTimeout(() => {
                // Debug output removed 登録完了');
                
                // デバッグ用の手動実行関数
                window.debugPerformanceMonitor = () => {
                    // Debug output removed
                    self.showDashboard();
                };
            }, 500);
        }

        /**
         * 監視開始
         */
        startMonitoring() {
            if (this.isMonitoring) return;

            this.isMonitoring = true;
            this.monitorInterval = setInterval(() => {
                this.updateMetrics();
                this.updateDashboard();
            }, 2000); // 2秒間隔で更新

            // 5秒後にダッシュボード自動表示
            setTimeout(() => {
                this.showDashboard();
            }, 5000);
        }

        /**
         * 監視停止
         */
        stopMonitoring() {
            this.isMonitoring = false;
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
                this.monitorInterval = null;
            }
        }

        /**
         * 監視切り替え
         */
        toggleMonitoring() {
            if (this.isMonitoring) {
                this.stopMonitoring();
                document.getElementById('monitor-toggle').textContent = '再開';
                document.getElementById('monitor-toggle').style.background = '#ffc107';
            } else {
                this.startMonitoring();
                document.getElementById('monitor-toggle').textContent = '一時停止';
                document.getElementById('monitor-toggle').style.background = '#28a745';
            }
        }

        /**
         * メトリクス更新
         */
        updateMetrics() {
            // メモリ使用量更新
            if (window.performance && window.performance.memory) {
                this.metrics.memory.current = window.performance.memory.usedJSHeapSize;
                this.metrics.memory.peak = Math.max(this.metrics.memory.peak, this.metrics.memory.current);
            }

            // 接続数更新
            if (window.unifiedLongPoll) {
                this.metrics.connections.active = window.unifiedLongPoll.activeConnections || 0;
                this.metrics.connections.peak = Math.max(this.metrics.connections.peak, this.metrics.connections.active);
                this.metrics.connections.reconnects = window.unifiedLongPoll.state?.reconnectAttempts || 0;
            }
        }

        /**
         * ダッシュボード更新
         */
        updateDashboard() {
            const metricsDisplay = document.getElementById('metrics-display');
            if (!metricsDisplay) return;

            const runtime = Math.round((Date.now() - this.metrics.requests.startTime) / 1000);
            const requestsPerMinute = Math.round((this.metrics.requests.total / runtime) * 60);
            
            // 目標達成状況計算
            const requestReductionAchieved = Math.round((1 - requestsPerMinute / this.metrics.goals.baselineRequests) * 100);
            const responseImprovementAchieved = Math.round((1 - this.metrics.response.average / this.metrics.goals.baselineResponse) * 100);
            
            const html = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                    <div style="background: rgba(255,255,255,0.1); padding: 6px; border-radius: 4px;">
                        <div style="color: #00ff00; font-weight: bold;">リクエスト数</div>
                        <div>${this.metrics.requests.total} (${requestsPerMinute}/分)</div>
                        <div style="color: ${requestReductionAchieved >= this.metrics.goals.requestReduction ? '#00ff00' : '#ffaa00'};">
                            削減率: ${requestReductionAchieved >= 0 ? requestReductionAchieved : 0}%
                        </div>
                        <div style="font-size: 9px; color: #888;">目標: ${this.metrics.goals.requestReduction}%削減</div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.1); padding: 6px; border-radius: 4px;">
                        <div style="color: #00aaff; font-weight: bold;">レスポンス時間</div>
                        <div>${Math.round(this.metrics.response.average)}ms (平均)</div>
                        <div style="color: ${responseImprovementAchieved >= this.metrics.goals.responseImprovement ? '#00ff00' : '#ffaa00'};">
                            改善率: ${responseImprovementAchieved >= 0 ? responseImprovementAchieved : 0}%
                        </div>
                        <div style="font-size: 9px; color: #888;">目標: ${this.metrics.goals.responseImprovement}%改善</div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.1); padding: 6px; border-radius: 4px;">
                        <div style="color: #ffaa00; font-weight: bold;">成功率</div>
                        <div>${this.metrics.requests.total > 0 ? Math.round((this.metrics.requests.successful / this.metrics.requests.total) * 100) : 0}%</div>
                        <div>${this.metrics.requests.successful}/${this.metrics.requests.total}</div>
                        <div style="font-size: 9px; color: #888;">失敗: ${this.metrics.requests.failed}</div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.1); padding: 6px; border-radius: 4px;">
                        <div style="color: #ff6600; font-weight: bold;">メモリ使用量</div>
                        <div>${Math.round(this.metrics.memory.current / 1024 / 1024)}MB</div>
                        <div>最大: ${Math.round(this.metrics.memory.peak / 1024 / 1024)}MB</div>
                        <div style="font-size: 9px; color: #888;">接続: ${this.metrics.connections.active}</div>
                    </div>
                </div>
                
                <div style="margin-top: 8px; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                    <div style="font-size: 10px;">
                        <span style="color: #888;">稼働時間:</span> ${Math.floor(runtime / 60)}分${runtime % 60}秒
                        <span style="margin-left: 10px; color: #888;">レスポンス範囲:</span> 
                        ${Math.round(this.metrics.response.min)}ms - ${Math.round(this.metrics.response.max)}ms
                    </div>
                </div>
                
                ${this.generateStatusIndicator(requestReductionAchieved, responseImprovementAchieved)}
            `;

            metricsDisplay.innerHTML = html;
        }

        /**
         * ステータスインジケーター生成
         */
        generateStatusIndicator(requestReduction, responseImprovement) {
            const overallScore = (requestReduction + responseImprovement) / 2;
            let status, color, message;

            if (overallScore >= 90) {
                status = '🎉 優秀';
                color = '#00ff00';
                message = '目標を大幅に達成しています！';
            } else if (overallScore >= 70) {
                status = '✅ 良好';
                color = '#00aaff';
                message = '目標に向けて順調です';
            } else if (overallScore >= 50) {
                status = '⚠️ 改善中';
                color = '#ffaa00';
                message = '更なる最適化が必要です';
            } else {
                status = '🔧 要改善';
                color = '#ff4444';
                message = 'パフォーマンス改善が急務です';
            }

            return `
                <div style="margin-top: 8px; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; text-align: center;">
                    <div style="color: ${color}; font-weight: bold; font-size: 11px;">${status}</div>
                    <div style="font-size: 9px; color: #ccc;">${message}</div>
                    <div style="margin-top: 4px; background: rgba(255,255,255,0.1); border-radius: 10px; height: 4px; overflow: hidden;">
                        <div style="
                            width: ${Math.min(overallScore, 100)}%;
                            height: 100%;
                            background: linear-gradient(90deg, ${color}, rgba(255,255,255,0.3));
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                </div>
            `;
        }

        /**
         * ダッシュボード表示
         */
        showDashboard() {
            const dashboard = document.getElementById('performance-dashboard');
            if (dashboard) {
                dashboard.style.display = 'block';
            }
        }

        /**
         * ダッシュボード非表示
         */
        hideDashboard() {
            const dashboard = document.getElementById('performance-dashboard');
            if (dashboard) {
                dashboard.style.display = 'none';
            }
        }

        /**
         * ダッシュボード表示切替
         */
        toggleDashboard() {
            const dashboard = document.getElementById('performance-dashboard');
            if (dashboard) {
                dashboard.style.display = dashboard.style.display === 'none' ? 'block' : 'none';
            }
        }

        /**
         * パフォーマンスレポート生成
         */
        generateReport() {
            const runtime = Math.round((Date.now() - this.metrics.requests.startTime) / 1000);
            const requestsPerMinute = Math.round((this.metrics.requests.total / runtime) * 60);
            const requestReductionAchieved = Math.round((1 - requestsPerMinute / this.metrics.goals.baselineRequests) * 100);
            const responseImprovementAchieved = Math.round((1 - this.metrics.response.average / this.metrics.goals.baselineResponse) * 100);

            return {
                summary: {
                    runtime: runtime,
                    totalRequests: this.metrics.requests.total,
                    requestsPerMinute: requestsPerMinute,
                    averageResponseTime: Math.round(this.metrics.response.average),
                    successRate: Math.round((this.metrics.requests.successful / this.metrics.requests.total) * 100),
                    requestReductionAchieved: Math.max(0, requestReductionAchieved),
                    responseImprovementAchieved: Math.max(0, responseImprovementAchieved)
                },
                goals: this.metrics.goals,
                details: {
                    responseTime: {
                        min: Math.round(this.metrics.response.min),
                        max: Math.round(this.metrics.response.max),
                        average: Math.round(this.metrics.response.average)
                    },
                    memory: {
                        current: Math.round(this.metrics.memory.current / 1024 / 1024),
                        peak: Math.round(this.metrics.memory.peak / 1024 / 1024),
                        initial: Math.round(this.metrics.memory.initial / 1024 / 1024)
                    },
                    connections: {
                        active: this.metrics.connections.active,
                        peak: this.metrics.connections.peak,
                        reconnects: this.metrics.connections.reconnects
                    }
                }
            };
        }

        /**
         * CSVエクスポート
         */
        exportCSV() {
            const report = this.generateReport();
            const csvData = [
                ['メトリクス', '値', '単位', '目標', '達成状況'],
                ['リクエスト数/分', report.summary.requestsPerMinute, 'req/min', '≤2', requestsPerMinute <= 2 ? '達成' : '未達成'],
                ['平均レスポンス時間', report.summary.averageResponseTime, 'ms', '≤10', report.summary.averageResponseTime <= 10 ? '達成' : '未達成'],
                ['成功率', report.summary.successRate, '%', '≥95', report.summary.successRate >= 95 ? '達成' : '未達成'],
                ['リクエスト削減率', report.summary.requestReductionAchieved, '%', '85', report.summary.requestReductionAchieved >= 85 ? '達成' : '未達成'],
                ['レスポンス改善率', report.summary.responseImprovementAchieved, '%', '96', report.summary.responseImprovementAchieved >= 96 ? '達成' : '未達成'],
                ['メモリ使用量', report.details.memory.current, 'MB', '<100', report.details.memory.current < 100 ? '達成' : '未達成'],
                ['アクティブ接続数', report.details.connections.active, '個', '≤3', report.details.connections.active <= 3 ? '達成' : '未達成']
            ];

            const csvContent = csvData.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `performance-report-${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    /**
     * システム初期化
     */
    $(document).ready(function() {
        // 重複防止
        if (window.performanceMonitor) {
            return;
        }

        // パフォーマンス監視システム起動
        new PerformanceMonitor();

        // 開始通知
        setTimeout(() => {
            if (window.performanceMonitor) {
                // Debug output removed
                // Debug output removed
            }
        }, 3000);
    });

})(jQuery);