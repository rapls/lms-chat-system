<?php

/**
 * Template Name: 新規登録
 *
 * @package LMS Theme
 */

$auth = LMS_Auth::get_instance();

if ($auth->is_logged_in()) {
	wp_redirect(home_url('/my-page/'));
	exit;
}

$error_message = '';
$success_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'register') {
	if (!isset($_POST['register_nonce']) || !wp_verify_nonce($_POST['register_nonce'], 'register_action')) {
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
			$confirm_password = $_POST['confirm_password'];
			$display_name = sanitize_text_field($_POST['display_name']);
			$email = !empty($_POST['email']) ? sanitize_email($_POST['email']) : '';

			if ($password !== $confirm_password) {
				$error_message = 'パスワードが一致しません。';
			} else {
				$result = $auth->register($username, $password, $display_name, $email);
				if ($result['success']) {
					$success_message = '登録が完了しました。';
				} else {
					$error_message = $result['message'];
				}
			}
		}
	}
}

get_header();
?>

<main id="primary" class="site-main">
	<div class="register-page">
		<h1>新規登録</h1>

		<?php if ($success_message) : ?>
			<div class="lms-success-message">
				登録が完了しました。<a href="<?php echo esc_url(home_url('/login/')); ?>">ログイン</a>してください。
			</div>
		<?php else : ?>
			<?php if (!empty($error_message)) : ?>
				<div class="register-error">
					<?php echo esc_html($error_message); ?>
				</div>
			<?php endif; ?>

			<p class="form-note">は必須項目です。</p>

			<form method="post" action="" class="lms-auth-form register-form" data-action="register">
				<?php wp_nonce_field('register_action', 'register_nonce'); ?>
				<input type="hidden" name="action" value="register">

				<div class="form-group">
					<label for="username">ユーザー名<span class="required">*</span></label>
					<input type="text" id="username" name="username" required
						value="<?php echo isset($_POST['username']) ? esc_attr($_POST['username']) : ''; ?>">
				</div>

				<div class="form-group">
					<label for="display_name">表示名<span class="required">*</span></label>
					<input type="text" id="display_name" name="display_name" required
						value="<?php echo isset($_POST['display_name']) ? esc_attr($_POST['display_name']) : ''; ?>">
					<p class="field-description">チャットやコメントで表示される名前です。</p>
				</div>

				<div class="form-group">
					<label for="email">メールアドレス</label>
					<input type="email" id="email" name="email"
						value="<?php echo isset($_POST['email']) ? esc_attr($_POST['email']) : ''; ?>">
				</div>

				<div class="form-group">
					<label for="password">パスワード<span class="required">*</span></label>
					<div class="password-field-wrapper">
						<input type="password" id="password" name="password" required>
						<button type="button" class="toggle-password" aria-label="パスワードの表示切替">
							<img class="eye-icon" src="<?php echo esc_url(get_template_directory_uri() . '/img/eye.svg'); ?>" alt="パスワードを表示">
							<img class="eye-off-icon" src="<?php echo esc_url(get_template_directory_uri() . '/img/eye-off.svg'); ?>" alt="パスワードを非表示">
						</button>
					</div>
					<div class="password-requirements">
						<ul>
							<li class="requirement" data-requirement="length">8文字以上</li>
						</ul>
					</div>
				</div>

				<div class="form-group">
					<label for="confirm_password">パスワード（確認）<span class="required">*</span></label>
					<div class="password-field-wrapper">
						<input type="password" id="confirm_password" name="confirm_password" required>
						<button type="button" class="toggle-password" aria-label="パスワードの表示切替">
							<img class="eye-icon" src="<?php echo esc_url(get_template_directory_uri() . '/img/eye.svg'); ?>" alt="パスワードを表示">
							<img class="eye-off-icon" src="<?php echo esc_url(get_template_directory_uri() . '/img/eye-off.svg'); ?>" alt="パスワードを非表示">
						</button>
					</div>
					<div class="password-match-message"></div>
				</div>

				<div class="form-group">
					<button type="submit" class="button" disabled>登録</button>
				</div>
			</form>

			<div class="back-to-login">
				<a href="<?php echo esc_url(home_url('/login/')); ?>">ログインページに戻る</a>
			</div>
		<?php endif; ?>
	</div>
</main>

<script>
	document.addEventListener('DOMContentLoaded', function() {
		const form = document.querySelector('.register-form');
		const username = document.getElementById('username');
		const displayName = document.getElementById('display_name');
		const email = document.getElementById('email');
		const password = document.getElementById('password');
		const confirmPassword = document.getElementById('confirm_password');
		const submitButton = form.querySelector('.button');
		const matchMessage = document.querySelector('.password-match-message');
		const requirements = {
			length: document.querySelector('[data-requirement="length"]')
		};

		const toggleButtons = document.querySelectorAll('.toggle-password');
		toggleButtons.forEach(function(toggleButton) {
			toggleButton.addEventListener('click', function() {
				const wrapper = this.closest('.password-field-wrapper');
				const passwordInput = wrapper.querySelector('input');
				const eyeIcon = wrapper.querySelector('.eye-icon');
				const eyeOffIcon = wrapper.querySelector('.eye-off-icon');

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

		function validateForm() {
			const isUsernameValid = username.value.trim().length > 0;
			const isDisplayNameValid = displayName.value.trim().length > 0;
			const isEmailValid = !email.value.trim() || email.checkValidity();
			const isPasswordValid = password.value.length >= 8;
			const doPasswordsMatch = password.value === confirmPassword.value;

			requirements.length.classList.toggle('valid', isPasswordValid);

			if (password.value && confirmPassword.value) {
				matchMessage.style.display = 'block';
				if (doPasswordsMatch) {
					matchMessage.textContent = 'パスワードが一致しています';
					matchMessage.className = 'password-match-message success';
				} else {
					matchMessage.textContent = 'パスワードが一致していません';
					matchMessage.className = 'password-match-message error';
				}
			} else {
				matchMessage.style.display = 'none';
			}

			submitButton.disabled = !(isUsernameValid && isDisplayNameValid && isEmailValid && isPasswordValid && doPasswordsMatch);
		}

		username.addEventListener('input', validateForm);
		displayName.addEventListener('input', validateForm);
		email.addEventListener('input', validateForm);
		password.addEventListener('input', validateForm);
		confirmPassword.addEventListener('input', validateForm);

		form.addEventListener('submit', function(e) {
			if (!password.value.length >= 8) {
				e.preventDefault();
				alert('パスワードは8文字以上で設定してください。');
				return;
			}
		});
	});
</script>

<?php get_footer(); ?>
