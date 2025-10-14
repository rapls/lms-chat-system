<?php
/**
 * Ajax パフォーマンス最適化
 * 
 * @package LMS
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 最適化された未読数取得
 */
function lms_ajax_get_unread_count_optimized() {
    try {
        set_time_limit(60);
        ini_set('memory_limit', '256M');
        
        $user_id = function_exists('lms_get_current_user_id') ? lms_get_current_user_id() : get_current_user_id();
        
        if ($user_id) {
            if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
                wp_send_json_error(['message' => 'nonce検証に失敗しました']);
                return;
            }
        } else {
            wp_send_json_error(['message' => '認証が必要です']);
            return;
        }
        
        $cache_key = 'lms_unread_counts_' . $user_id;
        
        $force_refresh = isset($_POST['force_refresh']) && $_POST['force_refresh'];
        
        if (!$force_refresh) {
            $cached_data = wp_cache_get($cache_key);
            if ($cached_data !== false) {
                wp_send_json_success($cached_data);
                return;
            }
        }
        
        global $wpdb;
        $counts = [];
        
        $member_channels = $wpdb->get_col($wpdb->prepare(
            "SELECT channel_id FROM {$wpdb->prefix}lms_chat_channel_members 
             WHERE user_id = %d",
            $user_id
        ));
        
        if (empty($member_channels)) {
            $cached_data = ['channels' => [], 'total' => 0];
            wp_cache_set($cache_key, $cached_data, '', 60); // 60秒キャッシュ
            wp_send_json_success($cached_data);
            return;
        }
        
        $channel_ids_string = implode(',', array_map('intval', $member_channels));
        
        $unread_counts = $wpdb->get_results($wpdb->prepare(
            "SELECT 
                m.channel_id,
                COUNT(DISTINCT m.id) as unread_count
             FROM {$wpdb->prefix}lms_chat_messages m
             LEFT JOIN {$wpdb->prefix}lms_chat_last_viewed lv 
                ON lv.channel_id = m.channel_id AND lv.user_id = %d
             WHERE m.channel_id IN ($channel_ids_string)
                AND m.user_id != %d
                AND m.deleted_at IS NULL
                AND (lv.last_viewed_at IS NULL OR m.created_at > lv.last_viewed_at)
             GROUP BY m.channel_id",
            $user_id,
            $user_id
        ), ARRAY_A);
        
        $total = 0;
        foreach ($unread_counts as $row) {
            $count = intval($row['unread_count']);
            $counts[$row['channel_id']] = $count;
            $total += $count;
        }
        
        $thread_unread = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT tm.id)
             FROM {$wpdb->prefix}lms_chat_thread_messages tm
             JOIN {$wpdb->prefix}lms_chat_messages m ON tm.parent_message_id = m.id
             LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed tlv 
                ON tlv.parent_message_id = tm.parent_message_id AND tlv.user_id = %d
             WHERE m.channel_id IN ($channel_ids_string)
                AND tm.user_id != %d
                AND tm.deleted_at IS NULL
                AND (tlv.last_viewed_at IS NULL OR tm.created_at > tlv.last_viewed_at)",
            $user_id,
            $user_id
        ));
        
        $result = [
            'channels' => $counts,
            'total' => $total + intval($thread_unread),
            'total_unread' => $total + intval($thread_unread) // バッジコントローラー用
        ];
        
        wp_cache_set($cache_key, $result, '', 10); // 10秒キャッシュ（NEWマーク表示後の更新を早める）
        
        wp_send_json_success($result);
        
    } catch (Exception $e) {
        wp_send_json_error(['message' => 'エラーが発生しました: ' . $e->getMessage()]);
    }
}

/**
 * 最適化されたユーザー一覧取得
 */
function lms_ajax_get_users_optimized() {
    try {
        set_time_limit(60);
        ini_set('memory_limit', '256M');
        
        $user_id = function_exists('lms_get_current_user_id') ? lms_get_current_user_id() : get_current_user_id();
        
        if ($user_id && !check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
        }
        
        $cache_key = 'lms_chat_users_list';
        
        $cached_data = wp_cache_get($cache_key);
        if ($cached_data !== false) {
            wp_send_json_success($cached_data);
            return;
        }
        
        global $wpdb;
        
        $table_exists = $wpdb->get_var(
            "SELECT COUNT(*) FROM information_schema.tables 
             WHERE table_schema = DATABASE() 
             AND table_name = '{$wpdb->prefix}lms_chat_channels'"
        );
        
        if (!$table_exists) {
            wp_send_json_error(['message' => 'チャットシステムが初期化されていません']);
            return;
        }
        
        $users = $wpdb->get_results(
            "SELECT 
                u.ID as id,
                u.user_login as username,
                u.display_name as displayName,
                um1.meta_value as firstName,
                um2.meta_value as lastName,
                um3.meta_value as nickname,
                u.ID as avatarId
             FROM {$wpdb->users} u
             LEFT JOIN {$wpdb->usermeta} um1 
                ON u.ID = um1.user_id AND um1.meta_key = 'first_name'
             LEFT JOIN {$wpdb->usermeta} um2 
                ON u.ID = um2.user_id AND um2.meta_key = 'last_name'  
             LEFT JOIN {$wpdb->usermeta} um3
                ON u.ID = um3.user_id AND um3.meta_key = 'nickname'
             WHERE u.ID != 0
             ORDER BY u.display_name ASC
             LIMIT 500",
            ARRAY_A
        );
        
        $formatted_users = array_map(function($user) {
            return [
                'id' => intval($user['id']),
                'username' => $user['username'],
                'displayName' => $user['displayName'] ?: $user['username'],
                'firstName' => $user['firstName'] ?: '',
                'lastName' => $user['lastName'] ?: '',
                'fullName' => trim(($user['firstName'] ?: '') . ' ' . ($user['lastName'] ?: '')),
                'nickname' => $user['nickname'] ?: $user['displayName'],
                'avatarId' => intval($user['avatarId']) // アバターURLは必要時に生成
            ];
        }, $users);
        
        wp_cache_set($cache_key, $formatted_users, '', 300);
        
        wp_send_json_success($formatted_users);
        
    } catch (Exception $e) {
        wp_send_json_error(['message' => 'エラーが発生しました: ' . $e->getMessage()]);
    }
}

/**
 * アバターURL取得用のエンドポイント（必要に応じて）
 */
function lms_ajax_get_avatar_urls() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
        wp_send_json_error(['message' => 'nonce検証に失敗しました']);
        return;
    }
    
    $user_ids = isset($_POST['user_ids']) ? array_map('intval', $_POST['user_ids']) : [];
    
    if (empty($user_ids)) {
        wp_send_json_error(['message' => 'ユーザーIDが必要です']);
        return;
    }
    
    $avatars = [];
    foreach ($user_ids as $user_id) {
        $avatars[$user_id] = get_avatar_url($user_id, ['size' => 40]);
    }
    
    wp_send_json_success($avatars);
}

add_action('wp_ajax_lms_get_avatar_urls', 'lms_ajax_get_avatar_urls');
add_action('wp_ajax_nopriv_lms_get_avatar_urls', 'lms_ajax_get_avatar_urls');