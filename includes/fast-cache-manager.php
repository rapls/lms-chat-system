<?php
/**
 * 高速キャッシュマネージャー
 * チャット用の最適化されたキャッシュシステム
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Fast_Cache_Manager
{
    private static $instance = null;
    private $cache_prefix = 'lms_fast_';
    private $default_expiration = 300; // 5分

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
     * チャンネルメッセージキャッシュ
     */
    public function cache_channel_messages($channel_id, $page, $messages)
    {
        $key = $this->cache_prefix . "ch_{$channel_id}_p_{$page}";
        return wp_cache_set($key, $messages, 'lms_chat', $this->default_expiration);
    }

    /**
     * チャンネルメッセージキャッシュ取得
     */
    public function get_channel_messages($channel_id, $page)
    {
        $key = $this->cache_prefix . "ch_{$channel_id}_p_{$page}";
        return wp_cache_get($key, 'lms_chat');
    }

    /**
     * チャンネルメッセージキャッシュ削除
     */
    public function clear_channel_messages($channel_id)
    {
        for ($page = 1; $page <= 10; $page++) {
            $key = $this->cache_prefix . "ch_{$channel_id}_p_{$page}";
            wp_cache_delete($key, 'lms_chat');
        }
        
        $stats_key = $this->cache_prefix . "ch_stats_{$channel_id}";
        wp_cache_delete($stats_key, 'lms_chat');
    }

    /**
     * ユーザーチャンネルリストキャッシュ
     */
    public function cache_user_channels($user_id, $channels)
    {
        $key = $this->cache_prefix . "user_ch_{$user_id}";
        return wp_cache_set($key, $channels, 'lms_chat', 600); // 10分
    }

    /**
     * ユーザーチャンネルリストキャッシュ取得
     */
    public function get_user_channels($user_id)
    {
        $key = $this->cache_prefix . "user_ch_{$user_id}";
        return wp_cache_get($key, 'lms_chat');
    }

    /**
     * ユーザーチャンネルリストキャッシュ削除
     */
    public function clear_user_channels($user_id)
    {
        $key = $this->cache_prefix . "user_ch_{$user_id}";
        wp_cache_delete($key, 'lms_chat');
    }

    /**
     * 未読数キャッシュ
     */
    public function cache_unread_counts($user_id, $counts)
    {
        $key = $this->cache_prefix . "unread_{$user_id}";
        return wp_cache_set($key, $counts, 'lms_chat', 60); // 1分
    }

    /**
     * 未読数キャッシュ取得
     */
    public function get_unread_counts($user_id)
    {
        $key = $this->cache_prefix . "unread_{$user_id}";
        return wp_cache_get($key, 'lms_chat');
    }

    /**
     * 未読数キャッシュ削除
     */
    public function clear_unread_counts($user_id)
    {
        $key = $this->cache_prefix . "unread_{$user_id}";
        wp_cache_delete($key, 'lms_chat');
    }

    /**
     * スレッドメッセージキャッシュ
     */
    public function cache_thread_messages($thread_id, $messages)
    {
        $key = $this->cache_prefix . "thread_{$thread_id}";
        return wp_cache_set($key, $messages, 'lms_chat', 180); // 3分
    }

    /**
     * スレッドメッセージキャッシュ取得
     */
    public function get_thread_messages($thread_id)
    {
        $key = $this->cache_prefix . "thread_{$thread_id}";
        return wp_cache_get($key, 'lms_chat');
    }

    /**
     * スレッドメッセージキャッシュ削除
     */
    public function clear_thread_messages($thread_id)
    {
        $key = $this->cache_prefix . "thread_{$thread_id}";
        wp_cache_delete($key, 'lms_chat');
    }

    /**
     * メッセージ送信時のキャッシュクリア
     */
    public function clear_message_caches($channel_id, $user_id, $thread_id = null)
    {
        $this->clear_channel_messages($channel_id);
        
        $this->clear_unread_counts($user_id);
        
        global $wpdb;
        $member_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT user_id FROM {$wpdb->prefix}lms_chat_channel_members WHERE channel_id = %d",
            $channel_id
        ));
        
        foreach ($member_ids as $member_id) {
            $this->clear_unread_counts($member_id);
        }
        
        if ($thread_id) {
            $this->clear_thread_messages($thread_id);
        }
    }

    /**
     * リアクション追加時のキャッシュクリア
     */
    public function clear_reaction_caches($message_id, $channel_id)
    {
        $this->clear_channel_messages($channel_id);
    }

    /**
     * チャンネル統計キャッシュ
     */
    public function cache_channel_stats($channel_id, $stats)
    {
        $key = $this->cache_prefix . "ch_stats_{$channel_id}";
        return wp_cache_set($key, $stats, 'lms_chat', 600); // 10分
    }

    /**
     * チャンネル統計キャッシュ取得
     */
    public function get_channel_stats($channel_id)
    {
        $key = $this->cache_prefix . "ch_stats_{$channel_id}";
        return wp_cache_get($key, 'lms_chat');
    }

    /**
     * 削除メッセージ通知キャッシュ
     */
    public function notify_message_deleted($message_id, $channel_id, $thread_id = null)
    {
        $cache_key = $thread_id > 0 ? "deleted_thread_msgs_{$thread_id}" : "deleted_channel_msgs_{$channel_id}";
        
        $deleted_list = wp_cache_get($cache_key, 'lms_chat');
        if (!is_array($deleted_list)) {
            $deleted_list = [];
        }
        
        $deleted_list[] = $message_id;
        
        if (count($deleted_list) > 10) {
            $deleted_list = array_slice($deleted_list, -10);
        }
        
        wp_cache_set($cache_key, $deleted_list, 'lms_chat', 60);
        
        $this->clear_channel_messages($channel_id);
        if ($thread_id) {
            $this->clear_thread_messages($thread_id);
        }
    }

    /**
     * システム全体のキャッシュクリア
     */
    public function clear_all_caches()
    {
        wp_cache_flush_group('lms_chat');
    }

    /**
     * キャッシュ統計取得
     */
    public function get_cache_stats()
    {
        return [
            'prefix' => $this->cache_prefix,
            'default_expiration' => $this->default_expiration,
            'timestamp' => time()
        ];
    }

    /**
     * デバッグ用：特定キーの存在確認
     */
    public function cache_exists($key)
    {
        $value = wp_cache_get($key, 'lms_chat');
        return $value !== false;
    }

    /**
     * 期限付きキャッシュ設定
     */
    public function set_temporary_cache($key, $value, $expiration = 60)
    {
        $full_key = $this->cache_prefix . $key;
        return wp_cache_set($full_key, $value, 'lms_chat', $expiration);
    }

    /**
     * 期限付きキャッシュ取得
     */
    public function get_temporary_cache($key)
    {
        $full_key = $this->cache_prefix . $key;
        return wp_cache_get($full_key, 'lms_chat');
    }
}