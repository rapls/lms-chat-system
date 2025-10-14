/**
* 未読カウントのみを取得するAjaxハンドラー
*/
public function poll_unread_counts() {
check_ajax_referer('lms_chat_nonce', 'security');

$user_id = get_current_user_id();
if (!$user_id) {
wp_send_json_error('ログインしていません');
return;
}

$unread_counts = $this->get_unread_counts($user_id);

wp_send_json_success($unread_counts);
}

/**
* 特定のチャンネルの新しいメッセージのみを取得するAjaxハンドラー
*/
public function poll_messages() {
check_ajax_referer('lms_chat_nonce', 'security');

$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
$thread_id = isset($_POST['thread_id']) ? intval($_POST['thread_id']) : 0;
$last_message_id = isset($_POST['last_message_id']) ? intval($_POST['last_message_id']) : 0;

if (!$channel_id) {
wp_send_json_error('チャンネルIDが必要です');
return;
}

$user_id = get_current_user_id();
if (!$user_id) {
wp_send_json_error('ログインしていません');
return;
}

if (!$this->can_access_channel($user_id, $channel_id)) {
wp_send_json_error('このチャンネルにアクセスする権限がありません');
return;
}

$messages = $this->get_new_messages($channel_id, $thread_id, $last_message_id);

wp_send_json_success([
'messages' => $messages
]);
}

/**
* SSEフォールバック用の統合ポーリングエンドポイント
* 新しいメッセージと削除されたメッセージの両方を取得
*/
public function poll_updates() {
check_ajax_referer('lms_chat_nonce', 'security');

$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
$thread_id = isset($_POST['thread_id']) ? intval($_POST['thread_id']) : 0;
$last_update_time = isset($_POST['last_update_time']) ? intval($_POST['last_update_time']) : 0;

if (!$channel_id) {
wp_send_json_error('チャンネルIDが必要です');
return;
}

$user_id = get_current_user_id();
if (!$user_id) {
wp_send_json_error('ログインしていません');
return;
}

if (!$this->can_access_channel($user_id, $channel_id)) {
wp_send_json_error('このチャンネルにアクセスする権限がありません');
return;
}

$response_data = [];

$new_messages = $this->get_messages_since_time($channel_id, $thread_id, $last_update_time);
if (!empty($new_messages)) {
$response_data['new_messages'] = $new_messages;
}

$deleted_messages = $this->get_deleted_messages_since_time($channel_id, $thread_id, $last_update_time);
if (!empty($deleted_messages)) {
$response_data['deleted_messages'] = $deleted_messages;
}

$response_data['timestamp'] = time();

wp_send_json_success($response_data);
}

/**
* ユーザーの未読カウントを取得する
*
* @param int $user_id ユーザーID
* @return array チャンネルIDをキー、未読数を値とする配列
*/
private function get_unread_counts($user_id) {
global $wpdb;

$channels = $this->get_user_channels($user_id);

if (empty($channels)) {
return [];
}

$channel_ids = array_column($channels, 'id');
$channel_ids_str = implode(',', array_map('intval', $channel_ids));

$last_read_query = $wpdb->prepare(
"SELECT channel_id, last_read_message_id
FROM {$wpdb->prefix}lms_chat_user_channel
WHERE user_id = %d AND channel_id IN ($channel_ids_str)",
$user_id
);

$last_read_results = $wpdb->get_results($last_read_query, ARRAY_A);
$last_read = [];

foreach ($last_read_results as $row) {
$last_read[$row['channel_id']] = (int)$row['last_read_message_id'];
}

$unread_counts = [];

foreach ($channel_ids as $channel_id) {
$last_read_id = isset($last_read[$channel_id]) ? $last_read[$channel_id] : 0;

$count_query = $wpdb->prepare(
"SELECT COUNT(*)
FROM {$wpdb->prefix}lms_chat_messages
WHERE channel_id = %d
AND id > %d
AND user_id != %d
AND deleted_at IS NULL",
$channel_id, $last_read_id, $user_id
);

$unread_counts[$channel_id] = (int)$wpdb->get_var($count_query);
}

return $unread_counts;
}

