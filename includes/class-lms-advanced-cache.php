<?php
/**
 * LMS高機能キャッシュシステム
 * 
 * 機能:
 * - 多層キャッシュ (L1: メモリ, L2: APCu, L3: Redis/Memcached, L4: ファイル, L5: データベース)
 * - 先読みキャッシュ (Predictive Prefetching)
 * - ライトバックキャッシュ (Write-back Caching)
 * - 大容量データ圧縮保存
 * - インテリジェント無効化
 * - パフォーマンス統計
 * - ホットデータ検出
 * - 自動最適化
 * 
 * @package LMS Theme
 * @version 2.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Advanced_Cache
{
    private static $instance = null;
    
    const LAYER_MEMORY = 'memory';      // L1: PHP配列メモリ
    const LAYER_APCU = 'apcu';          // L2: APCu
    const LAYER_REDIS = 'redis';        // L3: Redis
    const LAYER_MEMCACHED = 'memcached'; // L3: Memcached
    const LAYER_FILE = 'file';          // L4: ファイルシステム
    const LAYER_DATABASE = 'database';  // L5: データベース
    
    const TYPE_TEMPORARY = 'temp';       // 一時的なデータ
    const TYPE_PERSISTENT = 'persistent'; // 永続的なデータ
    const TYPE_SESSION = 'session';      // セッション固有
    const TYPE_USER = 'user';           // ユーザー固有
    const TYPE_GLOBAL = 'global';       // グローバル
    
    const COMPRESS_NONE = 0;
    const COMPRESS_FAST = 1;
    const COMPRESS_BALANCED = 6;
    const COMPRESS_MAX = 9;
    
    private $memory_cache = [];          // L1メモリキャッシュ
    private $redis_client = null;       // Redisクライアント
    private $memcached_client = null;   // Memcachedクライアント
    private $config = [];               // 設定
    private $stats = [];                // 統計情報
    private $hot_keys = [];             // ホットキー
    private $prefetch_queue = [];       // 先読みキュー
    private $writeback_queue = [];      // ライトバックキュー
    private $compression_enabled = true;
    private $batch_update_stats = [];   // 統計更新バッチ
    private $cache_base_path = '';      // キャッシュベースパス
    private $performance_stats = [];    // パフォーマンス統計
    
    /**
     * シングルトンインスタンス取得
     */
    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * コンストラクタ
     */
    private function __construct()
    {
        $this->init_config();
        $this->init_connections();
        $this->init_stats();
        $this->init_background_tasks();
    }
    
    /**
     * 設定初期化
     */
    private function init_config()
    {
        $this->config = [
            'layers' => [
                self::LAYER_MEMORY => true,
                self::LAYER_APCU => extension_loaded('apcu'),
                self::LAYER_REDIS => extension_loaded('redis'),
                self::LAYER_MEMCACHED => extension_loaded('memcached'),
                self::LAYER_FILE => true,
                self::LAYER_DATABASE => true,
            ],
            
            'ttl' => [
                self::LAYER_MEMORY => 300,      // 5分
                self::LAYER_APCU => 3600,       // 1時間
                self::LAYER_REDIS => 86400,     // 24時間
                self::LAYER_MEMCACHED => 86400, // 24時間
                self::LAYER_FILE => 604800,     // 7日
                self::LAYER_DATABASE => 2592000, // 30日
            ],
            
            'max_size' => [
                self::LAYER_MEMORY => 100 * 1024 * 1024,    // 100MB
                self::LAYER_APCU => 500 * 1024 * 1024,      // 500MB
                self::LAYER_REDIS => 2 * 1024 * 1024 * 1024, // 2GB
                self::LAYER_FILE => 10 * 1024 * 1024 * 1024, // 10GB
            ],
            
            'prefetch' => [
                'enabled' => true,
                'max_queue' => 1000,
                'batch_size' => 50,
                'prediction_window' => 3600, // 1時間
            ],
            
            'writeback' => [
                'enabled' => true,
                'max_queue' => 500,
                'batch_size' => 25,
                'flush_interval' => 30, // 30秒
            ],
            
            'compression' => [
                'enabled' => true,
                'min_size' => 1024, // 1KB以上で圧縮
                'algorithm' => 'gzip',
                'level' => self::COMPRESS_BALANCED,
            ],
            
            'hot_detection' => [
                'enabled' => true,
                'threshold' => 10, // 10回以上アクセスでホット認定
                'window' => 3600,  // 1時間のウィンドウ
            ],
        ];
        
        if (defined('LMS_CACHE_CONFIG')) {
            $this->config = array_merge_recursive($this->config, LMS_CACHE_CONFIG);
        }
        
        // キャッシュベースパスを初期化
        $this->cache_base_path = defined('LMS_CACHE_PATH') ? LMS_CACHE_PATH : WP_CONTENT_DIR . '/cache/lms';
    }
    
    /**
     * 接続初期化
     */
    private function init_connections()
    {
        if ($this->config['layers'][self::LAYER_REDIS]) {
            try {
                $this->redis_client = new Redis();
                $host = defined('LMS_REDIS_HOST') ? LMS_REDIS_HOST : '127.0.0.1';
                $port = defined('LMS_REDIS_PORT') ? LMS_REDIS_PORT : 6379;
                $this->redis_client->connect($host, $port);
                
                if (defined('LMS_REDIS_PASSWORD')) {
                    $this->redis_client->auth(LMS_REDIS_PASSWORD);
                }
                
                $this->redis_client->select(defined('LMS_REDIS_DB') ? LMS_REDIS_DB : 0);
            } catch (Exception $e) {
                $this->config['layers'][self::LAYER_REDIS] = false;
            }
        }
        
        if ($this->config['layers'][self::LAYER_MEMCACHED]) {
            try {
                $this->memcached_client = new Memcached();
                $host = defined('LMS_MEMCACHED_HOST') ? LMS_MEMCACHED_HOST : '127.0.0.1';
                $port = defined('LMS_MEMCACHED_PORT') ? LMS_MEMCACHED_PORT : 11211;
                $this->memcached_client->addServer($host, $port);
            } catch (Exception $e) {
                $this->config['layers'][self::LAYER_MEMCACHED] = false;
            }
        }
    }
    
    /**
     * 統計初期化
     */
    private function init_stats()
    {
        $this->stats = [
            'hits' => [],
            'misses' => [],
            'sets' => [],
            'deletes' => [],
            'prefetch_hits' => 0,
            'writeback_flushes' => 0,
            'compression_ratio' => 0,
            'memory_usage' => 0,
            'start_time' => microtime(true),
        ];
        
        foreach ($this->config['layers'] as $layer => $enabled) {
            if ($enabled) {
                $this->stats['hits'][$layer] = 0;
                $this->stats['misses'][$layer] = 0;
                $this->stats['sets'][$layer] = 0;
                $this->stats['deletes'][$layer] = 0;
            }
        }
        
        // パフォーマンス統計を初期化
        $this->performance_stats = [];
    }
    
    /**
     * バックグラウンドタスク初期化
     */
    private function init_background_tasks()
    {
        if ($this->config['prefetch']['enabled']) {
            add_action('wp_loaded', [$this, 'process_prefetch_queue']);
        }
        
        if ($this->config['writeback']['enabled']) {
            add_action('shutdown', [$this, 'process_writeback_queue']);
            
            if (!wp_next_scheduled('lms_cache_writeback_flush')) {
                wp_schedule_event(time(), 'lms_cache_flush_interval', 'lms_cache_writeback_flush');
            }
            add_action('lms_cache_writeback_flush', [$this, 'flush_writeback_queue']);
        }
        
        add_action('shutdown', [$this, 'collect_stats']);
        
        if ($this->config['hot_detection']['enabled']) {
            add_action('wp_loaded', [$this, 'detect_hot_keys']);
        }
        
        if (!wp_next_scheduled('lms_cache_cleanup')) {
            wp_schedule_event(time(), 'hourly', 'lms_cache_cleanup');
        }
        add_action('lms_cache_cleanup', [$this, 'cleanup_expired']);
    }
    
    /**
     * 期限切れキャッシュのクリーンアップ
     */
    public function cleanup_expired()
    {
        $this->memory_cache = [];
        
        if (function_exists('apcu_clear_cache')) {
        }
        
        $cache_dir = $this->cache_base_path ?? WP_CONTENT_DIR . '/cache/lms';
        if (is_dir($cache_dir)) {
            $this->cleanup_file_cache($cache_dir);
        }
        
        $this->cleanup_old_stats();
    }
    
    /**
     * ファイルキャッシュのクリーンアップ
     */
    private function cleanup_file_cache($dir)
    {
        $files = glob($dir . '/*');
        $current_time = time();
        
        foreach ($files as $file) {
            if (is_file($file)) {
                if ($current_time - filemtime($file) > 3600) {
                    @unlink($file);
                }
            }
        }
    }
    
    /**
     * 古い統計データのクリーンアップ
     */
    private function cleanup_old_stats()
    {
        if (!is_array($this->performance_stats)) {
            $this->performance_stats = [];
            return;
        }
        
        $cutoff_time = time() - (7 * 24 * 3600);
        foreach ($this->performance_stats as $key => $stats) {
            if (isset($stats['timestamp']) && $stats['timestamp'] < $cutoff_time) {
                unset($this->performance_stats[$key]);
            }
        }
    }
    
    /**
     * 高機能GET操作
     * 
     * @param string $key キー
     * @param mixed $default デフォルト値
     * @param array $options オプション
     * @return mixed
     */
    public function get($key, $default = null, $options = [])
    {
        $options = array_merge([
            'type' => self::TYPE_TEMPORARY,
            'prefetch' => true,
            'layers' => null, // nullの場合は全層検索
            'decompress' => true,
        ], $options);
        
        $full_key = $this->build_key($key, $options['type']);
        $start_time = microtime(true);
        
        $this->record_key_access($full_key);
        
        $layers = $options['layers'] ?: $this->get_enabled_layers();
        
        foreach ($layers as $layer) {
            $value = $this->get_from_layer($full_key, $layer, $options);
            
            if ($value !== null) {
                $this->stats['hits'][$layer]++;
                
                $this->warm_upper_layers($full_key, $value, $layer, $options);
                
                if ($options['prefetch']) {
                    $this->predict_and_prefetch($full_key, $options);
                }
                
                return $this->deserialize_value($value, $options);
            } else {
                $this->stats['misses'][$layer]++;
            }
        }
        
        return $default;
    }
    
    /**
     * 高機能SET操作
     * 
     * @param string $key キー
     * @param mixed $value 値
     * @param int $ttl TTL（秒）
     * @param array $options オプション
     * @return bool
     */
    public function set($key, $value, $ttl = null, $options = [])
    {
        $options = array_merge([
            'type' => self::TYPE_TEMPORARY,
            'layers' => null, // nullの場合は全層に保存
            'compress' => true,
            'writeback' => false, // ライトバック使用するか
            'priority' => 'normal', // high, normal, low
        ], $options);
        
        $full_key = $this->build_key($key, $options['type']);
        
        $serialized_value = $this->serialize_value($value, $options);
        
        if ($options['writeback']) {
            return $this->add_to_writeback_queue($full_key, $serialized_value, $ttl, $options);
        }
        
        $layers = $options['layers'] ?: $this->get_enabled_layers();
        $success = true;
        
        foreach ($layers as $layer) {
            $layer_ttl = $ttl ?: $this->config['ttl'][$layer];
            $result = $this->set_to_layer($full_key, $serialized_value, $layer_ttl, $layer, $options);
            
            if ($result) {
                $this->stats['sets'][$layer]++;
            } else {
                $success = false;
            }
        }
        
        if ($this->is_hot_key($full_key)) {
            $this->promote_to_hot_cache($full_key, $serialized_value, $options);
        }
        
        return $success;
    }
    
    /**
     * インテリジェント削除
     */
    public function delete($key, $options = [])
    {
        $options = array_merge([
            'type' => self::TYPE_TEMPORARY,
            'cascade' => true, // 関連キーも削除
            'pattern' => false, // パターンマッチ削除
        ], $options);
        
        $full_key = $this->build_key($key, $options['type']);
        
        if ($options['pattern']) {
            return $this->delete_by_pattern($full_key, $options);
        }
        
        $success = true;
        foreach ($this->get_enabled_layers() as $layer) {
            $result = $this->delete_from_layer($full_key, $layer);
            if ($result) {
                $this->stats['deletes'][$layer]++;
            } else {
                $success = false;
            }
        }
        
        if ($options['cascade']) {
            $this->delete_related_keys($full_key);
        }
        
        unset($this->writeback_queue[$full_key]);
        
        return $success;
    }

    /**
     * パターンマッチ削除（パブリック）
     */
    public function delete_pattern($pattern, $type = self::TYPE_TEMPORARY)
    {
        $options = [
            'type' => $type,
            'pattern' => true,
            'cascade' => false
        ];

        $full_key = $this->build_key($pattern, $options['type']);
        return $this->delete_by_pattern($full_key, $options);
    }

    /**
     * 一括操作
     */
    public function get_multiple($keys, $options = [])
    {
        $results = [];
        foreach ($keys as $key) {
            $results[$key] = $this->get($key, null, $options);
        }
        return $results;
    }
    
    public function set_multiple($data, $ttl = null, $options = [])
    {
        $success = true;
        foreach ($data as $key => $value) {
            if (!$this->set($key, $value, $ttl, $options)) {
                $success = false;
            }
        }
        return $success;
    }
    
    /**
     * 先読みキャッシュ
     */
    public function prefetch($keys, $callback = null, $options = [])
    {
        if (!$this->config['prefetch']['enabled']) {
            return false;
        }
        
        $options = array_merge([
            'priority' => 'normal',
            'background' => true,
        ], $options);
        
        foreach ($keys as $key) {
            $this->prefetch_queue[] = [
                'key' => $key,
                'callback' => $callback,
                'options' => $options,
                'timestamp' => time(),
            ];
        }
        
        if (count($this->prefetch_queue) > $this->config['prefetch']['max_queue']) {
            $this->prefetch_queue = array_slice($this->prefetch_queue, -$this->config['prefetch']['max_queue']);
        }
        
        return true;
    }
    
    /**
     * 統計情報の取得
     */
    public function get_stats()
    {
        $total_hits = array_sum($this->stats['hits']);
        $total_misses = array_sum($this->stats['misses']);
        $total_requests = $total_hits + $total_misses;
        
        $runtime = microtime(true) - $this->stats['start_time'];
        
        return [
            'hit_ratio' => $total_requests > 0 ? ($total_hits / $total_requests) * 100 : 0,
            'total_requests' => $total_requests,
            'total_hits' => $total_hits,
            'total_misses' => $total_misses,
            'layer_stats' => [
                'hits' => $this->stats['hits'],
                'misses' => $this->stats['misses'],
                'sets' => $this->stats['sets'],
                'deletes' => $this->stats['deletes'],
            ],
            'prefetch_hits' => $this->stats['prefetch_hits'],
            'writeback_flushes' => $this->stats['writeback_flushes'],
            'compression_ratio' => $this->stats['compression_ratio'],
            'memory_usage' => $this->get_memory_usage(),
            'hot_keys_count' => count($this->hot_keys),
            'prefetch_queue_size' => count($this->prefetch_queue),
            'writeback_queue_size' => count($this->writeback_queue),
            'runtime' => $runtime,
            'requests_per_second' => $runtime > 0 ? $total_requests / $runtime : 0,
        ];
    }
    
    
    private function build_key($key, $type = self::TYPE_TEMPORARY)
    {
        $prefix = 'lms_cache_' . $type . '_';
        return $prefix . hash('sha256', $key);
    }
    
    private function get_enabled_layers()
    {
        return array_keys(array_filter($this->config['layers']));
    }
    
    private function get_from_layer($key, $layer, $options)
    {
        switch ($layer) {
            case self::LAYER_MEMORY:
                return $this->memory_cache[$key] ?? null;
                
            case self::LAYER_APCU:
                return apcu_exists($key) ? apcu_fetch($key) : null;
                
            case self::LAYER_REDIS:
                return $this->redis_client ? $this->redis_client->get($key) : null;
                
            case self::LAYER_MEMCACHED:
                return $this->memcached_client ? $this->memcached_client->get($key) : null;
                
            case self::LAYER_FILE:
                return $this->get_from_file($key);
                
            case self::LAYER_DATABASE:
                return $this->get_from_database($key);
                
            default:
                return null;
        }
    }
    
    private function set_to_layer($key, $value, $ttl, $layer, $options)
    {
        switch ($layer) {
            case self::LAYER_MEMORY:
                $this->memory_cache[$key] = $value;
                if ($this->get_memory_usage() > $this->config['max_size'][self::LAYER_MEMORY]) {
                    $this->evict_memory_cache();
                }
                return true;
                
            case self::LAYER_APCU:
                return apcu_store($key, $value, $ttl);
                
            case self::LAYER_REDIS:
                return $this->redis_client ? $this->redis_client->setex($key, $ttl, $value) : false;
                
            case self::LAYER_MEMCACHED:
                return $this->memcached_client ? $this->memcached_client->set($key, $value, $ttl) : false;
                
            case self::LAYER_FILE:
                return $this->set_to_file($key, $value, $ttl);
                
            case self::LAYER_DATABASE:
                return $this->set_to_database($key, $value, $ttl);
                
            default:
                return false;
        }
    }
    
    private function delete_from_layer($key, $layer)
    {
        switch ($layer) {
            case self::LAYER_MEMORY:
                unset($this->memory_cache[$key]);
                return true;
                
            case self::LAYER_APCU:
                return apcu_delete($key);
                
            case self::LAYER_REDIS:
                return $this->redis_client ? $this->redis_client->del($key) : false;
                
            case self::LAYER_MEMCACHED:
                return $this->memcached_client ? $this->memcached_client->delete($key) : false;
                
            case self::LAYER_FILE:
                return $this->delete_from_file($key);
                
            case self::LAYER_DATABASE:
                return $this->delete_from_database($key);
                
            default:
                return false;
        }
    }
    
    private function serialize_value($value, $options)
    {
        $serialized = serialize($value);
        
        if ($options['compress'] && $this->compression_enabled && 
            strlen($serialized) >= $this->config['compression']['min_size']) {
            
            $compressed = gzcompress($serialized, $this->config['compression']['level']);
            if ($compressed !== false && strlen($compressed) < strlen($serialized)) {
                $this->stats['compression_ratio'] = (1 - strlen($compressed) / strlen($serialized)) * 100;
                return base64_encode($compressed);
            }
        }
        
        return $serialized;
    }
    
    private function deserialize_value($value, $options)
    {
        if ($options['decompress'] && $this->compression_enabled) {
            $decoded = base64_decode($value, true);
            if ($decoded !== false) {
                $decompressed = gzuncompress($decoded);
                if ($decompressed !== false) {
                    $value = $decompressed;
                }
            }
        }
        
        return unserialize($value);
    }
    
    private function get_cache_dir()
    {
        $dir = WP_CONTENT_DIR . '/cache/lms-advanced';
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
        }
        return $dir;
    }
    
    private function get_from_file($key)
    {
        $file = $this->get_cache_dir() . '/' . $key . '.cache';
        if (!file_exists($file)) {
            return null;
        }
        
        $data = json_decode(file_get_contents($file), true);
        if (!$data || $data['expires'] < time()) {
            unlink($file);
            return null;
        }
        
        return $data['value'];
    }
    
    private function set_to_file($key, $value, $ttl)
    {
        $file = $this->get_cache_dir() . '/' . $key . '.cache';
        $data = [
            'value' => $value,
            'expires' => time() + $ttl,
            'created' => time(),
        ];
        
        return file_put_contents($file, json_encode($data)) !== false;
    }
    
    private function delete_from_file($key)
    {
        $file = $this->get_cache_dir() . '/' . $key . '.cache';
        return file_exists($file) ? unlink($file) : true;
    }
    
    private function get_from_database($key)
    {
        global $wpdb;
        
        $this->ensure_cache_table();
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $key_hash = hash('sha256', $key);
        
        $result = $wpdb->get_row($wpdb->prepare(
            "SELECT cache_value, expires_at, is_compressed, access_count, hit_count, miss_count 
             FROM {$table_name} USE INDEX (uniq_cache_key_hash, idx_expires_access)
             WHERE cache_key_hash = %s AND expires_at > UNIX_TIMESTAMP()",
            $key_hash
        ));
        
        if (!$result) {
            $wpdb->query($wpdb->prepare(
                "UPDATE {$table_name} 
                 SET miss_count = miss_count + 1 
                 WHERE cache_key_hash = %s",
                $key_hash
            ));
            return null;
        }
        
        $this->batch_update_stats[] = [
            'key_hash' => $key_hash,
            'type' => 'hit',
            'timestamp' => time()
        ];
        
        if (count($this->batch_update_stats) >= 10) {
            $this->flush_stats_batch();
        }
        
        return $result->cache_value;
    }
    
    private function set_to_database($key, $value, $ttl)
    {
        global $wpdb;
        
        $this->ensure_cache_table();
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $key_hash = hash('sha256', $key);
        
        $expires_timestamp = time() + $ttl;
        $data_size = strlen($value);
        $is_compressed = strpos($value, 'H4sI') === 0 ? 1 : 0;
        
        $result = $wpdb->replace(
            $table_name,
            [
                'cache_key' => $key,
                'cache_key_hash' => $key_hash,
                'cache_value' => $value,
                'cache_type' => 0, // temporary
                'expires_at' => $expires_timestamp,
                'data_size' => $data_size,
                'is_compressed' => $is_compressed,
                'priority' => 1, // normal
                'ttl_seconds' => $ttl,
                'hit_count' => 0,
                'miss_count' => 0
            ],
            ['%s', '%s', '%s', '%d', '%d', '%d', '%d', '%d', '%d', '%d', '%d']
        );
        
        if (mt_rand(1, 100) <= 5) { // 5%の確率で実行
            $this->manage_database_size();
        }
        
        return $result !== false;
    }
    
    private function delete_from_database($key)
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $key_hash = hash('sha256', $key);
        
        return $wpdb->delete(
            $table_name,
            ['cache_key_hash' => $key_hash],
            ['%s']
        ) !== false;
    }
    
    private function ensure_cache_table()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            cache_key varchar(191) NOT NULL COMMENT 'UTF8MB4対応のキー長',
            cache_key_hash char(64) NOT NULL COMMENT 'SHA256ハッシュ（高速検索用）',
            cache_value mediumblob NOT NULL COMMENT 'バイナリ対応の値格納',
            cache_type tinyint(1) UNSIGNED NOT NULL DEFAULT 0 COMMENT '0:temp,1:persistent,2:session,3:user,4:global',
            expires_at timestamp NOT NULL COMMENT 'タイムスタンプ型で高速比較',
            created_at timestamp DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            access_count int(11) UNSIGNED DEFAULT 0,
            last_access timestamp DEFAULT CURRENT_TIMESTAMP,
            data_size int(11) UNSIGNED DEFAULT 0,
            is_compressed tinyint(1) UNSIGNED DEFAULT 0,
            priority tinyint(1) UNSIGNED DEFAULT 1 COMMENT '0:low,1:normal,2:high',
            tags varchar(500) NULL COMMENT 'カンマ区切りタグ',
            ttl_seconds int(11) UNSIGNED DEFAULT 0 COMMENT 'TTL値（秒）',
            hit_count int(11) UNSIGNED DEFAULT 0 COMMENT 'ヒット回数',
            miss_count int(11) UNSIGNED DEFAULT 0 COMMENT 'ミス回数',
            PRIMARY KEY (id),
            UNIQUE KEY uniq_cache_key_hash (cache_key_hash),
            KEY idx_expires_access (expires_at, last_access) COMMENT '期限切れ＋アクセス複合',
            KEY idx_type_priority_expires (cache_type, priority, expires_at) COMMENT 'タイプ＋優先度＋期限複合',
            KEY idx_data_size_compressed (data_size, is_compressed) COMMENT 'サイズ＋圧縮複合',
            KEY idx_access_count_desc (access_count DESC) COMMENT 'アクセス数降順（HOT検出用）',
            KEY idx_hit_ratio (hit_count, miss_count) COMMENT 'ヒット率計算用',
            KEY idx_created_updated (created_at, updated_at) COMMENT '作成・更新時間複合',
            KEY idx_ttl_priority (ttl_seconds, priority) COMMENT 'TTL＋優先度複合'
        ) {$charset_collate} 
        ENGINE=InnoDB 
        ROW_FORMAT=COMPRESSED 
        KEY_BLOCK_SIZE=8 
        COMMENT='高性能LMSキャッシュストレージ'";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        $this->create_advanced_indexes($table_name);
        
        $this->optimize_cache_table($table_name);
    }
    
    /**
     * 高性能インデックスの作成
     */
    private function create_advanced_indexes($table_name)
    {
        global $wpdb;
        
        $existing_indexes = $wpdb->get_results("SHOW INDEX FROM {$table_name}");
        $index_names = array_column($existing_indexes, 'Key_name');
        
        $advanced_indexes = [
            'idx_temp_hot_data' => "CREATE INDEX idx_temp_hot_data ON {$table_name} (cache_type, access_count DESC, last_access DESC) WHERE cache_type = 0",
            
            'idx_lru_eviction' => "CREATE INDEX idx_lru_eviction ON {$table_name} (last_access ASC, access_count ASC, data_size DESC)",
            
            'idx_expired_cleanup' => "CREATE INDEX idx_expired_cleanup ON {$table_name} (expires_at, created_at) WHERE expires_at < NOW()",
            
            'idx_hot_detection' => "CREATE INDEX idx_hot_detection ON {$table_name} (access_count DESC, hit_count DESC, last_access DESC)",
            
            'idx_efficiency_analysis' => "CREATE INDEX idx_efficiency_analysis ON {$table_name} (hit_count, miss_count, data_size, is_compressed)",
            
            'idx_size_management' => "CREATE INDEX idx_size_management ON {$table_name} (data_size DESC, access_count ASC)",
            
            'idx_statistics' => "CREATE INDEX idx_statistics ON {$table_name} (cache_type, priority, is_compressed, created_at)"
        ];
        
        foreach ($advanced_indexes as $index_name => $sql) {
            if (!in_array($index_name, $index_names)) {
                try {
                    $basic_sql = preg_replace('/\s+WHERE\s+.+$/', '', $sql);
                    $wpdb->query($basic_sql);
                } catch (Exception $e) {
                }
            }
        }
    }
    
    /**
     * キャッシュテーブルの最適化
     */
    private function optimize_cache_table($table_name)
    {
        global $wpdb;

        try {
            // 重複ALTERエラーを防ぐため、最適化の頻度を制限
            $optimize_key = "lms_cache_optimize_" . md5($table_name);
            $last_optimize = get_transient($optimize_key);

            if ($last_optimize && (time() - $last_optimize) < 3600) {
                // 1時間以内に最適化済みの場合はスキップ
                return;
            }

            $wpdb->query("ANALYZE TABLE {$table_name}");

            $wpdb->query("OPTIMIZE TABLE {$table_name}");

            // ALTERの実行前にテーブル状態をチェック
            $table_status = $wpdb->get_row("SHOW TABLE STATUS LIKE '{$table_name}'");
            if (!$table_status || $table_status->Engine !== 'InnoDB' || $table_status->Row_format !== 'Compressed') {
                $wpdb->query("ALTER TABLE {$table_name} ENGINE=InnoDB ROW_FORMAT=COMPRESSED KEY_BLOCK_SIZE=8");
            }

            $wpdb->query("UPDATE {$table_name} SET hit_count = hit_count + 0 WHERE 1=1 LIMIT 1");

            // 最適化完了をマーク
            set_transient($optimize_key, time(), 3600);

        } catch (Exception $e) {
            // エラー処理（ログ出力は削除済み）
        }
    }
    
    private function manage_database_size()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $max_size = $this->config['max_size'][self::LAYER_DATABASE] ?? (100 * 1024 * 1024);
        
        $current_size = $wpdb->get_var(
            "SELECT SUM(data_size) FROM {$table_name} USE INDEX (idx_data_size_compressed)"
        );
        
        if ($current_size > $max_size) {
            
            $deleted_expired = $wpdb->query(
                "DELETE FROM {$table_name} USE INDEX (idx_expires_access)
                 WHERE expires_at < UNIX_TIMESTAMP() 
                 LIMIT 5000"
            );
            
            if ($deleted_expired < 1000) {
                $wpdb->query(
                    "DELETE FROM {$table_name} USE INDEX (idx_lru_eviction)
                     WHERE id IN (
                         SELECT id FROM (
                             SELECT id FROM {$table_name}
                             ORDER BY last_access ASC, access_count ASC
                             LIMIT 2000
                         ) tmp
                     )"
                );
            }
            
            $wpdb->query(
                "DELETE FROM {$table_name} USE INDEX (idx_size_management)
                 WHERE data_size > 1048576 AND access_count < 5
                 LIMIT 500"
            );
            
            if (mt_rand(1, 50) === 1) { // 2%の確率で実行
                $wpdb->query("OPTIMIZE TABLE {$table_name}");
            }
        }
    }
    
    /**
     * 統計更新のバッチ処理
     */
    private function flush_stats_batch()
    {
        if (empty($this->batch_update_stats)) {
            return;
        }
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        
        $cases_hit = [];
        $cases_access = [];
        $cases_last_access = [];
        $key_hashes = [];
        
        foreach ($this->batch_update_stats as $stat) {
            $key_hash = $stat['key_hash'];
            $key_hashes[] = "'" . esc_sql($key_hash) . "'";
            
            if ($stat['type'] === 'hit') {
                $cases_hit[] = "WHEN cache_key_hash = '" . esc_sql($key_hash) . "' THEN hit_count + 1";
                $cases_access[] = "WHEN cache_key_hash = '" . esc_sql($key_hash) . "' THEN access_count + 1";
                $cases_last_access[] = "WHEN cache_key_hash = '" . esc_sql($key_hash) . "' THEN " . $stat['timestamp'];
            }
        }
        
        if (!empty($cases_hit)) {
            $sql = "UPDATE {$table_name} SET 
                    hit_count = CASE " . implode(' ', $cases_hit) . " ELSE hit_count END,
                    access_count = CASE " . implode(' ', $cases_access) . " ELSE access_count END,
                    last_access = CASE " . implode(' ', $cases_last_access) . " ELSE last_access END
                    WHERE cache_key_hash IN (" . implode(',', $key_hashes) . ")";
            
            $wpdb->query($sql);
        }
        
        $this->batch_update_stats = [];
    }
    
    private function add_to_writeback_queue($key, $value, $ttl, $options)
    {
        if (!$this->config['writeback']['enabled']) {
            return false;
        }
        
        $this->writeback_queue[$key] = [
            'value' => $value,
            'ttl' => $ttl,
            'options' => $options,
            'timestamp' => time(),
            'priority' => $options['priority'] ?? 'normal',
        ];
        
        $this->memory_cache[$key] = $value;
        
        if (count($this->writeback_queue) > $this->config['writeback']['max_queue']) {
            $this->flush_writeback_queue();
        }
        
        return true;
    }
    
    public function process_writeback_queue()
    {
        if (empty($this->writeback_queue)) {
            return;
        }
        
        $batch_size = $this->config['writeback']['batch_size'];
        $processed = 0;
        
        uasort($this->writeback_queue, function($a, $b) {
            $priority_order = ['high' => 3, 'normal' => 2, 'low' => 1];
            return $priority_order[$b['priority']] - $priority_order[$a['priority']];
        });
        
        foreach ($this->writeback_queue as $key => $data) {
            if ($processed >= $batch_size) {
                break;
            }
            
            $persistent_layers = [self::LAYER_REDIS, self::LAYER_MEMCACHED, self::LAYER_FILE, self::LAYER_DATABASE];
            
            foreach ($persistent_layers as $layer) {
                if (!$this->config['layers'][$layer]) {
                    continue;
                }
                
                $success = $this->set_to_layer($key, $data['value'], $data['ttl'], $layer, $data['options']);
                if ($success) {
                    $this->stats['sets'][$layer]++;
                }
            }
            
            unset($this->writeback_queue[$key]);
            $processed++;
        }
        
        if ($processed > 0) {
            $this->stats['writeback_flushes']++;
        }
    }
    
    public function flush_writeback_queue()
    {
        $original_batch_size = $this->config['writeback']['batch_size'];
        $this->config['writeback']['batch_size'] = count($this->writeback_queue);
        
        $this->process_writeback_queue();
        
        $this->config['writeback']['batch_size'] = $original_batch_size;
    }
    
    public function process_prefetch_queue()
    {
        if (empty($this->prefetch_queue) || !$this->config['prefetch']['enabled']) {
            return;
        }
        
        $batch_size = $this->config['prefetch']['batch_size'];
        $processed = 0;
        
        foreach ($this->prefetch_queue as $index => $item) {
            if ($processed >= $batch_size) {
                break;
            }
            
            $key = $item['key'];
            $callback = $item['callback'];
            $options = $item['options'];
            
            if ($this->get($key) !== null) {
                unset($this->prefetch_queue[$index]);
                continue;
            }
            
            if (is_callable($callback)) {
                try {
                    $value = call_user_func($callback, $key);
                    if ($value !== null) {
                        $this->set($key, $value, null, $options);
                        $this->stats['prefetch_hits']++;
                    }
                } catch (Exception $e) {
                }
            }
            
            unset($this->prefetch_queue[$index]);
            $processed++;
        }
        
        $this->prefetch_queue = array_values($this->prefetch_queue);
    }
    
    private function predict_and_prefetch($accessed_key, $options)
    {
        if (!$this->config['prefetch']['enabled']) {
            return;
        }
        
        $predicted_keys = $this->predict_next_keys($accessed_key);
        
        foreach ($predicted_keys as $key) {
            if (count($this->prefetch_queue) >= $this->config['prefetch']['max_queue']) {
                break;
            }
            
            $this->prefetch_queue[] = [
                'key' => $key,
                'callback' => $this->get_prediction_callback($key),
                'options' => $options,
                'timestamp' => time(),
                'predicted' => true,
            ];
        }
    }
    
    private function predict_next_keys($current_key)
    {
        $predictions = [];
        
        if (preg_match('/^(.+)_(\d+)$/', $current_key, $matches)) {
            $base = $matches[1];
            $number = intval($matches[2]);
            
            for ($i = 1; $i <= 3; $i++) {
                $predictions[] = $base . '_' . ($number + $i);
            }
        }
        
        $related_patterns = [
            'user_' => ['user_profile_', 'user_settings_', 'user_activity_'],
            'channel_' => ['channel_messages_', 'channel_members_', 'channel_info_'],
            'thread_' => ['thread_messages_', 'thread_reactions_', 'thread_info_'],
        ];
        
        foreach ($related_patterns as $pattern => $related) {
            if (strpos($current_key, $pattern) !== false) {
                $id = str_replace($pattern, '', $current_key);
                foreach ($related as $related_pattern) {
                    if (strpos($current_key, $related_pattern) === false) {
                        $predictions[] = $related_pattern . $id;
                    }
                }
            }
        }
        
        return array_slice($predictions, 0, 5);
    }
    
    private function get_prediction_callback($key)
    {
        if (strpos($key, 'user_') === 0) {
            return function($key) {
                return $this->fetch_user_data($key);
            };
        }
        
        if (strpos($key, 'channel_') === 0) {
            return function($key) {
                return $this->fetch_channel_data($key);
            };
        }
        
        if (strpos($key, 'thread_') === 0) {
            return function($key) {
                return $this->fetch_thread_data($key);
            };
        }
        
        return null;
    }
    
    private function record_key_access($key)
    {
        if (!$this->config['hot_detection']['enabled']) {
            return;
        }
        
        $current_time = time();
        $window = $this->config['hot_detection']['window'];
        
        if (!isset($this->hot_keys[$key])) {
            $this->hot_keys[$key] = [
                'count' => 0,
                'first_access' => $current_time,
                'last_access' => $current_time,
                'access_history' => [],
            ];
        }
        
        $this->hot_keys[$key]['count']++;
        $this->hot_keys[$key]['last_access'] = $current_time;
        $this->hot_keys[$key]['access_history'][] = $current_time;
        
        $this->hot_keys[$key]['access_history'] = array_filter(
            $this->hot_keys[$key]['access_history'],
            function($timestamp) use ($current_time, $window) {
                return ($current_time - $timestamp) <= $window;
            }
        );
        
        if (count($this->hot_keys[$key]['access_history']) >= $this->config['hot_detection']['threshold']) {
            $this->promote_to_hot_cache($key, null, []);
        }
    }
    
    private function is_hot_key($key)
    {
        if (!isset($this->hot_keys[$key])) {
            return false;
        }
        
        $window = $this->config['hot_detection']['window'];
        $current_time = time();
        
        $recent_accesses = array_filter(
            $this->hot_keys[$key]['access_history'],
            function($timestamp) use ($current_time, $window) {
                return ($current_time - $timestamp) <= $window;
            }
        );
        
        return count($recent_accesses) >= $this->config['hot_detection']['threshold'];
    }
    
    private function promote_to_hot_cache($key, $value, $options)
    {
        if ($value === null) {
            $value = $this->get($key);
            if ($value === null) {
                return;
            }
        }
        
        $high_priority_layers = [self::LAYER_MEMORY, self::LAYER_APCU];
        
        foreach ($high_priority_layers as $layer) {
            if ($this->config['layers'][$layer]) {
                $ttl = $this->config['ttl'][$layer] * 2;
                $this->set_to_layer($key, $value, $ttl, $layer, $options);
            }
        }
    }
    
    public function detect_hot_keys()
    {
        $current_time = time();
        $window = $this->config['hot_detection']['window'];
        
        foreach ($this->hot_keys as $key => $data) {
            if (($current_time - $data['last_access']) > $window * 2) {
                unset($this->hot_keys[$key]);
            }
        }
        
        $hot_count = 0;
        foreach ($this->hot_keys as $key => $data) {
            if ($this->is_hot_key($key)) {
                $hot_count++;
            }
        }
        
        if ($hot_count > 0) {
        }
    }
    
    /**
     * パターンマッチ削除
     */
    private function delete_by_pattern($pattern, $options)
    {
        $deleted = 0;
        
        foreach (array_keys($this->memory_cache) as $key) {
            if (fnmatch($pattern, $key)) {
                unset($this->memory_cache[$key]);
                $deleted++;
            }
        }
        
        if ($this->redis_client && $this->config['layers'][self::LAYER_REDIS]) {
            $keys = $this->redis_client->keys($pattern);
            if ($keys) {
                $deleted += $this->redis_client->delete($keys);
            }
        }
        
        if ($this->config['layers'][self::LAYER_APCU]) {
            $iterator = new APCUIterator('/^' . preg_quote($pattern, '/') . '/');
            foreach ($iterator as $entry) {
                apcu_delete($entry['key']);
                $deleted++;
            }
        }
        
        $cache_dir = $this->get_cache_dir();
        $files = glob($cache_dir . '/' . str_replace('*', '\\*', $pattern) . '.cache');
        foreach ($files as $file) {
            if (unlink($file)) {
                $deleted++;
            }
        }
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $sql_pattern = str_replace('*', '%', $pattern);
        $result = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$table_name} WHERE cache_key LIKE %s",
            $sql_pattern
        ));
        if ($result !== false) {
            $deleted += $result;
        }
        
        return $deleted;
    }
    
    /**
     * 関連キー削除
     */
    private function delete_related_keys($key)
    {
        $related_patterns = [];
        
        if (preg_match('/^(.+)_(\d+)$/', $key, $matches)) {
            $base = $matches[1];
            $id = $matches[2];
            
            $related_patterns[] = $base . '_*';
            $related_patterns[] = '*_' . $id;
            $related_patterns[] = '*_' . $base . '_*';
        }
        
        foreach ($related_patterns as $pattern) {
            $this->delete_by_pattern($pattern, []);
        }
    }
    
    /**
     * 上位層キャッシュウォーミング
     */
    private function warm_upper_layers($key, $value, $hit_layer, $options)
    {
        $layers = $this->get_enabled_layers();
        $hit_index = array_search($hit_layer, $layers);
        
        if ($hit_index === false) {
            return;
        }
        
        for ($i = 0; $i < $hit_index; $i++) {
            $layer = $layers[$i];
            $ttl = $this->config['ttl'][$layer];
            $this->set_to_layer($key, $value, $ttl, $layer, $options);
        }
    }
    
    /**
     * メモリキャッシュの削除（LRU）
     */
    private function evict_memory_cache()
    {
        if (empty($this->memory_cache)) {
            return;
        }
        
        $candidates = [];
        foreach ($this->memory_cache as $key => $value) {
            if (!$this->is_hot_key($key)) {
                $candidates[$key] = $value;
            }
        }
        
        $to_remove = max(1, count($candidates) * 0.25);
        $removed = 0;
        
        foreach (array_keys($candidates) as $key) {
            if ($removed >= $to_remove) {
                break;
            }
            unset($this->memory_cache[$key]);
            $removed++;
        }
        
    }
    
    /**
     * メモリ使用量取得
     */
    private function get_memory_usage()
    {
        $usage = 0;
        foreach ($this->memory_cache as $value) {
            $usage += strlen(serialize($value));
        }
        return $usage;
    }
    
    /**
     * 統計情報収集
     */
    public function collect_stats()
    {
        $this->stats['memory_usage'] = $this->get_memory_usage();
        
        $stats_file = $this->get_cache_dir() . '/cache_stats.json';
        file_put_contents($stats_file, json_encode($this->stats, JSON_PRETTY_PRINT));
    }
    
    /**
     * キャッシュの完全クリア
     */
    public function flush_all()
    {
        $cleared = 0;
        
        $cleared += count($this->memory_cache);
        $this->memory_cache = [];
        
        if ($this->config['layers'][self::LAYER_APCU]) {
            apcu_clear_cache();
        }
        
        if ($this->redis_client) {
            $this->redis_client->flushDB();
        }
        
        if ($this->memcached_client) {
            $this->memcached_client->flush();
        }
        
        $cache_dir = $this->get_cache_dir();
        $files = glob($cache_dir . '/*.cache');
        foreach ($files as $file) {
            if (unlink($file)) {
                $cleared++;
            }
        }
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        if ($wpdb->get_var("SHOW TABLES LIKE '{$table_name}'")) {
            $result = $wpdb->query("TRUNCATE TABLE {$table_name}");
        }
        
        $this->prefetch_queue = [];
        $this->writeback_queue = [];
        $this->hot_keys = [];
        
        return $cleared;
    }
    
    /**
     * キャッシュ健全性チェック
     */
    public function health_check()
    {
        $health = [
            'status' => 'healthy',
            'issues' => [],
            'layers' => [],
        ];
        
        foreach ($this->config['layers'] as $layer => $enabled) {
            if (!$enabled) {
                continue;
            }
            
            $layer_health = [
                'status' => 'healthy',
                'response_time' => null,
                'error' => null,
            ];
            
            $start_time = microtime(true);
            
            try {
                switch ($layer) {
                    case self::LAYER_MEMORY:
                        $usage = $this->get_memory_usage();
                        if ($usage > $this->config['max_size'][self::LAYER_MEMORY] * 0.9) {
                            $layer_health['status'] = 'warning';
                            $layer_health['error'] = 'High memory usage';
                        }
                        break;
                        
                    case self::LAYER_REDIS:
                        if ($this->redis_client) {
                            $this->redis_client->ping();
                        }
                        break;
                        
                    case self::LAYER_MEMCACHED:
                        if ($this->memcached_client) {
                            $this->memcached_client->get('health_check');
                        }
                        break;
                        
                    case self::LAYER_FILE:
                        $cache_dir = $this->get_cache_dir();
                        if (!is_writable($cache_dir)) {
                            throw new Exception('Cache directory not writable');
                        }
                        break;
                        
                    case self::LAYER_DATABASE:
                        global $wpdb;
                        $wpdb->get_var('SELECT 1');
                        break;
                }
                
                $layer_health['response_time'] = (microtime(true) - $start_time) * 1000;
                
            } catch (Exception $e) {
                $layer_health['status'] = 'error';
                $layer_health['error'] = $e->getMessage();
                $health['status'] = 'degraded';
                $health['issues'][] = "Layer {$layer}: " . $e->getMessage();
            }
            
            $health['layers'][$layer] = $layer_health;
        }
        
        return $health;
    }
    
    /**
     * デストラクタ
     */
    public function __destruct()
    {
        $this->flush_stats_batch();
        
        if (!empty($this->writeback_queue)) {
            $this->process_writeback_queue();
        }
        
        $this->collect_stats();
        
        if ($this->redis_client) {
            $this->redis_client->close();
        }
        
        if ($this->memcached_client) {
            $this->memcached_client->quit();
        }
    }
    
    private function fetch_user_data($key)
    {
        if (preg_match('/user_(\d+)/', $key, $matches)) {
            $user_id = $matches[1];
            global $wpdb;
            return $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}lms_users WHERE id = %d",
                $user_id
            ));
        }
        return null;
    }
    
    private function fetch_channel_data($key)
    {
        if (preg_match('/channel_(\d+)/', $key, $matches)) {
            $channel_id = $matches[1];
            global $wpdb;
            return $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}lms_chat_channels WHERE id = %d",
                $channel_id
            ));
        }
        return null;
    }
    
    private function fetch_thread_data($key)
    {
        if (preg_match('/thread_(\d+)/', $key, $matches)) {
            $thread_id = $matches[1];
            global $wpdb;
            return $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d",
                $thread_id
            ));
        }
        return null;
    }
}