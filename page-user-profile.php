<?php

/**
 * Template Name: 受講者情報
 *
 * @package LMS Theme
 */

$auth = LMS_Auth::get_instance();

if (!$auth->is_logged_in()) {
	wp_redirect(home_url('/login/'));
	exit;
}

$lms_user = $auth->get_current_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_profile'])) {
	if (isset($_POST['profile_nonce']) && wp_verify_nonce($_POST['profile_nonce'], 'update_profile_action')) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_users';

		$update_data = array(
			'display_name' => sanitize_text_field($_POST['display_name']),
			'email' => sanitize_email($_POST['email']),
			'slack_channel' => sanitize_text_field($_POST['slack_channel'])
		);

		if (!empty($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
			$upload_dir = wp_upload_dir();
			$file_name = sanitize_file_name($_FILES['avatar']['name']);
			$file_path = $upload_dir['path'] . '/' . $file_name;

			if (move_uploaded_file($_FILES['avatar']['tmp_name'], $file_path)) {
				$file_url = $upload_dir['url'] . '/' . $file_name;
				$update_data['avatar_url'] = $file_url;
			}
		}

		if (!empty($_POST['new_password'])) {
			if ($_POST['new_password'] === $_POST['confirm_password']) {
				$update_data['password'] = password_hash($_POST['new_password'], PASSWORD_DEFAULT);
			} else {
				$error_message = 'パスワードが一致しません。';
			}
		}

		if (!isset($error_message)) {
			$wpdb->update(
				$table_name,
				$update_data,
				array('id' => $lms_user->id)
			);
			$success_message = '受講者情報を更新しました。';

			$lms_user = $auth->get_current_user();
		}
	}
}

get_header();
?>

<div class="user-profile-page">
	<div class="profile-container">
		<h1>受講者情報</h1>

		<?php if (isset($error_message)) : ?>
			<div class="message error"><?php echo esc_html($error_message); ?></div>
		<?php endif; ?>

		<?php if (isset($success_message)) : ?>
			<div class="message success"><?php echo esc_html($success_message); ?></div>
		<?php endif; ?>

		<form method="post" class="profile-form" enctype="multipart/form-data">
			<?php wp_nonce_field('update_profile_action', 'profile_nonce'); ?>

			<div class="form-group">
				<label for="member_number">会員番号</label>
				<input type="text" id="member_number" value="<?php echo esc_attr($lms_user->member_number); ?>" readonly>
			</div>

			<div class="form-group">
				<label for="username">ユーザー名</label>
				<input type="text" id="username" value="<?php echo esc_attr($lms_user->username); ?>" readonly>
			</div>

			<div class="form-group">
				<label>役割</label>
				<input type="text" value="<?php
																	$roles = array(
																		'student' => '受講者',
																		'teacher' => '講師',
																		'admin' => '管理者'
																	);
																	echo esc_attr($roles[$lms_user->user_type] ?? '不明');
																	?>" readonly>
			</div>

			<div class="form-group">
				<label for="display_name">表示名 <span class="required">*</span></label>
				<input type="text" id="display_name" name="display_name" value="<?php echo esc_attr($lms_user->display_name); ?>" required>
			</div>

			<div class="form-group">
				<label for="email">メールアドレス</label>
				<input type="email" id="email" name="email" value="<?php echo esc_attr($lms_user->email); ?>">
				<p class="description">メールアドレスは任意です。<br>パスワードを忘れた場合にメールアドレスが設定されていると、パスワード再設定のメールが送信されます。</p>
			</div>

			<div class="form-group">
				<label for="new_password">新しいパスワード</label>
				<input type="password" id="new_password" name="new_password" minlength="8">
				<p class="description">変更する場合のみ入力してください（8文字以上）</p>
			</div>

			<div class="form-group">
				<label for="confirm_password">パスワード（確認）</label>
				<input type="password" id="confirm_password" name="confirm_password" minlength="8">
			</div>

			<div class="form-group avatar-group">
				<label for="avatar" class="avatar-preview">
					<img src="<?php echo esc_url(lms_get_user_avatar_url($lms_user->id)); ?>" alt="プロフィール画像">
				</label>
				<div class="avatar-upload">
					<input type="file" name="avatar" id="avatar" accept="image/*">
					<p class="description">
						クリックして画像をアップロード<br>
						対応形式：JPG, PNG（2MB以内）
					</p>
				</div>
			</div>

			<div class="form-group">
				<label for="slack_channel">Slackチャンネル名</label>
				<input type="text" id="slack_channel" name="slack_channel" value="<?php echo esc_attr($lms_user->slack_channel); ?>">
				<p class="description">
					Slackのチャンネル名を入力してください<br>
					・チャンネルの場合：general, 質問部屋（#は不要）<br>
					・DMの場合：@ユーザー名
				</p>
			</div>

			<div class="form-group">
				<label>最終ログイン日時</label>
				<input type="text" value="<?php echo esc_attr(
																		$lms_user->last_login
																			? wp_date('Y年n月j日 H:i', strtotime($lms_user->last_login))
																			: '未ログイン'
																	); ?>" readonly>
			</div>

			<div class="form-group">
				<button type="submit" name="update_profile" class="submit-button">
					<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-update.svg'); ?>" alt="更新">
					更新する
				</button>
				<a href="<?php echo esc_url(home_url('/my-page/')); ?>" class="mypage-button">
					<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-home.svg'); ?>" alt="マイページ">
					マイページ
				</a>
			</div>
		</form>
	</div>
</div>

<script>
	document.addEventListener('DOMContentLoaded', function() {
		const input = document.getElementById('avatar');
		const preview = document.querySelector('.avatar-preview img');
		const previewLabel = document.querySelector('.avatar-preview');

		previewLabel.addEventListener('click', function() {
			input.click();
		});

		input.addEventListener('change', function() {
			if (this.files && this.files[0]) {
				if (this.files[0].size > 2 * 1024 * 1024) {
					alert('ファイルサイズは2MB以内にしてください。');
					this.value = '';
					return;
				}

				const reader = new FileReader();
				reader.onload = function(e) {
					preview.src = e.target.result;
				};
				reader.readAsDataURL(this.files[0]);
			}
		});
	});
</script>

<?php get_footer(); ?>
