<?php

/**
 * ロングポーリングシステム移行制御
 *
 * 段階的移行、A/Bテスト、ロールバック機能を提供
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Migration_Controller
{
    private static $instance = null;
    
    /**
     * 移行ステージ定数
     */
    const STAGE_DISABLED    = 0; // 統合システム無効
    const STAGE_BETA        = 1; // ベータユーザーのみ
    const STAGE_CANARY      = 2; // 5%ロールアウト
    const STAGE_GRADUAL     = 3; // 段階的拡大
    const STAGE_FULL        = 4; // 完全移行
    
    /**
     * 設定キー
     */
    const OPTION_STAGE = 'lms_longpoll_migration_stage';
    const OPTION_ROLLOUT = 'lms_longpoll_rollout_percentage';
    const OPTION_BETA_USERS = 'lms_longpoll_beta_users';
    const OPTION_FEATURE_FLAGS = 'lms_longpoll_feature_flags';
    const OPTION_HEALTH_METRICS = 'lms_longpoll_health_metrics';
    
    /**
     * デフォルト設定
     */
    private $default_config = [
        'stage' => self::STAGE_DISABLED,
        'rollout_percentage' => 0,
        'beta_users' => [],
        'feature_flags' => [
            'enable_reactions' => true,
            'enable_messages' => true,
            'enable_threads' => true,
            'enable_circuit_breaker' => true,
            'enable_fallback' => true
        ],
        'health_thresholds' => [
            'max_error_rate' => 0.05, // 5%
            'max_response_time' => 2000, // 2秒
            'min_success_rate' => 0.95 // 95%
        ]
    ];
    
    /**
     * 現在の設定
     */
    private $config = [];
    
    /**
     * ヘルスメトリクス
     */
    private $health_metrics = [
        'error_rate' => 0,
        'avg_response_time' => 0,
        'success_rate' => 1,
        'active_connections' => 0,
        'total_requests' => 0,
        'last_updated' => 0
    ];

    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        $this->load_config();
        
        add_action('wp_ajax_lms_migration_control', array($this, 'handle_migration_control'));
        add_action('wp_ajax_lms_migration_status', array($this, 'handle_migration_status'));
        add_action('wp_ajax_lms_migration_health', array($this, 'handle_health_check'));
        
        // ヘルスメトリクス収集
        add_action('lms_unified_longpoll_request', array($this, 'track_request'), 10, 3);
        add_action('lms_unified_longpoll_response', array($this, 'track_response'), 10, 4);
        
        // 定期ヘルスチェック
        add_action('lms_migration_health_check', array($this, 'perform_health_check'));
        if (!wp_next_scheduled('lms_migration_health_check')) {
            wp_schedule_event(time(), 'every_minute', 'lms_migration_health_check');
        }
        
        // 管理画面メニュー（優先度を低く設定してCHAT管理メニューの後に実行）
        add_action('admin_menu', array($this, 'add_admin_menu'), 15);
        
        // フロントエンド設定の出力
        add_action('wp_enqueue_scripts', array($this, 'enqueue_migration_config'));
    }

    /**
     * 設定の読み込み
     */
    private function load_config()
    {
        $this->config = array_merge($this->default_config, [
            'stage' => get_option(self::OPTION_STAGE, self::STAGE_DISABLED),
            'rollout_percentage' => get_option(self::OPTION_ROLLOUT, 0),
            'beta_users' => get_option(self::OPTION_BETA_USERS, []),
            'feature_flags' => get_option(self::OPTION_FEATURE_FLAGS, $this->default_config['feature_flags'])
        ]);
        
        $this->health_metrics = get_option(self::OPTION_HEALTH_METRICS, $this->health_metrics);
    }

    /**
     * ユーザーが新システムを使用すべきかチェック
     */
    public function should_use_unified_system($user_id = null)
    {
        if (!$user_id) {
            $user_id = get_current_user_id();
        }
        
        if (!$user_id) {
            return false;
        }
        
        $stage = $this->config['stage'];
        
        switch ($stage) {
            case self::STAGE_DISABLED:
                return false;
                
            case self::STAGE_BETA:
                return $this->is_beta_user($user_id);
                
            case self::STAGE_CANARY:
                return $this->is_beta_user($user_id) || $this->is_in_rollout($user_id, 5);
                
            case self::STAGE_GRADUAL:
                return $this->is_beta_user($user_id) || $this->is_in_rollout($user_id, $this->config['rollout_percentage']);
                
            case self::STAGE_FULL:
                return true;
                
            default:
                return false;
        }
    }

    /**
     * ベータユーザーチェック
     */
    private function is_beta_user($user_id)
    {
        return in_array($user_id, $this->config['beta_users']);
    }

    /**
     * ロールアウト対象チェック
     */
    private function is_in_rollout($user_id, $percentage)
    {
        if ($percentage >= 100) {
            return true;
        }
        
        if ($percentage <= 0) {
            return false;
        }
        
        // 一貫したハッシュベース判定
        $hash = crc32($user_id . 'lms_longpoll_rollout');
        $user_percentage = abs($hash) % 100;
        
        return $user_percentage < $percentage;
    }

    /**
     * フィーチャーフラグチェック
     */
    public function is_feature_enabled($feature)
    {
        return $this->config['feature_flags'][$feature] ?? false;
    }

    /**
     * 移行制御ハンドラー
     */
    public function handle_migration_control()
    {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限が不足しています');
            return;
        }
        
        $action = $_POST['migration_action'] ?? '';
        
        switch ($action) {
            case 'set_stage':
                $this->handle_set_stage();
                break;
                
            case 'set_rollout':
                $this->handle_set_rollout();
                break;
                
            case 'add_beta_user':
                $this->handle_add_beta_user();
                break;
                
            case 'remove_beta_user':
                $this->handle_remove_beta_user();
                break;
                
            case 'toggle_feature':
                $this->handle_toggle_feature();
                break;
                
            case 'emergency_rollback':
                $this->handle_emergency_rollback();
                break;
                
            default:
                wp_send_json_error('無効なアクションです');
        }
    }

    /**
     * ステージ設定
     */
    private function handle_set_stage()
    {
        $stage = intval($_POST['stage'] ?? 0);
        
        if ($stage < self::STAGE_DISABLED || $stage > self::STAGE_FULL) {
            wp_send_json_error('無効なステージです');
            return;
        }
        
        // ヘルスチェック
        if ($stage > self::STAGE_BETA && !$this->is_system_healthy()) {
            wp_send_json_error('システムの健全性に問題があります');
            return;
        }
        
        update_option(self::OPTION_STAGE, $stage);
        $this->config['stage'] = $stage;
        
        wp_send_json_success([
            'message' => 'ステージを更新しました',
            'stage' => $stage,
            'stage_name' => $this->get_stage_name($stage)
        ]);
    }

    /**
     * ロールアウト率設定
     */
    private function handle_set_rollout()
    {
        $percentage = intval($_POST['percentage'] ?? 0);
        
        if ($percentage < 0 || $percentage > 100) {
            wp_send_json_error('無効なパーセンテージです');
            return;
        }
        
        // 段階的増加のみ許可（緊急時除く）
        $current = $this->config['rollout_percentage'];
        $is_emergency = $_POST['emergency'] ?? false;
        
        if (!$is_emergency && $percentage < $current) {
            wp_send_json_error('ロールアウト率の減少は緊急時のみ可能です');
            return;
        }
        
        // ヘルスチェック
        if ($percentage > $current && !$this->is_system_healthy()) {
            wp_send_json_error('システムの健全性に問題があります');
            return;
        }
        
        update_option(self::OPTION_ROLLOUT, $percentage);
        $this->config['rollout_percentage'] = $percentage;
        
        wp_send_json_success([
            'message' => 'ロールアウト率を更新しました',
            'percentage' => $percentage
        ]);
    }

    /**
     * ベータユーザー追加
     */
    private function handle_add_beta_user()
    {
        $user_id = intval($_POST['user_id'] ?? 0);
        
        if (!$user_id || !get_user_by('id', $user_id)) {
            wp_send_json_error('無効なユーザーIDです');
            return;
        }
        
        $beta_users = $this->config['beta_users'];
        if (!in_array($user_id, $beta_users)) {
            $beta_users[] = $user_id;
            update_option(self::OPTION_BETA_USERS, $beta_users);
            $this->config['beta_users'] = $beta_users;
        }
        
        wp_send_json_success([
            'message' => 'ベータユーザーを追加しました',
            'user_id' => $user_id
        ]);
    }

    /**
     * ベータユーザー削除
     */
    private function handle_remove_beta_user()
    {
        $user_id = intval($_POST['user_id'] ?? 0);
        
        $beta_users = $this->config['beta_users'];
        $index = array_search($user_id, $beta_users);
        
        if ($index !== false) {
            array_splice($beta_users, $index, 1);
            update_option(self::OPTION_BETA_USERS, $beta_users);
            $this->config['beta_users'] = $beta_users;
        }
        
        wp_send_json_success([
            'message' => 'ベータユーザーを削除しました',
            'user_id' => $user_id
        ]);
    }

    /**
     * フィーチャーフラグ切り替え
     */
    private function handle_toggle_feature()
    {
        $feature = $_POST['feature'] ?? '';
        $enabled = filter_var($_POST['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        
        if (!array_key_exists($feature, $this->config['feature_flags'])) {
            wp_send_json_error('無効なフィーチャーです');
            return;
        }
        
        $this->config['feature_flags'][$feature] = $enabled;
        update_option(self::OPTION_FEATURE_FLAGS, $this->config['feature_flags']);
        
        wp_send_json_success([
            'message' => 'フィーチャーフラグを更新しました',
            'feature' => $feature,
            'enabled' => $enabled
        ]);
    }

    /**
     * 緊急ロールバック
     */
    private function handle_emergency_rollback()
    {
        $reason = $_POST['reason'] ?? '緊急ロールバック';
        
        // 全て無効化
        update_option(self::OPTION_STAGE, self::STAGE_DISABLED);
        update_option(self::OPTION_ROLLOUT, 0);
        
        $this->config['stage'] = self::STAGE_DISABLED;
        $this->config['rollout_percentage'] = 0;
        
        // ログ記録
        wp_send_json_success([
            'message' => '緊急ロールバックを実行しました',
            'reason' => $reason
        ]);
    }

    /**
     * 移行ステータス取得
     */
    public function handle_migration_status()
    {
        wp_send_json_success([
            'stage' => $this->config['stage'],
            'stage_name' => $this->get_stage_name($this->config['stage']),
            'rollout_percentage' => $this->config['rollout_percentage'],
            'beta_users_count' => count($this->config['beta_users']),
            'feature_flags' => $this->config['feature_flags'],
            'health_metrics' => $this->health_metrics,
            'is_healthy' => $this->is_system_healthy()
        ]);
    }

    /**
     * ヘルスチェック
     */
    public function handle_health_check()
    {
        $detailed = $_GET['detailed'] ?? false;
        
        $health_data = [
            'is_healthy' => $this->is_system_healthy(),
            'metrics' => $this->health_metrics,
            'thresholds' => $this->default_config['health_thresholds']
        ];
        
        if ($detailed) {
            $health_data['detailed_checks'] = $this->perform_detailed_health_check();
        }
        
        wp_send_json_success($health_data);
    }

    /**
     * リクエスト追跡
     */
    public function track_request($user_id, $channel_id, $event_types)
    {
        $this->health_metrics['total_requests']++;
        $this->health_metrics['last_updated'] = time();
    }

    /**
     * レスポンス追跡
     */
    public function track_response($user_id, $success, $response_time, $error = null)
    {
        if ($success) {
            $this->health_metrics['success_rate'] = 
                ($this->health_metrics['success_rate'] * 0.95) + (1 * 0.05);
        } else {
            $this->health_metrics['error_rate'] = 
                ($this->health_metrics['error_rate'] * 0.95) + (1 * 0.05);
        }
        
        // 移動平均でレスポンス時間更新
        $this->health_metrics['avg_response_time'] = 
            ($this->health_metrics['avg_response_time'] * 0.9) + ($response_time * 0.1);
        
        // 定期的に保存
        if ($this->health_metrics['total_requests'] % 10 === 0) {
            update_option(self::OPTION_HEALTH_METRICS, $this->health_metrics);
        }
    }

    /**
     * 定期ヘルスチェック
     */
    public function perform_health_check()
    {
        $was_healthy = $this->is_system_healthy();
        
        // メトリクス更新
        $this->update_health_metrics();
        
        $is_healthy = $this->is_system_healthy();
        
        // 健全性が悪化した場合の自動対応
        if ($was_healthy && !$is_healthy) {
            $this->handle_health_degradation();
        }
        
        // メトリクス保存
        update_option(self::OPTION_HEALTH_METRICS, $this->health_metrics);
    }

    /**
     * ヘルスメトリクス更新
     */
    private function update_health_metrics()
    {
        // アクティブ接続数の取得
        global $wpdb;
        $events_table = $wpdb->prefix . 'lms_chat_realtime_events';
        
        $active_connections = $wpdb->get_var(
            "SELECT COUNT(DISTINCT user_id) FROM $events_table 
            WHERE timestamp > " . (time() - 300) // 5分以内
        );
        
        $this->health_metrics['active_connections'] = $active_connections ?: 0;
    }

    /**
     * システム健全性チェック
     */
    private function is_system_healthy()
    {
        $thresholds = $this->default_config['health_thresholds'];
        
        return $this->health_metrics['error_rate'] <= $thresholds['max_error_rate'] &&
               $this->health_metrics['avg_response_time'] <= $thresholds['max_response_time'] &&
               $this->health_metrics['success_rate'] >= $thresholds['min_success_rate'];
    }

    /**
     * 詳細ヘルスチェック
     */
    private function perform_detailed_health_check()
    {
        global $wpdb;
        
        $checks = [];
        
        // データベース接続チェック
        $checks['database'] = [
            'status' => $wpdb->check_connection() ? 'healthy' : 'unhealthy',
            'response_time' => $this->measure_db_response_time()
        ];
        
        // イベントテーブルチェック
        $events_table = $wpdb->prefix . 'lms_chat_realtime_events';
        $event_count = $wpdb->get_var("SELECT COUNT(*) FROM $events_table WHERE expires_at > " . time());
        $checks['events_table'] = [
            'status' => $event_count !== null ? 'healthy' : 'unhealthy',
            'active_events' => $event_count ?: 0
        ];
        
        // メモリ使用量チェック
        $memory_usage = memory_get_usage(true);
        $memory_limit = $this->parse_memory_limit(ini_get('memory_limit'));
        $checks['memory'] = [
            'status' => ($memory_usage / $memory_limit) < 0.8 ? 'healthy' : 'warning',
            'usage_mb' => round($memory_usage / 1024 / 1024, 2),
            'limit_mb' => round($memory_limit / 1024 / 1024, 2)
        ];
        
        return $checks;
    }

    /**
     * 健全性悪化時の処理
     */
    private function handle_health_degradation()
    {
        $current_stage = $this->config['stage'];
        
        // 段階的な縮小
        if ($current_stage === self::STAGE_FULL) {
            update_option(self::OPTION_ROLLOUT, 50);
            $this->config['rollout_percentage'] = 50;
        } elseif ($current_stage === self::STAGE_GRADUAL && $this->config['rollout_percentage'] > 10) {
            update_option(self::OPTION_ROLLOUT, 10);
            $this->config['rollout_percentage'] = 10;
        } else {
            // ベータユーザーのみに縮小
            update_option(self::OPTION_STAGE, self::STAGE_BETA);
            $this->config['stage'] = self::STAGE_BETA;
        }}

    /**
     * ステージ名取得
     */
    private function get_stage_name($stage)
    {
        $names = [
            self::STAGE_DISABLED => '無効',
            self::STAGE_BETA => 'ベータテスト',
            self::STAGE_CANARY => 'カナリアリリース',
            self::STAGE_GRADUAL => '段階的展開',
            self::STAGE_FULL => '完全移行'
        ];
        
        return $names[$stage] ?? '不明';
    }

    /**
     * データベースレスポンス時間測定
     */
    private function measure_db_response_time()
    {
        global $wpdb;
        
        $start = microtime(true);
        $wpdb->get_var("SELECT 1");
        $end = microtime(true);
        
        return round(($end - $start) * 1000, 2); // ミリ秒
    }

    /**
     * メモリ制限解析
     */
    private function parse_memory_limit($memory_limit)
    {
        $unit = strtolower(substr($memory_limit, -1));
        $value = (int) substr($memory_limit, 0, -1);
        
        switch ($unit) {
            case 'g':
                return $value * 1024 * 1024 * 1024;
            case 'm':
                return $value * 1024 * 1024;
            case 'k':
                return $value * 1024;
            default:
                return (int) $memory_limit;
        }
    }

    /**
     * 管理画面メニュー追加
     */
    public function add_admin_menu()
    {
        add_submenu_page(
            'lms-chat-admin',              // 親メニューのスラッグ（CHAT管理）
            'ロングポーリング移行管理',      // ページタイトル
            'ロングポーリング移行',          // メニュータイトル
            'manage_options',              // 権限
            'lms-longpoll-migration',      // スラッグ
            array($this, 'render_admin_page') // コールバック関数
        );
    }

    /**
     * 管理画面ページレンダリング
     */
    public function render_admin_page()
    {
        $admin_file = get_template_directory() . '/admin/longpoll-migration-admin.php';
        
        if (!file_exists($admin_file)) {
            echo '<div class="wrap">';
            echo '<h1>ロングポーリング移行管理</h1>';
            echo '<div class="error"><p>管理画面ファイルが見つかりません: ' . esc_html($admin_file) . '</p></div>';
            echo '</div>';
            return;
        }
        
        if (!is_readable($admin_file)) {
            echo '<div class="wrap">';
            echo '<h1>ロングポーリング移行管理</h1>';
            echo '<div class="error"><p>管理画面ファイルが読み込めません: ' . esc_html($admin_file) . '</p></div>';
            echo '</div>';
            return;
        }
        
        include $admin_file;
    }

    /**
     * フロントエンド設定出力
     */
    public function enqueue_migration_config()
    {
        $user_id = get_current_user_id();
        
        $config = [
            'useUnifiedLongPoll' => $this->should_use_unified_system($user_id),
            'featureFlags' => $this->config['feature_flags'],
            'migrationStage' => $this->config['stage'],
            'isHealthy' => $this->is_system_healthy()
        ];
        
        wp_localize_script('lms-unified-longpoll', 'lmsLongPollConfig', $config);
    }

    /**
     * 現在の設定取得
     */
    public function get_config()
    {
        return $this->config;
    }

    /**
     * ヘルスメトリクス取得
     */
    public function get_health_metrics()
    {
        return $this->health_metrics;
    }
}

// インスタンス化
LMS_Migration_Controller::get_instance();