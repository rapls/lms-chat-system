<?php
/**
 * LMS高機能キャッシュシステム統合
 * 
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once get_template_directory() . '/includes/class-lms-cache-database.php';

class LMS_Cache_Integration
{
    private static $instance = null;
    private $advanced_cache = null;
    
    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct()
    {
        $this->init_hooks();
        $this->init_advanced_cache();
        $this->register_wp_schedules();
    }
    
    /**
     * WordPressフック初期化
     */
    private function init_hooks()
    {
        add_action('init', [$this, 'init_cache_system']);
        add_action('wp_loaded', [$this, 'warm_essential_cache']);
        add_action('shutdown', [$this, 'finalize_cache_operations']);
        
        add_action('wp_ajax_lms_cache_stats', [$this, 'ajax_cache_stats']);
        add_action('wp_ajax_lms_cache_flush', [$this, 'ajax_cache_flush']);
        add_action('wp_ajax_lms_cache_health', [$this, 'ajax_cache_health']);
        
        add_action('lms_chat_message_created', [$this, 'invalidate_message_cache'], 10, 3);
        add_action('lms_chat_message_deleted', [$this, 'invalidate_message_cache'], 10, 3);
        add_action('lms_chat_thread_message_sent', [$this, 'invalidate_thread_cache'], 10, 1);
        add_action('lms_user_logged_in', [$this, 'prefetch_user_data'], 10, 1);
        add_action('lms_channel_switched', [$this, 'prefetch_channel_data'], 10, 2);
        
        add_filter('pre_transient_*', [$this, 'intercept_transient_get'], 10, 2);
        add_filter('pre_set_transient_*', [$this, 'intercept_transient_set'], 10, 3);
        add_filter('pre_delete_transient_*', [$this, 'intercept_transient_delete'], 10, 2);
    }
    
    /**
     * 高機能キャッシュ初期化
     */
    private function init_advanced_cache()
    {
        $this->advanced_cache = LMS_Advanced_Cache::get_instance();
    }
    
    /**
     * WordPressスケジュール登録
     */
    private function register_wp_schedules()
    {
        add_filter('cron_schedules', function($schedules) {
            $schedules['lms_cache_flush_interval'] = [
                'interval' => 30,
                'display' => __('Every 30 seconds')
            ];
            $schedules['five_minutes'] = [
                'interval' => 300,
                'display' => __('Every 5 minutes')
            ];
            return $schedules;
        });
        
        if (!wp_next_scheduled('lms_cache_cleanup')) {
            wp_schedule_event(time(), 'hourly', 'lms_cache_cleanup');
        }
        
        if (!wp_next_scheduled('lms_cache_stats_collection')) {
            wp_schedule_event(time(), 'five_minutes', 'lms_cache_stats_collection');
        }
        
        if (!wp_next_scheduled('lms_cache_optimization')) {
            wp_schedule_event(time(), 'daily', 'lms_cache_optimization');
        }
        
        add_action('lms_cache_cleanup', [$this->advanced_cache, 'cleanup_expired']);
        add_action('lms_cache_stats_collection', [$this->advanced_cache, 'collect_stats']);
        add_action('lms_cache_optimization', [$this, 'optimize_cache_system']);
    }
    
    /**
     * キャッシュシステム初期化
     */
    public function init_cache_system()
    {
        $this->adjust_cache_config();
        
        if (class_exists('LMS_Cache_Helper')) {
            $this->integrate_with_legacy_cache();
        }
    }
    
    /**
     * 重要なキャッシュの事前ウォーミング
     */
    public function warm_essential_cache()
    {
        if (!is_user_logged_in()) {
            return;
        }
        
        $user_id = get_current_user_id();
        
        $this->advanced_cache->prefetch([
            "user_profile_{$user_id}",
            "user_channels_{$user_id}",
            "user_settings_{$user_id}",
        ], [$this, 'prefetch_callback']);
        
        $this->advanced_cache->prefetch([
            'global_channels',
            'active_users',
            'system_config',
        ], [$this, 'prefetch_callback']);
    }
    
    /**
     * 先読みコールバック
     */
    public function prefetch_callback($key)
    {
        if (strpos($key, 'user_profile_') === 0) {
            $user_id = str_replace('user_profile_', '', $key);
            return $this->get_user_profile($user_id);
        }
        
        if (strpos($key, 'user_channels_') === 0) {
            $user_id = str_replace('user_channels_', '', $key);
            return $this->get_user_channels($user_id);
        }
        
        if ($key === 'global_channels') {
            return $this->get_global_channels();
        }
        
        if ($key === 'active_users') {
            return $this->get_active_users();
        }
        
        return null;
    }
    
    /**
     * キャッシュ無効化: メッセージ
     */
    public function invalidate_message_cache($message_id, $channel_id, $user_id)
    {
        $patterns = [
            "channel_messages_{$channel_id}_*",
            "user_messages_{$user_id}_*",
            "message_{$message_id}",
            "channel_info_{$channel_id}",
        ];
        
        foreach ($patterns as $pattern) {
            $this->advanced_cache->delete($pattern, ['pattern' => true]);
        }
    }
    
    /**
     * キャッシュ無効化: スレッド
     */
    public function invalidate_thread_cache($thread_data)
    {
        if (isset($thread_data->parent_message_id)) {
            $parent_id = $thread_data->parent_message_id;
            $patterns = [
                "thread_messages_{$parent_id}_*",
                "thread_info_{$parent_id}",
                "message_{$parent_id}",
            ];
            
            foreach ($patterns as $pattern) {
                $this->advanced_cache->delete($pattern, ['pattern' => true]);
            }
        }
    }
    
    /**
     * ユーザーデータ先読み
     */
    public function prefetch_user_data($user_id)
    {
        $keys = [
            "user_profile_{$user_id}",
            "user_channels_{$user_id}",
            "user_settings_{$user_id}",
            "user_unread_count_{$user_id}",
        ];
        
        $this->advanced_cache->prefetch($keys, [$this, 'prefetch_callback'], [
            'priority' => 'high',
            'type' => LMS_Advanced_Cache::TYPE_USER,
        ]);
    }
    
    /**
     * チャンネルデータ先読み
     */
    public function prefetch_channel_data($user_id, $channel_id)
    {
        $keys = [
            "channel_messages_{$channel_id}_page_1",
            "channel_members_{$channel_id}",
            "channel_info_{$channel_id}",
            "user_channel_position_{$user_id}_{$channel_id}",
        ];
        
        $this->advanced_cache->prefetch($keys, [$this, 'prefetch_callback'], [
            'priority' => 'high',
            'type' => LMS_Advanced_Cache::TYPE_PERSISTENT,
        ]);
    }
    
    /**
     * トランジェント API の横取り
     */
    public function intercept_transient_get($value, $transient)
    {
        $cache_key = "transient_{$transient}";
        $cached_value = $this->advanced_cache->get($cache_key);
        
        if ($cached_value !== null) {
            return $cached_value;
        }
        
        return $value; // WordPressの標準処理に戻る
    }
    
    public function intercept_transient_set($value, $transient, $expiration)
    {
        $cache_key = "transient_{$transient}";
        $ttl = $expiration ?: 3600;
        
        $this->advanced_cache->set($cache_key, $value, $ttl, [
            'type' => LMS_Advanced_Cache::TYPE_TEMPORARY,
            'compress' => true,
        ]);
        
        return $value;
    }
    
    public function intercept_transient_delete($value, $transient)
    {
        $cache_key = "transient_{$transient}";
        $this->advanced_cache->delete($cache_key);
        
        return $value;
    }
    
    /**
     * 管理画面メニュー追加
     */
    public function add_admin_menu()
    {
        add_management_page(
            'LMS キャッシュ',
            'LMS キャッシュ',
            'manage_options',
            'lms-cache',
            [$this, 'admin_page']
        );
    }
    
    /**
     * 管理画面ページ
     */
    public function admin_page()
    {
        $stats = $this->advanced_cache->get_stats();
        $health = $this->advanced_cache->health_check();
        
        ?>
        <div class="wrap">
            <h1>LMS高機能キャッシュシステム</h1>
            
            <div id="lms-cache-dashboard">
                <!-- 統計ダッシュボード -->
                <div class="cache-stats-section">
                    <h2>パフォーマンス統計</h2>
                    <table class="widefat">
                        <tr>
                            <th>ヒット率</th>
                            <td><?php echo number_format($stats['hit_ratio'], 2); ?>%</td>
                        </tr>
                        <tr>
                            <th>総リクエスト数</th>
                            <td><?php echo number_format($stats['total_requests']); ?></td>
                        </tr>
                        <tr>
                            <th>リクエスト/秒</th>
                            <td><?php echo number_format($stats['requests_per_second'], 2); ?></td>
                        </tr>
                        <tr>
                            <th>メモリ使用量</th>
                            <td><?php echo size_format($stats['memory_usage']); ?></td>
                        </tr>
                        <tr>
                            <th>圧縮率</th>
                            <td><?php echo number_format($stats['compression_ratio'], 2); ?>%</td>
                        </tr>
                    </table>
                </div>
                
                <!-- 層別統計 -->
                <div class="cache-layers-section">
                    <h2>キャッシュ層統計</h2>
                    <table class="widefat">
                        <thead>
                            <tr>
                                <th>層</th>
                                <th>ヒット数</th>
                                <th>ミス数</th>
                                <th>設定数</th>
                                <th>削除数</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($stats['layer_stats']['hits'] as $layer => $hits): ?>
                            <tr>
                                <td><?php echo esc_html($layer); ?></td>
                                <td><?php echo number_format($hits); ?></td>
                                <td><?php echo number_format($stats['layer_stats']['misses'][$layer] ?? 0); ?></td>
                                <td><?php echo number_format($stats['layer_stats']['sets'][$layer] ?? 0); ?></td>
                                <td><?php echo number_format($stats['layer_stats']['deletes'][$layer] ?? 0); ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                
                <!-- 健全性チェック -->
                <div class="cache-health-section">
                    <h2>システム健全性</h2>
                    <p>状態: <strong class="cache-health-status <?php echo $health['status'] === 'healthy' ? 'healthy' : 'unhealthy'; ?>">
                        <?php echo esc_html($health['status']); ?>
                    </strong></p>
                    
                    <?php if (!empty($health['issues'])): ?>
                    <ul>
                        <?php foreach ($health['issues'] as $issue): ?>
                        <li class="cache-health-issue"><?php echo esc_html($issue); ?></li>
                        <?php endforeach; ?>
                    </ul>
                    <?php endif; ?>
                </div>
                
                <!-- 操作ボタン -->
                <div class="cache-actions">
                    <button type="button" class="button button-primary" onclick="flushCache()">
                        全キャッシュクリア
                    </button>
                    <button type="button" class="button" onclick="refreshStats()">
                        統計更新
                    </button>
                </div>
            </div>
            
            <script>
            function flushCache() {
                if (confirm('全てのキャッシュをクリアしますか？')) {
                    jQuery.post(ajaxurl, {
                        action: 'lms_cache_flush',
                        nonce: '<?php echo wp_create_nonce('lms_cache_flush'); ?>'
                    }, function(response) {
                        alert('キャッシュをクリアしました: ' + response.data + '個のアイテム');
                        location.reload();
                    });
                }
            }
            
            function refreshStats() {
                location.reload();
            }
            </script>
        </div>
        <?php
    }
    
    /**
     * AJAX: キャッシュ統計
     */
    public function ajax_cache_stats()
    {
        check_ajax_referer('lms_cache_stats', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('権限がありません');
        }
        
        wp_send_json_success($this->advanced_cache->get_stats());
    }
    
    /**
     * AJAX: キャッシュフラッシュ
     */
    public function ajax_cache_flush()
    {
        check_ajax_referer('lms_cache_flush', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('権限がありません');
        }
        
        $cleared = $this->advanced_cache->flush_all();
        wp_send_json_success($cleared);
    }
    
    /**
     * AJAX: 健全性チェック
     */
    public function ajax_cache_health()
    {
        check_ajax_referer('lms_cache_health', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('権限がありません');
        }
        
        wp_send_json_success($this->advanced_cache->health_check());
    }
    
    /**
     * キャッシュシステム最適化
     */
    public function optimize_cache_system()
    {
        $this->advanced_cache->cleanup_expired();
        
        $stats = $this->advanced_cache->get_stats();
        
        if ($stats['hit_ratio'] < 50) {
        }
        
        if ($stats['memory_usage'] > (50 * 1024 * 1024)) {
        }
    }
    
    /**
     * 設定の動的調整
     */
    private function adjust_cache_config()
    {
        $memory_limit = ini_get('memory_limit');
        $memory_bytes = $this->parse_memory_limit($memory_limit);
        
        if ($memory_bytes > 512 * 1024 * 1024) { // 512MB以上
            define('LMS_CACHE_MEMORY_SIZE', 200 * 1024 * 1024);
        }
    }
    
    /**
     * 既存キャッシュヘルパーとの統合
     */
    private function integrate_with_legacy_cache()
    {
        add_filter('lms_cache_get', [$this, 'legacy_cache_get'], 10, 2);
        add_filter('lms_cache_set', [$this, 'legacy_cache_set'], 10, 4);
        add_filter('lms_cache_delete', [$this, 'legacy_cache_delete'], 10, 1);
    }
    
    public function legacy_cache_get($value, $key)
    {
        return $this->advanced_cache->get($key, $value, [
            'type' => LMS_Advanced_Cache::TYPE_TEMPORARY,
        ]);
    }
    
    public function legacy_cache_set($result, $key, $value, $ttl)
    {
        return $this->advanced_cache->set($key, $value, $ttl, [
            'type' => LMS_Advanced_Cache::TYPE_TEMPORARY,
        ]);
    }
    
    public function legacy_cache_delete($key)
    {
        return $this->advanced_cache->delete($key);
    }
    
    /**
     * 最終処理
     */
    public function finalize_cache_operations()
    {
        $this->advanced_cache->process_writeback_queue();
    }
    
    private function parse_memory_limit($limit)
    {
        $limit = trim($limit);
        $last = strtolower($limit[strlen($limit)-1]);
        $limit = (int) $limit;
        
        switch($last) {
            case 'g': $limit *= 1024;
            case 'm': $limit *= 1024;
            case 'k': $limit *= 1024;
        }
        
        return $limit;
    }
    
    private function get_user_profile($user_id)
    {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}lms_users WHERE id = %d",
            $user_id
        ));
    }
    
    private function get_user_channels($user_id)
    {
        if (class_exists('LMS_Chat')) {
            $chat = LMS_Chat::get_instance();
            return $chat->get_channels($user_id);
        }
        return [];
    }
    
    private function get_global_channels()
    {
        global $wpdb;
        return $wpdb->get_results(
            "SELECT * FROM {$wpdb->prefix}lms_chat_channels WHERE type = 'public' ORDER BY name"
        );
    }
    
    private function get_active_users()
    {
        global $wpdb;
        return $wpdb->get_results(
            "SELECT id, display_name FROM {$wpdb->prefix}lms_users 
             WHERE last_activity > DATE_SUB(NOW(), INTERVAL 1 HOUR) 
             ORDER BY last_activity DESC LIMIT 100"
        );
    }
}

add_action('init', function() {
    LMS_Cache_Integration::get_instance();
});