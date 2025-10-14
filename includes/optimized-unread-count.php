<?php
/**
 * 最適化された未読カウント取得機能
 * 
 * 主な改善点：
 * 1. 単一クエリでメイン・スレッド未読数を同時取得
 * 2. 30秒間のキャッシュ実装
 * 3. インデックス効率を考慮したクエリ構造
 * 4. 不要な処理の削減
 */

class LMS_Optimized_Unread_Count {
    
    private $cache_helper;
    private $cache_duration = 30; // 30秒キャッシュ
    
    public function __construct() {
        $this->cache_helper = LMS_Cache_Helper::get_instance();
    }
    
    /**
     * 最適化された未読カウント取得
     * 
     * @param int $user_id ユーザーID
     * @return array チャンネルID => 未読数の配列
     */
    public function get_optimized_unread_counts($user_id) {
        global $wpdb;
        
        $cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_unread_counts_optimized');
        $cached_result = $this->cache_helper->get($cache_key);
        
        if ($cached_result !== false) {
            return $cached_result;
        }
        
        $sql = "
            SELECT 
                c.id as channel_id,
                COALESCE(main_unread.count, 0) + COALESCE(thread_unread.count, 0) as total_unread
            FROM {$wpdb->prefix}lms_chat_channels c
            INNER JOIN {$wpdb->prefix}lms_chat_channel_members cm 
                ON c.id = cm.channel_id AND cm.user_id = %d
            
            -- メインメッセージの未読数
            LEFT JOIN (
                SELECT 
                    m.channel_id,
                    COUNT(DISTINCT m.id) as count
                FROM {$wpdb->prefix}lms_chat_messages m
                LEFT JOIN {$wpdb->prefix}lms_chat_last_viewed lv
                    ON lv.channel_id = m.channel_id AND lv.user_id = %d
                WHERE m.user_id != %d 
                    AND m.deleted_at IS NULL
                    AND m.created_at > COALESCE(lv.last_viewed_at, '1970-01-01')
                GROUP BY m.channel_id
            ) main_unread ON main_unread.channel_id = c.id
            
            -- スレッドメッセージの未読数
            LEFT JOIN (
                SELECT 
                    pm.channel_id,
                    COUNT(DISTINCT tm.id) as count
                FROM {$wpdb->prefix}lms_chat_thread_messages tm
                INNER JOIN {$wpdb->prefix}lms_chat_messages pm 
                    ON tm.parent_message_id = pm.id
                LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed tlv
                    ON tlv.parent_message_id = tm.parent_message_id AND tlv.user_id = %d
                WHERE tm.user_id != %d 
                    AND tm.deleted_at IS NULL
                    AND pm.deleted_at IS NULL
                    AND tm.created_at > COALESCE(tlv.last_viewed_at, '1970-01-01')
                GROUP BY pm.channel_id
            ) thread_unread ON thread_unread.channel_id = c.id
        ";
        
        $results = $wpdb->get_results($wpdb->prepare($sql, $user_id, $user_id, $user_id, $user_id, $user_id));
        
        $unread_counts = array();
        foreach ($results as $result) {
            $unread_counts[$result->channel_id] = (int)$result->total_unread;
        }
        
        $this->cache_helper->set($cache_key, $unread_counts, $this->cache_duration);
        
        return $unread_counts;
    }
    
    /**
     * 最適化されたAjaxハンドラー
     */
    public function handle_optimized_get_unread_count() {
        if (!wp_verify_nonce($_REQUEST['nonce'] ?? '', 'lms_ajax_nonce')) {
            wp_send_json_error('Invalid nonce');
            return;
        }
        
        if (!isset($_SESSION['lms_user_id'])) {
            wp_send_json_error('ユーザーIDが不正です。');
            return;
        }
        
        $user_id = (int)$_SESSION['lms_user_id'];
        
        try {
            $counts = $this->get_optimized_unread_counts($user_id);
            wp_send_json_success($counts);
        } catch (Exception $e) {
            wp_send_json_error('未読カウント取得でエラーが発生しました');
        }
    }
    
    /**
     * キャッシュ無効化（メッセージ送信・既読時に呼び出し）
     */
    public function invalidate_cache($user_id) {
        $cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_unread_counts_optimized');
        $this->cache_helper->delete($cache_key);
    }
}

/**
 * データベースインデックス最適化用SQL
 * 
 * 以下のインデックスを追加することを推奨：
 */
/*
-- メッセージテーブル用複合インデックス
ALTER TABLE wp_lms_chat_messages 
ADD INDEX idx_channel_user_created_deleted (channel_id, user_id, created_at, deleted_at);

-- スレッドメッセージテーブル用複合インデックス  
ALTER TABLE wp_lms_chat_thread_messages 
ADD INDEX idx_parent_user_created_deleted (parent_message_id, user_id, created_at, deleted_at);

-- 最終閲覧時刻テーブル用インデックス
ALTER TABLE wp_lms_chat_last_viewed 
ADD INDEX idx_user_channel_viewed (user_id, channel_id, last_viewed_at);

-- スレッド最終閲覧時刻テーブル用インデックス
ALTER TABLE wp_lms_chat_thread_last_viewed 
ADD INDEX idx_user_parent_viewed (user_id, parent_message_id, last_viewed_at);
*/