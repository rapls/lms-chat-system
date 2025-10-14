<?php

/**
 * 新規登録ページテンプレート
 *
 * @package LMS Theme
 */

get_header();

$auth = LMS_Auth::get_instance();
if ($auth->is_logged_in()) {
	$current_user = $auth->get_current_user();
	if ($current_user && !empty($current_user->redirect_page)) {
		wp_redirect(get_permalink($current_user->redirect_page));
		exit;
	}
	wp_redirect(home_url());
	exit;
}

$error = '';
$success = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'register') {
	if (!isset($_POST['register_nonce']) || !wp_verify_nonce($_POST['register_nonce'], 'register_action')) {
		$error = '不正なアクセスです。';
	} else {
		$username = sanitize_user($_POST['username']);
		$password = $_POST['password'];
		$display_name = sanitize_text_field($_POST['display_name']);
		$email = sanitize_email($_POST['email']);

		$result = $auth->register($username, $password, $display_name, $email);
		if ($result['success']) {
			$success = true;
		} else {
			$error = $result['message'];
		}
	}
}
?>

<div class="lms-register-container">
	<h1>新規登録</h1>

	<?php if ($success) : ?>
		<div class="lms-success-message">
			登録が完了しました。<a href="<?php echo esc_url(home_url('/login/')); ?>">ログイン</a>してください。
		</div>
	<?php else : ?>
		<?php if (!empty($error)) : ?>
			<div class="lms-error-message">
				<?php echo esc_html($error); ?>
			</div>
		<?php endif; ?>

		<form method="post" action="" class="lms-register-form">
			<?php wp_nonce_field('register_action', 'register_nonce'); ?>
			<input type="hidden" name="action" value="register">

			<div class="form-group">
				<label for="username">ユーザー名 <span class="required">*</span></label>
				<input type="text" id="username" name="username" required
					value="<?php echo isset($_POST['username']) ? esc_attr($_POST['username']) : ''; ?>">
				<p class="description">ログイン時に使用します。他のユーザーと重複しない半角英数字を入力してください。</p>
			</div>

			<div class="form-group">
				<label for="display_name">表示名 <span class="required">*</span></label>
				<input type="text" id="display_name" name="display_name" required
					value="<?php echo isset($_POST['display_name']) ? esc_attr($_POST['display_name']) : ''; ?>">
				<p class="description">サイト上で表示される名前です。</p>
			</div>

			<div class="form-group">
				<label for="email">メールアドレス</label>
				<input type="email" id="email" name="email"
					value="<?php echo isset($_POST['email']) ? esc_attr($_POST['email']) : ''; ?>">
				<p class="description">メールアドレスはオプションです。パスワードを忘れた場合のリセット機能を利用する場合にのみ必要となります。</p>
			</div>

			<div class="form-group">
				<label for="password">パスワード <span class="required">*</span></label>
				<input type="password" id="password" name="password" required>
				<p class="description">8文字以上で入力してください。</p>
			</div>

			<div class="form-group">
				<button type="submit" class="lms-button">登録する</button>
			</div>

			<div class="form-links">
				<a href="<?php echo esc_url(home_url('/login/')); ?>">ログインページへ戻る</a>
			</div>
		</form>
	<?php endif; ?>
</div>

<style>
	.lms-register-container {
		max-width: 480px;
		margin: 3em auto;
		padding: 2.5em;
		background: #ffffff;
		box-shadow: 0 2px 15px rgba(0, 0, 0, 0.1);
		border-radius: 12px;
	}

	.lms-register-container h1 {
		text-align: center;
		margin-bottom: 1.8em;
		color: #333;
		font-size: 1.8em;
		font-weight: 600;
	}

	.lms-error-message {
		background: #fff3f3;
		color: #e53935;
		padding: 1em 1.2em;
		margin-bottom: 1.5em;
		border-radius: 8px;
		border-left: 4px solid #e53935;
		font-size: 0.95em;
	}

	.lms-success-message {
		background: #f1f8e9;
		color: #2e7d32;
		padding: 1.2em;
		margin-bottom: 1.5em;
		border-radius: 8px;
		border-left: 4px solid #2e7d32;
		text-align: center;
		font-size: 0.95em;
	}

	.lms-success-message a {
		color: #1b5e20;
		text-decoration: none;
		font-weight: 600;
	}

	.lms-success-message a:hover {
		text-decoration: underline;
	}

	.lms-register-form .form-group {
		margin-bottom: 1.8em;
	}

	.lms-register-form label {
		display: block;
		margin-bottom: 0.6em;
		font-weight: 500;
		color: #424242;
		font-size: 0.95em;
	}

	.lms-register-form input[type="text"],
	.lms-register-form input[type="email"],
	.lms-register-form input[type="password"] {
		width: 100%;
		padding: 0.8em 1em;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1em;
		transition: all 0.3s ease;
	}

	.lms-register-form input[type="text"]:focus,
	.lms-register-form input[type="email"]:focus,
	.lms-register-form input[type="password"]:focus {
		border-color: #2196F3;
		outline: none;
		box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
	}

	.lms-register-form .required {
		color: #e53935;
		margin-left: 0.3em;
	}

	.description {
		font-size: 0.85em;
		color: #757575;
		margin-top: 0.5em;
		line-height: 1.5;
	}

	.lms-button {
		width: 100%;
		padding: 1em;
		background: #2196F3;
		color: #fff;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-size: 1em;
		font-weight: 600;
		transition: background-color 0.3s ease;
	}

	.lms-button:hover {
		background: #1976D2;
	}

	.form-links {
		margin-top: 1.5em;
		text-align: center;
		padding-top: 1em;
		border-top: 1px solid #e0e0e0;
	}

	.form-links a {
		color: #2196F3;
		text-decoration: none;
		font-size: 0.95em;
		font-weight: 500;
	}

	.form-links a:hover {
		text-decoration: underline;
		color: #1976D2;
	}

	@media (max-width: 480px) {
		.lms-register-container {
			margin: 1em;
			padding: 1.5em;
		}
	}
</style>

<?php get_footer(); ?>
