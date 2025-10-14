<?php

/**
 * Push設定ページ
 *
 * Appleプッシュ通知サービス（APNs）の認証ファイル（証明書・秘密鍵）のアップロード設定管理画面です。
 * アップロードしたファイルはアップロードディレクトリに保存され、APNs通知送信時に利用されます。
 *
 * @package LMS Theme
 */

// 管理者権限チェック
if (! current_user_can('manage_options')) {
	wp_die(esc_html__('権限がありません。', 'lms'));
}

// 必要なファイルの読み込み（wp_handle_upload() を利用）
if (! function_exists('wp_handle_upload')) {
	require_once(ABSPATH . 'wp-admin/includes/file.php');
}

$messages = array();

// フォーム送信処理
if (isset($_POST['lms_push_settings_nonce']) && wp_verify_nonce($_POST['lms_push_settings_nonce'], 'lms_save_push_settings')) {
	// Push通知の有効/無効を保存
	$new_enabled = isset($_POST['lms_push_enabled']) ? '1' : '0';
	update_option('lms_push_enabled', $new_enabled);

	// ファイルアップロード設定
	$upload_overrides = array(
		'test_form' => false,
		'mimes' => array('pem' => 'application/x-pem-file')
	);

	// APNs証明書ファイルのアップロード処理
	if (isset($_FILES['lms_apns_certificate_file']) && $_FILES['lms_apns_certificate_file']['error'] === UPLOAD_ERR_OK) {
		$uploaded_cert = wp_handle_upload($_FILES['lms_apns_certificate_file'], $upload_overrides);
		if (isset($uploaded_cert['url'])) {
			update_option('lms_apns_certificate', $uploaded_cert['url']);
			$messages[] = __('APNs証明書ファイルがアップロードされました。', 'lms');
		} else {
			$messages[] = __('APNs証明書ファイルのアップロードに失敗しました。', 'lms');
		}
	}

	// APNs秘密鍵ファイルのアップロード処理
	if (isset($_FILES['lms_apns_key_file']) && $_FILES['lms_apns_key_file']['error'] === UPLOAD_ERR_OK) {
		$uploaded_key = wp_handle_upload($_FILES['lms_apns_key_file'], $upload_overrides);
		if (isset($uploaded_key['url'])) {
			update_option('lms_apns_key', $uploaded_key['url']);
			$messages[] = __('APNs秘密鍵ファイルがアップロードされました。', 'lms');
		} else {
			$messages[] = __('APNs秘密鍵ファイルのアップロードに失敗しました。', 'lms');
		}
	}
}

// 既存のファイルURLの取得
$push_enabled = get_option('lms_push_enabled', '0');
$vapid_public_key = get_option('lms_vapid_public_key');
$vapid_private_key = get_option('lms_vapid_private_key');
$apns_certificate_url = get_option('lms_apns_certificate', '');
$apns_key_url = get_option('lms_apns_key', '');
?>
<div class="wrap">
	<h1><?php esc_html_e('Push設定', 'lms'); ?></h1>
	<?php
	if (! empty($messages)) :
		foreach ($messages as $message) :
	?>
			<div class="updated">
				<p><?php echo esc_html($message); ?></p>
			</div>
	<?php
		endforeach;
	endif;
	?>
	<form method="post" enctype="multipart/form-data" action="">
		<?php wp_nonce_field('lms_save_push_settings', 'lms_push_settings_nonce'); ?>
		<h2><?php esc_html_e('一般設定', 'lms'); ?></h2>
		<table class="form-table">
			<tr>
				<th scope="row">Push通知</th>
				<td>
					<label class="switch">
						<input type="checkbox" name="lms_push_enabled" value="1" <?php checked('1', $push_enabled); ?>>
						<span class="slider round"></span>
					</label>
					<p class="description">Push通知の有効/無効を切り替えます。</p>
				</td>
			</tr>
		</table>

		<h2><?php esc_html_e('VAPID設定', 'lms'); ?></h2>
		<table class="form-table">
			<tr>
				<th scope="row">公開キー</th>
				<td>
					<input type="text" class="regular-text" value="<?php echo esc_attr($vapid_public_key); ?>" readonly>
				</td>
			</tr>
			<tr>
				<th scope="row">秘密キー</th>
				<td>
					<input type="text" class="regular-text" value="<?php echo esc_attr($vapid_private_key); ?>" readonly>
				</td>
			</tr>
		</table>

		<h2><?php esc_html_e('APNs設定', 'lms'); ?></h2>
		<table class="form-table">
			<tr valign="top">
				<th scope="row"><?php esc_html_e('APNs 証明書アップロード', 'lms'); ?></th>
				<td>
					<input type="file" name="lms_apns_certificate_file" accept=".pem" />
					<p class="description"><?php esc_html_e('APNsの証明書ファイル (.pem形式) をアップロードしてください。', 'lms'); ?></p>
					<?php if ($apns_certificate_url) : ?>
						<p><?php esc_html_e('現在のファイル:', 'lms'); ?>
							<a href="<?php echo esc_url($apns_certificate_url); ?>" target="_blank">
								<?php echo esc_html(basename($apns_certificate_url)); ?>
							</a>
						</p>
					<?php endif; ?>
				</td>
			</tr>
			<tr valign="top">
				<th scope="row"><?php esc_html_e('APNs 秘密鍵アップロード', 'lms'); ?></th>
				<td>
					<input type="file" name="lms_apns_key_file" accept=".pem" />
					<p class="description"><?php esc_html_e('APNsの秘密鍵ファイル (.pem形式) をアップロードしてください。', 'lms'); ?></p>
					<?php if ($apns_key_url) : ?>
						<p><?php esc_html_e('現在のファイル:', 'lms'); ?>
							<a href="<?php echo esc_url($apns_key_url); ?>" target="_blank">
								<?php echo esc_html(basename($apns_key_url)); ?>
							</a>
						</p>
					<?php endif; ?>
				</td>
			</tr>
		</table>
		<?php submit_button('設定を保存'); ?>
	</form>
</div>

<style>
	/* 既存のスタイルを保持 */
	.switch {
		position: relative;
		display: inline-block;
		width: 60px;
		height: 34px;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #ccc;
		transition: .4s;
	}

	.slider:before {
		position: absolute;
		content: "";
		height: 26px;
		width: 26px;
		left: 4px;
		bottom: 4px;
		background-color: white;
		transition: .4s;
	}

	input:checked+.slider {
		background-color: #2196F3;
	}

	input:checked+.slider:before {
		transform: translateX(26px);
	}

	.slider.round {
		border-radius: 34px;
	}

	.slider.round:before {
		border-radius: 50%;
	}
</style>
