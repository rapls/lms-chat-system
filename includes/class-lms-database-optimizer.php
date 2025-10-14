<?php
/**
 * LMS データベース最適化システム
 * 
 * ロングポーリングシステムのパフォーマンス向上のため
 * データベーステーブルとインデックスを最適化
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Database_Optimizer {
    
    private static $instance = null;
    
    /**
     * 最適化設定
     */
    private $config = [
        'index_maintenance_interval' => 3600,  // 1時間間隔でインデックス最適化
        'cleanup_old_data_days' => 30,         // 30日以上古いデータを削除
        'analyze_table_threshold' => 1000,     // 1000レコード以上でANALYZE実行
        'enable_query_cache' => true,          // クエリキャッシュ有効化
    ];
    
    /**
     * 最適化統計
     */
    private $stats = [
        'tables_optimized' => 0,
        'indexes_created' => 0,
        'records_cleaned' => 0,
        'performance_improvement' => 0,
        'last_optimization' => 0,
    ];

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // 管理者エンドポイント登録
        add_action('wp_ajax_lms_database_optimize', array($this, 'handle_optimization'));
        add_action('wp_ajax_lms_database_status', array($this, 'handle_status'));
        
        // 定期最適化スケジュール
        add_action('lms_database_maintenance', array($this, 'run_maintenance'));
        if (!wp_next_scheduled('lms_database_maintenance')) {
            wp_schedule_event(time(), 'hourly', 'lms_database_maintenance');
        }
        
        // 初期化時にテーブル状態チェック
        add_action('init', array($this, 'check_database_health'));
    }

    /**
     * データベース最適化実行
     */
    public function handle_optimization() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限がありません');
            return;
        }

        $start_time = microtime(true);
        
        try {
            $events_result = $this->optimize_longpoll_events_table();
            
            $messages_result = $this->optimize_chat_messages_table();
            
            $reactions_result = $this->optimize_reactions_table();
            
            $cleanup_result = $this->cleanup_old_data();
            
            $index_result = $this->update_index_statistics();
            
            $execution_time = round((microtime(true) - $start_time) * 1000, 2);
            
            $this->stats['last_optimization'] = time();
            
            wp_send_json_success([
                'message' => 'データベース最適化が完了しました',
                'execution_time' => $execution_time . 'ms',
                'results' => [
                    'events_table' => $events_result,
                    'messages_table' => $messages_result,
                    'reactions_table' => $reactions_result,
                    'cleanup' => $cleanup_result,
                    'indexes' => $index_result
                ],
                'stats' => $this->stats
            ]);

        } catch (Exception $e) {
            wp_send_json_error([
                'message' => 'データベース最適化中にエラーが発生しました',
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * ロングポーリングイベントテーブル最適化
     */
    private function optimize_longpoll_events_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_longpoll_events';
        
        // テーブル存在確認
        if ($wpdb->get_var("SHOW TABLES LIKE '{$table_name}'") !== $table_name) {
            return ['status' => 'skipped', 'reason' => 'テーブルが存在しません'];
        }
        
        $result = ['status' => 'success', 'actions' => []];
        
        $indexes_to_check = [
            'idx_timestamp' => 'timestamp',
            'idx_channel_timestamp' => 'channel_id, timestamp',
            'idx_thread_timestamp' => 'thread_id, timestamp',
            'idx_user_timestamp' => 'user_id, timestamp',
            'idx_expires' => 'expires_at',
            'idx_event_type_timestamp' => 'event_type, timestamp',
            'idx_channel_user' => 'channel_id, user_id',
        ];
        
        foreach ($indexes_to_check as $index_name => $columns) {
            if (!$this->index_exists($table_name, $index_name)) {
                $sql = "ALTER TABLE {$table_name} ADD INDEX {$index_name} ({$columns})";
                $wpdb->query($sql);
                $result['actions'][] = "インデックス {$index_name} を作成";
                $this->stats['indexes_created']++;
            }
        }
        
        $wpdb->query("OPTIMIZE TABLE {$table_name}");
        $result['actions'][] = "テーブル最適化を実行";
        
        $wpdb->query("ANALYZE TABLE {$table_name}");
        $result['actions'][] = "統計情報を更新";
        
        $this->stats['tables_optimized']++;
        
        return $result;
    }

    /**
     * チャットメッセージテーブル最適化
     */
    private function optimize_chat_messages_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_chat_messages';
        
        if ($wpdb->get_var("SHOW TABLES LIKE '{$table_name}'") !== $table_name) {
            return ['status' => 'skipped', 'reason' => 'テーブルが存在しません'];
        }
        
        $result = ['status' => 'success', 'actions' => []];
        
        // 重要なインデックスを確認・作成
        $indexes_to_check = [
            'idx_channel_created' => 'channel_id, created_at',
            'idx_user_created' => 'user_id, created_at',
            'idx_thread_id' => 'thread_id',
            'idx_created_at' => 'created_at',
            'idx_channel_user_created' => 'channel_id, user_id, created_at',
        ];
        
        foreach ($indexes_to_check as $index_name => $columns) {
            if (!$this->index_exists($table_name, $index_name)) {
                $sql = "ALTER TABLE {$table_name} ADD INDEX {$index_name} ({$columns})";
                $wpdb->query($sql);
                $result['actions'][] = "インデックス {$index_name} を作成";
                $this->stats['indexes_created']++;
            }
        }
        
        // テーブル最適化
        $wpdb->query("OPTIMIZE TABLE {$table_name}");
        $wpdb->query("ANALYZE TABLE {$table_name}");
        $result['actions'][] = "テーブル最適化と統計更新を実行";
        
        $this->stats['tables_optimized']++;
        
        return $result;
    }

    /**
     * リアクションテーブル最適化
     */
    private function optimize_reactions_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_chat_reactions';
        
        if ($wpdb->get_var("SHOW TABLES LIKE '{$table_name}'") !== $table_name) {
            return ['status' => 'skipped', 'reason' => 'テーブルが存在しません'];
        }
        
        $result = ['status' => 'success', 'actions' => []];
        
        // リアクション専用インデックス
        $indexes_to_check = [
            'idx_message_reaction' => 'message_id, reaction_type',
            'idx_message_user' => 'message_id, user_id',
            'idx_created_at' => 'created_at',
            'idx_message_created' => 'message_id, created_at',
        ];
        
        foreach ($indexes_to_check as $index_name => $columns) {
            if (!$this->index_exists($table_name, $index_name)) {
                $sql = "ALTER TABLE {$table_name} ADD INDEX {$index_name} ({$columns})";
                $wpdb->query($sql);
                $result['actions'][] = "インデックス {$index_name} を作成";
                $this->stats['indexes_created']++;
            }
        }
        
        // テーブル最適化
        $wpdb->query("OPTIMIZE TABLE {$table_name}");
        $wpdb->query("ANALYZE TABLE {$table_name}");
        $result['actions'][] = "テーブル最適化と統計更新を実行";
        
        $this->stats['tables_optimized']++;
        
        return $result;
    }

    /**
     * 古いデータクリーンアップ
     */
    private function cleanup_old_data() {
        global $wpdb;
        
        $result = ['status' => 'success', 'actions' => [], 'records_cleaned' => 0];
        $cutoff_time = time() - ($this->config['cleanup_old_data_days'] * 24 * 3600);
        
        $events_table = $wpdb->prefix . 'lms_longpoll_events';
        if ($wpdb->get_var("SHOW TABLES LIKE '{$events_table}'") === $events_table) {
            $deleted = $wpdb->query($wpdb->prepare(
                "DELETE FROM {$events_table} WHERE expires_at < %d",
                time()
            ));
            
            if ($deleted > 0) {
                $result['actions'][] = "期限切れイベント {$deleted}件を削除";
                $result['records_cleaned'] += $deleted;
                $this->stats['records_cleaned'] += $deleted;
            }
        }
        
        $old_logs_deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE 'lms_temp_%' AND option_value < %d",
            $cutoff_time
        ));
        
        if ($old_logs_deleted > 0) {
            $result['actions'][] = "古いテンポラリデータ {$old_logs_deleted}件を削除";
            $result['records_cleaned'] += $old_logs_deleted;
        }
        
        return $result;
    }

    /**
     * インデックス統計更新
     */
    private function update_index_statistics() {
        global $wpdb;
        
        $result = ['status' => 'success', 'actions' => []];
        
        // 主要テーブルの統計情報を更新
        $tables_to_analyze = [
            $wpdb->prefix . 'lms_longpoll_events',
            $wpdb->prefix . 'lms_chat_messages',
            $wpdb->prefix . 'lms_chat_reactions',
            $wpdb->prefix . 'lms_chat_channels',
            $wpdb->prefix . 'lms_chat_threads'
        ];
        
        foreach ($tables_to_analyze as $table) {
            if ($wpdb->get_var("SHOW TABLES LIKE '{$table}'") === $table) {
                $wpdb->query("ANALYZE TABLE {$table}");
                $result['actions'][] = "テーブル {$table} の統計を更新";
            }
        }
        
        return $result;
    }

    /**
     * インデックス存在確認
     */
    private function index_exists($table_name, $index_name) {
        global $wpdb;
        
        $result = $wpdb->get_row($wpdb->prepare(
            "SHOW INDEX FROM {$table_name} WHERE Key_name = %s",
            $index_name
        ));
        
        return !empty($result);
    }

    /**
     * データベース状態確認
     */
    public function handle_status() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限がありません');
            return;
        }

        global $wpdb;
        
        $status = [
            'tables' => [],
            'performance' => [],
            'recommendations' => []
        ];
        
        // テーブル状態チェック
        $tables_to_check = [
            $wpdb->prefix . 'lms_longpoll_events',
            $wpdb->prefix . 'lms_chat_messages',
            $wpdb->prefix . 'lms_chat_reactions'
        ];
        
        foreach ($tables_to_check as $table) {
            if ($wpdb->get_var("SHOW TABLES LIKE '{$table}'") === $table) {
                $table_status = $wpdb->get_row("SHOW TABLE STATUS LIKE '{$table}'", ARRAY_A);
                $index_count = $wpdb->get_var("SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{$table}'");
                
                $status['tables'][$table] = [
                    'exists' => true,
                    'rows' => $table_status['Rows'] ?? 0,
                    'data_length' => $this->format_bytes($table_status['Data_length'] ?? 0),
                    'index_length' => $this->format_bytes($table_status['Index_length'] ?? 0),
                    'index_count' => $index_count,
                    'auto_increment' => $table_status['Auto_increment'] ?? 0,
                    'collation' => $table_status['Collation'] ?? 'unknown'
                ];
            } else {
                $status['tables'][$table] = ['exists' => false];
            }
        }
        
        // パフォーマンス指標
        $status['performance'] = [
            'query_cache_size' => $this->get_mysql_variable('query_cache_size'),
            'innodb_buffer_pool_size' => $this->get_mysql_variable('innodb_buffer_pool_size'),
            'max_connections' => $this->get_mysql_variable('max_connections'),
            'threads_connected' => $this->get_mysql_status('Threads_connected'),
            'queries_per_second' => $this->calculate_qps()
        ];
        
        // 推奨事項
        $status['recommendations'] = $this->generate_recommendations($status);
        
        // 統計情報
        $status['stats'] = $this->stats;
        
        wp_send_json_success($status);
    }

    /**
     * MySQL変数取得
     */
    private function get_mysql_variable($variable_name) {
        global $wpdb;
        
        $result = $wpdb->get_row($wpdb->prepare(
            "SHOW VARIABLES LIKE %s",
            $variable_name
        ), ARRAY_A);
        
        return $result['Value'] ?? 'N/A';
    }

    /**
     * MySQL状態取得
     */
    private function get_mysql_status($status_name) {
        global $wpdb;
        
        $result = $wpdb->get_row($wpdb->prepare(
            "SHOW STATUS LIKE %s",
            $status_name
        ), ARRAY_A);
        
        return $result['Value'] ?? 'N/A';
    }

    /**
     * QPS計算
     */
    private function calculate_qps() {
        global $wpdb;
        
        $queries = $wpdb->get_var("SHOW STATUS LIKE 'Queries'");
        $uptime = $wpdb->get_var("SHOW STATUS LIKE 'Uptime'");
        
        if ($queries && $uptime && $uptime > 0) {
            return round($queries / $uptime, 2);
        }
        
        return 'N/A';
    }

    /**
     * 推奨事項生成
     */
    private function generate_recommendations($status) {
        $recommendations = [];
        
        // テーブル行数チェック
        foreach ($status['tables'] as $table => $info) {
            if ($info['exists']) {
                if ($info['rows'] > 100000) {
                    $recommendations[] = [
                        'type' => 'performance',
                        'priority' => 'high',
                        'message' => "テーブル {$table} の行数が多いです（{$info['rows']}行）。定期的なデータクリーンアップを推奨します。"
                    ];
                }
                
                if ($info['index_count'] < 3) {
                    $recommendations[] = [
                        'type' => 'index',
                        'priority' => 'medium',
                        'message' => "テーブル {$table} のインデックス数が少ないです。最適化を実行してください。"
                    ];
                }
            }
        }
        
        return $recommendations;
    }

    /**
     * バイト数フォーマット
     */
    private function format_bytes($size) {
        if (!$size) return '0 B';
        
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = floor(log($size, 1024));
        
        return round($size / pow(1024, $i), 2) . ' ' . $units[$i];
    }

    /**
     * データベースヘルスチェック
     */
    public function check_database_health() {
        // 定期的なヘルスチェック（1時間に1回）
        $last_check = get_option('lms_db_last_health_check', 0);
        if (time() - $last_check < 3600) {
            return;
        }
        
        update_option('lms_db_last_health_check', time());
        
        // 基本的なヘルスチェック実行
        $this->run_health_check();
    }

    /**
     * ヘルスチェック実行
     */
    private function run_health_check() {
        global $wpdb;
        
        // ロングポーリングイベントテーブルの状態確認
        $events_table = $wpdb->prefix . 'lms_longpoll_events';
        if ($wpdb->get_var("SHOW TABLES LIKE '{$events_table}'") === $events_table) {
            $event_count = $wpdb->get_var("SELECT COUNT(*) FROM {$events_table}");
            $expired_count = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$events_table} WHERE expires_at < %d",
                time()
            ));
            
            // 期限切れイベントが多い場合は警告
            if ($expired_count > 1000) {}
            
            // イベント数が異常に多い場合は警告
            if ($event_count > 50000) {}
        }
    }

    /**
     * 定期メンテナンス実行
     */
    public function run_maintenance() {
        // 負荷の少ない時間帯のみ実行（深夜2-6時）
        $current_hour = date('H');
        if ($current_hour < 2 || $current_hour > 6) {
            return;
        }
        
        // 軽量な最適化のみ実行
        $this->cleanup_old_data();
        $this->run_health_check();}
}

// インスタンス化
LMS_Database_Optimizer::get_instance();