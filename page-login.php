<?php

/**
 * Template Name: ログインページ
 *
 * @package LMS Theme
 */

if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
	$unique_session_name = 'LMS_SESSION_' . substr(md5($_SERVER['HTTP_HOST']), 0, 8);
	session_name($unique_session_name);
	
	ini_set('session.cookie_httponly', '1');
	ini_set('session.use_only_cookies', '1');
	ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? '1' : '0');
	ini_set('session.gc_maxlifetime', '3600');
	ini_set('session.cookie_lifetime', '0');
	
	ini_set('session.cookie_path', '/');
	ini_set('session.entropy_length', '32');
	ini_set('session.hash_function', 'sha256');
	ini_set('session.use_trans_sid', '0');
	
	session_start();
}
$auth = LMS_Auth::get_instance();

$saved_username = '';
$remember_me = false;
$cookie_name = 'lms_remember_login';

if (!$auth->is_logged_in() && isset($_COOKIE[$cookie_name])) {
	$cookie_data = json_decode(stripslashes($_COOKIE[$cookie_name]), true);
	if (isset($cookie_data['username']) && isset($cookie_data['token'])) {
		$result = $auth->login_with_cookie($cookie_data['username'], $cookie_data['token']);
		if ($result['success']) {
			$redirect_url = isset($result['redirect_url']) ? $result['redirect_url'] : home_url('/my-page/');
			wp_redirect($redirect_url);
			exit;
		} else {
			setcookie($cookie_name, '', time() - 3600, '/', '', true, true);
			$saved_username = $cookie_data['username'];
		}
	}
}

if ($auth->is_logged_in()) {
	$current_user = $auth->get_current_user();
	if ($current_user && !empty($current_user->redirect_page)) {
		wp_safe_redirect(get_permalink($current_user->redirect_page));
		exit;
	}
	wp_safe_redirect(home_url('/my-page/'));
	exit;
}

$error_message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'login') {
	if (!isset($_POST['login_nonce']) || !wp_verify_nonce($_POST['login_nonce'], 'login_action')) {
		$error_message = 'セキュリティチェックに失敗しました。';
	} else {
		$validation = array('success' => true);
		$recaptcha = LMS_ReCAPTCHA::get_instance();
		$validation = $recaptcha->validate_recaptcha($validation);

		if (!$validation['success']) {
			$error_message = isset($validation['errors'][0]) ? $validation['errors'][0] : 'reCAPTCHAの検証に失敗しました。';
		} else {
			$username = sanitize_user($_POST['username']);
			$password = $_POST['password'];
			$remember = isset($_POST['remember_me']) ? true : false;

			$result = $auth->login($username, $password);

			if ($result['success']) {
				if ($remember && isset($result['user']->id)) {
					$token = $auth->generate_login_token($result['user']->id);

					if ($token) {
						$cookie_data = array(
							'username' => $username,
							'token' => $token
						);

						setcookie(
							$cookie_name,
							json_encode($cookie_data),
							time() + (30 * 24 * 60 * 60),
							'/',
							'',
							true,
							true
						);
					}
				}

				$redirect_url = isset($result['redirect_url']) ? $result['redirect_url'] : home_url('/my-page/');

				wp_redirect($redirect_url);
				exit;
			} else {
				$error_message = $result['message'];
			}
		}
	}
}

get_header();
?>

<main id="primary" class="site-main">
	<div class="lms-login-container">
		<h1>ログイン</h1>

		<?php if ($error_message) : ?>
			<div class="lms-error-message">
				<?php echo esc_html($error_message); ?>
			</div>
		<?php endif; ?>

		<form method="post" action="<?php echo esc_url($_SERVER['REQUEST_URI']); ?>"
			class="lms-auth-form lms-login-form" data-action="login">
			<?php wp_nonce_field('login_action', 'login_nonce'); ?>
			<input type="hidden" name="action" value="login">

			<div class="form-group">
				<label for="username">ユーザー名</label>
				<input type="text" id="username" name="username" required
					value="<?php echo !empty($saved_username) ? esc_attr($saved_username) : (isset($_POST['username']) ? esc_attr($_POST['username']) : ''); ?>">
			</div>

			<div class="form-group">
				<label for="password">パスワード</label>
				<div class="password-field-wrapper">
					<input type="password" id="password" name="password" required>
					<button type="button" class="toggle-password" aria-label="パスワードの表示切替">
						<img class="eye-icon" src="<?php echo esc_url(get_template_directory_uri() . '/img/eye.svg'); ?>" alt="パスワードを表示">
						<img class="eye-off-icon" src="<?php echo esc_url(get_template_directory_uri() . '/img/eye-off.svg'); ?>" alt="パスワードを非表示">
					</button>
				</div>
			</div>

			<div class="form-group remember-me-wrapper">
				<label class="checkbox-container">
					<input type="checkbox" name="remember_me" id="remember_me" <?php echo $remember_me ? 'checked' : ''; ?>>
					<span class="checkmark"></span>
					<span class="checkbox-label">ログイン情報を保存する(30日間)</span>
				</label>
			</div>

			<div class="form-group">
				<button type="submit" class="button">ログイン</button>
			</div>

			<div class="form-links">
				<a href="<?php echo esc_url(home_url('/register/')); ?>">新規登録</a>
				<a href="<?php echo esc_url(home_url('/reset-password/')); ?>">パスワードを忘れた方</a>
			</div>
		</form>
	</div>
</main>

<script>
	document.addEventListener('DOMContentLoaded', function() {
		const togglePassword = document.querySelector('.toggle-password');
		const passwordInput = document.querySelector('#password');
		const eyeIcon = document.querySelector('.eye-icon');
		const eyeOffIcon = document.querySelector('.eye-off-icon');

		togglePassword.addEventListener('click', function() {
			const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
			passwordInput.setAttribute('type', type);

			if (type === 'password') {
				eyeIcon.style.display = 'block';
				eyeOffIcon.style.display = 'none';
			} else {
				eyeIcon.style.display = 'none';
				eyeOffIcon.style.display = 'block';
			}
		});
	});
</script>

<?php get_footer(); ?>
