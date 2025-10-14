<?php

/**
 * チャットシステム用ロングポーリングAPI実装
 *
 * 主な機能:
 * - 最大30秒間のロングポーリング待機
 * - 4つのイベント（メインチャット投稿・削除、スレッド投稿・削除）のリアルタイム検出
 * - WordPress nonce による CSRF 対策
 * - ユーザー権限確認
 * - エラーハンドリング
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
  exit;
}

class LMS_Chat_LongPoll
{
  private static $instance = null;

  /**
   * ロングポーリングの最大待機時間（秒）
   */
  const MAX_POLL_TIMEOUT = 10;

  /**
   * ポーリング間隔（マイクロ秒）
   */
  const POLL_INTERVAL = 100000; // 0.1秒（高速化）

  /**
   * イベントタイプ定数
   */
  const EVENT_MESSAGE_CREATE = 'message_create';
  const EVENT_MESSAGE_DELETE = 'message_delete';
  const EVENT_REACTION_UPDATE = 'reaction_update';
  const EVENT_THREAD_CREATE = 'thread_create';
  const EVENT_THREAD_MESSAGE_CREATE = 'thread_message_create';
  const EVENT_THREAD_MESSAGE_DELETE = 'thread_message_delete';
  const EVENT_THREAD_REACTION = 'thread_reaction';

  /**
   * 最新のイベントを保持する配列
   */
  private $recent_events = [];

  /**
   * クエリキャッシュ
   */
  private $query_cache = [];

  /**
   * キャッシュの有効期限（秒）
   */
  const CACHE_TTL = 5;

  /**
   * 圧縮機能の有効/無効
   */
  private $compression_enabled = true;

  /**
   * シングルトンパターンでインスタンスを取得
   */
  public static function get_instance()
  {
    if (null === self::$instance) {
      self::$instance = new self();
    }
    return self::$instance;
  }

  /**
   * コンストラクタ
   */
  private function __construct()
  {
    
    $this->recent_events = array(
      self::EVENT_MESSAGE_CREATE => array(),
      self::EVENT_MESSAGE_DELETE => array(),
      self::EVENT_REACTION_UPDATE => array(),
      self::EVENT_THREAD_CREATE => array(),
      self::EVENT_THREAD_MESSAGE_CREATE => array(),
      self::EVENT_THREAD_MESSAGE_DELETE => array(),
      self::EVENT_THREAD_REACTION => array()
    );
    
    add_action('wp_ajax_lms_chat_poll', array($this, 'handle_long_poll_request'));
    add_action('wp_ajax_nopriv_lms_chat_poll', array($this, 'handle_long_poll_request'));

    add_action('wp_ajax_lms_chat_refresh_nonce', array($this, 'handle_refresh_nonce'));
    add_action('wp_ajax_nopriv_lms_chat_refresh_nonce', array($this, 'handle_refresh_nonce'));

    add_action('lms_chat_message_created', array($this, 'on_message_created'), 10, 3);
    add_action('lms_chat_message_deleted', array($this, 'on_message_deleted'), 10, 3);
    add_action('lms_chat_reaction_updated', array($this, 'on_reaction_updated'), 10, 2);
    add_action('lms_chat_thread_message_created', array($this, 'on_thread_message_created'), 10, 5);
    add_action('lms_chat_thread_message_deleted', array($this, 'on_thread_message_deleted'), 10, 3);
    add_action('lms_thread_reaction_updated', array($this, 'on_thread_reaction_updated'), 10, 4);
    add_action('lms_chat_thread_reaction_updated', array($this, 'on_thread_reaction_updated'), 10, 4);
    

    $this->recent_events = [
      self::EVENT_MESSAGE_CREATE => [],
      self::EVENT_MESSAGE_DELETE => [],
      self::EVENT_THREAD_MESSAGE_CREATE => [],
      self::EVENT_THREAD_MESSAGE_DELETE => [],
    ];
  }

  /**
   * ロングポーリングリクエストのハンドラー
   */
  public function handle_long_poll_request()
  {
    
    if (function_exists('lms_session_start')) {
      lms_session_start();
    } elseif (session_status() === PHP_SESSION_NONE && !headers_sent()) {
      session_start();
    }

    // セッションヘルパーを使用
    $sessionData = acquireSession();
    $session_user_id = isset($sessionData['lms_user_id']) ? intval($sessionData['lms_user_id']) : 0;
    $session_active = !empty($sessionData);

    $nonce = $_POST['nonce'] ?? '';
    $nonce_valid = false;
    $nonce_actions = ['lms_ajax_nonce', 'lms_chat_nonce', 'lms_nonce'];
    
    if ($nonce) {
      foreach ($nonce_actions as $action) {
        if (wp_verify_nonce($nonce, $action)) {
          $nonce_valid = true;
          break;
        }
      }
    }
    
    if (!$nonce_valid) {
      wp_send_json_error(array(
        'message' => 'セキュリティチェックに失敗しました',
        'code' => 'invalid_nonce'
      ));
      exit;
    }
    

    $user_id = 0;
    
    
    if (class_exists('LMS_Auth')) {
      $auth = LMS_Auth::get_instance();
      $current_user = $auth->get_current_user();
      
      if ($current_user && isset($current_user->id)) {
        $correct_user_id = intval($current_user->id);
        
        if ($session_active && $session_user_id !== $correct_user_id) {
          // セッション更新はacquireSession(true)を使用
          $sessionData = acquireSession(true);
          $sessionData['lms_user_id'] = $correct_user_id;
          $_SESSION = array_merge($_SESSION ?? [], $sessionData);
          releaseSession();
          $session_user_id = $correct_user_id;
        }

        $user_id = $correct_user_id;
      }
    }

    if ($user_id <= 0 && $session_user_id > 0) {
      $user_id = $session_user_id;
    }

    if ($user_id <= 0) {
      wp_send_json_error(array(
        'message' => 'ログインが必要です',
        'code' => 'not_authenticated'
      ));
      exit;
    }

    $session_id = $session_active ? session_id() : '';
    if (function_exists('lms_session_close')) {
      lms_session_close();
    } elseif (session_status() === PHP_SESSION_ACTIVE) {
      session_write_close();
    }

    $channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
    $thread_id = isset($_POST['thread_id']) ? intval($_POST['thread_id']) : 0;
    $last_message_id = isset($_POST['last_message_id']) ? intval($_POST['last_message_id']) : 0;
    $timeout = isset($_POST['timeout']) ? min(intval($_POST['timeout']), self::MAX_POLL_TIMEOUT) : self::MAX_POLL_TIMEOUT;
    
    if (!$channel_id) {
      wp_send_json_error(array(
        'message' => 'チャンネルIDが必要です',
        'code' => 'invalid_channel'
      ));
      exit;
    }

    global $wpdb;
    $channel_exists = $wpdb->get_var($wpdb->prepare(
      "SELECT id FROM {$wpdb->prefix}lms_chat_channels WHERE id = %d",
      $channel_id
    ));
    
    if (!$channel_exists) {
      wp_send_json_error(array(
        'message' => 'チャンネルが見つかりません',
        'code' => 'channel_not_found'
      ));
      exit;
    }
    

    $start_time = microtime(true);

    set_time_limit(0);
    ignore_user_abort(true);
    ini_set('max_execution_time', $timeout + 10);
    
    if (function_exists('gc_enable')) {
      gc_enable();
    }

    while (ob_get_level()) {
      ob_end_clean();
    }
    
    if (function_exists('apache_setenv')) {
      apache_setenv('no-gzip', '1');
    }
    ini_set('zlib.output_compression', 'Off');

    $updates = $this->check_updates($channel_id, $thread_id, $last_message_id, $session_id);

    if ($this->has_updates($updates)) {
      $response = array(
        'updates' => $updates,
        'timestamp' => time(),
        'polling_time' => round((microtime(true) - $start_time) * 1000) // ミリ秒
      );
      
      if ($this->compression_enabled) {
        $response['compressed_data'] = $this->compress_data($response);
      }
      
      wp_send_json_success($response);
      exit;
    }

    $end_time = $start_time + $timeout;

    $check_count = 0;
    while (microtime(true) < $end_time) {
      if (connection_aborted()) {
        break;
      }

      usleep(self::POLL_INTERVAL);

      $updates = $this->check_updates($channel_id, $thread_id, $last_message_id, $session_id);
      

      if ($this->has_updates($updates)) {
        
        if (function_exists('gc_collect_cycles')) {
          gc_collect_cycles();
        }
        
        $response = array(
          'updates' => $updates,
          'timestamp' => time(),
          'polling_time' => round((microtime(true) - $start_time) * 1000), // ミリ秒
          'check_count' => $check_count
        );
        
        if ($this->compression_enabled) {
          $response['compressed_data'] = $this->compress_data($response);
        }
        
        wp_send_json_success($response);
        exit;
      }
      
      $check_count++;
      
      if ($check_count % 5 === 0 && function_exists('memory_get_usage')) {
        $memory_usage = memory_get_usage(true);
        $memory_limit = ini_get('memory_limit');
        $memory_limit_bytes = $this->convert_to_bytes($memory_limit);
        
        if ($memory_usage > $memory_limit_bytes * 0.8) {
          break;
        }
      }
    }

    $response = array(
      'updates' => array(),
      'timestamp' => time(),
      'polling_time' => round((microtime(true) - $start_time) * 1000), // ミリ秒
      'timeout' => true
    );
    
    if ($this->compression_enabled) {
      $response['compressed_data'] = $this->compress_data($response);
    }
    
    wp_send_json_success($response);
    exit;
  }

  /**
   * 更新があるかどうかをチェック
   *
   * @param array $updates 更新情報の配列
   * @return bool 更新があればtrue
   */
  private function has_updates($updates)
  {
    return !empty($updates['new_messages']) ||
      !empty($updates['deleted_messages']) ||
      !empty($updates['thread_messages']) ||
      !empty($updates['thread_deleted_messages']);
  }

  /**
   * 更新情報をチェック
   *
   * @param int $channel_id チャンネルID
   * @param int $thread_id スレッドID
   * @param int $last_message_id 最後に受信したメッセージID
   * @return array 更新情報
   */
  private function check_updates($channel_id, $thread_id, $last_message_id = 0, $session_id = null)
  {
    global $wpdb;
    $updates = array();
    $last_message_id = intval($last_message_id);
    
    $this->load_events_from_storage();
    
    $active_session_id = $session_id;
    if (empty($active_session_id)) {
      $active_session_id = session_id();
    }
    if (empty($active_session_id)) {
      $active_session_id = 'guest';
    }
    
    $delivered_messages_key = "lms_delivered_messages_{$active_session_id}_{$channel_id}";
    $delivered_messages = get_transient($delivered_messages_key);
    if (!$delivered_messages || !is_array($delivered_messages)) {
      $delivered_messages = array();
    }
    
    $cache_key = "longpoll_updates_{$channel_id}_{$thread_id}_{$last_message_id}";
    $cache_time = time();
    
    if (isset($this->query_cache[$cache_key])) {
      $cached_data = $this->query_cache[$cache_key];
      if (($cache_time - $cached_data['time']) < self::CACHE_TTL) {
        return $cached_data['data'];
      } else {
        unset($this->query_cache[$cache_key]); // 期限切れキャッシュを削除
      }
    }
    
    $cached_result = wp_cache_get($cache_key, 'lms_chat');
    if ($cached_result !== false) {
      $this->query_cache[$cache_key] = array('data' => $cached_result, 'time' => $cache_time);
      return $cached_result;
    }

    $new_main_messages = array();
    
    $cutoff_time = date('Y-m-d H:i:s', time() - 300); // 5分間に拡大
    
    
    $messages_table = $wpdb->prefix . 'lms_chat_messages';
    $users_table = $wpdb->prefix . 'lms_users';
    
    if ($last_message_id > 0) {
      $new_messages_query = $wpdb->prepare(
        "SELECT m.*, u.display_name, u.avatar_url
         FROM {$messages_table} m
         LEFT JOIN {$users_table} u ON m.user_id = u.id
         WHERE m.channel_id = %d 
         AND m.id > %d
         AND m.deleted_at IS NULL
         ORDER BY m.id ASC
         LIMIT 10",
        $channel_id,
        $last_message_id
      );
    } else {
      $new_messages_query = $wpdb->prepare(
        "SELECT m.*, u.display_name, u.avatar_url
         FROM {$messages_table} m
         LEFT JOIN {$users_table} u ON m.user_id = u.id
         WHERE m.channel_id = %d 
         AND m.created_at > %s
         AND m.deleted_at IS NULL
         ORDER BY m.id ASC
         LIMIT 10",
        $channel_id,
        $cutoff_time
      );
    }
    
    $new_db_messages = $wpdb->get_results($new_messages_query, ARRAY_A);
    
    
    if (!empty($new_db_messages)) {
      foreach ($new_db_messages as $db_message) {
        $message_id = intval($db_message['id']);
        
        /*
        if (in_array($message_id, $delivered_messages)) {
          continue;
        }
        */
        
        $db_message['formatted_time'] = date_i18n('H:i', strtotime($db_message['created_at']));
        
        if (empty($db_message['display_name'])) {
          $db_message['display_name'] = "ユーザー{$db_message['user_id']}";
        }
        
        if (isset($db_message['content']) && !isset($db_message['message'])) {
          $db_message['message'] = $db_message['content'];
        }
        
        if (!isset($db_message['message'])) {
          $db_message['message'] = isset($db_message['content']) ? $db_message['content'] : '';
        }
        
        if (!isset($db_message['content'])) {
          $db_message['content'] = isset($db_message['message']) ? $db_message['message'] : '';
        }
        
        $new_main_messages[] = array(
          'messageId' => $message_id,
          'channelId' => intval($db_message['channel_id']),
          'threadId' => 0,
          'payload' => $db_message
        );
        
      }
    }
    
    if (empty($new_main_messages) && !empty($this->recent_events[self::EVENT_MESSAGE_CREATE])) {
      foreach ($this->recent_events[self::EVENT_MESSAGE_CREATE] as $event) {
        $event_channel_id = intval($event['channel_id']);
        $target_channel_id = intval($channel_id);
        
        if ($event_channel_id === $target_channel_id) {
          $new_main_messages[] = array(
            'messageId' => $event['messageId'],
            'channelId' => $event['channelId'],
            'threadId' => 0,
            'payload' => $event['payload']
          );
        }
      }
    }
    
    /*
    if (!empty($delivered_messages)) {
      set_transient($delivered_messages_key, $delivered_messages, 1800);
    }
    */
    
    if (!empty($new_main_messages)) {
      $updates['new_messages'] = $new_main_messages;
    }

    $deleted_main_messages = array();
    if (!empty($this->recent_events[self::EVENT_MESSAGE_DELETE])) {
      foreach ($this->recent_events[self::EVENT_MESSAGE_DELETE] as $event) {
        $event_channel_id = intval($event['channel_id']);
        $target_channel_id = intval($channel_id);
        
        if ($event_channel_id === $target_channel_id) {
          $event_data = $event['event_data'] ?? array();
          
          $delete_message = array(
            'messageId' => $event['message_id'],
            'channelId' => $channel_id
          );
          
          if (isset($event_data['is_group_delete']) && $event_data['is_group_delete']) {
            $delete_message['is_group_delete'] = true;
            $delete_message['group_message_ids'] = $event_data['group_message_ids'] ?? array();
            $delete_message['group_total_messages'] = $event_data['group_total_messages'] ?? 0;
            
          } elseif (isset($event_data['group_message_ids']) && !empty($event_data['group_message_ids'])) {
            $delete_message['is_group_delete'] = true;
            $delete_message['group_message_ids'] = $event_data['group_message_ids'];
            $delete_message['group_total_messages'] = $event_data['group_total_messages'] ?? count($event_data['group_message_ids']);
            
          }
          
          $deleted_main_messages[] = $delete_message;
        }
      }
    }
    
    if (!empty($deleted_main_messages)) {
      $updates['deleted_messages'] = $deleted_main_messages;
    }

    $new_thread_messages = array();
    
    $transient_key = 'lms_longpoll_thread_events';
    $transient_events = get_transient($transient_key) ?: array();
    
    $memory_events = $this->recent_events[self::EVENT_THREAD_MESSAGE_CREATE] ?? [];
    $all_thread_events = array_merge($memory_events, $transient_events);
    
    $unique_events = array();
    $seen_keys = array();
    $current_time = time();
    
    foreach ($all_thread_events as $event) {
      $event_timestamp = $event['timestamp'] ?? $current_time;
      if (($current_time - $event_timestamp) >= 10) {
        continue;
      }
      
      $key = $event['message_id'] . '_' . $event_timestamp;
      if (!in_array($key, $seen_keys)) {
        $unique_events[] = $event;
        $seen_keys[] = $key;
      }
    }
    
    
    if (!empty($unique_events)) {
      
      $processed_events = array();
      
      foreach ($unique_events as $index => $event) {
        $event_channel_id = intval($event['channel_id']);
        $target_channel_id = intval($channel_id);
        
        
        if ($event_channel_id === $target_channel_id || $event['channel_id'] == $channel_id) {
          $new_thread_messages[] = array(
            'messageId' => $event['messageId'],
            'channelId' => $event['channelId'],
            'threadId' => $event['threadId'],
            'parentId' => $event['parentId'],
            'payload' => $event['payload']
          );
        }
      }
    } else {
    }
    
    if ($thread_id > 0) {
      $thread_messages_table = $wpdb->prefix . 'lms_chat_thread_messages';

      $new_thread_messages_query = $wpdb->prepare(
        "SELECT /*+ USE_INDEX(t, PRIMARY) */ t.*, u.display_name, u.avatar_url,
        TIME(t.created_at) as message_time
        FROM $thread_messages_table t
        INNER JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        AND t.id > %d
        AND t.deleted_at IS NULL
        ORDER BY t.id ASC
        LIMIT 25",
        $thread_id,
        $last_message_id
      );

      $thread_messages = $wpdb->get_results($new_thread_messages_query, ARRAY_A);

      if (!empty($thread_messages)) {
        $lms_chat = LMS_Chat::get_instance();
        $formatted_thread_messages = array();

        foreach ($thread_messages as &$message) {
          $message['formatted_time'] = date_i18n('H:i', strtotime($message['message_time']));

          $message['reactions'] = $lms_chat->get_thread_message_reactions($message['id']);

          $message['attachments'] = $lms_chat->get_message_attachments($message['id']);

          $message['id'] = intval($message['id']);
          $message['parent_message_id'] = intval($message['parent_message_id'] ?? 0);
          $message['user_id'] = intval($message['user_id']);

          $formatted_thread_messages[] = array(
            'messageId' => $message['id'],
            'channelId' => $channel_id,
            'threadId' => $thread_id,
            'parentId' => $message['parent_message_id'],
            'payload' => $message
          );
        }

        foreach ($formatted_thread_messages as $msg) {
          $new_thread_messages[] = $msg;
        }
      }
    }
    
    if (!empty($new_thread_messages)) {
      $updates['thread_messages'] = $new_thread_messages;
      
      if (!empty($unique_events)) {
        $processed_message_ids = array_column($new_thread_messages, 'messageId');
        $remaining_events = array_filter($transient_events, function($event) use ($processed_message_ids) {
          return !in_array($event['messageId'], $processed_message_ids);
        });
        set_transient($transient_key, $remaining_events, 3600); // 1時間
      }
    }

    $deleted_thread_messages = array();
    
    $delete_transient_key = 'lms_longpoll_thread_delete_events';
    $delete_transient_events = get_transient($delete_transient_key) ?: array();
    
    $standard_storage_key = 'lms_longpoll_events_' . self::EVENT_THREAD_MESSAGE_DELETE;
    $standard_storage_events = get_transient($standard_storage_key) ?: array();
    
    $memory_delete_events = $this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE] ?? [];
    $all_delete_events = array_merge($memory_delete_events, $delete_transient_events, $standard_storage_events);
    
    if (!empty($all_delete_events)) {
    }
    
    $unique_delete_events = array();
    $seen_delete_keys = array();
    
    foreach ($all_delete_events as $event) {
      $event_timestamp = $event['timestamp'] ?? $current_time;
      if (($current_time - $event_timestamp) >= 60) {
        continue;
      }
      
      $key = $event['message_id'] . '_' . $event_timestamp;
      if (!in_array($key, $seen_delete_keys)) {
        $unique_delete_events[] = $event;
        $seen_delete_keys[] = $key;
      }
    }
    
    if (!empty($unique_delete_events)) {
      
      foreach ($unique_delete_events as $event) {
        $event_channel_id = intval($event['channel_id']);
        $target_channel_id = intval($channel_id);
        
        
        if ($event_channel_id === $target_channel_id || $event['channel_id'] == $channel_id) {
          $parent_message_id = $event['parent_message_id'] ?? 0;
          $deleted_thread_messages[] = array(
            'messageId' => $event['message_id'],
            'channelId' => $event['channel_id'],
            'threadId' => $parent_message_id,
            'parentId' => $parent_message_id
          );
        }
      }
    }
    if (!empty($all_delete_events)) {
      foreach ($all_delete_events as $event) {
        $event_channel_id = intval($event['channel_id']);
        $target_channel_id = intval($channel_id);
        
        
        if ($event_channel_id === $target_channel_id) {
          $is_duplicate = false;
          foreach ($deleted_thread_messages as $existing) {
            if (intval($existing['messageId']) === intval($event['message_id'])) {
              $is_duplicate = true;
              break;
            }
          }
          
          if (!$is_duplicate) {
            $deleted_event = array(
              'messageId' => $event['message_id'],
              'channelId' => $event['channel_id'],
              'threadId' => $event['thread_id'],
              'parentId' => $event['thread_id']
            );
            $deleted_thread_messages[] = $deleted_event;
          } else {
          }
        }
      }
    }

    /*
    $deleted_thread_messages_query = $wpdb->prepare(
      "SELECT id FROM {$wpdb->prefix}lms_chat_thread_messages
       WHERE parent_message_id = %d
       AND deleted_at IS NOT NULL
       LIMIT 50",
      $thread_id
    );

    $deleted_thread_messages_db = $wpdb->get_results($deleted_thread_messages_query, ARRAY_A);
    if (!empty($deleted_thread_messages_db)) {
      foreach ($deleted_thread_messages_db as $message) {
        $message_id = intval($message['id']);
        $already_added = false;

        foreach ($deleted_thread_messages as $existing) {
          if ($existing['messageId'] == $message_id) {
            $already_added = true;
            break;
          }
        }

        if (!$already_added) {
          $deleted_thread_messages[] = array(
            'messageId' => $message_id,
            'channelId' => $channel_id,
            'threadId' => $thread_id,
            'parentId' => $thread_id
          );
        }
      }
    }
    */

    if (!empty($deleted_thread_messages)) {
      $updates['thread_deleted_messages'] = $deleted_thread_messages;
      
      if (!empty($unique_delete_events)) {
        $processed_delete_ids = array_column($deleted_thread_messages, 'messageId');
        $remaining_delete_events = array_filter($delete_transient_events, function($event) use ($processed_delete_ids) {
          return !in_array($event['message_id'], $processed_delete_ids);
        });
        set_transient($delete_transient_key, $remaining_delete_events, 3600); // 1時間
      }
    }

    if ($thread_id > 0) {
      $thread_count = $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages
         WHERE parent_message_id = %d AND deleted_at IS NULL",
        $thread_id
      ));

      $updates['thread_count'] = array(
        'parent_message_id' => $thread_id,
        'count' => intval($thread_count)
      );
    }

    $this->clean_old_events();
    $this->query_cache[$cache_key] = array('data' => $updates, 'time' => $cache_time);
    
    if (!empty($updates)) {
      wp_cache_set($cache_key, $updates, 'lms_chat', self::CACHE_TTL);
    }
    
    if (!empty($updates['new_messages'])) {
      $delivered_message_ids = array_column($updates['new_messages'], 'messageId');
      $this->clear_delivered_events(self::EVENT_MESSAGE_CREATE, $delivered_message_ids);
    }

    // リアクション更新イベントのチェック
    $reaction_events = array();

    // メインチャットのリアクション更新をチェック
    $reaction_transient_key = 'lms_longpoll_reaction_events';
    $reaction_transient_events = get_transient($reaction_transient_key) ?: array();
    $reaction_memory_events = $this->recent_events[self::EVENT_REACTION_UPDATE] ?? [];
    $all_reaction_events = array_merge($reaction_memory_events, $reaction_transient_events);

    if (!empty($all_reaction_events)) {
      $current_time = time();
      foreach ($all_reaction_events as $event) {
        $event_timestamp = $event['timestamp'] ?? $current_time;
        // 5分以内の新しいイベントのみ処理
        if (($current_time - $event_timestamp) < 300) {
          $reaction_events[] = array(
            'type' => self::EVENT_REACTION_UPDATE,
            'message_id' => $event['message_id'],
            'reactions' => $event['reactions'],
            'timestamp' => $event_timestamp
          );
        }
      }
    }

    // スレッドリアクション更新をチェック
    $thread_reaction_transient_key = 'lms_longpoll_thread_reaction_events';
    $thread_reaction_transient_events = get_transient($thread_reaction_transient_key) ?: array();
    $thread_reaction_memory_events = $this->recent_events[self::EVENT_THREAD_REACTION] ?? [];
    $all_thread_reaction_events = array_merge($thread_reaction_memory_events, $thread_reaction_transient_events);

    if (!empty($all_thread_reaction_events)) {
      $current_time = time();
      foreach ($all_thread_reaction_events as $event) {
        $event_timestamp = $event['timestamp'] ?? $current_time;
        // 5分以内の新しいイベントのみ処理
        if (($current_time - $event_timestamp) < 300) {
          $reaction_events[] = array(
            'type' => self::EVENT_THREAD_REACTION,
            'message_id' => $event['message_id'],
            'reactions' => $event['reactions'],
            'timestamp' => $event_timestamp,
            'thread_id' => isset($event['thread_id']) ? intval($event['thread_id']) : 0,
            'channel_id' => isset($event['channel_id']) ? intval($event['channel_id']) : 0
          );
        }
      }
    }

    if (!empty($reaction_events)) {
      $updates['reaction_updates'] = $reaction_events;
    }

    if (!empty($updates)) {
      if (!empty($updates['thread_deleted_messages'])) {
      }
    }

    return $updates;
  }

  /**
   * nonce更新のハンドラー
   */
  public function handle_refresh_nonce()
  {
    if (function_exists('lms_session_start')) {
      lms_session_start();
    } elseif (session_status() === PHP_SESSION_NONE && !headers_sent()) {
      session_start();
    }

    // セッションヘルパーを使用
    $sessionData = acquireSession();
    $user_id = isset($sessionData['lms_user_id']) && $sessionData['lms_user_id'] > 0
      ? intval($sessionData['lms_user_id'])
      : 0;

    if (function_exists('lms_session_close')) {
      lms_session_close();
    } elseif (session_status() === PHP_SESSION_ACTIVE) {
      session_write_close();
    }

    if ($user_id <= 0) {
      wp_send_json_error(array(
        'message' => 'ログインが必要です',
        'code' => 'not_authenticated'
      ));
      exit;
    }

    $new_nonce = wp_create_nonce('lms_chat_nonce');

    wp_send_json_success(array(
      'nonce' => $new_nonce,
      'timestamp' => time()
    ));
    exit;
  }

  /**
   * メッセージ作成イベントを処理
   */
  public function on_message_created($message_id, $channel_id, $user_id)
  {
    
    global $wpdb;
    $lms_chat = LMS_Chat::get_instance();
    
    $current_user_id = 0;
    if (class_exists('LMS_Auth')) {
      $auth = LMS_Auth::get_instance();
      $current_user = $auth->get_current_user();
      if ($current_user) {
        $current_user_id = $current_user->id;
      }
    }
    $messages_table = $wpdb->prefix . 'lms_chat_messages';
    $message = $wpdb->get_row(
      $wpdb->prepare(
        "SELECT * FROM $messages_table WHERE id = %d",
        $message_id
      ),
      ARRAY_A
    );

    if (!$message) {
      return;
    }

    $user_info = $lms_chat->get_user_display_info($message['user_id']);
    
    $display_name = '';
    if ($user_info && is_array($user_info) && isset($user_info['display_name'])) {
      $display_name = $user_info['display_name'];
    }
    
    if (empty($display_name) || $display_name === 'undefined' || $display_name === 'null') {
      $display_name = "ユーザー{$message['user_id']}";
    }
    
    $message['display_name'] = $display_name;
    $message['avatar_url'] = ($user_info && is_array($user_info) && isset($user_info['avatar_url'])) ? $user_info['avatar_url'] : '';
    
    $message['content'] = $message['message'];
    

    $message['attachments'] = $lms_chat->get_message_attachments($message_id);

    $message['formatted_time'] = date_i18n('H:i', strtotime($message['created_at']));

    $message['reactions'] = $lms_chat->get_message_reactions($message_id);

    $message['thread_count'] = $lms_chat->get_thread_count($message_id);
    $message['has_thread'] = $message['thread_count'] > 0;

    $event_data = array(
      'message_id' => $message_id,
      'channel_id' => $channel_id,
      'messageId' => $message_id,
      'channelId' => $channel_id,
      'threadId' => 0,
      'payload' => $message,
      'timestamp' => time(),
      'time' => time()
    );
    
    
    $this->recent_events[self::EVENT_MESSAGE_CREATE][] = $event_data;
    $this->save_event_to_storage(self::EVENT_MESSAGE_CREATE, $event_data);
    
    
    $this->clean_old_events();
  }

  /**
   * メッセージ削除イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param int $channel_id チャンネルID
   */
  public function on_message_deleted($message_id, $channel_id, $group_delete_info = null)
  {
    if ($group_delete_info && !empty($group_delete_info['group_message_ids'])) {
      foreach ($group_delete_info['group_message_ids'] as $group_msg_id) {
        $this->recent_events[self::EVENT_MESSAGE_DELETE] = array_filter(
          $this->recent_events[self::EVENT_MESSAGE_DELETE],
          function($event) use ($group_msg_id, $channel_id) {
            return !($event['message_id'] == $group_msg_id && $event['channel_id'] == $channel_id);
          }
        );
      }
      $this->recent_events[self::EVENT_MESSAGE_DELETE] = array_values($this->recent_events[self::EVENT_MESSAGE_DELETE]);
      
    }
    
    $event_data = array(
      'action' => self::EVENT_MESSAGE_DELETE,
      'messageId' => intval($message_id),
      'channelId' => intval($channel_id),
      'threadId' => 0,
      'payload' => array(
        'id' => intval($message_id)
      )
    );
    
    if ($group_delete_info) {
      $event_data['is_group_delete'] = true;
      $event_data['group_message_ids'] = $group_delete_info['group_message_ids'];
      $event_data['group_total_messages'] = $group_delete_info['group_total_messages'];
      
      $event_data['payload']['is_group_delete'] = true;
      $event_data['payload']['group_message_ids'] = $group_delete_info['group_message_ids'];
      $event_data['payload']['group_total_messages'] = $group_delete_info['group_total_messages'];
      
    }

    $event_record = array(
      'message_id' => $message_id,
      'channel_id' => $channel_id,
      'time' => time()
    );
    
    if ($group_delete_info) {
      $event_record['event_data'] = $group_delete_info;
    } else {
      $event_record['event_data'] = array();
    }
    
    $this->recent_events[self::EVENT_MESSAGE_DELETE][] = $event_record;

    $this->save_event_to_storage(self::EVENT_MESSAGE_DELETE, $event_data);

    $this->clean_old_events();
  }

  /**
   * スレッドメッセージ作成イベントを処理
   */
  public function on_thread_message_created($message_id, $parent_message_id, $channel_id, $user_id, $message_data = null)
  {
    global $wpdb;
    $lms_chat = LMS_Chat::get_instance();
    
    
    $current_user_id = 0;
    if (class_exists('LMS_Auth')) {
      $auth = LMS_Auth::get_instance();
      $current_user = $auth->get_current_user();
      if ($current_user) {
        $current_user_id = $current_user->id;
      }
    }
    if ($message_data && is_object($message_data)) {
      $message = json_decode(json_encode($message_data), true);
      
      if (!isset($message['id'])) {
        $message['id'] = $message_id;
      }
      
      if (!isset($message['parent_message_id'])) {
        $message['parent_message_id'] = $parent_message_id;
      }
    } else {
      $thread_messages_table = $wpdb->prefix . 'lms_chat_thread_messages';
      $message = $wpdb->get_row(
        $wpdb->prepare(
          "SELECT * FROM $thread_messages_table WHERE id = %d AND deleted_at IS NULL",
          $message_id
        ),
        ARRAY_A
      );

      if (!$message) {
        return;
      }
      
      $user_info = $lms_chat->get_user_display_info($message['user_id']);
      
      $display_name = '';
      if ($user_info && is_array($user_info) && isset($user_info['display_name'])) {
        $display_name = $user_info['display_name'];
      }
      
      if (empty($display_name) || $display_name === 'undefined' || $display_name === 'null') {
        $display_name = "ユーザー{$message['user_id']}";
      }
      
      $message['display_name'] = $display_name;
      $message['avatar_url'] = ($user_info && is_array($user_info) && isset($user_info['avatar_url'])) ? $user_info['avatar_url'] : '';
      
      $message['attachments'] = $lms_chat->get_thread_message_attachments($message_id);

      $message['formatted_time'] = date_i18n('H:i', strtotime($message['created_at']));

      $message['reactions'] = $lms_chat->get_thread_message_reactions($message_id);
    }
    
    if (!isset($message['content'])) {
      $message['content'] = $message['message'];
    }

    $event_data = array(
      'message_id' => $message_id,
      'thread_id' => $parent_message_id, // thread_idはparent_message_idと同じ
      'channel_id' => intval($channel_id), // 数値に変換
      'messageId' => $message_id,
      'channelId' => intval($channel_id), // 数値に変換
      'threadId' => $parent_message_id,
      'parentId' => $parent_message_id,
      'payload' => $message,
      'timestamp' => time(),
      'time' => time()
    );
    
    $this->recent_events[self::EVENT_THREAD_MESSAGE_CREATE][] = $event_data;
    
    $transient_key = 'lms_longpoll_thread_events';
    $existing_events = get_transient($transient_key) ?: array();
    $existing_events[] = $event_data;
    
    $current_time = time();
    $existing_events = array_filter($existing_events, function($event) use ($current_time) {
      $event_timestamp = $event['timestamp'] ?? $current_time;
      return ($current_time - $event_timestamp) < 10; // 10秒
    });
    
    if (count($existing_events) > 50) {
      $existing_events = array_slice($existing_events, -50, 50, true);
    }
    
    set_transient($transient_key, $existing_events, 60);
    
  }

  /**
   * スレッドメッセージ削除イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param int $thread_id スレッドID
   * @param int $channel_id チャンネルID
   */
  public function on_thread_message_deleted($message_id, $thread_id, $channel_id)
  {
    $recent_time = time() - 5; // 5秒以内の重複をチェック（短縮）
    if (!empty($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE])) {
      foreach ($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE] as $event) {
        if ($event['message_id'] == $message_id && ($event['timestamp'] ?? time()) >= $recent_time) {
          return;
        }
      }
    }
    
    $current_timestamp = time();
    $event_data = array(
      'message_id' => intval($message_id),
      'parent_message_id' => intval($thread_id),
      'channel_id' => intval($channel_id),
      'timestamp' => $current_timestamp,
      'messageId' => intval($message_id),
      'channelId' => intval($channel_id),
      'threadId' => intval($thread_id),
      'parentId' => intval($thread_id)
    );

    if (!isset($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE])) {
      $this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE] = array();
    }
    $this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE][] = $event_data;

    $delete_transient_key = 'lms_longpoll_thread_delete_events';
    $existing_delete_events = get_transient($delete_transient_key) ?: array();
    $existing_delete_events[] = $event_data;
    
    $existing_delete_events = array_filter($existing_delete_events, function($event) use ($current_timestamp) {
      $event_timestamp = $event['timestamp'] ?? $current_timestamp;
      return ($current_timestamp - $event_timestamp) < 60; // 60秒
    });
    
    if (count($existing_delete_events) > 50) {
      $existing_delete_events = array_slice($existing_delete_events, -50, 50, true);
    }
    
    set_transient($delete_transient_key, $existing_delete_events, 3600); // 1時間
    

    $this->save_event_to_storage(self::EVENT_THREAD_MESSAGE_DELETE, $event_data);

    $this->clean_old_events();
    
  }

  /**
   * デバッグ用：recent_eventsの状態を取得
   */
  public function get_recent_events_debug() {
    return $this->recent_events;
  }

  /**
   * 古いイベント履歴をクリーンアップ（パフォーマンス最適化版）
   */
  private function clean_old_events()
  {
    $cutoff_time = time() - 60; // 1分に短縮（無限ループを防ぐため）
    $current_time = time();

    foreach ($this->recent_events as $event_type => &$events) {
      $old_count = count($events);
      $events = array_filter($events, function ($event) use ($cutoff_time) {
        return isset($event['timestamp']) ? $event['timestamp'] >= $cutoff_time : true;
      });
      
      $events = array_values($events);
      
      $new_count = count($events);
    }
    
    foreach ($this->query_cache as $key => $cached_data) {
      if (($current_time - $cached_data['time']) >= self::CACHE_TTL) {
        unset($this->query_cache[$key]);
      }
    }
    
    static $cleanup_counter = 0;
    $cleanup_counter++;
    if ($cleanup_counter % 5 === 0 && function_exists('gc_collect_cycles')) {
      gc_collect_cycles();
    }
  }

  /**
   * メモリ単位を bytes に変換
   */
  private function convert_to_bytes($value)
  {
    $value = trim($value);
    $last = strtolower($value[strlen($value) - 1]);
    $number = (int) $value;

    switch ($last) {
      case 'g':
        $number *= 1024;
      case 'm':
        $number *= 1024;
      case 'k':
        $number *= 1024;
    }

    return $number;
  }

  /**
   * 指定チャンネルの最新イベント時刻を取得（古いシステムとの互換性のため）
   */
  public function get_latest_event_time($channel_id) {
    $latest_time = 0;
    
    foreach ($this->recent_events as $event_type => $events) {
      foreach ($events as $event) {
        if ($event['channel_id'] == $channel_id && $event['time'] > $latest_time) {
          $latest_time = $event['time'];
        }
      }
    }
    
    return $latest_time;
  }

  /**
   * 指定チャンネルの最新イベントを取得（古いシステムとの互換性のため）
   */
  public function get_recent_events_for_channel($channel_id) {
    $channel_events = array();
    
    foreach ($this->recent_events as $event_type => $events) {
      foreach ($events as $event) {
        if ($event['channel_id'] == $channel_id) {
          $channel_events[] = $event;
        }
      }
    }
    
    usort($channel_events, function($a, $b) {
      return $a['time'] - $b['time'];
    });
    
    return $channel_events;
  }

  /**
   * テスト用フックハンドラー
   */
  public function test_hook_handler($message) {
  }
  
  /**
   * デバッグ用：ロングポーリング状態確認エンドポイント
   */
  public function debug_longpoll_status() {
    $this->load_events_from_storage();
    
    $debug_info = array(
      'recent_events_count' => array(),
      'storage_events_count' => array(),
      'sample_events' => array()
    );
    
    $all_event_types = array(
      self::EVENT_MESSAGE_CREATE, 
      self::EVENT_MESSAGE_DELETE, 
      self::EVENT_THREAD_CREATE,
      self::EVENT_THREAD_MESSAGE_CREATE,
      self::EVENT_THREAD_MESSAGE_DELETE
    );
    
    foreach ($all_event_types as $event_type) {
      $debug_info['recent_events_count'][$event_type] = count($this->recent_events[$event_type] ?? array());
      
      $storage_key = "lms_longpoll_events_{$event_type}";
      $stored_events = get_transient($storage_key);
      $debug_info['storage_events_count'][$event_type] = is_array($stored_events) ? count($stored_events) : 0;
      
      if (!empty($this->recent_events[$event_type])) {
        $debug_info['sample_events'][$event_type] = array_slice($this->recent_events[$event_type], -3, 3);
      }
    }
    
    wp_send_json_success($debug_info);
  }

  /**
   * イベントを永続化ストレージに保存
   */
  private function save_event_to_storage($event_type, $event_data) {
    $storage_key = "lms_longpoll_events_{$event_type}";
    $existing_events = get_transient($storage_key);
    
    if (!$existing_events) {
      $existing_events = array();
    }
    
    $event_data['time'] = time();
    $existing_events[] = $event_data;
    
    $cutoff_time = time() - 3600;
    $existing_events = array_filter($existing_events, function($event) use ($cutoff_time) {
      return isset($event['time']) && $event['time'] >= $cutoff_time;
    });
    
    $existing_events = array_values($existing_events);
    
    $save_result = set_transient($storage_key, $existing_events, 3600);
    
    wp_cache_set($storage_key, $existing_events, 'lms_longpoll', 3600);
    
  }
  
  /**
   * 配信済みイベントをクリア（重複防止）
   */
  private function clear_delivered_events($event_type, $delivered_message_ids) {
    if (empty($delivered_message_ids)) {
      return;
    }
    
    if (isset($this->recent_events[$event_type])) {
      $this->recent_events[$event_type] = array_filter(
        $this->recent_events[$event_type],
        function($event) use ($delivered_message_ids) {
          return !in_array($event['messageId'], $delivered_message_ids);
        }
      );
    }
    
    $storage_key = "lms_longpoll_events_{$event_type}";
    $stored_events = get_transient($storage_key);
    if ($stored_events && is_array($stored_events)) {
      $stored_events = array_filter(
        $stored_events,
        function($event) use ($delivered_message_ids) {
          return !in_array($event['messageId'], $delivered_message_ids);
        }
      );
      set_transient($storage_key, array_values($stored_events), 3600);
    }
    
  }

  /**
   * 永続化ストレージからイベントを読み込み
   */
  private function load_events_from_storage() {
    
    $all_event_types = array(
      self::EVENT_MESSAGE_CREATE, 
      self::EVENT_MESSAGE_DELETE, 
      self::EVENT_THREAD_CREATE,
      self::EVENT_THREAD_MESSAGE_CREATE,
      self::EVENT_THREAD_MESSAGE_DELETE
    );
    
    foreach ($all_event_types as $event_type) {
      $storage_key = "lms_longpoll_events_{$event_type}";
      $stored_events = get_transient($storage_key);
      
      if ($event_type === self::EVENT_THREAD_MESSAGE_DELETE && !empty($stored_events)) {
      }
      
      if ($stored_events && is_array($stored_events)) {
        $existing_message_ids = array();
        if (isset($this->recent_events[$event_type])) {
          foreach ($this->recent_events[$event_type] as $existing_event) {
            $existing_message_ids[] = $existing_event['messageId'] ?? $existing_event['message_id'] ?? 0;
          }
        }
        
        $new_events = array_filter($stored_events, function($stored_event) use ($existing_message_ids) {
          return !in_array($stored_event['messageId'], $existing_message_ids);
        });
        
        $formatted_events = array();
        foreach ($new_events as $event) {
          $formatted_events[] = array(
            'message_id' => $event['messageId'],
            'channel_id' => $event['channelId'],
            'thread_id' => $event['threadId'] ?? 0,
            'time' => $event['time'] ?? time(),
            'event_data' => $event
          );
        }
        
        if (!empty($formatted_events)) {
          $this->recent_events[$event_type] = array_merge(
            $this->recent_events[$event_type] ?? array(),
            $formatted_events
          );
        }
      } else {
        $cache_events = wp_cache_get($storage_key, 'lms_longpoll');
        if ($cache_events && is_array($cache_events)) {
          $this->recent_events[$event_type] = array_merge(
            $this->recent_events[$event_type] ?? array(),
            $cache_events
          );
        }
      }
    }
  }

  /**
   * LZ-String圧縮機能（PHP版）
   * JavaScript側で解凍可能なシンプルなBase64エンコードを使用
   */
  private function compress_data($data) {
    $json_data = json_encode($data);
    $original_size = strlen($json_data);
    
    if ($original_size < 50) {
      return null;
    }
    
    $compressed_data = base64_encode($json_data);
    return $compressed_data;
  }

  /**
   * 圧縮機能を有効化/無効化
   */
  public function set_compression_enabled($enabled) {
    $this->compression_enabled = (bool) $enabled;
  }

  /**
   * 圧縮機能の状態を取得
   */
  public function is_compression_enabled() {
    return $this->compression_enabled;
  }

  /**
   * リアクション更新イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param array $reactions リアクションデータ
   */
  public function on_reaction_updated($message_id, $reactions)
  {
    $current_time = time();


    $event_data = array(
      'message_id' => intval($message_id),
      'reactions' => $reactions,
      'timestamp' => $current_time,
      'type' => self::EVENT_REACTION_UPDATE
    );

    if (!isset($this->recent_events[self::EVENT_REACTION_UPDATE])) {
      $this->recent_events[self::EVENT_REACTION_UPDATE] = array();
    }

    $this->recent_events[self::EVENT_REACTION_UPDATE][] = $event_data;

    // Transientに保存（他のユーザーに通知するため）
    $transient_key = 'lms_longpoll_reaction_events';
    $existing_events = get_transient($transient_key) ?: array();
    $existing_events[] = $event_data;

    // 古いイベントを削除（5分以内のみ保持）
    $existing_events = array_filter($existing_events, function($event) use ($current_time) {
      $event_timestamp = $event['timestamp'] ?? $current_time;
      return ($current_time - $event_timestamp) < 300; // 5分
    });

    // 最大50件まで
    if (count($existing_events) > 50) {
      $existing_events = array_slice($existing_events, -50, 50, true);
    }

    set_transient($transient_key, $existing_events, 3600); // 1時間有効

  }

  /**
   * スレッドリアクション更新イベントハンドラー
   *
   * @param int   $message_id メッセージID
   * @param int   $channel_id チャンネルID
   * @param int   $thread_id  親メッセージID（スレッド）
   * @param array $reactions  リアクションデータ
   */
  public function on_thread_reaction_updated($message_id, $channel_id = 0, $thread_id = 0, $reactions = array())
  {
    $current_time = time();


    $event_data = array(
      'message_id' => intval($message_id),
      'channel_id' => intval($channel_id),
      'thread_id' => intval($thread_id),
      'reactions' => $reactions,
      'timestamp' => $current_time,
      'type' => self::EVENT_THREAD_REACTION
    );

    if (!isset($this->recent_events[self::EVENT_THREAD_REACTION])) {
      $this->recent_events[self::EVENT_THREAD_REACTION] = array();
    }

    $this->recent_events[self::EVENT_THREAD_REACTION][] = $event_data;

    // Transientに保存（他のユーザーに通知するため）
    $transient_key = 'lms_longpoll_thread_reaction_events';
    $existing_events = get_transient($transient_key) ?: array();
    $existing_events[] = $event_data;

    // 古いイベントを削除（5分以内のみ保持）
    $existing_events = array_filter($existing_events, function($event) use ($current_time) {
      $event_timestamp = $event['timestamp'] ?? $current_time;
      return ($current_time - $event_timestamp) < 300; // 5分
    });

    // 最大50件まで
    if (count($existing_events) > 50) {
      $existing_events = array_slice($existing_events, -50, 50, true);
    }

    set_transient($transient_key, $existing_events, 3600); // 1時間有効

  }
}
$longpoll_instance = LMS_Chat_LongPoll::get_instance();
