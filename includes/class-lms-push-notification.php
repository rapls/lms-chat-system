<?php

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

/**
 * プッシュ通知機能を管理するクラス
 *
 * @package LMS Theme
 */

class LMS_Push_Notification
{
	private static $instance = null;
	private $webPush = null;

	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	protected function __construct()
	{
		if ($this->is_enabled()) {
			$this->init();
		}
	}

	/**
	 * プッシュ通知が有効かどうかを確認
	 */
	public function is_enabled()
	{
		return get_option('lms_push_notifications_enabled', 'yes') === 'yes';
	}

	/**
	 * 初期化処理
	 */
	private function init()
	{
		$push_enabled = get_option('lms_push_notifications_enabled', 'yes');

		if ($push_enabled !== 'yes') {
			return;
		}

		$this->copy_service_worker();

		add_action('wp_ajax_lms_save_push_subscription', array($this, 'handle_save_subscription'));

		add_action('wp_enqueue_scripts', array($this, 'enqueue_push_scripts'));

		$vapid_keys = $this->get_vapid_keys();
		if (!$vapid_keys) {
			$vapid_keys = $this->generate_vapid_keys();
		}

		add_action('init', array($this, 'fix_lms_users'), 20);
	}

	/**
	 * Service Workerファイルをコピーする
	 */
	private function copy_service_worker()
	{
		$source = get_template_directory() . '/js/service-worker.js';
		$destination = ABSPATH . 'service-worker.js';

		if (!file_exists($source)) {
			return false;
		}

		if (!file_exists($destination) || filemtime($source) > filemtime($destination)) {
			$destination_dir = dirname($destination);
			if (!file_exists($destination_dir)) {
				wp_mkdir_p($destination_dir);
			}

			if (!copy($source, $destination)) {
				return false;
			}

			@chmod($destination, 0644);
			return true;
		}

		return true;
	}

	/**
	 * VAPIDキーをbase64urlフォーマットに変換
	 */
	private function base64UrlEncode($data)
	{
		return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
	}

