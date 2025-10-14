<?php
/**
 * LMS リアルタイム削除通知システム
 * メッセージ削除時の即座通知とタイムラグ削減
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

if (!class_exists('LMS_Realtime_Delete_Notifier')) {
    class LMS_Realtime_Delete_Notifier {
        
        /**
         * インスタンス
         */
        private static $instance = null;
        
        /**
         * 削除イベントキュー
         */
        private $delete_events = array();
        
        /**
         * 設定
         */
        private $config = array(
            'fast_poll_duration' => 15, // 高速ポーリング継続時間（秒）
            'event_expiry' => 30,       // イベント有効期限（秒）
            'max_events' => 100,        // 最大イベント数
            'enable_sse' => true,       // SSE有効
            'enable_push' => true,      // プッシュ通知有効
            'enable_websocket' => false // WebSocket（将来実装）
        );
        
        /**
         * 統計
         */
        private $stats = array(
            'events_created' => 0,
            'events_delivered' => 0,
            'fast_polls' => 0,
            'sse_connections' => 0
        );
        
        /**
         * インスタンス取得
         */
        public static function get_instance() {
            if (null === self::$instance) {
                self::$instance = new self();
            }
            return self::$instance;
        }
        
        /**
         * コンストラクター
         */
        private function __construct() {
            $this->init();
        }
        
        /**
         * 初期化
         */
        private function init() {
            add_action('wp_ajax_lms_get_fast_updates', array($this, 'handle_fast_updates'));
            add_action('wp_ajax_nopriv_lms_get_fast_updates', array($this, 'handle_fast_updates'));
            
            if ($this->config['enable_sse']) {
                add_action('wp_ajax_lms_delete_sse', array($this, 'handle_delete_sse'));
                add_action('wp_ajax_nopriv_lms_delete_sse', array($this, 'handle_delete_sse'));
            }
            
            // 削除フック
            add_action('lms_message_deleted', array($this, 'on_message_deleted'), 5, 3);
            add_action('lms_chat_message_deleted', array($this, 'on_message_deleted'), 5, 3);
            
            // 定期クリーンアップ
            add_action('wp_loaded', array($this, 'schedule_cleanup'));
            
        }
        
        /**
         * メッセージ削除時の処理
         */
        public function on_message_deleted($message_id, $channel_id, $user_id = null) {
            
            // 削除イベントを作成
            $event = array(
                'id' => uniqid('del_', true),
                'message_id' => intval($message_id),
                'channel_id' => intval($channel_id),
                'user_id' => intval($user_id),
                'timestamp' => microtime(true),
                'type' => 'message_deleted',
                'delivered' => array() // 配信済みユーザー
            );
            
            // キューに追加
            $this->add_event($event);
            
            // 即座通知
            $this->immediate_notify($event);
            
            // プッシュ通知
            if ($this->config['enable_push']) {
                $this->send_push_notification($event);
            }
            
            $this->stats['events_created']++;
        }
        
        /**
         * イベントをキューに追加
         */
        private function add_event($event) {
            // メモリ制限チェック
            if (count($this->delete_events) >= $this->config['max_events']) {
                // 古いイベントを削除
                $this->delete_events = array_slice($this->delete_events, -($this->config['max_events'] - 1));
            }
            
            $this->delete_events[] = $event;
            
            $transient_key = 'lms_delete_events';
            $existing_events = get_transient($transient_key) ?: array();
            
            $existing_events[] = $event;
            $existing_events = array_slice($existing_events, -$this->config['max_events']);
            
            set_transient($transient_key, $existing_events, $this->config['event_expiry']);
        }
        
        /**
         * 高速更新リクエスト処理
         */
        public function handle_fast_updates() {
            $this->set_cors_headers();
            
            // パラメータ取得
            $channel_id = intval($_POST['channel_id'] ?? 0);
            $last_check = floatval($_POST['last_check'] ?? 0) / 1000; // JSのタイムスタンプをPHPに変換
            $user_id = get_current_user_id();
            
            // セッションベースユーザー認証のフォールバック
            if (!$user_id) {
                session_start();
                $user_id = intval($_SESSION['lms_user_id'] ?? 0);
            }
            
            if (!$channel_id) {
                wp_send_json_error('Invalid channel ID');
                return;
            }
            
            $this->stats['fast_polls']++;
            
            // 該当する削除イベントを取得
            $events = $this->get_events_since($channel_id, $last_check, $user_id);
            
            if (!empty($events)) {
            }
            
            // レスポンス
            wp_send_json_success(array(
                'deleted_messages' => array_column($events, 'message_id'),
                'events' => $events,
                'timestamp' => microtime(true),
                'stats' => $this->stats
            ));
        }
        
        /**
         * 指定時刻以降のイベント取得
         */
        private function get_events_since($channel_id, $since_timestamp, $user_id) {
            $current_time = microtime(true);
            $events = array();
            
            // メモリ内イベント
            foreach ($this->delete_events as $event) {
                if ($this->should_deliver_event($event, $channel_id, $since_timestamp, $user_id, $current_time)) {
                    $events[] = $event;
                    
                    // 配信記録
                    if (!isset($event['delivered'])) {
                        $event['delivered'] = array();
                    }
                    $event['delivered'][] = $user_id;
                    
                    $this->stats['events_delivered']++;
                }
            }
            
            if (empty($events)) {
                $transient_events = get_transient('lms_delete_events') ?: array();
                foreach ($transient_events as $event) {
                    if ($this->should_deliver_event($event, $channel_id, $since_timestamp, $user_id, $current_time)) {
                        $events[] = $event;
                    }
                }
            }
            
            return $events;
        }
        
        /**
         * イベント配信判定
         */
        private function should_deliver_event($event, $channel_id, $since_timestamp, $user_id, $current_time) {
            // チャンネル一致
            if ($event['channel_id'] !== $channel_id) {
                return false;
            }
            
            // 時刻チェック
            if ($event['timestamp'] <= $since_timestamp) {
                return false;
            }
            
            // 有効期限チェック
            if (($current_time - $event['timestamp']) > $this->config['event_expiry']) {
                return false;
            }
            
            // 自分の削除は除外
            if (isset($event['user_id']) && $event['user_id'] === $user_id) {
                return false;
            }
            
            // 既配信チェック
            if (isset($event['delivered']) && in_array($user_id, $event['delivered'])) {
                return false;
            }
            
            return true;
        }
        
        /**
         * Server-Sent Events処理
         */
        public function handle_delete_sse() {
            if (!$this->config['enable_sse']) {
                wp_die('SSE not enabled');
            }
            
            $this->stats['sse_connections']++;
            
            header('Content-Type: text/event-stream');
            header('Cache-Control: no-cache');
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Credentials: true');
            
            $channel_id = intval($_GET['channel_id'] ?? 0);
            $user_id = get_current_user_id();
            
            if (!$channel_id) {
                echo "event: error\n";
                echo "data: Invalid channel ID\n\n";
                flush();
                exit;
            }
            
            $last_check = microtime(true);
            
            // 接続維持ループ
            for ($i = 0; $i < 30; $i++) { // 30秒間接続維持
                $events = $this->get_events_since($channel_id, $last_check, $user_id);
                
                if (!empty($events)) {
                    foreach ($events as $event) {
                        echo "event: message_deleted\n";
                        echo "data: " . json_encode($event) . "\n\n";
                        flush();
                    }
                }
                
                $last_check = microtime(true);
                
                echo "event: ping\n";
                echo "data: " . json_encode(array('timestamp' => $last_check)) . "\n\n";
                flush();
                
                sleep(1);
            }
            
            exit;
        }
        
        /**
         * 即座通知
         */
        private function immediate_notify($event) {
            do_action('lms_realtime_delete_immediate', $event);
            
            // ロングポーリング強制更新
            if (class_exists('LMS_Chat_LongPoll')) {
                $longpoll = LMS_Chat_LongPoll::get_instance();
                if (method_exists($longpoll, 'force_update')) {
                    $longpoll->force_update();
                }
            }
            
            // 削除キャッシュ更新（long-polling.php用）
            $cache_key = "deleted_channel_msgs_{$event['channel_id']}";
            $existing_deleted = wp_cache_get($cache_key, 'lms_chat') ?: array();
            $existing_deleted[] = $event['message_id'];
            wp_cache_set($cache_key, $existing_deleted, 'lms_chat', 30);
            
        }
        
        /**
         * プッシュ通知送信
         */
        private function send_push_notification($event) {
            if (!class_exists('LMS_Push_Notification')) {
                return;
            }
            
            try {
                $push = new LMS_Push_Notification();
                
                // チャンネルメンバー取得
                global $wpdb;
                $members = $wpdb->get_col($wpdb->prepare(
                    "SELECT user_id FROM {$wpdb->prefix}lms_channel_members WHERE channel_id = %d",
                    $event['channel_id']
                ));
                
                // 削除者以外に通知
                foreach ($members as $member_id) {
                    if ($member_id != $event['user_id']) {
                        $push->send_to_user($member_id, array(
                            'title' => 'メッセージが削除されました',
                            'body' => 'チャンネル内でメッセージが削除されました',
                            'icon' => '/wp-content/themes/lms/img/icon-delete.png',
                            'tag' => 'message-delete-' . $event['message_id'],
                            'data' => array(
                                'type' => 'message_deleted',
                                'message_id' => $event['message_id'],
                                'channel_id' => $event['channel_id'],
                                'action_url' => '?channel=' . $event['channel_id']
                            )
                        ));
                    }
                }
                
            } catch (Exception $e) {
            }
        }
        
        /**
         * CORS ヘッダー設定
         */
        private function set_cors_headers() {
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization');
            header('Access-Control-Allow-Credentials: true');
            
            if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
                exit(0);
            }
        }
        
        /**
         * クリーンアップスケジュール
         */
        public function schedule_cleanup() {
            if (!wp_next_scheduled('lms_realtime_delete_cleanup')) {
                wp_schedule_event(time(), 'hourly', 'lms_realtime_delete_cleanup');
            }
            add_action('lms_realtime_delete_cleanup', array($this, 'cleanup_old_events'));
        }
        
        /**
         * 古いイベントのクリーンアップ
         */
        public function cleanup_old_events() {
            $current_time = microtime(true);
            $expiry = $this->config['event_expiry'];
            
            // メモリ内イベントクリーンアップ
            $this->delete_events = array_filter($this->delete_events, function($event) use ($current_time, $expiry) {
                return ($current_time - $event['timestamp']) <= $expiry;
            });
            
            $transient_events = get_transient('lms_delete_events') ?: array();
            $cleaned_events = array_filter($transient_events, function($event) use ($current_time, $expiry) {
                return ($current_time - $event['timestamp']) <= $expiry;
            });
            
            if (count($cleaned_events) !== count($transient_events)) {
                set_transient('lms_delete_events', $cleaned_events, $expiry);
            }
            
        }
        
        /**
         * 統計情報取得
         */
        public function get_stats() {
            return array_merge($this->stats, array(
                'active_events' => count($this->delete_events),
                'config' => $this->config,
                'memory_usage' => memory_get_usage(true),
                'uptime' => time() - (defined('ABSPATH') ? filemtime(ABSPATH . 'index.php') : time())
            ));
        }
        
        /**
         * 設定更新
         */
        public function update_config($new_config) {
            $this->config = array_merge($this->config, $new_config);
        }
        
        /**
         * デバッグ情報
         */
        public function debug() {
            return array(
                'stats' => $this->get_stats(),
                'recent_events' => array_slice($this->delete_events, -5),
                'transient_events' => count(get_transient('lms_delete_events') ?: array())
            );
        }
    }
    
    // インスタンス化
    function lms_get_realtime_delete_notifier() {
        return LMS_Realtime_Delete_Notifier::get_instance();
    }
    
    // 初期化
    add_action('init', 'lms_get_realtime_delete_notifier');
}
?>