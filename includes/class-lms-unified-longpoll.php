<?php

/**
 * 統合ロングポーリングシステム
 *
 * 既存のLMS_Chat_Realtimeを拡張し、リアクション更新を含む
 * 全てのイベントを統合した効率的なロングポーリングシステム
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once get_template_directory() . '/includes/class-lms-chat-realtime.php';
// 一時的に無効化: require_once get_template_directory() . '/includes/class-lms-thread-summary-cache.php';

// セッションヘルパー関数が必要な場合はfunctions.phpから取得
if (!function_exists('acquireSession')) {
    require_once get_template_directory() . '/functions.php';
}

class LMS_Unified_LongPoll
{
    private static $instance = null;
    
    /**
     * 既存のリアルタイムハンドラー（コンポジション）
     */
    private $realtime_handler;
    
    /**
     * スレッドサマリーキャッシュハンドラー
     */
    private $thread_summary_cache;
    
    /**
     * 統合イベントテーブル名
     */
    const EVENTS_TABLE = 'lms_chat_realtime_events';
    
    /**
     * ポーリング間隔（マイクロ秒）
     */
    const POLL_INTERVAL = 100000; // 0.1秒（段階的最適化ステップ2: 平均-75ms改善、負荷2.5倍→数秒以内の同期実現）
    
    /**
     * イベント優先度定数
     */
    const PRIORITY_CRITICAL = 1;  // 即座通知（メッセージ投稿/削除）
    const PRIORITY_HIGH     = 2;  // 高優先度（リアクション）
    const PRIORITY_NORMAL   = 3;  // 通常（バッジ更新）
    const PRIORITY_LOW      = 4;  // 低優先度（統計情報）
    
    /**
     * イベントタイプ定数
     */
    const EVENT_MESSAGE_CREATE      = 'message_create';
    const EVENT_MESSAGE_DELETE      = 'message_delete';
    const EVENT_DATE_SEPARATOR_DELETE = 'date_separator_delete';
    const EVENT_REACTION_UPDATE     = 'reaction_update';
    const EVENT_THREAD_CREATE       = 'thread_create';
    const EVENT_THREAD_DELETE       = 'thread_delete';
    const EVENT_THREAD_REACTION     = 'thread_reaction';
    const EVENT_THREAD_REACTION_UPDATE = 'thread_reaction_update';
    const EVENT_THREAD_SUMMARY_UPDATE  = 'thread_summary_update';
    
    /**
     * 設定デフォルト値
     */
    private $config = [
        'max_connections_per_user' => 3,
        'default_timeout' => 30,
        'batch_size' => 50,
        'cleanup_interval' => 3600, // 1時間
        'event_expiry' => 86400,    // 24時間
        'enable_circuit_breaker' => true,
        'rollout_percentage' => 100, // 完全移行のため100%に設定
        'summary_flush_delay' => 1,
        'summary_batch_size' => 10,
        'summary_transient_ttl' => 15,
        'summary_force_flush_interval' => 3
    ];
    
    /**
     * 接続統計
     */
    private $stats = [
        'active_connections' => 0,
        'total_events_processed' => 0,
        'avg_response_time' => 0,
        'error_count' => 0,
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
        // 統合ロングポーリングシステムを有効化（同期修正のため）
        // 緊急無効化を解除し、正常な統合Long Pollingシステムを復旧
        // 既存のリアルタイムハンドラーを取得（コンポジション）
        $this->realtime_handler = null;
        if (class_exists('LMS_Chat_Realtime')) {
            try {
                $this->realtime_handler = LMS_Chat_Realtime::get_instance();
            } catch (Exception $e) {
                // リアルタイムハンドラーの初期化に失敗した場合はnullのまま
            }
        }

        // スレッドサマリーキャッシュの初期化
        $this->thread_summary_cache = null;
        // 一時的に無効化
        /*
        if (class_exists('LMS_Thread_Summary_Cache')) {
            try {
                $this->thread_summary_cache = LMS_Thread_Summary_Cache::get_instance();
            } catch (Exception $e) {
                // スレッドサマリーキャッシュの初期化に失敗した場合はnullのまま
                if (defined('WP_DEBUG') && WP_DEBUG) {
                }
            }
        }
        */

        // 設定の読み込み
        $this->load_config();

        // 統合ロングポーリングエンドポイントの登録
        add_action('wp_ajax_lms_unified_long_poll', array($this, 'handle_unified_long_poll'));
        add_action('wp_ajax_nopriv_lms_unified_long_poll', array($this, 'handle_unified_long_poll'));

        // 設定管理エンドポイント
        add_action('wp_ajax_lms_longpoll_config', array($this, 'handle_config_update'));

        // 新しいメッセージ作成イベントフック（実際のHook名に修正）
        add_action('lms_chat_message_created', array($this, 'on_message_created'), 10, 4);
        add_action('lms_chat_message_deleted', array($this, 'on_message_deleted'), 10, 2);
        add_action('lms_chat_date_separator_deleted', array($this, 'on_date_separator_deleted'), 10, 2);
        add_action('lms_chat_thread_message_sent', array($this, 'on_thread_message_created'), 10, 4);
        add_action('lms_chat_thread_message_deleted', array($this, 'on_thread_message_deleted'), 10, 3);

        // リアクションイベントフック
        // Event handler registration started
        add_action('lms_reaction_updated', array($this, 'on_reaction_updated'), 10, 4);
        add_action('lms_thread_reaction_updated', array($this, 'on_thread_reaction_updated'), 10, 4);
        // Thread reaction handler registration completed

        // スレッドサマリー更新処理用の定期実行（メソッド存在確認付き）
        if (method_exists($this, 'schedule_summary_flush')) {
            add_action('wp_loaded', array($this, 'schedule_summary_flush'));
        }
        add_action('lms_thread_summary_flush', array($this, 'process_thread_summary_updates'));

        // 定期クリーンアップ
        add_action('lms_unified_longpoll_cleanup', array($this, 'cleanup_expired_events'));
        if (!wp_next_scheduled('lms_unified_longpoll_cleanup')) {
            wp_schedule_event(time(), 'hourly', 'lms_unified_longpoll_cleanup');
        }

        // データベーステーブルの作成
        $this->create_events_table();

        // 既存ショートポーリングシステムの無効化
        // add_action('wp_enqueue_scripts', array($this, 'disable_short_polling'), 1);
    }

    /**
     * 統合ロングポーリングを無効化
     */
    private function disable_unified_longpoll()
    {
        // Ajax エンドポイントを無効化
        remove_action('wp_ajax_lms_unified_long_poll', array($this, 'handle_longpoll_request'));
        remove_action('wp_ajax_nopriv_lms_unified_long_poll', array($this, 'handle_longpoll_request'));

        // イベントフックを無効化
        remove_action('lms_chat_message_created', array($this, 'on_message_created'), 10);
        remove_action('lms_chat_message_deleted', array($this, 'on_message_deleted'), 10);
        remove_action('lms_chat_thread_message_sent', array($this, 'on_thread_message_created'), 10);
        remove_action('lms_chat_thread_message_deleted', array($this, 'on_thread_message_deleted'), 10);
        remove_action('lms_reaction_updated', array($this, 'on_reaction_updated'), 10);
        remove_action('lms_thread_reaction_updated', array($this, 'on_thread_reaction_updated'), 10);

        // JavaScriptの読み込みを停止
        add_action('wp_enqueue_scripts', array($this, 'dequeue_unified_scripts'), 999);
    }

    /**
     * 統合ロングポーリングのJavaScriptを停止
     */
    public function dequeue_unified_scripts()
    {
        wp_dequeue_script('lms-unified-longpoll');
        wp_deregister_script('lms-unified-longpoll');
        wp_dequeue_script('lms-longpoll-integration-hub');
        wp_deregister_script('lms-longpoll-integration-hub');
    }

    /**
     * 設定の読み込み
     */
    private function load_config()
    {
        $this->config = array_merge($this->config, [
            'max_connections_per_user' => get_option('lms_longpoll_max_connections', 3),
            'default_timeout' => get_option('lms_longpoll_timeout', 30),
            'batch_size' => get_option('lms_longpoll_batch_size', 50),
            'enable_circuit_breaker' => get_option('lms_longpoll_circuit_breaker', true),
            'rollout_percentage' => 100, // 完全移行のため常に100%
        ]);
    }

    /**
     * 統合イベントテーブルの作成
     */
    public function create_events_table()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::EVENTS_TABLE;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            event_type VARCHAR(50) NOT NULL,
            priority TINYINT(1) UNSIGNED NOT NULL DEFAULT 2,
            channel_id BIGINT(20) UNSIGNED NOT NULL,
            message_id BIGINT(20) UNSIGNED NULL,
            thread_id BIGINT(20) UNSIGNED NULL,
            user_id BIGINT(20) UNSIGNED NOT NULL,
            data LONGTEXT NULL,
            timestamp BIGINT(20) UNSIGNED NOT NULL,
            expires_at BIGINT(20) UNSIGNED NOT NULL,
            processed_by TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_realtime_priority (priority, timestamp, channel_id),
            KEY idx_realtime_channel (channel_id, timestamp),
            KEY idx_realtime_expires (expires_at),
            KEY idx_realtime_user (user_id, timestamp),
            KEY idx_realtime_event_type (event_type, timestamp),
            KEY idx_realtime_message (message_id, event_type)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        // インデックスの最適化確認
        $this->optimize_table_indexes($table_name);
    }

    /**
     * テーブルインデックスの最適化
     */
    private function optimize_table_indexes($table_name)
    {
        global $wpdb;
        
        // 既存インデックスの確認
        $indexes = $wpdb->get_results("SHOW INDEX FROM $table_name");
        $existing_indexes = array_column($indexes, 'Key_name');
        
        // 必要なインデックスが存在しない場合は作成
        $required_indexes = [
            'idx_realtime_priority' => 'ADD INDEX idx_realtime_priority (priority, timestamp, channel_id)',
            'idx_realtime_channel' => 'ADD INDEX idx_realtime_channel (channel_id, timestamp)',
            'idx_realtime_expires' => 'ADD INDEX idx_realtime_expires (expires_at)',
            'idx_realtime_user' => 'ADD INDEX idx_realtime_user (user_id, timestamp)',
            'idx_realtime_event_type' => 'ADD INDEX idx_realtime_event_type (event_type, timestamp)',
            'idx_realtime_message' => 'ADD INDEX idx_realtime_message (message_id, event_type)'
        ];
        
        foreach ($required_indexes as $index_name => $index_sql) {
            if (!in_array($index_name, $existing_indexes)) {
                $wpdb->query("ALTER TABLE $table_name $index_sql");
            }
        }
    }

    /**
     * 既存ショートポーリングシステムの無効化と統合システムの読み込み
     */
    public function disable_short_polling()
    {
        // 統合ロングポーリングが有効な場合、古いsetIntervalを無効化
        if (lms_is_user_logged_in()) {
            // ⚠️ セッションを確実に開始してからユーザーIDを取得
            if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
                session_start();
            }
            $current_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

            // 統合ロングポーリングクライアントの読み込み
            wp_enqueue_script(
                'lms-unified-longpoll',
                get_template_directory_uri() . '/js/lms-unified-longpoll.js',
                array('jquery'),
                filemtime(get_template_directory() . '/js/lms-unified-longpoll.js'),
                true
            );

            // 統合ハブ（既存UIとの連携）の読み込み
            wp_enqueue_script(
                'lms-longpoll-integration-hub',
                get_template_directory_uri() . '/js/lms-longpoll-integration-hub.js',
                array('jquery', 'lms-unified-longpoll'),
                filemtime(get_template_directory() . '/js/lms-longpoll-integration-hub.js'),
                true
            );

            // 設定データの出力
            wp_localize_script('lms-unified-longpoll', 'lmsLongPollConfig', array(
                'enabled' => true, // 統合Long Polling有効化
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('lms_unified_longpoll'),
                'userId' => $current_user_id,
                'timeout' => 30000,
                'reconnectDelay' => 1000,
                'maxConnections' => 3,
                'debugMode' => defined('WP_DEBUG') && WP_DEBUG,
                'features' => array(
                    'longpoll_enabled' => true,
                    'fallback_enabled' => true,
                    'circuit_breaker' => true,
                    'integration_hub' => true,
                    'debug_monitor' => true
                )
            ));

            wp_add_inline_script('lms-unified-longpoll', '
                (function($) {
                    // 既存のsetIntervalを無効化
                    const originalSetInterval = window.setInterval;
                    const disabledIntervals = new Set();
                    
                    window.setInterval = function(callback, delay, ...args) {
                        if (delay === 6000 || delay === 3000) {
                            const fakeId = Math.random();
                            disabledIntervals.add(fakeId);
                            return fakeId;
                        }
                        return originalSetInterval.call(this, callback, delay, ...args);
                    };
                    
                    // すべてのclearIntervalも記録
                    const originalClearInterval = window.clearInterval;
                    window.clearInterval = function(intervalId) {
                        if (disabledIntervals.has(intervalId)) {
                            disabledIntervals.delete(intervalId);
                            return; // 偽のIDは何もしない
                        }
                        return originalClearInterval.call(this, intervalId);
                    };

                    // 統合システムの初期化確認
                    $(document).ready(function() {
                        
                        // デバッグモニターにシステム開始ログ
                        setTimeout(function() {
                            if (window.longPollDebugMonitor) {
                                window.longPollDebugMonitor.logEvent("SYSTEM", "Long Poll system initialization started", "info");
                            }
                        }, 100);
                        
                        // 統合ハブの初期化状況を監視
                        let initCheckCount = 0;
                        const maxChecks = 50; // 5秒間監視
                        
                        const checkInitialization = setInterval(function() {
                            initCheckCount++;
                            
                            if (window.lmsLongPollIntegrationHub && window.unifiedLongPoll) {
                                clearInterval(checkInitialization);
                                
                                // デバッグモニターに成功ログ
                                if (window.longPollDebugMonitor) {
                                    window.longPollDebugMonitor.logEvent("SYSTEM", 
                                        "Full system initialization completed successfully", "success");
                                }
                                
                            } else if (initCheckCount >= maxChecks) {
                                clearInterval(checkInitialization);
                                
                                // デバッグモニターに警告ログ
                                if (window.longPollDebugMonitor) {
                                    window.longPollDebugMonitor.logEvent("SYSTEM", 
                                        "System initialization timeout - partial functionality", "warning");
                                }
                            }
                        }, 100);
                    });
                })(jQuery);
            ', 'after');
        }
    }

    /**
     * 統合ロングポーリングメインハンドラー
     */
    public function handle_unified_long_poll()
    {
        try {
            // デバッグ: エラー報告を有効化
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_reporting(E_ALL);
                ini_set('display_errors', 0);
                ini_set('log_errors', 1);
            }

            $start_time = microtime(true);
            $this->stats['active_connections']++;

            // セキュリティチェック
            if (!$this->verify_security()) {
                return;
            }

            // パラメータ取得
            $params = $this->get_request_params();
            if (!$params) {
                return;
            }
            
            // 接続数制限チェック
            if (!$this->check_connection_limit($params['user_id'])) {
                wp_send_json_error([
                    'message' => '接続数上限に達しました',
                    'code' => 'connection_limit_exceeded'
                ]);
                return;
            }
            
            // イベント監視開始（統合ロングポーリングは常に有効）
            $events = $this->poll_for_unified_events(
                $params['channel_id'],
                $params['thread_id'],
                $params['last_event_id'],
                $params['timeout'],
                $params['user_id'],
                $params['event_types']
            );
            
            // レスポンス送信
            $response_time = microtime(true) - $start_time;
            $this->update_stats($response_time, count($events));
            
            // レスポンス送信
            // 注: Long Pollingレスポンスの圧縮は、サーバー側のHTTP gzip圧縮を使用することを推奨
            // WordPressは自動的にgzip圧縮を有効にするため、ここでは追加の圧縮は不要
            wp_send_json_success([
                'events' => $events,
                'timestamp' => time(),
                'latency' => round($response_time * 1000),
                'stats' => $this->get_connection_stats(),
                'system' => 'unified_longpoll'
            ]);
            
        } catch (Exception $e) {
            $this->stats['error_count']++;

            // デバッグモードでは詳細なエラー情報を返す
            $error_data = [
                'message' => 'システムエラーが発生しました',
                'code' => 'system_error'
            ];

            if (defined('WP_DEBUG') && WP_DEBUG) {
                $error_data['debug'] = [
                    'error_message' => $e->getMessage(),
                    'error_file' => $e->getFile(),
                    'error_line' => $e->getLine(),
                    'trace' => $e->getTraceAsString()
                ];
            }

            wp_send_json_error($error_data);
        } finally {
            $this->stats['active_connections']--;
        }
    }

    /**
     * セキュリティ検証
     */
    private function verify_security()
    {
        $nonce = $_POST['nonce'] ?? $_GET['nonce'] ?? '';
        $nonce_action = $_POST['nonce_action'] ?? $_GET['nonce_action'] ?? '';

        // 複数のnonce検証パターンを試す
        $verify_result = false;

        // まず送信されたnonce_actionで検証
        if (!empty($nonce_action)) {
            $verify_result = wp_verify_nonce($nonce, $nonce_action);
        }

        // 失敗した場合は標準のアクションで試す
        if (!$verify_result) {
            $verify_result = wp_verify_nonce($nonce, 'lms_unified_longpoll');
        }

        // それでも失敗した場合はlms_ajax_nonceで試す
        if (!$verify_result) {
            $verify_result = wp_verify_nonce($nonce, 'lms_ajax_nonce');
        }

        if (!$verify_result) {
            // デバッグ情報を追加
            wp_send_json_error([
                'message' => 'セキュリティチェックに失敗しました',
                'code' => 'invalid_nonce',
                'debug' => [
                    'nonce' => $nonce,
                    'nonce_action' => $nonce_action,
                    'expected_actions' => ['lms_ajax_nonce', 'lms_unified_longpoll'],
                    'post_data' => $_POST,
                    'get_data' => $_GET
                ]
            ]);
            return false;
        }

        // LMS独自ユーザー認証システムを使用（セッションヘルパー経由）
        if (function_exists('acquireSession')) {
            $sessionData = acquireSession();
        } else {
            // フォールバック: セッション直接開始
            if (session_status() == PHP_SESSION_NONE) {
                session_start();
            }
            $sessionData = $_SESSION;
        }
        $user_id = $sessionData['lms_user_id'] ?? 0;

        if (!$user_id) {
            wp_send_json_error([
                'message' => 'ログインが必要です',
                'code' => 'not_authenticated'
            ]);
            return false;
        }
        
        // レート制限チェック（デバッグ用に一時的に無効化）
        if (false && !$this->check_rate_limit($user_id)) {
            wp_send_json_error([
                'message' => 'リクエスト制限に達しました',
                'code' => 'rate_limit_exceeded'
            ]);
            return false;
        }
        
        return true;
    }

    /**
     * リクエストパラメータの取得と検証
     */
    private function get_request_params()
    {
        $channel_id = intval($_POST['channel_id'] ?? $_GET['channel_id'] ?? 0);
        $thread_id = intval($_POST['thread_id'] ?? $_GET['thread_id'] ?? 0);
        $last_event_id = intval($_POST['last_event_id'] ?? $_GET['last_event_id'] ?? 0);
        $last_timestamp = intval($_POST['last_timestamp'] ?? $_GET['last_timestamp'] ?? 0);
        $timeout = min(intval($_POST['timeout'] ?? $this->config['default_timeout']), $this->config['default_timeout']);
        // LMS独自ユーザー認証システムを使用（セッションヘルパー経由）
        if (function_exists('acquireSession')) {
            $sessionData = acquireSession();
        } else {
            // フォールバック: セッション直接開始
            if (session_status() == PHP_SESSION_NONE) {
                session_start();
            }
            $sessionData = $_SESSION;
        }
        $user_id = $sessionData['lms_user_id'] ?? 0;
        $event_types = $_POST['event_types'] ?? $_GET['event_types'] ?? 'all';
        
        if (!$channel_id || !$user_id) {
            wp_send_json_error([
                'message' => '必要なパラメータが不足しています',
                'code' => 'invalid_parameters'
            ]);
            return false;
        }
        
        // チャンネルアクセス権限チェック
        if (!$this->can_access_channel($user_id, $channel_id)) {
            wp_send_json_error([
                'message' => 'このチャンネルにアクセスする権限がありません',
                'code' => 'access_denied'
            ]);
            return false;
        }
        
        return [
            'channel_id' => $channel_id,
            'thread_id' => $thread_id,
            'last_timestamp' => $last_timestamp,
            'last_event_id' => $last_event_id,
            'timeout' => $timeout,
            'user_id' => $user_id,
            'event_types' => $this->parse_event_types($event_types)
        ];
    }

    /**
     * イベントタイプの解析
     */
    private function parse_event_types($event_types)
    {
        if ($event_types === 'all') {
            return [
                self::EVENT_MESSAGE_CREATE,
                self::EVENT_MESSAGE_DELETE,
                self::EVENT_REACTION_UPDATE,
                self::EVENT_THREAD_CREATE,
                self::EVENT_THREAD_DELETE,
                self::EVENT_THREAD_REACTION,
                self::EVENT_THREAD_REACTION_UPDATE,
                self::EVENT_THREAD_SUMMARY_UPDATE
            ];
        }
        
        if (is_string($event_types)) {
            return explode(',', $event_types);
        }
        
        return is_array($event_types) ? $event_types : [];
    }

    /**
     * 接続数制限チェック
     */
    private function check_connection_limit($user_id)
    {
        // 現在のアクティブ接続数を確認
        $current_connections = $this->get_user_active_connections($user_id);
        return $current_connections < $this->config['max_connections_per_user'];
    }

    /**
     * ユーザーのアクティブ接続数取得
     */
    private function get_user_active_connections($user_id)
    {
        $connections = get_transient("lms_longpoll_connections_$user_id") ?: 0;
        return $connections;
    }

    /**
     * 接続数の更新
     */
    private function update_user_connections($user_id, $increment = true)
    {
        $current = get_transient("lms_longpoll_connections_$user_id") ?: 0;
        $new_count = $increment ? $current + 1 : max(0, $current - 1);
        set_transient("lms_longpoll_connections_$user_id", $new_count, 300); // 5分間
        return $new_count;
    }

    /**
     * 統合イベント監視
     */
    private function poll_for_unified_events($channel_id, $thread_id, $last_event_id, $timeout, $user_id, $event_types)
    {
        $start_time = microtime(true);
        $this->update_user_connections($user_id, true);
        
        // デバッグ: タイムアウトを短く設定
        $debug_timeout = min($timeout, 5); // 最大5秒（高速サイクル実現、数秒以内の同期）
        
        try {
            // 初回チェック
            $events = $this->check_for_unified_events($channel_id, $thread_id, $last_event_id, $user_id, $event_types);
            
            if (!empty($events)) {
                return $events;
            }
            
            // ロングポーリング開始
            $poll_end_time = $start_time + $debug_timeout;
            
            set_time_limit($debug_timeout + 5);
            ignore_user_abort(true);
            
            // Long Pollingループ復活（同期問題修正）
            while (microtime(true) < $poll_end_time) {
                // 定期的なクリーンアップ（5%の確率）
                if (wp_rand(1, 100) <= 5) {
                    $this->cleanup_expired_events();
                }
                
                usleep(self::POLL_INTERVAL);
                
                $events = $this->check_for_unified_events($channel_id, $thread_id, $last_event_id, $user_id, $event_types);
                
                if (!empty($events)) {
                    break;
                }
                
                // 接続断チェック
                if (connection_aborted()) {
                    break;
                }
            }
            return $events;
        } finally {
            $this->update_user_connections($user_id, false);
        }
    }

    /**
     * 統合イベントチェック
     */
    private function check_for_unified_events($channel_id, $thread_id, $last_event_id, $user_id, $event_types)
    {
        global $wpdb;
        
        $events_table = $wpdb->prefix . self::EVENTS_TABLE;
        $events = [];
        
        try {
            
            // 基本WHERE条件
            $where_conditions = [
                'channel_id = %d',
                'id > %d',
                'expires_at > %d'
            ];
            $where_params = [$channel_id, $last_event_id, time()];
            
            // イベントタイプフィルタ
            if (!empty($event_types)) {
                $placeholders = implode(',', array_fill(0, count($event_types), '%s'));
                $where_conditions[] = "event_type IN ($placeholders)";
                $where_params = array_merge($where_params, $event_types);
            }
            
            // スレッド条件
            if ($thread_id > 0) {
                $where_conditions[] = 'thread_id = %d';
                $where_params[] = $thread_id;
            }
            
            $where_clause = implode(' AND ', $where_conditions);
            
            $query = $wpdb->prepare(
                "SELECT * FROM $events_table 
                WHERE $where_clause 
                ORDER BY priority ASC, timestamp ASC 
                LIMIT %d",
                array_merge($where_params, [$this->config['batch_size']])
            );
            
            $results = $wpdb->get_results($query, ARRAY_A);
            
            foreach ($results as $row) {
                $events[] = [
                    'id' => $row['id'],
                    'type' => $row['event_type'],
                    'priority' => $row['priority'],
                    'message_id' => $row['message_id'],
                    'thread_id' => $row['thread_id'],
                    'channel_id' => $row['channel_id'],    // 🔥 修正: 欠損していたchannel_id復旧
                    'user_id' => $row['user_id'],          // 🔥 修正: 欠損していたuser_id復旧  
                    'data' => json_decode($row['data'], true),
                    'timestamp' => $row['timestamp']
                ];
            }
            
            // 処理済みマーク
            if (!empty($events)) {
                $this->mark_events_as_processed($events, $user_id);
            }
            
            return $events;
            
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * イベントを処理済みとしてマーク
     */
    private function mark_events_as_processed($events, $user_id)
    {
        global $wpdb;
        
        $events_table = $wpdb->prefix . self::EVENTS_TABLE;
        $event_ids = array_column($events, 'id');
        
        if (empty($event_ids)) {
            return;
        }
        
        $placeholders = implode(',', array_fill(0, count($event_ids), '%d'));
        
        $wpdb->query($wpdb->prepare(
            "UPDATE $events_table 
            SET processed_by = CONCAT(COALESCE(processed_by, ''), %s) 
            WHERE id IN ($placeholders)",
            array_merge(["$user_id,"], $event_ids)
        ));
    }

    /**
     * メッセージ作成イベントハンドラー
     */
    public function on_message_created($message_id, $channel_id, $user_id, $message_data = null)
    {
        // メッセージデータが提供されていない場合は基本データのみ
        $event_data = [
            'message_id' => $message_id,
            'action' => 'created'
        ];

        // 🔥 修正: 完全なデータ取得済みフラグ
        $data_is_complete = false;

        // 🔥 修正: メッセージデータの詳細チェックと柔軟な処理
        if ($message_data && is_array($message_data)) {
            // デバッグログ
            error_log('[LMS_Unified_LongPoll] on_message_created - message_data: ' . print_r($message_data, true));
            
            // メッセージ内容とユーザー名が存在する場合のみ使用
            $has_message = !empty($message_data['message']) || !empty($message_data['content']);
            $has_user_name = !empty($message_data['user_name']) || !empty($message_data['display_name']);
            
            error_log('[LMS_Unified_LongPoll] has_message: ' . ($has_message ? 'true' : 'false') . ', has_user_name: ' . ($has_user_name ? 'true' : 'false'));
            
            if ($has_message && $has_user_name) {
                $event_data = array_merge($event_data, [
                    'user_name' => $message_data['user_name'] ?? $message_data['display_name'],
                    'display_name' => $message_data['user_name'] ?? $message_data['display_name'],
                    'message' => $message_data['message'] ?? $message_data['content'],
                    'content' => $message_data['message'] ?? $message_data['content'],
                    'created_at' => $message_data['created_at'] ?? date('Y-m-d H:i:s'),
                    'timestamp' => $message_data['created_at'] ?? date('Y-m-d H:i:s'),
                    'avatar_url' => $message_data['avatar_url'] ?? null,
                    'attachments' => $message_data['attachments'] ?? []
                ]);
                
                // 🔥 修正: 完全なデータ取得済みフラグをセット
                $data_is_complete = true;
                error_log('[LMS_Unified_LongPoll] 完全なデータ取得済み - DB取得とフォールバックをスキップ');
            } else {
                error_log('[LMS_Unified_LongPoll] メッセージデータが不完全 - DB取得に切り替え');
                $message_data = null; // Force DB lookup
            }
        }
        
        // 🔥 修正: データが不完全な場合のみDB取得とフォールバック処理
        if (!$data_is_complete) {
            // message_dataが不完全、またはnullの場合はDBから取得
            if (!$message_data) {
                global $wpdb;
                error_log('[LMS_Unified_LongPoll] DBからメッセージ取得 - message_id: ' . $message_id);

                // 🔥 修正: LMS独自ユーザーテーブルと結合（WordPressユーザーではなく）
                $message_details = $wpdb->get_row($wpdb->prepare(
                    "SELECT m.*, u.display_name as user_name, u.username
                     FROM {$wpdb->prefix}lms_chat_messages m
                     LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
                     WHERE m.id = %d",
                    $message_id
                ), ARRAY_A);
            } else {
                // message_dataが存在する場合は、それをそのまま使用
                $message_details = null;
            }

            if ($message_details) {
                // 🔥 修正: ユーザー名を確実に取得して設定
                $user_name = $message_details['user_name'] ?? $message_details['display_name'] ?? 'ユーザー' . $user_id;
                
                // 添付ファイルを取得
                $attachments_results = $wpdb->get_results($wpdb->prepare(
                    "SELECT id, file_name, file_path, file_size, mime_type, thumbnail_path
                     FROM {$wpdb->prefix}lms_chat_attachments 
                     WHERE message_id = %d
                     ORDER BY created_at ASC",
                    $message_id
                ), ARRAY_A);
                
                $attachments = [];
                if ($attachments_results) {
                    $base_url = site_url('wp-content/chat-files-uploads');
                    $upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
                    foreach ($attachments_results as $attachment) {
                        // ファイルの存在確認
                        $file_path = $upload_base_dir . '/' . $attachment['file_path'];
                        if (!file_exists($file_path)) {
                            // ファイルが存在しない場合はスキップ
                            continue;
                        }

                        // サムネイルの存在確認
                        $thumbnail_url = null;
                        if (!empty($attachment['thumbnail_path'])) {
                            $thumb_path = $upload_base_dir . '/' . $attachment['thumbnail_path'];
                            if (file_exists($thumb_path)) {
                                $thumbnail_url = $base_url . '/' . $attachment['thumbnail_path'];
                            }
                        }

                        $attachments[] = [
                            'id' => $attachment['id'],
                            'name' => $attachment['file_name'],
                            'file_name' => $attachment['file_name'],
                            'url' => $base_url . '/' . $attachment['file_path'],
                            'file_path' => $attachment['file_path'],
                            'type' => $attachment['mime_type'],
                            'mime_type' => $attachment['mime_type'],
                            'size' => $attachment['file_size'],
                            'file_size' => $attachment['file_size'],
                            'thumbnail' => $thumbnail_url
                        ];
                    }
                }
                
                $event_data = array_merge($event_data, [
                    'user_name' => $user_name,
                    'display_name' => $user_name,        // 🔥 追加: フロントエンド互換性
                    'message' => $message_details['message'] ?? '',
                    'content' => $message_details['message'] ?? '',
                    'created_at' => $message_details['created_at'] ?? date('Y-m-d H:i:s'),
                    'timestamp' => $message_details['created_at'] ?? date('Y-m-d H:i:s'),
                    'attachments' => $attachments
                ]);
            } else {
                // 🔥 追加: DB取得失敗時のフォールバック
                // Debug logging removed
                
                // 最低限のデータを設定
                $event_data = array_merge($event_data, [
                    'user_name' => 'ユーザー' . $user_id,
                    'display_name' => 'ユーザー' . $user_id,
                    'message' => 'メッセージ (ID: ' . $message_id . ')',
                    'content' => 'メッセージ (ID: ' . $message_id . ')',
                    'created_at' => date('Y-m-d H:i:s'),
                    'timestamp' => date('Y-m-d H:i:s')
                ]);
            }
        }

        $this->add_event([
            'event_type' => self::EVENT_MESSAGE_CREATE,
            'priority' => self::PRIORITY_CRITICAL,
            'channel_id' => $channel_id,
            'message_id' => $message_id,
            'user_id' => $user_id,
            'data' => $event_data
        ]);
    }

    /**
     * メッセージ削除イベントハンドラー
     */
    public function on_message_deleted($message_id, $channel_id)
    {
        $this->add_event([
            'event_type' => self::EVENT_MESSAGE_DELETE,
            'priority' => self::PRIORITY_CRITICAL,
            'channel_id' => $channel_id,
            'message_id' => $message_id,
            'user_id' => lms_get_current_user_id(),
            'data' => [
                'message_id' => $message_id,
                'action' => 'deleted'
            ]
        ]);
    }

    /**
     * 日付セパレーター削除イベントハンドラー
     */
    public function on_date_separator_deleted($channel_id, $date)
    {
        $this->add_event([
            'event_type' => self::EVENT_DATE_SEPARATOR_DELETE,
            'priority' => self::PRIORITY_CRITICAL,
            'channel_id' => $channel_id,
            'message_id' => null,
            'user_id' => lms_get_current_user_id(),
            'data' => [
                'date' => $date,
                'action' => 'date_separator_deleted'
            ]
        ]);
    }

    /**
     * スレッドメッセージ作成イベントハンドラー
     */
    public function on_thread_message_created($message_id, $thread_id, $channel_id, $user_id)
    {
        
        // 🔧 修正: スレッドメッセージの詳細データを取得してJavaScript側に送信
        global $wpdb;
        
        // スレッドメッセージの詳細を取得
        $message_details = $wpdb->get_row($wpdb->prepare(
            "SELECT t.*, u.display_name, u.avatar_url 
             FROM {$wpdb->prefix}lms_chat_thread_messages t
             LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
             WHERE t.id = %d",
            $message_id
        ), ARRAY_A);
        
        // デフォルトデータ
        $event_data = [
            'id' => $message_id,
            'message_id' => $message_id,
            'thread_id' => $thread_id,
            'action' => 'thread_created',
            'user_id' => $user_id
        ];
        
        // 詳細データが取得できた場合は追加
        if ($message_details) {
            $event_data = array_merge($event_data, [
                'message' => $message_details['message'] ?? '',
                'content' => $message_details['message'] ?? '',
                'user_name' => $message_details['display_name'] ?? "ユーザー{$user_id}",
                'display_name' => $message_details['display_name'] ?? "ユーザー{$user_id}",
                'created_at' => $message_details['created_at'] ?? date('Y-m-d H:i:s'),
                'avatar_url' => $message_details['avatar_url'] ?? null,
                'parent_message_id' => $message_details['parent_message_id'] ?? $thread_id
            ]);
        }
        
        $this->add_event([
            'event_type' => self::EVENT_THREAD_CREATE,
            'priority' => self::PRIORITY_CRITICAL,
            'channel_id' => $channel_id,
            'message_id' => $message_id,
            'thread_id' => $thread_id,
            'user_id' => $user_id,
            'data' => $event_data
        ]);

        // スレッドサマリー更新をキューに追加
        $this->queue_thread_summary_update($thread_id, $channel_id);
    }

    /**
     * スレッドメッセージ削除イベントハンドラー
     */
    public function on_thread_message_deleted($message_id, $thread_id, $channel_id)
    {

        // 🔧 修正: スレッドメッセージ削除の詳細データをJavaScript側に送信
        $current_user_id = lms_get_current_user_id();
        
        $this->add_event([
            'event_type' => self::EVENT_THREAD_DELETE,
            'priority' => self::PRIORITY_CRITICAL,
            'channel_id' => $channel_id,
            'message_id' => $message_id,
            'thread_id' => $thread_id,
            'user_id' => $current_user_id,
            'data' => [
                'id' => $message_id,
                'message_id' => $message_id,
                'thread_id' => $thread_id,
                'parent_message_id' => $thread_id,
                'action' => 'thread_deleted',
                'user_id' => $current_user_id
            ]
        ]);

        // スレッドサマリー更新をキューに追加
        $this->queue_thread_summary_update($thread_id, $channel_id);
    }

    /**
     * リアクション更新イベントハンドラー
     */
    public function on_reaction_updated($message_id, $channel_id, $reactions, $user_id)
    {
        $this->add_event([
            'event_type' => self::EVENT_REACTION_UPDATE,
            'priority' => self::PRIORITY_HIGH,
            'channel_id' => $channel_id,
            'message_id' => $message_id,
            'user_id' => $user_id,
            'data' => [
                'reactions' => $reactions,
                'message_id' => $message_id
            ]
        ]);
    }

    /**
     * スレッドリアクション更新イベントハンドラー
     */
    public function on_thread_reaction_updated($message_id, $channel_id, $thread_id, $reactions)
    {
        $event_time = time();

        $this->add_event([
            'event_type' => self::EVENT_THREAD_REACTION,
            'priority' => self::PRIORITY_HIGH,
            'channel_id' => $channel_id,
            'message_id' => $message_id,
            'thread_id' => $thread_id,
            'user_id' => lms_get_current_user_id(),
            'data' => [
                'reactions' => $reactions,
                'message_id' => $message_id,
                'thread_id' => $thread_id,
                'channel_id' => $channel_id,
                'timestamp' => $event_time
            ]
        ]);
    }

    /**
     * スレッドサマリー更新をキューに追加
     */
    private function queue_thread_summary_update($thread_id, $channel_id)
    {
        if (!$this->thread_summary_cache || !$thread_id) {
            return;
        }

        // スレッドサマリー更新をキューに追加
        $this->thread_summary_cache->queue_summary_update($thread_id, $channel_id);
    }

    /**
     * サマリーフラッシュのスケジュール設定
     */
    public function schedule_summary_flush()
    {
        // 既にスケジュールされていない場合のみ設定
        if (!wp_next_scheduled('lms_thread_summary_flush')) {
            wp_schedule_single_event(
                time() + $this->config['summary_flush_delay'], 
                'lms_thread_summary_flush'
            );
        }
    }

    /**
     * スレッドサマリー更新処理とイベント配信
     */
    public function process_thread_summary_updates()
    {
        if (!$this->thread_summary_cache) {
            return;
        }

        try {
            // キューからサマリー更新を取得して処理
            $summary_keys = get_transient('lms_thread_summary_queue') ?: [];
            
            if (empty($summary_keys)) {
                return;
            }

            // キューをクリア（処理中の重複防止）
            delete_transient('lms_thread_summary_queue');

            // バッチ処理でサマリー更新
            $batch_size = $this->config['summary_batch_size'];
            $processed = 0;
            
            foreach (array_chunk($summary_keys, $batch_size) as $batch) {
                $summaries = [];
                
                foreach ($batch as $key) {
                    list($thread_id, $channel_id) = explode(':', $key);
                    $thread_id = intval($thread_id);
                    $channel_id = intval($channel_id);
                    
                    if ($thread_id && $channel_id) {
                        $summary = $this->thread_summary_cache->get_summary($thread_id, $channel_id);
                        if ($summary) {
                            $summaries[] = [
                                'thread_id' => $thread_id,
                                'channel_id' => $channel_id,
                                'summary' => $summary
                            ];
                        }
                    }
                }

                // サマリー更新イベントをブロードキャスト
                foreach ($summaries as $summary_data) {
                    $this->add_event([
                        'event_type' => self::EVENT_THREAD_SUMMARY_UPDATE,
                        'priority' => self::PRIORITY_NORMAL,
                        'channel_id' => $summary_data['channel_id'],
                        'thread_id' => $summary_data['thread_id'],
                        'user_id' => 0, // システムイベント
                        'data' => [
                            'thread_id' => $summary_data['thread_id'],
                            'summary' => $summary_data['summary'],
                            'action' => 'summary_updated'
                        ]
                    ]);
                }
                
                $processed += count($summaries);
                
                // CPU負荷軽減のための小さな待機
                if ($processed < count($summary_keys)) {
                    usleep(50000); // 50ms
                }
            }

        } catch (Exception $e) {
            if (defined('WP_DEBUG') && WP_DEBUG) {
            }
        }
    }

    /**
     * イベントの追加
     */
    public function add_event($event_data)
    {
        global $wpdb;
        
        $events_table = $wpdb->prefix . self::EVENTS_TABLE;
        $current_time = time();
        
        $event = array_merge([
            'priority' => self::PRIORITY_NORMAL,
            'thread_id' => null,
            'data' => null,
            'timestamp' => $current_time,
            'expires_at' => $current_time + $this->config['event_expiry']
        ], $event_data);
        
        if (!empty($event['data']) && is_array($event['data'])) {
            $event['data'] = json_encode($event['data']);
        }
        
        $result = $wpdb->insert($events_table, $event);
        
        
        return $result !== false;
    }

    /**
     * 期限切れイベントのクリーンアップ
     */
    public function cleanup_expired_events()
    {
        global $wpdb;
        
        $events_table = $wpdb->prefix . self::EVENTS_TABLE;
        $current_time = time();
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM $events_table WHERE expires_at < %d",
            $current_time
        ));
        
        
        // テーブル最適化（週1回）
        if (wp_rand(1, 168) === 1) { // 1/168 = 週1回の確率
            $wpdb->query("OPTIMIZE TABLE $events_table");
        }
    }

    /**
     * 統計情報の更新
     */
    private function update_stats($response_time, $event_count)
    {
        $this->stats['total_events_processed'] += $event_count;
        
        // 移動平均でレスポンス時間を更新
        $alpha = 0.1; // 平滑化係数
        $this->stats['avg_response_time'] = 
            $alpha * $response_time + (1 - $alpha) * $this->stats['avg_response_time'];
    }

    /**
     * 接続統計の取得
     */
    public function get_connection_stats()
    {
        return [
            'active_connections' => $this->stats['active_connections'],
            'avg_response_time' => round($this->stats['avg_response_time'] * 1000), // ミリ秒
            'total_events' => $this->stats['total_events_processed'],
            'error_rate' => $this->stats['error_count'] / max(1, $this->stats['total_events_processed'])
        ];
    }

    /**
     * レート制限チェック
     */
    private function check_rate_limit($user_id)
    {
        $key = "lms_longpoll_rate_limit_$user_id";
        $current_requests = get_transient($key) ?: 0;
        $max_requests = 200; // 1分間に200リクエスト（Long Polling用に大幅緩和）
        
        if ($current_requests >= $max_requests) {
            return false;
        }
        
        set_transient($key, $current_requests + 1, 60);
        return true;
    }

    /**
     * チャンネルアクセス権限チェック
     */
    private function can_access_channel($user_id, $channel_id)
    {
        if (!$user_id || !$channel_id) {
            return false;
        }

        global $wpdb;

        // LMSユーザーのチャンネルメンバーシップをチェック
        $table_name = $wpdb->prefix . 'lms_chat_channel_members';
        $membership = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table_name} WHERE user_id = %d AND channel_id = %d",
            $user_id,
            $channel_id
        ));

        // メンバーシップが存在する場合はアクセス許可
        return !empty($membership);
    }

    /**
     * 設定更新ハンドラー
     */
    public function handle_config_update()
    {
        if (!lms_current_user_can('manage_options')) {
            wp_send_json_error('権限が不足しています');
            return;
        }
        
        $config = $_POST['config'] ?? [];
        
        foreach ($config as $key => $value) {
            if (array_key_exists($key, $this->config)) {
                update_option("lms_longpoll_$key", $value);
            }
        }
        
        $this->load_config();
        
        wp_send_json_success([
            'message' => '設定を更新しました',
            'config' => $this->config
        ]);
    }
}

// インスタンス化
LMS_Unified_LongPoll::get_instance();
