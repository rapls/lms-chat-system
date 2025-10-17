<?php

/**
 * チャットのファイルアップロード機能を管理するクラス
 */

if (!defined('ABSPATH')) {
	exit;
}

class LMS_Chat_Upload
{
	private static $instance = null;
	private $upload_dir;
	private $allowed_types;
	private $max_file_size;

	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct()
	{
		// wp-contentディレクトリ直下にアップロード
		$this->upload_dir = ABSPATH . 'wp-content/chat-files-uploads';

		if (!file_exists($this->upload_dir)) {
			wp_mkdir_p($this->upload_dir);
			file_put_contents($this->upload_dir . '/index.php', '<?php // Silence is golden');
			file_put_contents($this->upload_dir . '/.htaccess', "Order deny,allow\nDeny from all");
		}

		$this->allowed_types = array(
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'image/avif',
			'image/heic',
			'image/heif',
			'image/bmp',
			'image/tiff',
			'image/svg+xml',
			'application/x-font-ttf',
			'application/x-font-truetype',
			'font/ttf',
			'font/woff',
			'font/woff2',
			'application/x-photoshop',
			'image/vnd.adobe.photoshop',
			'application/illustrator',
			'application/x-illustrator',
			'application/vnd.adobe.xd',
			'application/postscript',
			'application/eps',
			'image/x-eps',
			'application/x-psb',
			'application/vnd.ms-powerpoint',
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			'application/vnd.oasis.opendocument.spreadsheet',
			'application/vnd.ms-project',
			'application/x-project',
			'application/x-ini',
			'text/plain',  // .ini ファイルもtext/plainとして扱われることがある
			'application/x-mspublisher',
			'text/markdown',
			'text/html',
			'text/css',
			'text/javascript',
			'application/javascript',
			'text/x-php',
			'application/x-httpd-php',
			'text/x-sql',
			'text/scss',
			'text/x-c',
			'text/x-java',
			'text/x-python',
			'text/x-shellscript',
			'text/x-typescript',
			'text/xml',
			'text/x-c++',
			'text/x-csharp',
			'text/x-cobol',
			'application/json',
			'text/csv',
			'application/x-yaml',
			'application/yaml',
			'video/mp4',
			'video/mpeg',
			'video/mpeg2',
			'video/quicktime',
			'video/x-msvideo',
			'video/h264',
			'video/h265',
			'video/x-divx',
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/zip',
			'application/x-gzip',
			'audio/mpeg',
			'audio/aac',
			'application/x-rar-compressed',
			'application/x-7z-compressed',
			'application/x-tar',
			'application/gzip',
			'application/x-bzip2',
			'application/x-xz',
			'application/x-lzma',
		);

		$this->max_file_size = 100 * 1024 * 1024;

		add_action('wp_ajax_lms_upload_file', array($this, 'handle_file_upload'));
		add_action('wp_ajax_lms_get_file', array($this, 'handle_file_download'));
		add_action('wp_ajax_lms_delete_file', array($this, 'handle_file_delete'));
		add_action('wp_ajax_lms_cleanup_orphaned_files', array($this, 'handle_cleanup_orphaned_files'));
	}

	/**
	 * ファイルアップロードの処理
	 */
	public function handle_file_upload()
	{
		check_ajax_referer('lms_ajax_nonce', 'nonce');

		if (!isset($_FILES['file'])) {
			wp_send_json_error('ファイルが送信されていません。');
			return;
		}

		$file = $_FILES['file'];
		
		// セッションの開始を確認
		if (session_status() === PHP_SESSION_NONE) {
			session_start();
		}
		$user_id = isset($_SESSION['lms_user_id']) ? (int)$_SESSION['lms_user_id'] : 0;

		if (!$this->validate_file($file)) {
			wp_send_json_error('無効なファイルです。');
			return;
		}

		$result = $this->save_file($file, $user_id);
		if (is_wp_error($result)) {
			wp_send_json_error($result->get_error_message());
			return;
		}

		wp_send_json_success($result);
	}

