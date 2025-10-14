<?php
/**
 * LMS Ultimate Cache Override
 * WordPressのキャッシュシステムを完全に置き換えて空キーエラーを根絶する
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Ultimate_Cache_Override {
    private static $instance = null;
    private $original_cache = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        global $wp_object_cache;
        if (is_object($wp_object_cache)) {
            $this->original_cache = $wp_object_cache;
        }
    }
    
    public function add($key, $data, $group = '', $expire = 0) {
        // 空キーを完全にブロック
        if (empty($key) || (is_string($key) && trim($key) === '')) {
            return false;  // エラーなしで単純にfalseを返す
        }
        
        // オリジナルのキャッシュがあれば使用
        if ($this->original_cache && method_exists($this->original_cache, 'add')) {
            return $this->original_cache->add($key, $data, $group, (int)$expire);
        }
        
        return true; // フォールバック
    }
    
    public function set($key, $data, $group = '', $expire = 0) {
        if (empty($key) || (is_string($key) && trim($key) === '')) {
            return false;
        }
        
        if ($this->original_cache && method_exists($this->original_cache, 'set')) {
            return $this->original_cache->set($key, $data, $group, (int)$expire);
        }
        
        return true;
    }
    
    public function get($key, $group = '', $force = false, &$found = null) {
        if (empty($key) || (is_string($key) && trim($key) === '')) {
            $found = false;
            return false;
        }
        
        if ($this->original_cache && method_exists($this->original_cache, 'get')) {
            return $this->original_cache->get($key, $group, $force, $found);
        }
        
        $found = false;
        return false;
    }
    
    public function delete($key, $group = '') {
        if (empty($key) || (is_string($key) && trim($key) === '')) {
            return false;
        }
        
        if ($this->original_cache && method_exists($this->original_cache, 'delete')) {
            return $this->original_cache->delete($key, $group);
        }
        
        return false;
    }
    
    public function flush() {
        if ($this->original_cache && method_exists($this->original_cache, 'flush')) {
            return $this->original_cache->flush();
        }
        
        return true;
    }
    
    // その他のWordPressキャッシュメソッドを委譲
    public function __call($name, $arguments) {
        if ($this->original_cache && method_exists($this->original_cache, $name)) {
            return call_user_func_array(array($this->original_cache, $name), $arguments);
        }
        
        return false;
    }
}

function lms_force_override_wp_cache() {
    global $wp_object_cache;
    
    // 常に強制的に置き換え
    $wp_object_cache = LMS_Ultimate_Cache_Override::get_instance();
}

// 複数のタイミングで強制実行
add_action('muplugins_loaded', 'lms_force_override_wp_cache', -99999);
add_action('plugins_loaded', 'lms_force_override_wp_cache', -99999);
add_action('after_setup_theme', 'lms_force_override_wp_cache', -99999);
add_action('init', 'lms_force_override_wp_cache', -99999);
add_action('wp_loaded', 'lms_force_override_wp_cache', -99999);

// テーマが読み込まれた瞬間に実行
lms_force_override_wp_cache();