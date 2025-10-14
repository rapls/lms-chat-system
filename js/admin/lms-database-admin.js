/**
 * LMS データベース最適化管理画面スクリプト
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

(function($) {
    'use strict';

    class LMSDatabaseAdmin {
        constructor() {
            this.isOptimizing = false;
            this.statusRefreshInterval = null;
            
            this.init();
        }

        init() {
            this.bindEvents();
            this.loadInitialStatus();
            this.loadMaintenanceSettings();
            
            this.statusRefreshInterval = setInterval(() => {
                if (!this.isOptimizing) {
                    this.refreshStatus();
                }
            }, 30000);
        }

        bindEvents() {
            // 最適化実行ボタン
            $('#optimize-database').on('click', (e) => {
                e.preventDefault();
                this.executeOptimization();
            });

            // 状態更新ボタン
            $('#refresh-status').on('click', (e) => {
                e.preventDefault();
                this.refreshStatus();
            });

            // メンテナンス設定保存
            $('#maintenance-settings').on('submit', (e) => {
                e.preventDefault();
                this.saveMaintenanceSettings();
            });

            // ページ離脱時の確認
            $(window).on('beforeunload', () => {
                if (this.isOptimizing) {
                    return 'データベース最適化が実行中です。ページを離れますか？';
                }
            });
        }

        /**
         * 初期状態読み込み
         */
        loadInitialStatus() {
            this.refreshStatus();
        }

        /**
         * データベース状態更新
         */
        refreshStatus() {
            $('#db-status-loading').show();
            $('#db-status-content').hide();

            $.ajax({
                url: lmsDbAdmin.ajax_url,
                type: 'POST',
                data: {
                    action: 'lms_database_status',
                    nonce: lmsDbAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.renderStatus(response.data);
                    } else {
                        this.showError('状態の取得に失敗しました: ' + response.data.message);
                    }
                },
                error: (xhr, status, error) => {
                    this.showError('通信エラーが発生しました: ' + error);
                },
                complete: () => {
                    $('#db-status-loading').hide();
                    $('#db-status-content').show();
                }
            });
        }

        /**
         * 状態表示レンダリング
         */
        renderStatus(data) {
            // メイン状態カード
            const statusHtml = this.buildStatusCards(data);
            $('#db-status-content').html(statusHtml);

            // テーブル詳細
            const tableHtml = this.buildTableDetails(data.tables);
            $('#table-details').html(tableHtml);

            // パフォーマンス指標
            const performanceHtml = this.buildPerformanceMetrics(data.performance);
            $('#performance-metrics').html(performanceHtml);

            // 推奨事項
            const recommendationsHtml = this.buildRecommendations(data.recommendations);
            $('#recommendations').html(recommendationsHtml);

            // デバッグ情報
            $('#debug-content').text(JSON.stringify(data, null, 2));
        }

        /**
         * 状態カード構築
         */
        buildStatusCards(data) {
            const totalTables = Object.keys(data.tables).length;
            const existingTables = Object.values(data.tables).filter(t => t.exists).length;
            const totalRecommendations = data.recommendations.length;
            const highPriorityRecommendations = data.recommendations.filter(r => r.priority === 'high').length;

            let statusClass = 'status-good';
            let statusMessage = '良好';
            
            if (highPriorityRecommendations > 0) {
                statusClass = 'status-error';
                statusMessage = '要注意';
            } else if (totalRecommendations > 0) {
                statusClass = 'status-warning';
                statusMessage = '改善可能';
            }

            return `
                <div class="metric-grid">
                    <div class="metric-item">
                        <div class="metric-value">${existingTables}/${totalTables}</div>
                        <div class="metric-label">テーブル存在数</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value ${statusClass}">${statusMessage}</div>
                        <div class="metric-label">全体的な状態</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${totalRecommendations}</div>
                        <div class="metric-label">推奨事項</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${data.stats?.tables_optimized || 0}</div>
                        <div class="metric-label">最適化済みテーブル</div>
                    </div>
                </div>
                
                <div class="status-card ${statusClass}">
                    <h3>📊 データベース全体状況</h3>
                    <p>
                        <strong>状態:</strong> ${statusMessage}<br>
                        <strong>最終最適化:</strong> ${data.stats?.last_optimization ? 
                            new Date(data.stats.last_optimization * 1000).toLocaleString('ja-JP') : 
                            '未実行'
                        }<br>
                        <strong>クリーンアップ済みレコード:</strong> ${data.stats?.records_cleaned || 0}件
                    </p>
                </div>
            `;
        }

        /**
         * テーブル詳細構築
         */
        buildTableDetails(tables) {
            let html = '<div class="table-grid">';
            
            Object.entries(tables).forEach(([tableName, info]) => {
                const shortName = tableName.replace(/^.*?_lms_/, 'lms_');
                let statusClass = info.exists ? 'status-good' : 'status-error';
                
                if (info.exists && info.rows > 100000) {
                    statusClass = 'status-warning';
                }

                html += `
                    <div class="status-card ${statusClass}">
                        <h3>🗄️ ${shortName}</h3>
                        ${info.exists ? `
                            <p>
                                <strong>レコード数:</strong> ${info.rows?.toLocaleString() || '0'}<br>
                                <strong>データサイズ:</strong> ${info.data_length || 'N/A'}<br>
                                <strong>インデックスサイズ:</strong> ${info.index_length || 'N/A'}<br>
                                <strong>インデックス数:</strong> ${info.index_count || '0'}<br>
                                <strong>文字コード:</strong> ${info.collation || 'unknown'}
                            </p>
                        ` : `
                            <p style="color: #d63638;">❌ テーブルが存在しません</p>
                        `}
                    </div>
                `;
            });
            
            html += '</div>';
            return html;
        }

        /**
         * パフォーマンス指標構築
         */
        buildPerformanceMetrics(performance) {
            return `
                <div class="metric-grid">
                    <div class="metric-item">
                        <div class="metric-value">${performance.queries_per_second || 'N/A'}</div>
                        <div class="metric-label">QPS</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${performance.threads_connected || 'N/A'}</div>
                        <div class="metric-label">接続数</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${performance.max_connections || 'N/A'}</div>
                        <div class="metric-label">最大接続数</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${this.formatBytes(performance.innodb_buffer_pool_size)}</div>
                        <div class="metric-label">InnoDB バッファプール</div>
                    </div>
                </div>
            `;
        }

        /**
         * 推奨事項構築
         */
        buildRecommendations(recommendations) {
            if (recommendations.length === 0) {
                return '<div class="status-card status-good"><p>✅ 現在、推奨事項はありません。データベースは良好な状態です。</p></div>';
            }

            let html = '';
            recommendations.forEach(rec => {
                const iconMap = {
                    high: '🚨',
                    medium: '⚠️',
                    low: '💡'
                };

                html += `
                    <div class="recommendation-item recommendation-${rec.priority}">
                        <span class="recommendation-icon">${iconMap[rec.priority]}</span>
                        <span>${rec.message}</span>
                    </div>
                `;
            });

            return html;
        }

        /**
         * データベース最適化実行
         */
        executeOptimization() {
            if (this.isOptimizing) {
                return;
            }

            if (!confirm(lmsDbAdmin.messages.confirm_optimize)) {
                return;
            }

            this.isOptimizing = true;
            this.showOptimizationProgress();
            
            // ボタンを無効化
            $('#optimize-database').prop('disabled', true).text('最適化実行中...');

            $.ajax({
                url: lmsDbAdmin.ajax_url,
                type: 'POST',
                data: {
                    action: 'lms_database_optimize',
                    nonce: lmsDbAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.showOptimizationResults(response.data);
                        this.refreshStatus(); // 状態を更新
                        this.showSuccess('データベースの最適化が完了しました');
                    } else {
                        this.showError('最適化に失敗しました: ' + response.data.message);
                    }
                },
                error: (xhr, status, error) => {
                    this.showError('最適化中にエラーが発生しました: ' + error);
                },
                complete: () => {
                    this.isOptimizing = false;
                    this.hideOptimizationProgress();
                    $('#optimize-database').prop('disabled', false).text('🚀 データベースを最適化');
                }
            });
        }

        /**
         * 最適化進捗表示
         */
        showOptimizationProgress() {
            $('#optimization-results').hide();
            $('#optimization-progress').show();
            
            // プログレスバーアニメーション
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 10;
                if (progress > 90) progress = 90;
                
                $('.progress-fill').css('width', progress + '%');
                
                if (!this.isOptimizing) {
                    clearInterval(progressInterval);
                    $('.progress-fill').css('width', '100%');
                }
            }, 200);
        }

        /**
         * 最適化進捗非表示
         */
        hideOptimizationProgress() {
            $('#optimization-progress').hide();
        }

        /**
         * 最適化結果表示
         */
        showOptimizationResults(data) {
            let html = `
                <h3>✅ 最適化完了</h3>
                <p><strong>実行時間:</strong> ${data.execution_time}</p>
                <h4>実行内容:</h4>
                <ul>
            `;

            Object.entries(data.results).forEach(([key, result]) => {
                if (result.status === 'success' && result.actions) {
                    html += `<li><strong>${key}:</strong></li><ul>`;
                    result.actions.forEach(action => {
                        html += `<li>${action}</li>`;
                    });
                    html += '</ul>';
                } else if (result.status === 'skipped') {
                    html += `<li><strong>${key}:</strong> ${result.reason}</li>`;
                }
            });

            html += '</ul>';
            
            if (data.stats) {
                html += `
                    <h4>統計:</h4>
                    <ul>
                        <li>最適化されたテーブル: ${data.stats.tables_optimized}個</li>
                        <li>作成されたインデックス: ${data.stats.indexes_created}個</li>
                        <li>クリーンアップされたレコード: ${data.stats.records_cleaned}件</li>
                    </ul>
                `;
            }

            $('#optimization-results').html(html).show();
        }

        /**
         * メンテナンス設定読み込み
         */
        loadMaintenanceSettings() {
            // 設定値を取得して反映
        }

        /**
         * メンテナンス設定保存
         */
        saveMaintenanceSettings() {
            const settings = {
                auto_optimization: $('#auto-optimization').is(':checked'),
                data_retention_days: $('#data-retention-days').val(),
                optimization_frequency: $('#optimization-frequency').val()
            };

            $.ajax({
                url: lmsDbAdmin.ajax_url,
                type: 'POST',
                data: {
                    action: 'lms_save_maintenance_settings',
                    nonce: lmsDbAdmin.nonce,
                    settings: settings
                },
                success: (response) => {
                    if (response.success) {
                        this.showSuccess('設定を保存しました');
                    } else {
                        this.showError('設定の保存に失敗しました');
                    }
                },
                error: () => {
                    this.showError('通信エラーが発生しました');
                }
            });
        }

        /**
         * バイト数フォーマット
         */
        formatBytes(bytes) {
            if (!bytes || bytes === 'N/A') return 'N/A';
            
            const num = parseInt(bytes);
            if (isNaN(num)) return bytes;
            
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let i = 0;
            let value = num;
            
            while (value >= 1024 && i < units.length - 1) {
                value /= 1024;
                i++;
            }
            
            return Math.round(value * 100) / 100 + ' ' + units[i];
        }

        /**
         * 成功メッセージ表示
         */
        showSuccess(message) {
            this.showNotice(message, 'success');
        }

        /**
         * エラーメッセージ表示
         */
        showError(message) {
            this.showNotice(message, 'error');
        }

        /**
         * 通知表示
         */
        showNotice(message, type = 'info') {
            const notice = $(`
                <div class="notice notice-${type} is-dismissible">
                    <p>${message}</p>
                    <button type="button" class="notice-dismiss">
                        <span class="screen-reader-text">この通知を非表示にする</span>
                    </button>
                </div>
            `);

            $('.wrap h1').after(notice);

            // 自動削除
            setTimeout(() => {
                notice.fadeOut(() => notice.remove());
            }, 5000);

            // 手動削除
            notice.find('.notice-dismiss').on('click', () => {
                notice.fadeOut(() => notice.remove());
            });
        }

        /**
         * 破棄処理
         */
        destroy() {
            if (this.statusRefreshInterval) {
                clearInterval(this.statusRefreshInterval);
            }
        }
    }

    // 初期化
    $(document).ready(() => {
        if (typeof lmsDbAdmin !== 'undefined') {
            window.lmsDatabaseAdmin = new LMSDatabaseAdmin();
        }
    });

    // ページ離脱時のクリーンアップ
    $(window).on('unload', () => {
        if (window.lmsDatabaseAdmin) {
            window.lmsDatabaseAdmin.destroy();
        }
    });

})(jQuery);