	/**
	 * ファイルのバリデーション
	 */
	private function validate_file($file)
	{
		if ($file['size'] > $this->max_file_size) {
			return false;
		}

		$finfo = finfo_open(FILEINFO_MIME_TYPE);
		$mime_type = finfo_file($finfo, $file['tmp_name']);
		finfo_close($finfo);

		if (!in_array($mime_type, $this->allowed_types)) {
			return false;
		}

		return true;
	}

	/**
	 * ファイルの保存
	 */
	private function save_file($file, $user_id)
	{
		global $wpdb;

		$year_month = date('Y/m');
		$upload_path = $this->upload_dir . '/' . $year_month;
		if (!file_exists($upload_path)) {
			wp_mkdir_p($upload_path);
		}

		$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
		$unique_filename = uniqid() . '_' . $user_id . '.' . $ext;
		$relative_path = $year_month . '/' . $unique_filename;
		$file_path = $this->upload_dir . '/' . $relative_path;

		if (!move_uploaded_file($file['tmp_name'], $file_path)) {
			return new WP_Error('upload_failed', 'ファイルの保存に失敗しました。');
		}

		$mime_type = mime_content_type($file_path);
		$thumbnail_path = null;

		if ($mime_type === 'image/svg+xml' || strtolower($ext) === 'svg') {
			$thumbnail_path = $relative_path;
		} elseif (strpos($mime_type, 'image/') === 0) {
			$thumbnail_path = $this->create_thumbnail($file_path, $mime_type);
		}

		$wpdb->insert(
			$wpdb->prefix . 'lms_chat_attachments',
			array(
				'user_id' => $user_id,
				'file_name' => $file['name'],
				'file_path' => $relative_path,
				'file_type' => $ext,
				'file_size' => $file['size'],
				'mime_type' => $mime_type,
				'thumbnail_path' => $thumbnail_path,
				'created_at' => current_time('mysql')
			),
			array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s')
		);

		$file_id = $wpdb->insert_id;

		$thumbnail_url = null;
		if ($thumbnail_path) {
			$thumbnail_url = site_url('wp-content/chat-files-uploads/' . $thumbnail_path);
		}

		return array(
			'id' => $file_id,
			'name' => $file['name'],
			'size' => $file['size'],
			'type' => $mime_type,
			'url' => site_url('wp-content/chat-files-uploads/' . $relative_path),
			'thumbnail' => $thumbnail_url,
			'icon' => $this->get_file_type_icon($mime_type, $ext)
		);
	}

	/**
	 * 画像のサムネイルを生成
	 */
	private function create_thumbnail($source_path, $mime_type)
	{
		$max_size = 300;

		list($orig_width, $orig_height) = getimagesize($source_path);

		if ($orig_width > $orig_height) {
			if ($orig_width > $max_size) {
				$new_width = $max_size;
				$new_height = floor($orig_height * ($max_size / $orig_width));
			} else {
				$new_width = $orig_width;
				$new_height = $orig_height;
			}
		} else {
			if ($orig_height > $max_size) {
				$new_height = $max_size;
				$new_width = floor($orig_width * ($max_size / $orig_height));
			} else {
				$new_width = $orig_width;
				$new_height = $orig_height;
			}
		}

		$new_image = imagecreatetruecolor($new_width, $new_height);

		// PNG, WebP, AVIFは透明度をサポート
		if (in_array($mime_type, ['image/png', 'image/webp', 'image/avif'])) {
			imagealphablending($new_image, false);
			imagesavealpha($new_image, true);
			$transparent = imagecolorallocatealpha($new_image, 255, 255, 255, 127);
			imagefilledrectangle($new_image, 0, 0, $new_width, $new_height, $transparent);
		}

		switch ($mime_type) {
			case 'image/jpeg':
				$source = imagecreatefromjpeg($source_path);
				break;
			case 'image/png':
				$source = imagecreatefrompng($source_path);
				break;
			case 'image/gif':
				$source = imagecreatefromgif($source_path);
				break;
			case 'image/webp':
				if (function_exists('imagecreatefromwebp')) {
					$source = imagecreatefromwebp($source_path);
				} else {
					return false;
				}
				break;
			case 'image/avif':
				if (function_exists('imagecreatefromavif')) {
					$source = imagecreatefromavif($source_path);
				} else {
					return false;
				}
				break;
			default:
				return false;
		}

		imagecopyresampled(
			$new_image,
			$source,
			0,
			0,
			0,
			0,
			$new_width,
			$new_height,
			$orig_width,
			$orig_height
		);

		$path_info = pathinfo($source_path);
		$thumb_filename = 'thumb_' . $path_info['filename'] . '.png';
		$thumb_path = $path_info['dirname'] . '/' . $thumb_filename;

		imagepng($new_image, $thumb_path);

		imagedestroy($new_image);
		imagedestroy($source);

		$relative_path = str_replace($this->upload_dir . '/', '', $thumb_path);
		return $relative_path;
	}

