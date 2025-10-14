<?php
/**
 * 超高速化キャッシュシステム
 * マルチレイヤー・適応的キャッシュ戦略
 * 
 * @package LMS Theme
 * @version 2.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Ultra_Cache {
    
    private static $instance = null;
    
    // キャッシュレイヤー
    private $memory_cache = array();  // L1: メモリキャッシュ
    private $object_cache_enabled;    // L2: WordPressオブジェクトキャッシュ
    private $transient_cache_enabled; // L3: データベースTransient
    
    // パフォーマンス設定
    private $max_memory_items = 1000;
    private $memory_hit_count = 0;
    private $object_hit_count = 0;
    private $total_requests = 0;
    
    private $ttl_config = array(
        'ultra_short' => 5,      // チャンネル切り替え時
        'short' => 30,           // メッセージ一覧
        'medium' => 300,         // ユーザー情報
        'long' => 1800,          // チャンネル一覧
        'very_long' => 3600      // 設定情報
    );
    
    private function __construct() {
        $this->object_cache_enabled = wp_using_ext_object_cache();
        $this->transient_cache_enabled = true;
        
        // メモリ使用量の監視
        add_action('shutdown', array($this, 'cleanup_memory_cache'));
    }
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * 超高速キャッシュ取得
     * マルチレイヤー戦略でパフォーマンス最大化
     */
    public function get($key, $group = 'lms_chat', $default = false) {
        $this->total_requests++;
        $cache_key = $this->generate_cache_key($key, $group);
        
        if (isset($this->memory_cache[$cache_key])) {
            $cache_data = $this->memory_cache[$cache_key];
            if ($cache_data['expires'] > time()) {
                $this->memory_hit_count++;
                return $cache_data['data'];
            } else {
                // 期限切れアイテムを削除
                unset($this->memory_cache[$cache_key]);
            }
        }
        
        if ($this->object_cache_enabled) {
            $cached = wp_cache_get($cache_key, $group);
            if ($cached !== false) {
                $this->object_hit_count++;
                $this->set_memory_cache($cache_key, $cached, 30);
                return $cached;
            }
        }
        
        if ($this->transient_cache_enabled) {
            $transient_key = 'lms_' . $cache_key;
            $cached = get_transient($transient_key);
            if ($cached !== false) {
                // 上位キャッシュにも保存
                if ($this->object_cache_enabled) {
                    wp_cache_set($cache_key, $cached, $group, 300);
                }
                $this->set_memory_cache($cache_key, $cached, 30);
                return $cached;
            }
        }
        
        return $default;
    }
    
    /**
     * 超高速キャッシュ設定
     * 適応的TTLと階層化保存
     */
    public function set($key, $data, $group = 'lms_chat', $ttl = null, $priority = 'medium') {
        $cache_key = $this->generate_cache_key($key, $group);
        
        if ($ttl === null) {
            $ttl = $this->ttl_config[$priority] ?? $this->ttl_config['medium'];
        }
        
        // データサイズチェック（大きすぎる場合はメモリキャッシュをスキップ）
        $data_size = strlen(serialize($data));
        $skip_memory = $data_size > 1024 * 100; // 100KB以上はメモリに保存しない
        
        if (!$skip_memory) {
            $this->set_memory_cache($cache_key, $data, $ttl);
        }
        
        if ($this->object_cache_enabled) {
            wp_cache_set($cache_key, $data, $group, $ttl);
        }
        
        if ($this->transient_cache_enabled && $ttl > 60) {
            $transient_key = 'lms_' . $cache_key;
            set_transient($transient_key, $data, $ttl);
        }
        
        return true;
    }
    
    /**
     * 選択的キャッシュ削除
     * パターンマッチングで効率的に削除
     */
    public function delete($key, $group = 'lms_chat') {
        $cache_key = $this->generate_cache_key($key, $group);
        
        unset($this->memory_cache[$cache_key]);
        
        if ($this->object_cache_enabled) {
            wp_cache_delete($cache_key, $group);
        }
        
        if ($this->transient_cache_enabled) {
            $transient_key = 'lms_' . $cache_key;
            delete_transient($transient_key);
        }
        
        return true;
    }
    
    /**
     * パターンマッチング削除
     * 例: delete_pattern('chat_msgs_*', 'lms_chat')
     */
    public function delete_pattern($pattern, $group = 'lms_chat') {
        // メモリキャッシュからパターンマッチング削除
        $pattern_regex = '/^' . str_replace('*', '.*', preg_quote($pattern, '/')) . '$/';
        foreach ($this->memory_cache as $key => $value) {
            if (preg_match($pattern_regex, $key)) {
                unset($this->memory_cache[$key]);
            }
        }
        
        // オブジェクトキャッシュ（グループ単位での削除）
        if ($this->object_cache_enabled) {
            // 完全なグループフラッシュは重いので、よく使われるキーのみ個別削除
            $common_keys = $this->get_common_cache_keys($pattern);
            foreach ($common_keys as $key) {
                wp_cache_delete($key, $group);
            }
        }
        
        if ($this->transient_cache_enabled && $group === 'lms_chat') {
            $this->delete_transient_pattern($pattern);
        }
    }
    
    /**
     * キャッシュ統計情報取得
     */
    public function get_stats() {
        $memory_usage = count($this->memory_cache);
        $hit_rate = $this->total_requests > 0 
            ? round(($this->memory_hit_count + $this->object_hit_count) / $this->total_requests * 100, 2)
            : 0;
            
        return array(
            'memory_items' => $memory_usage,
            'memory_hits' => $this->memory_hit_count,
            'object_hits' => $this->object_hit_count,
            'total_requests' => $this->total_requests,
            'hit_rate' => $hit_rate,
            'memory_limit' => $this->max_memory_items,
            'object_cache_enabled' => $this->object_cache_enabled,
            'memory_usage_mb' => round(memory_get_usage() / 1024 / 1024, 2)
        );
    }
    
    /**
     * 適応的キャッシュ戦略
     * 使用パターンに基づいてTTLを動的調整
     */
    public function adaptive_set($key, $data, $group = 'lms_chat', $context = array()) {
        $priority = $this->calculate_priority($context);
        $ttl = $this->calculate_adaptive_ttl($key, $context);
        
        return $this->set($key, $data, $group, $ttl, $priority);
    }
    
    /**
     * バッチキャッシュ操作
     * 複数のキーを効率的に処理
     */
    public function get_multi($keys, $group = 'lms_chat') {
        $results = array();
        
        foreach ($keys as $key) {
            $results[$key] = $this->get($key, $group);
        }
        
        return $results;
    }
    
    public function set_multi($data_array, $group = 'lms_chat', $ttl = 300) {
        foreach ($data_array as $key => $data) {
            $this->set($key, $data, $group, $ttl);
        }
        
        return true;
    }
    
    /**
     * プリロード機能
     * よく使用されるデータを事前読み込み
     */
    public function preload_common_data($user_id, $channel_id = null) {
        $preload_keys = array(
            "user_info_{$user_id}",
            'channels_list',
            'unread_counts_' . $user_id
        );
        
        if ($channel_id) {
            $preload_keys[] = "chat_msgs_{$channel_id}_1_50_0_{$user_id}_v3";
        }
        
        // 非同期プリロード実行
        wp_schedule_single_event(time() + 1, 'lms_preload_cache', array($preload_keys, $user_id));
    }
    
    // ===== プライベートメソッド =====
    
    private function generate_cache_key($key, $group) {
        return $group . '_' . $key;
    }
    
    private function set_memory_cache($key, $data, $ttl) {
        // メモリ制限チェック
        if (count($this->memory_cache) >= $this->max_memory_items) {
            $this->cleanup_expired_memory_cache();
            
            // まだ制限を超えている場合、古いアイテムを削除
            if (count($this->memory_cache) >= $this->max_memory_items) {
                $this->evict_old_memory_cache();
            }
        }
        
        $this->memory_cache[$key] = array(
            'data' => $data,
            'expires' => time() + $ttl,
            'created' => time()
        );
    }
    
    private function cleanup_expired_memory_cache() {
        $current_time = time();
        foreach ($this->memory_cache as $key => $cache_data) {
            if ($cache_data['expires'] <= $current_time) {
                unset($this->memory_cache[$key]);
            }
        }
    }
    
    private function evict_old_memory_cache() {
        uasort($this->memory_cache, function($a, $b) {
            return $a['created'] - $b['created'];
        });
        
        $remove_count = intval($this->max_memory_items * 0.25);
        $keys_to_remove = array_slice(array_keys($this->memory_cache), 0, $remove_count);
        
        foreach ($keys_to_remove as $key) {
            unset($this->memory_cache[$key]);
        }
    }
    
    private function calculate_priority($context) {
        if (isset($context['type'])) {
            switch ($context['type']) {
                case 'channel_switch':
                    return 'ultra_short';
                case 'message_list':
                    return 'short';
                case 'user_info':
                    return 'medium';
                case 'channel_list':
                    return 'long';
                default:
                    return 'medium';
            }
        }
        
        return 'medium';
    }
    
    private function calculate_adaptive_ttl($key, $context) {
        // デフォルトTTL
        $base_ttl = 300;
        
        // キーのパターンに基づく調整
        if (strpos($key, 'chat_msgs_') === 0) {
            // メッセージは頻繁に変更される
            $base_ttl = 30;
        } elseif (strpos($key, 'user_info_') === 0) {
            // ユーザー情報はそこそこ安定
            $base_ttl = 300;
        } elseif (strpos($key, 'channels_') === 0) {
            // チャンネル情報は比較的安定
            $base_ttl = 600;
        }
        
        // コンテキストに基づく調整
        if (isset($context['frequency'])) {
            if ($context['frequency'] === 'high') {
                $base_ttl = intval($base_ttl * 0.5);  // 50%短縮
            } elseif ($context['frequency'] === 'low') {
                $base_ttl = intval($base_ttl * 2);    // 2倍延長
            }
        }
        
        return $base_ttl;
    }
    
    private function get_common_cache_keys($pattern) {
        // よく使用されるキーのパターンを返す
        $common_patterns = array(
            'chat_msgs_*' => array('chat_msgs_1_1_50_0', 'chat_msgs_2_1_50_0', 'chat_msgs_3_1_50_0'),
            'user_info_*' => array('user_info_1', 'user_info_2', 'user_info_3'),
            'unread_count_*' => array('unread_count_1', 'unread_count_2')
        );
        
        return $common_patterns[$pattern] ?? array();
    }
    
    private function delete_transient_pattern($pattern) {
        global $wpdb;
        
        // 安全性を考慮して限定的なパターンのみ処理
        $safe_patterns = array('chat_msgs_*', 'user_info_*', 'unread_count_*');
        
        if (!in_array($pattern, $safe_patterns)) {
            return;
        }
        
        $like_pattern = str_replace('*', '%', $pattern);
        $transient_names = $wpdb->get_col($wpdb->prepare(
            "SELECT option_name FROM {$wpdb->options} 
             WHERE option_name LIKE %s 
             AND option_name LIKE '_transient_lms_%' 
             LIMIT 100",
            '%' . $like_pattern . '%'
        ));
        
        foreach ($transient_names as $transient_name) {
            $key = str_replace('_transient_lms_', '', $transient_name);
            delete_transient('lms_' . $key);
        }
    }
    
    /**
     * メモリクリーンアップ（シャットダウン時）
     */
    public function cleanup_memory_cache() {
        // 統計情報をログに記録（デバッグ時のみ）
        if (WP_DEBUG && WP_DEBUG_LOG) {
            $stats = $this->get_stats();
        }
        
        // メモリキャッシュをクリア
        $this->memory_cache = array();
    }
}