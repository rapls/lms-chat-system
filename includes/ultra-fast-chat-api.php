<?php
/**
 * 超高速チャット API - リロード・チャンネル切り替え特化版
 *
 * 最小限のクエリと積極的なキャッシュで高速化を実現
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

class Ultra_Fast_Chat_API {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        add_action('wp_ajax_lms_fast_get_messages', array($this, 'fast_get_messages'));
        add_action('wp_ajax_nopriv_lms_fast_get_messages', array($this, 'fast_get_messages'));
        
        add_action('wp_ajax_lms_fast_switch_channel', array($this, 'fast_switch_channel'));
        add_action('wp_ajax_nopriv_lms_fast_switch_channel', array($this, 'fast_switch_channel'));
        
        add_action('wp_ajax_lms_fast_send_message', array($this, 'fast_send_message'));
        add_action('wp_ajax_nopriv_lms_fast_send_message', array($this, 'fast_send_message'));
    }
    
    /**
     * 超高速メッセージ取得 - チャンネル切り替え専用
     */
    public function fast_get_messages() {
        try {
            // 基本検証（軽量版）
            $user_id = get_current_user_id();
            if (!$user_id) {
                wp_send_json_error(['message' => '認証が必要です']);
                return;
            }
            
            $channel_id = intval($_POST['channel_id'] ?? 0);
            if (!$channel_id) {
                wp_send_json_error(['message' => 'チャンネルIDが必要です']);
                return;
            }
            
            // キャッシュキー（ユーザー毎・チャンネル毎）
            $cache_key = "lms_fast_messages_{$channel_id}_{$user_id}";
            
            // キャッシュから取得（5秒間キャッシュ）
            $force_refresh = isset($_POST['force_refresh']) && $_POST['force_refresh'];
            if (!$force_refresh) {
                $cached_data = wp_cache_get($cache_key);
                if ($cached_data !== false) {
                    wp_send_json_success($cached_data);
                    return;
                }
            }
            
            global $wpdb;
            
            // メンバーシップ確認（最小限のクエリ）
            $is_member = $wpdb->get_var($wpdb->prepare(
                "SELECT 1 FROM {$wpdb->prefix}lms_chat_channel_members 
                 WHERE user_id = %d AND channel_id = %d LIMIT 1",
                $user_id,
                $channel_id
            ));
            
            if (!$is_member) {
                wp_send_json_error(['message' => 'このチャンネルへのアクセス権限がありません']);
                return;
            }
            
            // 最小限のカラムでメッセージ取得（最新20件）
            $messages = $wpdb->get_results($wpdb->prepare(
                "SELECT 
                    m.id,
                    m.content,
                    m.user_id,
                    m.username,
                    m.created_at,
                    m.file_url,
                    m.file_name
                 FROM {$wpdb->prefix}lms_chat_messages m
                 WHERE m.channel_id = %d 
                   AND m.deleted_at IS NULL
                 ORDER BY m.created_at DESC
                 LIMIT 20",
                $channel_id
            ), ARRAY_A);
            
            // 順序を正しく（古い順）
            $messages = array_reverse($messages);
            
            // レスポンスデータ（最小限）
            $response_data = [
                'messages' => $messages,
                'channel_id' => $channel_id,
                'count' => count($messages),
                'timestamp' => time()
            ];
            
            // キャッシュに保存（5秒）
            wp_cache_set($cache_key, $response_data, '', 5);
            
            wp_send_json_success($response_data);
            
        } catch (Exception $e) {
            wp_send_json_error([
                'message' => 'メッセージの取得に失敗しました',
                'error' => $e->getMessage()
            ]);
        }
    }
    
    /**
     * 超高速チャンネル切り替え
     */
    public function fast_switch_channel() {
        try {
            $user_id = get_current_user_id();
            if (!$user_id) {
                wp_send_json_error(['message' => '認証が必要です']);
                return;
            }
            
            $channel_id = intval($_POST['channel_id'] ?? 0);
            if (!$channel_id) {
                wp_send_json_error(['message' => 'チャンネルIDが必要です']);
                return;
            }
            
            global $wpdb;
            
            // 最終閲覧時刻更新（高速なREPLACE文使用）
            $wpdb->query($wpdb->prepare(
                "REPLACE INTO {$wpdb->prefix}lms_chat_last_viewed 
                 (user_id, channel_id, last_viewed_at) 
                 VALUES (%d, %d, NOW())",
                $user_id,
                $channel_id
            ));
            
            // メッセージ取得も同時実行
            $this->fast_get_messages();
            
        } catch (Exception $e) {
            wp_send_json_error([
                'message' => 'チャンネル切り替えに失敗しました',
                'error' => $e->getMessage()
            ]);
        }
    }
    
    /**
     * 超高速メッセージ送信
     */
    public function fast_send_message() {
        try {
            $user_id = get_current_user_id();
            if (!$user_id) {
                wp_send_json_error(['message' => '認証が必要です']);
                return;
            }
            
            $channel_id = intval($_POST['channel_id'] ?? 0);
            $content = sanitize_textarea_field($_POST['content'] ?? '');
            
            if (!$channel_id || !$content) {
                wp_send_json_error(['message' => '必要な情報が不足しています']);
                return;
            }
            
            global $wpdb;
            
            // ユーザー情報取得（キャッシュ利用）
            $user_info = wp_cache_get("user_info_{$user_id}");
            if ($user_info === false) {
                $user_info = $wpdb->get_row($wpdb->prepare(
                    "SELECT user_login as username, display_name 
                     FROM {$wpdb->users} 
                     WHERE ID = %d",
                    $user_id
                ), ARRAY_A);
                wp_cache_set("user_info_{$user_id}", $user_info, '', 300); // 5分キャッシュ
            }
            
            $username = $user_info['display_name'] ?: $user_info['username'];
            
            // メッセージ挿入（最小限のカラム）
            $result = $wpdb->insert(
                $wpdb->prefix . 'lms_chat_messages',
                [
                    'channel_id' => $channel_id,
                    'user_id' => $user_id,
                    'username' => $username,
                    'content' => $content,
                    'created_at' => current_time('mysql')
                ],
                ['%d', '%d', '%s', '%s', '%s']
            );
            
            if ($result === false) {
                wp_send_json_error(['message' => 'メッセージの送信に失敗しました']);
                return;
            }
            
            $message_id = $wpdb->insert_id;
            
            // 送信されたメッセージデータ
            $message_data = [
                'id' => $message_id,
                'channel_id' => $channel_id,
                'user_id' => $user_id,
                'username' => $username,
                'content' => $content,
                'created_at' => current_time('mysql'),
                'file_url' => null,
                'file_name' => null
            ];
            
            // 関連キャッシュを無効化
            $cache_pattern = "lms_fast_messages_{$channel_id}_*";
            wp_cache_flush(); // 簡単な方法で全無効化
            
            wp_send_json_success([
                'message' => $message_data,
                'message_id' => $message_id
            ]);
            
        } catch (Exception $e) {
            wp_send_json_error([
                'message' => 'メッセージの送信に失敗しました',
                'error' => $e->getMessage()
            ]);
        }
    }
    
    /**
     * 超軽量な未読数取得
     */
    public function fast_get_unread_count() {
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_success(['total' => 0]);
            return;
        }
        
        // 簡潔なキャッシュキー
        $cache_key = "fast_unread_{$user_id}";
        $cached = wp_cache_get($cache_key);
        
        if ($cached !== false) {
            wp_send_json_success($cached);
            return;
        }
        
        global $wpdb;
        
        // 最も簡単なクエリで未読数取得
        $total = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT m.id)
             FROM {$wpdb->prefix}lms_chat_messages m
             JOIN {$wpdb->prefix}lms_chat_channel_members cm ON m.channel_id = cm.channel_id
             LEFT JOIN {$wpdb->prefix}lms_chat_last_viewed lv ON lv.channel_id = m.channel_id AND lv.user_id = %d
             WHERE cm.user_id = %d 
               AND m.user_id != %d 
               AND m.deleted_at IS NULL
               AND (lv.last_viewed_at IS NULL OR m.created_at > lv.last_viewed_at)",
            $user_id, $user_id, $user_id
        ));
        
        $result = ['total' => intval($total)];
        wp_cache_set($cache_key, $result, '', 10); // 10秒キャッシュ
        
        wp_send_json_success($result);
    }
}

// インスタンス化
Ultra_Fast_Chat_API::get_instance();