	/**
	 * ファイルタイプに応じたアイコンのパスを取得
	 */
	private function get_file_type_icon($mime_type, $extension)
	{
		$theme_url = get_template_directory_uri();

		switch (true) {
			case strpos($mime_type, 'image/') === 0:
				return $theme_url . '/img/icon-image.svg';
			case strpos($mime_type, 'video/') === 0:
				return $theme_url . '/img/icon-video.svg';
			case strpos($mime_type, 'audio/') === 0:
				return $theme_url . '/img/icon-audio.svg';
			case $mime_type === 'application/pdf':
				return $theme_url . '/img/icon-pdf.svg';
			case strpos($mime_type, 'application/msword') === 0 ||
				strpos($mime_type, 'application/vnd.openxmlformats-officedocument.wordprocessingml') === 0:
				return $theme_url . '/img/icon-doc.svg';
			case strpos($mime_type, 'application/vnd.ms-excel') === 0 ||
				strpos($mime_type, 'application/vnd.openxmlformats-officedocument.spreadsheetml') === 0:
				return $theme_url . '/img/icon-xls.svg';
			case $extension === 'zip' || $extension === 'gz':
				return $theme_url . '/img/icon-archive.svg';
			default:
				return $theme_url . '/img/icon-file.svg';
		}
	}

