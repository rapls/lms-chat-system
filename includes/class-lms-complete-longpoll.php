<?php
/**
 * LMS 完全ロングポーリングシステム - バックエンド
 * 
 * 既存ショートポーリング（6秒間隔）を30秒ロングポーリングに完全移行
 * シンプルで確実な実装により安定性を確保
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Complete_LongPoll {
    
    private static $instance = null;
    
    /**
     * 設定
     */
    private $config = [
        'timeout' => 30,           // 30秒ロングポーリング
        'check_interval' => 0.5,   // 0.5秒間隔でイベントチェック
        'max_events' => 100,       // 最大イベント数
        'cleanup_interval' => 300, // 5分でイベントクリーンアップ
    ];
    
    /**
     * 統計情報
     */
    private $stats = [
        'total_requests' => 0,
        'successful_requests' => 0,
        'failed_requests' => 0,
        'total_events_sent' => 0,
        'start_time' => 0,
    ];

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->stats['start_time'] = time();
        
        add_action('wp_ajax_lms_long_poll_updates', array($this, 'handle_long_poll'));
        add_action('wp_ajax_nopriv_lms_long_poll_updates', array($this, 'handle_long_poll'));
        
        // 統計情報エンドポイント
        add_action('wp_ajax_lms_longpoll_stats', array($this, 'handle_stats'));
        
        // イベントハンドラー登録
        $this->register_event_handlers();
        
        // 定期クリーンアップ
        add_action('lms_longpoll_cleanup', array($this, 'cleanup_old_events'));
        if (!wp_next_scheduled('lms_longpoll_cleanup')) {
            wp_schedule_event(time(), 'every_5_minutes', 'lms_longpoll_cleanup');
        }
        
        // データベーステーブル作成
        $this->create_events_table();
    }

    /**
     * メインロングポーリングハンドラー
     */
    public function handle_long_poll() {
        $start_time = microtime(true);
        $this->stats['total_requests']++;

        try {
            // セキュリティチェック
            if (!$this->verify_security()) {
                return;
            }

            // パラメータ取得
            $params = $this->get_request_params();
            if (!$params) {
                return;
            }

            // ロングポーリング実行
            $events = $this->execute_long_poll($params);

            // 成功レスポンス
            $this->stats['successful_requests']++;
            $this->stats['total_events_sent'] += count($events);

            wp_send_json_success([
                'events' => $events,
                'timestamp' => time(),
                'server_time' => current_time('mysql'),
                'polling_duration' => round((microtime(true) - $start_time) * 1000, 2) . 'ms'
            ]);

        } catch (Exception $e) {
            $this->stats['failed_requests']++;
            
            wp_send_json_error([
                'message' => 'ポーリングエラーが発生しました',
                'code' => 'polling_error'
            ]);
        }
    }

    /**
     * セキュリティ検証
     */
    private function verify_security() {
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'lms_chat_nonce')) {
            wp_send_json_error([
                'message' => 'セキュリティチェックに失敗しました',
                'code' => 'invalid_nonce'
            ]);
            return false;
        }

        // ユーザー認証
        if (!is_user_logged_in()) {
            wp_send_json_error([
                'message' => 'ログインが必要です',
                'code' => 'not_authenticated'
            ]);
            return false;
        }

        return true;
    }

    /**
     * リクエストパラメータ取得
     */
    private function get_request_params() {
        $channel_id = intval($_POST['channel_id'] ?? 0);
        $thread_id = intval($_POST['thread_id'] ?? 0);
        $last_timestamp = intval($_POST['last_timestamp'] ?? 0);
        $timeout = min(intval($_POST['timeout'] ?? $this->config['timeout']), $this->config['timeout']);
        $user_id = get_current_user_id();

        if (!$user_id) {
            wp_send_json_error([
                'message' => 'ユーザー認証に失敗しました',
                'code' => 'auth_failed'
            ]);
            return false;
        }

        return [
            'channel_id' => $channel_id,
            'thread_id' => $thread_id,
            'last_timestamp' => $last_timestamp,
            'timeout' => $timeout,
            'user_id' => $user_id,
        ];
    }

    /**
     * ロングポーリング実行
     */
    private function execute_long_poll($params) {
        $start_time = time();
        $end_time = $start_time + $params['timeout'];
        
        while (time() < $end_time) {
            // イベントチェック
            $events = $this->get_new_events($params);
            
            if (!empty($events)) {
                return $events;
            }
            
            usleep($this->config['check_interval'] * 1000000);
            
            // メモリ使用量チェック（安全装置）
            if (memory_get_usage() > (128 * 1024 * 1024)) { // 128MB
                break;
            }
        }
        
        // タイムアウト時は空配列を返す
        return [];
    }

    /**
     * 新しいイベント取得
     */
    private function get_new_events($params) {
        global $wpdb;
        
        $events_table = $wpdb->prefix . 'lms_longpoll_events';
        
        // 基本クエリ
        $where_conditions = ['timestamp > %d'];
        $query_params = [$params['last_timestamp']];
        
        // チャンネル限定
        if ($params['channel_id'] > 0) {
            $where_conditions[] = '(channel_id = %d OR channel_id = 0)';
            $query_params[] = $params['channel_id'];
        }
        
        // スレッド限定
        if ($params['thread_id'] > 0) {
            $where_conditions[] = '(thread_id = %d OR thread_id = 0)';
            $query_params[] = $params['thread_id'];
        }
        
        // 自分のイベントは除外（オプション）
        $where_conditions[] = 'user_id != %d';
        $query_params[] = $params['user_id'];
        
        $where_clause = implode(' AND ', $where_conditions);
        
        $query = $wpdb->prepare(
            "SELECT * FROM {$events_table} 
             WHERE {$where_clause}
             ORDER BY timestamp ASC 
             LIMIT %d",
            array_merge($query_params, [$this->config['max_events']])
        );
        
        $results = $wpdb->get_results($query, ARRAY_A);
        
        // イベントデータをデコード
        $events = [];
        foreach ($results as $row) {
            $event_data = json_decode($row['event_data'], true);
            $events[] = [
                'id' => $row['id'],
                'type' => $row['event_type'],
                'timestamp' => $row['timestamp'],
                'channel_id' => $row['channel_id'],
                'thread_id' => $row['thread_id'],
                'user_id' => $row['user_id'],
                'data' => $event_data
            ];
        }
        
        return $events;
    }

    /**
     * イベント追加
     */
    public function add_event($event_type, $channel_id, $data, $thread_id = 0, $user_id = null) {
        global $wpdb;
        
        if (!$user_id) {
            $user_id = get_current_user_id();
        }
        
        $events_table = $wpdb->prefix . 'lms_longpoll_events';
        
        $result = $wpdb->insert(
            $events_table,
            [
                'event_type' => $event_type,
                'channel_id' => intval($channel_id),
                'thread_id' => intval($thread_id),
                'user_id' => intval($user_id),
                'event_data' => json_encode($data),
                'timestamp' => time(),
                'expires_at' => time() + $this->config['cleanup_interval']
            ],
            ['%s', '%d', '%d', '%d', '%s', '%d', '%d']
        );
        
        if ($result === false) {}
    }

    /**
     * イベントハンドラー登録
     */
    private function register_event_handlers() {
        // メッセージ関連
        add_action('lms_message_created', array($this, 'on_message_created'), 10, 3);
        add_action('lms_message_deleted', array($this, 'on_message_deleted'), 10, 2);
        
        // リアクション関連
        add_action('lms_reaction_updated', array($this, 'on_reaction_updated'), 10, 4);
        
        // スレッド関連
        add_action('lms_thread_message_created', array($this, 'on_thread_message_created'), 10, 4);
        add_action('lms_thread_message_deleted', array($this, 'on_thread_message_deleted'), 10, 3);
    }

    /**
     * メッセージ作成イベント
     */
    public function on_message_created($message_id, $channel_id, $message_data) {
        $this->add_event('message_create', $channel_id, [
            'message_id' => $message_id,
            'user_id' => $message_data['user_id'] ?? 0,
            'message' => $message_data['message'] ?? '',
            'created_at' => $message_data['created_at'] ?? current_time('mysql'),
            'file_path' => $message_data['file_path'] ?? null
        ]);
    }

    /**
     * メッセージ削除イベント
     */
    public function on_message_deleted($message_id, $channel_id) {
        $this->add_event('message_delete', $channel_id, [
            'message_id' => $message_id
        ]);
    }

    /**
     * リアクション更新イベント
     */
    public function on_reaction_updated($message_id, $channel_id, $reactions, $thread_id = 0) {
        $this->add_event('reaction_update', $channel_id, [
            'message_id' => $message_id,
            'reactions' => $reactions
        ], $thread_id);
    }

    /**
     * スレッドメッセージ作成イベント
     */
    public function on_thread_message_created($thread_message_id, $parent_message_id, $channel_id, $message_data) {
        $this->add_event('thread_message_create', $channel_id, [
            'thread_message_id' => $thread_message_id,
            'parent_message_id' => $parent_message_id,
            'user_id' => $message_data['user_id'] ?? 0,
            'message' => $message_data['message'] ?? '',
            'created_at' => $message_data['created_at'] ?? current_time('mysql'),
            'file_path' => $message_data['file_path'] ?? null
        ], $parent_message_id);
    }

    /**
     * スレッドメッセージ削除イベント
     */
    public function on_thread_message_deleted($thread_message_id, $parent_message_id, $channel_id) {
        $this->add_event('thread_message_delete', $channel_id, [
            'thread_message_id' => $thread_message_id,
            'parent_message_id' => $parent_message_id
        ], $parent_message_id);
    }

    /**
     * 古いイベントのクリーンアップ
     */
    public function cleanup_old_events() {
        global $wpdb;
        
        $events_table = $wpdb->prefix . 'lms_longpoll_events';
        $current_time = time();
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$events_table} WHERE expires_at < %d",
            $current_time
        ));
        
        if ($deleted > 0) {}
    }

    /**
     * 統計情報ハンドラー
     */
    public function handle_stats() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限がありません');
            return;
        }

        $uptime = time() - $this->stats['start_time'];
        $success_rate = $this->stats['total_requests'] > 0 ? 
            round(($this->stats['successful_requests'] / $this->stats['total_requests']) * 100, 2) : 0;

        wp_send_json_success([
            'uptime_seconds' => $uptime,
            'uptime_formatted' => gmdate('H:i:s', $uptime),
            'total_requests' => $this->stats['total_requests'],
            'successful_requests' => $this->stats['successful_requests'],
            'failed_requests' => $this->stats['failed_requests'],
            'success_rate' => $success_rate . '%',
            'total_events_sent' => $this->stats['total_events_sent'],
            'average_events_per_request' => $this->stats['successful_requests'] > 0 ? 
                round($this->stats['total_events_sent'] / $this->stats['successful_requests'], 2) : 0,
            'memory_usage' => round(memory_get_usage(true) / 1024 / 1024, 2) . ' MB',
            'current_time' => current_time('mysql')
        ]);
    }

    /**
     * イベントテーブル作成
     */
    private function create_events_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_longpoll_events';
        
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            event_type varchar(50) NOT NULL,
            channel_id bigint(20) unsigned NOT NULL DEFAULT 0,
            thread_id bigint(20) unsigned NOT NULL DEFAULT 0,
            user_id bigint(20) unsigned NOT NULL DEFAULT 0,
            event_data longtext NOT NULL,
            timestamp bigint(20) unsigned NOT NULL,
            expires_at bigint(20) unsigned NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_timestamp (timestamp),
            INDEX idx_channel_timestamp (channel_id, timestamp),
            INDEX idx_thread_timestamp (thread_id, timestamp),
            INDEX idx_expires (expires_at)
        ) {$charset_collate};";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
}

// インスタンス化
LMS_Complete_LongPoll::get_instance();