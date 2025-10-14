<?php

/**
 * LMS管理画面
 *
 * @package LMS Theme
 */

class LMS_Admin
{
	private static $instance = null;
	private $auth;

	private function __construct()
	{
		$this->auth = LMS_Auth::get_instance();

		if (current_user_can('administrator') || current_user_can('manage_lms')) {
			add_action('admin_menu', array($this, 'add_admin_menu'));
			add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
			add_action('admin_init', array($this, 'handle_csv_download'));
			add_action('wp_ajax_edit_member', array($this, 'handle_member_edit'));
			add_action('wp_ajax_delete_member', array($this, 'handle_member_delete'));
			add_action('wp_ajax_save_member_fields', array($this, 'handle_save_member_fields'));
		}
	}

	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * 管理メニューを追加
	 */
	public function add_admin_menu()
	{
		$capability = current_user_can('manage_options') || current_user_can('manage_lms_members') ? 'read' : 'manage_options';

		add_menu_page(
			'LMS会員管理',
			'LMS会員管理',
			$capability,
			'lms-members',
			array($this, 'render_members_page'),
			'dashicons-groups',
			30
		);

		add_action('wp_ajax_update_slack_channel', array($this, 'handle_update_slack_channel'));
	}

	/**
	 * 管理画面用スクリプトの読み込み
	 */
	public function enqueue_admin_scripts($hook)
	{
		if ('toplevel_page_lms-members' !== $hook) {
			return;
		}
		wp_enqueue_style(
			'lms-admin-style',
			get_template_directory_uri() . '/admin.css',
			array(),
			filemtime(get_template_directory() . '/admin.css')
		);

		wp_enqueue_style(
			'datatables-style',
			'https://cdn.datatables.net/1.11.5/css/jquery.dataTables.min.css',
			array(),
			'1.11.5'
		);
		wp_enqueue_script(
			'datatables-script',
			'https://cdn.datatables.net/1.11.5/js/jquery.dataTables.min.js',
			array('jquery'),
			'1.11.5',
			true
		);

		wp_enqueue_style('jquery-ui-style', 'https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.css');
		wp_enqueue_script('jquery-ui-dialog');

		wp_enqueue_script(
			'lms-admin-script',
			get_template_directory_uri() . '/js/admin.js',
			array('jquery', 'jquery-ui-dialog', 'datatables-script'),
			LMS_VERSION,
			true
		);

		wp_localize_script('lms-admin-script', 'lmsAdminVars', array(
			'ajaxurl' => admin_url('admin-ajax.php'),
			'editMemberNonce' => wp_create_nonce('edit_member'),
			'slackChannelNonce' => wp_create_nonce('update_slack_channel')
		));
	}

	/**
	 * CSVダウンロードの処理
	 */
	public function handle_csv_download()
	{
		if (!isset($_POST['action']) || $_POST['action'] !== 'download_csv' || !isset($_POST['download_csv_nonce'])) {
			return;
		}

		if (!wp_verify_nonce($_POST['download_csv_nonce'], 'download_csv_nonce')) {
			wp_die('不正なアクセスです。');
		}

		if (!current_user_can('manage_options') && !current_user_can('manage_lms_members')) {
			wp_die('権限がありません。');
		}

		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';
		$users = $wpdb->get_results("SELECT * FROM {$table_name} WHERE status = 'active' ORDER BY id ASC");

		$filename = 'lms-members-' . date('Y-m-d') . '.csv';
		header('Content-Type: text/csv; charset=UTF-8');
		header('Content-Disposition: attachment; filename="' . $filename . '"');

		echo "\xEF\xBB\xBF";

		$output = fopen('php://output', 'w');

		fputcsv($output, array(
			'会員番号',
			'ユーザー名',
			'表示名',
			'メールアドレス',
			'ユーザータイプ',
			'リダイレクト先',
			'最終ログイン'
		));

		foreach ($users as $user) {
			$user_type_labels = array(
				'student' => '学生',
				'teacher' => '講師',
				'admin' => '管理者'
			);

			$redirect_page = '';
			if (!empty($user->redirect_page)) {
				$post = get_post($user->redirect_page);
				if ($post) {
					$redirect_page = $post->post_title;
				}
			}

			$last_login = $user->last_login
				? date_i18n('Y年n月j日 H:i', strtotime($user->last_login))
				: 'ログインなし';

			fputcsv($output, array(
				sprintf('M%06d', $user->id),
				$user->username,
				$user->display_name,
				$user->email ?: '未設定',
				$user_type_labels[$user->user_type] ?? $user->user_type,
				$redirect_page,
				$last_login
			));
		}

		fclose($output);
		exit;
	}