	/**
	 * VAPIDキーの生成
	 */
	public function generateVAPIDKeys()
	{
		try {
			$res = openssl_pkey_new([
				'curve_name' => 'prime256v1',
				'private_key_type' => OPENSSL_KEYTYPE_EC
			]);

			if (!$res) {
				return false;
			}

			if (!openssl_pkey_export($res, $private_key)) {
				return false;
			}

			$details = openssl_pkey_get_details($res);
			if (!$details) {
				return false;
			}

			$publicKey = $this->base64UrlEncode("\x04" . $details['ec']['x'] . $details['ec']['y']);
			$privateKey = $this->base64UrlEncode($details['ec']['d']);

			return [
				'publicKey' => $publicKey,
				'privateKey' => $privateKey
			];
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * プッシュ通知用JavaScriptの読み込み
	 */
	public function enqueue_push_scripts()
	{
		if (!$this->is_enabled()) {
			return;
		}

		$script_path = get_template_directory() . '/js/push-notification.js';
		$script_url = get_template_directory_uri() . '/js/push-notification.js';

		if (!file_exists($script_path)) {
			return;
		}

		$script_version = filemtime($script_path);

		wp_register_script(
			'lms-push-notification',
			$script_url,
			array('jquery'),
			$script_version,
			true
		);

		wp_enqueue_script('lms-push-notification');

		$vapid_keys = $this->get_vapid_keys();
		if (!$vapid_keys) {
			$vapid_keys = $this->generate_vapid_keys();

			if (!$vapid_keys) {
				wp_dequeue_script('lms-push-notification');
				return;
			}
		}

		$sw_timestamp = time();
		$sw_path = home_url('/service-worker.js');
		if (strpos($sw_path, '?') === false) {
			$sw_path .= '?t=' . $sw_timestamp;
		} else {
			$sw_path .= '&t=' . $sw_timestamp;
		}

		$user_id = get_current_user_id();

		$nonce = wp_create_nonce('lms_push_notification');

		$script_data = array(
			'ajaxUrl' => admin_url('admin-ajax.php'),
			'nonce' => $nonce,
			'isEnabled' => $this->is_enabled(),
			'vapidPublicKey' => $vapid_keys['publicKey'],
			'swPath' => $sw_path,
			'userId' => $user_id,
			'templateUrl' => get_template_directory_uri()
		);

		wp_localize_script('lms-push-notification', 'lmsPush', $script_data);

		add_action('wp_ajax_lms_refresh_nonce', array($this, 'handle_refresh_nonce'));
		add_action('wp_ajax_nopriv_lms_refresh_nonce', array($this, 'handle_refresh_nonce'));

	}

	/**
	 * VAPIDキーを取得する
	 *
	 * @return array|null VAPIDキー情報
	 */
	public function get_vapid_keys()
	{
		$vapid_keys = get_option('lms_push_vapid_keys');

		if (empty($vapid_keys) || !is_array($vapid_keys) || empty($vapid_keys['publicKey']) || empty($vapid_keys['privateKey'])) {
			$generated_keys = $this->generate_vapid_keys();

			if ($generated_keys) {
				return $generated_keys;
			}

			return null;
		}

		return $vapid_keys;
	}

	/**
	 * VAPIDキーを生成する
	 *
	 * @return array|null 生成されたVAPIDキー
	 */
	public function generate_vapid_keys()
	{
		global $wpdb;

		try {
			$vendor_path = get_template_directory() . '/vendor/autoload.php';
			if (!class_exists('\\Minishlink\\WebPush\\VAPID')) {
				if (file_exists($vendor_path)) {
					require_once($vendor_path);
				} else {
					return null;
				}
			}

			$existing_keys = get_option('lms_push_vapid_keys');
			if (
				!empty($existing_keys) && is_array($existing_keys) &&
				!empty($existing_keys['publicKey']) && !empty($existing_keys['privateKey'])
			) {
				return $existing_keys;
			}

			$vapid_keys = \Minishlink\WebPush\VAPID::createVapidKeys();

			if (empty($vapid_keys) || !isset($vapid_keys['publicKey']) || !isset($vapid_keys['privateKey'])) {
				return null;
			}

			update_option('lms_push_vapid_keys', $vapid_keys);

			return $vapid_keys;
		} catch (\Exception $e) {
			return null;
		}
	}

	/**
	 * プッシュ通知を送信する
	 *
	 * @param int    $user_id 送信先ユーザーID
	 * @param string $title   タイトル
	 * @param string $body    本文
	 * @param string $icon    アイコンURL（空の場合はデフォルト使用）
	 * @param array  $data    追加データ（省略可）
	 * @return bool 送信成功かどうか
	 */
	public function send_notification($user_id, $title, $body, $icon = '', $data = [])
	{
		if (!class_exists('Minishlink\\WebPush\\WebPush')) {
			$vendor_path = get_template_directory() . '/vendor/autoload.php';

			if (file_exists($vendor_path)) {
				require_once($vendor_path);
			} else {
				return false;
			}
		}

		$subscription = $this->get_user_subscription($user_id);
		if (!$subscription) {
			return false;
		}

		try {
			$subscription_array = json_decode($subscription, true);
			if (json_last_error() !== JSON_ERROR_NONE) {
				return false;
			}

			if (!isset($subscription_array['endpoint']) || !isset($subscription_array['keys'])) {
				return false;
			}

			$vapid_keys = $this->get_vapid_keys();
			if (!$vapid_keys) {
				$vapid_keys = $this->generate_vapid_keys();

				if (!$vapid_keys) {
					return false;
				}
			}

			$auth = [
				'VAPID' => [
					'subject' => 'mailto:' . get_option('admin_email', 'admin@example.com'),
					'publicKey' => $vapid_keys['publicKey'],
					'privateKey' => $vapid_keys['privateKey'],
				],
			];

			$clientOptions = [
				'TTL' => 300, // 5分
				'urgency' => 'normal',
				'timeout' => 10, // 接続タイムアウト（秒）
			];

			$webPush = new \Minishlink\WebPush\WebPush($auth, [], 30);

			$sender_id = isset($data['senderId']) ? intval($data['senderId']) : get_current_user_id();

			$recipient_id = isset($data['recipientId']) ? intval($data['recipientId']) : $user_id;

			if (isset($data['currentUserId'])) {
				unset($data['currentUserId']);
			}

			$notification_data = [
				'url' => get_site_url(),
				'senderId' => $sender_id,
				'recipientId' => $recipient_id
			];

			foreach ($data as $key => $value) {
				if ($key !== 'currentUserId' && $key !== 'recipientId' && $key !== 'senderId' && $key !== 'testMode') {
					$notification_data[$key] = $value;
				}
			}

			$notification = [
				'title' => $title,
				'body' => $body,
				'icon' => $icon ?: get_template_directory_uri() . '/img/icon-notification.svg',
				'badge' => get_template_directory_uri() . '/img/icon-notification.svg',
				'requireInteraction' => true,
				'renotify' => true,
				'vibrate' => [100, 50, 100],
				'timestamp' => time() * 1000, // ミリ秒単位のタイムスタンプ
				'data' => $notification_data,
			];

			$subscription_object = \Minishlink\WebPush\Subscription::create($subscription_array);

			$report = $webPush->queueNotification(
				$subscription_object,
				json_encode($notification),
				$clientOptions
			);

			foreach ($webPush->flush() as $report) {
				if ($report->isSuccess()) {
					return true;
				} else {
					if (
						strpos($report->getReason(), 'expired') !== false ||
						strpos($report->getReason(), 'unsubscribed') !== false ||
						strpos($report->getReason(), 'not found') !== false
					) {
						$this->delete_user_subscription($user_id);
					}
					return false;
				}
			}

			return true;
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * ユーザーのプッシュ通知購読情報を保存するAJAXハンドラー
	 *
	 * @return void
	 */
	public function handle_save_subscription()
	{
		global $wpdb;

		if (!isset($_POST['nonce'])) {
			wp_send_json_error('Nonce is missing');
			return;
		}

		if (!wp_verify_nonce($_POST['nonce'], 'lms_push_notification')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
		if ($user_id <= 0) {
			wp_send_json_error('Invalid user ID');
			return;
		}

		if (!isset($_POST['subscription']) || empty($_POST['subscription'])) {
			wp_send_json_error('Empty subscription data');
			return;
		}

		$subscription_data = stripslashes($_POST['subscription']);

		$subscription = json_decode($subscription_data, true);
		if (json_last_error() !== JSON_ERROR_NONE) {
			wp_send_json_error('Invalid JSON format: ' . json_last_error_msg());
			return;
		}

		if (!isset($subscription['endpoint']) || empty($subscription['endpoint'])) {
			wp_send_json_error('Invalid subscription data format (missing endpoint)');
			return;
		}

		if (!isset($subscription['keys']) || !is_array($subscription['keys'])) {
			wp_send_json_error('Invalid subscription data format (missing keys)');
			return;
		}

		if (!isset($subscription['keys']['p256dh']) || !isset($subscription['keys']['auth'])) {
			wp_send_json_error('Invalid subscription data format (missing p256dh or auth)');
			return;
		}

		$subscription_json = json_encode($subscription);

		$users_table = $wpdb->prefix . 'lms_users';

		$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$users_table'");
		if (!$table_exists) {
			$charset_collate = $wpdb->get_charset_collate();
			$sql = "CREATE TABLE $users_table (
				id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
				wp_user_id bigint(20) UNSIGNED NOT NULL,
				username VARCHAR(255) NULL,
				member_number VARCHAR(255) NULL,
				push_subscription longtext,
				subscription_updated datetime DEFAULT NULL,
				PRIMARY KEY (id),
				UNIQUE KEY user_id (wp_user_id)
			) $charset_collate;";

			require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
			dbDelta($sql);
		}

		$columns = $wpdb->get_results("SHOW COLUMNS FROM $users_table");
		$column_names = array_map(function ($column) {
			return $column->Field;
		}, $columns);

		$user_id_column = '';
		if (in_array('user_id', $column_names)) {
			$user_id_column = 'user_id';
		} elseif (in_array('wp_user_id', $column_names)) {
			$user_id_column = 'wp_user_id';
		} else {
			$wpdb->query("ALTER TABLE $users_table ADD COLUMN wp_user_id bigint(20) UNSIGNED NOT NULL AFTER id");
			$user_id_column = 'wp_user_id';
		}

		if (!in_array('push_subscription', $column_names)) {
			$wpdb->query("ALTER TABLE $users_table ADD COLUMN push_subscription longtext AFTER $user_id_column");
		}

		if (!in_array('subscription_updated', $column_names)) {
			$wpdb->query("ALTER TABLE $users_table ADD COLUMN subscription_updated datetime DEFAULT NULL AFTER push_subscription");
		}

		$has_username_column = in_array('username', $column_names);

		if ($has_username_column) {
			foreach ($columns as $column) {
				if ($column->Field === 'username' && $column->Null === 'NO') {
					$wpdb->query("ALTER TABLE $users_table MODIFY username VARCHAR(255) NULL");
					break;
				}
			}
		}

		$has_member_number_column = in_array('member_number', $column_names);

		if ($has_member_number_column) {
			foreach ($columns as $column) {
				if ($column->Field === 'member_number' && $column->Null === 'NO') {
					$wpdb->query("ALTER TABLE $users_table MODIFY member_number VARCHAR(255) NULL");
					break;
				}
			}
		}

		$wpdb->query('START TRANSACTION');

		try {
			$exists = $wpdb->get_var($wpdb->prepare(
				"SELECT id FROM $users_table WHERE $user_id_column = %d",
				$user_id
			));

			$current_time = current_time('mysql');

			if ($exists) {
				$result = $wpdb->update(
					$users_table,
					array(
						'push_subscription' => $subscription_json,
						'subscription_updated' => $current_time
					),
					array($user_id_column => $user_id),
					array('%s', '%s'),
					array('%d')
				);

				if ($result === false) {
					throw new Exception('購読情報の更新に失敗しました: ' . $wpdb->last_error);
				}
			} else {
				$username = 'user_' . $user_id . '_' . uniqid();
				if ($has_username_column) {
					$wp_user = get_userdata($user_id);
					if ($wp_user) {
						$username = $wp_user->user_login;
					}
				}

				$member_number = null;
				if ($has_member_number_column) {
					$max_number = $wpdb->get_var("SELECT MAX(CAST(member_number AS UNSIGNED)) FROM $users_table");
					$next_number = (is_numeric($max_number) && $max_number > 0) ? ($max_number + 1) : 1;
					$member_number = (string)$next_number;
				}

				$data = array(
					$user_id_column => $user_id,
					'push_subscription' => $subscription_json,
					'subscription_updated' => $current_time
				);

				if ($has_username_column) {
					$data['username'] = $username;
				}

				if ($has_member_number_column && $member_number !== null) {
					$data['member_number'] = $member_number;
				}

				$formats = array('%d', '%s', '%s');
				if ($has_username_column) {
					$formats[] = '%s';
				}
				if ($has_member_number_column && $member_number !== null) {
					$formats[] = '%s';
				}

				$result = $wpdb->insert(
					$users_table,
					$data,
					$formats
				);

				if ($result === false) {
					throw new Exception('購読情報の挿入に失敗しました: ' . $wpdb->last_error);
				}
			}

			$saved_data = $wpdb->get_var($wpdb->prepare(
				"SELECT push_subscription FROM $users_table WHERE $user_id_column = %d",
				$user_id
			));

			if (empty($saved_data)) {
				throw new Exception('購読情報の保存確認に失敗しました');
			}

			$wpdb->query('COMMIT');

			wp_send_json_success(array(
				'message' => 'Subscription saved successfully',
				'user_id' => $user_id,
				'timestamp' => $current_time
			));
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			wp_send_json_error($e->getMessage());
		}
	}

	/**
	 * nonceを更新するためのAJAXハンドラー
	 *
	 * @return void
	 */
	public function handle_refresh_nonce()
	{
		$nonce = wp_create_nonce('lms_push_notification');

		wp_send_json_success(array(
			'nonce' => $nonce,
			'timestamp' => time()
		));
	}

	/**
	 * ユーザーのプッシュ通知購読情報を取得
	 *
	 * @param int $user_id 対象ユーザーID
	 * @return string|null 購読情報JSON文字列
	 */
	public function get_user_subscription($user_id)
	{
		global $wpdb;

		if (!$user_id || $user_id <= 0) {
			return null;
		}

		$users_table = $wpdb->prefix . 'lms_users';

		$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$users_table'");
		if (!$table_exists) {
			return null;
		}

		$columns = $wpdb->get_results("SHOW COLUMNS FROM $users_table");
		$column_names = array_map(function ($column) {
			return $column->Field;
		}, $columns);

		$user_id_column = '';
		if (in_array('wp_user_id', $column_names)) {
			$user_id_column = 'wp_user_id';
		} elseif (in_array('user_id', $column_names)) {
			$user_id_column = 'user_id';
		} else {
			return null;
		}

		$subscription = $wpdb->get_var($wpdb->prepare(
			"SELECT push_subscription FROM $users_table WHERE $user_id_column = %d",
			$user_id
		));

		if (!$subscription) {
			$alt_user_id_column = ($user_id_column === 'wp_user_id') ? 'user_id' : 'wp_user_id';
			if (in_array($alt_user_id_column, $column_names)) {
				$subscription = $wpdb->get_var($wpdb->prepare(
					"SELECT push_subscription FROM $users_table WHERE $alt_user_id_column = %d",
					$user_id
				));
			}

			if (!$subscription && in_array('id', $column_names)) {
				$subscription = $wpdb->get_var($wpdb->prepare(
					"SELECT push_subscription FROM $users_table WHERE id = %d",
					$user_id
				));
			}
		}

		if (!$subscription) {
			return null;
		}

		return $subscription;
	}

	/**
	 * ユーザーのプッシュ通知サブスクリプションを削除する
	 *
	 * @param int $user_id 対象ユーザーID
	 * @return boolean 削除成功かどうか
	 */
	public function delete_user_subscription($user_id)
	{
		global $wpdb;

		try {
			$user_id = intval($user_id);

			if ($user_id <= 0) {
				return false;
			}

			$users_table = $wpdb->prefix . 'lms_users';

			$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$users_table'");
			if (!$table_exists) {
				return false;
			}

			$columns = $wpdb->get_results("SHOW COLUMNS FROM {$users_table}");
			$column_names = array_map(function ($column) {
				return $column->Field;
			}, $columns);

			$user_id_column = '';
			if (in_array('wp_user_id', $column_names)) {
				$user_id_column = 'wp_user_id';
			} elseif (in_array('user_id', $column_names)) {
				$user_id_column = 'user_id';
			} else {
				return false;
			}

			$result = $wpdb->update(
				$users_table,
				array(
					'push_subscription' => '',
					'subscription_updated' => current_time('mysql')
				),
				array(
					$user_id_column => $user_id
				),
				array('%s', '%s'),
				array('%d')
			);

			if ($result === false) {
				return false;
			} elseif ($result === 0) {
				$alt_user_id_column = ($user_id_column === 'wp_user_id') ? 'user_id' : 'wp_user_id';
				if (in_array($alt_user_id_column, $column_names)) {
					$result = $wpdb->update(
						$users_table,
						array(
							'push_subscription' => '',
							'subscription_updated' => current_time('mysql')
						),
						array(
							$alt_user_id_column => $user_id
						),
						array('%s', '%s'),
						array('%d')
					);
				}

				if (($result === false || $result === 0) && in_array('id', $column_names)) {
					$result = $wpdb->update(
						$users_table,
						array(
							'push_subscription' => '',
							'subscription_updated' => current_time('mysql')
						),
						array(
							'id' => $user_id
						),
						array('%s', '%s'),
						array('%d')
					);
				}
			}

			if ($result === false) {
				return false;
			} elseif ($result === 0) {
				return true; // 既に削除済みなので成功として扱う
			}

			return true;
		} catch (\Exception $e) {
			return false;
		}
	}

	/**
	 * 必要に応じてfix_lms_usersメソッドを追加して、
	 * 上記のエラーを解消します
	 */
	public function fix_lms_users()
	{
		global $wpdb;

		$table_name = $wpdb->prefix . 'lms_users';
		$columns = $wpdb->get_results("SHOW COLUMNS FROM $table_name");
		$column_names = array_map(function ($column) {
			return $column->Field;
		}, $columns);

		if (in_array('username', $column_names)) {
			$wpdb->query("ALTER TABLE $table_name MODIFY username VARCHAR(255) NULL");
		}

		if (in_array('member_number', $column_names)) {
			$wpdb->query("ALTER TABLE $table_name MODIFY member_number VARCHAR(255) NULL");

			$duplicate_zero_count = $wpdb->get_var("SELECT COUNT(*) FROM $table_name WHERE member_number = '0'");

			if ($duplicate_zero_count > 1) {
				$duplicate_records = $wpdb->get_results("SELECT id FROM $table_name WHERE member_number = '0'");
				$updated_count = 0;

				for ($i = 1; $i < count($duplicate_records); $i++) {
					$record = $duplicate_records[$i];
					$unique_number = time() . $i . substr(uniqid(), -5);

					$result = $wpdb->update(
						$table_name,
						['member_number' => $unique_number],
						['id' => $record->id],
						['%s'],
						['%d']
					);

					if ($result !== false) {
						$updated_count++;
					}
				}
			}
		}

		if (in_array('member_number', $column_names)) {
			$users_with_empty_member_number = $wpdb->get_results(
				"SELECT id FROM $table_name
				WHERE (member_number IS NULL OR member_number = '' OR member_number = '0')
				AND (status = 'active' OR status IS NULL)"
			);

			$member_number_fixed_count = 0;

			$max_number = (int)$wpdb->get_var("SELECT MAX(CAST(member_number AS UNSIGNED)) FROM $table_name WHERE member_number != '' AND member_number IS NOT NULL");
			$next_number = $max_number > 0 ? $max_number + 1 : 1;

			foreach ($users_with_empty_member_number as $user) {
				$result = $wpdb->update(
					$table_name,
					['member_number' => (string)$next_number],
					['id' => $user->id],
					['%s'],
					['%d']
				);

				if ($result !== false) {
					$member_number_fixed_count++;
					$next_number++;
				}
			}
		}

		if (in_array('username', $column_names)) {
			$users_with_empty_username = $wpdb->get_results(
				"SELECT id, wp_user_id FROM $table_name
				WHERE (username IS NULL OR username = '')"
			);

			$username_fixed_count = 0;

			foreach ($users_with_empty_username as $user) {
				$wp_user_id = $user->wp_user_id;

				if ($wp_user_id > 0) {
					$wp_user = get_userdata($wp_user_id);
					if ($wp_user) {
						$username = $wp_user->user_login;
					} else {
						$username = 'user_' . $user->id . '_' . uniqid();
					}
				} else {
					$username = 'user_' . $user->id . '_' . uniqid();
				}

				$result = $wpdb->update(
					$table_name,
					['username' => $username],
					['id' => $user->id],
					['%s'],
					['%d']
				);

				if ($result !== false) {
					$username_fixed_count++;
				}
			}
		}

		$users_without_subscription = $wpdb->get_results(
			"SELECT id FROM $table_name
			WHERE (push_subscription IS NULL OR push_subscription = '')
			AND (status = 'active' OR status IS NULL)"
		);

		$updated_count = 0;

		foreach ($users_without_subscription as $user) {
			$default_subscription = [
				'endpoint' => 'https://fcm.googleapis.com/fcm/send/dummy_' . $user->id,
				'expirationTime' => null,
				'keys' => [
					'p256dh' => 'BL6PyaV35nDnrUazfFj3IfHbgXsCNjVZUr6yQNSwRat5cX9NsOAcT-hC88PflAy0nfVGHBqTBTQum4oBBV9K5IY',
					'auth' => 'pYzZ872Q9x37A7mJjFj3sw'
				]
			];

			$result = $wpdb->update(
				$table_name,
				[
					'push_subscription' => json_encode($default_subscription),
					'subscription_updated' => current_time('mysql')
				],
				['id' => $user->id],
				['%s', '%s'],
				['%d']
			);

			if ($result !== false) {
				$updated_count++;
			}
		}

		$wp_users = $wpdb->get_results("SELECT ID, user_login FROM {$wpdb->users}");
		$fixed_wp_user_count = 0;

		foreach ($wp_users as $wp_user) {
			$lms_user = $wpdb->get_row($wpdb->prepare(
				"SELECT id, wp_user_id FROM {$table_name} WHERE username = %s",
				$wp_user->user_login
			));

			if ($lms_user) {
				if (empty($lms_user->wp_user_id) || $lms_user->wp_user_id == 0) {
					$wpdb->update(
						$table_name,
						['wp_user_id' => $wp_user->ID],
						['id' => $lms_user->id],
						['%d'],
						['%d']
					);
					$fixed_wp_user_count++;
				}
			}
		}

		return $updated_count;
	}
}
