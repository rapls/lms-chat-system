<?php
/**
 * LMSキャッシュ - データベース層とライトバック機能
 * 
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * データベースキャッシュ層の実装
 */
trait LMS_Cache_Database_Layer
{
    /**
     * データベースキャッシュテーブル作成
     */
    private function ensure_cache_table()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            cache_key varchar(255) NOT NULL,
            cache_value longtext NOT NULL,
            cache_type enum('temporary', 'persistent', 'session', 'user', 'global') DEFAULT 'temporary',
            expires_at datetime NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            access_count int(11) DEFAULT 0,
            last_access datetime DEFAULT CURRENT_TIMESTAMP,
            data_size int(11) DEFAULT 0,
            is_compressed tinyint(1) DEFAULT 0,
            priority enum('low', 'normal', 'high') DEFAULT 'normal',
            tags text NULL,
            PRIMARY KEY (id),
            UNIQUE KEY unique_cache_key (cache_key),
            KEY idx_expires_at (expires_at),
            KEY idx_cache_type (cache_type),
            KEY idx_last_access (last_access),
            KEY idx_priority (priority),
            KEY idx_data_size (data_size)
        ) {$charset_collate}";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        $wpdb->query("OPTIMIZE TABLE {$table_name}");
    }
    
    /**
     * データベースからキャッシュ取得
     */
    private function get_from_database($key)
    {
        global $wpdb;
        
        $this->ensure_cache_table();
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        
        $result = $wpdb->get_row($wpdb->prepare(
            "SELECT cache_value, expires_at, is_compressed, access_count 
             FROM {$table_name} 
             WHERE cache_key = %s AND expires_at > NOW()",
            $key
        ));
        
        if (!$result) {
            return null;
        }
        
        $wpdb->query($wpdb->prepare(
            "UPDATE {$table_name} 
             SET access_count = access_count + 1, last_access = NOW() 
             WHERE cache_key = %s",
            $key
        ));
        
        return $result->cache_value;
    }
    
    /**
     * データベースにキャッシュ保存
     */
    private function set_to_database($key, $value, $ttl)
    {
        global $wpdb;
        
        $this->ensure_cache_table();
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        
        $expires_at = date('Y-m-d H:i:s', time() + $ttl);
        $data_size = strlen($value);
        $is_compressed = strpos($value, 'H4sI') === 0 ? 1 : 0; // gzip判定
        
        $result = $wpdb->replace(
            $table_name,
            [
                'cache_key' => $key,
                'cache_value' => $value,
                'expires_at' => $expires_at,
                'data_size' => $data_size,
                'is_compressed' => $is_compressed,
                'priority' => 'normal',
            ],
            ['%s', '%s', '%s', '%d', '%d', '%s']
        );
        
        $this->manage_database_size();
        
        return $result !== false;
    }
    
    /**
     * データベースからキャッシュ削除
     */
    private function delete_from_database($key)
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        
        return $wpdb->delete(
            $table_name,
            ['cache_key' => $key],
            ['%s']
        ) !== false;
    }
    
    /**
     * データベースサイズ管理
     */
    private function manage_database_size()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        $max_size = $this->config['max_size'][self::LAYER_DATABASE] ?? (100 * 1024 * 1024); // 100MB
        
        $current_size = $wpdb->get_var(
            "SELECT SUM(data_size) FROM {$table_name}"
        );
        
        if ($current_size > $max_size) {
            $wpdb->query("
                DELETE FROM {$table_name}
                WHERE expires_at < NOW() OR id IN (
                    SELECT id FROM (
                        SELECT id FROM {$table_name}
                        ORDER BY access_count ASC, last_access ASC
                        LIMIT 1000
                    ) tmp
                )
            ");
        }
    }
    
    /**
     * 期限切れキャッシュクリーンアップ
     */
    public function cleanup_expired()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_cache_storage';
        
        $deleted = $wpdb->query(
            "DELETE FROM {$table_name} WHERE expires_at < NOW()"
        );
        
        if ($deleted > 0) {
            $wpdb->query("OPTIMIZE TABLE {$table_name}");
        }
        
        return $deleted;
    }
}

/**
 * ライトバックキャッシュ機能
 */
trait LMS_Cache_Writeback_Layer
{
    /**
     * ライトバックキューに追加
     */
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
    
    /**
     * ライトバックキューの処理
     */
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
    
    /**
     * ライトバックキューの強制フラッシュ
     */
    public function flush_writeback_queue()
    {
        $original_batch_size = $this->config['writeback']['batch_size'];
        $this->config['writeback']['batch_size'] = count($this->writeback_queue);
        
        $this->process_writeback_queue();
        
        $this->config['writeback']['batch_size'] = $original_batch_size;
    }
}

/**
 * 先読みキャッシュ機能
 */
trait LMS_Cache_Prefetch_Layer
{
    /**
     * 先読みキューの処理
     */
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
    
    /**
     * 予測的先読み
     */
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
    
    /**
     * 次のキーを予測
     */
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
        
        return array_slice($predictions, 0, 5); // 最大5つまで
    }
    
    /**
     * 予測用コールバック取得
     */
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
}

/**
 * ホットデータ検出とパフォーマンス最適化
 */
trait LMS_Cache_Hot_Data_Detection
{
    /**
     * キーアクセスの記録
     */
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
    
    /**
     * ホットキー判定
     */
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
    
    /**
     * ホットキーの上位層への昇格
     */
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
                $ttl = $this->config['ttl'][$layer] * 2; // TTLを2倍に延長
                $this->set_to_layer($key, $value, $ttl, $layer, $options);
            }
        }
    }
    
    /**
     * ホットキー検出とクリーンアップ
     */
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
}
