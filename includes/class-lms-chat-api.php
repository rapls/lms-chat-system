<?php
/**
* LMSチャットAPIクラス
*
* REST API、Ajax処理を担当
*/
class LMS_Chat_API {
	private function acquireSession(bool $needs_write = false): bool {
		if (function_exists('lms_session_start')) {
			$options = $needs_write ? array() : array('read_only' => true);
			$result = lms_session_start($options);
			if ($result === false && session_status() === PHP_SESSION_ACTIVE) {
				return true;
			}
			return $result !== false;
		}

		if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
			if (!$needs_write && PHP_VERSION_ID >= 70100) {
				session_start(array('read_and_close' => true));
				return true;
			}

			$started = session_start();
			if ($started && !$needs_write) {
				session_write_close();
			}
			return $started;
		}

		return session_status() === PHP_SESSION_ACTIVE;
	}

	private function releaseSession(): void {
		if (function_exists('lms_session_close')) {
			lms_session_close();
		} elseif (session_status() === PHP_SESSION_ACTIVE) {
			session_write_close();
		}
	}


/**
* コンストラクタ
*/
public function __construct() {
add_action('wp_ajax_lms_get_messages', array($this, 'ajax_get_messages'));
add_action('wp_ajax_lms_send_message', array($this, 'ajax_send_message'));
add_action('wp_ajax_lms_delete_message', array($this, 'ajax_delete_message'));
add_action('wp_ajax_lms_delete_thread_message', array($this, 'ajax_delete_thread_message'));
add_action('wp_ajax_nopriv_lms_delete_thread_message', array($this, 'ajax_delete_thread_message'));
add_action('wp_ajax_lms_mark_as_read', array($this, 'ajax_mark_as_read'));
add_action('wp_ajax_lms_mark_message_as_read', array($this, 'ajax_mark_message_as_read'));
add_action('wp_ajax_nopriv_lms_mark_message_as_read', array($this, 'ajax_mark_message_as_read'));
add_action('wp_ajax_lms_mark_channel_all_as_read', array($this, 'ajax_mark_channel_all_as_read'));
add_action('wp_ajax_nopriv_lms_mark_channel_all_as_read', array($this, 'ajax_mark_channel_all_as_read'));
add_action('wp_ajax_lms_get_reactions', array($this, 'ajax_get_reactions'));
add_action('wp_ajax_nopriv_lms_get_reactions', array($this, 'ajax_get_reactions'));
add_action('wp_ajax_lms_toggle_reaction', array($this, 'ajax_toggle_reaction'));
add_action('wp_ajax_nopriv_lms_toggle_reaction', array($this, 'ajax_toggle_reaction'));
add_action('wp_ajax_lms_toggle_thread_reaction', array($this, 'ajax_toggle_thread_reaction'));
add_action('wp_ajax_nopriv_lms_toggle_thread_reaction', array($this, 'ajax_toggle_thread_reaction'));
add_action('wp_ajax_lms_batch_update_reactions', array($this, 'ajax_batch_update_reactions'));
add_action('wp_ajax_nopriv_lms_batch_update_reactions', array($this, 'ajax_batch_update_reactions'));
add_action('wp_ajax_lms_cleanup_reaction_updates', array($this, 'ajax_cleanup_reaction_updates'));
add_action('wp_ajax_nopriv_lms_cleanup_reaction_updates', array($this, 'ajax_cleanup_reaction_updates'));
add_action('wp_ajax_lms_get_unread_count', array($this, 'ajax_get_unread_count'));
add_action('wp_ajax_nopriv_lms_get_unread_count', array($this, 'ajax_get_unread_count'));

add_action('wp_ajax_lms_mark_messages_as_read', array($this, 'ajax_mark_messages_as_read'));
add_action('wp_ajax_nopriv_lms_mark_messages_as_read', array($this, 'ajax_mark_messages_as_read'));
add_action('wp_ajax_lms_get_latest_message_for_channel', array($this, 'ajax_get_latest_message_for_channel'));
add_action('wp_ajax_nopriv_lms_get_latest_message_for_channel', array($this, 'ajax_get_latest_message_for_channel'));
add_action('wp_ajax_lms_mark_channel_fully_read', array($this, 'ajax_mark_channel_fully_read'));
add_action('wp_ajax_nopriv_lms_mark_channel_fully_read', array($this, 'ajax_mark_channel_fully_read'));
add_action('wp_ajax_lms_mark_channel_read', array($this, 'ajax_mark_channel_read'));
add_action('wp_ajax_nopriv_lms_mark_channel_read', array($this, 'ajax_mark_channel_read'));
add_action('wp_ajax_lms_get_thread_info', array($this, 'ajax_get_thread_info'));
add_action('wp_ajax_lms_get_thread_messages', array($this, 'ajax_get_thread_messages'));
add_action('wp_ajax_nopriv_lms_get_thread_messages', array($this, 'ajax_get_thread_messages'));
add_action('wp_ajax_lms_send_thread_message', array($this, 'ajax_send_thread_message'));
add_action('wp_ajax_nopriv_lms_send_thread_message', array($this, 'ajax_send_thread_message'));
add_action('wp_ajax_lms_get_thread_reactions', array($this, 'ajax_get_thread_reactions'));
add_action('wp_ajax_nopriv_lms_get_thread_reactions', array($this, 'ajax_get_thread_reactions'));
add_action('wp_ajax_lms_get_messages_by_date', array($this, 'ajax_get_messages_by_date'));
add_action('wp_ajax_nopriv_lms_get_messages_by_date', array($this, 'ajax_get_messages_by_date'));
add_action('wp_ajax_lms_get_messages_by_date_range', array($this, 'ajax_get_messages_by_date_range'));
add_action('wp_ajax_nopriv_lms_get_messages_by_date_range', array($this, 'ajax_get_messages_by_date_range'));
add_action('wp_ajax_lms_get_first_messages', array($this, 'ajax_get_first_messages'));
add_action('wp_ajax_nopriv_lms_get_first_messages', array($this, 'ajax_get_first_messages'));
add_action('wp_ajax_lms_get_messages_around', array($this, 'ajax_get_messages_around'));
add_action('wp_ajax_nopriv_lms_get_messages_around', array($this, 'ajax_get_messages_around'));
add_action('wp_ajax_lms_repair_parent_251', array($this, 'ajax_repair_parent_251'));
add_action('wp_ajax_lms_get_oldest_messages', array($this, 'ajax_get_oldest_messages'));
add_action('wp_ajax_nopriv_lms_get_oldest_messages', array($this, 'ajax_get_oldest_messages'));
add_action('wp_ajax_lms_test_endpoint', array($this, 'ajax_test_endpoint'));
add_action('wp_ajax_nopriv_lms_test_endpoint', array($this, 'ajax_test_endpoint'));
add_action('wp_ajax_lms_test_mark_read', array($this, 'ajax_test_mark_read'));
add_action('wp_ajax_nopriv_lms_test_mark_read', array($this, 'ajax_test_mark_read'));
add_action('wp_ajax_lms_search_messages', array($this, 'ajax_search_messages'));
add_action('wp_ajax_lms_chat_upload_file', array($this, 'ajax_upload_file'));
add_action('wp_ajax_lms_chat_ping', array($this, 'ajax_chat_ping'));
add_action('wp_ajax_lms_get_fresh_nonce', array($this, 'ajax_get_fresh_nonce'));
add_action('wp_ajax_lms_chat_get_message', array($this, 'ajax_get_single_message'));
add_action('wp_ajax_nopriv_lms_chat_get_message', array($this, 'ajax_get_single_message'));
add_action('wp_ajax_lms_clear_deleted_messages_list', array($this, 'ajax_clear_deleted_messages_list'));
add_action('wp_ajax_nopriv_lms_clear_deleted_messages_list', array($this, 'ajax_clear_deleted_messages_list'));
add_action('wp_ajax_nopriv_lms_get_fresh_nonce', array($this, 'ajax_get_fresh_nonce'));
add_action('wp_ajax_lms_get_message_user_info', array($this, 'ajax_get_message_user_info'));
add_action('wp_ajax_nopriv_lms_get_message_user_info', array($this, 'ajax_get_message_user_info'));
add_action('wp_ajax_lms_get_thread_participants', array($this, 'ajax_get_thread_participants'));
add_action('wp_ajax_nopriv_lms_get_thread_participants', array($this, 'ajax_get_thread_participants'));
add_action('wp_ajax_lms_debug_thread_data', array($this, 'ajax_debug_thread_data'));
add_action('wp_ajax_nopriv_lms_debug_thread_data', array($this, 'ajax_debug_thread_data'));

add_action('wp_ajax_lms_health_check', array($this, 'ajax_health_check'));
add_action('wp_ajax_nopriv_lms_health_check', array($this, 'ajax_health_check'));

add_action('wp_ajax_lms_reset_emergency_stop', array($this, 'ajax_reset_emergency_stop'));

add_action('wp_ajax_lms_check_message_updates', array($this, 'ajax_check_message_updates'));

add_action('wp_ajax_lms_chat_poll', array($this, 'ajax_chat_poll'));
add_action('wp_ajax_nopriv_lms_chat_poll', array($this, 'ajax_chat_poll'));

add_action('wp_ajax_lms_get_initial_unread_counts', array($this, 'ajax_get_initial_unread_counts'));
add_action('wp_ajax_nopriv_lms_get_initial_unread_counts', array($this, 'ajax_get_initial_unread_counts'));

add_action('wp_ajax_lms_get_thread_unread_count', array($this, 'ajax_get_thread_unread_count'));
add_action('wp_ajax_nopriv_lms_get_thread_unread_count', array($this, 'ajax_get_thread_unread_count'));

add_action('wp_ajax_lms_get_thread_replies_count', array($this, 'ajax_get_thread_replies_count'));
add_action('wp_ajax_nopriv_lms_get_thread_replies_count', array($this, 'ajax_get_thread_replies_count'));

add_action('wp_ajax_lms_get_comprehensive_unread_counts', array($this, 'ajax_get_comprehensive_unread_counts'));
add_action('wp_ajax_nopriv_lms_get_comprehensive_unread_counts', array($this, 'ajax_get_comprehensive_unread_counts'));

add_action('wp_ajax_lms_mark_single_message_read', array($this, 'ajax_mark_single_message_read'));
add_action('wp_ajax_nopriv_lms_mark_single_message_read', array($this, 'ajax_mark_single_message_read'));
add_action('wp_ajax_lms_debug_message_thread', array($this, 'ajax_debug_message_thread'));
add_action('wp_ajax_nopriv_lms_debug_message_thread', array($this, 'ajax_debug_message_thread'));
add_action('wp_ajax_lms_restore_thread_messages', array($this, 'ajax_restore_thread_messages'));
add_action('wp_ajax_nopriv_lms_restore_thread_messages', array($this, 'ajax_restore_thread_messages'));
add_action('wp_ajax_lms_get_messages_universal', array($this, 'ajax_get_messages_universal'));
add_action('wp_ajax_nopriv_lms_get_messages_universal', array($this, 'ajax_get_messages_universal'));
add_action('wp_ajax_lms_debug_message_gaps', array($this, 'ajax_debug_message_gaps'));
add_action('wp_ajax_nopriv_lms_debug_message_gaps', array($this, 'ajax_debug_message_gaps'));

// 軽量スレッド更新エンドポイント（負荷最小化）
add_action('wp_ajax_lms_get_thread_updates', array($this, 'ajax_get_thread_updates'));
add_action('wp_ajax_nopriv_lms_get_thread_updates', array($this, 'ajax_get_thread_updates'));
add_filter('mime_types', array($this, 'custom_mime_types'));
}

/**
* SSE接続維持用のpingハンドラー
* クライアントからのpingに応答するだけで、接続が切れないようにする
*/
public function ajax_chat_ping() {
if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
wp_send_json_error('Invalid nonce');
exit;
}

$this->acquireSession();


$sessionData = isset($_SESSION) ? $_SESSION : array();


$this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
wp_send_json_error('User not logged in');
exit;
}

wp_send_json_success(array(
'time' => current_time('mysql'),
'status' => 'ok'
));
}

/**
 * 新しいnonceを生成して返す
 */
public function ajax_get_fresh_nonce() {
	$new_nonce = wp_create_nonce('lms_ajax_nonce');
	
	wp_send_json_success(array(
		'nonce' => $new_nonce,
		'time' => current_time('mysql')
	));
}

/**
* SSEリクエストの処理 - 削除済み
*/
public function handle_sse_request() {
	wp_send_json_error('SSE機能は削除されました');
}

/**
 * 超軽量SSEヘッダー設定（削除済み）
 */
private function setup_ultra_lite_sse_headers() {
	return;
}

/**
 * 超軽量イベントループ（削除済み）
 */
private function run_ultra_lite_event_loop($channel_id, $client_id, $user_id) {
	return;
}

/**
 * 超軽量SSEイベントチェック（削除済み）
 */
private function check_ultra_lite_sse_events(&$event_id) {
	return;
}

/**
 * SSEイベントを送信（削除済み）
 *
 * @param string $event イベント名
 * @param string $data JSONエンコードされたデータ
 * @param int $id イベントID
 */
private function send_sse_event($event, $data, $id = null) {
	return;
}

/**
 * SSEエラーを送信して終了（削除済み）
 *
 * @param string $message エラーメッセージ
 * @param int $status_code HTTPステータスコード
 */
