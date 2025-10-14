<?php
/**
 * LMS データベース最適化管理ページ
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Database_Admin {
    
    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
    }

    /**
     * 管理メニュー追加
     */
    public function add_admin_menu() {
        add_submenu_page(
            'lms-chat-admin',
            'データベース最適化',
            'データベース最適化',
            'manage_options',
            'lms-database-optimizer',
            array($this, 'render_admin_page')
        );
    }

    /**
     * 管理画面スクリプト読み込み
     */
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'chat管理_page_lms-database-optimizer') {
            return;
        }

        wp_enqueue_script(
            'lms-database-admin',
            get_template_directory_uri() . '/js/admin/lms-database-admin.js',
            array('jquery'),
            '1.0.0',
            true
        );

        wp_localize_script('lms-database-admin', 'lmsDbAdmin', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('lms_database_admin'),
            'messages' => array(
                'confirm_optimize' => '本当にデータベースを最適化しますか？',
                'optimizing' => '最適化中...',
                'optimization_complete' => '最適化が完了しました',
                'optimization_failed' => '最適化に失敗しました'
            )
        ));

        wp_enqueue_style(
            'lms-database-admin',
            get_template_directory_uri() . '/css/admin/lms-database-admin.css',
            array(),
            '1.0.0'
        );
    }

    /**
     * 管理ページレンダリング
     */
    public function render_admin_page() {
        ?>
        <div class="wrap">
            <h1>🗄️ LMS データベース最適化</h1>
            <p>ロングポーリングシステムのパフォーマンス向上のためのデータベース最適化ツールです。</p>

            <!-- 状態表示エリア -->
            <div id="db-status-container">
                <h2>📊 現在の状態</h2>
                <div id="db-status-loading">
                    <p>データベース状態を確認中...</p>
                    <div class="spinner is-active"></div>
                </div>
                <div id="db-status-content" style="display: none;">
                    <!-- Ajax で動的に更新 -->
                </div>
            </div>

            <!-- 最適化実行エリア -->
            <div class="postbox">
                <h2 class="hndle">⚡ データベース最適化実行</h2>
                <div class="inside">
                    <p>以下の最適化を実行します：</p>
                    <ul>
                        <li>✅ ロングポーリングイベントテーブルの最適化</li>
                        <li>✅ チャットメッセージテーブルのインデックス強化</li>
                        <li>✅ リアクションテーブルの最適化</li>
                        <li>✅ 古いデータのクリーンアップ</li>
                        <li>✅ インデックス統計の更新</li>
                    </ul>
                    
                    <div class="optimization-controls">
                        <button id="optimize-database" class="button button-primary button-large">
                            🚀 データベースを最適化
                        </button>
                        <button id="refresh-status" class="button">
                            🔄 状態を更新
                        </button>
                    </div>

                    <div id="optimization-progress" style="display: none;">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                        <p id="optimization-status">最適化中...</p>
                    </div>

                    <div id="optimization-results" style="display: none;">
                        <!-- 最適化結果がここに表示される -->
                    </div>
                </div>
            </div>

            <!-- テーブル詳細情報 -->
            <div class="postbox">
                <h2 class="hndle">📋 テーブル詳細情報</h2>
                <div class="inside">
                    <div id="table-details">
                        <!-- Ajax で動的に更新 -->
                    </div>
                </div>
            </div>

            <!-- パフォーマンス指標 -->
            <div class="postbox">
                <h2 class="hndle">📈 パフォーマンス指標</h2>
                <div class="inside">
                    <div id="performance-metrics">
                        <!-- Ajax で動的に更新 -->
                    </div>
                </div>
            </div>

            <!-- 推奨事項 -->
            <div class="postbox">
                <h2 class="hndle">💡 推奨事項</h2>
                <div class="inside">
                    <div id="recommendations">
                        <!-- Ajax で動的に更新 -->
                    </div>
                </div>
            </div>

            <!-- 自動メンテナンス設定 -->
            <div class="postbox">
                <h2 class="hndle">⚙️ 自動メンテナンス設定</h2>
                <div class="inside">
                    <form id="maintenance-settings">
                        <table class="form-table">
                            <tr>
                                <th scope="row">自動最適化</th>
                                <td>
                                    <label>
                                        <input type="checkbox" id="auto-optimization" value="1">
                                        毎日深夜に自動最適化を実行
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">データ保持期間</th>
                                <td>
                                    <select id="data-retention-days">
                                        <option value="7">7日</option>
                                        <option value="30" selected>30日</option>
                                        <option value="90">90日</option>
                                        <option value="365">1年</option>
                                    </select>
                                    <p class="description">この期間を過ぎたイベントデータは自動削除されます</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">最適化頻度</th>
                                <td>
                                    <select id="optimization-frequency">
                                        <option value="hourly">1時間ごと</option>
                                        <option value="daily" selected>毎日</option>
                                        <option value="weekly">毎週</option>
                                    </select>
                                </td>
                            </tr>
                        </table>
                        <p class="submit">
                            <button type="submit" class="button button-primary">設定を保存</button>
                        </p>
                    </form>
                </div>
            </div>

            <!-- デバッグ情報 -->
            <div class="postbox">
                <h2 class="hndle">🔧 デバッグ情報</h2>
                <div class="inside">
                    <details>
                        <summary>詳細なデバッグ情報を表示</summary>
                        <div id="debug-info">
                            <pre id="debug-content"><!-- デバッグ情報がここに表示される --></pre>
                        </div>
                    </details>
                </div>
            </div>
        </div>

        <style>
        .optimization-controls {
            margin: 20px 0;
        }

        .optimization-controls .button {
            margin-right: 10px;
        }

        .progress-bar {
            width: 100%;
            height: 20px;
            background-color: #f0f0f0;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #0073aa, #00a0d2);
            width: 0%;
            transition: width 0.3s ease;
        }

        #optimization-results {
            margin-top: 20px;
            padding: 15px;
            background: #f9f9f9;
            border-left: 4px solid #0073aa;
        }

        .status-card {
            background: white;
            border: 1px solid #c3c4c7;
            border-radius: 4px;
            padding: 15px;
            margin: 10px 0;
        }

        .status-card h3 {
            margin-top: 0;
            font-size: 14px;
        }

        .status-good { border-left: 4px solid #00a32a; }
        .status-warning { border-left: 4px solid #dba617; }
        .status-error { border-left: 4px solid #d63638; }

        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }

        .metric-item {
            text-align: center;
            padding: 15px;
            background: white;
            border: 1px solid #c3c4c7;
            border-radius: 4px;
        }

        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #0073aa;
        }

        .metric-label {
            font-size: 12px;
            color: #646970;
            margin-top: 5px;
        }

        .recommendation-item {
            display: flex;
            align-items: center;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
        }

        .recommendation-high { background: #fef7f0; border-left: 4px solid #d63638; }
        .recommendation-medium { background: #fcf9e8; border-left: 4px solid #dba617; }
        .recommendation-low { background: #f0f6fc; border-left: 4px solid #0073aa; }

        .recommendation-icon {
            margin-right: 10px;
            font-size: 18px;
        }

        #debug-content {
            background: #1e1e1e;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 400px;
            overflow-y: auto;
        }
        </style>
        <?php
    }
}

// 管理ページ初期化
new LMS_Database_Admin();