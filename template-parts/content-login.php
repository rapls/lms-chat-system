<?php

/**
 * ログインフォームのテンプレート
 *
 * @package LMS Theme
 */

// ログインフォームの処理
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login_nonce']) && wp_verify_nonce($_POST['login_nonce'], 'login_action')) {
	$username = sanitize_user($_POST['username']);
	$password = $_POST['password'];

	$auth = LMS_Auth::get_instance();
	$result = $auth->login($username, $password);

	if ($result['success']) {
		// ログイン成功時はマイページにリダイレクト
		wp_redirect($result['redirect_url']);
		exit;
	} else {
		$error_message = $result['message'];
	}
}
?>

<div class="login-form-container">
	<h1><?php esc_html_e('ログイン', 'lms-theme'); ?></h1>

	<?php if (isset($error_message)) : ?>
		<div class="login-error">
			<?php echo esc_html($error_message); ?>
		</div>
	<?php endif; ?>

	<form class="login-form" method="post" action="">
		<?php wp_nonce_field('login_action', 'login_nonce'); ?>

		<div class="form-group">
			<label for="username"><?php esc_html_e('ユーザー名', 'lms-theme'); ?></label>
			<input type="text" id="username" name="username" required>
		</div>

		<div class="form-group">
			<label for="password"><?php esc_html_e('パスワード', 'lms-theme'); ?></label>
			<input type="password" id="password" name="password" required>
		</div>

		<button type="submit" class="button button-primary"><?php esc_html_e('ログイン', 'lms-theme'); ?></button>
	</form>

	<div class="login-links">
		<a href="<?php echo esc_url(home_url('/register/')); ?>"><?php esc_html_e('新規登録', 'lms-theme'); ?></a>
		<span class="separator">|</span>
		<a href="<?php echo esc_url(home_url('/reset-password/')); ?>"><?php esc_html_e('パスワードを忘れた方', 'lms-theme'); ?></a>
	</div>
</div>