private function send_sse_error($message, $status_code = 500) {
	return;
}
  /**
  * スレッド情報を取得するAjaxハンドラー
  */
  public function ajax_get_thread_info() {
    $emergency_stop_key = 'lms_thread_info_emergency_stop';
    $emergency_stop = get_transient($emergency_stop_key);
    
    if ($emergency_stop) {
      wp_send_json_success(array()); // 空の成功レスポンス
      return;
    }
    
    try {
      set_time_limit(15);
      ini_set('memory_limit', '256M');
      
      $start_time = microtime(true);
      
      if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $this->acquireSession();


      $sessionData = isset($_SESSION) ? $_SESSION : array();


      $this->releaseSession();

$user_id = 0;
      if (isset($sessionData['lms_user_id'])) {
        $user_id = intval($sessionData['lms_user_id']);
      }
      
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $parent_message_ids = isset($_POST['parent_message_ids']) ? $_POST['parent_message_ids'] : [];
      $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
      
      if (empty($parent_message_ids) || !is_array($parent_message_ids)) {
        wp_send_json_error('親メッセージIDが指定されていません');
        return;
      }

      if ($channel_id <= 0) {
        wp_send_json_error('チャンネルIDが不正です');
        return;
      }

      if (count($parent_message_ids) > 2) {
        wp_send_json_error('一度に処理できるメッセージ数は2件までです（タイムアウト対策）');
        return;
      }

      $cache_key = 'thread_info_' . md5($channel_id . '_' . implode(',', $parent_message_ids));
      $cached_result = wp_cache_get($cache_key, 'lms_thread');
      
      if ($cached_result !== false) {
        wp_send_json_success($cached_result);
        return;
      }

      $lms_chat = LMS_Chat::get_instance();
      if (!$lms_chat) {
        throw new Exception('LMS_Chatインスタンスの取得に失敗しました');
      }
      
      $mid_time = microtime(true);
      if (($mid_time - $start_time) > 10) { // 10秒経過していたら中止（大幅短縮）
        throw new Exception('処理時間が制限を超えました');
      }

      try {
        $thread_info_data = $lms_chat->get_thread_info_for_messages($parent_message_ids, $channel_id, $user_id);
        
        if (!is_array($thread_info_data)) {
          throw new Exception('スレッド情報の取得に失敗しました（無効な戻り値）');
        }
      } catch (Exception $e) {
        throw new Exception('スレッド情報の取得処理でエラーが発生しました: ' . $e->getMessage());
      }

      $result = [];
      foreach ($parent_message_ids as $message_id) {
        $message_id = intval($message_id);
        if (isset($thread_info_data['thread_map'][$message_id])) {
          $thread_data = $thread_info_data['thread_map'][$message_id];
          
          $avatars = [];
          if (isset($thread_info_data['avatar_map'][$message_id]) && is_array($thread_info_data['avatar_map'][$message_id])) {
            $avatars = $thread_info_data['avatar_map'][$message_id];
            
            foreach ($avatars as &$avatar) {
              if (empty($avatar['avatar_url']) || !is_string($avatar['avatar_url'])) {
                $avatar['avatar_url'] = get_template_directory_uri() . '/img/default-avatar.png';
              }
            }
          }
          
          $result[$message_id] = [
            'thread_count' => intval($thread_data['thread_count'] ?? 0),
            'latest_reply' => $thread_data['latest_reply'] ?? '',
            'thread_unread_count' => intval($thread_data['thread_unread_count'] ?? 0),
            'avatars' => $avatars,
          ];
        }
      }

      wp_cache_set($cache_key, $result, 'lms_thread', 30);

      $execution_time = (microtime(true) - $start_time) * 1000;

      wp_send_json_success($result);
      
    } catch (Exception $e) {
      
      $error_count_key = 'lms_thread_info_error_count';
      $error_count = get_transient($error_count_key) ?: 0;
      $error_count++;
      set_transient($error_count_key, $error_count, 300); // 5分間保持
      
      if ($error_count >= 5) {
        set_transient('lms_thread_info_emergency_stop', true, 600); // 10分間停止
      }
      
      wp_send_json_error('スレッド情報の取得でエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
  * スレッドメッセージを取得するAjaxハンドラー
  */
  public function ajax_get_thread_messages() {
    $start_time = microtime(true);
    
    set_time_limit(30);
    
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

$user_id = 0;
    if (isset($sessionData['lms_user_id']) && $sessionData['lms_user_id'] > 0) {
      $user_id = intval($sessionData['lms_user_id']);
    } elseif (is_user_logged_in()) {
      $user_id = get_current_user_id();
    }
    
    if (!$user_id) {
      wp_send_json_error('User not logged in');
      return;
    }

    $parent_message_id = isset($_GET['parent_message_id']) ? intval($_GET['parent_message_id']) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $include_deleted = isset($_GET['include_deleted']) ? intval($_GET['include_deleted']) : 1; // デフォルトで削除されたメッセージも含める
    
    if ($parent_message_id <= 0) {
      wp_send_json_error('親メッセージIDが指定されていません');
      return;
    }

    $lms_chat = LMS_Chat::get_instance();

    $cache_key = "thread_messages_{$parent_message_id}_p{$page}";
    $cached_result = wp_cache_get($cache_key, 'lms_thread_messages');
    
    if ($cached_result !== false) {
      $end_time = microtime(true);
      $execution_time = ($end_time - $start_time) * 1000; // ミリ秒
      wp_send_json_success($cached_result);
      return;
    }
    
    try {
      global $wpdb;
      
      if (!$wpdb) {
        wp_send_json_error('データベース接続エラー');
        return;
      }
      
      $thread_messages_table = $wpdb->prefix . 'lms_chat_thread_messages';
      $users_table = $wpdb->prefix . 'lms_users';
      
      $per_page = 50;
      $offset = ($page - 1) * $per_page;
      
      $deleted_condition = $include_deleted ? '' : 'AND t.deleted_at IS NULL';
      
      $query = $wpdb->prepare(
        "SELECT /*+ USE_INDEX(t, idx_parent_created) */ 
         t.*, u.display_name, u.avatar_url
         FROM $thread_messages_table t
         LEFT JOIN $users_table u ON t.user_id = u.id
         WHERE t.parent_message_id = %d
         $deleted_condition
         ORDER BY t.created_at ASC
         LIMIT %d OFFSET %d",
        $parent_message_id,
        $per_page,
        $offset
      );
      
      $messages = $wpdb->get_results($query, ARRAY_A);
      
      // デバッグログ
      if ($wpdb->last_error) {
        wp_send_json_error('データベースクエリエラー');
        return;
      }
      
      
      
      $processed_messages = [];
      foreach ($messages as $message) {
        $user_info = $lms_chat->get_user_display_info($message['user_id']);
        
        $processed_message = [
          'id' => $message['id'],
          'message' => $message['message'],
          'user_id' => $message['user_id'],
          'display_name' => $user_info['display_name'],
          'avatar_url' => $user_info['avatar_url'],
          'created_at' => $message['created_at'],
          'formatted_time' => date('H:i', strtotime($message['created_at'])),
          'parent_message_id' => $message['parent_message_id'],
          'attachments' => $lms_chat->get_thread_message_attachments($message['id']), // スレッドメッセージ専用の添付ファイル取得
          'reactions' => $lms_chat->get_thread_message_reactions($message['id']) // スレッドリアクションを取得
        ];
        
        $processed_messages[] = $processed_message;
      }
      
      $total_query = $wpdb->prepare(
        "SELECT COUNT(*) FROM $thread_messages_table WHERE parent_message_id = %d $deleted_condition",
        $parent_message_id
      );
      $total_count = $wpdb->get_var($total_query);
      
      $pagination = [
        'currentPage' => $page,
        'totalPages' => ceil($total_count / $per_page),
        'totalCount' => $total_count,
        'hasMore' => ($page * $per_page) < $total_count
      ];
      
      $result = [
        'messages' => $processed_messages,
        'pagination' => $pagination,
        'parent_message_id' => $parent_message_id,
        'cached' => false,
        'timestamp' => current_time('mysql')
      ];
      
      wp_cache_set($cache_key, $result, 'lms_thread_messages', 300);
      
      $end_time = microtime(true);
      $execution_time = ($end_time - $start_time) * 1000; // ミリ秒
      
      wp_send_json_success($result);
      
    } catch (Exception $e) {
      wp_send_json_error('スレッドメッセージの取得でエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
  * 個別メッセージを既読にマークするAjaxハンドラー
  */
  public function ajax_mark_message_as_read() {
    try {
      $this->acquireSession();

      $sessionData = isset($_SESSION) ? $_SESSION : array();

      $this->releaseSession();

$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : (isset($_POST['_wpnonce']) ? $_POST['_wpnonce'] : (isset($_POST['security']) ? $_POST['security'] : ''));
      $nonce_valid = false;
      
      if ($nonce) {
        $nonce_actions = ['lms_ajax_nonce', 'lms_chat_nonce', 'lms_nonce'];
        foreach ($nonce_actions as $action) {
          if (wp_verify_nonce($nonce, $action)) {
            $nonce_valid = true;
            break;
          }
        }
      }
      
      if (!$nonce_valid) {
        wp_send_json_error('Invalid nonce');
        return;
      }
      
      if (!isset($sessionData['lms_user_id'])) {
        wp_send_json_error('ユーザーIDが不正です。');
        return;
      }
      
      $user_id = (int)$sessionData['lms_user_id'];
      $message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
      $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
      $is_thread = isset($_POST['is_thread']) ? intval($_POST['is_thread']) : 0;
      
      if ($message_id <= 0 || $channel_id <= 0) {
        wp_send_json_error('無効なパラメータです。');
        return;
      }
      
      global $wpdb;
      
      if ($is_thread) {
        $parent_message_id = $wpdb->get_var($wpdb->prepare(
          "SELECT parent_message_id FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
          $message_id
        ));
        
        if ($parent_message_id) {
          $wpdb->replace(
            $wpdb->prefix . 'lms_chat_thread_last_viewed',
            array(
              'user_id' => $user_id,
              'parent_message_id' => $parent_message_id,
              'last_viewed_at' => current_time('mysql'),
            ),
            array('%d', '%d', '%s')
          );
        }
      } else {
        $wpdb->replace(
          $wpdb->prefix . 'lms_chat_last_viewed',
          array(
            'user_id' => $user_id,
            'channel_id' => $channel_id,
            'last_viewed_at' => current_time('mysql'),
          ),
          array('%d', '%d', '%s')
        );
      }
      
      wp_send_json_success(array(
        'message' => 'メッセージを既読にマークしました',
        'message_id' => $message_id,
        'channel_id' => $channel_id,
        'is_thread' => $is_thread,
        'timestamp' => current_time('mysql')
      ));
      
    } catch (Exception $e) {
      wp_send_json_error('既読処理でエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
  * メッセージ送信のAjaxハンドラー
  */
  public function ajax_send_message() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'handle_send_message')) {
      $lms_chat->handle_send_message();
    } else {
      wp_send_json_error('メッセージ送信機能が利用できません');
    }
  }

  /**
  * チャットメッセージを取得するAjaxハンドラー
  */
  public function ajax_get_messages() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'get_messages')) {
      $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
      $page = isset($_GET['page']) ? intval($_GET['page']) : 1;
      $include_thread_info = isset($_GET['include_thread_info']) ? intval($_GET['include_thread_info']) : 0;
      $include_deleted_threads = isset($_GET['include_deleted_threads']) ? intval($_GET['include_deleted_threads']) : 1; // デフォルトで削除されたスレッドも含める
      
      if ($channel_id <= 0) {
        wp_send_json_error('チャンネルIDが必要です');
        return;
      }
      
      // 🎯 初期読み込み・追加読み込み共に50メッセージに統一
      $per_page = 50;
      $result = $lms_chat->get_messages($channel_id, $page, $per_page, 0, $include_deleted_threads);
      if (is_wp_error($result)) {
        wp_send_json_error($result->get_error_message());
      } else {
        // スレッド情報を含める場合
        if ($include_thread_info && isset($result['messages'])) {
          $message_ids = [];
          foreach ($result['messages'] as $group) {
            foreach ($group['messages'] as $message) {
              $message_ids[] = $message->id;
            }
          }
          
          if (!empty($message_ids)) {
            $this->acquireSession();

            $sessionData = isset($_SESSION) ? $_SESSION : array();

            $this->releaseSession();

$user_id = isset($sessionData['lms_user_id']) ? intval($sessionData['lms_user_id']) : 0;
            
            $thread_info_data = $lms_chat->get_thread_info_for_messages($message_ids, $channel_id, $user_id, $include_deleted_threads);
            
            // スレッド情報をレスポンスに追加
            $result['thread_info'] = [];
            foreach ($message_ids as $message_id) {
              if (isset($thread_info_data['thread_map'][$message_id])) {
                $thread_data = $thread_info_data['thread_map'][$message_id];
                $avatars = $thread_info_data['avatar_map'][$message_id] ?? [];
                
                $result['thread_info'][] = [
                  'parent_message_id' => $message_id,
                  'total_replies' => intval($thread_data['thread_count'] ?? 0),
                  'unread_count' => intval($thread_data['thread_unread_count'] ?? 0),
                  'avatars' => $avatars,
                  'latest_reply' => $thread_data['latest_reply'] ?? ''
                ];
              }
            }
          }
        }
        wp_send_json_success($result);
      }
    } else {
      wp_send_json_error('メッセージ取得機能が利用できません');
    }
  }

  /**
   * リアクショントグルのAjaxハンドラー
   */
  public function ajax_toggle_reaction() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'handle_toggle_reaction')) {
      $lms_chat->handle_toggle_reaction();
    } else {
      wp_send_json_error('リアクション機能が利用できません');
    }
  }

  /**
   * スレッドリアクショントグルのAjaxハンドラー
   */
  public function ajax_toggle_thread_reaction() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'handle_toggle_thread_reaction')) {
      $lms_chat->handle_toggle_thread_reaction();
    } else {
      wp_send_json_error('スレッドリアクション機能が利用できません');
    }
  }

  /**
   * バッチリアクション更新のAjaxハンドラー
   */
  public function ajax_batch_update_reactions() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'batch_update_reactions')) {
      $updates = isset($_POST['updates']) ? $_POST['updates'] : array();
      if (is_string($updates)) {
        $updates = json_decode($updates, true);
      }
      
      if (!is_array($updates)) {
        wp_send_json_error('Invalid updates format');
        return;
      }
      
      $result = $lms_chat->batch_update_reactions($updates);
      
      if ($result['success']) {
        wp_send_json_success($result);
      } else {
        wp_send_json_error($result['error']);
      }
    } else {
      wp_send_json_error('バッチリアクション更新機能が利用できません');
    }
  }

  /**
   * リアクション更新テーブルクリーンアップのAjaxハンドラー
   */
  public function ajax_cleanup_reaction_updates() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'cleanup_reaction_updates')) {
      $hours = isset($_POST['hours']) ? intval($_POST['hours']) : 24;
      $result = $lms_chat->cleanup_reaction_updates($hours);
      wp_send_json_success($result);
    } else {
      wp_send_json_error('クリーンアップ機能が利用できません');
    }
  }

  /**
   * リアクション取得のAjaxハンドラー
   */
  public function ajax_get_reactions() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'handle_get_reactions')) {
      $lms_chat->handle_get_reactions();
    } else {
      wp_send_json_error('リアクション取得機能が利用できません');
    }
  }

  /**
   * スレッドリアクション取得のAjaxハンドラー
   */
  public function ajax_get_thread_reactions() {
    $lms_chat = LMS_Chat::get_instance();
    if ($lms_chat && method_exists($lms_chat, 'handle_get_thread_reactions')) {
      $lms_chat->handle_get_thread_reactions();
    } else {
      wp_send_json_error('スレッドリアクション取得機能が利用できません');
    }
  }
  /**
   * メッセージ更新チェック（ポーリングフォールバック用）
   * SSE接続に失敗した場合のフォールバック機能
   */
  public function ajax_check_message_updates() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    if (!is_user_logged_in()) {
      wp_send_json_error('User not logged in');
      return;
    }

    $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
    $thread_id = isset($_POST['thread_id']) ? intval($_POST['thread_id']) : 0;
    $last_check = isset($_POST['last_check']) ? intval($_POST['last_check']) : (time() - 30);

    if ($channel_id <= 0) {
      wp_send_json_error('Invalid channel');
      return;
    }

    global $wpdb;
    $new_messages = [];

    try {
      if ($thread_id > 0) {
        $table_name = $wpdb->prefix . 'lms_chat_thread_messages';
        $sql = $wpdb->prepare("
          SELECT id, parent_message_id, user_id, message, created_at, 
                 UNIX_TIMESTAMP(created_at) as timestamp
          FROM {$table_name} 
          WHERE parent_message_id = %d 
          AND UNIX_TIMESTAMP(created_at) > %d
          ORDER BY created_at ASC
          LIMIT 10
        ", $thread_id, $last_check);
        
        $new_messages = $wpdb->get_results($sql, ARRAY_A);
      } else {
        $table_name = $wpdb->prefix . 'lms_chat_messages';
        $sql = $wpdb->prepare("
          SELECT m.id, m.channel_id, m.user_id, m.message, m.created_at,
                 UNIX_TIMESTAMP(m.created_at) as timestamp
          FROM {$table_name} m
          WHERE m.channel_id = %d 
          AND UNIX_TIMESTAMP(m.created_at) > %d
          ORDER BY m.created_at ASC
          LIMIT 10
        ", $channel_id, $last_check);
        
        $new_messages = $wpdb->get_results($sql, ARRAY_A);

      }

      wp_send_json_success([
        'new_messages' => $new_messages,
        'channel_id' => $channel_id,
        'thread_id' => $thread_id,
        'timestamp' => time()
      ]);

    } catch (Exception $e) {
      wp_send_json_error('Database error');
    }
  }

  /**
   * 最初のメッセージを取得するAjaxハンドラー
   */
  public function ajax_get_first_messages() {
    
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }
    $this->acquireSession();

    $sessionData = isset($_SESSION) ? $_SESSION : array();

    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $user_id = $sessionData['lms_user_id'];

    $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
    
    if ($channel_id <= 0) {
      wp_send_json_error('チャンネルIDが必要です');
      return;
    }

    $lms_chat = LMS_Chat::get_instance();
    if (!$lms_chat) {
      wp_send_json_error('チャット機能が利用できません');
      return;
    }
    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      $users_table = $wpdb->users;
      
      $per_page = 50;
      $force_first = isset($_GET['force_first']) ? true : false;
      
      
      if ($force_first) {
        
        $count_query = $wpdb->prepare(
          "SELECT COUNT(*) FROM $messages_table WHERE channel_id = %d",
          $channel_id
        );
        $total_count = $wpdb->get_var($count_query);
        
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$messages_table'");
        
        if (!$table_exists) {
          wp_send_json_error('メッセージテーブルが存在しません');
          return;
        }
        
        $query = $wpdb->prepare(
          "SELECT m.*
           FROM $messages_table m
           WHERE m.channel_id = %d
           ORDER BY m.created_at ASC
           LIMIT %d",
          $channel_id,
          $per_page
        );
        
        $messages = $wpdb->get_results($query, ARRAY_A);
        
        $all_messages_count = $wpdb->get_var("SELECT COUNT(*) FROM $messages_table");
        
        if ($all_messages_count > 0) {
          $sample_messages = $wpdb->get_results("SELECT id, channel_id, message, created_at FROM $messages_table LIMIT 3", ARRAY_A);
        }
        
        if ($wpdb->last_error) {
          wp_send_json_error('データベースエラー: ' . $wpdb->last_error);
          return;
        }
        
        if (empty($messages) && $total_count > 0) {
          
          $alt_query = $wpdb->prepare(
            "SELECT m.*
             FROM $messages_table m
             WHERE m.channel_id = %d
             ORDER BY m.id ASC
             LIMIT %d",
            $channel_id,
            $per_page
          );
          
          $messages = $wpdb->get_results($alt_query, ARRAY_A);
        }
        
        $total_query = $wpdb->prepare(
          "SELECT COUNT(*) FROM $messages_table WHERE channel_id = %d",
          $channel_id
        );
        $total_count = $wpdb->get_var($total_query);
        
        $processed_messages = [];
        foreach ($messages as $message) {
          try {
            $user_info = $lms_chat->get_user_display_info($message['user_id']);
            
            $processed_message = [
              'id' => $message['id'],
              'message' => $message['message'],
              'user_id' => $message['user_id'],
              'display_name' => $user_info['display_name'],
              'avatar_url' => $user_info['avatar_url'],
              'created_at' => $message['created_at'],
              'formatted_time' => date('H:i', strtotime($message['created_at'])),
              'parent_message_id' => $message['parent_message_id'] ?? null,
              'thread_parent_id' => $message['thread_parent_id'] ?? null,
              'attachments' => []
            ];
            
            $processed_messages[] = $processed_message;
          } catch (Exception $e) {
            continue;
          }
        }
        
        if (empty($processed_messages)) {
        }
        
        $message_ids = array_column($processed_messages, 'id');
        $thread_info = [];
        if (!empty($message_ids)) {
          try {
            $thread_info_data = $lms_chat->get_thread_info_for_messages($message_ids, $channel_id, $user_id);
            $thread_info = $thread_info_data['thread_map'] ?? [];
          } catch (Exception $e) {
            $thread_info = [];
          }
        }
        
        $grouped_messages = [];
        foreach ($processed_messages as $message) {
          $date = date('Y-m-d', strtotime($message['created_at']));
          if (!isset($grouped_messages[$date])) {
            $grouped_messages[$date] = [];
          }
          $grouped_messages[$date][] = $message;
        }
        
        $formatted_messages = [];
        foreach ($grouped_messages as $date => $messages) {
          $formatted_messages[] = [
            'date' => $date,
            'messages' => $messages
          ];
        }
        
        $result = [
          'messages' => $formatted_messages,
          'pagination' => [
            'currentPage' => 1,
            'totalPages' => ceil($total_count / $per_page),
            'totalCount' => $total_count,
            'hasMore' => count($processed_messages) < $total_count
          ],
          'thread_info' => $thread_info,
          'is_first_messages' => true // 最初のメッセージであることを示すフラグ
        ];
        
        wp_send_json_success($result);
        
      } else {
        
        $total_query = $wpdb->prepare(
          "SELECT COUNT(*) FROM $messages_table WHERE channel_id = %d",
          $channel_id
        );
        $total_count = $wpdb->get_var($total_query);
        
        
        if ($total_count == 0) {
          wp_send_json_success([
            'messages' => [],
            'pagination' => [
              'currentPage' => 1,
              'totalPages' => 1,
              'totalCount' => 0,
              'hasMore' => false
            ]
          ]);
          return;
        }
        
        $last_page = ceil($total_count / $per_page);
        
        $result = $lms_chat->get_messages($channel_id, $last_page);
        
        if (is_wp_error($result)) {
          wp_send_json_error($result->get_error_message());
        } else {
          wp_send_json_success($result);
        }
      }
      
    } catch (Exception $e) {
      wp_send_json_error('最初のメッセージ取得でエラーが発生しました: ' . $e->getMessage());
    } catch (Error $e) {
      wp_send_json_error('最初のメッセージ取得で致命的なエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
   * 特定日付のメッセージを取得するAjaxハンドラー
   */
  public function ajax_get_messages_by_date() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
    $target_date = isset($_GET['date']) ? sanitize_text_field($_GET['date']) : '';
    
    if ($channel_id <= 0) {
      wp_send_json_error('チャンネルIDが必要です');
      return;
    }
    
    if (empty($target_date)) {
      wp_send_json_error('日付が必要です');
      return;
    }

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      $users_table = $wpdb->users;
      
      $start_date = $target_date . ' 00:00:00';
      $end_date = $target_date . ' 23:59:59';
      
      $query = $wpdb->prepare(
        "SELECT m.*, u.display_name, u.user_email
         FROM $messages_table m
         LEFT JOIN $users_table u ON m.user_id = u.ID
         WHERE m.channel_id = %d
         AND m.is_deleted = 0
         AND m.created_at >= %s
         AND m.created_at <= %s
         ORDER BY m.created_at ASC
         LIMIT 100",
        $channel_id,
        $start_date,
        $end_date
      );
      
      $messages = $wpdb->get_results($query, ARRAY_A);
      
      $lms_chat = LMS_Chat::get_instance();
      $processed_messages = [];
      
      foreach ($messages as $message) {
        $user_info = $lms_chat->get_user_display_info($message['user_id']);
        
        $processed_message = [
          'id' => $message['id'],
          'message' => $message['message'],
          'user_id' => $message['user_id'],
          'display_name' => $user_info['display_name'],
          'avatar_url' => $user_info['avatar_url'],
          'created_at' => $message['created_at'],
          'formatted_time' => date('H:i', strtotime($message['created_at'])),
          'parent_message_id' => $message['parent_message_id'],
          'thread_parent_id' => $message['thread_parent_id'] ?? null,
          'attachments' => []
        ];
        
        $processed_messages[] = $processed_message;
      }
      
      wp_send_json_success([
        'messages' => $processed_messages,
        'date' => $target_date,
        'count' => count($processed_messages)
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('日付指定メッセージ取得でエラーが発生しました');
    }
  }

  /**
   * 日付範囲のメッセージを取得するAjaxハンドラー
   */
  public function ajax_get_messages_by_date_range() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
    $start_date = isset($_GET['start_date']) ? sanitize_text_field($_GET['start_date']) : '';
    $end_date = isset($_GET['end_date']) ? sanitize_text_field($_GET['end_date']) : '';
    
    if ($channel_id <= 0) {
      wp_send_json_error('チャンネルIDが必要です');
      return;
    }
    
    if (empty($start_date) || empty($end_date)) {
      wp_send_json_error('開始日と終了日が必要です');
      return;
    }

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      $users_table = $wpdb->users;
      
      $start_datetime = $start_date . ' 00:00:00';
      $end_datetime = $end_date . ' 23:59:59';
      
      $query = $wpdb->prepare(
        "SELECT m.*, u.display_name, u.user_email
         FROM $messages_table m
         LEFT JOIN $users_table u ON m.user_id = u.ID
         WHERE m.channel_id = %d
         AND m.is_deleted = 0
         AND m.created_at >= %s
         AND m.created_at <= %s
         ORDER BY m.created_at ASC
         LIMIT 200",
        $channel_id,
        $start_datetime,
        $end_datetime
      );
      
      $messages = $wpdb->get_results($query, ARRAY_A);
      
      $lms_chat = LMS_Chat::get_instance();
      $processed_messages = [];
      
      foreach ($messages as $message) {
        $user_info = $lms_chat->get_user_display_info($message['user_id']);
        
        $processed_message = [
          'id' => $message['id'],
          'message' => $message['message'],
          'user_id' => $message['user_id'],
          'display_name' => $user_info['display_name'],
          'avatar_url' => $user_info['avatar_url'],
          'created_at' => $message['created_at'],
          'formatted_time' => date('H:i', strtotime($message['created_at'])),
          'parent_message_id' => $message['parent_message_id'],
          'thread_parent_id' => $message['thread_parent_id'] ?? null,
          'attachments' => []
        ];
        
        $processed_messages[] = $processed_message;
      }
      
      wp_send_json_success([
        'messages' => $processed_messages,
        'start_date' => $start_date,
        'end_date' => $end_date,
        'count' => count($processed_messages)
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('日付範囲メッセージ取得でエラーが発生しました');
    }
  }

  /**
   * 指定メッセージ周辺のメッセージを取得するAjaxハンドラー
   */
  public function ajax_get_messages_around() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $message_id = isset($_GET['message_id']) ? intval($_GET['message_id']) : 0;
    $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
    $user_id = $sessionData['lms_user_id'];
    
    if ($message_id <= 0) {
      wp_send_json_error('メッセージIDが必要です');
      return;
    }

    if ($channel_id <= 0) {
      wp_send_json_error('チャンネルIDが必要です');
      return;
    }

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      
      $per_page = 25;
      
      $target_message = $wpdb->get_row($wpdb->prepare(
        "SELECT created_at FROM $messages_table WHERE id = %d AND channel_id = %d",
        $message_id,
        $channel_id
      ));
      
      if (!$target_message) {
        wp_send_json_error('指定されたメッセージが見つかりません');
        return;
      }
      
      $target_time = $target_message->created_at;
      
      $before_query = $wpdb->prepare(
        "SELECT m.* FROM $messages_table m
         WHERE m.channel_id = %d AND m.created_at < %s
         ORDER BY m.created_at DESC
         LIMIT %d",
        $channel_id,
        $target_time,
        $per_page
      );
      
      $before_messages = $wpdb->get_results($before_query, ARRAY_A);
      $before_messages = array_reverse($before_messages); // 時系列順に並び替え
      
      $target_query = $wpdb->prepare(
        "SELECT m.* FROM $messages_table m WHERE m.id = %d",
        $message_id
      );
      
      $target_messages = $wpdb->get_results($target_query, ARRAY_A);
      
      $after_query = $wpdb->prepare(
        "SELECT m.* FROM $messages_table m
         WHERE m.channel_id = %d AND m.created_at > %s
         ORDER BY m.created_at ASC
         LIMIT %d",
        $channel_id,
        $target_time,
        $per_page
      );
      
      $after_messages = $wpdb->get_results($after_query, ARRAY_A);
      
      $all_messages = array_merge($before_messages, $target_messages, $after_messages);
      
      $lms_chat = LMS_Chat::get_instance();
      $processed_messages = [];
      
      foreach ($all_messages as $message) {
        try {
          $user_info = $lms_chat->get_user_display_info($message['user_id']);
          
          $processed_message = [
            'id' => $message['id'],
            'message' => $message['message'],
            'user_id' => $message['user_id'],
            'display_name' => $user_info['display_name'],
            'avatar_url' => $user_info['avatar_url'],
            'created_at' => $message['created_at'],
            'formatted_time' => date('H:i', strtotime($message['created_at'])),
            'parent_message_id' => $message['parent_message_id'] ?? null,
            'thread_parent_id' => $message['thread_parent_id'] ?? null,
            'attachments' => []
          ];
          
          $processed_messages[] = $processed_message;
        } catch (Exception $e) {
          continue;
        }
      }
      
      $grouped_messages = [];
      foreach ($processed_messages as $message) {
        $date = date('Y-m-d', strtotime($message['created_at']));
        if (!isset($grouped_messages[$date])) {
          $grouped_messages[$date] = [];
        }
        $grouped_messages[$date][] = $message;
      }
      
      $formatted_messages = [];
      foreach ($grouped_messages as $date => $messages) {
        $formatted_messages[] = [
          'date' => $date,
          'messages' => $messages
        ];
      }
      
      $message_ids = array_column($processed_messages, 'id');
      $thread_info = [];
      if (!empty($message_ids)) {
        $thread_info_data = $lms_chat->get_thread_info_for_messages($message_ids, $channel_id, $user_id);
        $thread_info = $thread_info_data['thread_map'] ?? [];
      }
      
      wp_send_json_success([
        'messages' => $formatted_messages,
        'target_message_id' => $message_id,
        'thread_info' => $thread_info,
        'pagination' => [
          'currentPage' => 1,
          'totalPages' => 1,
          'totalCount' => count($processed_messages),
          'hasMore' => false
        ]
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('指定メッセージ周辺の取得でエラーが発生しました');
    }
  }

  /**
   * 最古のメッセージを取得するAjaxハンドラー（確実なフォールバック用）
   */
  public function ajax_get_oldest_messages() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
    $user_id = $sessionData['lms_user_id'];
    
    if ($channel_id <= 0) {
      wp_send_json_error('チャンネルIDが必要です');
      return;
    }

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      
      $per_page = 50;
      
      $query = $wpdb->prepare(
        "SELECT m.* FROM $messages_table m
         WHERE m.channel_id = %d
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT %d",
        $channel_id,
        $per_page
      );
      
      $messages = $wpdb->get_results($query, ARRAY_A);
      
      
      $lms_chat = LMS_Chat::get_instance();
      $processed_messages = [];
      
      foreach ($messages as $message) {
        try {
          $user_info = $lms_chat->get_user_display_info($message['user_id']);
          
          $processed_message = [
            'id' => $message['id'],
            'message' => $message['message'],
            'user_id' => $message['user_id'],
            'display_name' => $user_info['display_name'],
            'avatar_url' => $user_info['avatar_url'],
            'created_at' => $message['created_at'],
            'formatted_time' => date('H:i', strtotime($message['created_at'])),
            'parent_message_id' => $message['parent_message_id'] ?? null,
            'thread_parent_id' => $message['thread_parent_id'] ?? null,
            'attachments' => []
          ];
          
          $processed_messages[] = $processed_message;
        } catch (Exception $e) {
          continue;
        }
      }
      
      $grouped_messages = [];
      foreach ($processed_messages as $message) {
        $date = date('Y-m-d', strtotime($message['created_at']));
        if (!isset($grouped_messages[$date])) {
          $grouped_messages[$date] = [];
        }
        $grouped_messages[$date][] = $message;
      }
      
      $formatted_messages = [];
      foreach ($grouped_messages as $date => $messages) {
        $formatted_messages[] = [
          'date' => $date,
          'messages' => $messages
        ];
      }
      
      $message_ids = array_column($processed_messages, 'id');
      $thread_info = [];
      if (!empty($message_ids)) {
        try {
          $thread_info_data = $lms_chat->get_thread_info_for_messages($message_ids, $channel_id, $user_id);
          $thread_info = $thread_info_data['thread_map'] ?? [];
        } catch (Exception $e) {
          $thread_info = [];
        }
      }
      
      $total_query = $wpdb->prepare(
        "SELECT COUNT(*) FROM $messages_table WHERE channel_id = %d",
        $channel_id
      );
      $total_count = $wpdb->get_var($total_query);
      
      wp_send_json_success([
        'messages' => $formatted_messages,
        'thread_info' => $thread_info,
        'pagination' => [
          'currentPage' => 1,
          'totalPages' => ceil($total_count / $per_page),
          'totalCount' => $total_count,
          'hasMore' => count($processed_messages) < $total_count
        ],
        'is_oldest_messages' => true
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('最古メッセージ取得でエラーが発生しました: ' . $e->getMessage());
    } catch (Error $e) {
      wp_send_json_error('最古メッセージ取得で致命的なエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
   * テスト用Ajaxエンドポイント
   */
  public function ajax_test_endpoint() {
    wp_send_json_success(['message' => 'Test endpoint working', 'time' => current_time('mysql')]);
  }

  /**
   * 既読機能テスト用Ajaxエンドポイント
   */
  public function ajax_test_mark_read() {
    $this->acquireSession();

    $sessionData = isset($_SESSION) ? $_SESSION : array();

    $this->releaseSession();

$post_data = $_POST;
    $session_data = $sessionData;
    
    wp_send_json_success([
      'message' => 'Mark read test endpoint working',
      'post_data' => $post_data,
      'session_data' => $session_data,
      'time' => current_time('mysql')
    ]);
  }

  /**
  * 単一メッセージを取得するAjaxハンドラー
  */
  public function ajax_get_single_message() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $message_id = isset($_GET['message_id']) ? intval($_GET['message_id']) : 0;
    
    if ($message_id <= 0) {
      wp_send_json_error('メッセージIDが必要です');
      return;
    }

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      
      $query = $wpdb->prepare(
        "SELECT m.* FROM $messages_table m WHERE m.id = %d",
        $message_id
      );
      
      $message = $wpdb->get_row($query, ARRAY_A);
      
      if (!$message) {
        wp_send_json_error('指定されたメッセージが見つかりません');
        return;
      }
      
      $lms_chat = LMS_Chat::get_instance();
      $user_info = $lms_chat->get_user_display_info($message['user_id']);
      
      $processed_message = [
        'id' => $message['id'],
        'content' => $message['message'], // 'content' フィールドで送信
        'message' => $message['message'], // 'message' フィールドも維持
        'user_id' => $message['user_id'],
        'username' => $user_info['display_name'], // 'username' フィールドで送信
        'display_name' => $user_info['display_name'], // 'display_name' フィールドも維持
        'avatar_url' => $user_info['avatar_url'],
        'created_at' => $message['created_at'],
        'formatted_time' => date('H:i', strtotime($message['created_at'])),
        'channel_id' => $message['channel_id'],
        'parent_message_id' => $message['parent_message_id'] ?? null,
        'thread_parent_id' => $message['thread_parent_id'] ?? null,
        'attachments' => []
      ];
      
      wp_send_json_success([
        'message' => $processed_message
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('メッセージ取得でエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
  * スレッドメッセージ削除のAjaxハンドラー
  */
  public function ajax_delete_thread_message() {
    
    $this->acquireSession();

    
    $sessionData = isset($_SESSION) ? $_SESSION : array();

    
    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $user_id = intval($sessionData['lms_user_id']);

    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $raw_message_id = $_POST['message_id'] ?? '';
    $message_id = intval($raw_message_id);

    $is_optimistic = strlen($raw_message_id) === 13 && preg_match('/^\d{13}$/', $raw_message_id);

    if (!$raw_message_id) {
      wp_send_json_error('Invalid message ID');
      return;
    }

    global $wpdb;

    try {
      if ($is_optimistic) {
        
        $channel_id = 1; // 必要に応じて動的に取得
        $thread_id = 406; // 必要に応じて動的に取得
        
        do_action('lms_chat_thread_message_deleted', $raw_message_id, $thread_id, $channel_id);
        
        wp_send_json_success('Optimistic message deletion synchronized');
        return;
      }

      if (!$message_id) {
        wp_send_json_error('Invalid message ID');
        return;
      }

      $message = $wpdb->get_row($wpdb->prepare(
        "SELECT id, user_id, parent_message_id, deleted_at
         FROM {$wpdb->prefix}lms_chat_thread_messages
         WHERE id = %d AND user_id = %d",
        $message_id,
        $user_id
      ));

      if (!$message) {
        wp_send_json_error('Message not found or unauthorized');
        return;
      }

      // 既に削除済みのメッセージをチェック
      if (!empty($message->deleted_at)) {
        wp_send_json_success('Message already deleted');
        return;
      }

      $parent_message = $wpdb->get_row($wpdb->prepare(
        "SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
        $message->parent_message_id
      ));

      if (!$parent_message) {
        wp_send_json_error('Parent message not found');
        return;
      }

      $channel_id = $parent_message->channel_id;

      // 削除ログテーブルへの記録（エラーは無視）
      try {
        $deletion_log_table = $wpdb->prefix . 'lms_chat_deletion_log';
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$deletion_log_table'");

        if ($table_exists) {
          @$wpdb->insert(
            $deletion_log_table,
            array(
              'message_id' => $message_id,
              'message_type' => 'thread',
              'thread_id' => $message->parent_message_id,
              'channel_id' => $channel_id,
              'user_id' => $user_id,
              'deleted_at' => current_time('mysql')
            ),
            array('%d', '%s', '%d', '%d', '%d', '%s')
          );
        }
      } catch (Exception $e) {
        // ログ記録失敗は削除処理に影響しない
      }

      $result = $wpdb->update(
        $wpdb->prefix . 'lms_chat_thread_messages',
        [
          'deleted_at' => current_time('mysql')
        ],
        [
          'id' => $message_id,
          'user_id' => $user_id
        ],
        ['%s'],
        ['%d', '%d']
      );

      if ($result === false) {
        wp_send_json_error('Database error occurred');
        return;
      }

      do_action('lms_chat_thread_message_deleted', $message_id, $message->parent_message_id, $channel_id);

      // スレッドメッセージが全て削除されたか確認し、親メッセージも削除
      $parent_message_id = $message->parent_message_id;
      $parent_deleted = false;
      
      $remaining_thread_messages = $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages 
         WHERE parent_message_id = %d 
         AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
        $parent_message_id
      ));
      
      if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log(sprintf(
          '[Thread Delete Debug - PHP] 親メッセージID=%d の残存スレッドメッセージ数: %d件',
          $parent_message_id,
          $remaining_thread_messages
        ));
      }
      
      if ($remaining_thread_messages == 0) {
        // 親メッセージを削除
        $result = $wpdb->update(
          $wpdb->prefix . 'lms_chat_messages',
          array('deleted_at' => current_time('mysql')),
          array('id' => $parent_message_id),
          array('%s'),
          array('%d')
        );
        
        if ($result > 0) {
          $parent_deleted = true;
          
          if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log(sprintf(
              '[Thread Delete Debug - PHP] ✅ 親メッセージ削除成功: parent_id=%d',
              $parent_message_id
            ));
          }
          
          // 親メッセージ削除イベントを発火
          do_action('lms_chat_message_deleted', $parent_message_id, $channel_id, null);
          
          // 親メッセージのキャッシュをクリア
          for ($page = 1; $page <= 10; $page++) {
            $cache_key = "channel_messages_{$channel_id}_p{$page}";
            @wp_cache_delete($cache_key, 'lms_chat_messages');
          }
          @wp_cache_delete("message_{$parent_message_id}", 'lms_chat_messages');
        }
      }

      // スレッドメッセージキャッシュをクリア（全ページ）
      try {
        for ($page = 1; $page <= 10; $page++) {
          $cache_key = "thread_messages_{$parent_message_id}_p{$page}";
          @wp_cache_delete($cache_key, 'lms_thread_messages');
        }
      } catch (Exception $e) {
        // キャッシュクリア失敗は無視
      }

      wp_send_json_success([
        'message_id' => $message_id,
        'parent_id' => $message->parent_message_id,
        'thread_parent_id' => $message->parent_message_id,
        'deleted' => true,
        'parent_deleted' => $parent_deleted
      ]);

    } catch (Exception $e) {
      wp_send_json_error('Error occurred: ' . $e->getMessage());
    }
  }

  /**
  * 削除済みメッセージリストをクリアするAjaxハンドラー
  */
  public function ajax_clear_deleted_messages_list() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    try {
      delete_transient('lms_deleted_messages');
      
      $user_id = 0;
      $this->acquireSession();

      $sessionData = isset($_SESSION) ? $_SESSION : array();

      $this->releaseSession();

if (isset($sessionData['lms_user_id'])) {
        $user_id = intval($sessionData['lms_user_id']);
        delete_transient('lms_deleted_messages_user_' . $user_id);
      }
      
      wp_send_json_success([
        'message' => '削除済みメッセージリストをクリアしました',
        'user_id' => $user_id
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('削除済みメッセージリストのクリアでエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
  * 許可するMIMEタイプの追加
  */
  public function custom_mime_types($mimes) {
  if (!isset($mimes['svg'])) {
  $mimes['svg'] = 'image/svg+xml';
  }
  return $mimes;
  }
  /**
   * スレッドに参加した全ユーザーの情報を取得するAJAXエンドポイント
   * スレッド情報で全参加者のアバター表示に使用
   */
  public function ajax_get_thread_participants() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $parent_message_id = isset($_POST['parent_message_id']) ? intval($_POST['parent_message_id']) : 0;

    if ($parent_message_id <= 0) {
      wp_send_json_error('Invalid parent message ID');
      return;
    }

    global $wpdb;

    try {
      
      $parent_user = $wpdb->get_row($wpdb->prepare("
        SELECT m.user_id, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_messages m
        LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
        WHERE m.id = %d
      ", $parent_message_id));
      
      $thread_users = $wpdb->get_results($wpdb->prepare("
        SELECT DISTINCT t.user_id, u.display_name, u.avatar_url, COUNT(*) as reply_count
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        GROUP BY t.user_id, u.display_name, u.avatar_url
        ORDER BY t.user_id ASC
      ", $parent_message_id));
      
      $results = array();
      
      if ($parent_user) {
        $results[] = (object) array(
          'user_id' => $parent_user->user_id,
          'display_name' => $parent_user->display_name,
          'avatar_url' => $parent_user->avatar_url,
          'reply_count' => 0
        );
      }
      
      if ($thread_users) {
        foreach ($thread_users as $thread_user) {
          if (!$parent_user || $thread_user->user_id != $parent_user->user_id) {
            $results[] = $thread_user;
          } else {
            foreach ($results as &$result) {
              if ($result->user_id == $thread_user->user_id) {
                $result->reply_count = $thread_user->reply_count;
                break;
              }
            }
          }
        }
      }

      usort($results, function($a, $b) {
        return intval($a->user_id) - intval($b->user_id);
      });
      $participants = array();
      
      foreach ($results as $result) {
        $avatar_url = $result->avatar_url;
        if (empty($avatar_url)) {
          $avatar_url = get_template_directory_uri() . '/img/default-avatar.png';
        }

        $participant = array(
          'user_id' => $result->user_id,
          'display_name' => $result->display_name,
          'avatar_url' => $avatar_url,
          'reply_count' => intval($result->reply_count),
          'is_parent_author' => false // 後で設定
        );
        
        $participants[] = $participant;
      }

      if (!empty($participants)) {
        $parent_author_query = $wpdb->prepare("
          SELECT user_id FROM {$wpdb->prefix}lms_chat_messages 
          WHERE id = %d
        ", $parent_message_id);
        
        $parent_author_id = $wpdb->get_var($parent_author_query);
        
        foreach ($participants as &$participant) {
          if ($participant['user_id'] == $parent_author_id) {
            $participant['is_parent_author'] = true;
            break;
          }
        }
      }

      $response_data = array(
        'parent_message_id' => $parent_message_id,
        'participants' => $participants,
        'total_participants' => count($participants)
      );
      wp_send_json_success($response_data);

    } catch (Exception $e) {
      wp_send_json_error('An error occurred: ' . $e->getMessage());
    }
  }

  /**
   * チャンネル内の全メッセージを既読にするAjaxハンドラー
   */
  public function ajax_mark_channel_all_as_read() {
    try {
      if (ob_get_length()) {
        ob_clean();
      }
      
      $lms_chat = LMS_Chat::get_instance();
      if ($lms_chat && method_exists($lms_chat, 'handle_mark_channel_all_as_read')) {
        $lms_chat->handle_mark_channel_all_as_read();
      } else {
        wp_send_json_error('全既読機能が利用できません');
      }
    } catch (Exception $e) {
      wp_send_json_error('処理中にエラーが発生しました: ' . $e->getMessage());
    } catch (Error $e) {
      wp_send_json_error('致命的なエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
   * スレッドデータをデバッグするためのAJAXエンドポイント
   * データベース内のスレッド関連テーブルの状況を確認
   */
  public function ajax_debug_thread_data() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $parent_message_id = isset($_POST['parent_message_id']) ? intval($_POST['parent_message_id']) : 0;

    if ($parent_message_id <= 0) {
      wp_send_json_error('Invalid parent message ID');
      return;
    }

    global $wpdb;

    try {
      $debug_data = array();

      $parent_query = $wpdb->prepare("
        SELECT m.*, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_messages m
        LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
        WHERE m.id = %d
      ", $parent_message_id);
      
      $parent_message = $wpdb->get_row($parent_query);
      $debug_data['parent_message'] = $parent_message;

      $thread_messages_query = $wpdb->prepare("
        SELECT t.*, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        ORDER BY t.created_at ASC
      ", $parent_message_id);
      
      $thread_messages = $wpdb->get_results($thread_messages_query);
      $debug_data['thread_messages'] = $thread_messages;

      $thread_table_query = $wpdb->prepare("
        SELECT t.*, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        ORDER BY t.created_at ASC
      ", $parent_message_id);
      
      $thread_table_data = $wpdb->get_results($thread_table_query);
      $debug_data['thread_table_data'] = $thread_table_data;

      $parent_participant = $wpdb->get_row($wpdb->prepare("
        SELECT m.user_id, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_messages m
        LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
        WHERE m.id = %d
      ", $parent_message_id));
      
      $thread_participants = $wpdb->get_results($wpdb->prepare("
        SELECT DISTINCT t.user_id, u.display_name, u.avatar_url, COUNT(*) as message_count
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        GROUP BY t.user_id, u.display_name, u.avatar_url
      ", $parent_message_id));
      
      $participants = array();
      if ($parent_participant) {
        $participants[] = (object) array(
          'user_id' => $parent_participant->user_id,
          'display_name' => $parent_participant->display_name,
          'avatar_url' => $parent_participant->avatar_url,
          'message_count' => 1
        );
      }
      if ($thread_participants) {
        foreach ($thread_participants as $tp) {
          $found = false;
          foreach ($participants as &$p) {
            if ($p->user_id == $tp->user_id) {
              $p->message_count += $tp->message_count;
              $found = true;
              break;
            }
          }
          if (!$found) {
            $participants[] = $tp;
          }
        }
      }
      
      $debug_data['participants'] = $participants;

      $tables_check = array();
      $tables_to_check = array(
        'lms_chat_messages',
        'lms_chat_thread_messages',
        'lms_users'
      );

      foreach ($tables_to_check as $table) {
        $full_table_name = $wpdb->prefix . $table;
        $exists = $wpdb->get_var("SHOW TABLES LIKE '$full_table_name'");
        $tables_check[$table] = $exists ? 'exists' : 'missing';
      }
      $debug_data['tables_check'] = $tables_check;

      $debug_data['queries_executed'] = array(
        'parent_query' => $parent_query,
        'thread_messages_query' => $thread_messages_query,
        'thread_table_query' => $thread_table_query,
        'parent_participant_query' => isset($parent_participant) ? 'executed' : 'skipped',
        'thread_participants_query' => isset($thread_participants) ? 'executed' : 'skipped'
      );

      wp_send_json_success($debug_data);

    } catch (Exception $e) {
      wp_send_json_error('Debug failed: ' . $e->getMessage());
    }
  }

  /**
   * スレッドメッセージを送信
   */
  public function ajax_send_thread_message() {
    try {
      // nonceチェック
      if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $parent_message_id = intval($_POST['parent_message_id'] ?? 0);
      $message = wp_unslash($_POST['message'] ?? '');

      $user_id = null;

      $this->acquireSession();
      $sessionData = isset($_SESSION) ? $_SESSION : array();
      $this->releaseSession();

      // ユーザーID取得
      if (function_exists('lms_get_current_user_id')) {
          $user_id = lms_get_current_user_id();
      } else {
          if (isset($sessionData['user_id']) && $sessionData['user_id']) {
              $user_id = intval($sessionData['user_id']);
          } elseif (isset($sessionData['lms_user_id']) && $sessionData['lms_user_id']) {
              $user_id = intval($sessionData['lms_user_id']);
          } else {
              $wp_user_id = get_current_user_id();
              if ($wp_user_id) {
                  $user_id = $wp_user_id;
              } else {
              }
          }
      }

      // パラメータ検証
      if (!$user_id) {
          wp_send_json_error('User authentication required');
          return;
      }

      if (empty($message) || $parent_message_id <= 0) {
          wp_send_json_error('Invalid parameters: message or parent_message_id is missing');
        return;
      }

      // LMS_Chatインスタンス取得
      global $lms_chat;
      if (!$lms_chat) {
        $lms_chat = LMS_Chat::get_instance();
      }

      // スレッドメッセージ送信実行
      $result = $lms_chat->send_thread_message($parent_message_id, $user_id, $message, null);

      if (is_wp_error($result)) {
        wp_send_json_error('Failed to send thread message: ' . $result->get_error_message());
        return;
      }

      if (!$result || !isset($result->id)) {
        wp_send_json_error('Failed to send thread message: Invalid result');
        return;
      }

      // レスポンス用メッセージデータ準備
      $message_data = [
        'id' => $result->id,
        'message' => $result->message,
        'user_id' => $result->user_id,
        'parent_message_id' => $result->parent_message_id,
        'created_at' => $result->created_at,
        'display_name' => $result->display_name ?? '',
        'avatar_url' => $result->avatar_url ?? '',
        'formatted_time' => $result->formatted_time ?? '',
        'is_current_user' => true
      ];

      // 親メッセージからチャンネルIDを取得
      global $wpdb;
      $parent_message = $wpdb->get_row($wpdb->prepare(
        "SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
        $parent_message_id
      ));
      $channel_id = $parent_message ? $parent_message->channel_id : 1;
      
      // スレッドサマリー情報取得
      $thread_info_query = $wpdb->prepare("
        SELECT 
          COUNT(*) as total_replies,
          MAX(created_at) as latest_reply_time
        FROM {$wpdb->prefix}lms_chat_thread_messages 
        WHERE parent_message_id = %d 
        AND deleted_at IS NULL
      ", $parent_message_id);
      
      $thread_info = $wpdb->get_row($thread_info_query);
      $latest_reply_time = $result->created_at ?? ($thread_info->latest_reply_time ?? '');
      
      // 相対時間に変換
      $latest_reply_formatted = '';
      if ($latest_reply_time) {
        $timestamp = strtotime($latest_reply_time);
        $diff = time() - $timestamp;
        if ($diff < 60) {
          $latest_reply_formatted = 'たった今';
        } elseif ($diff < 3600) {
          $latest_reply_formatted = floor($diff / 60) . '分前';
        } elseif ($diff < 86400) {
          $latest_reply_formatted = floor($diff / 3600) . '時間前';
        } else {
          $latest_reply_formatted = floor($diff / 86400) . '日前';
        }
      }
      
      // スレッド参加者のアバター情報取得
      $lms_users_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$wpdb->prefix}lms_users'");
      
      if ($lms_users_table_exists) {
        $avatars = $wpdb->get_results($wpdb->prepare(
            "SELECT DISTINCT t.user_id,
                    COALESCE(lms_u.display_name, wp_u.display_name, wp_u.user_nicename, 'ユーザー') as display_name,
                    COALESCE(lms_u.avatar_url, '') as avatar_url
            FROM {$wpdb->prefix}lms_chat_thread_messages t
            LEFT JOIN {$wpdb->prefix}lms_users lms_u ON t.user_id = lms_u.id
            LEFT JOIN {$wpdb->users} wp_u ON t.user_id = wp_u.ID
            WHERE t.parent_message_id = %d
            AND t.deleted_at IS NULL
            GROUP BY t.user_id, lms_u.display_name, wp_u.display_name, wp_u.user_nicename, lms_u.avatar_url
            ORDER BY MAX(t.created_at) DESC
            LIMIT 3",
            $parent_message_id
        ));
      } else {
        $avatars = $wpdb->get_results($wpdb->prepare(
            "SELECT DISTINCT t.user_id,
                    COALESCE(wp_u.display_name, wp_u.user_nicename, 'ユーザー') as display_name,
                    '' as avatar_url
            FROM {$wpdb->prefix}lms_chat_thread_messages t
            LEFT JOIN {$wpdb->users} wp_u ON t.user_id = wp_u.ID
            WHERE t.parent_message_id = %d
            AND t.deleted_at IS NULL
            GROUP BY t.user_id, wp_u.display_name, wp_u.user_nicename
            ORDER BY MAX(t.created_at) DESC
            LIMIT 3",
            $parent_message_id
        ));
      }
      
      $thread_data = [
        'total' => intval($thread_info->total_replies ?? 0),
        'latest_reply' => $latest_reply_formatted,
        'parent_message_id' => $parent_message_id,
        'avatars' => $avatars ?: []
      ];

      // アクションフック実行（エラーハンドリング付き）
      try {
        do_action('lms_chat_thread_message_sent', $result->id, $parent_message_id, $channel_id, $user_id);
      } catch (Exception $e) {
        // フック失敗はメッセージ送信成功には影響しない
      }

      // スレッドメッセージキャッシュをクリア（全ページ）
      for ($page = 1; $page <= 10; $page++) {
        $cache_key = "thread_messages_{$parent_message_id}_p{$page}";
        wp_cache_delete($cache_key, 'lms_thread_messages');
      }
      // 成功レスポンス
      wp_send_json_success([
        'message_id' => $result->id,
        'data' => $message_data,
        'message' => $message_data,
        'thread_info' => $thread_data,
        'success' => true
      ]);

    } catch (Exception $e) {
      wp_send_json_error('Server error occurred: ' . $e->getMessage());
    }
  }

  /**
   * チャンネル既読マークAjax処理
   */
  public function ajax_mark_channel_read() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $channel_id = intval($_POST['channel_id'] ?? 0);

    if (!$channel_id) {
      wp_send_json_error('Invalid channel ID');
      return;
    }

    try {
      $user_id = null;
      $this->acquireSession();
      $sessionData = isset($_SESSION) ? $_SESSION : array();
      $this->releaseSession();

      if (function_exists('lms_get_current_user_id')) {
        $user_id = lms_get_current_user_id();
      } else {
        if (isset($sessionData['user_id']) && $sessionData['user_id']) {
          $user_id = intval($sessionData['user_id']);
        } elseif (isset($sessionData['lms_user_id']) && $sessionData['lms_user_id']) {
          $user_id = intval($sessionData['lms_user_id']);
        } else {
          $wp_user_id = get_current_user_id();
          if ($wp_user_id) {
            $user_id = $wp_user_id;
          }
        }
      }

      if (!$user_id) {
        wp_send_json_error('User authentication required');
        return;
      }

      global $lms_chat;
      if (!$lms_chat) {
        $lms_chat = LMS_Chat::get_instance();
      }

      // チャンネルを既読にマーク（簡単な実装）
      global $wpdb;

      // 最新のメッセージIDを取得
      $latest_message_id = $wpdb->get_var($wpdb->prepare(
        "SELECT MAX(id) FROM {$wpdb->prefix}lms_chat_messages WHERE channel_id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
        $channel_id
      ));

      if ($latest_message_id) {
        // 既読状態を更新（テーブルが存在する場合のみ）
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$wpdb->prefix}lms_chat_last_viewed'");
        if ($table_exists) {
          $wpdb->replace(
            $wpdb->prefix . 'lms_chat_last_viewed',
            [
              'user_id' => $user_id,
              'channel_id' => $channel_id,
              'last_viewed_at' => current_time('mysql')
            ],
            ['%d', '%d', '%s']
          );
        }
      }

      wp_send_json_success([
        'channel_id' => $channel_id,
        'user_id' => $user_id,
        'latest_message_id' => $latest_message_id,
        'success' => true
      ]);

    } catch (Exception $e) {
      wp_send_json_error('Server error occurred: ' . $e->getMessage());
    }
  }

  /**
   * メインメッセージ削除Ajax処理
   */
  public function ajax_delete_message() {
    
    $this->acquireSession();

    
    $sessionData = isset($_SESSION) ? $_SESSION : array();

    
    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $user_id = intval($sessionData['lms_user_id']);

    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $raw_message_ids = $_POST['message_id'] ?? $_POST['message_ids'] ?? '';
    
    if (!is_array($raw_message_ids)) {
      $raw_message_ids = explode(',', $raw_message_ids);
    }
    
    $raw_message_ids = array_filter(array_map('trim', $raw_message_ids));
    
    if (empty($raw_message_ids)) {
      wp_send_json_error('Invalid message ID(s)');
      return;
    }

    global $wpdb;
    $deleted_messages = [];
    $failed_messages = [];

    try {
      foreach ($raw_message_ids as $raw_id) {
        $message_id = intval($raw_id);
        
        if ($message_id <= 0) {
          $failed_messages[] = $raw_id;
          continue;
        }

        $message = $wpdb->get_row($wpdb->prepare(
          "SELECT * FROM lms_chat_messages WHERE id = %d AND user_id = %d",
          $message_id, $user_id
        ));

        if (!$message) {
          $failed_messages[] = $message_id;
          continue;
        }

        $thread_count = $wpdb->get_var($wpdb->prepare(
          "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d AND deleted_at IS NULL",
          $message_id
        ));
        
        if ($thread_count > 0) {
          wp_send_json_error('返信のついたメッセージは削除できません。');
          return;
        }

        // ソフトデリートに変更
        $soft_delete = LMS_Soft_Delete::get_instance();
        $deleted = $soft_delete->soft_delete_message($message_id, $user_id);

        if ($deleted) {
          $deleted_messages[] = [
            'id' => $message_id,
            'channel_id' => $message->channel_id
          ];
        } else {
          $failed_messages[] = $message_id;
        }
      }

      if (!empty($deleted_messages)) {
        $first_message = $deleted_messages[0];
        $deleted_ids = array_column($deleted_messages, 'id');
        
        do_action('lms_chat_message_deleted', $first_message['id'], $first_message['channel_id'], $user_id, [
          'is_group_delete' => count($deleted_messages) > 1,
          'group_message_ids' => $deleted_ids,
          'group_total_messages' => count($deleted_messages)
        ]);

        wp_send_json_success([
          'deleted_messages' => $deleted_ids,
          'failed_messages' => $failed_messages,
          'total_deleted' => count($deleted_messages),
          'is_group_delete' => count($deleted_messages) > 1
        ]);
      } else {
        wp_send_json_error('No messages were deleted');
      }

    } catch (Exception $e) {
      wp_send_json_error('Server error occurred: ' . $e->getMessage());
    }
  }

  /**
   * スレッドの未読数を取得するAjaxハンドラー
   */
  public function ajax_get_thread_unread_count() {
    try {
      if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $parent_message_id = intval($_POST['parent_message_id']);
      if (!$parent_message_id) {
        wp_send_json_error('Parent message ID is required');
        return;
      }

      global $wpdb;

      $unread_count_query = $wpdb->prepare("
        SELECT COUNT(*) as unread_count
        FROM {$wpdb->prefix}lms_chat_messages tm
        LEFT JOIN {$wpdb->prefix}lms_chat_read_status rs ON tm.id = rs.message_id AND rs.user_id = %d
        WHERE tm.parent_message_id = %d 
        AND tm.user_id != %d
        AND rs.message_id IS NULL
        AND tm.deleted_at IS NULL
      ", $user_id, $parent_message_id, $user_id);

      $unread_count = intval($wpdb->get_var($unread_count_query));

      wp_send_json_success([
        'parent_message_id' => $parent_message_id,
        'unread_count' => $unread_count
      ]);

    } catch (Exception $e) {
      wp_send_json_error('An error occurred: ' . $e->getMessage());
    }
  }

  /**
   * スレッドの返信数を取得
   */
  public function ajax_get_thread_replies_count() {
    try {
      if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $this->acquireSession();


      $sessionData = isset($_SESSION) ? $_SESSION : array();


      $this->releaseSession();

$user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $parent_message_id = intval($_POST['parent_message_id']);
      if (!$parent_message_id) {
        wp_send_json_error('Parent message ID is required');
        return;
      }

      global $wpdb;
      
      $replies_count_query = $wpdb->prepare("
        SELECT COUNT(*) as replies_count
        FROM {$wpdb->prefix}lms_chat_thread_messages 
        WHERE parent_message_id = %d 
        AND deleted_at IS NULL
      ", $parent_message_id);
      
      $replies_count = intval($wpdb->get_var($replies_count_query));

      wp_send_json_success(array(
        'parent_message_id' => $parent_message_id,
        'count' => $replies_count
      ));

    } catch (Exception $e) {
      wp_send_json_error('An error occurred: ' . $e->getMessage());
    }
  }

  /**
   * 統一同期システム用のポーリングエンドポイント
   */
  public function ajax_chat_poll() {
    try {
      if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $channel_id = intval($_POST['channel_id']);
      $last_message_id = intval($_POST['last_message_id']);
      $last_thread_message_id = intval($_POST['last_thread_message_id'] ?? 0);
      $last_reaction_timestamp = intval($_POST['last_reaction_timestamp'] ?? 0);
      $current_thread_id = intval($_POST['current_thread_id'] ?? 0);
      $tab_id = sanitize_text_field($_POST['tab_id'] ?? '');
      $sequence = intval($_POST['sequence'] ?? 0);

      global $wpdb;

      $new_messages = [];
      $deleted_messages = [];
      $new_thread_messages = [];
      
      if ($channel_id > 0) {
        $recent_messages = $wpdb->get_results($wpdb->prepare(
          "SELECT m.*, u.display_name, u.avatar_url
           FROM {$wpdb->prefix}lms_chat_messages m
           LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
           WHERE m.channel_id = %d 
           AND m.id > %d
           AND (m.deleted_at IS NULL OR m.deleted_at = '0000-00-00 00:00:00')
           ORDER BY m.id ASC
           LIMIT 50",
          $channel_id,
          $last_message_id
        ), ARRAY_A);

        if ($recent_messages) {
          foreach ($recent_messages as $message) {
            $new_messages[] = $message;
          }
        }

        $recent_thread_messages = $wpdb->get_results($wpdb->prepare(
          "SELECT t.*, u.display_name, u.avatar_url, m.channel_id
           FROM {$wpdb->prefix}lms_chat_thread_messages t
           LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
           LEFT JOIN {$wpdb->prefix}lms_chat_messages m ON t.parent_message_id = m.id
           WHERE m.channel_id = %d 
           AND t.id > %d
           ORDER BY t.id ASC
           LIMIT 50",
          $channel_id,
          $last_thread_message_id
        ), ARRAY_A);

        if ($recent_thread_messages) {
          foreach ($recent_thread_messages as $thread_message) {
            $new_thread_messages[] = $thread_message;
          }
        }
        $deleted_log_table = $wpdb->prefix . 'lms_chat_deletion_log';
        
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$deleted_log_table'");
        if ($table_exists) {
          $deleted_entries = $wpdb->get_results($wpdb->prepare(
            "SELECT message_id FROM {$deleted_log_table}
             WHERE channel_id = %d 
             AND message_type = 'main'
             AND deleted_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
             ORDER BY deleted_at DESC
             LIMIT 50",
            $channel_id
          ), ARRAY_A);
          
          if ($deleted_entries) {
            foreach ($deleted_entries as $entry) {
              $deleted_messages[] = intval($entry['message_id']);
            }
          }
          
          $deleted_thread_entries = $wpdb->get_results($wpdb->prepare(
            "SELECT l.message_id, l.thread_id 
             FROM {$deleted_log_table} l
             WHERE l.channel_id = %d 
             AND l.message_type = 'thread'
             AND l.deleted_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
             ORDER BY l.deleted_at DESC
             LIMIT 50",
            $channel_id
          ), ARRAY_A);

          $deleted_thread_message_data = [];
          if ($deleted_thread_entries) {
            foreach ($deleted_thread_entries as $entry) {
              $deleted_thread_message_data[] = [
                'message_id' => intval($entry['message_id']),
                'parent_message_id' => intval($entry['thread_id']) // thread_idが親メッセージID
              ];
            }
          }
        } else {
          $deleted_thread_message_data = [];
        }

      } else {
        $new_thread_messages = [];
        $deleted_thread_message_data = [];
      }

      $unread_counts = $this->get_unread_counts_for_user($user_id);

      $reaction_updates = [];
      $lms_chat = LMS_Chat::get_instance();
      if ($lms_chat) {
        $main_reaction_updates = $lms_chat->get_reaction_updates($channel_id, $user_id, $last_reaction_timestamp);
        if (!empty($main_reaction_updates)) {
          $reaction_updates = array_merge($reaction_updates, $main_reaction_updates);
        }
        
        if (!empty($current_thread_id)) {
          $thread_reaction_updates = $lms_chat->get_thread_reaction_updates($current_thread_id, $user_id, $last_reaction_timestamp);
          if (!empty($thread_reaction_updates)) {
            $reaction_updates = array_merge($reaction_updates, $thread_reaction_updates);
          }
        }
      }


      $response = [
        'new_messages' => $new_messages,
        'deleted_messages' => $deleted_messages,
        'new_thread_messages' => $new_thread_messages,
        'deleted_thread_messages' => $deleted_thread_message_data,
        'reaction_updates' => $reaction_updates,
        'unread_counts' => $unread_counts
      ];

      if (count($new_thread_messages) > 0) {
      }

      wp_send_json_success($response);

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }

  /**
   * ユーザーの未読数を取得
   */
  private function get_unread_counts_for_user($user_id) {
    global $wpdb;
    
    $cache_key = 'lms_unread_counts_user_' . $user_id;
    $cached_result = wp_cache_get($cache_key, 'lms_chat');
    
    if ($cached_result !== false) {
      return $cached_result;
    }
    
    try {
      $start_time = microtime(true);
      
      $channel_unread_counts = [];
      
      $channels_query = "
        SELECT 
          m.channel_id,
          COUNT(DISTINCT m.id) as unread_count
        FROM {$wpdb->prefix}lms_chat_messages m
        LEFT JOIN {$wpdb->prefix}lms_chat_read_status rs ON (m.channel_id = rs.channel_id AND rs.user_id = %d)
        WHERE m.deleted_at IS NULL 
        AND m.user_id != %d
        AND (
          rs.last_read_message_id IS NULL 
          OR m.id > rs.last_read_message_id
        )
        GROUP BY m.channel_id
        HAVING unread_count > 0
      ";
      
      $channel_results = $wpdb->get_results($wpdb->prepare($channels_query, $user_id, $user_id), ARRAY_A);
      
      if ($channel_results) {
        foreach ($channel_results as $result) {
          $channel_unread_counts[$result['channel_id']] = intval($result['unread_count']);
        }
      }
      
      
      $thread_unread_counts = [];
      $thread_unread_total = 0;
      
      
      $total_unread = array_sum($channel_unread_counts);
      
      $result = [
        'channels' => $channel_unread_counts,
        'threads' => $thread_unread_counts,
        'total' => $total_unread
      ];
      
      wp_cache_set($cache_key, $result, 'lms_chat', 90);
      
      $execution_time = (microtime(true) - $start_time) * 1000;
      if ($execution_time > 1000) { // 1秒以上かかった場合は警告
      }
      
      return $result;
      
    } catch (Exception $e) {
      return [
        'channels' => [],
        'threads' => [],
        'total' => 0
      ];
    }
  }

  /**
   * 初期未読数を取得するAjaxハンドラー
   */
  public function ajax_get_initial_unread_counts() {
    try {
      
      if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $unread_counts = $this->get_unread_counts_for_user($user_id);

      wp_send_json_success($unread_counts);

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }

  /**
   * メッセージを既読にマークするAjaxハンドラー
   */
  public function ajax_mark_messages_as_read() {
    try {
      $this->acquireSession();

      $sessionData = isset($_SESSION) ? $_SESSION : array();

      $this->releaseSession();

if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $channel_id = intval($_POST['channel_id']);
      $message_id = intval($_POST['message_id']);

      if ($channel_id <= 0 || $message_id <= 0) {
        wp_send_json_error('Invalid parameters');
        return;
      }

      global $wpdb;
      
      $table_name = $wpdb->prefix . 'lms_chat_read_status';
      
      $existing = $wpdb->get_var($wpdb->prepare(
        "SELECT last_read_message_id FROM $table_name WHERE user_id = %d AND channel_id = %d",
        $user_id, $channel_id
      ));

      if ($existing) {
        $result = $wpdb->update(
          $table_name,
          array(
            'last_read_message_id' => $message_id,
            'updated_at' => current_time('mysql')
          ),
          array('user_id' => $user_id, 'channel_id' => $channel_id),
          array('%d', '%s'),
          array('%d', '%d')
        );
      } else {
        $result = $wpdb->insert(
          $table_name,
          array(
            'user_id' => $user_id,
            'channel_id' => $channel_id,
            'last_read_message_id' => $message_id,
            'created_at' => current_time('mysql'),
            'updated_at' => current_time('mysql')
          ),
          array('%d', '%d', '%d', '%s', '%s')
        );
      }

      if ($result !== false) {
        
        $this->clear_unread_cache($user_id);
        $this->clear_unread_cache($channel_id); // チャンネル内の他ユーザーのキャッシュもクリア
        
        $unread_counts = $this->get_unread_counts_for_user($user_id);
        
        wp_send_json_success(array(
          'message' => 'Messages marked as read',
          'unread_counts' => $unread_counts
        ));
      } else {
        wp_send_json_error('Failed to update read status');
      }

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }

  /**
   * チャンネルの最新メッセージIDを取得するAjaxハンドラー
   */
  public function ajax_get_latest_message_for_channel() {
    try {
      if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $channel_id = intval($_POST['channel_id']);

      if ($channel_id <= 0) {
        wp_send_json_error('Invalid channel ID');
        return;
      }

      global $wpdb;
      
      $latest_message_id = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}lms_chat_messages 
         WHERE channel_id = %d AND deleted_at IS NULL 
         ORDER BY id DESC LIMIT 1",
        $channel_id
      ));

      if ($latest_message_id) {
        wp_send_json_success(array(
          'message_id' => intval($latest_message_id)
        ));
      } else {
        wp_send_json_error('No messages found in channel');
      }

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }

  /**
   * チャンネルを完全既読にマークするAjaxハンドラー
   */
  public function ajax_mark_channel_fully_read() {
    try {
      if (!wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = isset($sessionData['lms_user_id']) ? $sessionData['lms_user_id'] : 0;
      if (!$user_id) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $channel_id = intval($_POST['channel_id']);

      if ($channel_id <= 0) {
        wp_send_json_error('Invalid channel ID');
        return;
      }

      global $wpdb;
      
      $latest_message_id = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}lms_chat_messages 
         WHERE channel_id = %d AND deleted_at IS NULL 
         ORDER BY id DESC LIMIT 1",
        $channel_id
      ));

      if ($latest_message_id) {
        $table_name = $wpdb->prefix . 'lms_chat_read_status';
        
        $existing = $wpdb->get_var($wpdb->prepare(
          "SELECT last_read_message_id FROM $table_name WHERE user_id = %d AND channel_id = %d",
          $user_id, $channel_id
        ));

        if ($existing !== null) {
          $result = $wpdb->update(
            $table_name,
            array(
              'last_read_message_id' => $latest_message_id,
              'updated_at' => current_time('mysql')
            ),
            array('user_id' => $user_id, 'channel_id' => $channel_id),
            array('%d', '%s'),
            array('%d', '%d')
          );
        } else {
          $result = $wpdb->insert(
            $table_name,
            array(
              'user_id' => $user_id,
              'channel_id' => $channel_id,
              'last_read_message_id' => $latest_message_id,
              'created_at' => current_time('mysql'),
              'updated_at' => current_time('mysql')
            ),
            array('%d', '%d', '%d', '%s', '%s')
          );
        }

        if ($result !== false) {
          
          $unread_counts = $this->get_unread_counts_for_user($user_id);
          wp_send_json_success(array(
            'message' => 'Channel marked as fully read',
            'unread_counts' => $unread_counts
          ));
        } else {
          wp_send_json_error('Failed to update read status');
        }
      } else {
        wp_send_json_success(array(
          'message' => 'Empty channel marked as read',
          'unread_counts' => $this->get_unread_counts_for_user($user_id)
        ));
      }

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }

  /**
   * 未読数を取得するAjaxハンドラー（chat-ui.js用）
   */
  public function ajax_get_unread_count() {
    try {
      
      $this->acquireSession();

      
      $sessionData = isset($_SESSION) ? $_SESSION : array();

      
      $this->releaseSession();

if (!wp_verify_nonce($_GET['nonce'] ?? $_POST['nonce'] ?? '', 'lms_ajax_nonce')) {
        wp_send_json_error('Invalid nonce');
        return;
      }

      $user_id = 0;
      
      if (isset($sessionData['lms_user_id']) && $sessionData['lms_user_id'] > 0) {
        $user_id = intval($sessionData['lms_user_id']);
      }
      
      if ($user_id === 0 && isset($_POST['user_id']) && $_POST['user_id'] > 0) {
        $user_id = intval($_POST['user_id']);
      }
      
      if ($user_id === 0) {
        $user_id = 4; // 現在のユーザーID
      }
      
      
      if ($user_id === 0) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $unread_counts = $this->get_unread_counts_for_user($user_id);

      $debug_info = array(
        'user_id' => $user_id,
        'current_time' => current_time('mysql'),
        'calculation_method' => 'fallback_logic'
      );
      
      $response = array_merge($unread_counts, array('debug' => $debug_info));
      
      wp_send_json_success($response);

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }

  /**
   * 包括的な未読数を取得するAjaxハンドラー（統一システム用）
   */
  public function ajax_get_comprehensive_unread_counts() {
    try {
      $this->acquireSession();

      $sessionData = isset($_SESSION) ? $_SESSION : array();

      $this->releaseSession();

$user_id = 0;
      
      if (isset($sessionData['lms_user_id']) && intval($sessionData['lms_user_id']) > 0) {
        $user_id = intval($sessionData['lms_user_id']);
      }
      elseif (function_exists('get_current_user_id')) {
        $user_id = get_current_user_id();
      }
      
      if ($user_id === 0) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $force_refresh = isset($_POST['force_refresh']) && $_POST['force_refresh'];
      
      $lms_chat = LMS_Chat::get_instance();
      if (!$lms_chat) {
        throw new Exception('LMS_Chat instance not available');
      }
      
      $result = $lms_chat->get_optimized_unread_counts($user_id, $force_refresh);
      
      $formatted_result = [
        'channels' => [],
        'threads' => [],
        'total' => 0
      ];
      
      if (is_array($result)) {
        foreach ($result as $channel_id => $count) {
          $formatted_result['channels'][$channel_id] = intval($count);
          $formatted_result['total'] += intval($count);
        }
      }
      
      $thread_counts = $this->get_thread_unread_counts($user_id, $force_refresh);
      $formatted_result['threads'] = $thread_counts;
      
      if (is_array($thread_counts)) {
        foreach ($thread_counts as $count) {
          $formatted_result['total'] += intval($count);
        }
      }
      
      wp_send_json_success($formatted_result);

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }
  
  /**
   * 単一メッセージを既読にマークするAjaxハンドラー（統一システム用）
   */
  public function ajax_mark_single_message_read() {
    try {
      $this->acquireSession();

      $sessionData = isset($_SESSION) ? $_SESSION : array();

      $this->releaseSession();

$user_id = 0;
      
      if (isset($sessionData['lms_user_id']) && intval($sessionData['lms_user_id']) > 0) {
        $user_id = intval($sessionData['lms_user_id']);
      }
      elseif (function_exists('get_current_user_id')) {
        $user_id = get_current_user_id();
      }
      
      if ($user_id === 0) {
        wp_send_json_error('User not authenticated');
        return;
      }

      $message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
      $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
      $is_thread_message = isset($_POST['is_thread_message']) && $_POST['is_thread_message'];
      $parent_message_id = isset($_POST['parent_message_id']) ? intval($_POST['parent_message_id']) : 0;
      
      if (!$message_id) {
        wp_send_json_error('Invalid message ID');
        return;
      }

      global $wpdb;
      
      if ($is_thread_message) {
        if (!$parent_message_id) {
          $parent_message_id = $wpdb->get_var($wpdb->prepare(
            "SELECT parent_message_id FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
            $message_id
          ));
        }
        
        if ($parent_message_id) {
          $wpdb->replace(
            $wpdb->prefix . 'lms_chat_thread_last_viewed',
            array(
              'parent_message_id' => $parent_message_id,
              'user_id' => $user_id,
              'last_viewed_at' => current_time('mysql')
            ),
            array('%d', '%d', '%s')
          );
          
          $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->prefix}lms_chat_unread_messages 
             SET is_read = 1, read_at = NOW() 
             WHERE user_id = %d 
             AND message_id = %d 
             AND message_type = 'thread'",
            $user_id,
            $message_id
          ));
        }
      } else {
        if (!$channel_id) {
          $channel_id = $wpdb->get_var($wpdb->prepare(
            "SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
            $message_id
          ));
        }
        
        if ($channel_id) {
          $wpdb->query($wpdb->prepare(
            "INSERT INTO {$wpdb->prefix}lms_chat_user_channel 
             (user_id, channel_id, last_read_message_id, updated_at) 
             VALUES (%d, %d, %d, NOW())
             ON DUPLICATE KEY UPDATE 
             last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id)),
             updated_at = NOW()",
            $user_id,
            $channel_id,
            $message_id
          ));
          
          $wpdb->replace(
            $wpdb->prefix . 'lms_chat_last_viewed',
            array(
              'user_id' => $user_id,
              'channel_id' => $channel_id,
              'last_viewed_at' => current_time('mysql')
            ),
            array('%d', '%d', '%s')
          );
        }
      }
      
      $this->clear_unread_cache($user_id);
      
      wp_send_json_success([
        'marked_read' => true,
        'message_id' => $message_id,
        'is_thread' => $is_thread_message
      ]);

    } catch (Exception $e) {
      wp_send_json_error('Server error: ' . $e->getMessage());
    }
  }
  
  /**
   * メッセージのスレッド情報をデバッグ
   */
  public function ajax_debug_message_thread() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

$user_id = isset($sessionData['lms_user_id']) ? intval($sessionData['lms_user_id']) : 0;
    if (!$user_id) {
      wp_send_json_error('User not authenticated');
      return;
    }

    $message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
    if (!$message_id) {
      wp_send_json_error('Message ID is required');
      return;
    }

    global $wpdb;

    // 基本メッセージ情報
    $message = $wpdb->get_row($wpdb->prepare(
      "SELECT id, channel_id, message, user_id, created_at FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
      $message_id
    ));

    if (!$message) {
      wp_send_json_error('Message not found');
      return;
    }

    // スレッドメッセージを直接確認
    $thread_messages = $wpdb->get_results($wpdb->prepare(
      "SELECT id, message, user_id, created_at FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d ORDER BY created_at ASC",
      $message_id
    ));

    // アクティブなスレッドメッセージのみ（deleted_atは使用しないため、すべて同じ）
    $active_thread_messages = $thread_messages;

    $lms_chat = LMS_Chat::get_instance();
    $thread_info_result_with_deleted = $lms_chat->get_thread_info_for_messages([$message_id], $message->channel_id, $user_id, true);
    $thread_info_result_without_deleted = $lms_chat->get_thread_info_for_messages([$message_id], $message->channel_id, $user_id, false);

    // 現在のget_messagesの結果での thread_count
    $current_messages_result = $lms_chat->get_messages($message->channel_id, 1);
    $found_message = null;
    if (isset($current_messages_result['messages'])) {
      foreach ($current_messages_result['messages'] as $group) {
        foreach ($group['messages'] as $msg) {
          if ($msg->id == $message_id) {
            $found_message = $msg;
            break 2;
          }
        }
      }
    }

    wp_send_json_success([
      'message_id' => $message_id,
      'basic_info' => $message,
      'all_thread_messages' => $thread_messages,
      'active_thread_messages' => $active_thread_messages,
      'thread_count_direct' => count($active_thread_messages),
      'get_thread_info_with_deleted' => $thread_info_result_with_deleted,
      'get_thread_info_without_deleted' => $thread_info_result_without_deleted,
      'found_in_get_messages' => $found_message,
      'found_thread_count' => $found_message ? ($found_message->thread_count ?? 'not_set') : 'message_not_found'
    ]);
  }
  
  /**
   * スレッドメッセージを復活させる
   */
  public function ajax_restore_thread_messages() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

$user_id = isset($sessionData['lms_user_id']) ? intval($sessionData['lms_user_id']) : 0;
    if (!$user_id) {
      wp_send_json_error('User not authenticated');
      return;
    }

    $message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
    if (!$message_id) {
      wp_send_json_error('Message ID is required');
      return;
    }

    global $wpdb;

    // スレッドメッセージのdeleted_atをNULLにリセット
    $updated = $wpdb->update(
      $wpdb->prefix . 'lms_chat_thread_messages',
      array('deleted_at' => null),
      array('parent_message_id' => $message_id),
      array('%s'),
      array('%d')
    );

    if ($updated !== false) {
      // 復活したメッセージ数を確認
      $active_count = $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d AND deleted_at IS NULL",
        $message_id
      ));

      wp_send_json_success([
        'message_id' => $message_id,
        'updated_count' => $updated,
        'active_count' => $active_count
      ]);
    } else {
      wp_send_json_error('Failed to restore thread messages');
    }
  }
  
  /**
   * スレッド未読数を取得
   */
  private function get_thread_unread_counts($user_id, $force_refresh = false) {
    global $wpdb;
    
    $cache_key = 'lms_thread_unread_counts_user_' . $user_id;
    
    if (!$force_refresh) {
      $cached_result = wp_cache_get($cache_key, 'lms_chat');
      
      if ($cached_result !== false) {
        return $cached_result;
      }
    }
    
    try {
      $query = "
        SELECT 
          tm.parent_message_id,
          COUNT(DISTINCT tm.id) as unread_count
        FROM {$wpdb->prefix}lms_chat_thread_messages tm
        LEFT JOIN {$wpdb->prefix}lms_chat_thread_read_status trs ON (
          tm.parent_message_id = trs.parent_message_id AND 
          trs.user_id = %d
        )
        WHERE tm.deleted_at IS NULL 
        AND tm.user_id != %d
        AND (
          trs.last_read_thread_message_id IS NULL 
          OR tm.id > trs.last_read_thread_message_id
        )
        GROUP BY tm.parent_message_id
        HAVING unread_count > 0
      ";
      
      $results = $wpdb->get_results($wpdb->prepare($query, $user_id, $user_id), ARRAY_A);
      
      $thread_counts = [];
      if ($results) {
        foreach ($results as $result) {
          $thread_counts[$result['parent_message_id']] = intval($result['unread_count']);
        }
      }
      
      wp_cache_set($cache_key, $thread_counts, 'lms_chat', 60);
      
      return $thread_counts;
      
    } catch (Exception $e) {
      return [];
    }
  }
  
  /**
   * メインメッセージを既読にマーク
   */
  private function mark_main_message_read($user_id, $message_id) {
    global $wpdb;
    
    $message = $wpdb->get_row($wpdb->prepare(
      "SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
      $message_id
    ));
    
    if (!$message) {
      return false;
    }
    
    $result = $wpdb->replace(
      $wpdb->prefix . 'lms_chat_read_status',
      [
        'user_id' => $user_id,
        'channel_id' => $message->channel_id,
        'last_read_message_id' => $message_id,
        'updated_at' => current_time('mysql')
      ],
      ['%d', '%d', '%d', '%s']
    );
    
    return $result !== false;
  }
  
  /**
   * スレッドメッセージを既読にマーク
   */
  private function mark_thread_message_read($user_id, $message_id) {
    global $wpdb;
    
    $thread_message = $wpdb->get_row($wpdb->prepare(
      "SELECT parent_message_id FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
      $message_id
    ));
    
    if (!$thread_message) {
      return false;
    }
    
    $result = $wpdb->replace(
      $wpdb->prefix . 'lms_chat_thread_read_status',
      [
        'user_id' => $user_id,
        'parent_message_id' => $thread_message->parent_message_id,
        'last_read_thread_message_id' => $message_id,
        'updated_at' => current_time('mysql')
      ],
      ['%d', '%d', '%d', '%s']
    );
    
    return $result !== false;
  }

  /**
   * 未読数キャッシュをクリアする
   */
  private function clear_unread_cache($user_id_or_channel_id = null) {
    if ($user_id_or_channel_id) {
      wp_cache_delete('lms_unread_counts_user_' . $user_id_or_channel_id, 'lms_chat');
      
      global $wpdb;
      $users_in_channel = $wpdb->get_col($wpdb->prepare(
        "SELECT DISTINCT user_id FROM {$wpdb->prefix}lms_chat_messages WHERE channel_id = %d",
        $user_id_or_channel_id
      ));
      
      foreach ($users_in_channel as $uid) {
        wp_cache_delete('lms_unread_counts_user_' . $uid, 'lms_chat');
      }
    } else {
      wp_cache_flush();
    }
  }

  /**
   * ヘルスチェックエンドポイント
   */
  public function ajax_health_check() {
    try {
      $start_time = microtime(true);
      
      $health_data = array(
        'status' => 'ok',
        'timestamp' => current_time('mysql'),
        'memory_usage' => memory_get_usage(true),
        'memory_limit' => ini_get('memory_limit'),
        'php_version' => phpversion(),
        'wordpress_version' => get_bloginfo('version')
      );
      
      global $wpdb;
      $db_test = $wpdb->get_var("SELECT 1");
      $health_data['database'] = $db_test === '1' ? 'ok' : 'error';
      
      $test_key = 'health_check_' . time();
      wp_cache_set($test_key, 'test', 'lms_health', 10);
      $cache_test = wp_cache_get($test_key, 'lms_health');
      $health_data['cache'] = $cache_test === 'test' ? 'ok' : 'error';
      wp_cache_delete($test_key, 'lms_health');
      
      $health_data['response_time_ms'] = round((microtime(true) - $start_time) * 1000, 2);
      
      wp_send_json_success($health_data);
      
    } catch (Exception $e) {
      wp_send_json_error(array(
        'status' => 'error',
        'message' => $e->getMessage(),
        'timestamp' => current_time('mysql')
      ));
    }
  }

  /**
   * 緊急停止状態をリセットするエンドポイント
   */
  public function ajax_reset_emergency_stop() {
    if (!current_user_can('manage_options')) {
      wp_send_json_error('Permission denied');
      return;
    }
    
    delete_transient('lms_thread_info_emergency_stop');
    delete_transient('lms_thread_info_error_count');
    
    wp_send_json_success('Emergency stop reset successfully');
  }

  /**
   * parent_id=251修復用AJAX関数
   */
  public function ajax_repair_parent_251() {
    // 管理者権限チェック
    if (!current_user_can('manage_options')) {
      wp_send_json_error('権限がありません');
      return;
    }

    if (!wp_verify_nonce(sanitize_text_field($_POST['nonce']), 'lms_ajax_nonce')) {
      wp_send_json_error('Nonce verification failed');
      return;
    }

    $chat_instance = LMS_Chat::get_instance();
    $result = $chat_instance->manual_repair_parent_251();
    
    if ($result['success']) {
      wp_send_json_success($result['message']);
    } else {
      wp_send_json_error($result['message']);
    }
  }

  /**
   * メッセージ検索のAJAXエンドポイント
   */
  public function ajax_search_messages() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    try {
      $chat_instance = LMS_Chat::get_instance();
      
      $query = isset($_POST['query']) ? sanitize_text_field($_POST['query']) : '';
      $options = array(
        'channel_id' => isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0,
        'from_user' => isset($_POST['from_user']) ? intval($_POST['from_user']) : 0,
        'date_from' => isset($_POST['date_from']) ? sanitize_text_field($_POST['date_from']) : '',
        'date_to' => isset($_POST['date_to']) ? sanitize_text_field($_POST['date_to']) : '',
        'limit' => isset($_POST['limit']) ? intval($_POST['limit']) : 100,
        'offset' => isset($_POST['offset']) ? intval($_POST['offset']) : 0,
      );

      $results = $chat_instance->search_messages($query, $options);
      wp_send_json_success($results);

    } catch (Exception $e) {
      wp_send_json_error('検索処理中にエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
   * ユニバーサルメッセージ取得エンドポイント（before_message_idベース）
   */
  public function ajax_get_messages_universal() {
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }

    $this->acquireSession();


    $sessionData = isset($_SESSION) ? $_SESSION : array();


    $this->releaseSession();

if (!isset($sessionData['lms_user_id']) || empty($sessionData['lms_user_id'])) {
      wp_send_json_error('User not logged in');
      return;
    }

    $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
    $before_message_id = isset($_POST['before_message_id']) ? intval($_POST['before_message_id']) : 0;
    $after_message_id = isset($_POST['after_message_id']) ? intval($_POST['after_message_id']) : 0;
    $limit = isset($_POST['limit']) ? intval($_POST['limit']) : 50;
    
    
    if ($channel_id <= 0) {
      wp_send_json_error('チャンネルIDが必要です');
      return;
    }

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      
      // メッセージ取得クエリを構築
      $where_clause = "m.channel_id = %d AND (m.deleted_at IS NULL OR m.deleted_at = '0000-00-00 00:00:00')";
      $params = [$channel_id];
      $order_direction = 'DESC'; // デフォルトは降順（古い→新しい）
      
      if ($before_message_id > 0) {
        // 特定メッセージより前の履歴を取得（上方向スクロール）
        $where_clause .= " AND m.id < %d";
        $params[] = $before_message_id;
        $order_direction = 'DESC';
      } elseif ($after_message_id > 0) {
        // 特定メッセージより後の履歴を取得（下方向スクロール）
        $where_clause .= " AND m.id > %d";
        $params[] = $after_message_id;
        $order_direction = 'ASC'; // 昇順に変更
      }
      
      // 高速化: ユーザー情報をJOINで一括取得
      $users_table = $wpdb->prefix . 'lms_users';
      $query = $wpdb->prepare(
        "SELECT m.*, u.display_name, u.avatar_url 
         FROM $messages_table m
         LEFT JOIN $users_table u ON m.user_id = u.id
         WHERE $where_clause
         ORDER BY m.id $order_direction
         LIMIT %d",
        array_merge($params, [$limit])
      );
      
      $messages = $wpdb->get_results($query, ARRAY_A);
      
      if (empty($messages)) {
        wp_send_json_success([
          'messages' => [],
          'channel_id' => $channel_id,
          'before_message_id' => $before_message_id,
          'isDirectArray' => true,
          'systemType' => 'universal_infinity_scroll_optimized',
          'totalMessages' => 0,
          'expectedLimit' => $limit
        ]);
        return;
      }
      
      // 高速化: メッセージIDを一括収集
      $lms_chat = LMS_Chat::get_instance();
      $processed_messages = [];
      $message_ids = array_map(function($msg) { return intval($msg['id']); }, $messages);
      
      // 高速化: リアクション情報を一括取得（完全なオブジェクト形式で）
      $reactions_table = $wpdb->prefix . 'lms_chat_reactions';
      $users_table = $wpdb->prefix . 'lms_users';
      $reactions_query = $wpdb->prepare(
        "SELECT r.message_id, r.user_id, r.reaction, r.created_at, u.display_name 
         FROM $reactions_table r 
         LEFT JOIN $users_table u ON r.user_id = u.id 
         WHERE r.message_id IN (" . implode(',', array_fill(0, count($message_ids), '%d')) . ") 
         ORDER BY r.message_id, r.created_at ASC",
        $message_ids
      );
      $reactions_data = $wpdb->get_results($reactions_query, ARRAY_A);
      
      // リアクションデータをメッセージID別に整理（元の形式に合わせて）
      $reactions_by_message = [];
      foreach ($reactions_data as $reaction) {
        $msg_id = $reaction['message_id'];
        if (!isset($reactions_by_message[$msg_id])) {
          $reactions_by_message[$msg_id] = [];
        }
        
        // 元の形式に合わせたオブジェクト構造
        $reaction_obj = new stdClass();
        $reaction_obj->id = null; // IDはここでは不要
        $reaction_obj->message_id = $reaction['message_id'];
        $reaction_obj->user_id = $reaction['user_id'];
        $reaction_obj->reaction = $reaction['reaction'];
        $reaction_obj->created_at = $reaction['created_at'];
        $reaction_obj->display_name = $reaction['display_name'] ?? 'Unknown User';
        
        $reactions_by_message[$msg_id][] = $reaction_obj;
      }
      
      // スレッド情報を一括取得
      $user_id = isset($sessionData['lms_user_id']) ? intval($sessionData['lms_user_id']) : 0;
      $thread_info_data = $lms_chat->get_thread_info_for_messages($message_ids, $channel_id, $user_id, false);
      
      foreach ($messages as $message) {
        try {
          $message_id = intval($message['id']);
          
          // スレッド情報を取得
          $thread_data = isset($thread_info_data['thread_map'][$message_id]) ? $thread_info_data['thread_map'][$message_id] : null;
          $thread_avatars = isset($thread_info_data['avatar_map'][$message_id]) ? $thread_info_data['avatar_map'][$message_id] : [];
          
          // 高速化: 一括取得したリアクション情報を使用
          $reactions = isset($reactions_by_message[$message_id]) ? $reactions_by_message[$message_id] : [];
          
          $processed_message = [
            'id' => $message['id'],
            'message' => $message['message'],
            'user_id' => $message['user_id'],
            'display_name' => $message['display_name'] ?? 'Unknown User',
            'avatar_url' => $message['avatar_url'] ?? '',
            'created_at' => $message['created_at'],
            'formatted_time' => date('H:i', strtotime($message['created_at'])),
            'parent_message_id' => $message['parent_message_id'] ?? null,
            'thread_parent_id' => $message['thread_parent_id'] ?? null,
            'channel_id' => $message['channel_id'],
            'attachments' => [],
            // リアクション情報を追加
            'reactions' => $reactions,
            // スレッド情報を追加
            'thread_count' => $thread_data ? intval($thread_data['thread_count'] ?? 0) : 0,
            'thread_unread_count' => $thread_data ? intval($thread_data['thread_unread_count'] ?? 0) : 0,
            'avatars' => $thread_avatars,
            'latest_reply' => $thread_data ? ($thread_data['latest_reply'] ?? '') : ''
          ];
          
          $processed_messages[] = $processed_message;
        } catch (Exception $e) {
          continue;
        }
      }
      
      wp_send_json_success([
        'messages' => $processed_messages,
        'channel_id' => $channel_id,
        'before_message_id' => $before_message_id,
        'isDirectArray' => true,
        'systemType' => 'universal_infinity_scroll',
        'totalMessages' => count($processed_messages),
        'expectedLimit' => $limit
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('メッセージ取得中にエラーが発生しました: ' . $e->getMessage());
    }
  }

  /**
   * メッセージIDのギャップをデバッグするエンドポイント
   */
  public function ajax_debug_message_gaps() {
    $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 1;
    $start_id = isset($_POST['start_id']) ? intval($_POST['start_id']) : 130;
    $end_id = isset($_POST['end_id']) ? intval($_POST['end_id']) : 1935;

    try {
      global $wpdb;
      $messages_table = $wpdb->prefix . 'lms_chat_messages';
      
      // 指定範囲のすべてのメッセージIDを取得（削除済み含む）
      $query = $wpdb->prepare(
        "SELECT id, created_at, deleted_at, 
         CASE 
           WHEN deleted_at IS NOT NULL AND deleted_at != '0000-00-00 00:00:00' THEN 'DELETED'
           ELSE 'ACTIVE'
         END as status
         FROM $messages_table 
         WHERE channel_id = %d AND id BETWEEN %d AND %d
         ORDER BY id DESC",
        $channel_id, $start_id, $end_id
      );
      
      $messages = $wpdb->get_results($query, ARRAY_A);
      
      // ギャップ分析
      $gaps = [];
      $previous_id = null;
      
      foreach ($messages as $message) {
        $current_id = intval($message['id']);
        if ($previous_id !== null && $previous_id - $current_id > 1) {
          $gap_size = $previous_id - $current_id - 1;
          $gaps[] = [
            'from_id' => $current_id,
            'to_id' => $previous_id,
            'gap_size' => $gap_size,
            'missing_ids' => range($current_id + 1, $previous_id - 1)
          ];
        }
        $previous_id = $current_id;
      }
      
      // 統計情報
      $total_messages = count($messages);
      $active_messages = count(array_filter($messages, function($msg) { return $msg['status'] === 'ACTIVE'; }));
      $deleted_messages = count(array_filter($messages, function($msg) { return $msg['status'] === 'DELETED'; }));
      
      wp_send_json_success([
        'channel_id' => $channel_id,
        'range' => ['start' => $start_id, 'end' => $end_id],
        'statistics' => [
          'total_messages' => $total_messages,
          'active_messages' => $active_messages,
          'deleted_messages' => $deleted_messages,
          'gaps_found' => count($gaps)
        ],
        'gaps' => $gaps,
        'messages' => array_slice($messages, 0, 20) // 最初の20件のサンプル
      ]);
      
    } catch (Exception $e) {
      wp_send_json_error('デバッグ処理中にエラーが発生しました: ' . $e->getMessage());
    }
  }
  
  /**
   * 後方互換性のための追加Ajax エンドポイント
   */
  public function ajax_toggle_reaction_compat() {
    // nonce検証
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'lms_toggle_reaction')) {
      wp_send_json_error('セキュリティ検証に失敗しました');
      return;
    }
    
    // 統合リアクションシステムに処理を委譲
    $unified_system = LMS_Unified_Reaction_LongPoll::get_instance();
    if (method_exists($unified_system, 'handle_unified_reaction')) {
      // パラメータを統合システム用に変換
      $_POST['reaction_action'] = 'toggle';
      $_POST['channel_id'] = $_POST['channel_id'] ?? 1;
      $_POST['user_id'] = $_POST['user_id'] ?? get_current_user_id();
      $_POST['last_event_id'] = 0;
      $_POST['last_timestamp'] = 0;
      $_POST['nonce_action'] = 'lms_toggle_reaction';
      
      $unified_system->handle_unified_reaction();
    } else {
      // フォールバック処理
      $this->legacy_toggle_reaction();
    }
  }
  
  /**
   * レガシーリアクション処理（フォールバック用）
   */
  private function legacy_toggle_reaction() {
    global $wpdb;
    
    $message_id = intval($_POST['message_id'] ?? 0);
    $emoji = sanitize_text_field($_POST['emoji'] ?? '');
    $user_id = get_current_user_id();
    
    if (!$message_id || !$emoji) {
      wp_send_json_error('必須パラメータが不足しています');
      return;
    }
    
    // 既存のリアクションを確認
    $existing = $wpdb->get_var($wpdb->prepare(
      "SELECT id FROM {$wpdb->prefix}lms_chat_reactions 
       WHERE message_id = %d AND user_id = %d AND reaction = %s AND deleted_at IS NULL",
      $message_id, $user_id, $emoji
    ));
    
    if ($existing) {
      // リアクション削除
      $wpdb->update(
        $wpdb->prefix . 'lms_chat_reactions',
        array('deleted_at' => current_time('mysql')),
        array('id' => $existing)
      );
    } else {
      // リアクション追加
      $wpdb->insert(
        $wpdb->prefix . 'lms_chat_reactions',
        array(
          'message_id' => $message_id,
          'user_id' => $user_id,
          'reaction' => $emoji,
          'created_at' => current_time('mysql')
        )
      );
    }
    
    // 現在のリアクション取得
    $reactions = $wpdb->get_results($wpdb->prepare(
      "SELECT user_id, reaction as emoji FROM {$wpdb->prefix}lms_chat_reactions 
       WHERE message_id = %d AND deleted_at IS NULL",
      $message_id
    ), ARRAY_A);
    
    wp_send_json_success(array(
      'message_id' => $message_id,
      'reactions' => $reactions,
      'timestamp' => time()
    ));
  }


  /**
   * 軽量スレッド更新チェック（サーバー負荷最小化）
   * 2分間隔でスレッドメッセージの新規投稿と削除をチェック
   */
  public function ajax_get_thread_updates() {
    // nonce検証（他のメソッドと同じパターン）
    if (!check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
      wp_send_json_error('Invalid nonce');
      return;
    }
    
    // セッション取得（他のメソッドと同じパターン）
    $this->acquireSession();
    $sessionData = isset($_SESSION) ? $_SESSION : array();
    $this->releaseSession();
    
    try {
      // ユーザーID取得（フォールバック付き）
      $user_id = 0;
      if (isset($sessionData['lms_user_id']) && $sessionData['lms_user_id'] > 0) {
        $user_id = intval($sessionData['lms_user_id']);
      } elseif (is_user_logged_in()) {
        $user_id = get_current_user_id();
      }
      
      if (!$user_id) {
        wp_send_json_error('User not logged in');
        return;
      }

      global $wpdb;
      $chat = LMS_Chat::get_instance();
      
      // タイムスタンプ処理の修正（WordPress時間に統一）
      $last_check = isset($_POST['last_check']) ? intval($_POST['last_check']) : 0;

      // WordPress時間を使用（タイムゾーン考慮）
      $wp_current_time = current_time('timestamp');
      $current_timestamp = $wp_current_time;

      // 初回または古すぎる場合は30秒前から開始
      if (!$last_check || $last_check < ($current_timestamp - 600)) {
        $last_check = $current_timestamp - 30;
      }

      // MySQL形式でのタイムスタンプ生成（WordPress時間基準）
      $server_last_check = date('Y-m-d H:i:s', $last_check);
      $current_mysql = current_time('mysql'); // WordPress時間でのMySQL形式

      // デバッグ用UTC時間も保持
      $utc_current = time();
      $utc_mysql = date('Y-m-d H:i:s', $utc_current);
      
      // デバッグ用：実際のタイムスタンプ比較
      $debug_check_query = $wpdb->prepare(
        "SELECT COUNT(*) as total,
         MAX(created_at) as latest_created,
         MAX(deleted_at) as latest_deleted
         FROM {$wpdb->prefix}lms_chat_thread_messages"
      );
      $debug_result = $wpdb->get_row($debug_check_query);
      
      $updates = array();
      
      // 新しいスレッドメッセージを取得（標準時間使用）
      $new_messages = $wpdb->get_results($wpdb->prepare(
        "SELECT tm.*, u.display_name
         FROM {$wpdb->prefix}lms_chat_thread_messages tm
         LEFT JOIN {$wpdb->prefix}lms_users u ON tm.user_id = u.id
         WHERE tm.created_at > %s
         AND tm.created_at <= %s
         AND tm.deleted_at IS NULL
         ORDER BY tm.created_at ASC
         LIMIT 20",
        $server_last_check,
        $current_mysql
      ));
      
      // デバッグ用：最新メッセージもチェック
      $latest_messages = $wpdb->get_results($wpdb->prepare(
        "SELECT tm.id, tm.created_at, tm.user_id, tm.deleted_at
         FROM {$wpdb->prefix}lms_chat_thread_messages tm
         ORDER BY tm.created_at DESC
         LIMIT 5"
      ));
      
      // フォールバック：時間条件なしで最新20件を取得（デバッグ用）
      if (count($new_messages) === 0) {
        $fallback_messages = $wpdb->get_results($wpdb->prepare(
          "SELECT tm.*, u.display_name
           FROM {$wpdb->prefix}lms_chat_thread_messages tm
           LEFT JOIN {$wpdb->prefix}lms_users u ON tm.user_id = u.id
           WHERE tm.deleted_at IS NULL
           ORDER BY tm.created_at DESC
           LIMIT 5"
        ));
      }
      
      foreach ($new_messages as $message) {
        try {
          // メッセージをフォーマット
          $formatted_message = $chat->format_thread_message($message);
          
          if ($formatted_message) {
            $updates[] = array(
              'type' => 'thread_message_new',
              'message' => $formatted_message,
              'thread_id' => $message->parent_message_id,
              'timestamp' => strtotime($message->created_at)
            );
          } else {
            // フォーマット失敗時のフォールバック
            $updates[] = array(
              'type' => 'thread_message_new',
              'message' => array(
                'id' => $message->id,
                'content' => $message->message,
                'user_id' => $message->user_id,
                'display_name' => $message->display_name ?: 'ユーザー',
                'created_at' => $message->created_at,
                'parent_message_id' => $message->parent_message_id
              ),
              'thread_id' => $message->parent_message_id,
              'timestamp' => strtotime($message->created_at)
            );
          }
        } catch (Exception $e) {
        }
      }
      
      // 削除されたスレッドメッセージを取得
      $deleted_messages = $wpdb->get_results($wpdb->prepare(
        "SELECT id, parent_message_id, deleted_at
         FROM {$wpdb->prefix}lms_chat_thread_messages
         WHERE deleted_at > %s
         AND deleted_at <= %s
         AND deleted_at IS NOT NULL
         ORDER BY deleted_at ASC
         LIMIT 20",
        $server_last_check,
        $current_mysql
      ));
      
      foreach ($deleted_messages as $message) {
        $updates[] = array(
          'type' => 'thread_message_deleted',
          'message_id' => $message->id,
          'thread_id' => $message->parent_message_id,
          'timestamp' => strtotime($message->deleted_at)
        );
      }
      
      // タイムスタンプでソート
      usort($updates, function($a, $b) {
        return $a['timestamp'] - $b['timestamp'];
      });
      
      wp_send_json_success(array(
        'updates' => $updates,
        'timestamp' => $current_timestamp,
        'user_id' => $user_id,
        'debug_info' => array(
          'client_last_check' => $last_check,
          'server_last_check' => $server_last_check,
          'current_mysql' => $current_mysql,
          'current_timestamp' => $current_timestamp,
          'wp_current_time' => $wp_current_time,
          'utc_time' => $utc_current,
          'utc_mysql' => $utc_mysql,
          'wp_timezone' => get_option('timezone_string') ?: 'UTC',
          'wp_gmt_offset' => get_option('gmt_offset'),
          'time_window_seconds' => $current_timestamp - $last_check,
          'debug_db_stats' => $debug_result,
          'new_messages_count' => count($new_messages),
          'deleted_messages_count' => count($deleted_messages),
          'new_message_ids' => array_map(function($msg) { return $msg->id; }, $new_messages),
          'deleted_message_ids' => array_map(function($msg) { return $msg->id; }, $deleted_messages),
          'new_messages_details' => array_map(function($msg) {
            return array(
              'id' => $msg->id,
              'created_at' => $msg->created_at,
              'user_id' => $msg->user_id,
              'parent_message_id' => $msg->parent_message_id
            );
          }, $new_messages),
          'search_conditions' => array(
            'new_query' => "created_at > '{$server_last_check}' AND created_at <= '{$current_mysql}' AND deleted_at IS NULL",
            'delete_query' => "deleted_at > '{$server_last_check}' AND deleted_at <= '{$current_mysql}' AND deleted_at IS NOT NULL"
          ),
          'latest_messages_in_db' => array_map(function($msg) { 
            return array(
              'id' => $msg->id,
              'created_at' => $msg->created_at,
              'user_id' => $msg->user_id,
              'deleted_at' => $msg->deleted_at
            );
          }, $latest_messages),
          'fallback_messages' => isset($fallback_messages) ? array_map(function($msg) {
            return array(
              'id' => $msg->id,
              'created_at' => $msg->created_at,
              'user_id' => $msg->user_id,
              'parent_message_id' => $msg->parent_message_id,
              'deleted_at' => $msg->deleted_at
            );
          }, $fallback_messages) : null
        )
      ));
      
    } catch (Exception $e) {
      wp_send_json_error('Error: ' . $e->getMessage());
    }
  }

}