	/**
	 * 会員情報の更新処理
	 */
	private function update_member_info($user_id, $username, $display_name, $email)
	{
		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';

		$existing_user = $wpdb->get_row($wpdb->prepare(
			"SELECT id FROM {$table_name} WHERE username = %s AND id != %d AND status = 'active'",
			$username,
			$user_id
		));

		if ($existing_user) {
			return array(
				'success' => false,
				'message' => 'このユーザー名は既に使用されています。'
			);
		}

		if (!empty($email)) {
			$existing_email = $wpdb->get_row($wpdb->prepare(
				"SELECT id FROM {$table_name} WHERE email = %s AND id != %d AND status = 'active'",
				$email,
				$user_id
			));

			if ($existing_email) {
				return array(
					'success' => false,
					'message' => 'このメールアドレスは既に使用されています。'
				);
			}
		}

		$result = $wpdb->update(
			$table_name,
			array(
				'username' => $username,
				'display_name' => $display_name,
				'email' => $email
			),
			array('id' => $user_id),
			array('%s', '%s', '%s'),
			array('%d')
		);

		if ($result === false) {
			return array(
				'success' => false,
				'message' => '会員情報の更新に失敗しました。'
			);
		}

		return array(
			'success' => true,
			'message' => '会員情報を更新しました。'
		);
	}

