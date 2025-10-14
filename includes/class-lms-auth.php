<?php

/**
 * LMS認証システム
 *
 * @package LMS Theme
 */

class LMS_Auth
{
	private static $instance = null;
	private $table_name;

	private function __construct()
	{
		global $wpdb;
		$this->table_name = $wpdb->prefix . 'lms_users';
	}

	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * ユーザー登録
	 *
	 * @param string $username ユーザー名
	 * @param string $password パスワード
	 * @param string $display_name 表示名
	 * @param string $email メールアドレス（オプション）
	 * @param string $user_type ユーザータイプ（デフォルト: student）
	 * @return array 登録結果
	 */
	public function register($username, $password, $display_name, $email = '', $user_type = 'student')
	{
		global $wpdb;

		if (empty($username) || empty($password) || empty($display_name)) {
			return array(
				'success' => false,
				'message' => 'ユーザー名、パスワード、表示名は必須です。'
			);
		}

		if (strlen($password) < 8) {
			return array(
				'success' => false,
				'message' => 'パスワードは8文字以上で設定してください。'
			);
		}

		$existing_user = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM {$this->table_name} WHERE username = %s AND status = 'active'",
			$username
		));

		if ($existing_user) {
			return array(
				'success' => false,
				'message' => 'このユーザー名は既に使用されています。'
			);
		}

		$deleted_user = $wpdb->get_row($wpdb->prepare(
			"SELECT id FROM {$this->table_name} WHERE username = %s AND status = 'deleted'",
			$username
		));

		if ($deleted_user) {
			$result = $wpdb->update(
				$this->table_name,
				array(
					'email' => $email,
					'password' => password_hash($password, PASSWORD_DEFAULT),
					'display_name' => $display_name,
					'user_type' => $user_type,
					'status' => 'active',
					'created_at' => current_time('mysql'),
					'last_login' => null,
					'reset_token' => null,
					'reset_token_expiry' => null
				),
				array('id' => $deleted_user->id),
				array('%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s'),
				array('%d')
			);

			if ($result === false) {
				return array(
					'success' => false,
					'message' => 'ユーザー登録に失敗しました。エラー: ' . $wpdb->last_error
				);
			}

			$this->join_chat_channels($deleted_user->id, $display_name);

			return array(
				'success' => true,
				'message' => 'ユーザー登録が完了しました。',
				'user_id' => $deleted_user->id
			);
		}

		if (!empty($email)) {
			$existing_email = $wpdb->get_var($wpdb->prepare(
				"SELECT id FROM {$this->table_name} WHERE email = %s AND status = 'active'",
				$email
			));

			if ($existing_email) {
				return array(
					'success' => false,
					'message' => 'このメールアドレスは既に使用されています。'
				);
			}
		}

		$wpdb->query("LOCK TABLES {$this->table_name} WRITE");
		$max_number = $wpdb->get_var("SELECT MAX(member_number) FROM {$this->table_name}");
		$next_number = $max_number ? $max_number + 1 : 1;
		
		$existing_number = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM {$this->table_name} WHERE member_number = %d",
			$next_number
		));
		
		if ($existing_number) {
			$safe_number = $wpdb->get_var("SELECT MAX(member_number) + 1 FROM {$this->table_name}");
			$next_number = $safe_number ? $safe_number : 1;
		}

		$result = $wpdb->insert(
			$this->table_name,
			array(
				'username' => $username,
				'email' => $email,
				'password' => password_hash($password, PASSWORD_DEFAULT),
				'display_name' => $display_name,
				'user_type' => $user_type,
				'status' => 'active',
				'member_number' => $next_number,
				'created_at' => current_time('mysql'),
				'wp_user_id' => 0 // 常に0に固定（WordPressとの連携を禁止）
			),
			array('%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d')
		);

		$wpdb->query("UNLOCK TABLES");

		if ($result === false) {
			return array(
				'success' => false,
				'message' => 'ユーザー登録に失敗しました。エラー: ' . $wpdb->last_error
			);
		}

		$new_user_id = $wpdb->insert_id;
		

		$this->join_chat_channels($new_user_id, $display_name);

		return array(
			'success' => true,
			'message' => 'ユーザー登録が完了しました。',
			'user_id' => $new_user_id
		);
	}

	/**
	 * ユーザーをチャットチャンネルに参加させる
	 *
	 * @param int $user_id ユーザーID
	 * @param string $display_name 表示名
	 */
	private function join_chat_channels($user_id, $display_name)
	{
		global $wpdb;

		$public_channels = $wpdb->get_results(
			"SELECT id FROM {$wpdb->prefix}lms_chat_channels WHERE type = 'public'"
		);

		foreach ($public_channels as $channel) {
			$wpdb->insert(
				$wpdb->prefix . 'lms_chat_channel_members',
				array(
					'channel_id' => $channel->id,
					'user_id' => $user_id
				),
				array('%d', '%d')
			);
		}

		$wpdb->insert(
			$wpdb->prefix . 'lms_chat_channels',
			array(
				'name' => $display_name,
				'type' => 'private',
				'created_at' => current_time('mysql'),
				'created_by' => $user_id
			),
			array('%s', '%s', '%s', '%d')
		);

		$private_channel_id = $wpdb->insert_id;

		$wpdb->insert(
			$wpdb->prefix . 'lms_chat_channel_members',
			array(
				'channel_id' => $private_channel_id,
				'user_id' => $user_id
			),
			array('%d', '%d')
		);

		$admin_users = $wpdb->get_results(
			"SELECT id FROM {$wpdb->prefix}lms_users
			WHERE user_type = 'admin'
			AND status = 'active'
			AND id != {$user_id}"
		);

		foreach ($admin_users as $admin) {
			$wpdb->insert(
				$wpdb->prefix . 'lms_chat_channel_members',
				array(
					'channel_id' => $private_channel_id,
					'user_id' => $admin->id
				),
				array('%d', '%d')
			);
		}
	}

	/**
	 * ログイン認証
	 *
	 * @param string $username ユーザー名
	 * @param string $password パスワード
	 * @return array ログイン結果
	 */
	public function login($username, $password)
	{
		global $wpdb;

		if (session_status() !== PHP_SESSION_ACTIVE) {
			return array(
				'success' => false,
				'message' => 'セッションエラーが発生しました。'
			);
		}

		$user = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$this->table_name} WHERE username = %s AND status = 'active'",
			$username
		));

		if (!$user) {
			return array(
				'success' => false,
				'message' => 'ユーザー名またはパスワードが正しくありません。'
			);
		}

		if (!password_verify($password, $user->password)) {
			return array(
				'success' => false,
				'message' => 'ユーザー名またはパスワードが正しくありません。'
			);
		}

		if (session_status() === PHP_SESSION_ACTIVE) {
			session_regenerate_id(true);
		}
		
		$_SESSION['lms_user_id'] = $user->id;
		$_SESSION['lms_user_type'] = $user->user_type;

		$wpdb->update(
			$this->table_name,
			array('last_login' => current_time('mysql')),
			array('id' => $user->id),
			array('%s'),
			array('%d')
		);

		return array(
			'success' => true,
			'message' => 'ログインしました。',
			'redirect_url' => home_url('/my-page/'),
			'user' => $user
		);
	}

	/**
	 * ユーザー名でユーザーを取得
	 *
	 * @param string $username ユーザー名
	 * @return object|null ユーザーオブジェクトまたはnull
	 */
	public function get_user_by_username($username)
	{
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name} WHERE username = %s AND status = 'active'",
				$username
			)
		);
	}

	/**
	 * メールアドレスでユーザーを取得
	 */
	public function get_user_by_email($email)
	{
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name} WHERE email = %s AND status = 'active'",
				$email
			)
		);
	}

	/**
	 * IDでユーザーを取得
	 */
	public function get_user_by_id($id)
	{
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name} WHERE id = %d AND status = 'active'",
				$id
			)
		);
	}

	/**
	 * 最終ログイン日時を更新
	 */
	private function update_last_login($user_id)
	{
		global $wpdb;
		$wpdb->update(
			$this->table_name,
			array('last_login' => current_time('mysql')),
			array('id' => $user_id),
			array('%s'),
			array('%d')
		);
	}

	/**
	 * ログアウト処理
	 */
	public function logout()
	{
		$user_id = isset($_SESSION['lms_user_id']) ? $_SESSION['lms_user_id'] : 0;

		if (session_id()) {
			session_destroy();
		}

		wp_clear_auth_cookie();
		wp_destroy_current_session();

		$cookie_name = 'lms_remember_login';
		if (isset($_COOKIE[$cookie_name])) {
			setcookie($cookie_name, '', time() - 3600, '/', '', true, true);

			if ($user_id > 0) {
				$this->clear_login_token($user_id);
			}
		}

		return true;
	}

	/**
	 * ログイン状態をチェック
	 */
	public function is_logged_in()
	{
		return isset($_SESSION['lms_user_id']);
	}

	/**
	 * 現在のユーザー情報を取得
	 */
	public function get_current_user()
	{
		if (!$this->is_logged_in()) {
			return null;
		}

		if (!isset($_SESSION['lms_user_id'])) {
			return null;
		}

		$session_user_id = $_SESSION['lms_user_id'];
		$user = $this->get_user_by_id($session_user_id);

		if ($user) {
			$_SESSION['lms_user_type'] = $user->user_type;
		}

		return $user;
	}

	/**
	 * パスワードリセットトークンを生成
	 *
	 * @param int $user_id ユーザーID
	 * @return array|WP_Error トークン情報または失敗時のエラー
	 */
	public function generate_reset_token($user_id)
	{
		global $wpdb;
		$user = $this->get_user_by_id($user_id);

		if (!$user) {
			return new WP_Error('invalid_user', 'ユーザーが見つかりません。');
		}

		$token = wp_generate_password(32, false);
		$expiry = date('Y-m-d H:i:s', time() + (24 * 60 * 60)); // 24時間有効

		$result = $wpdb->update(
			$this->table_name,
			array(
				'reset_token' => $token,
				'reset_token_expiry' => $expiry
			),
			array('id' => $user_id),
			array('%s', '%s'),
			array('%d')
		);

		if ($result === false) {
			return new WP_Error('token_generation_failed', 'トークンの生成に失敗しました。');
		}

		return array(
			'token' => $token,
			'expiry' => $expiry
		);
	}

	/**
	 * パスワードリセットトークンを検証
	 *
	 * @param string $token リセットトークン
	 * @return bool トークンが有効な場合はtrue
	 */
	public function verify_reset_token($token)
	{
		global $wpdb;

		$user = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$this->table_name} WHERE reset_token = %s AND status = 'active'",
			$token
		));

		if (!$user) {
			return false;
		}

		if (strtotime($user->reset_token_expiry) < time()) {
			return false;
		}

		return true;
	}

	/**
	 * リセットトークンからユーザーIDを取得
	 *
	 * @param string $token リセットトークン
	 * @return int|null ユーザーIDまたはnull
	 */
	public function get_user_id_by_reset_token($token)
	{
		global $wpdb;

		$user = $wpdb->get_row($wpdb->prepare(
			"SELECT id FROM {$this->table_name} WHERE reset_token = %s AND status = 'active'",
			$token
		));

		return $user ? $user->id : null;
	}

	/**
	 * リセットトークンを無効化
	 *
	 * @param string $token リセットトークン
	 * @return bool 無効化が成功した場合はtrue
	 */
	public function invalidate_reset_token($token)
	{
		global $wpdb;

		$result = $wpdb->update(
			$this->table_name,
			array(
				'reset_token' => null,
				'reset_token_expiry' => null
			),
			array('reset_token' => $token),
			array('%s', '%s'),
			array('%s')
		);

		return $result !== false;
	}

	/**
	 * パスワードを更新
	 *
	 * @param int $user_id ユーザーID
	 * @param string $new_password 新しいパスワード
	 * @return bool 更新が成功した場合はtrue
	 */
	public function update_password($user_id, $new_password)
	{
		global $wpdb;

		$hashed_password = password_hash($new_password, PASSWORD_DEFAULT);

		$result = $wpdb->update(
			$this->table_name,
			array('password' => $hashed_password),
			array('id' => $user_id),
			array('%s'),
			array('%d')
		);

		return $result !== false;
	}

	/**
	 * パスワードをリセット
	 */
	public function reset_password($email, $token, $new_password)
	{
		global $wpdb;
		$user = $this->get_user_by_email($email);

		if (!$user) {
			return new WP_Error('invalid_email', 'メールアドレスが見つかりません。');
		}

		if ($user->reset_token !== $token) {
			return new WP_Error('invalid_token', '無効なトークンです。');
		}

		if (strtotime($user->reset_token_expiry) < time()) {
			return new WP_Error('token_expired', 'トークンの有効期限が切れています。');
		}

		$hashed_password = password_hash($new_password, PASSWORD_DEFAULT);

		$result = $wpdb->update(
			$this->table_name,
			array(
				'password' => $hashed_password,
				'reset_token' => null,
				'reset_token_expiry' => null
			),
			array('id' => $user->id),
			array('%s', '%s', '%s'),
			array('%d')
		);

		if ($result === false) {
			return new WP_Error('password_reset_failed', 'パスワードのリセットに失敗しました。');
		}

		return true;
	}

	/**
	 * ユーザータイプを更新
	 */
	public function update_user_type($user_id, $user_type)
	{
		global $wpdb;

		if (!in_array($user_type, ['student', 'teacher', 'admin'])) {
			return new WP_Error('invalid_user_type', '無効なユーザータイプです。');
		}

		$result = $wpdb->update(
			$this->table_name,
			array('user_type' => $user_type),
			array('id' => $user_id),
			array('%s'),
			array('%d')
		);

		if ($result === false) {
			return new WP_Error('update_failed', 'ユーザータイプの更新に失敗しました。');
		}

		if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] == $user_id) {
			$_SESSION['lms_user_type'] = $user_type;
		}

		return true;
	}

	/**
	 * リダイレクトページを設定
	 */
	public function set_redirect_page($user_id, $page_id)
	{
		global $wpdb;

		if ($page_id > 0) {
			$post = get_post($page_id);
			if (!$post || $post->post_type !== 'post') {
				return new WP_Error('invalid_page', '無効なページIDです。投稿のみ選択可能です。');
			}
		}

		$result = $wpdb->update(
			$this->table_name,
			array('redirect_page' => $page_id ?: null),
			array('id' => $user_id),
			array('%d'),
			array('%d')
		);

		if ($result === false) {
			return new WP_Error('update_failed', 'リダイレクトページの設定に失敗しました。');
		}

		return true;
	}

	/**
	 * ユーザーのリダイレクトページを取得
	 */
	public function get_redirect_page($user_id)
	{
		global $wpdb;
		$user = $this->get_user_by_id($user_id);

		if (!$user) {
			return new WP_Error('invalid_user', '無効なユーザーIDです。');
		}

		if (!empty($user->redirect_page)) {
			$post = get_post($user->redirect_page);
			if ($post && $post->post_type === 'post') {
				return $user->redirect_page;
			}
		}

		return home_url();
	}

	/**
	 * ユーザーの権限をチェック
	 */
	public function check_user_permission($required_type)
	{
		if (!$this->is_logged_in()) {
			return false;
		}

		$user = $this->get_current_user();

		switch ($required_type) {
			case 'admin':
				return $user->user_type === 'admin';
			case 'teacher':
				return in_array($user->user_type, ['admin', 'teacher']);
			case 'student':
				return in_array($user->user_type, ['admin', 'teacher', 'student']);
			default:
				return false;
		}
	}

	/**
	 * Slackチャンネル名を更新
	 *
	 * @param int $user_id ユーザーID
	 * @param string $slack_channel Slackチャンネル名
	 * @return bool|WP_Error 更新が成功した場合はtrue、失敗した場合はWP_Error
	 */
	public function update_slack_channel($user_id, $slack_channel)
	{
		global $wpdb;

		if (!empty($slack_channel) && !preg_match('/^[a-z0-9-_]+$/', $slack_channel)) {
			return new WP_Error(
				'invalid_slack_channel',
				'Slackチャンネル名は半角英数字、ハイフン、アンダースコアのみ使用できます。'
			);
		}

		$result = $wpdb->update(
			$this->table_name,
			array('slack_channel' => $slack_channel ?: null),
			array('id' => $user_id),
			array('%s'),
			array('%d')
		);

		if ($result === false) {
			return new WP_Error(
				'update_failed',
				'Slackチャンネル名の更新に失敗しました。'
			);
		}

		return true;
	}

	/**
	 * Slackチャンネル名を取得
	 *
	 * @param int $user_id ユーザーID
	 * @return string|null Slackチャンネル名
	 */
	public function get_slack_channel($user_id)
	{
		$user = $this->get_user_by_id($user_id);
		return $user ? $user->slack_channel : null;
	}

	/**
	 * パスワードを検証する
	 *
	 * @param int $user_id ユーザーID
	 * @param string $password パスワード
	 * @return bool|WP_Error 検証結果
	 */
	public function verify_password($user_id, $password)
	{
		global $wpdb;

		$user = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$this->table_name} WHERE id = %d AND status = 'active'",
			$user_id
		));

		if (!$user) {
			return new WP_Error('user_not_found', 'ユーザーが見つかりません。');
		}

		if (!wp_check_password($password, $user->password, $user_id)) {
			return new WP_Error('invalid_password', 'パスワードが一致しません。');
		}

		return true;
	}

	/**
	 * クッキーベースでログイン（Remember Me機能）
	 *
	 * @param string $username ユーザー名
	 * @param string $token 認証トークン
	 * @return array ログイン結果
	 */
	public function login_with_cookie($username, $token)
	{
		global $wpdb;

		if (session_status() !== PHP_SESSION_ACTIVE) {
			return array(
				'success' => false,
				'message' => 'セッションエラーが発生しました。'
			);
		}

		$user = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$this->table_name} WHERE username = %s AND status = 'active'",
			$username
		));

		if (!$user) {
			return array(
				'success' => false,
				'message' => 'ユーザーが見つかりません。'
			);
		}

		$valid_token = $wpdb->get_var($wpdb->prepare(
			"SELECT login_token FROM {$this->table_name} WHERE id = %d AND login_token = %s AND login_token_expiry > %s",
			$user->id,
			$token,
			current_time('mysql')
		));

		if (!$valid_token) {
			return array(
				'success' => false,
				'message' => '無効なトークンです。再度ログインしてください。'
			);
		}

		$_SESSION['lms_user_id'] = $user->id;
		$_SESSION['lms_user_type'] = $user->user_type;

		$wpdb->update(
			$this->table_name,
			array('last_login' => current_time('mysql')),
			array('id' => $user->id),
			array('%s'),
			array('%d')
		);

		return array(
			'success' => true,
			'message' => 'クッキーからログインしました。',
			'redirect_url' => home_url('/my-page/'),
			'user' => $user
		);
	}

	/**
	 * ログイントークンを生成・保存
	 *
	 * @param int $user_id ユーザーID
	 * @return string|false 生成されたトークンまたはfalse
	 */
	public function generate_login_token($user_id)
	{
		global $wpdb;

		$user = $this->get_user_by_id($user_id);
		if (!$user) {
			return false;
		}

		$token = wp_generate_password(64, false);
		$expiry = date('Y-m-d H:i:s', time() + (30 * 24 * 60 * 60)); // 30日間有効

		$result = $wpdb->update(
			$this->table_name,
			array(
				'login_token' => $token,
				'login_token_expiry' => $expiry
			),
			array('id' => $user_id),
			array('%s', '%s'),
			array('%d')
		);

		if ($result === false) {
			return false;
		}

		return $token;
	}

	/**
	 * ログイントークンを検証
	 *
	 * @param int $user_id ユーザーID
	 * @param string $token トークン
	 * @return bool トークンが有効な場合はtrue
	 */
	public function verify_login_token($user_id, $token)
	{
		global $wpdb;

		return (bool) $wpdb->get_var($wpdb->prepare(
			"SELECT 1 FROM {$this->table_name}
			WHERE id = %d
			AND login_token = %s
			AND login_token_expiry > %s
			AND status = 'active'",
			$user_id,
			$token,
			current_time('mysql')
		));
	}

	/**
	 * ログイントークンを削除
	 *
	 * @param int $user_id ユーザーID
	 * @return bool 削除が成功した場合はtrue
	 */
	public function clear_login_token($user_id)
	{
		global $wpdb;

		$result = $wpdb->update(
			$this->table_name,
			array(
				'login_token' => null,
				'login_token_expiry' => null
			),
			array('id' => $user_id),
			array('%s', '%s'),
			array('%d')
		);

		return $result !== false;
	}
}
