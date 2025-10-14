<?php
/**
 * 高速ロングポーリングシステム
 * リアルタイムチャット用の最適化されたポーリング実装
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

define('POLLING_TIMEOUT', 15);  // 15秒タイムアウト
define('POLLING_INTERVAL', 0.5); // 0.5秒間隔
define('MAX_MESSAGES_PER_REQUEST', 10);

while (ob_get_level()) {
    ob_end_clean();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $wp_load_paths = [
        dirname(dirname(dirname(dirname(__FILE__)))) . '/wp-load.php',
        $_SERVER['DOCUMENT_ROOT'] . '/wp-load.php',
    ];
    
    $wp_loaded = false;
    foreach ($wp_load_paths as $wp_path) {
        if (file_exists($wp_path)) {
            require_once($wp_path);
            $wp_loaded = true;
            break;
        }
    }
    
    if (!$wp_loaded) {
        throw new Exception('WordPress could not be loaded');
    }
    
    $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
    $thread_id = isset($_GET['thread_id']) ? intval($_GET['thread_id']) : 0;
    $last_message_id = isset($_GET['last_message_id']) ? intval($_GET['last_message_id']) : 0;
    $nonce = isset($_GET['nonce']) ? sanitize_text_field($_GET['nonce']) : '';
    
    if (!$channel_id || !$nonce) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid parameters']);
        exit;
    }
    
    if (!wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
        session_start();
        if (!isset($_SESSION['lms_user_id']) || $_SESSION['lms_user_id'] <= 0) {
            http_response_code(401);
            echo json_encode(['error' => 'Authentication failed']);
            exit;
        }
        $user_id = $_SESSION['lms_user_id'];
    } else {
        $user_id = get_current_user_id();
        if (!$user_id && isset($_SESSION['lms_user_id'])) {
            $user_id = $_SESSION['lms_user_id'];
        }
    }
    
    if (!$user_id) {
        http_response_code(401);
        echo json_encode(['error' => 'User not authenticated']);
        exit;
    }
    
    global $wpdb;
    
    $is_member = $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_channel_members 
         WHERE channel_id = %d AND user_id = %d",
        $channel_id, $user_id
    ));
    
    if (!$is_member) {
        http_response_code(403);
        echo json_encode(['error' => 'Not a channel member']);
        exit;
    }
    
    $start_time = time();
    $max_loops = POLLING_TIMEOUT / POLLING_INTERVAL;
    $loop_count = 0;
    
    while ($loop_count < $max_loops) {
        $new_messages = [];
        
        if ($thread_id > 0) {
            $messages = $wpdb->get_results($wpdb->prepare("
                SELECT m.*, u.display_name as user_name, u.avatar_url,
                       UNIX_TIMESTAMP(m.created_at) as timestamp
                FROM {$wpdb->prefix}lms_chat_thread_messages m
                LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
                WHERE m.thread_id = %d AND m.id > %d
                ORDER BY m.id ASC
                LIMIT %d
            ", $thread_id, $last_message_id, MAX_MESSAGES_PER_REQUEST), ARRAY_A);
        } else {
            $messages = $wpdb->get_results($wpdb->prepare("
                SELECT m.*, u.display_name as user_name, u.avatar_url,
                       UNIX_TIMESTAMP(m.created_at) as timestamp
                FROM {$wpdb->prefix}lms_chat_messages m
                LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
                WHERE m.channel_id = %d AND m.id > %d
                ORDER BY m.id ASC
                LIMIT %d
            ", $channel_id, $last_message_id, MAX_MESSAGES_PER_REQUEST), ARRAY_A);
        }
        
        if (!empty($messages)) {
            echo json_encode([
                'success' => true,
                'messages' => $messages,
                'timestamp' => time(),
                'channel_id' => $channel_id,
                'thread_id' => $thread_id
            ]);
            exit;
        }
        
        $cache_key = $thread_id > 0 ? "deleted_thread_msgs_{$thread_id}" : "deleted_channel_msgs_{$channel_id}";
        $deleted_messages = wp_cache_get($cache_key, 'lms_chat');
        
        if ($deleted_messages && !empty($deleted_messages)) {
            wp_cache_delete($cache_key, 'lms_chat');
            
            echo json_encode([
                'success' => true,
                'deleted_messages' => $deleted_messages,
                'timestamp' => time(),
                'channel_id' => $channel_id,
                'thread_id' => $thread_id
            ]);
            exit;
        }
        
        if (connection_aborted()) {
            break;
        }
        
        usleep(POLLING_INTERVAL * 1000000);
        $loop_count++;
    }
    
    echo json_encode([
        'success' => true,
        'messages' => [],
        'timeout' => true,
        'timestamp' => time()
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Server error',
        'message' => $e->getMessage()
    ]);
}

exit;