/**
* 特定のチャンネルの新しいメッセージを取得する
*
* @param int $channel_id チャンネルID
* @param int $thread_id スレッドID（オプション）
* @param int $last_message_id 最後に読んだメッセージID
* @return array メッセージの配列
*/
private function get_new_messages($channel_id, $thread_id = 0, $last_message_id = 0) {
global $wpdb;

$thread_condition = $thread_id > 0 ? $wpdb->prepare("AND thread_id = %d", $thread_id) : "AND thread_id = 0";

$query = $wpdb->prepare(
"SELECT *
FROM {$wpdb->prefix}lms_chat_messages
WHERE channel_id = %d
$thread_condition
AND id > %d
AND deleted_at IS NULL
ORDER BY created_at ASC
LIMIT 50",
$channel_id, $last_message_id
);

$messages = $wpdb->get_results($query, ARRAY_A);

if (empty($messages)) {
return [];
}

return array_map([$this, 'format_message'], $messages);
}

/**
* 指定時刻以降の新しいメッセージを取得する
*
* @param int $channel_id チャンネルID
* @param int $thread_id スレッドID（オプション）
* @param int $last_update_time 最終更新時刻（UNIX timestamp）
* @return array メッセージの配列
*/
private function get_messages_since_time($channel_id, $thread_id = 0, $last_update_time = 0) {
global $wpdb;

$thread_condition = $thread_id > 0 ? $wpdb->prepare("AND thread_id = %d", $thread_id) : "AND thread_id = 0";

$query = $wpdb->prepare(
"SELECT *
FROM {$wpdb->prefix}lms_chat_messages
WHERE channel_id = %d
$thread_condition
AND unix_timestamp > %d
AND deleted_at IS NULL
ORDER BY unix_timestamp ASC
LIMIT 50",
$channel_id, $last_update_time
);

$messages = $wpdb->get_results($query, ARRAY_A);

if (empty($messages)) {
return [];
}

return array_map([$this, 'format_message'], $messages);
}

/**
* 指定時刻以降に削除されたメッセージを取得する
*
* @param int $channel_id チャンネルID
* @param int $thread_id スレッドID（オプション）
* @param int $last_update_time 最終更新時刻（UNIX timestamp）
* @return array 削除されたメッセージの配列
*/
private function get_deleted_messages_since_time($channel_id, $thread_id = 0, $last_update_time = 0) {
global $wpdb;

$thread_condition = $thread_id > 0 ? $wpdb->prepare("AND thread_id = %d", $thread_id) : "AND thread_id = 0";

$query = $wpdb->prepare(
"SELECT id, channel_id, thread_id, deleted_at
FROM {$wpdb->prefix}lms_chat_messages
WHERE channel_id = %d
$thread_condition
AND deleted_at IS NOT NULL
AND UNIX_TIMESTAMP(deleted_at) > %d
ORDER BY deleted_at ASC
LIMIT 50",
$channel_id, $last_update_time
);

$deleted_messages = $wpdb->get_results($query, ARRAY_A);

return $deleted_messages ?: [];
}

/**
* Ajaxフックを登録
*/
public function register_ajax_hooks() {
add_action('wp_ajax_lms_chat_get_channels', array($this, 'get_channels'));
add_action('wp_ajax_lms_chat_get_messages', array($this, 'get_messages'));
add_action('wp_ajax_lms_chat_send_message', array($this, 'send_message'));
add_action('wp_ajax_lms_chat_mark_as_read', array($this, 'mark_as_read'));
add_action('wp_ajax_lms_chat_delete_message', array($this, 'delete_message'));
add_action('wp_ajax_lms_chat_get_thread_messages', array($this, 'get_thread_messages'));
add_action('wp_ajax_lms_chat_check_deleted_messages', array($this, 'check_deleted_messages'));

add_action('wp_ajax_lms_chat_poll_unread_counts', array($this, 'poll_unread_counts'));
add_action('wp_ajax_lms_chat_poll_messages', array($this, 'poll_messages'));

add_action('wp_ajax_lms_chat_poll_updates', array($this, 'poll_updates'));
}
