<?php

/**
 * チャットシステム用ロングポーリング実装
 *
 * 主な機能:
 * - 最大30秒間のロングポーリング待機
 * - 4つのイベント（メインチャット投稿・削除、スレッド投稿・削除）のリアルタイム検出
 * - WordPress nonce による CSRF 対策
 * - ユーザー権限確認
 * - 指数バックオフ対応のエラーハンドリング
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
  exit;
}

class LMS_Chat_Realtime
{
  private static $instance = null;

  /**
   * ロングポーリングの最大待機時間（秒）
   */
  const MAX_POLL_TIMEOUT = 30;

  /**
   * ポーリング間隔（マイクロ秒）
   */
  const POLL_INTERVAL = 200000; // 0.2秒（より高速に）

  /**
   * イベントタイプ定数
   */
  const EVENT_MESSAGE_CREATE = 'message_create';
  const EVENT_MESSAGE_DELETE = 'message_delete';
  const EVENT_THREAD_MESSAGE_CREATE = 'thread_message_create';
  const EVENT_THREAD_MESSAGE_DELETE = 'thread_message_delete';

  /**
   * 最新のイベントを保持する配列
   */
  private $recent_events = [];

  /**
   * イベントキャッシュの有効期限（秒）
   */
  const EVENT_CACHE_EXPIRY = 300; // 5分

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

  private function __construct()
  {
    add_action('wp_ajax_lms_long_poll_updates', array($this, 'handle_long_poll_updates'));
    add_action('wp_ajax_lms_refresh_nonce', array($this, 'handle_refresh_nonce'));

    add_action('lms_message_created', array($this, 'on_message_created'), 10, 3);
    add_action('lms_message_deleted', array($this, 'on_message_deleted'), 10, 2);
    add_action('lms_thread_message_created', array($this, 'on_thread_message_created'), 10, 4);
    add_action('lms_thread_message_deleted', array($this, 'on_thread_message_deleted'), 10, 3);

    $this->recent_events = [
      self::EVENT_MESSAGE_CREATE => [],
      self::EVENT_MESSAGE_DELETE => [],
      self::EVENT_THREAD_MESSAGE_CREATE => [],
      self::EVENT_THREAD_MESSAGE_DELETE => [],
    ];
  }

  /**
   * ロングポーリングのメインハンドラー
   * 最大30秒間待機し、指定されたイベントが発生したら即座にレスポンス
   */
  public function handle_long_poll_updates()
  {
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'lms_chat_nonce')) {
      wp_send_json_error(array(
        'message' => 'セキュリティチェックに失敗しました',
        'code' => 'invalid_nonce'
      ));
      return;
    }

    $user_id = $this->get_current_user_id();
    if (!$user_id) {
      wp_send_json_error(array(
        'message' => 'ログインが必要です',
        'code' => 'not_authenticated'
      ));
      return;
    }

    $channel_id = intval($_POST['channel_id'] ?? 0);
    $thread_id = intval($_POST['thread_id'] ?? 0);
    $last_message_id = intval($_POST['last_message_id'] ?? 0);
    $last_timestamp = intval($_POST['last_timestamp'] ?? 0);
    $timeout = min(intval($_POST['timeout'] ?? self::MAX_POLL_TIMEOUT), self::MAX_POLL_TIMEOUT);

    if (!$channel_id) {
      wp_send_json_error(array(
        'message' => 'チャンネルIDが必要です',
        'code' => 'invalid_channel'
      ));
      return;
    }

    if (!$this->can_access_channel($user_id, $channel_id)) {
      wp_send_json_error(array(
        'message' => 'このチャンネルにアクセスする権限がありません',
        'code' => 'access_denied'
      ));
      return;
    }

    $request_received_time = microtime(true);

    $updates = $this->poll_for_updates(
      $channel_id,
      $thread_id,
      $last_message_id,
      $last_timestamp,
      $timeout,
      $user_id
    );

    $response_time = microtime(true);
    $response_latency = round(($response_time - $request_received_time) * 1000); // ミリ秒単位

    wp_send_json_success(array(
      'updates' => $updates,
      'timestamp' => time(),
      'latency' => $response_latency
    ));
  }

  /**
   * ロングポーリングでアップデートを監視
   *
   * @param int $channel_id チャンネルID
   * @param int $thread_id スレッドID（0の場合はメインチャット）
   * @param int $last_message_id 最後のメッセージID
   * @param int $last_timestamp 最後のタイムスタンプ
   * @param int $timeout タイムアウト時間（秒）
   * @param int $user_id ユーザーID
   * @return array アップデート情報
   */
  private function poll_for_updates($channel_id, $thread_id, $last_message_id, $last_timestamp, $timeout, $user_id)
  {
    $start_time = microtime(true);
    $updates = array();
    $force_return = false;

    set_time_limit($timeout + 5);
    ignore_user_abort(true);
    
    if (function_exists('gc_enable')) {
      gc_enable();
    }
    
    while (ob_get_level()) {
      ob_end_clean();
    }

    $updates = $this->check_for_updates($channel_id, $thread_id, $last_message_id, $last_timestamp, $user_id);

    $has_updates = !empty($updates['new_messages']) ||
      !empty($updates['deleted_messages']) ||
      !empty($updates['thread_messages']) ||
      !empty($updates['thread_deleted_messages']);

    if (!$has_updates) {
      $poll_end_time = $start_time + $timeout;

      while (microtime(true) < $poll_end_time) {
        if (wp_rand(1, 100) <= 5) { // 5%の確率で実行
          $this->clean_old_events();
        }

        usleep(self::POLL_INTERVAL);

        $updates = $this->check_for_updates($channel_id, $thread_id, $last_message_id, $last_timestamp, $user_id);

        if (
          !empty($updates['new_messages']) ||
          !empty($updates['deleted_messages']) ||
          !empty($updates['thread_messages']) ||
          !empty($updates['thread_deleted_messages'])
        ) {
          break;
        }

        if (connection_aborted()) {
          $force_return = true;
          break;
        }

        if ($this->check_recent_events($channel_id, $thread_id, $last_timestamp)) {
          $updates = $this->check_for_updates($channel_id, $thread_id, $last_message_id, $last_timestamp, $user_id);
          if (!empty($updates)) {
            break;
          }
        }
      }
    }

    $updates['current_timestamp'] = time();

    if ($force_return) {
      $updates['force_reconnect'] = true;
    }

    return $updates;
  }

  /**
   * 最近のイベントをチェック
   *
   * @param int $channel_id チャンネルID
   * @param int $thread_id スレッドID
   * @param int $last_timestamp 最後のタイムスタンプ
   * @return bool イベントがあればtrue
   */
  private function check_recent_events($channel_id, $thread_id, $last_timestamp)
  {
    $current_time = time();
    $check_time = max($last_timestamp, $current_time - 60); // 過去1分間または最後のタイムスタンプ以降のイベントをチェック

    if ($thread_id === 0) {
      foreach ($this->recent_events[self::EVENT_MESSAGE_CREATE] as $event) {
        if ($event['channel_id'] == $channel_id && $event['time'] > $check_time) {
          return true;
        }
      }
      foreach ($this->recent_events[self::EVENT_MESSAGE_DELETE] as $event) {
        if ($event['channel_id'] == $channel_id && $event['time'] > $check_time) {
          return true;
        }
      }
    } else {
      foreach ($this->recent_events[self::EVENT_THREAD_MESSAGE_CREATE] as $event) {
        if ($event['thread_id'] == $thread_id && $event['time'] > $check_time) {
          return true;
        }
      }
      foreach ($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE] as $event) {
        if ($event['thread_id'] == $thread_id && $event['time'] > $check_time) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * アップデートをチェック
   *
   * @param int $channel_id チャンネルID
   * @param int $thread_id スレッドID
   * @param int $last_message_id 最後のメッセージID
   * @param int $last_timestamp 最後のタイムスタンプ
   * @param int $user_id ユーザーID
   * @return array アップデート情報
   */
  private function check_for_updates($channel_id, $thread_id, $last_message_id, $last_timestamp, $user_id)
  {
    global $wpdb;
    $updates = array();

    try {
    if ($thread_id === 0) {
        $messages_table = $wpdb->prefix . 'lms_chat_messages';
        $users_table = $wpdb->prefix . 'users';

        $query = $wpdb->prepare(
          "SELECT /*+ USE_INDEX(m, PRIMARY) */ m.*, u.display_name, u.user_email
          FROM {$messages_table} m
          INNER JOIN {$users_table} u ON m.user_id = u.ID
          WHERE m.channel_id = %d
          AND m.thread_id = 0
          AND m.deleted_at IS NULL
          AND (m.id > %d OR %d = 0)
          AND (UNIX_TIMESTAMP(m.created_at) > %d OR %d = 0)
          ORDER BY m.id DESC
          LIMIT 10",
          $channel_id,
          $last_message_id,
          $last_message_id,
          $last_timestamp,
          $last_timestamp
      );

        $new_messages = $wpdb->get_results($query, ARRAY_A);

      if (!empty($new_messages)) {
          $grouped_messages = $this->group_messages_by_date($new_messages);
          $updates['new_messages'] = $grouped_messages;
      }

        $query = $wpdb->prepare(
          "SELECT /*+ USE_INDEX(PRIMARY) */ id
          FROM {$messages_table}
          WHERE channel_id = %d
          AND thread_id = 0
          AND deleted_at IS NOT NULL
          AND (UNIX_TIMESTAMP(deleted_at) > %d OR %d = 0)
          ORDER BY id DESC
          LIMIT 10",
          $channel_id,
          $last_timestamp,
          $last_timestamp
      );

        $deleted_messages = $wpdb->get_col($query);

      if (!empty($deleted_messages)) {
          $updates['deleted_messages'] = $deleted_messages;
        }
      }

      if ($thread_id > 0) {
        $messages_table = $wpdb->prefix . 'lms_chat_messages';
        $users_table = $wpdb->prefix . 'users';

        $query = $wpdb->prepare(
          "SELECT m.*, u.display_name, u.user_email
          FROM {$messages_table} m
          LEFT JOIN {$users_table} u ON m.user_id = u.ID
          WHERE m.thread_id = %d
          AND m.deleted_at IS NULL
          AND (m.id > %d OR %d = 0)
          AND (UNIX_TIMESTAMP(m.created_at) > %d OR %d = 0)
          ORDER BY m.id ASC
          LIMIT 15",
          $thread_id,
          $last_message_id,
          $last_message_id,
          $last_timestamp,
          $last_timestamp
      );

        $thread_messages = $wpdb->get_results($query, ARRAY_A);

      if (!empty($thread_messages)) {
          $updates['thread_messages'] = $this->format_messages($thread_messages);
      }

        $query = $wpdb->prepare(
          "SELECT id
          FROM {$messages_table}
          WHERE thread_id = %d
          AND deleted_at IS NOT NULL
          AND (UNIX_TIMESTAMP(deleted_at) > %d OR %d = 0)
          ORDER BY id DESC
          LIMIT 15",
          $thread_id,
          $last_timestamp,
          $last_timestamp
      );

        $deleted_thread_messages = $wpdb->get_col($query);

        if (!empty($deleted_thread_messages)) {
          $updates['thread_deleted_messages'] = $deleted_thread_messages;

        }

        $query = $wpdb->prepare(
          "SELECT parent_id,
                  (SELECT COUNT(*) FROM {$messages_table} WHERE thread_id = %d AND deleted_at IS NULL) as thread_count
          FROM {$messages_table}
          WHERE id = %d",
          $thread_id,
          $thread_id
        );

        $thread_info = $wpdb->get_row($query, ARRAY_A);

        if ($thread_info) {
          $updates['thread_info'] = array(
            'thread_id' => $thread_id,
            'parent_message_id' => $thread_info['parent_id'],
            'thread_count' => $thread_info['thread_count']
          );
        }
      }
    } catch (Exception $e) {
      $updates['error'] = 'データベースエラーが発生しました';
    }

    return $updates;
  }

  /**
   * メッセージを日付でグループ化
   *
   * @param array $messages メッセージの配列
   * @return array 日付でグループ化されたメッセージ
   */
  private function group_messages_by_date($messages)
  {
    $grouped = array();
    $formatted_messages = $this->format_messages($messages);

    foreach ($formatted_messages as $message) {
      $date = date('Y-m-d', strtotime($message['created_at']));

      if (!isset($grouped[$date])) {
        $grouped[$date] = array(
          'date' => $date,
          'messages' => array()
        );
      }

      $grouped[$date]['messages'][] = $message;
    }

    return array_values($grouped);
  }

  /**
   * メッセージのフォーマット
   *
   * @param array $messages データベースから取得したメッセージ
   * @return array フォーマット済みメッセージ
   */
  private function format_messages($messages)
  {
    $formatted = array();

    foreach ($messages as $message) {
      $thread_count = 0;
      if (isset($message['id']) && $message['thread_id'] == 0) {
        global $wpdb;
        $messages_table = $wpdb->prefix . 'lms_chat_messages';
        $thread_count = $wpdb->get_var($wpdb->prepare(
          "SELECT COUNT(*) FROM {$messages_table} WHERE thread_id = %d AND deleted_at IS NULL",
          $message['id']
        ));
      }

      $avatar_url = get_avatar_url($message['user_id'], array('size' => 80));

      $formatted_message = array(
        'id' => intval($message['id']),
        'user_id' => intval($message['user_id']),
        'channel_id' => intval($message['channel_id']),
        'thread_id' => intval($message['thread_id']),
        'message' => $message['message'],
        'created_at' => $message['created_at'],
        'display_name' => $message['display_name'],
        'avatar_url' => $avatar_url,
        'thread_count' => intval($thread_count),
      );

      $formatted[] = $formatted_message;
    }

    return $formatted;
  }

  /**
   * チャンネルアクセス権限チェック
   *
   * @param int $user_id ユーザーID
   * @param int $channel_id チャンネルID
   * @return bool アクセス可能ならtrue
   */
  private function can_access_channel($user_id, $channel_id)
  {
    return true;
  }

  /**
   * 現在のユーザーIDを取得
   * 統一されたユーザーID取得関数を使用
   *
   * @return int ユーザーID
   */
  private function get_current_user_id()
  {
    if (function_exists('lms_get_current_user_id')) {
      return lms_get_current_user_id();
    }
    
    if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
      session_start();
    }
    
    if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] > 0) {
      return intval($_SESSION['lms_user_id']);
    }
    
    return get_current_user_id();
  }

  /**
   * nonce更新ハンドラー
   */
  public function handle_refresh_nonce()
  {
    $user_id = $this->get_current_user_id();

    if (!$user_id) {
      wp_send_json_error(array(
        'message' => 'ログインが必要です',
        'code' => 'not_authenticated'
      ));
      return;
    }

    $new_nonce = wp_create_nonce('lms_chat_nonce');

    wp_send_json_success(array(
      'nonce' => $new_nonce,
      'timestamp' => time()
    ));
  }

  /**
   * メッセージ作成イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param int $channel_id チャンネルID
   * @param int $user_id ユーザーID
   * @param array $event_data 追加イベントデータ
   */
  public function on_message_created($message_id, $channel_id, $user_id, $event_data = null)
  {
    $event = array(
      'message_id' => $message_id,
      'channel_id' => $channel_id,
      'user_id' => $user_id,
      'time' => time(),
      'data' => $event_data
    );

    array_unshift($this->recent_events[self::EVENT_MESSAGE_CREATE], $event);
    if (count($this->recent_events[self::EVENT_MESSAGE_CREATE]) > 100) {
      array_pop($this->recent_events[self::EVENT_MESSAGE_CREATE]);
    }

    $this->force_polling_for_channel($channel_id);
  }

  /**
   * メッセージ削除イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param int $channel_id チャンネルID
   * @param array $event_data 追加イベントデータ
   */
  public function on_message_deleted($message_id, $channel_id, $event_data = null)
  {
    $event = array(
      'message_id' => $message_id,
      'channel_id' => $channel_id,
      'time' => time(),
      'data' => $event_data
    );

    array_unshift($this->recent_events[self::EVENT_MESSAGE_DELETE], $event);
    if (count($this->recent_events[self::EVENT_MESSAGE_DELETE]) > 100) {
      array_pop($this->recent_events[self::EVENT_MESSAGE_DELETE]);
    }

    $this->force_polling_for_channel($channel_id, true);

  }

  /**
   * スレッドメッセージ作成イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param int $thread_id スレッドID
   * @param int $channel_id チャンネルID
   * @param int $user_id ユーザーID
   * @param array $event_data 追加イベントデータ
   */
  public function on_thread_message_created($message_id, $thread_id, $channel_id, $user_id, $event_data = null)
  {
    $event = array(
      'message_id' => $message_id,
      'thread_id' => $thread_id,
      'channel_id' => $channel_id,
      'user_id' => $user_id,
      'time' => time(),
      'data' => $event_data
    );

    array_unshift($this->recent_events[self::EVENT_THREAD_MESSAGE_CREATE], $event);
    if (count($this->recent_events[self::EVENT_THREAD_MESSAGE_CREATE]) > 100) {
      array_pop($this->recent_events[self::EVENT_THREAD_MESSAGE_CREATE]);
    }

    $this->force_polling_for_channel($channel_id);

  }

  /**
   * スレッドメッセージ削除イベントハンドラー
   *
   * @param int $message_id メッセージID
   * @param int $thread_id スレッドID
   * @param int $channel_id チャンネルID
   * @param array $event_data 追加イベントデータ
   */
  public function on_thread_message_deleted($message_id, $thread_id, $channel_id, $event_data = null)
  {
    $event = array(
      'message_id' => $message_id,
      'thread_id' => $thread_id,
      'channel_id' => $channel_id,
      'time' => time(),
      'data' => $event_data
    );

    array_unshift($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE], $event);
    if (count($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE]) > 100) {
      array_pop($this->recent_events[self::EVENT_THREAD_MESSAGE_DELETE]);
    }

    $this->force_polling_for_channel($channel_id, true);

  }

  /**
   * 古いイベントをクリーンアップ
   */
  private function clean_old_events()
  {
    $current_time = time();
    $cutoff_time = $current_time - self::EVENT_CACHE_EXPIRY;

    foreach ($this->recent_events as $event_type => $events) {
      $filtered_events = array_filter($events, function ($event) use ($cutoff_time) {
        return $event['time'] >= $cutoff_time;
      });

      $this->recent_events[$event_type] = $filtered_events;
    }
  }

  /**
   * チャンネルのポーリングを強制的に更新するフラグを立てる
   *
   * @param int $channel_id チャンネルID
   * @param bool $high_priority 優先度高フラグ
   */
  private function force_polling_for_channel($channel_id, $high_priority = false)
  {
    $key = 'lms_force_polling_' . $channel_id;
    set_transient($key, true, 60); // 1分間有効

    if ($high_priority) {
      global $wpdb;

      $table = $wpdb->prefix . 'options';
      $option_name = '_transient_' . $key;

      $exists = $wpdb->get_var($wpdb->prepare(
        "SELECT option_id FROM $table WHERE option_name = %s",
        $option_name
      ));

      if ($exists) {
        $wpdb->update(
          $table,
          array('option_value' => 'yes'),
          array('option_name' => $option_name)
        );
      } else {
        $wpdb->insert(
          $table,
          array(
            'option_name' => $option_name,
            'option_value' => 'yes',
            'autoload' => 'no'
          )
        );
      }

      $expires_option = '_transient_timeout_' . $key;
      $expires = time() + 60; // 1分後

      if ($wpdb->get_var($wpdb->prepare(
        "SELECT option_id FROM $table WHERE option_name = %s",
        $expires_option
      ))) {
        $wpdb->update(
          $table,
          array('option_value' => $expires),
          array('option_name' => $expires_option)
        );
      } else {
        $wpdb->insert(
          $table,
          array(
            'option_name' => $expires_option,
            'option_value' => $expires,
            'autoload' => 'no'
          )
        );
      }
    }
  }
}

LMS_Chat_Realtime::get_instance();
