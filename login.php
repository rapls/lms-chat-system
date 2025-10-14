<?php

/**
 * ログインページテンプレート
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
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'login') {
	if (!isset($_POST['login_nonce']) || !wp_verify_nonce($_POST['login_nonce'], 'login_action')) {
		$error = '不正なアクセスです。';
	} else {
		$username = sanitize_user($_POST['username']);
		$password = $_POST['password'];

		$result = $auth->login($username, $password);
		if ($result['success']) {
			$user = $result['user'];
			if (!empty($user->redirect_page)) {
				wp_redirect(get_permalink($user->redirect_page));
				exit;
			}
			wp_redirect(home_url());
			exit;
		} else {
			$error = $result['message'];
		}
	}
}
?>

<div class="lms-login-container">
	<h1>ログイン</h1>

	<?php if (!empty($error)) : ?>
		<div class="lms-error-message">
			<?php echo esc_html($error); ?>
		</div>
	<?php endif; ?>

	<form method="post" action="" class="lms-login-form">
		<?php wp_nonce_field('login_action', 'login_nonce'); ?>
		<input type="hidden" name="action" value="login">

		<div class="form-group">
			<label for="username">ユーザー名 <span class="required">*</span></label>
			<input type="text" id="username" name="username" required
				value="<?php echo isset($_POST['username']) ? esc_attr($_POST['username']) : ''; ?>">
		</div>

		<div class="form-group">
			<label for="password">パスワード <span class="required">*</span></label>
			<input type="password" id="password" name="password" required>
		</div>

		<div class="form-group">
			<button type="submit" class="lms-button">ログイン</button>
		</div>

		<div class="form-links">
			<a href="<?php echo esc_url(home_url('/register/')); ?>">新規登録</a>
			<a href="<?php echo esc_url(home_url('/reset-password/')); ?>">パスワードを忘れた方</a>
		</div>
	</form>
</div>

<style>
	.lms-login-container {
		max-width: 480px;
		margin: 3em auto;
		padding: 2.5em;
		background: #ffffff;
		box-shadow: 0 2px 15px rgba(0, 0, 0, 0.1);
		border-radius: 12px;
	}

	.lms-login-container h1 {
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

	.lms-login-form .form-group {
		margin-bottom: 1.8em;
	}

	.lms-login-form label {
		display: block;
		margin-bottom: 0.6em;
		font-weight: 500;
		color: #424242;
		font-size: 0.95em;
	}

	.lms-login-form input[type="text"],
	.lms-login-form input[type="password"] {
		width: 100%;
		padding: 0.8em 1em;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1em;
		transition: all 0.3s ease;
	}

	.lms-login-form input[type="text"]:focus,
	.lms-login-form input[type="password"]:focus {
		border-color: #2196F3;
		outline: none;
		box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
	}

	.lms-login-form .required {
		color: #e53935;
		margin-left: 0.3em;
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
		margin: 0 1em;
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
		.lms-login-container {
			margin: 1em;
			padding: 1.5em;
		}
	}
</style>

<?php get_footer(); ?>
