<?php

/**
 * 新しいパスワード設定フォームのテンプレート
 *
 * @package LMS Theme
 */

get_header();

// reCAPTCHAのサイトキーを取得
$recaptcha_site_key = get_option('recaptcha_site_key', '');

// トークンの検証
$token = isset($_GET['token']) ? sanitize_text_field($_GET['token']) : '';
$auth = LMS_Auth::get_instance();

if (!$auth->verify_reset_token($token)) {
?>
	<div class="reset-password-page">
		<h1 class="page-title">リンクの有効期限が切れています</h1>
		<p class="error-message">
			パスワードリセット用のリンクの有効期限が切れているか、無効なリンクです。<br>
			もう一度パスワードリセットをお試しください。
		</p>
		<div class="button-group">
			<a href="<?php echo esc_url(home_url('/reset-password/')); ?>" class="button">
				パスワードリセットをやり直す
			</a>
		</div>
	</div>
<?php
	get_footer();
	return;
}
?>

<div class="reset-password-page">
	<h1 class="page-title">新しいパスワードの設定</h1>

	<p class="form-description">
		新しいパスワードを設定してください。<br>
		パスワードは8文字以上で設定してください。
	</p>

	<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" id="new-password-form">
		<input type="hidden" name="action" value="reset_password">
		<?php wp_nonce_field('reset_password_action', 'reset_password_nonce'); ?>
		<input type="hidden" name="token" value="<?php echo esc_attr($token); ?>">
		<input type="hidden" name="recaptcha_response" id="recaptchaResponse">

		<div class="form-group">
			<label for="new_password">新しいパスワード</label>
			<div class="password-input-wrapper">
				<input type="password" id="new_password" name="new_password" required>
				<button type="button" class="toggle-password" aria-label="パスワードの表示切替">
					<span class="dashicons dashicons-visibility"></span>
				</button>
			</div>
			<div class="password-requirements">
				<ul>
					<li class="requirement" data-requirement="length">8文字以上</li>
				</ul>
			</div>
		</div>

		<div class="form-group">
			<label for="confirm_password">パスワード（確認）</label>
			<div class="password-input-wrapper">
				<input type="password" id="confirm_password" name="confirm_password" required>
				<button type="button" class="toggle-password" aria-label="パスワードの表示切替">
					<span class="dashicons dashicons-visibility"></span>
				</button>
			</div>
			<div class="password-match-message"></div>
		</div>

		<div class="button-group">
			<button type="submit" class="button" disabled>パスワードを更新</button>
		</div>
	</form>

	<div class="back-to-login">
		<a href="<?php echo esc_url(home_url('/login/')); ?>">ログインページに戻る</a>
	</div>
</div>

<script>
	document.addEventListener('DOMContentLoaded', function() {
		const form = document.getElementById('new-password-form');
		const newPassword = document.getElementById('new_password');
		const confirmPassword = document.getElementById('confirm_password');
		const submitButton = form.querySelector('.button');
		const matchMessage = document.querySelector('.password-match-message');
		const requirements = {
			length: document.querySelector('[data-requirement="length"]')
		};

		// パスワードの表示/非表示切り替え
		document.querySelectorAll('.toggle-password').forEach(button => {
			button.addEventListener('click', function() {
				const input = this.parentElement.querySelector('input');
				const icon = this.querySelector('.dashicons');

				if (input.type === 'password') {
					input.type = 'text';
					icon.classList.remove('dashicons-visibility');
					icon.classList.add('dashicons-hidden');
				} else {
					input.type = 'password';
					icon.classList.remove('dashicons-hidden');
					icon.classList.add('dashicons-visibility');
				}
			});
		});

		function validatePassword() {
			const password = newPassword.value;
			const isLengthValid = password.length >= 8;

			// 要件のチェック
			requirements.length.classList.toggle('valid', isLengthValid);

			return isLengthValid;
		}

		function validatePasswords() {
			const isValid = validatePassword();
			const doPasswordsMatch = newPassword.value === confirmPassword.value;

			if (newPassword.value && confirmPassword.value) {
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

			submitButton.disabled = !isValid || !doPasswordsMatch;
		}

		newPassword.addEventListener('input', validatePasswords);
		confirmPassword.addEventListener('input', validatePasswords);

		form.addEventListener('submit', function(e) {
			e.preventDefault();

			if (!validatePassword()) {
				alert('パスワードは8文字以上で設定してください。');
				return;
			}

			<?php if ($recaptcha_site_key): ?>
				if (typeof grecaptcha !== 'undefined') {
					grecaptcha.ready(function() {
						grecaptcha.execute('<?php echo esc_attr($recaptcha_site_key); ?>', {
							action: 'reset_password'
						}).then(function(token) {
							document.getElementById('recaptchaResponse').value = token;
							form.submit();
						});
					});
				} else {
					form.submit();
				}
			<?php else: ?>
				form.submit();
			<?php endif; ?>
		});
	});
</script>

<?php get_footer(); ?>
