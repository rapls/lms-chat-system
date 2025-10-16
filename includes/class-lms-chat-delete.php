<?php
/**
 * メッセージ削除処理を簡素化した新しいハンドラー
 */

if (!defined('ABSPATH')) {
    exit;
}

function handle_message_delete() {
    global $wpdb;
    
    if (!isset($_POST['nonce'])) {
        wp_send_json_error('Nonce missing');
        return;
    }
    
    $nonce = $_POST['nonce'];
    $valid = false;
    $actions = ['lms_chat_nonce', 'lms_ajax_nonce', 'lms_nonce'];
    
    foreach ($actions as $action) {
        if (wp_verify_nonce($nonce, $action)) {
            $valid = true;
            break;
        }
    }
    
    if (!$valid) {
        wp_send_json_error('Invalid nonce');
        return;
    }
    
    $current_user_id = 0;
    if (isset($_SESSION['lms_user_id'])) {
        $current_user_id = intval($_SESSION['lms_user_id']);
    }
    
    if ($current_user_id > 0) {
        $delete_rate_limit_key = 'lms_delete_rate_limit_' . $current_user_id;
        $recent_deletes = get_transient($delete_rate_limit_key);
        
        if (!$recent_deletes || !is_array($recent_deletes)) {
            $recent_deletes = array();
        }
        
        $current_time = time();
        $recent_deletes = array_filter($recent_deletes, function($timestamp) use ($current_time) {
            return ($current_time - $timestamp) < 60; // 60秒以内
        });
        
        if (count($recent_deletes) >= 30) {
            wp_send_json_error('削除頻度が高すぎます。しばらく待ってから再試行してください。');
            return;
        }
        
        $recent_deletes[] = $current_time;
        set_transient($delete_rate_limit_key, $recent_deletes, 3600); // 1時間保持
    }
    
    $message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
    
    $is_group_delete = false;
    $group_message_ids = array();
    $group_total_messages = 0;
    
    $target_message = $wpdb->get_row($wpdb->prepare(
        "SELECT id, channel_id, user_id, created_at FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
        $message_id
    ));
    
    if ($target_message) {
        $message_date = date('Y-m-d', strtotime($target_message->created_at));
        
        $all_date_messages = $wpdb->get_results($wpdb->prepare(
            "SELECT id, user_id FROM {$wpdb->prefix}lms_chat_messages 
             WHERE channel_id = %d AND DATE(created_at) = %s
             ORDER BY id ASC",
            $target_message->channel_id, $message_date
        ));
        
        $deletion_log_table = $wpdb->prefix . 'lms_chat_deletion_log';
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$deletion_log_table'");
        
        if ($table_exists) {
            $deleted_messages = $wpdb->get_results($wpdb->prepare(
                "SELECT message_id as id, user_id FROM {$deletion_log_table}
                 WHERE channel_id = %d 
                 AND message_type = 'main'
                 AND DATE(deleted_at) = %s
                 AND deleted_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
                $target_message->channel_id, $message_date
            ));
            
            if (!empty($deleted_messages)) {
                foreach ($deleted_messages as $deleted_msg) {
                    $found = false;
                    foreach ($all_date_messages as $existing_msg) {
                        if ($existing_msg->id == $deleted_msg->id) {
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $all_date_messages[] = $deleted_msg;
                    }
                }
            }
        }
        
        $is_group_delete = false;
        $group_message_ids = array();
        $group_total_messages = 0;
        
    }
    
    $is_wide_search = ($message_id === 0);
    
    
    if ($is_wide_search) {
        $current_user_id = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
        if (!$current_user_id && isset($_SESSION['user_id'])) {
            $current_user_id = intval($_SESSION['user_id']);
        }
        
        
        $delete_count = isset($_POST['delete_count']) ? intval($_POST['delete_count']) : 1;
        $delete_count = max(1, min($delete_count, 10)); // 1-10の範囲に制限
        $search_limit = max($delete_count * 2, 10); // 削除希望数の2倍、最低10件取得
        
        $user_recent_messages = [];
        if ($current_user_id > 0) {
            $user_recent_messages = $wpdb->get_results($wpdb->prepare(
                "SELECT id, created_at FROM {$wpdb->prefix}lms_chat_messages 
                 WHERE user_id = %d AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
                 ORDER BY id DESC LIMIT %d",
                $current_user_id, $search_limit
            ));
            
            $user_recent_thread_messages = $wpdb->get_results($wpdb->prepare(
                "SELECT id, created_at FROM {$wpdb->prefix}lms_chat_thread_messages 
                 WHERE user_id = %d AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
                 ORDER BY id DESC LIMIT %d",
                $current_user_id, $search_limit
            ));
        }
        
        $recent_messages = $wpdb->get_results($wpdb->prepare(
            "SELECT id, created_at FROM {$wpdb->prefix}lms_chat_messages 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
             ORDER BY id DESC LIMIT %d",
            $search_limit
        ));
        
        $recent_thread_messages = $wpdb->get_results($wpdb->prepare(
            "SELECT id, created_at FROM {$wpdb->prefix}lms_chat_thread_messages 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
             ORDER BY id DESC LIMIT %d",
            $search_limit
        ));
        
        
        $target_ids = [];
        
        $all_messages = [];
        
        foreach ($user_recent_messages as $msg) {
            $all_messages[] = (object)[
                'id' => $msg->id,
                'created_at' => $msg->created_at,
                'priority' => 1 // 最高優先度
            ];
        }
        
        foreach ($user_recent_thread_messages as $msg) {
            if (!in_array($msg->id, array_column($all_messages, 'id'))) {
                $all_messages[] = (object)[
                    'id' => $msg->id,
                    'created_at' => $msg->created_at,
                    'priority' => 2
                ];
            }
        }
        
        if (count($all_messages) < $delete_count) {
            foreach ($recent_messages as $msg) {
                if (!in_array($msg->id, array_column($all_messages, 'id'))) {
                    $all_messages[] = (object)[
                        'id' => $msg->id,
                        'created_at' => $msg->created_at,
                        'priority' => 3
                    ];
                }
            }
        }
        
        if (count($all_messages) < $delete_count) {
            foreach ($recent_thread_messages as $msg) {
                if (!in_array($msg->id, array_column($all_messages, 'id'))) {
                    $all_messages[] = (object)[
                        'id' => $msg->id,
                        'created_at' => $msg->created_at,
                        'priority' => 4
                    ];
                }
            }
        }
        
        usort($all_messages, function($a, $b) {
            if ($a->priority === $b->priority) {
                return strtotime($b->created_at) - strtotime($a->created_at);
            }
            return $a->priority - $b->priority;
        });
        
        $target_ids = [];
        foreach (array_slice($all_messages, 0, $delete_count) as $msg) {
            $target_ids[] = $msg->id;
        }
        
        
        if (empty($target_ids)) {
            wp_send_json_error('削除対象のメッセージが見つかりません');
            return;
        }
        
    } else {
        if ($is_group_delete && !empty($group_message_ids)) {
            $target_ids = $group_message_ids;
            
        } else {
            $target_ids = [$message_id];
        }
        
    }
    
    $message_info_for_sse = [];
    foreach ($target_ids as $target_id) {
        $main_msg_info = $wpdb->get_row($wpdb->prepare(
            "SELECT id, channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
            $target_id
        ));
        if ($main_msg_info) {
            $message_info_for_sse[$target_id] = [
                'type' => 'main',
                'channel_id' => $main_msg_info->channel_id
            ];
        }
        
        $thread_msg_info = $wpdb->get_row($wpdb->prepare(
            "SELECT id, parent_message_id as thread_id FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
            $target_id
        ));
        if ($thread_msg_info) {
            $parent_msg = $wpdb->get_row($wpdb->prepare(
                "SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
                $thread_msg_info->thread_id
            ));
            $channel_id = $parent_msg ? $parent_msg->channel_id : 1;
            
            $message_info_for_sse[$target_id] = [
                'type' => 'thread',
                'thread_id' => $thread_msg_info->thread_id,
                'channel_id' => $channel_id
            ];
        }
    }
    
    $deleted = false;
    $deleted_ids = [];
    $total_deleted = 0;
    
    foreach ($target_ids as $target_id) {
        // ソフトデリートを使用
        $soft_delete = LMS_Soft_Delete::get_instance();
        $result1 = $soft_delete->soft_delete_message($target_id);
        $result2 = $soft_delete->soft_delete_thread_message($target_id);
        
        if ($result1 > 0 || $result2 > 0) {
            $deleted_ids[] = $target_id;
            $total_deleted += ($result1 + $result2);
            
            if (isset($message_info_for_sse[$target_id])) {
                $info = $message_info_for_sse[$target_id];
                $current_user_id = isset($_SESSION['lms_user_id']) ? $_SESSION['lms_user_id'] : 0;
                
                $wpdb->insert(
                    $wpdb->prefix . 'lms_chat_deletion_log',
                    array(
                        'message_id' => $target_id,
                        'message_type' => $info['type'],
                        'channel_id' => $info['channel_id'],
                        'thread_id' => isset($info['thread_id']) ? $info['thread_id'] : null,
                        'user_id' => $current_user_id,
                        'deleted_at' => current_time('mysql')
                    ),
                    array('%d', '%s', '%d', '%d', '%d', '%s')
                );
                
                
            }
        }
    }
    
    if ($total_deleted > 0) {
        $deleted = true;
    }
    
    // 削除されたメッセージの日付をグループ化
    $deleted_dates_by_channel = array();
    if (!empty($deleted_ids)) {
        foreach ($deleted_ids as $del_id) {
            if (isset($message_info_for_sse[$del_id])) {
                $info = $message_info_for_sse[$del_id];

                // メイン�ッセージの場合、日付とチャンネルIDを記録
                if ($info['type'] === 'main') {
                    $msg = $wpdb->get_row($wpdb->prepare(
                        "SELECT created_at FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
                        $del_id
                    ));
                    if ($msg) {
                        $msg_date = date('Y-m-d', strtotime($msg->created_at));
                        $channel_id = $info['channel_id'];

                        if (!isset($deleted_dates_by_channel[$channel_id])) {
                            $deleted_dates_by_channel[$channel_id] = array();
                        }
                        if (!in_array($msg_date, $deleted_dates_by_channel[$channel_id])) {
                            $deleted_dates_by_channel[$channel_id][] = $msg_date;
                        }
                    }
                }

                if ($info['type'] === 'main') {
                    do_action('lms_chat_message_deleted', $del_id, $info['channel_id'], null);
                } elseif ($info['type'] === 'thread') {
                    do_action('lms_chat_thread_message_deleted', $del_id, $info['thread_id'], $info['channel_id'], null);
                }
            }
        }
    }

    // その日のメッセージがすべて削除されたかチェックし、セパレーター削除イベントを発行
    $separator_deletion_events = array();
    foreach ($deleted_dates_by_channel as $channel_id => $dates) {
        foreach ($dates as $date) {
            $remaining_count = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_messages
                 WHERE channel_id = %d AND DATE(created_at) = %s
                 AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
                $channel_id, $date
            ));

            if ($remaining_count == 0) {
                // その日のメッセージがすべて削除された
                $separator_deletion_events[] = array(
                    'channel_id' => $channel_id,
                    'date' => $date
                );

                // Long Polling用のイベント記録
                do_action('lms_chat_date_separator_deleted', $channel_id, $date);
            }
        }
    }
    
    if (!empty($deleted_ids)) {
        // 添付ファイルの実ファイルを削除
        $upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
        foreach ($deleted_ids as $del_id) {
            $attachments = $wpdb->get_results($wpdb->prepare(
                "SELECT file_path, thumbnail_path FROM {$wpdb->prefix}lms_chat_attachments
                 WHERE message_id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
                $del_id
            ));

            if (!empty($attachments)) {
                foreach ($attachments as $attachment) {
                    // メインファイルを削除
                    if (!empty($attachment->file_path)) {
                        $file_path = $upload_base_dir . '/' . $attachment->file_path;
                        if (file_exists($file_path)) {
                            @unlink($file_path);
                        }
                    }

                    // サムネイルを削除
                    if (!empty($attachment->thumbnail_path) && $attachment->thumbnail_path !== $attachment->file_path) {
                        $thumb_path = $upload_base_dir . '/' . $attachment->thumbnail_path;
                        if (file_exists($thumb_path)) {
                            @unlink($thumb_path);
                        }
                    }
                }
            }
        }

        $tables_to_clean = [
            'lms_chat_reactions',
            'lms_chat_attachments',
            'lms_message_read_status',
            'lms_thread_read_status'
        ];

        foreach ($deleted_ids as $del_id) {
            foreach ($tables_to_clean as $table) {
                $full_table_name = $wpdb->prefix . $table;

                $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$full_table_name'");

                if ($table_exists) {
                    if ($table === 'lms_thread_read_status') {
                        $column_exists = $wpdb->get_var("SHOW COLUMNS FROM $full_table_name LIKE 'message_id'");
                        if ($column_exists) {
                            // ソフトデリート
                            $wpdb->update($full_table_name,
                                array('deleted_at' => current_time('mysql')),
                                array('message_id' => $del_id),
                                array('%s'),
                                array('%d')
                            );
                        } else {
                            continue;
                        }
                    } else {
                        // ソフトデリート
                        $wpdb->update($full_table_name,
                            array('deleted_at' => current_time('mysql')),
                            array('message_id' => $del_id),
                            array('%s'),
                            array('%d')
                        );
                    }
                }
            }
        }
    }
    
    $remaining_main = 0;
    $remaining_thread = 0;
    
    foreach ($target_ids as $target_id) {
        $check1 = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
            $target_id
        ));
        
        $check2 = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
            $target_id
        ));
        
        $remaining_main += $check1;
        $remaining_thread += $check2;
    }
    
    
    $deleted_count = count($deleted_ids);
    $requested_count = isset($_POST['delete_count']) ? intval($_POST['delete_count']) : 1;
    
    
    if ($remaining_main == 0 && $remaining_thread == 0) {
        wp_send_json_success(array(
            'message' => $deleted_count . '通のメッセージを削除しました',
            'message_id' => $message_id,
            'deleted_ids' => $deleted_ids,
            'deleted_count' => $deleted_count,
            'requested_count' => $requested_count,
            'deleted' => true,
            'physical_deletion' => true
        ));
    } else if ($deleted) {
        wp_send_json_success(array(
            'message' => $deleted_count . '通のメッセージを削除しました',
            'message_id' => $message_id,
            'deleted_ids' => $deleted_ids,
            'deleted_count' => $deleted_count,
            'requested_count' => $requested_count,
            'deleted' => true,
            'physical_deletion' => true
        ));
    } else {
        wp_send_json_error('削除に失敗しました');
    }
}

add_action('wp_ajax_lms_chat_delete_message', 'handle_message_delete');
add_action('wp_ajax_nopriv_lms_chat_delete_message', 'handle_message_delete');