	/**
	 * ファイルのダウンロード処理
	 */
	public function handle_file_download()
	{
		check_ajax_referer('lms_ajax_nonce', 'nonce');

		$file_id = isset($_GET['file_id']) ? (int)$_GET['file_id'] : 0;
		if (!$file_id) {
			wp_send_json_error('ファイルIDが指定されていません。');
			return;
		}

		global $wpdb;
		$file = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments WHERE id = %d",
			$file_id
		));

		if (!$file) {
			wp_send_json_error('ファイルが見つかりません。');
			return;
		}

		$file_path = $this->upload_dir . '/' . $file->file_path;
		if (!file_exists($file_path)) {
			wp_send_json_error('ファイルが存在しません。');
			return;
		}

		header('Content-Type: ' . $file->mime_type);
		header('Content-Disposition: attachment; filename="' . $file->file_name . '"');
		header('Content-Length: ' . filesize($file_path));
		readfile($file_path);
		exit;
	}

	/**
	 * ファイルの削除処理
	 */
	public function handle_file_delete()
	{
		check_ajax_referer('lms_ajax_nonce', 'nonce');

		$file_id = isset($_POST['file_id']) ? (int)$_POST['file_id'] : 0;
		
		// セッションの開始を確認
		if (session_status() === PHP_SESSION_NONE) {
			session_start();
		}
		$user_id = isset($_SESSION['lms_user_id']) ? (int)$_SESSION['lms_user_id'] : 0;

		if (!$file_id || !$user_id) {
			wp_send_json_error('無効なリクエストです。');
			return;
		}

		global $wpdb;
		$file = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
            WHERE id = %d AND user_id = %d",
			$file_id,
			$user_id
		));

		if (!$file) {
			wp_send_json_error('ファイルが見つからないか、削除権限がありません。');
			return;
		}

		$file_path = $this->upload_dir . '/' . $file->file_path;
		if (file_exists($file_path)) {
			unlink($file_path);
		}

		if ($file->thumbnail_path) {
			$thumb_path = $this->upload_dir . '/' . $file->thumbnail_path;
			if (file_exists($thumb_path)) {
				unlink($thumb_path);
			}
		}

		// ソフトデリート
		$wpdb->update(
			$wpdb->prefix . 'lms_chat_attachments',
			array('deleted_at' => current_time('mysql')),
			array('id' => $file_id),
			array('%s'),
			array('%d')
		);

		wp_send_json_success();
	}

	/**
	 * ファイルのURL取得
	 */
	public function get_file_url($filename)
	{
		return site_url('wp-content/chat-files-uploads/' . $filename);
	}

	/**
	 * ファイルの詳細情報を取得
	 */
	public function get_file_info($file_id)
	{
		global $wpdb;
		return $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments WHERE id = %d",
			$file_id
		));
	}

	/**
	 * ファイルのクリーンアップ処理
	 */
	public function handle_cleanup_orphaned_files()
	{
		check_ajax_referer('lms_ajax_nonce', 'nonce');

		$user_id = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
		$file_ids = isset($_POST['file_ids']) ? json_decode(stripslashes($_POST['file_ids']), true) : [];
		$cleanup_all = isset($_POST['cleanup_all']) && $_POST['cleanup_all'] === '1';
		$is_unload = isset($_POST['is_unload']) && $_POST['is_unload'] === '1';

		if (!$user_id) {
			wp_send_json_error('Invalid user ID');
			return;
		}

		global $wpdb;
		$success_count = 0;
		$error_count = 0;

		try {
			if ($cleanup_all) {
				$query = $wpdb->prepare(
					"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
					WHERE user_id = %d
					AND message_id IS NULL",
					$user_id
				);
				$files = $wpdb->get_results($query);
			} elseif (!empty($file_ids)) {
				$placeholders = array_fill(0, count($file_ids), '%d');
				$query = $wpdb->prepare(
					"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
					WHERE id IN (" . implode(',', $placeholders) . ")
					AND user_id = %d
					AND message_id IS NULL",
					array_merge($file_ids, [$user_id])
				);
				$files = $wpdb->get_results($query);
			}

			if (!empty($files)) {
				foreach ($files as $file) {
					$file_path = $this->upload_dir . '/' . $file->file_path;
					if (file_exists($file_path)) {
						unlink($file_path);
					}

					if ($file->thumbnail_path && $file->thumbnail_path !== $file->file_path) {
						$thumb_path = $this->upload_dir . '/' . $file->thumbnail_path;
						if (file_exists($thumb_path)) {
							unlink($thumb_path);
						}
					}

					// ソフトデリート
					$wpdb->update(
						$wpdb->prefix . 'lms_chat_attachments',
						array('deleted_at' => current_time('mysql')),
						array('id' => $file->id),
						array('%s'),
						array('%d')
					);

					$success_count++;
				}
			}

			if ($is_unload) {
				exit;
			}

			wp_send_json_success([
				'success_count' => $success_count,
				'error_count' => $error_count
			]);
		} catch (Exception $e) {
			if (!$is_unload) {
				wp_send_json_error([
					'success_count' => $success_count,
					'error_count' => $error_count + 1
				]);
			}
			exit;
		}
	}
}

LMS_Chat_Upload::get_instance();
