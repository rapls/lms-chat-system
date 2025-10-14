<?php

/**
 * Template Name: パスワードリセット
 *
 * @package LMS Theme
 */

$auth = LMS_Auth::get_instance();

if (isset($_GET['token'])) {
	include(get_template_directory() . '/template-parts/content-reset-password-form.php');
	return;
}

get_header();
?>

<main id="primary" class="site-main">
	<div class="reset-password-page">
		<h1 class="page-title">パスワードリセット</h1>

		<p class="form-description">
			パスワードをリセットするには、ユーザー名とメールアドレスを入力してください。<br>
			リセット用のリンクをメールでお送りします。
		</p>

		<!-- パスワードリセットリクエストフォーム -->
		<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
			id="reset-password-form" class="lms-auth-form" data-action="reset-password">
			<input type="hidden" name="action" value="reset_password_request">
			<?php wp_nonce_field('reset_password_request_action', 'reset_password_request_nonce'); ?>

			<div class="form-group">
				<label for="username">ユーザー名</label>
				<input type="text" id="username" name="username" required>
			</div>

			<div class="form-group">
				<label for="email">メールアドレス</label>
				<input type="email" id="email" name="email" required>
			</div>

			<div class="button-group">
				<button type="submit" class="button">リセットメールを送信</button>
			</div>
		</form>

		<div class="back-to-login">
			<a href="<?php echo esc_url(home_url('/login/')); ?>">ログインページに戻る</a>
		</div>
	</div>
</main>

<script>
	document.addEventListener('DOMContentLoaded', function() {
		const form = document.getElementById('reset-password-form');
		if (form) {
			const newPassword = document.getElementById('new_password');
			const confirmPassword = document.getElementById('confirm_password');
			const submitButton = form.querySelector('.button');
			const matchMessage = document.querySelector('.password-match-message');

			function validatePasswords() {
				const isLengthValid = newPassword.value.length >= 8;
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

				submitButton.disabled = !isLengthValid || !doPasswordsMatch;
			}

			newPassword.addEventListener('input', validatePasswords);
			confirmPassword.addEventListener('input', validatePasswords);

			form.addEventListener('submit', function(e) {
				e.preventDefault();

				if (!newPassword.value.length >= 8) {
					alert('パスワードは8文字以上で設定してください。');
					return;
				}

				form.submit();
			});
		}
	});
</script>

<?php get_footer(); ?>
