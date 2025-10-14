<?php
/**
 * LMS 統合リアクション・Long Pollingシステム（サーバーサイド）
 * 
 * リアクション処理とLong Pollingを統合し、
 * 単一のエンドポイントで効率的な処理を実現
 * 
 * @since 2025-09-13
 */

class LMS_Unified_Reaction_LongPoll {
    
    /**
     * シングルトンインスタンス
     */
    private static $instance = null;
    
    /**
     * 最大待機時間（秒）
     */
    private $max_wait_time = 25;
    
    /**
     * ポーリング間隔（ミリ秒）
     */
    private $poll_interval = 500;
    
    /**
     * シングルトンインスタンス取得
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * コンストラクタ
     */
    private function __construct() {
        // Ajaxハンドラー登録
        add_action('wp_ajax_lms_unified_reaction', array($this, 'handle_unified_reaction'));
        add_action('wp_ajax_nopriv_lms_unified_reaction', array($this, 'handle_unified_reaction'));
        
        add_action('wp_ajax_lms_unified_longpoll', array($this, 'handle_unified_longpoll'));
        add_action('wp_ajax_nopriv_lms_unified_longpoll', array($this, 'handle_unified_longpoll'));
    }
    
    /**
     * 統合リアクション処理
     * リアクション処理と同時にLong Pollingレスポンスも返す
     */
    public function handle_unified_reaction() {
        // nonce検証
        if (!$this->verify_nonce()) {
            wp_send_json_error('セキュリティ検証に失敗しました');
            return;
        }
        
        global $wpdb;
        
        // パラメータ取得
        $message_id = intval($_POST['message_id'] ?? 0);
        $emoji = sanitize_text_field($_POST['emoji'] ?? '');
        $action = sanitize_text_field($_POST['reaction_action'] ?? '');
        $user_id = intval($_POST['user_id'] ?? get_current_user_id());
        $channel_id = intval($_POST['channel_id'] ?? 1);
        $last_event_id = intval($_POST['last_event_id'] ?? 0);
        $last_timestamp = intval($_POST['last_timestamp'] ?? 0);
        
        if (!$message_id || !$emoji) {
            wp_send_json_error('必須パラメータが不足しています');
            return;
        }
        
        // トランザクション開始
        $wpdb->query('START TRANSACTION');
        
        try {
            // リアクション処理
            if ($action === 'remove') {
                // リアクション削除
                $wpdb->update(
                    $wpdb->prefix . 'lms_chat_reactions',
                    array('deleted_at' => current_time('mysql')),
                    array(
                        'message_id' => $message_id,
                        'user_id' => $user_id,
                        'reaction' => $emoji,
                        'deleted_at' => null
                    )
                );
            } else {
                // 既存チェック
                $existing = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}lms_chat_reactions 
                     WHERE message_id = %d AND user_id = %d AND reaction = %s AND deleted_at IS NULL",
                    $message_id, $user_id, $emoji
                ));
                
