<?php
/**
 * LMSチャット用ロングポーリングエンドポイント
 * リアルタイム同期システム（4イベント対応）
 */

$wp_load_path = dirname(dirname(dirname(dirname(dirname(__FILE__))))) . '/wp-load.php';
if (!file_exists($wp_load_path)) {
    http_response_code(500);
    die('WordPress not found');
}

require_once $wp_load_path;

if (!session_id() && !headers_sent()) {
    session_start();
}

set_time_limit(12); // 10秒 + 余裕を短縮

// 現在のメモリ使用量を確認してから適切な制限値を設定
$current_memory_usage = memory_get_usage(true);
$required_memory = max($current_memory_usage * 1.5, 64 * 1024 * 1024); // 現在の使用量の1.5倍または64MB
$memory_limit_mb = ceil($required_memory / (1024 * 1024));

// メモリ制限の設定を安全に実行
$current_limit = ini_get('memory_limit');
if ($current_limit !== -1 && ($current_limit === '' || intval($current_limit) < $memory_limit_mb)) {
    ini_set('memory_limit', $memory_limit_mb . 'M');
}

while (ob_get_level()) {
    ob_end_clean();
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
header("Access-Control-Allow-Origin: https://{$host}");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

/**
 * 統一されたユーザーID取得
 */
function get_current_lms_user_id() {
    if (function_exists('lms_get_current_user_id')) {
        return lms_get_current_user_id();
    }
    
    if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] > 0) {
        return intval($_SESSION['lms_user_id']);
    }
    
    if (is_user_logged_in()) {
        return get_current_user_id();
    }
    
    return 0;
}

/**
 * エラーレスポンス送信
 */