	/**
	 * 会員情報の編集をハンドル - シンプル版
	 */
	public function handle_member_edit()
	{
		if (!current_user_can('administrator') && !current_user_can('manage_lms')) {
			wp_send_json_error(array('message' => '権限がありません。'));
			return;
		}

		$nonce_verified = false;
		$nonce_names = ['edit_member_nonce_field', 'edit_member_nonce', '_wpnonce'];

		foreach ($nonce_names as $nonce_key) {
			if (isset($_POST[$nonce_key]) && wp_verify_nonce($_POST[$nonce_key], 'edit_member')) {
				$nonce_verified = true;
				break;
			}
		}

		if (!$nonce_verified) {
		}

		$user_id = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
		$username = isset($_POST['username']) ? sanitize_user($_POST['username']) : '';
		$display_name = isset($_POST['display_name']) ? sanitize_text_field($_POST['display_name']) : '';
		$email = isset($_POST['email']) ? sanitize_email($_POST['email']) : '';
		$password = isset($_POST['password']) ? $_POST['password'] : '';
		$password_confirm = isset($_POST['password_confirm']) ? $_POST['password_confirm'] : '';

		if (empty($user_id) || empty($username) || empty($display_name)) {
			wp_send_json_error(array('message' => '必須項目が入力されていません。'));
			return;
		}

		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';

		$existing_user = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$table_name} WHERE username = %s AND id != %d AND status = 'active'",
			$username,
			$user_id
		));

		if ($existing_user > 0) {
			wp_send_json_error(array('message' => 'このユーザー名は既に使用されています。'));
			return;
		}

		if (!empty($email)) {
			$existing_email = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$table_name} WHERE email = %s AND id != %d AND status = 'active'",
				$email,
				$user_id
			));

			if ($existing_email > 0) {
				wp_send_json_error(array('message' => 'このメールアドレスは既に使用されています。'));
				return;
			}
		}

		if (!empty($password)) {
			if ($password !== $password_confirm) {
				wp_send_json_error(array('message' => 'パスワードが一致しません。'));
				return;
			}
			if (strlen($password) < 8) {
				wp_send_json_error(array('message' => 'パスワードは8文字以上で設定してください。'));
				return;
			}

			$hashed_password = wp_hash_password($password);

			$password_update = $wpdb->query($wpdb->prepare(
				"UPDATE {$table_name} SET password = %s WHERE id = %d",
				$hashed_password,
				$user_id
			));
		}

		$query = $wpdb->prepare(
			"UPDATE {$table_name} SET username = %s, display_name = %s, email = %s WHERE id = %d",
			$username,
			$display_name,
			$email,
			$user_id
		);

		$result = $wpdb->query($query);

		if ($result === false) {
			wp_send_json_error(array('message' => 'データベース更新に失敗しました。'));
			return;
		}

		wp_send_json_success(array('message' => 'ユーザー情報を更新しました。'));
	}

	/**
	 * 会員削除の処理
	 */
	public function handle_member_delete()
	{
		check_ajax_referer('edit_member_nonce', 'nonce');

		if (!current_user_can('manage_options') && !current_user_can('manage_lms_members')) {
			wp_send_json_error(array('message' => '権限がありません。'));
		}

		$user_id = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
		if (!$user_id) {
			wp_send_json_error(array('message' => '無効なユーザーIDです。'));
		}

		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';

		$session_token = $wpdb->get_var($wpdb->prepare(
			"SELECT session_token FROM {$table_name} WHERE id = %d",
			$user_id
		));

		$result = $wpdb->update(
			$table_name,
			array('status' => 'deleted'),
			array('id' => $user_id),
			array('%s'),
			array('%d')
		);

		if ($result === false) {
			wp_send_json_error(array('message' => 'データベースの更新に失敗しました。'));
		}

		$is_current_user = isset($_SESSION['lms_user_id']) && intval($_SESSION['lms_user_id']) === $user_id;
		if ($is_current_user) {
			$this->auth->logout();

			$_SESSION = array();

			if (isset($_COOKIE[session_name()])) {
				setcookie(session_name(), '', time() - 3600, '/');
			}

			session_destroy();

			wp_clear_auth_cookie();
			wp_destroy_current_session();
		}

		if ($session_token) {
			$wpdb->delete(
				$wpdb->prefix . 'lms_sessions',
				array('token' => $session_token),
				array('%s')
			);
		}

		wp_send_json_success(array(
			'message' => '会員を削除しました。',
			'is_current_user' => $is_current_user
		));
	}

	/**
	 * 複数ユーザーのフィールドを一括保存
	 */
	public function handle_save_member_fields()
	{
		if (!current_user_can('manage_options') && !current_user_can('manage_lms_members')) {
			wp_send_json_error(array('message' => '権限がありません。'));
		}

		if (!check_ajax_referer('save_member_fields', 'nonce', false)) {
			wp_send_json_error(array('message' => '不正なアクセスです。'));
		}

		$updates = array();
		if (isset($_POST['user_type']) && is_array($_POST['user_type'])) {
			foreach ($_POST['user_type'] as $user_id => $user_type) {
				$updates[$user_id]['user_type'] = $user_type;
				$updates[$user_id]['redirect_page'] = isset($_POST['redirect_page'][$user_id]) ? $_POST['redirect_page'][$user_id] : '';
			}
		} else {
			wp_send_json_error(array('message' => '更新データがありません。'));
		}

		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';
		$success_count = 0;
		$error_messages = array();

		$wpdb->query('START TRANSACTION');

		try {
			foreach ($updates as $user_id => $update) {
				if (!isset($update['user_type'])) {
					throw new Exception('必須フィールドが不足しています。');
				}

				$user_id = intval($user_id);
				$user_type = sanitize_text_field($update['user_type']);
				$redirect_page = isset($update['redirect_page']) ? sanitize_text_field($update['redirect_page']) : '';

				if (!in_array($user_type, array('student', 'teacher', 'admin'))) {
					throw new Exception("ユーザーID {$user_id}: 不正なユーザータイプです。");
				}

				if ($redirect_page !== '' && !get_post($redirect_page)) {
					throw new Exception("ユーザーID {$user_id}: 指定されたページが存在しません。");
				}

				$result = $wpdb->update(
					$table_name,
					array(
						'user_type' => $user_type,
						'redirect_page' => $redirect_page
					),
					array('id' => $user_id),
					array('%s', '%s'),
					array('%d')
				);

				if ($result === false) {
					throw new Exception("ユーザーID {$user_id}: データベースの更新に失敗しました。");
				}

				if (isset($_SESSION['lms_user_id']) && intval($_SESSION['lms_user_id']) === $user_id) {
					$_SESSION['lms_user_type'] = $user_type;
				}

				$success_count++;
			}

			$wpdb->query('COMMIT');
			wp_send_json_success(array(
				'message' => "更新が完了しました。",
				'success_count' => $success_count
			));
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			wp_send_json_error(array('message' => $e->getMessage()));
		}
	}

	/**
	 * Slackチャンネル名の更新をハンドル
	 */
	public function handle_update_slack_channel()
	{
		if (!current_user_can('manage_options') && !current_user_can('manage_lms_members')) {
			wp_send_json_error(array('message' => '権限がありません。'));
		}

		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'update_slack_channel')) {
			wp_send_json_error(array('message' => '不正なリクエストです。'));
		}

		$user_id = intval($_POST['user_id']);
		$slack_channel = sanitize_text_field($_POST['slack_channel']);

		$result = $this->auth->update_slack_channel($user_id, $slack_channel);

		if (is_wp_error($result)) {
			wp_send_json_error(array('message' => $result->get_error_message()));
		} else {
			wp_send_json_success(array('message' => 'Slackチャンネル名を更新しました。'));
		}
	}

	/**
	 * 会員一覧ページを表示
	 */
	public function render_members_page()
	{
		if (isset($_POST['action']) && $_POST['action'] === 'download_csv' && check_admin_referer('download_csv')) {
			$this->download_csv();
			return;
		}

		if (isset($_POST['action']) && $_POST['action'] === 'fix_member_numbers' && check_admin_referer('fix_member_numbers', 'fix_member_numbers_nonce')) {
			$security = new LMS_Security();
			$security->fix_member_numbers();
			echo '<div class="notice notice-success"><p>会員番号の整合性を修復しました。</p></div>';
		}

		if (isset($_POST['action']) && $_POST['action'] === 'security_check' && check_admin_referer('security_check', 'security_check_nonce')) {
			echo '<div class="notice notice-info"><p>整合性チェックを実行しました。</p></div>';
		}

		if (isset($_POST['action']) && $_POST['action'] === 'delete_all_members' && check_admin_referer('delete_all_members', 'delete_all_members_nonce')) {
			global $wpdb;
			$table_name = $wpdb->prefix . 'lms_users';

			$result = $wpdb->query(
				"DELETE FROM $table_name"
			);

			if ($result !== false) {
				echo '<div class="notice notice-success"><p>全ての会員データを削除しました。</p></div>';
			} else {
				echo '<div class="notice notice-error"><p>会員データの削除に失敗しました。</p></div>';
			}
		}

		$users = $this->get_users();
?>
		<div class="wrap">
			<h1>LMS会員管理</h1>

			<!-- セキュリティ情報 -->
			<?php $this->display_security_info(); ?>

			<!-- データ削除フォーム -->
			<div class="member-reset-form">
				<h2>全データの削除</h2>
				<p>全ての会員データを削除します。この操作は取り消せません。</p>
				<form method="post" onsubmit="return confirm('全ての会員データを削除しますか？\n\n※この操作は取り消せません。');">
					<?php wp_nonce_field('delete_all_members', 'delete_all_members_nonce'); ?>
					<input type="hidden" name="action" value="delete_all_members">
					<div class="reset-confirmation">
						<label for="reset_confirmation">確認のため「reset」と入力してください：</label>
						<input type="text" id="reset_confirmation" name="reset_confirmation" pattern="^reset$" required>
					</div>
					<input type="submit" class="button button-link-delete" value="全データを削除" id="delete_all_button" disabled>
				</form>
			</div>
			
			<script type="text/javascript">
			jQuery(document).ready(function($) {
				// 全データ削除ボタンの有効化処理
				$('#reset_confirmation').on('input keyup change', function() {
					var inputValue = $(this).val();
					var deleteButton = $('#delete_all_button');
					
					if (inputValue === 'reset') {
						deleteButton.prop('disabled', false);
						deleteButton.removeAttr('disabled');
					} else {
						deleteButton.prop('disabled', true);
						deleteButton.attr('disabled', 'disabled');
					}
				});
			});
			</script>

			<!-- 会員一覧テーブル -->
			<div class="member-list-container">
				<form id="lms-members-form" method="post">
					<table id="lms-members-table" class="display">
						<thead>
							<tr>
								<th>会員番号</th>
								<th>ユーザー名</th>
								<th>表示名</th>
								<th>メールアドレス</th>
								<th>ユーザータイプ</th>
								<th>Slackチャンネル</th>
								<th>リダイレクト先</th>
								<th>最終ログイン</th>
								<th>操作</th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ($users as $user) : ?>
								<tr>
									<td>M<?php echo str_pad($user->member_number, 6, '0', STR_PAD_LEFT); ?></td>
									<td><?php echo esc_html($user->username); ?></td>
									<td><?php echo esc_html($user->display_name); ?></td>
									<td><?php echo $user->email ? esc_html($user->email) : '未設定'; ?></td>
									<td>
										<select name="user_type[<?php echo $user->id; ?>]" tabindex="0" aria-label="ユーザータイプ">
											<option value="student" <?php selected($user->user_type, 'student'); ?>>学生</option>
											<option value="teacher" <?php selected($user->user_type, 'teacher'); ?>>教師</option>
											<option value="admin" <?php selected($user->user_type, 'admin'); ?>>管理者</option>
										</select>
									</td>
									<td>
										<input type="text" name="slack_channel[<?php echo $user->id; ?>]" value="<?php echo esc_attr($user->slack_channel); ?>" placeholder="未設定" pattern="[a-z0-9\-_]+" title="半角英数字、ハイフン、アンダースコアのみ使用できます" tabindex="0" aria-label="Slackチャンネル">
									</td>
									<td>
										<?php
										$posts = get_posts(array(
											'post_type' => 'post',
											'posts_per_page' => -1,
											'orderby' => 'title',
											'order' => 'ASC',
											'post_status' => 'publish'
										));
										?>
										<select name="redirect_page[<?php echo $user->id; ?>]" tabindex="0" aria-label="リダイレクト先">
											<option value="">未設定</option>
											<?php foreach ($posts as $post) : ?>
												<option value="<?php echo $post->ID; ?>" <?php selected($user->redirect_page, $post->ID); ?>>
													<?php echo esc_html($post->post_title); ?>
												</option>
											<?php endforeach; ?>
										</select>
									</td>
									<td>
										<?php echo $user->last_login ? date_i18n('Y年n月j日 H:i', strtotime($user->last_login)) : 'ログインなし'; ?>
									</td>
									<td>
										<button class="button button-small delete-member" data-user-id="<?php echo $user->id; ?>" type="button">削除</button>
										<button class="button button-small edit-member" data-user-id="<?php echo $user->id; ?>"
											data-username="<?php echo esc_attr($user->username); ?>"
											data-display-name="<?php echo esc_attr($user->display_name); ?>"
											data-email="<?php echo esc_attr($user->email); ?>" tabindex="0" aria-label="会員情報編集" type="button">編集</button>
									</td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
					<div class="save-changes-container">
						<p class="submit">
							<?php echo wp_nonce_field('save_member_fields', 'nonce', true, false); ?>
							<button type="submit" class="button button-primary save-changes-button" tabindex="0" aria-label="設定保存">設定保存</button>
						</p>
					</div>
				</form>
			</div>
		</div>

		<!-- 編集ダイアログ -->
		<div id="edit-dialog" title="会員情報の編集">
			<form id="edit-form" method="post" onsubmit="return false;">
				<?php wp_nonce_field('edit_member', 'edit_member_nonce_field'); ?>
				<input type="hidden" name="user_id" id="edit-user-id">

				<div class="form-field">
					<label for="edit-username">ユーザー名 <span class="required">*</span></label>
					<input type="text" id="edit-username" name="username" required autocomplete="username">
				</div>

				<div class="form-field">
					<label for="edit-display-name">表示名 <span class="required">*</span></label>
					<input type="text" id="edit-display-name" name="display_name" required autocomplete="name">
				</div>

				<div class="form-field">
					<label for="edit-email">メールアドレス</label>
					<input type="email" id="edit-email" name="email" autocomplete="email">
				</div>

				<div class="form-field">
					<button type="button" id="toggle-password-fields" class="button">パスワードを変更</button>
				</div>

				<div id="password-fields">
					<div class="form-field">
						<label for="edit-password">新しいパスワード</label>
						<input type="password" id="edit-password" name="password" minlength="8" autocomplete="new-password">
						<p class="description">8文字以上で入力してください</p>
					</div>

					<div class="form-field">
						<label for="edit-password-confirm">パスワード（確認）</label>
						<input type="password" id="edit-password-confirm" name="password_confirm" minlength="8" autocomplete="new-password">
					</div>
				</div>
			</form>
		</div>
	<?php
	}

	/**
	 * データベースからユーザー一覧を取得
	 *
	 * @return array ユーザー一覧
	 */
	private function get_users()
	{
		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';

		$users = $wpdb->get_results(
			"SELECT * FROM $table_name WHERE status = 'active' ORDER BY member_number ASC"
		);

		foreach ($users as $user) {
			if (empty($user->member_number) || $user->member_number === 0) {
				$max_number = $wpdb->get_var("SELECT MAX(member_number) FROM $table_name WHERE member_number IS NOT NULL AND member_number > 0");
				$next_number = $max_number ? $max_number + 1 : 1;
				
				$wpdb->update(
					$table_name,
					array('member_number' => $next_number),
					array('id' => $user->id),
					array('%d'),
					array('%d')
				);
				$user->member_number = $next_number;
			}
		}

		return $users;
	}

	/**
	 * セキュリティ情報を表示
	 */
	private function display_security_info()
	{
		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';
		
		$wp_linked_users = $wpdb->get_results(
			"SELECT id, username, wp_user_id, member_number, created_at 
			 FROM {$table_name} 
			 WHERE wp_user_id > 0 
			 ORDER BY created_at DESC"
		);
		
		$duplicate_members = $wpdb->get_results(
			"SELECT member_number, COUNT(*) as count 
			 FROM {$table_name} 
			 WHERE member_number IS NOT NULL AND member_number != '' 
			 GROUP BY member_number 
			 HAVING count > 1"
		);
		
		$recent_users = $wpdb->get_results(
			"SELECT id, username, wp_user_id, created_at 
			 FROM {$table_name} 
			 WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
			 ORDER BY created_at DESC"
		);
		
		?>
		<div class="security-info-panel">
			<h2>🔒 データ整合性チェック</h2>
			
			<?php if (!empty($wp_linked_users)): ?>
				<div class="security-warning">
					<h3>⚠️ WordPressユーザー連携の警告</h3>
					<p>以下のLMSユーザーはWordPressユーザーとリンクされています：</p>
					<ul>
						<?php foreach ($wp_linked_users as $user): ?>
							<li>
								<strong><?php echo esc_html($user->username); ?></strong> 
								(ID: <?php echo $user->id; ?>, WP_ID: <?php echo $user->wp_user_id; ?>, 
								会員番号: <?php echo $user->member_number; ?>, 
								作成: <?php echo $user->created_at; ?>)
							</li>
						<?php endforeach; ?>
					</ul>
				</div>
			<?php endif; ?>
			
			<?php if (!empty($duplicate_members)): ?>
				<div class="security-warning">
					<h3>⚠️ 会員番号重複エラー</h3>
					<p>以下の会員番号が重複しています：</p>
					<ul>
						<?php foreach ($duplicate_members as $duplicate): ?>
							<li>会員番号 <strong><?php echo $duplicate->member_number; ?></strong> が <?php echo $duplicate->count; ?> 件重複</li>
						<?php endforeach; ?>
					</ul>
				</div>
			<?php endif; ?>
			
			<?php if (!empty($recent_users)): ?>
				<div class="security-info">
					<h3>📅 最近のユーザー登録 (24時間以内)</h3>
					<ul>
						<?php foreach ($recent_users as $user): ?>
							<li>
								<strong><?php echo esc_html($user->username); ?></strong> 
								(ID: <?php echo $user->id; ?>
								<?php if ($user->wp_user_id > 0): ?>
									, <span class="wp-link-warning">WP連携: <?php echo $user->wp_user_id; ?></span>
								<?php endif; ?>
								, 作成: <?php echo $user->created_at; ?>)
							</li>
						<?php endforeach; ?>
					</ul>
				</div>
			<?php endif; ?>
			
			<?php if (empty($wp_linked_users) && empty($duplicate_members)): ?>
				<div class="security-success">
					<p>✅ データ整合性に問題は検出されませんでした。</p>
				</div>
			<?php endif; ?>
			
			<div class="security-actions">
				<form method="post">
					<?php wp_nonce_field('fix_member_numbers', 'fix_member_numbers_nonce'); ?>
					<input type="hidden" name="action" value="fix_member_numbers">
					<input type="submit" class="button" value="会員番号を修復">
				</form>
				
				<form method="post">
					<?php wp_nonce_field('security_check', 'security_check_nonce'); ?>
					<input type="hidden" name="action" value="security_check">
					<input type="submit" class="button" value="整合性を再チェック">
				</form>
			</div>
		</div>
		<?php
	}

	/**
	 * CSVダウンロード
	 */
	private function download_csv()
	{
		if (!current_user_can('manage_options') && !current_user_can('manage_lms_members')) {
			wp_die('権限がありません。');
		}

		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';
		$users = $wpdb->get_results("SELECT * FROM {$table_name} WHERE status = 'active' ORDER BY member_number ASC");

		$filename = 'lms-members-' . date('Y-m-d') . '.csv';
		header('Content-Type: text/csv; charset=UTF-8');
		header('Content-Disposition: attachment; filename="' . $filename . '"');

		echo "\xEF\xBB\xBF";

		$output = fopen('php://output', 'w');

		fputcsv($output, array(
			'会員番号',
			'ユーザー名',
			'表示名',
			'メールアドレス',
			'ユーザータイプ',
			'Slackチャンネル',
			'リダイレクト先',
			'最終ログイン'
		));

		foreach ($users as $user) {
			$user_type_labels = array(
				'student' => '学生',
				'teacher' => '講師',
				'admin' => '管理者'
			);

			$redirect_page = '';
			if (!empty($user->redirect_page)) {
				$post = get_post($user->redirect_page);
				if ($post) {
					$redirect_page = $post->post_title;
				}
			}

			$last_login = $user->last_login
				? date_i18n('Y年n月j日 H:i', strtotime($user->last_login))
				: 'ログインなし';

			fputcsv($output, array(
				'M' . str_pad($user->member_number, 6, '0', STR_PAD_LEFT),
				$user->username,
				$user->display_name,
				$user->email ?: '未設定',
				$user_type_labels[$user->user_type] ?? $user->user_type,
				$user->slack_channel ?: '未設定',
				$redirect_page ?: '未設定',
				$last_login
			));
		}

		fclose($output);
		exit;
	}

	/**
	 * パスワード確認をハンドル
	 */
	public function handle_verify_password()
	{
		if (!current_user_can('manage_options') && !current_user_can('manage_lms_members')) {
			wp_send_json_error(array('message' => '権限がありません。'));
		}

		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'verify_password')) {
			wp_send_json_error(array('message' => '不正なリクエストです。'));
		}

		$user_id = intval($_POST['user_id']);
		$password = $_POST['password'];

		$result = $this->auth->verify_password($user_id, $password);
		if (is_wp_error($result)) {
			wp_send_json_error(array('message' => $result->get_error_message()));
		}

		wp_send_json_success(array('message' => 'パスワードが一致しました。'));
	}

	/**
	 * LMS管理ページを表示
	 */
	public function render_settings_page()
	{
		if (isset($_POST['submit']) && check_admin_referer('lms_settings')) {
			$site_key = sanitize_text_field($_POST['recaptcha_site_key']);
			$secret_key = sanitize_text_field($_POST['recaptcha_secret_key']);

			update_option('lms_recaptcha_site_key', $site_key);
			update_option('lms_recaptcha_secret_key', $secret_key);

			echo '<div class="notice notice-success"><p>設定を保存しました。</p></div>';
		}

		$site_key = get_option('lms_recaptcha_site_key', '');
		$secret_key = get_option('lms_recaptcha_secret_key', '');
	?>
		<div class="wrap">
			<h1>LMS管理</h1>

			<form method="post" action="">
				<?php wp_nonce_field('lms_settings', 'lms_settings_nonce'); ?>

				<h2>reCAPTCHA設定</h2>
				<table class="form-table">
					<tr>
						<th scope="row">
							<label for="recaptcha_site_key">サイトキー</label>
						</th>
						<td>
							<input type="text" id="recaptcha_site_key" name="recaptcha_site_key"
								value="<?php echo esc_attr($site_key); ?>" class="regular-text">
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="recaptcha_secret_key">シークレットキー</label>
						</th>
						<td>
							<input type="text" id="recaptcha_secret_key" name="recaptcha_secret_key"
								value="<?php echo esc_attr($secret_key); ?>" class="regular-text">
						</td>
					</tr>
				</table>

				<p class="submit">
					<input type="submit" name="submit" id="submit" class="button button-primary" value="設定を保存">
				</p>
			</form>
		</div>
<?php
	}
}