                if (!$existing) {
                    // リアクション追加
                    $wpdb->insert(
                        $wpdb->prefix . 'lms_chat_reactions',
                        array(
                            'message_id' => $message_id,
                            'user_id' => $user_id,
                            'reaction' => $emoji,
                            'created_at' => current_time('mysql')
                        )
                    );
                }
            }
            
            // 現在のリアクション取得
            $reactions = $wpdb->get_results($wpdb->prepare(
                "SELECT user_id, reaction as emoji FROM {$wpdb->prefix}lms_chat_reactions 
                 WHERE message_id = %d AND deleted_at IS NULL",
                $message_id
            ), ARRAY_A);
            
            // イベント作成
            $event_id = $this->create_event('reaction_update', array(
                'message_id' => $message_id,
                'reactions' => $reactions,
                'user_id' => $user_id,
                'channel_id' => $channel_id
            ));
            
            // コミット
            $wpdb->query('COMMIT');
            
            // 即座に新しいイベントを取得
            $events = $this->get_events_since($last_event_id, $channel_id);
            
            // レスポンス
            wp_send_json_success(array(
                'message_id' => $message_id,
                'reactions' => $reactions,
                'event_id' => $event_id,
                'events' => $events, // 新しいイベントも含める
                'timestamp' => time()
            ));
            
        } catch (Exception $e) {
            $wpdb->query('ROLLBACK');
            wp_send_json_error('リアクション処理に失敗しました');
        }
    }
    
    /**
     * 統合Long Polling処理
     */
    public function handle_unified_longpoll() {
        // nonce検証
        if (!$this->verify_nonce()) {
            wp_send_json_error('セキュリティ検証に失敗しました');
            return;
        }
        
        // タイムアウト設定
        set_time_limit(30);
        ignore_user_abort(true);
        
        // パラメータ取得
        $channel_id = intval($_POST['channel_id'] ?? 1);
        $last_event_id = intval($_POST['last_event_id'] ?? 0);
        $last_timestamp = intval($_POST['last_timestamp'] ?? 0);
        $include_reactions = filter_var($_POST['include_reactions'] ?? false, FILTER_VALIDATE_BOOLEAN);
        
        $start_time = time();
        $events = array();
        
        // Long Polling ループ
        while (time() - $start_time < $this->max_wait_time) {
            // 新しいイベントを確認
            $events = $this->get_events_since($last_event_id, $channel_id, $include_reactions);
            
            if (!empty($events)) {
                // イベントが見つかったら即座に返す
                wp_send_json_success(array(
                    'events' => $events,
                    'timestamp' => time()
                ));
                return;
            }
            
            // 少し待機
            usleep($this->poll_interval * 1000);
            
            // 接続確認
            if (connection_aborted()) {
                exit;
            }
        }
        
        // タイムアウト（イベントなし）
        wp_send_json_success(array(
            'events' => array(),
            'timestamp' => time(),
            'timeout' => true
        ));
    }
    
    /**
     * イベント作成
     */
    private function create_event($type, $data) {
        global $wpdb;
        
        $wpdb->insert(
            $wpdb->prefix . 'lms_chat_realtime_events',
            array(
                'event_type' => $type,
                'message_id' => $data['message_id'] ?? null,
                'channel_id' => $data['channel_id'] ?? 1,
                'user_id' => $data['user_id'] ?? get_current_user_id(),
                'data' => json_encode($data),  // カラム名を修正
                'timestamp' => time(),
                'expires_at' => time() + 86400,  // 24時間後に期限切れ
                'priority' => 2  // 標準優先度
            )
        );
        
        return $wpdb->insert_id;
    }
    
    /**
     * 指定ID以降のイベント取得
     */
    private function get_events_since($last_id, $channel_id, $include_reactions = true) {
        global $wpdb;
        
        $query = "SELECT * FROM {$wpdb->prefix}lms_chat_realtime_events 
                  WHERE id > %d AND channel_id = %d";
        
        // リアクション以外のイベントをフィルタする場合
        if (!$include_reactions) {
            $query .= " AND event_type != 'reaction_update'";
        }
        
        $query .= " ORDER BY id ASC LIMIT 50";
        
        $results = $wpdb->get_results($wpdb->prepare($query, $last_id, $channel_id));
        
        $events = array();
        foreach ($results as $row) {
            // カラム名が 'data' であることを確認
            $event_data = isset($row->data) ? json_decode($row->data, true) : null;
            
            $events[] = array(
                'id' => intval($row->id),
                'type' => $row->event_type,
                'data' => $event_data,
                'timestamp' => intval($row->timestamp)
            );
        }
        
        return $events;
    }
    
    /**
     * nonce検証
     */
    private function verify_nonce() {
        $nonce = $_POST['nonce'] ?? '';
        $nonce_action = $_POST['nonce_action'] ?? 'lms_ajax_nonce';
        
        // 複数のnonce形式をサポート
        if (wp_verify_nonce($nonce, $nonce_action)) {
            return true;
        }
        
        if (wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
            return true;
        }
        
        if (wp_verify_nonce($nonce, 'lms_toggle_reaction')) {
            return true;
        }
        
        // 動的nonce形式もサポート
        if (preg_match('/^lms_ajax_nonce_[\d\.]+_\d+$/', $nonce_action)) {
            if (wp_verify_nonce($nonce, $nonce_action)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 古いイベントのクリーンアップ
     */
    public function cleanup_old_events() {
        global $wpdb;
        
        // 24時間以上前のイベントを削除
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}lms_chat_realtime_events 
             WHERE timestamp < %d",
            time() - 86400
        ));
    }
}

// インスタンス化
add_action('init', function() {
    LMS_Unified_Reaction_LongPoll::get_instance();
    
    // クリーンアップのスケジュール
    if (!wp_next_scheduled('lms_cleanup_old_events')) {
        wp_schedule_event(time(), 'hourly', 'lms_cleanup_old_events');
    }
});

// クリーンアップ実行
add_action('lms_cleanup_old_events', function() {
    $instance = LMS_Unified_Reaction_LongPoll::get_instance();
    $instance->cleanup_old_events();
});