function send_error_response($error, $message, $code = 400) {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $error,
        'message' => $message,
        'timestamp' => time()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 成功レスポンス送信
 */
function send_success_response($data = [], $timeout = false) {
    echo json_encode([
        'success' => true,
        'data' => $data,
        'timeout' => $timeout,
        'timestamp' => time()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$user_id = get_current_lms_user_id();
if ($user_id <= 0) {
    send_error_response('auth_failed', '認証が必要です', 401);
}

$nonce = $_GET['nonce'] ?? $_POST['nonce'] ?? '';
$valid_nonce = false;
$nonce_actions = ['lms_ajax_nonce', 'lms_chat_nonce', 'lms_nonce'];

if ($nonce) {
    foreach ($nonce_actions as $action) {
        if (wp_verify_nonce($nonce, $action)) {
            $valid_nonce = true;
            break;
        }
    }
}

if (!$valid_nonce) {
    send_error_response('invalid_nonce', 'CSRFトークンが無効です', 403);
}

$channel_id = intval($_GET['channel_id'] ?? 0);
$thread_id = intval($_GET['thread_id'] ?? 0);
$last_update = intval($_GET['last_update'] ?? 0);
$client_id = sanitize_text_field($_GET['client_id'] ?? '');

// リクエスト受信処理

if ($channel_id <= 0) {
    send_error_response('invalid_channel', 'チャンネルIDが無効です');
}

global $wpdb;

/**
 * 最新の更新タイムスタンプを取得
 */
function get_latest_update_timestamp($channel_id, $thread_id = 0) {
    global $wpdb;
    
    $timestamps = [];
    
    $main_timestamp = $wpdb->get_var($wpdb->prepare(
        "SELECT UNIX_TIMESTAMP(MAX(GREATEST(created_at, IFNULL(updated_at, created_at)))) 
         FROM {$wpdb->prefix}lms_chat_messages 
         WHERE channel_id = %d",
        $channel_id
    ));
    if ($main_timestamp) {
        $timestamps[] = intval($main_timestamp);
    }
    
    if ($thread_id > 0) {
        $thread_timestamp = $wpdb->get_var($wpdb->prepare(
            "SELECT UNIX_TIMESTAMP(MAX(created_at)) 
             FROM {$wpdb->prefix}lms_chat_thread_messages 
             WHERE parent_message_id = %d",
            $thread_id
        ));
    } else {
        $thread_timestamp = $wpdb->get_var($wpdb->prepare(
            "SELECT UNIX_TIMESTAMP(MAX(tm.created_at)) 
             FROM {$wpdb->prefix}lms_chat_thread_messages tm
             JOIN {$wpdb->prefix}lms_chat_messages m ON tm.parent_message_id = m.id
             WHERE m.channel_id = %d",
            $channel_id
        ));
    }
    if ($thread_timestamp) {
        $timestamps[] = intval($thread_timestamp);
    }
    
    $max_timestamp = $timestamps ? max($timestamps) : time();
    
    return $max_timestamp;
}

/**
 * 変更された内容を取得
 */
function get_updates_since($channel_id, $thread_id, $last_update) {
    global $wpdb;
    
    
    $updates = [];
    
    // まず通知システムから即座の更新を取得
    $notification_key = 'lms_longpoll_new_messages';
    $notification_updates = get_transient($notification_key) ?: array();
    
    foreach ($notification_updates as $notification) {
        
        if ($notification['channel_id'] == $channel_id && $notification['created_at'] > $last_update) {
            // 詳細なメッセージデータをDBから取得
            $detailed_message = $wpdb->get_row($wpdb->prepare(
                "SELECT m.id, m.message as content, m.user_id, m.created_at, m.updated_at,
                        u.display_name, u.avatar_url
                 FROM {$wpdb->prefix}lms_chat_messages m
                 LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
                 WHERE m.id = %d AND m.channel_id = %d",
                $notification['message_id'], $channel_id
            ));
            
            if ($detailed_message) {
                $updates[] = [
                    'action' => 'main_message_posted',
                    'messageId' => intval($detailed_message->id),
                    'parentId' => null,
                    'threadId' => null,
                    'payload' => [
                        'id' => intval($detailed_message->id),
                        'content' => $detailed_message->content,
                        'message' => $detailed_message->content,
                        'user_id' => intval($detailed_message->user_id),
                        'display_name' => $detailed_message->display_name,
                        'username' => $detailed_message->display_name,
                        'avatar_url' => $detailed_message->avatar_url,
                        'created_at' => $detailed_message->created_at,
                        'channel_id' => $channel_id,
                        'formatted_time' => date('H:i', strtotime($detailed_message->created_at))
                    ]
                ];
            }
        }
    }
    
    // 従来のDB検索もバックアップとして実行
    $main_messages = $wpdb->get_results($wpdb->prepare(
        "SELECT m.id, m.message as content, m.user_id, m.created_at, m.updated_at, 'new' as action_type,
                u.display_name, u.avatar_url
         FROM {$wpdb->prefix}lms_chat_messages m
         LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
         WHERE m.channel_id = %d 
         AND UNIX_TIMESTAMP(GREATEST(m.created_at, IFNULL(m.updated_at, m.created_at))) > %d
         ORDER BY m.created_at DESC",
        $channel_id, $last_update
    ));
    
    // 通知システムから既に取得したメッセージIDを記録
    $processed_message_ids = array();
    foreach ($updates as $update) {
        if (isset($update['messageId'])) {
            $processed_message_ids[] = $update['messageId'];
        }
    }
    
    foreach ($main_messages as $msg) {
        // 重複チェック：通知システムから既に取得済みのメッセージはスキップ
        if (in_array(intval($msg->id), $processed_message_ids)) {
            continue;
        }
        
        $updates[] = [
            'action' => 'main_message_posted',
            'messageId' => intval($msg->id),
            'parentId' => null,
            'threadId' => null,
            'payload' => [
                'id' => intval($msg->id),
                'content' => $msg->content,
                'message' => $msg->content,
                'user_id' => intval($msg->user_id),
                'display_name' => $msg->display_name,
                'username' => $msg->display_name,
                'avatar_url' => $msg->avatar_url,
                'created_at' => $msg->created_at,
                'channel_id' => $channel_id,
                'formatted_time' => date('H:i', strtotime($msg->created_at))
            ]
        ];
    }
    
    if ($thread_id > 0) {
        $sql_query = $wpdb->prepare(
            "SELECT tm.id, tm.message as content, tm.user_id, tm.parent_message_id as thread_id, tm.created_at,
                    u.display_name, u.avatar_url
             FROM {$wpdb->prefix}lms_chat_thread_messages tm
             LEFT JOIN {$wpdb->prefix}lms_users u ON tm.user_id = u.id
             WHERE tm.parent_message_id = %d 
             AND UNIX_TIMESTAMP(tm.created_at) > %d
             ORDER BY tm.created_at DESC",
            $thread_id, $last_update
        );
        $thread_messages = $wpdb->get_results($sql_query);
    } else {
        $sql_query = $wpdb->prepare(
            "SELECT tm.id, tm.message as content, tm.user_id, tm.parent_message_id as thread_id, tm.created_at,
                    u.display_name, u.avatar_url
             FROM {$wpdb->prefix}lms_chat_thread_messages tm
             JOIN {$wpdb->prefix}lms_chat_messages m ON tm.parent_message_id = m.id
             LEFT JOIN {$wpdb->prefix}lms_users u ON tm.user_id = u.id
             WHERE m.channel_id = %d 
             AND UNIX_TIMESTAMP(tm.created_at) > %d
             ORDER BY tm.created_at DESC",
            $channel_id, $last_update
        );
        $thread_messages = $wpdb->get_results($sql_query);
    }
    
if ($thread_id > 0) {
    $debug_messages = $wpdb->get_results($wpdb->prepare(
        "SELECT tm.id, tm.message, tm.created_at, UNIX_TIMESTAMP(tm.created_at) as unix_ts
         FROM {$wpdb->prefix}lms_chat_thread_messages tm
         WHERE tm.parent_message_id = %d 
         ORDER BY tm.created_at DESC LIMIT 5",
        $thread_id
    ));
} else {
    $debug_messages = $wpdb->get_results($wpdb->prepare(
        "SELECT tm.id, tm.message, tm.created_at, UNIX_TIMESTAMP(tm.created_at) as unix_ts
         FROM {$wpdb->prefix}lms_chat_thread_messages tm
         JOIN {$wpdb->prefix}lms_chat_messages m ON tm.parent_message_id = m.id
         WHERE m.channel_id = %d 
         ORDER BY tm.created_at DESC LIMIT 5",
        $channel_id
    ));
}

    
    foreach ($thread_messages as $msg) {
        $updates[] = [
            'action' => 'thread_message_posted',
            'messageId' => intval($msg->id),
            'parentId' => intval($msg->thread_id),
            'threadId' => intval($msg->thread_id),
            'payload' => [
                'id' => intval($msg->id),
                'message' => $msg->content,
                'content' => $msg->content,
                'user_id' => intval($msg->user_id),
                'display_name' => $msg->display_name,
                'avatar_url' => $msg->avatar_url,
                'parent_message_id' => intval($msg->thread_id),
                'thread_id' => intval($msg->thread_id),
                'created_at' => $msg->created_at,
                'formatted_time' => date('H:i', strtotime($msg->created_at))
            ]
        ];
    }
    
    return $updates;
}

/**
 * 削除イベントログを取得（トランジェントストレージから）
 */
function get_deletion_events_since($channel_id, $last_update) {
    global $wpdb;
    
    
    $deletions = [];
    
    $table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$wpdb->prefix}lms_chat_deletion_log'");
    
    if ($table_exists) {
        $deletion_logs = $wpdb->get_results($wpdb->prepare(
            "SELECT message_id, message_type, thread_id, deleted_at
             FROM {$wpdb->prefix}lms_chat_deletion_log 
             WHERE channel_id = %d 
             AND UNIX_TIMESTAMP(deleted_at) > %d
             ORDER BY deleted_at DESC",
            $channel_id, $last_update
        ));
        
        foreach ($deletion_logs as $log) {
            $action = $log->message_type === 'main' ? 'main_message_deleted' : 'thread_message_deleted';
            $deletions[] = [
                'action' => $action,
                'messageId' => intval($log->message_id),
                'parentId' => $log->thread_id ? intval($log->thread_id) : null,
                'threadId' => $log->thread_id ? intval($log->thread_id) : null,
                'payload' => [
                    'id' => intval($log->message_id),
                    'deleted_at' => $log->deleted_at
                ]
            ];
        }
    }
    
    $main_delete_key = 'lms_longpoll_main_delete_events';
    $main_delete_events = get_transient($main_delete_key) ?: array();
    $remaining_main_events = [];
    $delivered_main_count = 0;
    
    if (!empty($main_delete_events)) {
        foreach ($main_delete_events as $index => $event) {
            $event_time = $event['timestamp'] ?? 0;
            $channel_match = ($event['channel_id'] ?? 0) == $channel_id;
            
            $is_recent = (time() - $event_time) <= 60;
            
            if ($is_recent && $channel_match) {
                $deletions[] = [
                    'action' => 'main_message_deleted',
                    'messageId' => intval($event['message_id']),
                    'parentId' => null,
                    'threadId' => null,
                    'channelId' => $channel_id,
                    'payload' => [
                        'id' => intval($event['message_id']),
                        'channel_id' => $channel_id,
                        'deleted_at' => date('Y-m-d H:i:s', $event_time)
                    ]
                ];
                $delivered_main_count++;
            } else if ($is_recent) {
                $remaining_main_events[] = $event;
            }
        }
        
        if (!empty($remaining_main_events)) {
            set_transient($main_delete_key, $remaining_main_events, 300);
        } else {
            delete_transient($main_delete_key);
        }
        
    }
    
    $transient_key = 'lms_longpoll_thread_delete_events';
    $transient_events = get_transient($transient_key) ?: array();
    $remaining_thread_events = [];
    
    
    if (!empty($transient_events)) {
        foreach ($transient_events as $index => $event) {
            $event_time = $event['timestamp'] ?? 0;
            $channel_match = ($event['channel_id'] ?? 0) == $channel_id;
            
            $is_recent = (time() - $event_time) <= 60;
            
            
            if ($is_recent && $channel_match) {
                $deletions[] = [
                    'action' => 'thread_message_deleted',
                    'messageId' => intval($event['message_id']),
                    'parentId' => intval($event['parent_message_id'] ?? 0),
                    'threadId' => intval($event['parent_message_id'] ?? 0),
                    'payload' => [
                        'id' => intval($event['message_id']),
                        'deleted_at' => date('Y-m-d H:i:s', $event_time)
                    ]
                ];
            } else if ($is_recent) {
                $remaining_thread_events[] = $event;
            }
        }
        
        if (!empty($remaining_thread_events)) {
            set_transient($transient_key, $remaining_thread_events, 300);
        } else {
            delete_transient($transient_key);
        }
    }
    
    
    return $deletions;
}

// 緊急停止フラグをチェック
if (isset($_SESSION['emergency_stop_requests']) && $_SESSION['emergency_stop_requests']) {
    send_success_response([], true); // 即座に終了
}

$start_time = time();
$timeout = 5; // タイムアウトを5秒に短縮（リロード高速化）
while ((time() - $start_time) < $timeout) {
    // 緊急停止フラグを毎回チェック
    if (isset($_SESSION['emergency_stop_requests']) && $_SESSION['emergency_stop_requests']) {
        send_success_response([], true); // 即座に終了
    }
    $current_timestamp = get_latest_update_timestamp($channel_id, $thread_id);
    
    $deletions = get_deletion_events_since($channel_id, $last_update);
    
    if ($current_timestamp > $last_update) {
        
        $updates = get_updates_since($channel_id, $thread_id, $last_update);
        
        $all_events = array_merge($updates, $deletions);
        
        
        if (!empty($all_events)) {
            
            $compressed_data = null;
            if (function_exists('gzcompress') && extension_loaded('zlib')) {
                $json_data = json_encode($all_events, JSON_UNESCAPED_UNICODE);
                $compressed = base64_encode(gzcompress($json_data, 9));
                if (strlen($compressed) < strlen($json_data)) {
                    $compressed_data = $compressed;
                }
            }
            
            $formatted_updates = [
                'new_messages' => [],
                'deleted_messages' => [],
                'thread_messages' => [],
                'thread_deleted_messages' => []
            ];
            
            foreach ($all_events as $event) {
                switch ($event['action']) {
                    case 'main_message_posted':
                        $formatted_updates['new_messages'][] = [
                            'messageId' => $event['messageId'],
                            'channelId' => $channel_id,
                            'threadId' => 0,
                            'payload' => $event['payload']
                        ];
                        break;
                    case 'thread_message_posted':
                        $formatted_updates['thread_messages'][] = [
                            'messageId' => $event['messageId'],
                            'parentId' => $event['parentId'],
                            'threadId' => $event['threadId'],
                            'payload' => $event['payload']
                        ];
                        break;
                    case 'main_message_deleted':
                        $formatted_updates['deleted_messages'][] = [
                            'messageId' => $event['messageId'],
                            'channelId' => $channel_id
                        ];
                        break;
                    case 'thread_message_deleted':
                        $formatted_updates['thread_deleted_messages'][] = [
                            'messageId' => $event['messageId'],
                            'parentId' => $event['parentId'],
                            'threadId' => $event['threadId'],
                            'channelId' => $channel_id
                        ];
                        break;
                }
            }
            
            send_success_response([
                'events' => $all_events,
                'updates' => $formatted_updates,
                'compressed' => $compressed_data,
                'last_update' => $current_timestamp,
                'channel_id' => $channel_id,
                'thread_id' => $thread_id
            ]);
        }
    } else if (!empty($deletions)) {
        
        $compressed_data = null;
        if (function_exists('gzcompress') && extension_loaded('zlib')) {
            $json_data = json_encode($deletions, JSON_UNESCAPED_UNICODE);
            $compressed = base64_encode(gzcompress($json_data, 9));
            if (strlen($compressed) < strlen($json_data)) {
                $compressed_data = $compressed;
            }
        }
        
        $formatted_deletions = [
            'new_messages' => [],
            'deleted_messages' => [],
            'thread_messages' => [],
            'thread_deleted_messages' => []
        ];
        
        foreach ($deletions as $deletion) {
            switch ($deletion['action']) {
                case 'main_message_deleted':
                    $formatted_deletions['deleted_messages'][] = [
                        'messageId' => $deletion['messageId'],
                        'channelId' => $channel_id
                    ];
                    break;
                case 'thread_message_deleted':
                    $formatted_deletions['thread_deleted_messages'][] = [
                        'messageId' => $deletion['messageId'],
                        'parentId' => $deletion['parentId'],
                        'threadId' => $deletion['threadId'],
                        'channelId' => $channel_id
                    ];
                    break;
            }
        }
        
        send_success_response([
            'events' => $deletions,
            'updates' => $formatted_deletions,
            'compressed' => $compressed_data,
            'last_update' => time(), // 現在時刻に更新して次回は新しいイベントのみ取得
            'channel_id' => $channel_id,
            'thread_id' => $thread_id
        ]);
    }
    
    usleep(200000);
    
    if (connection_aborted()) {
        break;
    }
}

send_success_response([], true);