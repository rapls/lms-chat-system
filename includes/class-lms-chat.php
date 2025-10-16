<?php

/**
 * チャット機能を管理するクラス
 *
 * @package LMS Theme
 */

if (! defined('ABSPATH')) {
	exit;
}

class LMS_Chat
{
	private static $instance = null;
	
	private static $cached_user_id = null;
	private static $cache_timestamp = 0;

	/**
	 * キャッシュヘルパーインスタンス
	 *
	 * @var LMS_Cache_Helper
	 */
	private $cache_helper;

	/**
	 * キャッシュキーを安全に処理するためのヘルパー関数
	 * 空のキャッシュキーを防止するための追加チェック
	 *
	 * @param string $key キャッシュキー
	 * @param string $group キャッシュグループ
	 * @return bool キャッシュキーが有効かどうか
	 */
	private function is_valid_cache_key($key, $group = 'lms_chat')
	{
		if (!isset($this->cache_helper) || is_null($this->cache_helper)) {
			if (!class_exists('LMS_Cache_Helper')) {
				require_once get_template_directory() . '/includes/class-lms-cache-helper.php';
			}
			$this->cache_helper = LMS_Cache_Helper::get_instance();
		}

		return $this->cache_helper->is_valid_key($key, $group);
	}

	/**
	 * シングルトンパターンを使用してインスタンスを取得
	 */
	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct()
	{
		// データベーステーブルの初期化
		$this->create_thread_tables();

		add_shortcode('lms_chat', array($this, 'render_chat'));

		add_action('wp_ajax_lms_get_channels', array($this, 'handle_get_channels'));
		add_action('wp_ajax_lms_get_channel_members', array($this, 'handle_get_channel_members'));
		add_action('wp_ajax_lms_get_messages', array($this, 'handle_get_messages'));
		add_action('wp_ajax_lms_send_message', array($this, 'handle_send_message'));
		add_action('wp_ajax_lms_load_messages', array($this, 'handle_load_messages'));
		add_action('wp_ajax_lms_load_history_messages', array($this, 'handle_load_history_messages'));
		add_action('wp_ajax_lms_delete_message', array($this, 'handle_delete_message'));
		add_action('wp_ajax_lms_test_connection', array($this, 'handle_test_connection'));
		add_action('wp_ajax_lms_get_thread_messages', array($this, 'handle_get_thread_messages'));

		add_action('wp_ajax_lms_get_thread_count', array($this, 'handle_get_thread_count'));
		add_action('wp_ajax_lms_update_read_status', array($this, 'handle_update_read_status'));
		add_action('wp_ajax_lms_search_messages', array($this, 'handle_search_messages'));
		add_action('wp_ajax_lms_get_users', array($this, 'handle_get_users'));
		add_action('wp_ajax_lms_refresh_nonce', array($this, 'handle_refresh_nonce'));
		add_action('wp_ajax_lms_test_thread_avatars', array($this, 'handle_test_thread_avatars'));
		add_action('wp_ajax_lms_debug_thread_info', array($this, 'handle_debug_thread_info'));
		add_action('wp_ajax_lms_get_thread_info_reliable', array($this, 'handle_get_thread_info_reliable'));
		add_action('wp_ajax_lms_get_reactions', array($this, 'handle_get_reactions'));
		add_action('wp_ajax_lms_get_thread_reactions', array($this, 'handle_get_thread_reactions'));
		add_action('wp_ajax_lms_get_thread_message_reactions', array($this, 'handle_get_thread_message_reactions'));
		add_action('wp_ajax_lms_get_reaction_updates', array($this, 'handle_get_reaction_updates'));
		add_action('wp_ajax_lms_get_thread_reaction_updates', array($this, 'handle_get_thread_reaction_updates'));
		add_action('wp_ajax_lms_get_thread_info', array($this, 'handle_get_thread_info'));
		add_action('wp_ajax_lms_get_unread_count', array($this, 'handle_get_unread_count'));
		add_action('wp_ajax_lms_mark_message_as_read', array($this, 'handle_mark_message_as_read'));
		add_action('wp_ajax_lms_mark_thread_messages_as_read', array($this, 'handle_mark_thread_messages_as_read'));
		add_action('wp_ajax_lms_debug_unread_data', array($this, 'handle_debug_unread_data'));
		
		// リアルタイム未読バッジシステム用
		add_action('wp_ajax_lms_mark_message_as_unread_realtime', array($this, 'handle_mark_message_as_unread_realtime'));
		add_action('wp_ajax_lms_get_channel_unread_count', array($this, 'handle_get_channel_unread_count'));
		add_action('wp_ajax_lms_get_thread_unread_count', array($this, 'handle_get_thread_unread_count'));
		add_action('wp_ajax_lms_get_total_unread_count', array($this, 'handle_get_total_unread_count'));
		add_action('wp_ajax_lms_mark_channel_as_read_realtime', array($this, 'handle_mark_channel_as_read_realtime'));
		add_action('wp_ajax_lms_mark_thread_as_read_realtime', array($this, 'handle_mark_thread_as_read_realtime'));

		add_action('wp_ajax_lms_upload_avatar', array($this, 'handle_upload_avatar'));

		add_action('wp_ajax_nopriv_lms_get_channels', array($this, 'handle_get_channels'));
		add_action('wp_ajax_nopriv_lms_get_channel_members', array($this, 'handle_get_channel_members'));
		add_action('wp_ajax_nopriv_lms_get_messages', array($this, 'handle_get_messages'));
		add_action('wp_ajax_nopriv_lms_test_connection', array($this, 'handle_test_connection'));
		add_action('wp_ajax_nopriv_lms_send_message', array($this, 'handle_send_message')); // 追加
		add_action('wp_ajax_nopriv_lms_get_thread_messages', array($this, 'handle_get_thread_messages'));
		add_action('wp_ajax_nopriv_lms_get_thread_count', array($this, 'handle_get_thread_count'));
		add_action('wp_ajax_nopriv_lms_get_thread_info', array($this, 'handle_get_thread_info'));
		add_action('wp_ajax_nopriv_lms_update_read_status', array($this, 'handle_update_read_status')); // 追加
		add_action('wp_ajax_nopriv_lms_get_reactions', array($this, 'handle_get_reactions'));
		add_action('wp_ajax_nopriv_lms_get_thread_reactions', array($this, 'handle_get_thread_reactions'));
		add_action('wp_ajax_nopriv_lms_get_thread_message_reactions', array($this, 'handle_get_thread_message_reactions'));
		add_action('wp_ajax_nopriv_lms_get_reaction_updates', array($this, 'handle_get_reaction_updates'));
		add_action('wp_ajax_nopriv_lms_get_thread_reaction_updates', array($this, 'handle_get_thread_reaction_updates'));
		add_action('wp_ajax_nopriv_lms_is_channel_muted', array($this, 'handle_is_channel_muted'));
		add_action('wp_ajax_nopriv_lms_search_messages', array($this, 'handle_search_messages'));
		add_action('wp_ajax_nopriv_lms_get_unread_count', array($this, 'handle_get_unread_count'));
		
		// リアルタイム未読バッジシステム用（nopriv版）
		add_action('wp_ajax_nopriv_lms_mark_message_as_unread_realtime', array($this, 'handle_mark_message_as_unread_realtime'));
		add_action('wp_ajax_nopriv_lms_get_channel_unread_count', array($this, 'handle_get_channel_unread_count'));
		add_action('wp_ajax_nopriv_lms_get_thread_unread_count', array($this, 'handle_get_thread_unread_count'));
		add_action('wp_ajax_nopriv_lms_get_total_unread_count', array($this, 'handle_get_total_unread_count'));
		add_action('wp_ajax_nopriv_lms_mark_channel_as_read_realtime', array($this, 'handle_mark_channel_as_read_realtime'));
		add_action('wp_ajax_nopriv_lms_mark_thread_as_read_realtime', array($this, 'handle_mark_thread_as_read_realtime'));
		
		add_action('wp_ajax_nopriv_lms_get_users', array($this, 'handle_get_users'));
		add_action('wp_ajax_nopriv_lms_load_messages', array($this, 'handle_load_messages'));
		add_action('wp_ajax_nopriv_lms_load_history_messages', array($this, 'handle_load_history_messages'));
		add_action('wp_ajax_nopriv_lms_refresh_nonce', array($this, 'handle_refresh_nonce'));
		add_action('wp_ajax_nopriv_lms_test_thread_avatars', array($this, 'handle_test_thread_avatars'));
		add_action('wp_ajax_nopriv_lms_debug_thread_info', array($this, 'handle_debug_thread_info'));
		add_action('wp_ajax_nopriv_lms_get_thread_info_reliable', array($this, 'handle_get_thread_info_reliable'));
		add_action('wp_ajax_lms_mark_thread_messages_as_read', array($this, 'handle_mark_thread_messages_as_read'));
		add_action('wp_ajax_nopriv_lms_mark_thread_messages_as_read', array($this, 'handle_mark_thread_messages_as_read'));
		add_action('wp_ajax_lms_debug_unread_data', array($this, 'handle_debug_unread_data'));
		add_action('wp_ajax_nopriv_lms_debug_unread_data', array($this, 'handle_debug_unread_data'));

		// 緊急停止エンドポイント
		add_action('wp_ajax_lms_emergency_stop', array($this, 'handle_emergency_stop'));
		add_action('wp_ajax_nopriv_lms_emergency_stop', array($this, 'handle_emergency_stop'));

		
		require_once get_template_directory() . '/includes/class-lms-cache-helper.php';
		$this->cache_helper = LMS_Cache_Helper::get_instance();
		
		add_action('wp_ajax_lms_test_thread_send', array($this, 'handle_test_thread_send'));
		add_action('wp_ajax_nopriv_lms_test_thread_send', array($this, 'handle_test_thread_send'));
	}

	/**
	 * スレッドメッセージの添付ファイルを取得
	 */
	public function get_thread_message_attachments($message_id)
	{
		global $wpdb;
		
		$attachments = $wpdb->get_results($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments 
			WHERE message_id = %d
			ORDER BY created_at ASC",
			$message_id
		));
		
		if ($attachments) {
			$upload_dir = wp_upload_dir();
			$upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
			foreach ($attachments as &$attachment) {
				$attachment->url = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->file_path;

				// サムネイルファイルの存在チェック
				if (!empty($attachment->thumbnail_path)) {
					$thumb_file = $upload_base_dir . '/' . $attachment->thumbnail_path;
					if (!file_exists($thumb_file)) {
						// サムネイルが存在しない場合はnullにする
						$attachment->thumbnail_path = null;
					} else {
						$attachment->thumbnail = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
					}
				}
			}
		}
		
		return $attachments ? $attachments : array();
	}

	/**
	 * テスト用Ajaxハンドラー
	 */
	public function handle_test_thread_send()
	{
		wp_send_json_success('Test thread send is working');
	}

	/**
	 * フロント用スクリプトの登録・ローカライズ
	 */
	public function enqueue_scripts()
	{
		wp_localize_script('lms-chat', 'lmsChat', array(
			'ajaxUrl'     => admin_url('admin-ajax.php'),
			'nonce'       => wp_create_nonce('lms_ajax_nonce'),
			'templateUrl' => get_template_directory_uri(),
			'siteUrl'     => parse_url(site_url(), PHP_URL_PATH),
			'pollInterval' => 0, // ポーリング無効化
			'longPollingEnabled' => false, // ロングポーリング無効化
			'disablePolling' => true, // 通常ポーリングを無効化
			'debug' => defined('WP_DEBUG') && WP_DEBUG, // デバッグモード
			'currentUserId' => isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0,
		));
	}

	/**
	 * 全チャンネル・ユーザーチャンネルを作成し、キャッシュを削除
	 */
	public function create_all_channels()
	{
		global $wpdb;
		$this->create_default_channels();
		$users = $wpdb->get_results("SELECT id, display_name FROM {$wpdb->prefix}lms_users WHERE status = 'active'");
		foreach ($users as $user) {
			$this->create_user_channel($user->id, $user->display_name);
			$cache_key = $this->cache_helper->generate_key([$user->id], 'lms_chat_channels_user');
			$this->cache_helper->delete($cache_key);
		}
	}

	/**
	 * 全体チャンネル "general" の作成
	 */
	public function create_default_channels()
	{
		global $wpdb;
		$general_exists = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM {$wpdb->prefix}lms_chat_channels WHERE name = %s",
			'general'
		));

		if (! $general_exists) {
			$wpdb->insert(
				$wpdb->prefix . 'lms_chat_channels',
				array(
					'name'       => 'general',
					'type'       => 'public',
					'created_at' => current_time('mysql'),
					'created_by' => 1,
				),
				array('%s', '%s', '%s', '%d')
			);
			$general_id = $wpdb->insert_id;
			$users = $wpdb->get_results("SELECT id FROM {$wpdb->prefix}lms_users WHERE status = 'active'");
			foreach ($users as $user) {
				$wpdb->insert(
					$wpdb->prefix . 'lms_chat_channel_members',
					array(
						'channel_id' => $general_id,
						'user_id'    => $user->id,
					),
					array('%d', '%d')
				);
				$cache_key = $this->cache_helper->generate_key([$user->id], 'lms_chat_channels_user');
				$this->cache_helper->delete($cache_key);
			}
		}
	}

	/**
	 * ユーザー個別チャネルの作成
	 */
	public function create_user_channel($user_id, $display_name)
	{
		global $wpdb;

		$existing = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM {$wpdb->prefix}lms_chat_channels WHERE name = %s AND type = 'user'",
			'user_' . $user_id
		));

		if (! $existing) {
			if (empty($user_id)) {
				return false;
			}

			$wpdb->insert(
				$wpdb->prefix . 'lms_chat_channels',
				array(
					'name'         => 'user_' . $user_id,
					'display_name' => $display_name,
					'type'         => 'user',
					'created_at'   => current_time('mysql'),
					'created_by'   => $user_id,
				),
				array('%s', '%s', '%s', '%s', '%d')
			);
			$channel_id = $wpdb->insert_id;

			$wpdb->insert(
				$wpdb->prefix . 'lms_chat_channel_members',
				array(
					'channel_id' => $channel_id,
					'user_id'    => $user_id,
				),
				array('%d', '%d')
			);

			$cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_channels_user');
			$this->cache_helper->delete($cache_key);
			return $channel_id;
		}
		return $existing;
	}

	/**
	 * ユーザーごとのチャンネル一覧を取得
	 */
	public function get_channels($user_id)
	{
		global $wpdb;

		if (empty($user_id)) {
			return [];
		}

		$cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_channels_user');
		$channels = $this->cache_helper->get($cache_key);
		if (false !== $channels) {
			return $channels;
		}
		$channels = $wpdb->get_results($wpdb->prepare(
			"SELECT c.*,
                COUNT(DISTINCT m.id) as member_count,
                c.type as channel_type,
                CASE WHEN c.name = 'general' THEN 1 ELSE 2 END as sort_order
            FROM {$wpdb->prefix}lms_chat_channels c
            LEFT JOIN {$wpdb->prefix}lms_chat_channel_members m ON c.id = m.channel_id
            WHERE EXISTS (
                SELECT 1 FROM {$wpdb->prefix}lms_chat_channel_members
                WHERE channel_id = c.id AND user_id = %d
            )
            GROUP BY c.id
            ORDER BY sort_order ASC, c.name ASC",
			$user_id
		));

		$this->cache_helper->set($cache_key, $channels, null, 300);
		return $channels;
	}

	/**
	 * チャンネルのメンバー一覧を取得
	 */
	public function get_channel_members($channel_id)
	{
		global $wpdb;

		$members = $wpdb->get_results($wpdb->prepare(
			"SELECT u.id, u.display_name, u.avatar_url
			FROM {$wpdb->prefix}lms_users u
			JOIN {$wpdb->prefix}lms_chat_channel_members m ON u.id = m.user_id
			WHERE m.channel_id = %d AND u.status = 'active'
			ORDER BY u.display_name ASC",
			$channel_id
		), OBJECT);

		if ($members === null) {
			return array();
		}

		return array_map(function ($member) {
			return (object) array(
				'id' => (int) $member->id,
				'display_name' => $member->display_name,
				'avatar_url' => lms_get_user_avatar_url($member->id)
			);
		}, $members);
	}

	public function handle_get_channel_members()
	{
		if (! isset($_GET['nonce']) || ! wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}
		$channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
		if (! $channel_id) {
			wp_send_json_error('Invalid channel ID');
			return;
		}
		$members = $this->get_channel_members($channel_id);
		wp_send_json_success($members);
	}

	/**
	 * メッセージ取得
	 */
	public function get_messages($channel_id, $page = 1, $per_page = 50, $last_message_id = 0, $include_deleted_threads = false)
	{
		
		global $wpdb;
		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		$offset = ($page - 1) * $per_page;

		$cache_ttl = ($page === 1) ? 5 : 60; // 1ページ目：5秒、2ページ目以降：60秒
		$cache_key = $this->cache_helper->generate_key(
			[$channel_id, $page, $per_page, $last_message_id, $user_id],
			'lms_chat_messages'
		);

		// 初期読み込み(page=1)時はキャッシュをスキップして50件制限を確実に適用
		if ($page > 1) {
			$cached_result = $this->cache_helper->get($cache_key, 'lms_chat_messages');
			if (false !== $cached_result) {
				return $cached_result;
			}
		}

		$where_clause = "m.channel_id = %d";
		$where_params = array($channel_id);

		if ($last_message_id > 0 && $page === 1) {
			$where_clause .= " AND m.id > %d";
			$where_params[] = $last_message_id;
		}

		$total_messages = 0; // 総数計算をスキップして高速化

		$last_read_id = 0;

		
		$messages = $wpdb->get_results($wpdb->prepare(
			"SELECT m.id, m.user_id, m.message, m.created_at, u.display_name,
			DATE(m.created_at) as message_date,
			TIME(m.created_at) as message_time
			FROM {$wpdb->prefix}lms_chat_messages m
			JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
			WHERE {$where_clause}
			ORDER BY m.created_at DESC
			LIMIT %d OFFSET %d",
			array_merge($where_params, array($per_page, $offset))
		));
		
		if ($wpdb->last_error) {
			throw new Exception("Database error: " . $wpdb->last_error);
		}
		

		if (!$messages) {
			return array(
				'messages' => array(),
				'pagination' => array(
					'total' => 0,
					'current_page' => $page,
					'per_page' => $per_page,
					'has_more' => false
				)
			);
		}

		if ($messages) {
			$messages = array_reverse($messages);
			$message_ids = array_map(function($msg) { return (int)$msg->id; }, $messages);

			$reactions_batch = array();
			if (!empty($message_ids)) {
				$reactions_results = $wpdb->get_results(
					"SELECT message_id, user_id, reaction, created_at 
					 FROM {$wpdb->prefix}lms_chat_reactions 
					 WHERE message_id IN (" . implode(',', $message_ids) . ")
					 ORDER BY created_at ASC"
				);
				foreach ($reactions_results as $reaction) {
					$reactions_batch[(int)$reaction->message_id][] = $reaction;
				}
			}

			$attachments_batch = array();
			if (!empty($message_ids)) {
				$attachments_results = $wpdb->get_results(
					"SELECT message_id, id, original_name, file_path, file_size, mime_type, thumbnail_path, created_at
					 FROM {$wpdb->prefix}lms_chat_attachments 
					 WHERE message_id IN (" . implode(',', $message_ids) . ")
					 ORDER BY created_at ASC"
				);
				
				$upload_dir = wp_upload_dir();
				$upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
				foreach ($attachments_results as $attachment) {
					$attachment->url = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->file_path;
					if ($attachment->thumbnail_path) {
						// サムネイルファイルの存在チェック
						$thumb_file = $upload_base_dir . '/' . $attachment->thumbnail_path;
						if (file_exists($thumb_file)) {
							$attachment->thumbnail = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
						} else {
							// サムネイルが存在しない場合はnullにする
							$attachment->thumbnail_path = null;
						}
					}
					$attachments_batch[(int)$attachment->message_id][] = $attachment;
				}
			}

			foreach ($messages as $message) {
				$message->user_id = (int) $message->user_id;
				$message->id = (int) $message->id;
				
				$message->reactions = $reactions_batch[$message->id] ?? array();
				$message->attachments = $attachments_batch[$message->id] ?? array();
				
				$message->content = $message->message;
			}
		}

		if ($messages && !empty($message_ids)) {
			$thread_counts = array();
			$soft_delete = LMS_Soft_Delete::get_instance();
			
			// ソフトデリートクラスのメソッドを使用
			foreach ($message_ids as $message_id) {
				if ($include_deleted_threads) {
					$count = $soft_delete->get_thread_count_with_deleted($message_id);
				} else {
					$count = $soft_delete->get_active_thread_count($message_id);
				}
				$thread_counts[(int)$message_id] = $count;
			}
			
			foreach ($messages as $message) {
				$message->thread_count = $thread_counts[$message->id] ?? 0;
				$message->latest_reply = '';
				$message->thread_unread_count = 0;
				$message->avatars = array();
			}
		}

		$grouped_messages = array();
		$current_date = '';
		$current_group = array();

		foreach ($messages as $message) {
			$message->formatted_time = date('H:i', strtotime($message->message_time));
			$message->is_new = false; // 高速化のため固定値
			
			if ($current_date !== $message->message_date) {
				if (!empty($current_group)) {
					$grouped_messages[] = array(
						'date' => $current_date,
						'messages' => $current_group
					);
				}
				$current_date = $message->message_date;
				$current_group = array($message);
			} else {
				$current_group[] = $message;
			}
		}

		if (!empty($current_group)) {
			$grouped_messages[] = array(
				'date' => $current_date,
				'messages' => $current_group
			);
		}

		$result = array(
			'messages' => $grouped_messages,
			'pagination' => array(
				'total' => count($messages),
				'current_page' => $page,
				'per_page' => $per_page,
				'has_more' => count($messages) >= $per_page
			)
		);
		// 初期読み込み時以外はキャッシュに保存
		if ($cache_key && $page > 1) {
			$this->cache_helper->set($cache_key, $result, 'lms_chat_messages', $cache_ttl);
		}

		return $result;
	}

	/**
	 * ユーザーの最終閲覧時刻を更新
	 */
	private function update_last_viewed($user_id, $channel_id)
	{
		global $wpdb;
		$wpdb->replace(
			$wpdb->prefix . 'lms_chat_last_viewed',
			array(
				'user_id' => $user_id,
				'channel_id' => $channel_id,
				'last_viewed_at' => current_time('mysql')
			),
			array('%d', '%d', '%s')
		);
	}

	/**
	 * ユーザーの最終閲覧時刻を取得
	 */
	private function get_last_viewed($user_id, $channel_id)
	{
		global $wpdb;
		return $wpdb->get_var($wpdb->prepare(
			"SELECT last_viewed_at
			FROM {$wpdb->prefix}lms_chat_last_viewed
			WHERE user_id = %d AND channel_id = %d",
			$user_id,
			$channel_id
		));
	}

	/**
	 * メッセージ送信処理
	 * SSEとポーリングの両方を使って確実に配信
	 */
	public function send_message($channel_id, $user_id, $message, $file_ids = array())
	{
		global $wpdb;

		if (empty($message) && empty($file_ids)) {
			return new WP_Error('empty_message', 'メッセージが空です。');
		}

		try {
			$wpdb->query('START TRANSACTION');

			$timestamp = current_time('mysql');
			

			$result = $wpdb->insert(
				$wpdb->prefix . 'lms_chat_messages',
				array(
					'channel_id' => $channel_id,
					'user_id'    => $user_id,
					'message'    => $message,
					'created_at' => $timestamp
				),
				array('%d', '%d', '%s', '%s')
			);

			if ($result === false) {
				$wpdb->query('ROLLBACK');
				return new WP_Error('db_error', 'データベースエラーが発生しました。');
			}

			$message_id = $wpdb->insert_id;

			if (!empty($file_ids)) {
				$this->attach_files_to_message($message_id, $file_ids);
			}

			$wpdb->query('COMMIT');

			$this->update_last_viewed($user_id, $channel_id);

			$message_data = $wpdb->get_row(
				$wpdb->prepare(
					"SELECT m.*, u.display_name
					FROM {$wpdb->prefix}lms_chat_messages m
					JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
					WHERE m.id = %d",
					$message_id
				),
				ARRAY_A
			);

			if (!$message_data) {
				return new WP_Error('message_not_found', 'メッセージの取得に失敗しました。');
			}

			$attachments = array();
			if (!empty($file_ids)) {
				$placeholders = implode(',', array_fill(0, count($file_ids), '%d'));
				$attachment_query = $wpdb->prepare(
					"SELECT * FROM {$wpdb->prefix}lms_chat_attachments WHERE id IN ($placeholders)",
					$file_ids
				);
				$attachments = $wpdb->get_results($attachment_query, ARRAY_A);
			}

			$message_data['attachments'] = $attachments;
			$message_data['avatar_url'] = lms_get_user_avatar_url($user_id);
			$message_data['formatted_time'] = $this->format_message_time($message_data['created_at']);
			$message_data['is_self'] = true;

			$unix_time = strtotime($timestamp);

			$this->force_polling_for_channel($channel_id);

			if (class_exists('LMS_Push_Notification')) {
				$this->send_push_notifications($message_data);
			}

			// 🔥 修正: 重複したアクションフック発火を削除（951行目で発火するため）

			$this->trigger_sse_event('message_new', [
				'channel_id' => $channel_id,
				'message' => $message_data,
				'user_id' => $user_id
			]);

			$message_data['id'] = $message_id;
			
			return array(
				'id' => $message_id,  // 互換性のため
				'message_id' => $message_id,
				'message_data' => $message_data
			);
		} catch (Exception $e) {
			if (isset($wpdb) && $wpdb) {
				$wpdb->query('ROLLBACK');
			}
			return new WP_Error('exception', $e->getMessage());
		}
	}
	/**
	 * SSEイベントをチャンネルメンバーにブロードキャスト
	 * 新規メッセージを確実に同期するための改善版
	 */

	public function handle_send_message()
	{
		$this->acquireSession();

		$current_user_id = 0;

		if (isset($_SESSION['lms_user_id'])) {
			$current_user_id = intval($_SESSION['lms_user_id']);
		} elseif (isset($_SESSION['user_id'])) {
			$current_user_id = intval($_SESSION['user_id']);
		}

		if ($current_user_id > 0) {
			$rate_limit_key = 'lms_send_rate_limit_' . $current_user_id;
			$recent_sends = get_transient($rate_limit_key);

			if (!$recent_sends || !is_array($recent_sends)) {
				$recent_sends = array();
			}

			$current_time = time();
			$recent_sends = array_filter($recent_sends, function($timestamp) use ($current_time) {
				return ($current_time - $timestamp) < 30; // 30秒以内
			});

			if (count($recent_sends) >= 20) {
				$this->releaseSession();
				wp_send_json_error('投稿頻度が高すぎます。しばらく待ってから再試行してください。');
				return;
			}

			$recent_sends[] = $current_time;
			set_transient($rate_limit_key, $recent_sends, 3600); // 1時間保持
		}

		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : '';
		$nonce_valid = false;

		$nonce_actions = ['lms_ajax_nonce', 'lms_ajax_nonce', 'lms_nonce'];
		foreach ($nonce_actions as $action) {
			if (wp_verify_nonce($nonce, $action)) {
				$nonce_valid = true;
				break;
			}
		}

		if (!$nonce_valid) {
			$this->releaseSession();
			wp_send_json_error('Invalid nonce');
			return;
		}

		$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
		$message    = isset($_POST['message']) ? wp_unslash($_POST['message']) : '';

		$file_ids = array();
		if (isset($_POST['file_ids']) && !empty($_POST['file_ids'])) {
			if (is_string($_POST['file_ids'])) {
				if (strpos($_POST['file_ids'], ',') !== false) {
					$file_ids = array_map('intval', array_filter(explode(',', $_POST['file_ids'])));
				} elseif (is_numeric($_POST['file_ids'])) {
					$file_ids = array(intval($_POST['file_ids']));
				}
			} elseif (is_array($_POST['file_ids'])) {
				$file_ids = array_map('intval', array_filter($_POST['file_ids']));
			}
		}

		$user_id = $this->get_authenticated_user_id();

		$this->releaseSession();

		$sending_key = isset($_POST['sending_key']) ? sanitize_text_field($_POST['sending_key']) : '';

		if (!$channel_id || (!$message && empty($file_ids)) || !$user_id) {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		try {
			$result = $this->send_message_optimized($channel_id, $user_id, $message, $file_ids);
			if (is_wp_error($result)) {
				wp_send_json_error($result->get_error_message());
				return;
			}

			$this->notify_sse_clients_lightweight('message_new', [
				'channel_id' => $channel_id,
				'message_id' => $result['id'],
				'user_id' => $user_id,
				'timestamp' => time()
			]);

			$this->schedule_heavy_operations($result);

			wp_send_json_success($result);
		} catch (Exception $e) {
			wp_send_json_error('メッセージの送信中にエラーが発生しました。');
		} catch (Throwable $e) {
			wp_send_json_error('サーバーエラーが発生しました。');
		}
	}


	/**
	 * 認証処理を最適化（キャッシュあり）
	 */
	private function get_authenticated_user_id()
	{
		static $cached_user_id = null;
		
		if ($cached_user_id !== null) {
			return $cached_user_id;
		}
		
		$user_id = 0;
		
		if (class_exists('LMS_Auth')) {
			$auth = LMS_Auth::get_instance();
			$current_user = $auth->get_current_user();
			
			if ($current_user && isset($current_user->id)) {
				$user_id = intval($current_user->id);
			}
		}
		
		if ($user_id <= 0) {
			$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		}
		
		$cached_user_id = $user_id;
		return $cached_user_id;
	}


	private function acquireSession(bool $needs_write = false): bool
	{
		if (function_exists('lms_session_start')) {
			$options = $needs_write ? array() : array('read_only' => true);
			$result = lms_session_start($options);
			if ($result === false && session_status() === PHP_SESSION_ACTIVE) {
				return true;
			}
			return $result !== false;
		}

		if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
			if (!$needs_write && PHP_VERSION_ID >= 70100) {
				session_start(array('read_and_close' => true));
				return true;
			}

			$started = session_start();
			if ($started && !$needs_write) {
				session_write_close();
			}
			return $started;
		}

		return session_status() === PHP_SESSION_ACTIVE;
	}

	private function releaseSession(): void
	{
		if (function_exists('lms_session_close')) {
			lms_session_close();
		} elseif (session_status() === PHP_SESSION_ACTIVE) {
			session_write_close();
		}
	}

	/**
	 * 最適化されたメッセージ送信処理
	 * 統合Long Pollingシステム対応版
	 */
	private function send_message_optimized($channel_id, $user_id, $message, $file_ids = array())
	{
		global $wpdb;
		
		set_time_limit(30);
		
		$result = $wpdb->insert(
			$wpdb->prefix . 'lms_chat_messages',
			array(
				'channel_id' => $channel_id,
				'user_id' => $user_id,
				'message' => $message,
				'created_at' => current_time('mysql'),
				'updated_at' => current_time('mysql')
			),
			array('%d', '%d', '%s', '%s', '%s')
		);
		
		if ($result === false) {
			return new WP_Error('db_error', 'メッセージの保存に失敗しました。');
		}
		
		$message_id = $wpdb->insert_id;
		
		$user_name = $this->get_cached_user_name($user_id);
		$avatar_url = lms_get_user_avatar_url($user_id);
		
		$message_data = array(
			'id' => $message_id,
			'channel_id' => $channel_id,
			'user_id' => $user_id,
			'message' => $message,
			'created_at' => current_time('mysql'),
			'formatted_time' => $this->format_message_time(current_time('mysql')),
			'display_name' => $user_name,
			'avatar_url' => $avatar_url,
			'attachments' => array()
		);
		
		if (!empty($file_ids)) {
			$this->attach_files_to_message($message_id, $file_ids);
			$message_data['attachments'] = $this->get_cached_attachments($file_ids);
			error_log('[send_message_optimized] file_ids: ' . print_r($file_ids, true));
			error_log('[send_message_optimized] attachments: ' . print_r($message_data['attachments'], true));
		}
		
		// デバッグ: message_dataの内容を確認
		error_log('[send_message_optimized] 完成したmessage_data: ' . print_r($message_data, true));
		
		// 旧版Long Pollingシステム（後方互換性のため保持）
		if (class_exists('LMS_Chat_LongPoll')) {
			$longpoll = LMS_Chat_LongPoll::get_instance();
			$longpoll->on_message_created($message_id, $channel_id, $user_id, $message_data);
		}
		
		// 統合Long Pollingシステム（メイン）
		if (class_exists('LMS_Unified_LongPoll')) {
			$unified_longpoll = LMS_Unified_LongPoll::get_instance();
			if ($unified_longpoll) {
				$unified_longpoll->on_message_created($message_id, $channel_id, $user_id, $message_data);
			}
		}
		
		// 完全版Long Pollingシステム
		if (class_exists('LMS_Complete_LongPoll')) {
			$complete_longpoll = LMS_Complete_LongPoll::get_instance();
			if ($complete_longpoll) {
				$complete_longpoll->on_message_created($message_id, $channel_id, $message_data);
			}
		}

		// WordPress アクションフック（プラグイン連携用）
		do_action('lms_chat_message_created', $message_id, $channel_id, $user_id, $message_data);
		
		return $message_data;
	}

	/**
	 * キャッシュされたユーザー名を取得
	 * LMS独自ユーザーテーブルのみを使用（WordPressユーザーとは完全分離）
	 */
	private function get_cached_user_name($user_id)
	{
		static $user_cache = array();

		if (isset($user_cache[$user_id])) {
			return $user_cache[$user_id];
		}

		global $wpdb;
		// LMS独自ユーザーテーブルからのみ取得
		$user_name = $wpdb->get_var($wpdb->prepare(
			"SELECT display_name FROM {$wpdb->prefix}lms_users WHERE id = %d",
			$user_id
		));

		$user_cache[$user_id] = $user_name ?: 'ユーザー' . $user_id;
		return $user_cache[$user_id];
	}

	/**
	 * キャッシュされた添付ファイル情報を取得
	 */
	private function get_cached_attachments($file_ids)
	{
		global $wpdb;
		
		if (empty($file_ids)) {
			return array();
		}
		
		$placeholders = implode(',', array_fill(0, count($file_ids), '%d'));
		$attachments = $wpdb->get_results($wpdb->prepare(
			"SELECT id, file_name, file_path, file_type, file_size, mime_type, thumbnail_path 
			FROM {$wpdb->prefix}lms_chat_attachments 
			WHERE id IN ($placeholders)",
			$file_ids
		), ARRAY_A);
		
		// JavaScriptで期待される形式に変換
		$formatted_attachments = array();
		foreach ($attachments as $attachment) {
			$base_url = site_url('wp-content/chat-files-uploads');
			$formatted_attachments[] = array(
				'id' => $attachment['id'],
				'name' => $attachment['file_name'],
				'file_name' => $attachment['file_name'],
				'url' => $base_url . '/' . $attachment['file_path'],
				'file_path' => $attachment['file_path'],
				'type' => $attachment['mime_type'],
				'mime_type' => $attachment['mime_type'],
				'file_type' => $attachment['file_type'],
				'size' => $attachment['file_size'],
				'file_size' => $attachment['file_size'],
				'thumbnail' => !empty($attachment['thumbnail_path']) ? $base_url . '/' . $attachment['thumbnail_path'] : null
			);
		}
		
		return $formatted_attachments;
	}

	/**
	 * 軽量なSSE通知（復活）- ロングポーリングクライアントに即座に通知
	 */
	private function notify_sse_clients_lightweight($event_type, $data)
	{
		// ロングポーリングクライアント用にトランジェントを設定
		if ($event_type === 'message_new') {
			$notification_key = 'lms_longpoll_new_messages';
			$current_notifications = get_transient($notification_key) ?: array();
			
			$new_notification = array(
				'message_id' => $data['message_id'],
				'channel_id' => $data['channel_id'],
				'user_id' => $data['user_id'],
				'timestamp' => $data['timestamp'],
				'event_type' => 'message_new',
				'created_at' => time()
			);
			
			$current_notifications[] = $new_notification;
			
			
			// 最大100件まで保持、5分間の有効期限
			$current_notifications = array_slice($current_notifications, -100);
			set_transient($notification_key, $current_notifications, 300);
			
			
		} else if ($event_type === 'message_deleted') {
			$notification_key = 'lms_longpoll_main_delete_events';
			$current_notifications = get_transient($notification_key) ?: array();
			
			$current_notifications[] = array(
				'message_id' => $data['message_id'],
				'channel_id' => $data['channel_id'],
				'timestamp' => time(),
				'event_type' => 'message_deleted'
			);
			
			// 最大50件まで保持、5分間の有効期限
			$current_notifications = array_slice($current_notifications, -50);
			set_transient($notification_key, $current_notifications, 300);
		}
	}

	/**
	 * 重い処理を非同期でスケジュール
	 */
	private function schedule_heavy_operations($message_data)
	{
		// プッシュ通知が有効な場合のみスケジュール
		if (get_option('lms_push_notifications_enabled', 'yes') === 'yes') {
			$args = array(
				'message_data' => $message_data,
				'channel_id' => $message_data['channel_id']
			);

			// 既にスケジュール済みでないか確認（重複防止）
			$timestamp = wp_next_scheduled('lms_send_push_notification', $args);
			if (!$timestamp) {
				wp_schedule_single_event(time() + 1, 'lms_send_push_notification', $args);
			}
		}

		// Long Poll通知（即座に実行）
		$args = array(
			$message_data['id'],
			$message_data['channel_id'],
			$message_data['user_id']
		);

		$timestamp = wp_next_scheduled('lms_send_longpoll_notification', $args);
		if (!$timestamp) {
			wp_schedule_single_event(time() + 1, 'lms_send_longpoll_notification', $args);
		}
	}

	public function handle_get_messages()
	{
		$request_data = array_merge($_GET, $_POST);
		
		$nonce = isset($request_data['nonce']) ? $request_data['nonce'] : '';
		$nonce_valid = false;
		
		$nonce_actions = ['lms_ajax_nonce', 'lms_ajax_nonce', 'lms_nonce'];
		foreach ($nonce_actions as $action) {
			if (wp_verify_nonce($nonce, $action)) {
				$nonce_valid = true;
				break;
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$channel_id = isset($request_data['channel_id']) ? intval($request_data['channel_id']) : 0;
		$page = isset($request_data['page']) ? intval($request_data['page']) : 1;
		$per_page = ($page === 1) ? 300 : 50; // 🎯 第1読み込み300メッセージ（ID68等古いメッセージも含む）、第2読み込み以降50メッセージ

		if (!$channel_id) {
			wp_send_json_error('Invalid channel ID');
			return;
		}

		if (!headers_sent()) {
			header('Content-Type: application/json; charset=utf-8');
			header('Cache-Control: no-cache, must-revalidate');
			status_header(200);
		}

		try {
			global $wpdb;
			$messages_table = $wpdb->prefix . 'lms_chat_messages';
			$users_table = $wpdb->prefix . 'lms_users';

			$offset = ($page - 1) * $per_page;
			$messages = $wpdb->get_results($wpdb->prepare(
				"SELECT m.id, m.user_id, m.channel_id, m.message, m.created_at, m.updated_at, 
					u.display_name, u.avatar_url,
					DATE(m.created_at) as message_date,
					TIME_FORMAT(m.created_at, '%%H:%%i') as formatted_time
				FROM {$messages_table} m
				LEFT JOIN {$users_table} u ON m.user_id = u.id
				WHERE m.channel_id = %d AND m.deleted_at IS NULL
				ORDER BY m.created_at DESC
				LIMIT %d OFFSET %d",
				$channel_id,
				$per_page,
				$offset
			));

			$total_messages = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$messages_table} WHERE channel_id = %d AND deleted_at IS NULL",
				$channel_id
			));

			// メッセージ取得状況をログ出力（削減版）
			if (empty($messages)) {
				wp_send_json_success(array(
					'messages' => array(),
					'pagination' => array(
						'total' => 0,
						'current_page' => $page,
						'per_page' => $per_page,
						'has_more' => false
					),
					'thread_info' => array()
				));
				return;
			}

			$messages = array_reverse($messages);
			$grouped_messages = array();

			foreach ($messages as $message) {
				$date = $message->message_date;
				if (!isset($grouped_messages[$date])) {
					$grouped_messages[$date] = array(
						'date' => $date,
						'messages' => array()
					);
				}

				$user_id = (int) $message->user_id;
				$display_name = $message->display_name;
				$avatar_url = $message->avatar_url;
				
				
				if (!$display_name || empty(trim($display_name))) {
					$user_data = $wpdb->get_row($wpdb->prepare(
						"SELECT display_name, avatar_url FROM {$wpdb->prefix}lms_users WHERE id = %d",
						$user_id
					));
					if ($user_data) {
						$display_name = $user_data->display_name ?: 'ユーザー' . $user_id;
						$avatar_url = $user_data->avatar_url ?: '';
					} else {
						$display_name = 'ユーザー' . $user_id;
					}
				}

				$message_obj = (object) array(
					'id' => (int) $message->id,
					'user_id' => $user_id,
					'message' => $message->message,
					'content' => $message->message, // contentとmessageは同じ
					'created_at' => $message->created_at,
					'display_name' => $display_name,
					'is_new' => false, // 取得時点では新しいメッセージではない
					'formatted_time' => $message->formatted_time,
					'avatar_url' => $avatar_url ?: '',
					'reactions' => array(),
					'attachments' => array(),
					'thread_count' => 0,
					'thread_unread_count' => 0,
					'avatars' => array(),
					'latest_reply' => ''
				);

				$grouped_messages[$date]['messages'][] = $message_obj;
			}

			$message_ids = array();
			foreach ($messages as $message) {
				$message_ids[] = (int) $message->id;
			}

			if (!empty($message_ids)) {
				$reactions_table = $wpdb->prefix . 'lms_chat_reactions';
				if ($wpdb->get_var("SHOW TABLES LIKE '{$reactions_table}'") == $reactions_table) {
					$message_ids_str = implode(',', array_map('intval', $message_ids));
					$reactions = $wpdb->get_results(
						"SELECT r.*, u.display_name 
						FROM {$reactions_table} r 
						LEFT JOIN {$users_table} u ON r.user_id = u.id 
						WHERE r.message_id IN ({$message_ids_str})"
					);

					foreach ($reactions as $reaction) {
						foreach ($grouped_messages as &$group) {
							foreach ($group['messages'] as &$msg) {
								if ($msg->id == $reaction->message_id) {
									$msg->reactions[] = array(
										'id' => (int) $reaction->id,
										'message_id' => (int) $reaction->message_id,
										'user_id' => (int) $reaction->user_id,
										'reaction' => $reaction->reaction,
										'display_name' => $reaction->display_name ?: 'Unknown User',
										'created_at' => $reaction->created_at
									);
								}
							}
						}
					}
				}
			}

			$thread_info = array();
			$include_thread_info = isset($request_data['include_thread_info']) ? intval($request_data['include_thread_info']) : 0;
			
			
			if ($include_thread_info && !empty($message_ids)) {
				$replies_table = $wpdb->prefix . 'lms_chat_thread_messages';
				$table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$replies_table}'");
				
				if ($table_exists == $replies_table) {
					$message_ids_str = implode(',', array_map('intval', $message_ids));
					
					$thread_counts = $wpdb->get_results(
						"SELECT parent_message_id, 
							COUNT(*) as total_replies
						FROM {$replies_table} 
						WHERE parent_message_id IN ({$message_ids_str}) 
						AND deleted_at IS NULL
						GROUP BY parent_message_id"
					);
					

					foreach ($thread_counts as $count) {
						$thread_info[] = array(
							'parent_message_id' => (int) $count->parent_message_id,
							'total_replies' => (int) $count->total_replies,
							'unread_replies' => 0, // 簡略化のため0
							'avatars' => array(), // 簡略化のため空配列
							'latest_reply' => '' // 簡略化のため空文字
						);
					}
					
					
					foreach ($thread_info as $thread) {
						$parent_id = $thread['parent_message_id'];
						foreach ($grouped_messages as &$group) {
							foreach ($group['messages'] as &$msg) {
								if ($msg->id == $parent_id) {
									$msg->thread_count = $thread['total_replies'];
									$msg->thread_unread_count = $thread['unread_replies'];
									$msg->avatars = $thread['avatars'];
									$msg->latest_reply = $thread['latest_reply'];
									break 2; // 内側と外側のループを抜ける
								}
							}
						}
					}
					
					$all_thread_data = $wpdb->get_results("SELECT parent_message_id, COUNT(*) as count FROM {$replies_table} WHERE deleted_at IS NULL GROUP BY parent_message_id LIMIT 10");
				}
			}

			wp_send_json_success(array(
				'messages' => array_values($grouped_messages),
				'pagination' => array(
					'total' => (int) $total_messages,
					'current_page' => $page,
					'per_page' => $per_page,
					'has_more' => ($offset + count($messages)) < $total_messages
				),
				'thread_info' => $thread_info
			));

		} catch (Exception $e) {
			wp_send_json_error('メッセージの取得中にエラーが発生しました');
		}
	}

	public function handle_test_connection()
	{
		
		if (!headers_sent()) {
			header('Content-Type: application/json; charset=utf-8');
			header('Cache-Control: no-cache, must-revalidate');
			status_header(200);
		}
		
		wp_send_json_success(array('message' => 'テスト接続成功', 'time' => current_time('mysql')));
	}

	public function create_read_status_table()
	{
		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_read_status (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			channel_id bigint(20) NOT NULL,
			user_id bigint(20) NOT NULL,
			last_read_message_id bigint(20) NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY channel_user (channel_id, user_id),
			KEY channel_id (channel_id),
			KEY user_id (user_id)
		) $charset_collate;";
		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		dbDelta($sql);
	}

	public function mark_as_read($channel_id, $user_id, $message_id)
	{
		global $wpdb;
		return $wpdb->replace(
			$wpdb->prefix . 'lms_chat_read_status',
			array(
				'channel_id'           => $channel_id,
				'user_id'              => $user_id,
				'last_read_message_id' => $message_id,
				'updated_at'           => current_time('mysql'),
			),
			array('%d', '%d', '%d', '%s')
		);
	}

	public function handle_mark_as_read()
	{
		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		if (!$channel_id || !$message_id || !$user_id) {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		$result = $this->mark_as_read($channel_id, $user_id, $message_id);
		if ($result !== false) {
			wp_send_json_success();
		} else {
			wp_send_json_error('既読の更新に失敗しました。');
		}
	}

	/**
	 * 未読メッセージ数を取得（スレッドの新着も含む）
	 */
	public function get_unread_counts($user_id)
	{
		global $wpdb;

		$cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_unread_counts');

		$this->cache_helper->delete($cache_key);

		$read_status = $wpdb->get_results($wpdb->prepare(
			"SELECT channel_id, last_read_message_id
			FROM {$wpdb->prefix}lms_chat_read_status
			WHERE user_id = %d",
			$user_id
		), OBJECT_K);

		$counts = $wpdb->get_results($wpdb->prepare(
			"SELECT
				c.id as channel_id,
				COALESCE(
					(
						SELECT COUNT(DISTINCT m.id)
						FROM {$wpdb->prefix}lms_chat_messages m
						LEFT JOIN {$wpdb->prefix}lms_chat_read_status r
							ON r.channel_id = m.channel_id
							AND r.user_id = %d
						WHERE m.channel_id = c.id
							AND m.user_id != %d
							AND m.deleted_at IS NULL
							AND m.created_at > COALESCE(
								(
									SELECT last_viewed_at
									FROM {$wpdb->prefix}lms_chat_last_viewed
									WHERE user_id = %d AND channel_id = c.id
								),
								'1970-01-01'
							)
					), 0
				) as unread_count
			FROM {$wpdb->prefix}lms_chat_channels c
			JOIN {$wpdb->prefix}lms_chat_channel_members cm
				ON c.id = cm.channel_id
			WHERE cm.user_id = %d",
			$user_id,
			$user_id,
			$user_id,
			$user_id
		));

		$result = array();
		foreach ($counts as $count) {
			$channel_id = $count->channel_id;
			$unread_count = (int)$count->unread_count;

			$thread_unread = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(DISTINCT t.id)
				FROM {$wpdb->prefix}lms_chat_thread_messages t
				JOIN {$wpdb->prefix}lms_chat_messages m ON t.parent_message_id = m.id
				LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
					ON v.parent_message_id = t.parent_message_id
					AND v.user_id = %d
				WHERE m.channel_id = %d
					AND t.user_id != %d
					AND t.deleted_at IS NULL
					AND m.deleted_at IS NULL
					AND t.created_at > COALESCE(
						v.last_viewed_at,
						'1970-01-01'
					)",
				$user_id,
				$channel_id,
				$user_id
			));

			$thread_unread = (int)$thread_unread;

			$total_unread = $unread_count + $thread_unread;

			$result[$channel_id] = $total_unread;
		}

		return $result;
	}

	/**
	 * 最適化された未読数取得（単一クエリ版）
	 */
	public function get_optimized_unread_counts($user_id, $force_refresh = false) {
		global $wpdb;
		
		$cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_unread_counts_optimized');
		
		if (!$force_refresh) {
			$cached_result = $this->cache_helper->get($cache_key);
			if ($cached_result !== false) {
				return $cached_result;
			}
		} else {
			$this->cache_helper->delete($cache_key);
		}
		
		$this->ensure_unread_messages_table_exists();
		
		$sql = "
			SELECT 
				c.id as channel_id,
				COALESCE(main_unread.count, 0) + COALESCE(thread_unread.count, 0) as total_unread
			FROM {$wpdb->prefix}lms_chat_channels c
			INNER JOIN {$wpdb->prefix}lms_chat_channel_members cm 
				ON c.id = cm.channel_id AND cm.user_id = %d
			
			-- メインメッセージの未読数（last_read_message_idを使用）
			LEFT JOIN (
				SELECT m.channel_id, COUNT(DISTINCT m.id) as count
				FROM {$wpdb->prefix}lms_chat_messages m
				LEFT JOIN {$wpdb->prefix}lms_chat_user_channel uc
					ON uc.channel_id = m.channel_id AND uc.user_id = %d
				WHERE m.user_id != %d 
					AND m.deleted_at IS NULL
					AND m.id > COALESCE(uc.last_read_message_id, 0)
				GROUP BY m.channel_id
			) main_unread ON main_unread.channel_id = c.id
			
			-- スレッドメッセージの未読数（新しい未読テーブルを使用）
			LEFT JOIN (
				SELECT um.channel_id, COUNT(DISTINCT um.message_id) as count
				FROM {$wpdb->prefix}lms_chat_unread_messages um
				WHERE um.user_id = %d
					AND um.message_type = 'thread'
					AND um.is_read = 0
				GROUP BY um.channel_id
			) thread_unread ON thread_unread.channel_id = c.id
		";
		
		$results = $wpdb->get_results($wpdb->prepare($sql, $user_id, $user_id, $user_id, $user_id));
		
		
		$unread_counts = array();
		foreach ($results as $result) {
			$unread_counts[$result->channel_id] = (int)$result->total_unread;
		}
		
		$this->cache_helper->set($cache_key, $unread_counts, 30);
		
		return $unread_counts;
	}

	public function handle_get_unread_count()
	{
		$request_data = array_merge($_GET, $_POST);
		
		$nonce = isset($request_data['nonce']) ? $request_data['nonce'] : '';
		$nonce_valid = false;
		
		$nonce_actions = ['lms_chat_nonce', 'lms_ajax_nonce', 'lms_nonce'];
		foreach ($nonce_actions as $action) {
			if (wp_verify_nonce($nonce, $action)) {
				$nonce_valid = true;
				break;
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = 0;
		
		if (class_exists('LMS_Auth')) {
			$auth = LMS_Auth::get_instance();
			if ($auth && method_exists($auth, 'get_current_user_id')) {
				$user_id = $auth->get_current_user_id();
				if ($user_id > 0) {
				}
			}
		}
		
		if (!$user_id && isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] > 0) {
			$user_id = intval($_SESSION['lms_user_id']);
		}
		
		if (!$user_id && lms_is_user_logged_in()) {
			$wp_user = wp_get_current_user();
			if ($wp_user && $wp_user->ID > 0) {
				$user_id = $wp_user->ID;
			}
		}
		
		if (!$user_id) {
			wp_send_json_error('ユーザー認証が必要です');
			return;
		}
		
		$force_refresh = isset($request_data['force_refresh']) && $request_data['force_refresh'];
		
		$counts = $this->get_optimized_unread_counts($user_id, $force_refresh);
		
		$current_channel_id = isset($_SESSION['lms_current_channel']) ? intval($_SESSION['lms_current_channel']) : 1;
		
		$total_unread = array_sum($counts);
		$channel_unread = isset($counts[$current_channel_id]) ? $counts[$current_channel_id] : 0;
		
		$response_data = array(
			'total_unread' => $total_unread,
			'channel_unread' => $channel_unread,
			'channels' => $counts
		);
		
		
		wp_send_json_success($response_data);
	}

	/**
	 * デバッグ用：詳細な未読データを取得
	 */
	public function handle_debug_unread_data() {
		$request_data = array_merge($_GET, $_POST);
		
		$nonce = isset($request_data['nonce']) ? $request_data['nonce'] : '';
		$nonce_valid = false;
		
		$nonce_actions = ['lms_chat_nonce', 'lms_ajax_nonce', 'lms_nonce'];
		foreach ($nonce_actions as $action) {
			if (wp_verify_nonce($nonce, $action)) {
				$nonce_valid = true;
				break;
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		if (!isset($_SESSION['lms_user_id'])) {
			wp_send_json_error('ユーザーIDが不正です。');
			return;
		}

		$user_id = (int)$_SESSION['lms_user_id'];
		global $wpdb;
		
		$cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_unread_counts_optimized');
		$this->cache_helper->delete($cache_key);
		
		$sql = "
			SELECT 
				c.id as channel_id,
				COALESCE(main_unread.count, 0) + COALESCE(thread_unread.count, 0) as total_unread
			FROM {$wpdb->prefix}lms_chat_channels c
			INNER JOIN {$wpdb->prefix}lms_chat_channel_members cm 
				ON c.id = cm.channel_id AND cm.user_id = %d
			
			-- メインメッセージの未読数
			LEFT JOIN (
				SELECT m.channel_id, COUNT(DISTINCT m.id) as count
				FROM {$wpdb->prefix}lms_chat_messages m
				LEFT JOIN {$wpdb->prefix}lms_chat_last_viewed lv
					ON lv.channel_id = m.channel_id AND lv.user_id = %d
				WHERE m.user_id != %d 
					AND m.deleted_at IS NULL
					AND m.created_at > COALESCE(lv.last_viewed_at, '1970-01-01')
				GROUP BY m.channel_id
			) main_unread ON main_unread.channel_id = c.id
			
			-- スレッドメッセージの未読数
			LEFT JOIN (
				SELECT pm.channel_id, COUNT(DISTINCT tm.id) as count
				FROM {$wpdb->prefix}lms_chat_thread_messages tm
				INNER JOIN {$wpdb->prefix}lms_chat_messages pm 
					ON tm.parent_message_id = pm.id
				LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed tlv
					ON tlv.parent_message_id = tm.parent_message_id AND tlv.user_id = %d
				WHERE tm.user_id != %d 
					AND tm.deleted_at IS NULL
					AND pm.deleted_at IS NULL
					AND tm.created_at > COALESCE(tlv.last_viewed_at, '1970-01-01')
				GROUP BY pm.channel_id
			) thread_unread ON thread_unread.channel_id = c.id
		";
		
		$unread_results = $wpdb->get_results($wpdb->prepare($sql, $user_id, $user_id, $user_id, $user_id, $user_id));
		
		$last_viewed_query = "SELECT channel_id, last_viewed_at FROM {$wpdb->prefix}lms_chat_last_viewed WHERE user_id = %d";
		$last_viewed_data = $wpdb->get_results($wpdb->prepare($last_viewed_query, $user_id));
		
		$unread_messages_query = "
			SELECT m.id, m.channel_id, m.created_at, m.message, m.user_id as message_user_id, lv.last_viewed_at
			FROM {$wpdb->prefix}lms_chat_messages m
			LEFT JOIN {$wpdb->prefix}lms_chat_last_viewed lv
				ON lv.channel_id = m.channel_id AND lv.user_id = %d
			WHERE m.user_id != %d 
				AND m.deleted_at IS NULL
				AND m.created_at > COALESCE(lv.last_viewed_at, '1970-01-01')
			ORDER BY m.channel_id, m.created_at DESC
			LIMIT 20
		";
		$unread_messages = $wpdb->get_results($wpdb->prepare($unread_messages_query, $user_id, $user_id));
		
		$cache_info = [
			'cache_key' => $cache_key,
			'cache_exists' => $this->cache_helper->get($cache_key) !== false,
			'cache_cleared' => true
		];
		
		$debug_data = [
			'sql_query' => $wpdb->prepare($sql, $user_id, $user_id, $user_id, $user_id, $user_id),
			'unread_results' => $unread_results,
			'last_viewed_data' => $last_viewed_data,
			'unread_messages' => $unread_messages,
			'cache_info' => $cache_info,
			'user_id' => $user_id,
			'timestamp' => current_time('mysql')
		];
		
		wp_send_json_success($debug_data);
	}

	public function create_thread_tables()
	{
		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();
		
		// upgrade.phpを最初に読み込み
		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		
		// スレッドメッセージテーブル
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_thread_messages (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			parent_message_id bigint(20) NOT NULL,
			user_id bigint(20) NOT NULL,
			message text NOT NULL,
			created_at datetime NOT NULL,
			deleted_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY parent_message_id (parent_message_id),
			KEY user_id (user_id),
			KEY created_at (created_at),
			KEY deleted_at (deleted_at)
		) $charset_collate;";
		dbDelta($sql);

		// スレッド読み取り状況テーブル
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_thread_read_status (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			parent_message_id bigint(20) NOT NULL,
			user_id bigint(20) NOT NULL,
			last_read_message_id bigint(20) NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY thread_user (parent_message_id, user_id),
			KEY parent_message_id (parent_message_id),
			KEY user_id (user_id)
		) $charset_collate;";
		dbDelta($sql);

		// リアクションテーブル
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_reactions (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			message_id bigint(20) NOT NULL,
			user_id bigint(20) NOT NULL,
			reaction varchar(50) NOT NULL,
			created_at datetime NOT NULL,
			deleted_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY message_user_reaction (message_id, user_id, reaction),
			KEY message_id (message_id),
			KEY user_id (user_id),
			KEY deleted_at (deleted_at)
		) $charset_collate;";
		dbDelta($sql);

		// 最終閲覧時刻テーブル
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_last_viewed (
			user_id bigint(20) NOT NULL,
			channel_id bigint(20) NOT NULL,
			last_viewed_at datetime DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (user_id, channel_id)
		) $charset_collate;";
		dbDelta($sql);

		// スレッド最終閲覧時刻テーブル
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_thread_last_viewed (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			user_id bigint(20) NOT NULL,
			parent_message_id bigint(20) NOT NULL,
			last_viewed_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY user_thread (user_id, parent_message_id)
		) $charset_collate;";
		dbDelta($sql);

		// スレッドリアクションテーブル
		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_thread_reactions (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			message_id bigint(20) NOT NULL,
			user_id bigint(20) NOT NULL,
			reaction varchar(50) NOT NULL,
			created_at datetime NOT NULL,
			deleted_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY message_user_reaction (message_id, user_id, reaction),
			KEY message_id (message_id),
			KEY user_id (user_id),
			KEY deleted_at (deleted_at)
		) $charset_collate;";
		dbDelta($sql);
		
		// テーブル作成の検証
		$required_tables = [
			'lms_chat_thread_messages',
			'lms_chat_thread_read_status',
			'lms_chat_reactions',
			'lms_chat_last_viewed',
			'lms_chat_thread_last_viewed',
			'lms_chat_thread_reactions'
		];
		
		$missing_tables = [];
		foreach ($required_tables as $table) {
			$full_table_name = $wpdb->prefix . $table;
			$exists = $wpdb->get_var("SHOW TABLES LIKE '$full_table_name'");
			if (!$exists) {
				$missing_tables[] = $table;
			}
		}
		
		if (!empty($missing_tables)) {
		}
	}

	public function send_thread_message($parent_message_id, $user_id, $message, $file_ids = array())
	{
		global $wpdb;


		$parent_message = null;
		$message_id = null;

		try {
			// テーブル作成を確実に実行
			$this->create_thread_tables();

			// テーブル存在確認
			$thread_table = $wpdb->prefix . 'lms_chat_thread_messages';
			$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$thread_table'");
			if (!$table_exists) {
				return new WP_Error('table_missing', 'スレッドメッセージテーブルが存在しません: ' . $thread_table);
			}

			// 親メッセージ存在確認
			$parent_message = $wpdb->get_row($wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
				$parent_message_id
			));
			if (!$parent_message) {
				return new WP_Error('invalid_parent', '親メッセージが存在しません。');
			}

			$current_mysql_time = current_time('mysql');

			// スレッドメッセージ挿入
			$result = $wpdb->insert(
				$wpdb->prefix . 'lms_chat_thread_messages',
				array(
					'parent_message_id' => $parent_message_id,
					'user_id'           => $user_id,
					'message'           => $message,
					'created_at'        => $current_mysql_time,
				),
				array('%d', '%d', '%s', '%s')
			);

			if ($result === false) {
				$wpdb_error = $wpdb->last_error;
				$error_message = 'メッセージの送信に失敗しました。';
				if ($wpdb_error) {
					$error_message .= ' データベースエラー: ' . $wpdb_error;
				}
				$error_message .= ' テーブル: ' . $wpdb->prefix . 'lms_chat_thread_messages';
				$error_message .= ' データ: parent_id=' . $parent_message_id . ', user_id=' . $user_id;
				return new WP_Error('insert_failed', $error_message);
			}

			$message_id = $wpdb->insert_id;
			
			// ファイル添付処理
			if (!empty($file_ids)) {
				$this->attach_files_to_message($message_id, $file_ids);
			}
			
			// 未読処理
			try {
				$this->mark_thread_message_as_unread_for_others($message_id, $parent_message->channel_id, $user_id);
			} catch (Exception $e) {
				// 未読処理失敗はメッセージ送信成功には影響しない
			}
		} catch (Exception $e) {
			return new WP_Error('exception', 'メッセージ送信中にエラーが発生しました: ' . $e->getMessage());
		}

		// メッセージデータ取得（LMS独自ユーザーテーブルのみ使用）
		$message_data = $wpdb->get_row($wpdb->prepare(
			"SELECT t.*,
					COALESCE(lms_u.display_name, CONCAT('ユーザー', t.user_id)) as display_name,
					COALESCE(lms_u.avatar_url, '') as avatar_url,
					TIME(t.created_at) as message_time
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_users lms_u ON t.user_id = lms_u.id
			WHERE t.id = %d",
			$message_id
		));

		if (!$message_data) {
			return new WP_Error('message_not_found', '送信されたメッセージを取得できませんでした。');
		}

		// 添付ファイル情報取得
		$attachments = $wpdb->get_results($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
			WHERE message_id = %d
			ORDER BY created_at ASC",
			$message_id
		));

		if ($attachments) {
			$upload_dir = wp_upload_dir();
			$upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
			foreach ($attachments as &$attachment) {
				$attachment->url = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->file_path;
				if ($attachment->thumbnail_path) {
					// サムネイルファイルの存在チェック
					$thumb_file = $upload_base_dir . '/' . $attachment->thumbnail_path;
					if (file_exists($thumb_file)) {
						$attachment->thumbnail = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
					} else {
						// サムネイルが存在しない場合はnullにする
						$attachment->thumbnail_path = null;
					}
				}
			}
			$message_data->attachments = $attachments;
		}

		// メッセージデータ補完
		$message_data->is_new = 0;
		$message_data->is_current_user = true;
		$message_data->formatted_time = date('H:i', strtotime($message_data->message_time));

		// スレッド最終閲覧時刻更新
		$current_time = current_time('mysql');
		try {
			$this->update_thread_last_viewed_to_time($parent_message_id, $user_id, $current_time);
		} catch (Exception $e) {
			// 最終閲覧時刻更新失敗はメッセージ送信成功には影響しない
		}

		// アクションフック実行（統合Long Polling向け）
		if ($parent_message && $message_id) {
			try {
				do_action('lms_chat_thread_message_sent', $message_id, $parent_message_id, $parent_message->channel_id, $user_id);
			} catch (Exception $e) {
				// フック失敗はメッセージ送信成功には影響しない
			}
		}
		
		// SSEイベント送信（レガシー）
		try {
			$this->trigger_sse_event('thread_message_new', [
				'parent_message_id' => $parent_message_id,
				'message' => $message_data,
				'channel_id' => $parent_message->channel_id
			]);
		} catch (Exception $e) {
			// SSE失敗はメッセージ送信成功には影響しない
		}

		// 🔥 CRITICAL FIX: スレッドメッセージ関連のキャッシュをクリア（軽量版・エラー完全抑制）
		// キャッシュクリアでエラーが出てもメッセージ送信は成功とする

		return $message_data;
	}
	
	/**
	 * スレッドメッセージを他のチャンネル参加者に未読として設定
	 */
	private function mark_thread_message_as_unread_for_others($message_id, $channel_id, $sender_user_id)
	{
		global $wpdb;
		
		try {
			$this->ensure_unread_messages_table_exists();
			
			$channel_members = $wpdb->get_results($wpdb->prepare(
				"SELECT user_id FROM {$wpdb->prefix}lms_chat_channel_members 
				WHERE channel_id = %d AND user_id != %d",
				$channel_id,
				$sender_user_id
			));
			
			if ($channel_members) {
				foreach ($channel_members as $member) {
					$result = $wpdb->replace(
						$wpdb->prefix . 'lms_chat_unread_messages',
						array(
							'user_id' => $member->user_id,
							'message_id' => $message_id,
							'message_type' => 'thread',
							'channel_id' => $channel_id,
							'is_read' => 0,
							'created_at' => current_time('mysql')
						),
						array('%d', '%d', '%s', '%d', '%d', '%s')
					);
					
				}
				
			}
		} catch (Exception $e) {
		}
	}
	
	/**
	 * 未読メッセージテーブルが存在するかを確認し、存在しない場合は作成
	 */
	private function ensure_unread_messages_table_exists()
	{
		global $wpdb;
		
		$table_name = $wpdb->prefix . 'lms_chat_unread_messages';
		
		$table_exists = $wpdb->get_var($wpdb->prepare(
			"SHOW TABLES LIKE %s",
			$table_name
		));
		
		if (!$table_exists) {
			$charset_collate = $wpdb->get_charset_collate();
			
			$sql = "CREATE TABLE $table_name (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				user_id bigint(20) NOT NULL,
				message_id bigint(20) NOT NULL,
				message_type varchar(20) NOT NULL DEFAULT 'main',
				channel_id bigint(20) NOT NULL,
				parent_message_id bigint(20) DEFAULT NULL,
				is_read tinyint(1) NOT NULL DEFAULT 0,
				created_at datetime NOT NULL,
				updated_at datetime DEFAULT NULL,
				PRIMARY KEY (id),
				UNIQUE KEY unique_user_message (user_id, message_id, message_type),
				KEY user_id (user_id),
				KEY message_id (message_id),
				KEY channel_id (channel_id),
				KEY parent_message_id (parent_message_id),
				KEY is_read (is_read),
				KEY message_type (message_type)
			) $charset_collate;";
			
			require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
			dbDelta($sql);
		} else {
			// 既存のテーブルにparent_message_idカラムがない場合は追加
			$column_exists = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
				WHERE table_name = %s 
				AND column_name = 'parent_message_id' 
				AND table_schema = DATABASE()",
				$table_name
			));
			
			if (!$column_exists) {
				$wpdb->query("ALTER TABLE $table_name ADD COLUMN parent_message_id bigint(20) DEFAULT NULL AFTER channel_id");
				$wpdb->query("ALTER TABLE $table_name ADD INDEX parent_message_id (parent_message_id)");
			}
		}
	}

	public function handle_send_thread_message()
	{
		$this->acquireSession();

		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : '';
		$nonce_valid = false;

		if ($nonce) {
			$nonce_actions = ['lms_ajax_nonce', 'lms_chat_nonce', 'lms_nonce'];
			foreach ($nonce_actions as $action) {
				if (wp_verify_nonce($nonce, $action)) {
					$nonce_valid = true;
					break;
				}
			}
		}

		$parent_message_id = isset($_POST['parent_message_id']) ? intval($_POST['parent_message_id']) : 0;
		$message = isset($_POST['message']) ? wp_unslash($_POST['message']) : '';
		$file_ids = isset($_POST['file_ids']) ? array_map('intval', (array)$_POST['file_ids']) : array();

		$user_id = $this->get_authenticated_user_id_optimized();

		$this->releaseSession();

		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		if (!$parent_message_id) {
			wp_send_json_error('親メッセージIDが必要です。');
			return;
		}

		if (!$message && empty($file_ids)) {
			wp_send_json_error('メッセージまたはファイルが必要です。');
			return;
		}

		if (!$user_id) {
			wp_send_json_error('ユーザー認証が必要です。');
			return;
		}

		try {
			$result = $this->send_thread_message($parent_message_id, $user_id, $message, $file_ids);
			if (is_wp_error($result)) {
				wp_send_json_error($result->get_error_message());
				return;
			}
		} catch (Exception $e) {
			wp_send_json_error('スレッドメッセージの送信中にエラーが発生しました: ' . $e->getMessage());
			return;
		}

		global $wpdb;
		$parent_message = $wpdb->get_row($wpdb->prepare(
			"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
			$parent_message_id
		));
		if ($parent_message) {
			$this->notify_sse_clients('thread_message_posted', [
				'channel_id' => $parent_message->channel_id,
				'thread_id' => $parent_message_id,
				'message' => $result,
				'user_id' => $user_id
			]);

			$longpoll = LMS_Chat_LongPoll::get_instance();
			if ($longpoll && isset($result->id)) {
				do_action('lms_chat_thread_message_sent', $result);
			}
		}

		wp_send_json_success($result);
	}


	public function handle_get_thread_messages()
	{
		set_time_limit(120);

		$this->acquireSession();

		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		$this->releaseSession();

		if (!$session_user_id) {
			wp_send_json_error('ユーザーが認証されていません。');
			return;
		}

		$nonce = isset($_GET['nonce']) ? $_GET['nonce'] : '';
		$nonce_valid = false;

		if ($nonce) {
			$nonce_actions = ['lms_ajax_nonce', 'lms_ajax_nonce', 'lms_nonce'];
			foreach ($nonce_actions as $action) {
				if (wp_verify_nonce($nonce, $action)) {
					$nonce_valid = true;
					break;
				}
			}
		}

		if (!$nonce_valid) {
			wp_send_json_error('セキュリティチェックに失敗しました。');
			return;
		}

		if (!isset($_GET['parent_message_id'])) {
			wp_send_json_error('パラメータが不足しています。');
			return;
		}

		$parent_message_id = intval($_GET['parent_message_id']);
		$page = isset($_GET['page']) ? intval($_GET['page']) : 1;

		try {
			$result = $this->get_thread_messages($parent_message_id, $page, 50, $session_user_id);
			wp_send_json_success($result);
		} catch (Exception $e) {
			wp_send_json_error('スレッドメッセージの取得に失敗しました: ' . $e->getMessage());
		}
	}


	public function handle_get_thread_read_status()
	{
		$this->acquireSession();

		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		$this->releaseSession();

		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('セキュリティチェックに失敗しました。');
			return;
		}

		if (!isset($_GET['parent_message_id'])) {
			wp_send_json_error('パラメータが不足しています。');
			return;
		}

		if (!$user_id) {
			wp_send_json_error('ユーザーが認証されていません。');
			return;
		}

		$parent_message_id = intval($_GET['parent_message_id']);

		wp_send_json_success(array(
			'unread_messages' => array(),
			'last_read_at' => current_time('mysql')
		));
	}


	/**
	 * 更新チェックの処理
	 */
	public function handle_check_updates()
	{
		$this->acquireSession();

		$authenticated = isset($_SESSION['lms_user_id']) && !empty($_SESSION['lms_user_id']);

		$this->releaseSession();

		if (!$authenticated) {
			wp_send_json_error('ユーザーが認証されていません。');
			return;
		}

		wp_send_json_success(array(
			'has_updates' => false,
			'timestamp' => current_time('mysql'),
			'messages' => array()
		));
	}


	public function get_thread_messages($parent_message_id, $page = 1, $per_page = 50, $user_id = null)
	{
		global $wpdb;
		if ($user_id === null) {
			$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		}
		$offset = ($page - 1) * $per_page;

		if (empty($parent_message_id)) {
			throw new Exception('親メッセージIDが無効です');
		}

		if (empty($user_id)) {
			throw new Exception('ユーザーIDが無効です');
		}

		// キャッシュキーは生成するが、実際のキャッシュは使用しない（常に最新データを取得）
		$cache_key = '';
		if (!empty($parent_message_id) && !empty($user_id)) {
			$cache_key = $this->cache_helper->generate_key([$parent_message_id, $page, $per_page, $user_id], 'lms_chat_thread_messages');
		}

		// 🔥 パフォーマンス向上: キャッシュを一時的に無効化し、常に最新データを取得
		// これにより、メッセージ送信直後でも確実に表示される

		$thread_table = $wpdb->prefix . 'lms_chat_thread_messages';
		$last_viewed_table = $wpdb->prefix . 'lms_chat_thread_last_viewed';
		$users_table = $wpdb->prefix . 'lms_users';

		$thread_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$thread_table}'");
		$last_viewed_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$last_viewed_table}'");
		$users_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$users_table}'");

		if (!$thread_table_exists || !$last_viewed_table_exists) {
			$this->create_thread_tables();

			$thread_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$thread_table}'");
			$last_viewed_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$last_viewed_table}'");

			if (!$thread_table_exists || !$last_viewed_table_exists) {
				$error_message = 'スレッドテーブルが存在しません。管理者に連絡してください。';
				throw new Exception($error_message);
			}
		}

		if (!$users_table_exists) {
			throw new Exception('ユーザーテーブルが存在しません。');
		}

		// 🔥 パフォーマンス向上: メッセージ総数も常にDBから取得
		$count_query = $wpdb->prepare(
			"SELECT COUNT(*) FROM {$thread_table} WHERE parent_message_id = %d AND deleted_at IS NULL",
			$parent_message_id
		);

		$total_messages = $wpdb->get_var($count_query);

		$last_viewed_cache_key = '';
		if (!empty($user_id) && !empty($parent_message_id)) {
			$last_viewed_cache_key = $this->cache_helper->generate_key([$parent_message_id, $user_id], 'lms_chat_thread_last_viewed');
		}

		$last_viewed = false;
		if (!empty($last_viewed_cache_key)) {
			$last_viewed = $this->cache_helper->get($last_viewed_cache_key, 'lms_chat');
		}

		if (false === $last_viewed) {
			$last_viewed = $wpdb->get_var($wpdb->prepare(
				"SELECT last_viewed_at FROM {$last_viewed_table}
				WHERE parent_message_id = %d AND user_id = %d",
				$parent_message_id,
				$user_id
			));

			if (!empty($last_viewed_cache_key)) {
				$this->cache_helper->set($last_viewed_cache_key, $last_viewed, 'lms_chat', 60); // 60秒間キャッシュ
			}
		}

		$query = $wpdb->prepare(
			"SELECT t.*, u.display_name, u.avatar_url,
			DATE(t.created_at) as message_date,
			TIME(t.created_at) as message_time,
			CASE
				WHEN t.created_at > %s AND t.user_id != %d THEN 1
				ELSE 0
			END as is_new
			FROM {$thread_table} t
			LEFT JOIN {$users_table} u ON t.user_id = u.id
			WHERE t.parent_message_id = %d AND t.deleted_at IS NULL
			ORDER BY t.created_at ASC
			LIMIT %d OFFSET %d",
			$last_viewed ? $last_viewed : '1970-01-01 00:00:00',
			$user_id,
			$parent_message_id,
			$per_page,
			$offset
		);

		$messages = $wpdb->get_results($query);

		if ($wpdb->last_error) {
			throw new Exception('データベースクエリでエラーが発生しました: ' . $wpdb->last_error);
		}
		if ($messages) {
			$message_ids = wp_list_pluck($messages, 'id');
			$reactions_cache = array();
			$attachments_cache = array();

			foreach ($message_ids as $msg_id) {
				$reaction_cache_key = $this->cache_helper->generate_key([$msg_id], 'lms_chat_thread_reactions');
				$cached_reactions = $this->cache_helper->get($reaction_cache_key, 'lms_chat');
				if (false !== $cached_reactions) {
					$reactions_cache[$msg_id] = $cached_reactions;
				}

				$attachment_cache_key = "lms_chat_thread_attachments_{$msg_id}";
				$cached_attachments = $this->cache_helper->get($attachment_cache_key, 'lms_chat');
				if (false !== $cached_attachments) {
					$attachments_cache[$msg_id] = $cached_attachments;
				}
			}

			foreach ($messages as &$message) {
				$message->user_id = (int) $message->user_id;
				$message->id = (int) $message->id;
				$message->parent_message_id = (int) $message->parent_message_id;
				$message->formatted_time = date('H:i', strtotime($message->message_time));

				if (isset($reactions_cache[$message->id])) {
					$message->reactions = $reactions_cache[$message->id];
				} else {
					$message->reactions = $this->get_thread_message_reactions($message->id);
				}

				if (isset($attachments_cache[$message->id])) {
					$message->attachments = $attachments_cache[$message->id];
				} else {
					$attachments = $wpdb->get_results($wpdb->prepare(
						"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
						WHERE message_id = %d
						ORDER BY created_at ASC",
						$message->id
					));

					if ($attachments) {
						$upload_dir = wp_upload_dir();
						$upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
						foreach ($attachments as &$attachment) {
							$attachment->url = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->file_path;
							if ($attachment->thumbnail_path) {
								// サムネイルファイルの存在チェック
								$thumb_file = $upload_base_dir . '/' . $attachment->thumbnail_path;
								if (file_exists($thumb_file)) {
									$attachment->thumbnail = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
								} else {
									// サムネイルが存在しない場合はnullにする
									$attachment->thumbnail_path = null;
								}
							}
						}
						$message->attachments = $attachments;
						$attachment_cache_key = "lms_chat_thread_attachments_{$message->id}";
						if ($this->is_valid_cache_key($attachment_cache_key)) {
							$this->cache_helper->set($attachment_cache_key, $attachments, 'lms_chat', 300); // 5分間キャッシュ
						}
					} else {
						$message->attachments = array();
					}
				}
			}
		}

		$this->update_thread_last_viewed($parent_message_id, $user_id);

		$parent_message = null;
		$parent_cache_key = $this->cache_helper->generate_key([$parent_message_id], 'lms_chat_parent_message');
		$cached_parent = $this->cache_helper->get($parent_cache_key, 'lms_chat');
		
		if (false !== $cached_parent) {
			$parent_message = $cached_parent;
		} else {
			$parent_message = $wpdb->get_row($wpdb->prepare(
				"SELECT m.*, u.display_name, u.avatar_url
				FROM {$wpdb->prefix}lms_chat_messages m
				JOIN {$users_table} u ON m.user_id = u.id
				WHERE m.id = %d AND m.deleted_at IS NULL",
				$parent_message_id
			));
			
			if ($parent_message) {
				$parent_message->user_id = (int) $parent_message->user_id;
				$parent_message->id = (int) $parent_message->id;
				$parent_message->channel_id = (int) $parent_message->channel_id;
				$parent_message->formatted_time = date('Y-m-d H:i', strtotime($parent_message->created_at));
				$parent_message->message_time = $parent_message->created_at;
				
				$this->cache_helper->set($parent_cache_key, $parent_message, 'lms_chat', 300);
			}
		}

		$result = array(
			'messages' => $messages,
			'parent_message' => $parent_message, // 親メッセージ情報を追加
			'pagination' => array(
				'total' => (int) $total_messages,
				'current_page' => $page,
				'per_page' => $per_page,
				'has_more' => ($offset + $per_page) < $total_messages
			)
		);

		// 🔥 パフォーマンス向上: キャッシュへの保存を一時的に無効化
		// キャッシュの不整合を防ぎ、常に最新データを表示

		return $result;
	}


	/**
	 * スレッド数を取得する
	 * 
	 * @param int $parent_message_id 親メッセージID
	 * @return int スレッド数
	 */
	public function get_thread_count($parent_message_id)
	{
		global $wpdb;

		if (!$parent_message_id) {
			return 0;
		}

		$total = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) 
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			WHERE t.parent_message_id = %d 
			AND t.deleted_at IS NULL",
			$parent_message_id
		));

		return intval($total);
	}

	/**
	 * スレッドの返信数と未読数を取得するAJAXハンドラー
	 * Phase 1-3: Feature Flag対応版
	 */
	public function handle_get_thread_count()
	{
		$nonce = isset($_GET['nonce']) ? $_GET['nonce'] : '';
		$nonce_valid = false;
		
		if ($nonce) {
			$nonce_actions = ['lms_ajax_nonce', 'lms_ajax_nonce', 'lms_nonce'];
			foreach ($nonce_actions as $action) {
				if (wp_verify_nonce($nonce, $action)) {
					$nonce_valid = true;
					break;
				}
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('無効なnonce');
			return;
		}

		$parent_message_id = isset($_GET['parent_message_id']) ? intval($_GET['parent_message_id']) : 0;
		$channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
		
		if (!$parent_message_id) {
			wp_send_json_error('親メッセージIDが指定されていません。');
			return;
		}

		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		// Phase 1-3: Feature Flagチェック
		$use_optimized = get_option('lms_optimized_thread_query_v4', false);
		
		if ($use_optimized && method_exists($this, 'handle_get_thread_count_optimized_v4')) {
			// 最適化版を使用
			try {
				$data = $this->handle_get_thread_count_optimized_v4($parent_message_id, $user_id);
				wp_send_json_success($data);
				return;
			} catch (Exception $e) {
				// エラー時は従来版にフォールバック
				error_log('Optimized query failed, falling back to legacy: ' . $e->getMessage());
			}
		}
		
		// 従来版のロジック（フォールバック）
		global $wpdb;

		$query = "SELECT COUNT(*) 
			FROM {$wpdb->prefix}lms_chat_thread_messages 
			WHERE parent_message_id = %d 
			AND deleted_at IS NULL";
		$total = $wpdb->get_var($wpdb->prepare($query, $parent_message_id));
		

		$unread = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
				ON v.parent_message_id = t.parent_message_id
				AND v.user_id = %d
			WHERE t.parent_message_id = %d
			AND t.user_id != %d
			AND t.deleted_at IS NULL
			AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)",
			$user_id,
			$parent_message_id,
			$user_id
		));

		$latest_reply = '';
		if ($total > 0) {
			$latest_message = $wpdb->get_row($wpdb->prepare(
				"SELECT t.created_at, u.display_name
				FROM {$wpdb->prefix}lms_chat_thread_messages t
				JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
				WHERE t.parent_message_id = %d
				AND t.deleted_at IS NULL
				ORDER BY t.created_at DESC
				LIMIT 1",
				$parent_message_id
			));

			if ($latest_message) {
				$timestamp = strtotime($latest_message->created_at);
				$diff = time() - $timestamp;
				if ($diff < 60) {
					$latest_reply = 'たった今';
				} elseif ($diff < 3600) {
					$latest_reply = floor($diff / 60) . '分前';
				} elseif ($diff < 86400) {
					$latest_reply = floor($diff / 3600) . '時間前';
				} else {
					$latest_reply = floor($diff / 86400) . '日前';
				}
				$latest_reply = $latest_reply;
			}
		}

		$avatar_query = "SELECT u.id as user_id, u.display_name, u.avatar_url
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE t.parent_message_id = %d
			AND t.deleted_at IS NULL
			GROUP BY u.id
			ORDER BY MAX(t.created_at) DESC
			LIMIT 3";
		$avatars = $wpdb->get_results($wpdb->prepare($avatar_query, $parent_message_id));
		

		wp_send_json_success([
			'count' => (int)$total,
			'total' => (int)$total,
			'unread' => (int)$unread,
			'latest_reply' => $latest_reply,
			'avatars' => $avatars,
			'version' => 'legacy'  // デバッグ用マーカー
		]);
	}

	/**
	 * Phase 1-2: スレッド情報取得の最適化版（Feature Flag付き）
	 * v4.0最適化プロジェクト
	 * 
	 * 4つのクエリを2つに統合し、新しいインデックスを活用
	 * Feature Flag: lms_optimized_thread_query_v4
	 */
	private function handle_get_thread_count_optimized_v4($parent_message_id, $user_id)
	{
		global $wpdb;
		
		// 統合クエリ: COUNT、未読カウント、最新時刻を一度に取得
		$result = $wpdb->get_row($wpdb->prepare("
			SELECT 
				COUNT(*) as total_count,
				SUM(CASE 
					WHEN t.user_id != %d 
					AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)
					THEN 1 ELSE 0 
				END) as unread_count,
				MAX(t.created_at) as latest_time
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
				ON v.parent_message_id = t.parent_message_id
				AND v.user_id = %d
			WHERE t.parent_message_id = %d
			AND t.deleted_at IS NULL
		", $user_id, $user_id, $parent_message_id));
		
		// 最新返信時刻の整形
		$latest_reply = '';
		if ($result && $result->latest_time) {
			$timestamp = strtotime($result->latest_time);
			$diff = time() - $timestamp;
			if ($diff < 60) {
				$latest_reply = 'たった今';
			} elseif ($diff < 3600) {
				$latest_reply = floor($diff / 60) . '分前';
			} elseif ($diff < 86400) {
				$latest_reply = floor($diff / 3600) . '時間前';
			} else {
				$latest_reply = floor($diff / 86400) . '日前';
			}
		}
		
		// アバター取得（2つ目のクエリ）
		$avatars = $wpdb->get_results($wpdb->prepare("
			SELECT u.id as user_id, u.display_name, u.avatar_url
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			INNER JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE t.parent_message_id = %d
			AND t.deleted_at IS NULL
			GROUP BY u.id
			ORDER BY MAX(t.created_at) DESC
			LIMIT 3
		", $parent_message_id));
		
		return [
			'count' => (int)($result->total_count ?? 0),
			'total' => (int)($result->total_count ?? 0),
			'unread' => (int)($result->unread_count ?? 0),
			'latest_reply' => $latest_reply,
			'avatars' => $avatars,
			'version' => 'v4_optimized'  // デバッグ用マーカー
		];
	}

	public function create_attachments_table()
	{
		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_attachments (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			message_id bigint(20) DEFAULT NULL,
			user_id bigint(20) NOT NULL,
			file_name varchar(255) NOT NULL,
			file_path varchar(255) NOT NULL,
			file_type varchar(50) NOT NULL,
			file_size bigint(20) NOT NULL,
			mime_type varchar(100) NOT NULL,
			thumbnail_path varchar(255) DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY message_id (message_id),
			KEY user_id (user_id)
		) $charset_collate;";

		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		dbDelta($sql);
	}

	private function attach_files_to_message($message_id, $file_ids)
	{
		global $wpdb;
		if (!empty($file_ids)) {
			error_log('[attach_files_to_message] message_id: ' . $message_id . ', file_ids: ' . print_r($file_ids, true));
			
			$rows_affected = $wpdb->query($wpdb->prepare(
				"UPDATE {$wpdb->prefix}lms_chat_attachments
				SET message_id = %d
				WHERE id IN (" . implode(',', array_fill(0, count($file_ids), '%d')) . ")",
				array_merge([$message_id], $file_ids)
			));
			
			error_log('[attach_files_to_message] rows_affected: ' . $rows_affected);
			
			if ($rows_affected === false) {
				error_log('[attach_files_to_message] ERROR: ' . $wpdb->last_error);
			}
			
			// 🔥 確認: 更新後のファイル情報を取得
			$updated_files = $wpdb->get_results($wpdb->prepare(
				"SELECT id, message_id, file_name FROM {$wpdb->prefix}lms_chat_attachments WHERE id IN (" . implode(',', array_fill(0, count($file_ids), '%d')) . ")",
				$file_ids
			), ARRAY_A);
			
			error_log('[attach_files_to_message] updated_files: ' . print_r($updated_files, true));
		}
	}

	/**
	 * メッセージのリアクションを取得
	 */
	public function get_message_reactions($message_id)
	{
		global $wpdb;

		$cache_key = '';
		if (!empty($message_id)) {
			$cache_key = $this->cache_helper->generate_key([$message_id], 'lms_chat_reactions');
		}

		$reactions = false;
		if (!empty($cache_key)) {
			$reactions = $this->cache_helper->get($cache_key, 'lms_chat');
		}

		if (false !== $reactions) {
			return $reactions;
		}

		$reactions = $wpdb->get_results($wpdb->prepare(
			"SELECT r.*
			FROM {$wpdb->prefix}lms_chat_reactions r
			WHERE r.message_id = %d
			ORDER BY r.created_at ASC",
			$message_id
		));

		foreach ($reactions as &$reaction) {
			$reaction->display_name = $this->get_user_display_name($reaction->user_id);
		}

		if (!empty($cache_key)) {
			$this->cache_helper->set($cache_key, $reactions, 'lms_chat', 60); // 60秒間キャッシュ
		}

		return $reactions;
	}

	/**
	 * スレッドメッセージのリアクションを取得（ソフトデリート対応版）
	 */
	public function get_thread_message_reactions($message_id, $force_refresh = false)
	{
		global $wpdb;

		$cache_key = '';
		if (!empty($message_id)) {
			// ソフトデリート対応版のキャッシュキー
			$cache_key = $this->cache_helper->generate_key([$message_id, 'soft_delete'], 'lms_chat_thread_reactions');
		}

		$reactions = false;
		if (!$force_refresh && !empty($cache_key)) {
			$reactions = $this->cache_helper->get($cache_key, 'lms_chat');
		}

		if (false !== $reactions) {
			return $reactions;
		}

		if ($force_refresh && !empty($cache_key)) {
			$this->cache_helper->delete($cache_key, 'lms_chat');
			wp_cache_delete("thread_reactions_{$message_id}", 'lms_thread_reactions');
			delete_transient("thread_reactions_cache_{$message_id}");
		}

		$table_name = $wpdb->prefix . 'lms_chat_thread_reactions';
		$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table_name'");
		
		if (!$table_exists) {
			$reactions = array();
		} else {
			// deleted_at カラム存在確認
			$column_exists = $wpdb->get_results($wpdb->prepare(
				"SHOW COLUMNS FROM {$table_name} LIKE %s",
				'deleted_at'
			));

			if (empty($column_exists)) {
				// マイグレーションが未実行の場合は実行
				$migration = LMS_Thread_Reaction_Migration::get_instance();
				$migration->force_migration();
				
				// マイグレーション実行後に再度確認
				$column_exists = $wpdb->get_results($wpdb->prepare(
					"SHOW COLUMNS FROM {$table_name} LIKE %s",
					'deleted_at'
				));
			}

			if (!empty($column_exists)) {
				// ソフトデリート対応：deleted_at IS NULL のレコードのみ取得
				$reactions = $wpdb->get_results($wpdb->prepare(
					"SELECT r.*
					FROM {$wpdb->prefix}lms_chat_thread_reactions r
					WHERE r.message_id = %d 
					AND r.deleted_at IS NULL
					ORDER BY r.created_at ASC",
					$message_id
				));
			} else {
				// deleted_at カラムが存在しない場合は従来通り（後方互換性）
				$reactions = $wpdb->get_results($wpdb->prepare(
					"SELECT r.*
					FROM {$wpdb->prefix}lms_chat_thread_reactions r
					WHERE r.message_id = %d
					ORDER BY r.created_at ASC",
					$message_id
				));
			}
		}

		foreach ($reactions as &$reaction) {
			$reaction->display_name = $this->get_user_display_name($reaction->user_id);
		}

		if (!empty($cache_key)) {
			$this->cache_helper->set($cache_key, $reactions, 'lms_chat', 60); // 60秒間キャッシュ
		}

		return $reactions;
	}

	public function handle_get_reactions_updates()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
		$last_reaction_id = isset($_GET['last_reaction_id']) ? intval($_GET['last_reaction_id']) : 0;

		if (!$channel_id) {
			wp_send_json_error('チャンネルIDが指定されていません。');
			return;
		}

		global $wpdb;
		$reactions = $wpdb->get_results($wpdb->prepare(
			"SELECT r.*, u.display_name
			FROM {$wpdb->prefix}lms_chat_reactions r
			LEFT JOIN {$wpdb->users} u ON r.user_id = u.ID
			JOIN {$wpdb->prefix}lms_chat_messages m ON r.message_id = m.id
			WHERE m.channel_id = %d AND r.id > %d
			ORDER BY r.id ASC",
			$channel_id,
			$last_reaction_id
		));

		foreach ($reactions as &$reaction) {
			if (empty($reaction->display_name) && function_exists('get_userdata')) {
				$user = get_userdata($reaction->user_id);
				if ($user && !empty($user->display_name)) {
					$reaction->display_name = $user->display_name;
				} else {
					$reaction->display_name = "ユーザー{$reaction->user_id}";
				}
			}
		}

		wp_send_json_success($reactions);
	}

	/**
	 * メインメッセージの削除処理（メイン・スレッドメッセージ両方に対応）
	 */
	public function handle_delete_message()
	{
		global $wpdb;
		

		if (!$wpdb || $wpdb->last_error) {
			wp_send_json_error('データベース接続エラーが発生しました。');
			return;
		}
		
		$wpdb->query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");

		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : '';
		$nonce_valid = false;
		
		if ($nonce) {
			$nonce_actions = ['lms_chat_nonce', 'lms_ajax_nonce', 'lms_nonce'];
			foreach ($nonce_actions as $action) {
				if (wp_verify_nonce($nonce, $action)) {
					$nonce_valid = true;
					break;
				}
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
		$force_delete = isset($_POST['force_delete']) ? intval($_POST['force_delete']) : 0;
		
		$user_id = 0;
		if (function_exists('lms_get_current_user_id')) {
			$user_id = lms_lms_get_current_user_id();
		} elseif (isset($_SESSION['lms_user_id'])) {
			$user_id = intval($_SESSION['lms_user_id']);
		} elseif (function_exists('get_current_user_id')) {
			$user_id = lms_get_current_user_id();
		}
		if (!$message_id) {
			wp_send_json_error('メッセージIDが無効です。');
			return;
		}
		
		if (!$user_id) {
			wp_send_json_error('ユーザー認証が必要です。');
			return;
		}
		$skip_permission_check = $force_delete || true; // 一時的に常にスキップ

		$message_main = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
			$message_id
		));

		$message_thread = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
			$message_id
		));

		if (!$message_main && !$message_thread) {
			wp_send_json_success([
				'message' => 'メッセージは既に削除されています',
				'message_id' => $message_id,
				'already_deleted' => true,
				'physical_deletion' => true
			]);
			return;
		}

		if ($message_main) {
			$thread_count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d AND deleted_at IS NULL",
				$message_id
			));
			
			if ($thread_count > 0) {
				wp_send_json_error('返信のついたメッセージは削除できません。');
				return;
			}
		}

		if (!$skip_permission_check) {
			if ($message_main && intval($message_main->user_id) !== intval($user_id)) {
				wp_send_json_error('このメッセージの削除権限がありません。');
				return;
			}

			if ($message_thread && intval($message_thread->user_id) !== intval($user_id)) {
				wp_send_json_error('このメッセージの削除権限がありません。');
				return;
			}
		}

		$attachments = $wpdb->get_results($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments WHERE message_id = %d",
			$message_id
		));

		$upload_dir = wp_upload_dir();
		foreach ($attachments as $attachment) {
			$file_path = $upload_dir['basedir'] . '/chat-files-uploads/' . $attachment->file_path;
			if (file_exists($file_path)) {
				@unlink($file_path);
			}

			if (!empty($attachment->thumbnail_path)) {
				$thumb_path = $upload_dir['basedir'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
				if (file_exists($thumb_path)) {
					@unlink($thumb_path);
				}
			}

			$wpdb->delete(
				$wpdb->prefix . 'lms_chat_attachments',
				array('id' => $attachment->id),
				array('%d')
			);
		}

		try {
			// ソフトデリートインスタンスを取得
			if (!class_exists('LMS_Soft_Delete')) {
				throw new Exception('LMS_Soft_Delete class not found');
			}
			
			$soft_delete = LMS_Soft_Delete::get_instance();
			if (!$soft_delete) {
				throw new Exception('Failed to get LMS_Soft_Delete instance');
			}
			
			// 関連データをソフトデリート
			$current_time = current_time('mysql');
			$update_queries = [
				"UPDATE {$wpdb->prefix}lms_chat_reactions SET deleted_at = %s WHERE message_id = %d",
				"UPDATE {$wpdb->prefix}lms_chat_attachments SET deleted_at = %s WHERE message_id = %d", 
				"UPDATE {$wpdb->prefix}lms_chat_mentions SET deleted_at = %s WHERE message_id = %d",
				"UPDATE {$wpdb->prefix}lms_message_read_status SET deleted_at = %s WHERE message_id = %d"
			];
			
			foreach ($update_queries as $query) {
				$result = $wpdb->query($wpdb->prepare($query, $current_time, $message_id));
				if ($wpdb->last_error) {
				}
			}

			$main_deleted = false;
			$thread_deleted = false;
			
			if ($message_main) {
				$main_deleted = $soft_delete->soft_delete_message($message_id, $user_id);
			}
			
			if ($message_thread) {
				$parent_message_id = $message_thread->parent_message_id;
				$parent_message = $wpdb->get_row($wpdb->prepare(
					"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
					$parent_message_id
				));
				
				if ($parent_message) {
					$table_name = $wpdb->prefix . 'lms_chat_deletion_log';
					$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table_name'");
					
					if ($table_exists) {
						$insert_result = $wpdb->insert(
							$table_name,
							array(
								'message_id' => $message_id,
								'message_type' => 'thread',
								'thread_id' => $parent_message_id,
								'channel_id' => $parent_message->channel_id,
								'deleted_by' => $user_id,
								'deleted_at' => current_time('mysql')
							),
							array('%d', '%s', '%d', '%d', '%d', '%s')
						);
						
						if ($insert_result) {
						} else {
						}
					} else {
					}
				}
				
				$thread_deleted = $soft_delete->soft_delete_thread_message($message_id, $user_id);
			}
		} catch (Exception $e) {
			wp_send_json_error('削除処理中にエラーが発生しました: ' . $e->getMessage());
			return;
		}

		$deleted_messages = get_transient('lms_deleted_messages');
		if (!is_array($deleted_messages)) {
			$deleted_messages = array();
		}

		$deleted_messages[] = $message_id;

		$deleted_messages = array_unique($deleted_messages);

		set_transient('lms_deleted_messages', $deleted_messages, 30 * MINUTE_IN_SECONDS);
		
		// 統合Long Pollingシステム対応の削除通知
		if ($message_main) {
			$channel_id = $message_main->channel_id;
			
			// 旧版Long Pollingシステム（後方互換性）
			if (class_exists('LMS_Chat_LongPoll')) {
				$longpoll = LMS_Chat_LongPoll::get_instance();
				if ($longpoll) {
					$longpoll->on_message_deleted($message_id, $channel_id);
				}
			}
			
			// 統合Long Pollingシステム（メイン）
			if (class_exists('LMS_Unified_LongPoll')) {
				$unified_longpoll = LMS_Unified_LongPoll::get_instance();
				if ($unified_longpoll) {
					$unified_longpoll->on_message_deleted($message_id, $channel_id);
				}
			}
			
			// 完全版Long Pollingシステム
			if (class_exists('LMS_Complete_LongPoll')) {
				$complete_longpoll = LMS_Complete_LongPoll::get_instance();
				if ($complete_longpoll) {
					$complete_longpoll->on_message_deleted($message_id, $channel_id);
				}
			}
			
			// 旧来のtransient方式（フォールバック用）
			$main_delete_events = get_transient('lms_longpoll_main_delete_events') ?: array();
			$main_delete_events[] = array(
				'message_id' => $message_id,
				'channel_id' => $channel_id,
				'timestamp' => time(),
				'user_id' => $user_id
			);
			set_transient('lms_longpoll_main_delete_events', array_slice($main_delete_events, -100), 240);
			
		} elseif ($message_thread) {
			$parent_message = $wpdb->get_row($wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
				$message_thread->parent_message_id
			));

			if ($parent_message) {
				$channel_id = $parent_message->channel_id;
				
				// 旧版Long Pollingシステム（後方互換性）
				if (class_exists('LMS_Chat_LongPoll')) {
					$longpoll = LMS_Chat_LongPoll::get_instance();
					if ($longpoll) {
						$longpoll->on_thread_message_deleted($message_id, $message_thread->parent_message_id, $channel_id);
					}
				}
				
				// 統合Long Pollingシステム（メイン）
				if (class_exists('LMS_Unified_LongPoll')) {
					$unified_longpoll = LMS_Unified_LongPoll::get_instance();
					if ($unified_longpoll) {
						$unified_longpoll->on_thread_message_deleted($message_id, $message_thread->parent_message_id, $channel_id);
					}
				}
				
				// 完全版Long Pollingシステム
				if (class_exists('LMS_Complete_LongPoll')) {
					$complete_longpoll = LMS_Complete_LongPoll::get_instance();
					if ($complete_longpoll) {
						$complete_longpoll->on_thread_message_deleted($message_id, $message_thread->parent_message_id, $channel_id);
					}
				}
				
				// 旧来のtransient方式（フォールバック用）
				$thread_delete_events = get_transient('lms_longpoll_thread_delete_events') ?: array();
				$thread_delete_events[] = array(
					'message_id' => $message_id,
					'channel_id' => $channel_id,
					'thread_id' => $message_thread->parent_message_id,
					'timestamp' => time(),
				);
				set_transient('lms_longpoll_thread_delete_events', array_slice($thread_delete_events, -100), 240);
				
				// SSEイベント（既存維持）
				$this->trigger_sse_event('thread_message_deleted', [
					'message_id' => $message_id,
					'parent_message_id' => $message_thread->parent_message_id,
					'channel_id' => $channel_id,
					'user_id' => $user_id
				]);
			}
		}

		if (isset($this->cache_helper)) {
			$this->cache_helper->clear_all_cache();
		}
		
		
		$final_main_count = 0;
		$final_thread_count = 0;
		
		if ($message_main) {
			$final_main_count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d", 
				$message_id
			));
		}
		
		if ($message_thread) {
			$final_thread_count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d", 
				$message_id
			));
		}
		
		
		$deletion_successful = false;
		if ($message_main) {
			$deletion_successful = $main_deleted;
		}
		if ($message_thread) {
			$deletion_successful = $thread_deleted;
		}
		
		// 論理削除の検証（deleted_atカラムが正しく設定されているか）
		$soft_delete_success = false;
		
		if ($message_main && $main_deleted) {
			$deleted_at_check = $wpdb->get_var($wpdb->prepare(
				"SELECT deleted_at FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d", 
				$message_id
			));
			$soft_delete_success = !empty($deleted_at_check) && $deleted_at_check !== '0000-00-00 00:00:00';
		}
		
		if ($message_thread && $thread_deleted) {
			$deleted_at_check = $wpdb->get_var($wpdb->prepare(
				"SELECT deleted_at FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d", 
				$message_id
			));
			$soft_delete_success = !empty($deleted_at_check) && $deleted_at_check !== '0000-00-00 00:00:00';
		}
		
		// 論理削除の確認（deleted_atが正しく設定されているか）
		if (!$soft_delete_success) {
			wp_send_json_error('論理削除に失敗しました。deleted_atカラムが正しく設定されていません。');
			return;
		}
		
		// Action Hook を発火（WordPress標準のイベントシステムを使用）
		if ($message_main && $main_deleted) {
			do_action('lms_chat_message_deleted', $message_id, $message_main->channel_id, $user_id);
		}

		wp_send_json_success([
			'message' => 'メッセージを論理削除しました',
			'message_id' => $message_id,
			'sse_sent' => true,
			'deleted_from' => $message_main ? 'main_messages' : 'thread_messages',
			'logical_deletion' => true,
			'longpoll_event_created' => true,
			'action_hook_fired' => true,
			'verification' => [
				'main_deleted' => $main_deleted,
				'thread_deleted' => $thread_deleted,
				'soft_delete_success' => $soft_delete_success
			]
		]);
	}

	/**
	 * 緊急停止処理
	 */
	public function handle_emergency_stop() {
		$this->acquireSession(true);
		$_SESSION['emergency_stop_requests'] = true;
		$this->releaseSession();
		
		// 全てのLMS関連のトランジェントをクリア
		delete_transient('lms_longpoll_new_messages');
		delete_transient('lms_longpoll_main_delete_events');
		delete_transient('lms_longpoll_thread_delete_events');
		delete_transient('lms_deleted_messages');
		
		wp_send_json_success([
			'message' => 'Emergency stop activated',
			'timestamp' => time()
		]);
	}


	public function handle_mark_message_as_read()
	{
		global $wpdb;

		$this->acquireSession();
		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		$this->releaseSession();


		$nonce_valid = false;
		$nonce_fields = ['nonce', '_wpnonce', 'security'];
		
		foreach ($nonce_fields as $field) {
			if (isset($_POST[$field])) {
				if (wp_verify_nonce($_POST[$field], 'lms_ajax_nonce') || 
					wp_verify_nonce($_POST[$field], 'lms_chat_nonce')) {
					$nonce_valid = true;
					break;
				}
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		if (!$session_user_id) {
			wp_send_json_error('User not authenticated');
			return;
		}
		
		$user_id = (int)$session_user_id;
		$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;
		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;

		if (!$user_id || !$channel_id) {
			wp_send_json_error('Invalid parameters');
			return;
		}

		$last_viewed_at = current_time('mysql');
		
		if ($message_id) {
			$current_last_viewed = $wpdb->get_var($wpdb->prepare(
				"SELECT last_viewed_at FROM {$wpdb->prefix}lms_chat_last_viewed WHERE user_id = %d AND channel_id = %d",
				$user_id, $channel_id
			));
			
			$message_time = $wpdb->get_var($wpdb->prepare(
				"SELECT created_at FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
				$message_id
			));
			
			if ($message_time) {
				if (!$current_last_viewed || $message_time > $current_last_viewed) {
					$last_viewed_at = $message_time;
				} else {
					wp_send_json_success(array(
						'message_id' => $message_id,
						'last_viewed_at' => $current_last_viewed,
						'channel_id' => $channel_id,
						'already_read' => true
					));
					return;
				}
			}
		}

		$result = $wpdb->replace(
			$wpdb->prefix . 'lms_chat_last_viewed',
			array(
				'user_id' => $user_id,
				'channel_id' => $channel_id,
				'last_viewed_at' => $last_viewed_at
			),
			array('%d', '%d', '%s')
		);

		if ($result === false) {
			wp_send_json_error('Failed to update last viewed time');
			return;
		}

		if ($message_id) {
			$wpdb->replace(
				$wpdb->prefix . 'lms_chat_user_channel',
				array(
					'user_id' => $user_id,
					'channel_id' => $channel_id,
					'last_read_message_id' => $message_id
				),
				array('%d', '%d', '%d')
			);
		}

		$cache_key = $this->cache_helper->generate_key([$user_id], 'lms_chat_unread_counts_optimized');
		$this->cache_helper->delete($cache_key);
		
		
		wp_send_json_success(array(
			'message_id' => $message_id,
			'last_viewed_at' => $last_viewed_at,
			'channel_id' => $channel_id
		));
	}


	/**
	 * チャンネルの全てのメッセージとスレッドを既読にする
	 *
	 * @param int $channel_id チャンネルID
	 * @param int $user_id ユーザーID
	 * @return bool 処理結果
	 */
	public function mark_channel_all_as_read($channel_id, $user_id)
	{
		global $wpdb;
		
		if (!$channel_id || !$user_id) {
			throw new Exception('チャンネルIDまたはユーザーIDが無効です');
		}

		try {
			$wpdb->query('START TRANSACTION');

			$latest_message_id = $wpdb->get_var($wpdb->prepare(
				"SELECT MAX(id) FROM {$wpdb->prefix}lms_chat_messages WHERE channel_id = %d",
				$channel_id
			));
			if ($latest_message_id) {
				$exists = $wpdb->get_var($wpdb->prepare(
					"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_read_status
					WHERE channel_id = %d AND user_id = %d",
					$channel_id,
					$user_id
				));

				if ($exists) {
					$result = $wpdb->update(
						$wpdb->prefix . 'lms_chat_read_status',
						array(
							'last_read_message_id' => $latest_message_id,
							'updated_at' => current_time('mysql')
						),
						array(
							'channel_id' => $channel_id,
							'user_id' => $user_id
						),
						array('%d', '%s'),
						array('%d', '%d')
					);
				} else {
					$result = $wpdb->insert(
						$wpdb->prefix . 'lms_chat_read_status',
						array(
							'channel_id' => $channel_id,
							'user_id' => $user_id,
							'last_read_message_id' => $latest_message_id,
							'updated_at' => current_time('mysql')
						),
						array('%d', '%d', '%d', '%s')
					);
				}

				if ($result === false) {
					$error_msg = 'メインメッセージの既読更新に失敗しました: ' . $wpdb->last_error;
					throw new Exception($error_msg);
				}

				$thread_parents = $wpdb->get_col($wpdb->prepare(
					"SELECT DISTINCT m.id
					FROM {$wpdb->prefix}lms_chat_messages m
					INNER JOIN {$wpdb->prefix}lms_chat_thread_messages tm ON m.id = tm.parent_message_id
					WHERE m.channel_id = %d",
					$channel_id
				));

				if (!empty($thread_parents)) {
					foreach ($thread_parents as $parent_id) {
						$this->update_thread_last_viewed($parent_id, $user_id);
					}
				}
			}

			$this->update_last_viewed($user_id, $channel_id);

			$wpdb->query('COMMIT');

			return true;
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			return false;
		}
	}

	/**
	 * チャンネルの全てのメッセージとスレッドを既読にするAjaxハンドラ
	 */
	public function handle_mark_channel_all_as_read()
	{
		if (ob_get_length()) {
			ob_clean();
		}

		$this->acquireSession();

		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		$this->releaseSession();

		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : '';
		$nonce_valid = false;

		if ($nonce) {
			$nonce_actions = ['lms_chat_nonce', 'lms_ajax_nonce', 'lms_push_nonce'];
			foreach ($nonce_actions as $action) {
				if (wp_verify_nonce($nonce, $action)) {
					$nonce_valid = true;
					break;
				}
			}
		}

		if (!$nonce_valid) {
			if (defined('WP_DEBUG') && WP_DEBUG) {
			} else {
				wp_send_json_error('Invalid nonce');
				return;
			}
		}

		$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 0;

		if (!$channel_id || !$session_user_id) {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		try {
			$result = $this->mark_channel_all_as_read($channel_id, $session_user_id);

			if ($result) {
				wp_send_json_success(['message' => '全既読処理が完了しました']);
			} else {
				wp_send_json_error('全既読処理に失敗しました。');
			}
		} catch (Exception $e) {
			wp_send_json_error('エラーが発生しました: ' . $e->getMessage());
		} catch (Error $e) {
			wp_send_json_error('致命的なエラーが発生しました: ' . $e->getMessage());
		}
	}


	public function handle_mark_thread_messages_as_read()
	{
		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$this->acquireSession();

		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		$this->releaseSession();

		$message_ids = isset($_POST['message_ids']) ? array_map('intval', $_POST['message_ids']) : [];
		$parent_message_id = isset($_POST['parent_message_id']) ? intval($_POST['parent_message_id']) : 0;

		if (empty($message_ids) || !$session_user_id || !$parent_message_id) {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		global $wpdb;

		try {
			$wpdb->query('START TRANSACTION');

			$wpdb->replace(
				$wpdb->prefix . 'lms_chat_thread_last_viewed',
				array(
					'user_id' => $session_user_id,
					'parent_message_id' => $parent_message_id,
					'last_viewed_at' => current_time('mysql')
				),
				array('%d', '%d', '%s')
			);

			$old_unread_count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages
				WHERE parent_message_id = %d
				AND user_id != %d
				AND id IN (" . implode(',', array_fill(0, count($message_ids), '%d')) . ")",
				array_merge([$parent_message_id, $session_user_id], $message_ids)
			));

			$wpdb->query('COMMIT');

			wp_send_json_success(array(
				'marked_count' => count($message_ids),
				'old_unread_count' => (int)$old_unread_count
			));
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			wp_send_json_error($e->getMessage());
		}
	}


	/**
	 * プッシュ通知を送信する
	 */
	public function send_push_notifications($message_data)
	{

		$is_array = is_array($message_data);
		$message_data_keys = $is_array ? array_keys($message_data) : get_object_vars($message_data);
		$message_id = $is_array
			? (isset($message_data['id']) ? $message_data['id'] : (isset($message_data['message_id']) ? $message_data['message_id'] : 'unknown'))
			: (isset($message_data->id) ? $message_data->id : (isset($message_data->message_id) ? $message_data->message_id : 'unknown'));

		$channel_id = $is_array
			? (isset($message_data['channel_id']) ? (int)$message_data['channel_id'] : 0)
			: (isset($message_data->channel_id) ? (int)$message_data->channel_id : 0);

		$sender_id = $is_array
			? (isset($message_data['user_id']) ? (int)$message_data['user_id'] : 0)
			: (isset($message_data->user_id) ? (int)$message_data->user_id : 0);

		if (!class_exists('LMS_Push_Notification')) {
			return;
		}

		try {
			$push = LMS_Push_Notification::get_instance();

			if (!method_exists($push, 'is_enabled') || !$push->is_enabled()) {
				return;
			}
			if (!$channel_id) {
				return;
			}

			if (!$sender_id) {
				return;
			}
			$members = $this->get_channel_members($channel_id);
			if (empty($members)) {
				return;
			}
			if (method_exists($push, 'get_vapid_keys')) {
				$vapid_keys = $push->get_vapid_keys();
				if (empty($vapid_keys) || empty($vapid_keys['publicKey']) || empty($vapid_keys['privateKey'])) {
				} else {
				}
			}

			$notification_sent_count = 0;
			$notification_failed_count = 0;

			foreach ($members as $index => $member) {
				$member_id = (int)$member->id;
				$wp_user_id = isset($member->wp_user_id) ? (int)$member->wp_user_id : $member_id;
				$user_login = isset($member->user_login) ? $member->user_login : 'unknown';

				$is_sender = ($wp_user_id === $sender_id);
			}

			$sender_name = $is_array
				? (isset($message_data['display_name']) ? $message_data['display_name'] : (isset($message_data['user_name']) ? $message_data['user_name'] : '不明なユーザー'))
				: (isset($message_data->display_name) ? $message_data->display_name : (isset($message_data->user_name) ? $message_data->user_name : '不明なユーザー'));

			$channel_name = $is_array
				? (isset($message_data['channel_name']) ? $message_data['channel_name'] : 'チャット')
				: (isset($message_data->channel_name) ? $message_data->channel_name : 'チャット');

			$message_content = $is_array
				? (isset($message_data['message']) ? $message_data['message'] : '')
				: (isset($message_data->message) ? $message_data->message : '');

			$message_content = strip_tags($message_content);
			$message_content = strlen($message_content) > 100
				? substr($message_content, 0, 97) . '...'
				: $message_content;

			$has_attachments = $is_array
				? !empty($message_data['attachments'])
				: !empty($message_data->attachments);

			if ($has_attachments) {
				$attachments = $is_array ? $message_data['attachments'] : $message_data->attachments;
				$attachment_count = count($attachments);

				$message_content .= $message_content ? "\n" : '';
				$message_content .= $attachment_count === 1
					? '添付ファイルがあります。'
					: $attachment_count . '個の添付ファイルがあります。';
			}

			$message_id_for_notification = $is_array
				? (isset($message_data['id']) ? (int)$message_data['id'] : 0)
				: (isset($message_data->id) ? (int)$message_data->id : 0);

			$has_avatar = $is_array
				? (isset($message_data['avatar_url']) && !empty($message_data['avatar_url']))
				: (isset($message_data->avatar_url) && !empty($message_data->avatar_url));

			$avatar_url = $is_array
				? (isset($message_data['avatar_url']) ? $message_data['avatar_url'] : '')
				: (isset($message_data->avatar_url) ? $message_data->avatar_url : '');

			$icon_url = $has_avatar
				? $avatar_url
				: get_template_directory_uri() . '/img/icon-notification.svg';

			foreach ($members as $member) {
				$member_id = (int)$member->id;
				$wp_user_id = isset($member->wp_user_id) ? (int)$member->wp_user_id : $member_id;
				$user_login = isset($member->user_login) ? $member->user_login : 'unknown';

				if ($wp_user_id === $sender_id) {
					continue;
				}

				try {
					$title = sprintf('%s - %s', $sender_name, $channel_name);

					$recipient_id = $wp_user_id;

					$notification_data = [
						'url' => home_url('/chat/'),
						'channelId' => $channel_id,
						'messageId' => $message_id_for_notification,
						'channelName' => $channel_name,
						'senderId' => $sender_id,
						'senderName' => $sender_name,
						'recipientId' => $recipient_id, // 重要: 受信者IDをこのメンバーのIDに設定
						'timestamp' => time() * 1000,
						'testMode' => false
					];
					if (method_exists($push, 'get_user_subscription')) {
						$subscription = $push->get_user_subscription($recipient_id);
						if (empty($subscription)) {
							continue; // 購読情報がない場合はスキップ
						}
					}

					$result = $push->send_notification(
						$recipient_id,
						$title,
						$message_content,
						$icon_url,
						$notification_data
					);

					if ($result) {
						$notification_sent_count++;
					} else {
						$notification_failed_count++;
					}
				} catch (Exception $e) {
					$notification_failed_count++;
				}
			}

		} catch (Exception $e) {
		}
	}

	private function format_thread_messages($messages)
	{
		$formatted = [];
		foreach ($messages as $message) {
			if (isset($message->created_at)) {
				$message->created_at = date('c', strtotime($message->created_at));
			} else {
				$message->created_at = date('c');
			}
			$formatted[] = $message;
		}
		return $formatted;
	}

	/**
	 * 単一スレッドメッセージのフォーマット
	 */
	public function format_thread_message($message)
	{
		if (!is_object($message)) {
			return null;
		}

		// メッセージオブジェクトのコピーを作成
		$formatted_message = clone $message;

		// 時刻フォーマット
		if (isset($formatted_message->created_at)) {
			$formatted_message->formatted_time = date('H:i', strtotime($formatted_message->created_at));
			$formatted_message->created_at = date('c', strtotime($formatted_message->created_at));
		} else {
			$formatted_message->created_at = date('c');
			$formatted_message->formatted_time = date('H:i');
		}

		// ユーザー情報の補完
		if (empty($formatted_message->display_name)) {
			$formatted_message->display_name = 'ユーザー';
		}

		// その他の必要なフィールド
		$formatted_message->is_current_user = false; // デフォルト値

		return $formatted_message;
	}

	/**
	 * リアクションを追加または削除するAjaxハンドラー
	 */
	public function handle_toggle_reaction()
	{
		$request_id = uniqid('req_', true);
		

		$nonce_valid = false;
		
		if (check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
			$nonce_valid = true;
		}
		elseif (isset($_POST['nonce']) && wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
			$nonce_valid = true;
		}
		elseif (isset($_SESSION['lms_user_id']) && intval($_SESSION['lms_user_id']) > 0) {
			$nonce_valid = true;
		}

		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$is_logged_in = false;
		if (lms_is_user_logged_in()) {
			$is_logged_in = true;
		} elseif (isset($_SESSION['lms_user_id']) && intval($_SESSION['lms_user_id']) > 0) {
			$is_logged_in = true;
		}
		
		if (!$is_logged_in) {
			wp_send_json_error('ログインが必要です');
			return;
		}

		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
		$emoji = isset($_POST['emoji']) ? sanitize_text_field($_POST['emoji']) : '';
		
		$user_id = 0;
		
		if (function_exists('lms_get_current_user_id')) {
			$user_id = lms_lms_get_current_user_id();
		}
		
		if (!$user_id && isset($_POST['user_id']) && intval($_POST['user_id']) > 0) {
			$user_id = intval($_POST['user_id']);
		}
		
		if (!$user_id && function_exists('get_current_user_id')) {
			$user_id = lms_get_current_user_id();
		}
		if (!$message_id || !$emoji || !$user_id) {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		$lock_key = "reaction_lock_{$user_id}_{$message_id}_{$emoji}";
		$lock_timeout = 10; // 10秒
		
		if (get_transient($lock_key)) {
			wp_send_json_error('同じリアクションが処理中です。しばらくお待ちください。');
			return;
		}
		
		set_transient($lock_key, $request_id, $lock_timeout);

		global $wpdb;

		$existing = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM {$wpdb->prefix}lms_chat_reactions
			WHERE message_id = %d AND user_id = %d AND reaction = %s",
			$message_id,
			$user_id,
			$emoji
		));

		$is_removing = isset($_POST['is_removing']) && $_POST['is_removing'] == 1;
		
		// デバッグ: リアクション処理の詳細をログ出力

		$all_reactions_before = $wpdb->get_results($wpdb->prepare(
			"SELECT id, user_id, reaction FROM {$wpdb->prefix}lms_chat_reactions WHERE message_id = %d ORDER BY id",
			$message_id
		));

		if ($is_removing) {
			// 削除要求の場合
			if (!$existing) {
				// 削除しようとしているリアクションが存在しない
				delete_transient($lock_key);
				wp_send_json_error('削除対象のリアクションが存在しません。');
				return;
			}
			
			// リアクションをハードデリート（物理削除）
			$result = $wpdb->delete(
				$wpdb->prefix . 'lms_chat_reactions',
				array(
					'message_id' => $message_id,
					'user_id' => $user_id,
					'reaction' => $emoji
				),
				array('%d', '%d', '%s')
			);
			
			if ($result === false) {
				delete_transient($lock_key);
				wp_send_json_error('リアクションの削除に失敗しました。');
				return;
			}
			
			// 削除確認
			$still_exists = $wpdb->get_var($wpdb->prepare(
				"SELECT id FROM {$wpdb->prefix}lms_chat_reactions
				WHERE message_id = %d AND user_id = %d AND reaction = %s",
				$message_id,
				$user_id,
				$emoji
			));
			
			if ($still_exists) {
				delete_transient($lock_key);
				wp_send_json_error('リアクションの削除に失敗しました（削除されませんでした）');
				return;
			}
		} else {
			// 追加要求の場合
			if ($existing) {
				// 既に同じリアクションが存在するため、削除する（トグル動作）
				$result = $wpdb->delete(
					$wpdb->prefix . 'lms_chat_reactions',
					array(
						'message_id' => $message_id,
						'user_id' => $user_id,
						'reaction' => $emoji
					),
					array('%d', '%d', '%s')
				);
				
				if ($result === false) {
					delete_transient($lock_key);
					wp_send_json_error('リアクションの削除に失敗しました。');
					return;
				}
			} else {
				// 新しいリアクションを追加
				$result = $wpdb->insert(
					$wpdb->prefix . 'lms_chat_reactions',
					array(
						'message_id' => $message_id,
						'user_id' => $user_id,
						'reaction' => $emoji,
						'created_at' => current_time('mysql')
					),
					array('%d', '%d', '%s', '%s')
				);

				if ($result === false) {
					if (strpos($wpdb->last_error, 'Duplicate entry') !== false) {
						// 重複エラーの場合は削除処理
						$delete_result = $wpdb->delete(
							$wpdb->prefix . 'lms_chat_reactions',
							array(
								'message_id' => $message_id,
								'user_id' => $user_id,
								'reaction' => $emoji
							),
							array('%d', '%d', '%s')
						);
						
						if ($delete_result === false) {
							delete_transient($lock_key);
							wp_send_json_error('リアクションの削除に失敗しました。');
							return;
						}
					} else {
						delete_transient($lock_key);
						wp_send_json_error('リアクションの追加に失敗しました。');
						return;
					}
				}
			}
		}

		$reaction_cache_key = $this->cache_helper->generate_message_key($message_id, 'reactions');
		$this->cache_helper->delete($reaction_cache_key);
		
		$cache_key = $this->cache_helper->generate_key([$message_id], 'lms_chat_reactions');
		$this->cache_helper->delete($cache_key);

		$reactions = $wpdb->get_results($wpdb->prepare(
			"SELECT r.*
			FROM {$wpdb->prefix}lms_chat_reactions r
			WHERE r.message_id = %d
			ORDER BY r.created_at ASC",
			$message_id
		));

		foreach ($reactions as &$reaction) {
			$reaction->display_name = $this->get_user_display_name($reaction->user_id);
			$reaction->user_id = intval($reaction->user_id);
		}
		
		
		$this->notify_reaction_update($message_id, $reactions, false);
		
		delete_transient($lock_key);
		
		wp_send_json_success($reactions);
	}

	/**
	 * リアクション更新を取得するAjaxハンドラー
	 */
	public function handle_get_reaction_updates()
	{
		try {
			$this->acquireSession();

			$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
			$user_authenticated = $session_user_id > 0;

			$this->releaseSession();

			if (!$user_authenticated) {
					wp_send_json_error('認証が必要です');
				return;
			}

			$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : (isset($_GET['nonce']) ? $_GET['nonce'] : '');
			if (!empty($nonce)) {
				if (!wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
					}
			}

			$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : (isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0);
			$last_timestamp = isset($_POST['last_timestamp']) ? intval($_POST['last_timestamp']) : (isset($_GET['last_timestamp']) ? intval($_GET['last_timestamp']) : 0);
			// ⚠️ LMSユーザーのみ - WordPressユーザーは考慮しない
			$user_id = $session_user_id;

			if (!$channel_id || !$user_id) {
					wp_send_json_error('必要なパラメータが不足しています');
				return;
			}

			$updates = $this->get_reaction_updates($channel_id, $user_id, $last_timestamp);
			wp_send_json_success($updates);
		} catch (Exception $e) {
			wp_send_json_error('内部エラーが発生しました: ' . $e->getMessage());
		}
	}


	public function handle_get_thread_reaction_updates()
	{
		// Thread reaction updates handler
		
		$this->acquireSession();
		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		$this->releaseSession();

		// ⚠️ LMSユーザーのみ - WordPressユーザーは考慮しない
		$user_id = $session_user_id;
		if (!$user_id) {
			wp_send_json_error('認証が必要です');
			return;
		}

		$nonce = isset($_REQUEST['nonce']) ? sanitize_text_field(wp_unslash($_REQUEST['nonce'])) : '';
		if (!empty($nonce) && !wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
			wp_send_json_error('無効なnonce');
			return;
		}

		$thread_param = isset($_REQUEST['thread_id']) ? intval($_REQUEST['thread_id']) : 0;
		$last_timestamp = isset($_REQUEST['last_timestamp']) ? intval($_REQUEST['last_timestamp']) : 0;

		$thread_ids = array();
		if ($thread_param > 0) {
			$thread_ids[] = $thread_param;
		}

		if (isset($_REQUEST['thread_ids'])) {
			$raw_ids = $_REQUEST['thread_ids'];
			if (is_array($raw_ids)) {
				foreach ($raw_ids as $raw_id) {
					$parsed = intval($raw_id);
					if ($parsed > 0) {
						$thread_ids[] = $parsed;
					}
				}
			} else {
				$raw_string = sanitize_text_field(wp_unslash($raw_ids));
				if (!empty($raw_string)) {
					$parts = array_slice(explode(',', $raw_string), 0, 25);
					foreach ($parts as $part) {
						$parsed = intval($part);
						if ($parsed > 0) {
							$thread_ids[] = $parsed;
						}
					}
				}
			}
		}

		$thread_ids = array_values(array_unique(array_filter($thread_ids, static function ($value) {
			return intval($value) > 0;
		})));

		$updates = $this->get_thread_reaction_updates($thread_ids, $user_id, $last_timestamp);

		// Thread reaction updates completed
		
		wp_send_json_success($updates);
	}


	/**
	 * スレッドメッセージのリアクションを追加または削除するAjaxハンドラー（ソフトデリート対応版）
	 */
	public function handle_toggle_thread_reaction()
	{
		$this->acquireSession();
		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		$this->releaseSession();

		$nonce = isset($_POST['nonce']) ? sanitize_text_field(wp_unslash($_POST['nonce'])) : '';
		$nonce_valid = false;

		if (!empty($nonce) && wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
			$nonce_valid = true;
		} elseif (check_ajax_referer('lms_ajax_nonce', 'nonce', false)) {
			$nonce_valid = true;
		} elseif ($session_user_id > 0) {
			$nonce_valid = true;
		}

		if (!$nonce_valid) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = 0;
		if (function_exists('lms_get_current_user_id')) {
			$user_id = (int) lms_lms_get_current_user_id();
		}
		if (!$user_id && isset($_POST['user_id'])) {
			$user_id = intval($_POST['user_id']);
		}
		if (!$user_id && $session_user_id > 0) {
			$user_id = $session_user_id;
		}
		if (!$user_id) {
			$user_id = lms_is_user_logged_in() ? lms_get_current_user_id() : 0;
		}

		if (!$user_id) {
			wp_send_json_error('ログインが必要です');
			return;
		}

		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
		$emoji = isset($_POST['emoji']) ? sanitize_text_field(wp_unslash($_POST['emoji'])) : '';
		$is_removing = !empty($_POST['is_removing']);
		$thread_id = isset($_POST['thread_id']) ? intval($_POST['thread_id']) : 0;

		if (!$message_id || $emoji === '') {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		if (!$thread_id) {
			$thread_id = (int) $this->get_thread_parent_message_id($message_id);
		}

		if (!class_exists('LMS_Reaction_Service')) {
			require_once get_template_directory() . '/includes/class-lms-reaction-service.php';
		}

		$service = LMS_Reaction_Service::get_instance();
		$result = $service->toggle_thread(
			$message_id,
			$emoji,
			$user_id,
			array(
				'is_removing' => $is_removing,
				'thread_id' => $thread_id,
			)
		);

		if (!empty($result['success'])) {
			wp_send_json_success($result);
			return;
		}

		$error_message = isset($result['error']) ? $result['error'] : 'リアクションの更新中にエラーが発生しました。';
		wp_send_json_error($error_message);
	}

	/**
	 * スレッドリアクションテーブルを作成
	 */
	public function create_thread_reactions_table() {
		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_thread_reactions (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			message_id bigint(20) NOT NULL,
			user_id bigint(20) NOT NULL,
			reaction varchar(50) NOT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY idx_message_id (message_id),
			KEY idx_user_id (user_id),
			UNIQUE KEY unique_message_user_reaction (message_id, user_id, reaction)
		) $charset_collate;";

		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		
		$result = $wpdb->query($sql);
		
		if ($result === false) {
		} else {
		}
		
		dbDelta($sql);
	}

	/**
	 * スレッドメッセージの親IDを取得
	 */
	public function get_thread_parent_message_id($message_id)
	{
		if (!$message_id) {
			return null;
		}

		global $wpdb;
		return $wpdb->get_var($wpdb->prepare(
			"SELECT parent_message_id FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
			$message_id
		));
	}

	/**
	 * スレッドリアクション関連キャッシュを削除
	 */
	public function clear_thread_reaction_cache($message_id, $parent_message_id = null)
	{
		if (!$message_id) {
			return $parent_message_id;
		}

		$cache_key = $this->cache_helper->generate_key([$message_id], 'lms_chat_thread_reactions');
		if (!empty($cache_key)) {
			$this->cache_helper->delete($cache_key, 'lms_chat');
		}

		wp_cache_delete("thread_reactions_{$message_id}", 'lms_thread_reactions');
		delete_transient("thread_reactions_cache_{$message_id}");

		if (null === $parent_message_id) {
			$parent_message_id = $this->get_thread_parent_message_id($message_id);
		}

		return $parent_message_id;
	}

	/**
	 * スレッドリアクションキャッシュのバージョンを取得
	 */
	private function get_thread_reaction_version($parent_message_id)
	{
		if (!$parent_message_id) {
			return 0;
		}

		$cache_key = "thread_reaction_version_{$parent_message_id}";
		$group = 'lms_thread_reaction_versions';

		$version = wp_cache_get($cache_key, $group);
		if (false === $version) {
			$version = get_transient($cache_key);
			if (false === $version || $version <= 0) {
				$version = 1;
			}
			wp_cache_set($cache_key, $version, $group, 6 * HOUR_IN_SECONDS);
		}

		return (int) $version;
	}

	/**
	 * スレッドリアクションキャッシュのバージョンを更新
	 */
	public function bump_thread_reaction_version($parent_message_id)
	{
		if (!$parent_message_id) {
			return;
		}

		$cache_key = "thread_reaction_version_{$parent_message_id}";
		$group = 'lms_thread_reaction_versions';

		$version = wp_cache_get($cache_key, $group);
		if (false === $version) {
			$version = get_transient($cache_key);
		}

		$version = (int) $version + 1;
		if ($version <= 0) {
			$version = 1;
		}

		wp_cache_set($cache_key, $version, $group, 6 * HOUR_IN_SECONDS);
		set_transient($cache_key, $version, 6 * HOUR_IN_SECONDS);
	}

	/**
	 * 複数のスレッドメッセージのリアクションを取得するAjaxハンドラー
	 */
	public function handle_get_thread_reactions()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('無効なnonce');
			return;
		}

		$message_ids = isset($_GET['message_ids']) ? sanitize_text_field($_GET['message_ids']) : '';

		if (empty($message_ids)) {
			wp_send_json_error('メッセージIDが指定されていません');
			return;
		}

		$message_ids_array = array_map('intval', explode(',', $message_ids));

		if (empty($message_ids_array)) {
			wp_send_json_error('有効なメッセージIDがありません');
			return;
		}

		$result = array();
		foreach ($message_ids_array as $message_id) {
			$result[$message_id] = $this->get_thread_message_reactions($message_id);
		}

		wp_send_json_success($result);
	}

	/**
	 * 単一のスレッドメッセージのリアクションを取得するAjaxハンドラー
	 */
	public function handle_get_thread_message_reactions()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('無効なnonce');
			return;
		}

		$message_id = isset($_GET['message_id']) ? intval($_GET['message_id']) : 0;

		if (!$message_id) {
			wp_send_json_error('メッセージIDが指定されていません');
			return;
		}

		$reactions = $this->get_thread_message_reactions($message_id);
		wp_send_json_success($reactions);
	}
	/**
	 * 必要なテーブルを確認し、不足していれば作成する
	 */
	public function check_and_create_tables()
	{
		global $wpdb;

		$thread_table = $wpdb->prefix . 'lms_chat_thread_messages';
		$thread_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$thread_table}'");
		if (!$thread_table_exists) {
			$this->create_thread_tables();
		}

		$this->add_deleted_at_to_thread_messages();

		$thread_reaction_table = $wpdb->prefix . 'lms_chat_thread_reactions';
		$thread_reaction_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$thread_reaction_table}'");
		if (!$thread_reaction_table_exists) {
			$this->create_thread_reactions_table();
		}

		$attachments_table = $wpdb->prefix . 'lms_chat_attachments';
		$attachments_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$attachments_table}'");
		if (!$attachments_table_exists) {
			$this->create_attachments_table();
		}
	}

	/**
	 * メッセージ時間をフォーマットする
	 *
	 * @param string $datetime 日時文字列
	 * @param bool $for_search 検索結果用かどうか
	 * @return string フォーマットされた時間文字列
	 */
	public function format_message_time($datetime, $for_search = false)
	{
		$timestamp = strtotime($datetime);

		if ($for_search) {
			return date('Y/m/d H:i', $timestamp);
		}

		$now = time();
		$diff = $now - $timestamp;

		if ($diff < 86400) {
			return date('H:i', $timestamp);
		}
		elseif ($diff < 604800) {
			$weekdays = ['日', '月', '火', '水', '木', '金', '土'];
			$weekday = $weekdays[date('w', $timestamp)];
			return $weekday . ' ' . date('H:i', $timestamp);
		}
		else {
			return date('Y/m/d H:i', $timestamp);
		}
	}

	/**
	 * メッセージの添付ファイルHTMLを取得
	 */
	public function get_message_attachments_html($message_id)
	{
		global $wpdb;

		$attachments = $wpdb->get_results($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments WHERE message_id = %d ORDER BY id ASC",
			$message_id
		));

		if (empty($attachments)) {
			return '';
		}

		$html = '<div class="message-attachments">';

		foreach ($attachments as $attachment) {
			$file_url = content_url('uploads/lms-chat/' . $attachment->file_path);
			$file_name = esc_html($attachment->file_name);
			$file_size = size_format($attachment->file_size);
			$file_type = strtolower(pathinfo($attachment->file_name, PATHINFO_EXTENSION));

			if (in_array($file_type, ['jpg', 'jpeg', 'png', 'gif'])) {
				$html .= "<div class='attachment attachment-image'>";
				$html .= "<a href='{$file_url}' target='_blank' class='image-link'>";
				$html .= "<img src='{$file_url}' alt='{$file_name}' loading='lazy'>";
				$html .= "</a>";
				$html .= "<div class='attachment-info'>{$file_name} ({$file_size})</div>";
				$html .= "</div>";
			} else {
				$html .= "<div class='attachment attachment-file'>";
				$html .= "<a href='{$file_url}' target='_blank' class='file-link'>";
				$html .= "<div class='file-icon'>{$file_type}</div>";
				$html .= "<div class='file-info'>";
				$html .= "<div class='file-name'>{$file_name}</div>";
				$html .= "<div class='file-size'>{$file_size}</div>";
				$html .= "</div>";
				$html .= "</a>";
				$html .= "</div>";
			}
		}

		$html .= '</div>';
		return $html;
	}

	/**
	 * リアクションテーブルが存在するか確認し、なければ作成するエンドポイント
	 */
	public function handle_ensure_thread_reaction_table()
	{
		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('無効なnonceです');
			return;
		}

		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_chat_thread_reactions';

		$table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$table_name}'") === $table_name;

		if (!$table_exists) {
			$this->create_thread_reactions_table();
			$table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$table_name}'") === $table_name;
		}

		if ($table_exists) {
			wp_send_json_success(array(
				'table_name' => $table_name,
				'exists' => true,
				'columns' => $wpdb->get_results("DESCRIBE {$table_name}")
			));
		} else {
			wp_send_json_error(array(
				'message' => 'テーブルの作成に失敗しました',
				'table_name' => $table_name,
				'exists' => false,
				'last_error' => $wpdb->last_error
			));
		}
	}

	/**
	 * スレッドメッセージ削除ハンドラ
	 *
	 * スレッドメッセージの論理削除（deleted_atカラムの設定）を行います
	 *
	 * @return void
	 */
	public function handle_delete_thread_message()
	{
		
		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : '';
		$nonce_valid = false;
		
		if ($nonce) {
			$nonce_actions = ['lms_ajax_nonce', 'lms_chat_nonce', 'lms_nonce'];
			foreach ($nonce_actions as $action) {
				if (wp_verify_nonce($nonce, $action)) {
					$nonce_valid = true;
					break;
				}
			}
		}
		
		if (!$nonce_valid) {
			wp_send_json_error('セキュリティトークンが無効です');
			return;
		}

		global $wpdb;

		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
		
		$user_id = $this->get_authenticated_user_id_optimized();
		

		if (!$message_id || !$user_id) {
			wp_send_json_error('必要なパラメータが不足しています。');
			return;
		}

		$this->create_thread_reactions_table();
		$this->add_deleted_at_to_thread_messages();

		$message_thread = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
			$message_id
		));

		if (!$message_thread) {
			wp_send_json_error('メッセージが存在しません。');
			return;
		}

		$parent_message_id = $message_thread->parent_message_id;

		$attachments = $wpdb->get_results($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_attachments WHERE message_id = %d",
			$message_id
		));

		$upload_dir = wp_upload_dir();
		foreach ($attachments as $attachment) {
			$file_path = $upload_dir['basedir'] . '/chat-files-uploads/' . $attachment->file_path;
			if (file_exists($file_path)) {
				@unlink($file_path);
			}

			if (!empty($attachment->thumbnail_path)) {
				$thumb_path = $upload_dir['basedir'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
				if (file_exists($thumb_path)) {
					@unlink($thumb_path);
				}
			}

			$wpdb->delete(
				$wpdb->prefix . 'lms_chat_attachments',
				array('id' => $attachment->id),
				array('%d')
			);
		}

		// ソフトデリートを使用
		$soft_delete = LMS_Soft_Delete::get_instance();
		$result = $soft_delete->soft_delete_thread_message($message_id);

		if ($result === false) {
			wp_send_json_error('メッセージの削除に失敗しました。');
			return;
		}

		$this->clear_thread_cache($parent_message_id);

		$deleted_messages = get_transient('lms_deleted_messages');
		if (!is_array($deleted_messages)) {
			$deleted_messages = array();
		}

		$deleted_messages[] = $message_id;

		$deleted_messages = array_unique($deleted_messages);

		set_transient('lms_deleted_messages', $deleted_messages, 30 * MINUTE_IN_SECONDS);

		$parent_message = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
			$parent_message_id
		));

		if ($parent_message) {
			$this->ensure_deletion_log_table_exists();
			
			$insert_result = $wpdb->insert(
				$wpdb->prefix . 'lms_chat_deletion_log',
				array(
					'message_id' => $message_id,
					'message_type' => 'thread',
					'thread_id' => $parent_message_id,
					'channel_id' => $parent_message->channel_id,
					'user_id' => $user_id,
					'deleted_at' => current_time('mysql')
				),
				array('%d', '%s', '%d', '%d', '%d', '%s')
			);
			
			$this->trigger_sse_event('thread_message_deleted', [
				'message_id' => $message_id,
				'parent_message_id' => $parent_message_id,
				'channel_id' => $parent_message->channel_id,
				'user_id' => $user_id,
				'timestamp' => time()
			]);
			
			do_action('lms_chat_thread_message_deleted', $message_id, $parent_message_id, $parent_message->channel_id);
		}

		wp_send_json_success();
	}

	/**
	 * 削除ログテーブルが存在することを確認
	 */
	private function ensure_deletion_log_table_exists()
	{
		global $wpdb;
		
		$table_name = $wpdb->prefix . 'lms_chat_deletion_log';
		
		$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table_name'");
		
		if (!$table_exists) {
			$charset_collate = $wpdb->get_charset_collate();
			
			$sql = "CREATE TABLE $table_name (
				id int(11) NOT NULL AUTO_INCREMENT,
				message_id int(11) NOT NULL,
				message_type varchar(10) NOT NULL DEFAULT 'main',
				thread_id int(11) DEFAULT NULL,
				channel_id varchar(50) NOT NULL,
				deleted_by int(11) NOT NULL,
				deleted_at datetime NOT NULL,
				PRIMARY KEY (id),
				KEY idx_channel_deleted (channel_id, deleted_at),
				KEY idx_message_type (message_type),
				KEY idx_thread_id (thread_id)
			) $charset_collate;";
			
			require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
			dbDelta($sql);
		}
	}

	/**
	 * スレッドに関連するキャッシュをクリアする
	 *
	 * @param int $parent_message_id 親メッセージID
	 */
	private function clear_thread_cache($parent_message_id)
	{
		$thread_info_key = $this->cache_helper->generate_key([$parent_message_id, lms_get_current_user_id()], 'lms_chat_thread_info');
		$this->cache_helper->delete($thread_info_key, 'lms_chat');
		$this->bump_thread_reaction_version($parent_message_id);

		for ($page = 1; $page <= 10; $page++) {
			$thread_messages_key = $this->cache_helper->generate_key([$parent_message_id, $page, 50, lms_get_current_user_id()], 'lms_chat_thread_messages');
			$this->cache_helper->delete($thread_messages_key, 'lms_chat');
		}

		$thread_total_key = $this->cache_helper->generate_key([$parent_message_id], 'lms_chat_thread_total');
		$this->cache_helper->delete($thread_total_key, 'lms_chat');
	}

	/**
	 * スレッド情報を取得するAjaxハンドラー
	 */
	public function handle_get_thread_info($parent_message_id = null, $channel_id = null)
	{
		$debug_request = [
			'timestamp' => date('Y-m-d H:i:s'),
			'method' => $_SERVER['REQUEST_METHOD'],
			'post_data' => $_POST,
			'get_data' => $_GET,
			'function_args' => func_get_args()
		];

		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : (isset($_GET['nonce']) ? $_GET['nonce'] : '');
		
		if (func_num_args() >= 2) {
		} else {
			if (!$nonce || !wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
				wp_send_json_error('Invalid nonce');
				return;
			}
		}

		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		if (!$user_id) {
			wp_send_json_error('User not found');
			return;
		}

		$parent_message_ids = [];
		
		if ($parent_message_id !== null && $parent_message_id > 0) {
			$parent_message_ids = [intval($parent_message_id)];
		}
		elseif (isset($_POST['parent_message_ids']) && is_array($_POST['parent_message_ids'])) {
			$parent_message_ids = array_map('intval', $_POST['parent_message_ids']);
		}
		elseif (isset($_POST['parent_message_id']) && $_POST['parent_message_id'] > 0) {
			$parent_message_ids = [intval($_POST['parent_message_id'])];
		}
		elseif (isset($_GET['parent_message_ids'])) {
			$ids_string = sanitize_text_field($_GET['parent_message_ids']);
			$parent_message_ids = array_map('intval', explode(',', $ids_string));
		}
		elseif (isset($_GET['parent_message_id']) && $_GET['parent_message_id'] > 0) {
			$parent_message_ids = [intval($_GET['parent_message_id'])];
		}

		if (empty($parent_message_ids)) {
			wp_send_json_error('Parent message ID is required');
			return;
		}

		if ($channel_id === null) {
			$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : (isset($_GET['channel_id']) ? intval($_GET['channel_id']) : null);
		}
		global $wpdb;
		$response_data = [];

		foreach ($parent_message_ids as $msg_id) {
			$msg_id = intval($msg_id);
			if ($msg_id <= 0) continue;

			if ($channel_id !== null) {
				$parent_channel = $wpdb->get_var($wpdb->prepare(
					"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
					$msg_id
				));
				if ($parent_channel != $channel_id) {
					continue;
				}
			}

			$thread_count_query = "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages 
				WHERE parent_message_id = %d AND deleted_at IS NULL";
			$thread_count = $wpdb->get_var($wpdb->prepare($thread_count_query, $msg_id));
			
			$debug_thread_query = $wpdb->prepare($thread_count_query, $msg_id);
			
			$debug_messages_info = $wpdb->get_results($wpdb->prepare(
				"SELECT id, message, user_id, created_at, deleted_at 
				FROM {$wpdb->prefix}lms_chat_thread_messages 
				WHERE parent_message_id = %d 
				ORDER BY created_at ASC",
				$msg_id
			));
			if ($thread_count > 0) {
				$latest_reply_time = $wpdb->get_var($wpdb->prepare(
					"SELECT MAX(created_at) FROM {$wpdb->prefix}lms_chat_thread_messages 
					WHERE parent_message_id = %d AND deleted_at IS NULL",
					$msg_id
				));

				$latest_reply = '';
				if ($latest_reply_time) {
					$timestamp = strtotime($latest_reply_time);
					$diff = time() - $timestamp;
					if ($diff < 60) {
						$latest_reply = 'たった今';
					} elseif ($diff < 3600) {
						$latest_reply = floor($diff / 60) . '分前';
					} elseif ($diff < 86400) {
						$latest_reply = floor($diff / 3600) . '時間前';
					} else {
						$latest_reply = floor($diff / 86400) . '日前';
					}
				}

				$unread_count = 0;
				if ($user_id > 0) {
					$unread_count = $wpdb->get_var($wpdb->prepare(
						"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
						LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
							ON v.parent_message_id = t.parent_message_id AND v.user_id = %d
						WHERE t.parent_message_id = %d AND t.user_id != %d AND t.deleted_at IS NULL
						AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)",
						$user_id, $msg_id, $user_id
					));
				}

				$avatar_query = "
					SELECT 
						u.id as user_id,
						u.display_name,
						u.avatar_url,
						MIN(t.created_at) as first_post_time
					FROM {$wpdb->prefix}lms_chat_thread_messages t
					INNER JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
					WHERE t.parent_message_id = %d
					AND t.deleted_at IS NULL
					AND u.status = 'active'
					GROUP BY u.id, u.display_name, u.avatar_url
					ORDER BY first_post_time ASC
				";

				$avatar_results = $wpdb->get_results($wpdb->prepare($avatar_query, $msg_id));
				
				if ($wpdb->last_error) {
				}

				$avatars = [];
				if ($avatar_results) {
					foreach ($avatar_results as $user) {
						$avatars[] = [
							'user_id' => (int) $user->user_id,
							'display_name' => $user->display_name,
							'avatar_url' => $user->avatar_url ?: '',
						];
					}
				}
				$response_data[$msg_id] = [
					'thread_count' => (int) $thread_count,
					'thread_unread_count' => (int) $unread_count,
					'latest_reply' => $latest_reply,
					'avatars' => $avatars
				];
			} else {
				$response_data[$msg_id] = [
					'thread_count' => 0,
					'thread_unread_count' => 0,
					'latest_reply' => '',
					'avatars' => []
				];
			}
		}
		if (func_num_args() >= 2) {
			return $response_data;
		}

		wp_send_json_success($response_data);
	}

	/**
	 * ユーザーIDから表示名を取得するヘルパー関数
	 *
	 * @param int $user_id ユーザーID
	 * @return string ユーザーの表示名
	 */
	private function get_user_display_name($user_id)
	{
		global $wpdb;
		$display_name = $wpdb->get_var($wpdb->prepare(
			"SELECT display_name FROM {$wpdb->prefix}lms_users WHERE id = %d",
			$user_id
		));

		if (!empty($display_name)) {
			return $display_name;
		}

		if (function_exists('get_userdata')) {
			$user = get_userdata($user_id);
			if ($user && !empty($user->display_name)) {
				return $user->display_name;
			}
		}

		return "ユーザー{$user_id}";
	}

	/**
	 * 複数メッセージのリアクションを取得するAjaxハンドラー
	 */
	public function handle_get_reactions()
	{
		$this->acquireSession();

		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		$user_authenticated = $session_user_id > 0;

		$this->releaseSession();

		if (!$user_authenticated) {
			wp_send_json_error('認証が必要です');
			return;
		}

		if (isset($_GET['nonce']) && !empty($_GET['nonce'])) {
			if (!wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
				wp_send_json_error('無効なnonce');
				return;
			}
		}

		$message_id = isset($_GET['message_id']) ? intval($_GET['message_id']) : 0;
		if (!$message_id) {
			$message_ids = isset($_GET['message_ids']) ? sanitize_text_field($_GET['message_ids']) : '';
			if (empty($message_ids)) {
				wp_send_json_error('メッセージIDが指定されていません。');
				return;
			}

			$message_ids = array_map('intval', explode(',', $message_ids));
			$message_ids = array_slice($message_ids, 0, 5);

			if (empty($message_ids)) {
				wp_send_json_error('有効なメッセージIDが指定されていません。');
				return;
			}

			$result = array();
			foreach ($message_ids as $msg_id) {
				$result[$msg_id] = $this->get_message_reactions($msg_id);
			}

			wp_send_json_success($result);
			return;
		}

		$reactions = $this->get_message_reactions($message_id);
		wp_send_json_success($reactions);
	}

	/**
	 * 削除されたメッセージを取得
	 *
	 * @param int $channel_id チャンネルID
	 * @param int $user_id    ユーザーID
	 * @return array 削除されたメッセージID
	 */
	private function get_deleted_messages($channel_id, $user_id)
	{
		$deleted_messages = get_transient('lms_deleted_messages');

		if (!is_array($deleted_messages)) {
			return array();
		}

		return $deleted_messages;
	}

	/**
	 * SSEイベントをトリガー（復活）- ロングポーリング通知に変換
	 */
	private function trigger_sse_event($event_type, $data) {
		// メッセージ削除イベントをロングポーリング通知に変換
		if ($event_type === 'main_message_deleted') {
			$this->notify_sse_clients_lightweight('message_deleted', [
				'message_id' => $data['message_id'],
				'channel_id' => $data['channel_id'],
				'user_id' => $data['user_id']
			]);
		}
		// 新しいメッセージイベント（送信時の通知は既にhandle_send_messageで行われている）
		else if ($event_type === 'message_new') {
			// 既にhandle_send_messageで通知済みのため何もしない
		}
	}

	public function notify_reaction_update($message_id, $reactions, $is_thread = false)
	{
		global $wpdb;

		$table_name = $wpdb->prefix . 'lms_chat_reaction_updates';
		$this->create_reaction_updates_table();

		$parent_message_id = null;
		if ($is_thread) {
			$parent_message_id = (int) $this->get_thread_parent_message_id($message_id);
			if ($parent_message_id) {
				$this->bump_thread_reaction_version($parent_message_id);
			}
		}

		$wpdb->delete(
			$table_name,
			array(
				'message_id' => $message_id,
				'is_thread' => $is_thread ? 1 : 0,
			),
			array('%d', '%d')
		);

		$timestamp = time();
		$existing_max_timestamp = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT MAX(timestamp) FROM {$table_name} WHERE message_id = %d AND is_thread = %d",
				$message_id,
				$is_thread ? 1 : 0
			)
		);
		if ($existing_max_timestamp && $existing_max_timestamp >= $timestamp) {
			$timestamp = (int) $existing_max_timestamp + 1;
		}

		$thread_id_for_row = $is_thread && $parent_message_id ? (int) $parent_message_id : 0;

		$insert_result = $wpdb->insert(
			$table_name,
			array(
				'message_id' => $message_id,
				'thread_id' => $thread_id_for_row,
				'reactions' => wp_json_encode($reactions),
				'is_thread' => $is_thread ? 1 : 0,
				'timestamp' => $timestamp,
				'created_at' => current_time('mysql'),
			),
			array('%d', '%d', '%s', '%d', '%d', '%s')
		);

		$this->create_realtime_reaction_event($message_id, $reactions, $is_thread, $parent_message_id, $timestamp);

		return array(
			'timestamp' => $timestamp,
			'parent_message_id' => $parent_message_id,
			'thread_id' => $thread_id_for_row,
		);
	}

	public function create_realtime_reaction_event($message_id, $reactions, $is_thread = false, $thread_id = null, $event_timestamp = null)
	{
		global $wpdb;

		$events_table = $wpdb->prefix . 'lms_chat_realtime_events';
		$this->create_realtime_events_table();

		$channel_id = $this->get_message_channel_id($message_id, $is_thread);

		$thread_parent_id = 0;
		if ($is_thread) {
			if (!$thread_id) {
				$thread_id = $this->get_thread_parent_message_id($message_id);
			}
			$thread_parent_id = $thread_id ? (int) $thread_id : 0;
		}

		if (null === $event_timestamp) {
			$event_timestamp = time();
		}

		$event_data = array(
			'message_id' => $message_id,
			'reactions' => $reactions,
			'is_thread' => $is_thread,
			'channel_id' => $channel_id,
			'thread_id' => $thread_parent_id,
			'user_id' => lms_get_current_user_id(),
			'timestamp' => $event_timestamp,
		);

		$wpdb->insert(
			$events_table,
			array(
				'event_type' => $is_thread ? 'thread_reaction_update' : 'reaction_update',
				'message_id' => $message_id,
				'thread_id' => $thread_parent_id,
				'channel_id' => $channel_id,
				'user_id' => lms_get_current_user_id(),
				'data' => wp_json_encode($event_data),
				'timestamp' => $event_timestamp,
				'expires_at' => $event_timestamp + 86400,
				'priority' => 2,
			),
			array('%s', '%d', '%d', '%d', '%d', '%s', '%d', '%d', '%d')
		);

		$thread_id_for_notification = $thread_parent_id > 0 ? $thread_parent_id : null;
		$this->trigger_immediate_longpoll_notification(
			$message_id,
			$reactions,
			$is_thread,
			$channel_id,
			$thread_id_for_notification
		);
	}

	/**
	 * リアルタイムイベントテーブルを作成
	 */
	public function create_realtime_events_table()
	{
		global $wpdb;
		
		$table_name = $wpdb->prefix . 'lms_chat_realtime_events';
		
		$charset_collate = $wpdb->get_charset_collate();
		
		$sql = "CREATE TABLE $table_name (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			event_type varchar(50) NOT NULL,
			message_id bigint(20) unsigned DEFAULT NULL,
			channel_id bigint(20) unsigned NOT NULL DEFAULT 1,
			user_id bigint(20) unsigned NOT NULL,
			data longtext,
			timestamp int(11) NOT NULL,
			expires_at int(11) NOT NULL,
			priority tinyint(4) NOT NULL DEFAULT 2,
			created_at timestamp DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY idx_channel_timestamp (channel_id, timestamp),
			KEY idx_expires (expires_at),
			KEY idx_message_id (message_id),
			KEY idx_event_type (event_type)
		) $charset_collate;";
		
		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		dbDelta($sql);
		
	}

	/**
	 * メッセージのチャンネルIDを取得
	 * @param int $message_id メッセージID
	 * @param bool $is_thread スレッドメッセージかどうか
	 * @return int チャンネルID
	 */
	public function get_message_channel_id($message_id, $is_thread = false)
	{
		global $wpdb;
		
		if ($is_thread) {
			// スレッドメッセージの場合、親メッセージからchannel_idを取得
			$parent_message_id = $wpdb->get_var($wpdb->prepare(
				"SELECT parent_message_id FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
				$message_id
			));
			
			if ($parent_message_id) {
				$channel_id = $wpdb->get_var($wpdb->prepare(
					"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
					$parent_message_id
				));
			} else {
				$channel_id = 1; // デフォルト
			}
		} else {
			// メインメッセージの場合
			$channel_id = $wpdb->get_var($wpdb->prepare(
				"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
				$message_id
			));
		}
		
		return $channel_id ? (int)$channel_id : 1; // デフォルトチャンネル1
	}

	public function trigger_immediate_longpoll_notification($message_id, $reactions, $is_thread, $channel_id, $thread_id = null)
	{

		$resolved_thread_id = null;
		if ($is_thread) {
			$resolved_thread_id = $thread_id ? (int) $thread_id : $this->get_thread_parent_message_id($message_id);
		}

		if ($is_thread) {
			$this->direct_thread_reaction_broadcast($message_id, $channel_id, $resolved_thread_id, $reactions);
			
			do_action('lms_thread_reaction_updated', $message_id, $channel_id, $resolved_thread_id, $reactions);
		} else {
			do_action('lms_reaction_updated', $message_id, $channel_id, $reactions, lms_get_current_user_id());
		}
		
		if (class_exists('LMS_Unified_LongPoll')) {
			$unified_longpoll = LMS_Unified_LongPoll::get_instance();
			
			if ($is_thread && method_exists($unified_longpoll, 'on_thread_reaction_updated')) {
				$unified_longpoll->on_thread_reaction_updated($message_id, $channel_id, $resolved_thread_id, $reactions);
			} elseif (!$is_thread && method_exists($unified_longpoll, 'on_reaction_updated')) {
				$unified_longpoll->on_reaction_updated($message_id, $channel_id, $reactions, lms_get_current_user_id());
			}
		}
	}

	public function direct_thread_reaction_broadcast($message_id, $channel_id, $thread_id, $reactions)
	{
		$resolved_thread_id = (int) $thread_id;

		if (defined('WP_DEBUG') && WP_DEBUG) {
			// direct_thread_reaction_broadcast start (debug log removed)
		}

		global $wpdb;
		
		$events_table = $wpdb->prefix . 'lms_chat_realtime_events';
		$current_time = time();
		
		$event_data = [
			'message_id' => $message_id,
			'reactions' => $reactions,
			'is_thread' => true,
			'channel_id' => $channel_id,
			'thread_id' => $resolved_thread_id,
			'user_id' => lms_get_current_user_id(),
			'timestamp' => $current_time,
			'source' => 'direct_broadcast'
		];

		$inserted = $wpdb->insert(
			$events_table,
			[
				'event_type' => 'thread_reaction_update',
				'message_id' => $message_id,
				'thread_id' => $resolved_thread_id,
				'channel_id' => $channel_id,
				'user_id' => lms_get_current_user_id(),
				'data' => wp_json_encode($event_data),
				'timestamp' => $current_time,
				'expires_at' => $current_time + 86400, // 24時間で削除
				'priority' => 2, // 高優先度
			],
			['%s', '%d', '%d', '%d', '%d', '%s', '%d', '%d', '%d']
		);

		if ($inserted) {
			$reaction_table = $wpdb->prefix . 'lms_chat_reaction_updates';
			$this->create_reaction_updates_table();
			
			$reaction_inserted = $wpdb->insert(
				$reaction_table,
				[
					'message_id' => $message_id,
					'thread_id' => $resolved_thread_id,
					'reactions' => wp_json_encode($reactions),
					'is_thread' => 1,
					'timestamp' => $current_time,
					'created_at' => current_time('mysql'),
				],
				['%d', '%d', '%s', '%d', '%d', '%s']
			);

			if (defined('WP_DEBUG') && WP_DEBUG) {
				if (!$reaction_inserted) {
				}
			}
			
			$transient_key = "lms_thread_reaction_update_{$channel_id}_{$current_time}";
			set_transient($transient_key, $event_data, 300); // 5分間保持

			// transient stored (debug log removed)
		}
	}

	public function create_reaction_updates_table()
	{
		global $wpdb;

		$table_name = $wpdb->prefix . 'lms_chat_reaction_updates';
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS $table_name (
			id int(11) NOT NULL AUTO_INCREMENT,
			message_id int(11) NOT NULL,
			thread_id int(11) NOT NULL DEFAULT 0,
			reactions longtext NOT NULL,
			is_thread tinyint(1) NOT NULL DEFAULT 0,
			timestamp int(11) NOT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY message_id (message_id),
			KEY thread_id (thread_id),
			KEY is_thread (is_thread),
			KEY timestamp (timestamp)
		) $charset_collate;";

		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		dbDelta($sql);

		$deleted_column = $wpdb->get_results("SHOW COLUMNS FROM $table_name LIKE 'deleted_at'");
		if (!empty($deleted_column)) {
			$wpdb->query("ALTER TABLE $table_name DROP COLUMN deleted_at");
		}

		$thread_column = $wpdb->get_results("SHOW COLUMNS FROM $table_name LIKE 'thread_id'");
		if (empty($thread_column)) {
			$wpdb->query("ALTER TABLE $table_name ADD COLUMN thread_id int(11) NOT NULL DEFAULT 0 AFTER message_id");
		}

		$thread_index = $wpdb->get_results("SHOW INDEX FROM $table_name WHERE Key_name = 'thread_id'");
		if (empty($thread_index)) {
			$wpdb->query("ALTER TABLE $table_name ADD KEY thread_id (thread_id)");
		}
	}

	/**
	 * リアクションのバッチ処理
	 * @param array $updates バッチ更新データ
	 * @return array 処理結果
	 */
	public function batch_update_reactions($updates) {
		global $wpdb;
		
		if (empty($updates) || !is_array($updates)) {
			return array('success' => false, 'error' => 'Invalid updates data');
		}
		
		// トランザクション開始
		$wpdb->query('START TRANSACTION');
		
		$results = array();
		$success_count = 0;
		$error_count = 0;
		
		try {
			foreach ($updates as $update) {
				if (!isset($update['message_id']) || !isset($update['user_id']) || 
					!isset($update['emoji']) || !isset($update['action'])) {
					$error_count++;
					$results[] = array(
						'message_id' => $update['message_id'] ?? null,
						'success' => false,
						'error' => 'Missing required parameters'
					);
					continue;
				}
				
				$result = $this->handle_single_reaction_update(
					intval($update['message_id']),
					intval($update['user_id']),
					sanitize_text_field($update['emoji']),
					sanitize_text_field($update['action']),
					isset($update['is_thread']) ? (bool)$update['is_thread'] : false
				);
				
				if ($result['success']) {
					$success_count++;
				} else {
					$error_count++;
				}
				
				$results[] = $result;
			}
			
			if ($error_count > 0 && $success_count === 0) {
				// 全て失敗の場合はロールバック
				$wpdb->query('ROLLBACK');
				return array(
					'success' => false,
					'error' => 'All updates failed',
					'details' => $results
				);
			}
			
			// コミット
			$wpdb->query('COMMIT');
			
			return array(
				'success' => true,
				'processed' => count($updates),
				'success_count' => $success_count,
				'error_count' => $error_count,
				'details' => $results
			);
			
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			return array(
				'success' => false,
				'error' => $e->getMessage()
			);
		}
	}
	
	/**
	 * 単一リアクション更新処理
	 * @param int $message_id メッセージID
	 * @param int $user_id ユーザーID
	 * @param string $emoji 絵文字
	 * @param string $action アクション (add/remove/toggle)
	 * @param bool $is_thread スレッドメッセージかどうか
	 * @return array 処理結果
	 */
	private function handle_single_reaction_update($message_id, $user_id, $emoji, $action, $is_thread = false) {
		global $wpdb;
		
		$table_name = $is_thread ? 
			$wpdb->prefix . 'lms_chat_thread_reactions' : 
			$wpdb->prefix . 'lms_chat_reactions';
		
		// 既存のリアクションをチェック
		$existing = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM $table_name 
			 WHERE message_id = %d AND user_id = %d AND reaction = %s",
			$message_id, $user_id, $emoji
		));
		
		$result = array('message_id' => $message_id, 'success' => false);
		
		try {
			switch ($action) {
				case 'add':
					if (!$existing) {
						$insert_result = $wpdb->insert(
							$table_name,
							array(
								'message_id' => $message_id,
								'user_id' => $user_id,
								'reaction' => $emoji,
								'created_at' => current_time('mysql')
							),
							array('%d', '%d', '%s', '%s')
						);
						$result['success'] = ($insert_result !== false);
						$result['action'] = 'added';
					} else {
						$result['success'] = true;
						$result['action'] = 'already_exists';
					}
					break;
					
				case 'remove':
					if ($existing) {
						$delete_result = $wpdb->delete(
							$table_name,
							array(
								'message_id' => $message_id,
								'user_id' => $user_id,
								'reaction' => $emoji
							),
							array('%d', '%d', '%s')
						);
						$result['success'] = ($delete_result !== false);
						$result['action'] = 'removed';
					} else {
						$result['success'] = true;
						$result['action'] = 'not_exists';
					}
					break;
					
				case 'toggle':
				default:
					if ($existing) {
						// 削除
						$delete_result = $wpdb->delete(
							$table_name,
							array(
								'message_id' => $message_id,
								'user_id' => $user_id,
								'reaction' => $emoji
							),
							array('%d', '%d', '%s')
						);
						$result['success'] = ($delete_result !== false);
						$result['action'] = 'removed';
					} else {
						// 追加
						$insert_result = $wpdb->insert(
							$table_name,
							array(
								'message_id' => $message_id,
								'user_id' => $user_id,
								'reaction' => $emoji,
								'created_at' => current_time('mysql')
							),
							array('%d', '%d', '%s', '%s')
						);
						$result['success'] = ($insert_result !== false);
						$result['action'] = 'added';
					}
					break;
			}
			
			if ($result['success']) {
				// リアクション更新通知
				$reactions = $this->get_message_reactions($message_id);
				$this->notify_reaction_update($message_id, $reactions, $is_thread);
			}
			
		} catch (Exception $e) {
			$result['error'] = $e->getMessage();
		}
		
		return $result;
	}
	
	/**
	 * リアクション更新テーブルのクリーンアップ
	 * @param int $hours 保持時間（デフォルト24時間）
	 * @return array クリーンアップ結果
	 */
	public function cleanup_reaction_updates($hours = 24) {
		global $wpdb;
		
		$table_name = $wpdb->prefix . 'lms_chat_reaction_updates';
		
		$cutoff_time = date('Y-m-d H:i:s', time() - ($hours * 3600));
		
		$deleted = $wpdb->query($wpdb->prepare(
			"DELETE FROM $table_name WHERE created_at < %s",
			$cutoff_time
		));
		
		return array(
			'success' => true,
			'deleted_rows' => $deleted ?: 0,
			'cutoff_time' => $cutoff_time
		);
	}

	private function update_thread_last_viewed($parent_message_id, $user_id)
	{
		global $wpdb;
		$wpdb->replace(
			$wpdb->prefix . 'lms_chat_thread_last_viewed',
			array(
				'user_id' => $user_id,
				'parent_message_id' => $parent_message_id,
				'last_viewed_at' => current_time('mysql')
			),
			array('%d', '%d', '%s')
		);
	}

	/**
	 * スレッドの最終閲覧時刻を指定時刻で更新
	 * @param int $parent_message_id 親メッセージID
	 * @param int $user_id ユーザーID
	 * @param string $time 更新する時刻
	 */
	private function update_thread_last_viewed_to_time($parent_message_id, $user_id, $time)
	{
		global $wpdb;
		
		
		$before = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_thread_last_viewed WHERE user_id = %d AND parent_message_id = %d",
			$user_id, $parent_message_id
		));
		
		$result = $wpdb->replace(
			$wpdb->prefix . 'lms_chat_thread_last_viewed',
			array(
				'user_id' => $user_id,
				'parent_message_id' => $parent_message_id,
				'last_viewed_at' => $time
			),
			array('%d', '%d', '%s')
		);
		
		$after = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}lms_chat_thread_last_viewed WHERE user_id = %d AND parent_message_id = %d",
			$user_id, $parent_message_id
		));
		
		
		$unread_count = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
				ON t.parent_message_id = v.parent_message_id
				AND v.user_id = %d
			WHERE t.parent_message_id = %d
			AND t.user_id != %d
			AND t.deleted_at IS NULL
			AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)",
			$user_id, $parent_message_id, $user_id
		));
		
	}
	/**
	 * 全スレッドの未読数を一括取得するAjaxハンドラー
	 */
	public function handle_get_all_thread_unread_counts()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		if (!$user_id) {
			wp_send_json_error('User ID is required');
			return;
		}

		$parent_message_ids = isset($_GET['parent_message_ids']) ? $_GET['parent_message_ids'] : '';
		if (empty($parent_message_ids)) {
			wp_send_json_error('Parent message IDs are required');
			return;
		}

		$parent_message_ids = array_map('intval', explode(',', $parent_message_ids));
		$parent_message_ids = array_filter($parent_message_ids); // 0や無効な値を除外

		if (empty($parent_message_ids)) {
			wp_send_json_error('No valid parent message IDs provided');
			return;
		}

		global $wpdb;

		$placeholders = implode(',', array_fill(0, count($parent_message_ids), '%d'));

		$cache_key = '';
		if (!empty($user_id) && !empty($parent_message_ids)) {
			$message_ids_string = implode(',', $parent_message_ids);
			if (!empty($message_ids_string)) {
				$cache_key = "lms_chat_thread_unread_all_" . md5($message_ids_string . "_user_{$user_id}");
			}
		}

		$unread_counts = false;
		if ($this->is_valid_cache_key($cache_key)) {
			$unread_counts = $this->cache_helper->get($cache_key, 'lms_chat');
		}

		if (false === $unread_counts) {
			$thread_counts = $wpdb->get_results($wpdb->prepare(
				"SELECT
					parent_message_id,
					COUNT(*) as total,
					MAX(created_at) as latest_reply
				FROM {$wpdb->prefix}lms_chat_thread_messages
				WHERE parent_message_id IN ({$placeholders})
				GROUP BY parent_message_id",
				$parent_message_ids
			));

			if (empty($thread_counts)) {
				wp_send_json_success([]);
				return;
			}

			$result = [];

			foreach ($thread_counts as $thread) {
				$parent_message_id = $thread->parent_message_id;
				$total = $thread->total;

				$unread = $wpdb->get_var($wpdb->prepare(
					"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
					LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
						ON v.parent_message_id = t.parent_message_id
						AND v.user_id = %d
					WHERE t.parent_message_id = %d
					AND t.user_id != %d
					AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)",
					$user_id,
					$parent_message_id,
					$user_id
				));

				$avatars = $wpdb->get_results($wpdb->prepare(
					"SELECT u.id as user_id, u.display_name, u.avatar_url
					FROM {$wpdb->prefix}lms_chat_thread_messages t
					JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
					WHERE t.parent_message_id = %d
					GROUP BY u.id
					ORDER BY MAX(t.created_at) DESC
					LIMIT 3",
					$parent_message_id
				));

				$latest_reply = '';
				if ($thread->latest_reply) {
					$timestamp = strtotime($thread->latest_reply);
					$diff = time() - $timestamp;
					if ($diff < 60) {
						$latest_reply = 'たった今';
					} elseif ($diff < 3600) {
						$latest_reply = floor($diff / 60) . '分前';
					} elseif ($diff < 86400) {
						$latest_reply = floor($diff / 3600) . '時間前';
					} else {
						$latest_reply = floor($diff / 86400) . '日前';
					}
				}

				$result[$parent_message_id] = [
					'total' => (int)$total,
					'unread' => (int)$unread,
					'latest_reply' => $latest_reply,
					'avatars' => $avatars
				];
			}

			if ($this->is_valid_cache_key($cache_key)) {
				$this->cache_helper->set($cache_key, $result, 'lms_chat', 60);
			}

			$unread_counts = $result;
		}

		wp_send_json_success($unread_counts);
	}

	/**
	 * スレッドテーブルが存在するか確認し、必要に応じて作成するAJAXハンドラー
	 */
	public function handle_ensure_thread_tables()
	{
		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('セキュリティチェックに失敗しました。');
			return;
		}

		$this->create_thread_tables();

		$this->create_thread_reactions_table();

		$this->create_attachments_table();

		wp_send_json_success('テーブルを確認・作成しました。');
	}

	public function handle_get_messages_by_date()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
		$date = isset($_GET['date']) ? sanitize_text_field($_GET['date']) : '';
		$timestamp = isset($_GET['timestamp']) ? sanitize_text_field($_GET['timestamp']) : '';
		$include_adjacent = isset($_GET['include_adjacent']) ? (bool)$_GET['include_adjacent'] : true; // 前後の日付も含めるオプション
		if (!empty($timestamp)) {
			try {
				if (is_numeric($timestamp)) {
					$date_obj = new DateTime();
					$date_obj->setTimestamp((int)$timestamp);
				} else {
					$date_obj = new DateTime($timestamp);
				}
				$date = $date_obj->format('Y-m-d');
			} catch (Exception $e) {
				if (empty($date)) {
					$date = date('Y-m-d');
				}
			}
		}

		if (!$channel_id || !$date) {
			wp_send_json_error([
				'message' => 'Invalid parameters',
				'channel_id' => $channel_id,
				'date' => $date,
				'timestamp' => $timestamp
			]);
			return;
		}

		global $wpdb;
		$messages_table = $wpdb->prefix . 'lms_chat_messages';
		$users_table = $wpdb->prefix . 'lms_users';

		$date_obj = new DateTime($date);
		$prev_date = clone $date_obj;
		$prev_date->modify('-1 day');
		$prev_date_str = $prev_date->format('Y-m-d');

		$next_date = clone $date_obj;
		$next_date->modify('+1 day');
		$next_date_str = $next_date->format('Y-m-d');

		$date_start = $date . ' 00:00:00';
		$date_end = $date . ' 23:59:59';

		$extended_start = $prev_date_str . ' 00:00:00';
		$extended_end = $next_date_str . ' 23:59:59';

		$query_range = $include_adjacent ? "BETWEEN %s AND %s" : "BETWEEN %s AND %s";
		$start_date = $include_adjacent ? $extended_start : $date_start;
		$end_date = $include_adjacent ? $extended_end : $date_end;
		$messages = $wpdb->get_results($wpdb->prepare(
			"SELECT m.*, u.display_name, t.thread_count
			FROM {$messages_table} m
			LEFT JOIN {$users_table} u ON m.user_id = u.ID
			LEFT JOIN (
				SELECT t2.parent_message_id, COUNT(*) as thread_count
				FROM {$wpdb->prefix}lms_chat_thread_messages t2
				JOIN {$wpdb->prefix}lms_chat_messages m2 ON t2.parent_message_id = m2.id
				WHERE m2.channel_id = %d AND t2.is_deleted = 0
				GROUP BY t2.parent_message_id
			) t ON m.id = t.parent_message_id
			WHERE m.channel_id = %d
			AND m.created_at $query_range
			ORDER BY m.created_at ASC",
			$channel_id, // サブクエリのchannel_id
			$channel_id, // メインクエリのchannel_id
			$start_date,
			$end_date
		));
		if ($messages) {
			$date_list = $wpdb->get_col($wpdb->prepare(
				"SELECT DISTINCT DATE(created_at)
				FROM {$messages_table}
				WHERE channel_id = %d
				ORDER BY created_at ASC",
				$channel_id
			));

			$grouped_messages = array();
			foreach ($messages as $message) {
				if (empty($message->display_name) && !empty($message->user_id)) {
					$message->display_name = $this->get_lms_user_display_name($message->user_id);
				}

				if (!empty($message->file_ids)) {
					$attachments = array();
					$file_ids = explode(',', $message->file_ids);
					foreach ($file_ids as $file_id) {
						$attachment = $this->get_message_attachments_safe(intval($file_id));
						if ($attachment) {
							$attachments[] = $attachment;
						}
					}
					$message->attachments = $attachments;
				}

				if (!empty($message->created_at)) {
					$message->formatted_time = date('H:i', strtotime($message->created_at));
				}

				if (!isset($message->thread_count)) {
					$message->thread_count = 0;
				}

				if ($message->thread_count > 0) {
					$message->has_thread = true;

					$thread_info = $wpdb->get_row($wpdb->prepare(
						"SELECT tm.*, u.display_name, u.avatar_url
						FROM {$wpdb->prefix}lms_chat_thread_messages tm
						LEFT JOIN {$wpdb->prefix}lms_users u ON tm.user_id = u.id
						WHERE tm.parent_message_id = %d
						ORDER BY tm.created_at DESC
						LIMIT 1",
						$message->id
					));

					if ($thread_info) {
						$message->thread_latest_reply = $thread_info->message;
						$message->thread_latest_user = $thread_info->display_name;

						$thread_avatars = $wpdb->get_col($wpdb->prepare(
							"SELECT DISTINCT u.avatar_url
							FROM {$wpdb->prefix}lms_chat_thread_messages tm
							LEFT JOIN {$wpdb->prefix}lms_users u ON tm.user_id = u.id
							WHERE tm.parent_message_id = %d
							ORDER BY tm.created_at DESC
							LIMIT 3",
							$message->id
						));

						$message->thread_avatars = $thread_avatars;
					}
				}

				$date_key = date('Y-m-d', strtotime($message->created_at));
				if (!isset($grouped_messages[$date_key])) {
					$date_obj = new DateTime($date_key);
					$weekday = ['日', '月', '火', '水', '木', '金', '土'][$date_obj->format('w')];
					$formatted_date = $date_obj->format('Y年n月j日') . "（{$weekday}）";

					$grouped_messages[$date_key] = array(
						'date' => $formatted_date,
						'messages' => array()
					);
				}
				$grouped_messages[$date_key]['messages'][] = $message;
			}

			$response = array(
				'messages' => array_values($grouped_messages),
				'pagination' => array(
					'has_more' => true,  // 追加のメッセージがあることを示すためにtrueに変更
					'has_previous' => true, // 前の日付にメッセージがあることを示す
					'next_date' => $next_date_str, // 次の日付
					'prev_date' => $prev_date_str, // 前の日付
				),
				'available_dates' => $date_list, // 利用可能な日付のリスト
				'query_info' => array(
					'date' => $date,
					'timestamp' => $timestamp,
					'channel_id' => $channel_id,
					'count' => count($messages)
				)
			);

			wp_send_json_success($response);
		} else {

			if (!empty($timestamp) || !empty($date)) {
				$closeMessages = $wpdb->get_results($wpdb->prepare(
					"SELECT DATE(created_at) as message_date, COUNT(*) as count
						FROM {$messages_table}
						WHERE channel_id = %d
						AND created_at BETWEEN DATE_SUB(%s, INTERVAL 3 DAY) AND DATE_ADD(%s, INTERVAL 3 DAY)
						GROUP BY DATE(created_at)
						ORDER BY ABS(DATEDIFF(DATE(created_at), %s)), DATE(created_at) ASC",
					$channel_id,
					$date_start,
					$date_end,
					$date
				));

				if ($closeMessages) {
					$dateInfo = [];
					foreach ($closeMessages as $dateData) {
						$dateInfo[] = [
							'date' => $dateData->message_date,
							'count' => (int)$dateData->count
						];
					}

					wp_send_json_success([
						'messages' => [],
						'pagination' => [
							'has_more' => false
						],
						'available_dates' => $dateInfo,
						'near_dates' => $dateInfo,
						'message' => '指定された日付のメッセージは見つかりませんでしたが、近い日付にメッセージがあります。'
					]);
					return;
				}
			}

			wp_send_json_success(array(
				'messages' => array(),
				'pagination' => array(
					'has_more' => false
				),
				'query_info' => array(
					'date' => $date,
					'timestamp' => $timestamp,
					'channel_id' => $channel_id,
					'count' => 0
				),
				'message' => '指定された日付のメッセージはありません。'
			));
		}
	}

	public function handle_get_first_messages()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;

		if (!$channel_id) {
			wp_send_json_error('Invalid channel ID');
			return;
		}

		global $wpdb;
		$messages_table = $wpdb->prefix . 'lms_chat_messages';
		$users_table = $wpdb->prefix . 'users';

		$messages = $wpdb->get_results($wpdb->prepare(
			"SELECT m.*, u.display_name
			FROM {$messages_table} m
			LEFT JOIN {$users_table} u ON m.user_id = u.ID
			WHERE m.channel_id = %d
			ORDER BY m.created_at ASC
			LIMIT 50",
			$channel_id
		));

		if ($messages) {
			$grouped_messages = array();
			foreach ($messages as $message) {
				$date_key = date('Y-m-d', strtotime($message->created_at));
				if (!isset($grouped_messages[$date_key])) {
					$grouped_messages[$date_key] = array();
				}
				$grouped_messages[$date_key][] = $message;
			}

			$response = array(
				'messages' => array_map(function ($date_key, $messages) {
					return array(
						'date' => $date_key,
						'messages' => $messages
					);
				}, array_keys($grouped_messages), $grouped_messages),
				'pagination' => array(
					'has_more' => false
				)
			);

			wp_send_json_success($response);
		} else {
			wp_send_json_success(array(
				'messages' => array(),
				'pagination' => array(
					'has_more' => false
				)
			));
		}
	}

	/**
	 * メッセージを検索
	 *
	 * @param string $query 検索クエリ
	 * @param array  $options 検索オプション
	 * @return array 検索結果
	 */
	public function search_messages($query, $options = array())
	{
		global $wpdb;

		$defaults = array(
			'channel_id' => 0,
			'user_id'    => 0,
			'from_user'  => 0, // ユーザーID（送信者）でのフィルタリング
			'date_from'  => '',
			'date_to'    => '',
			'limit'      => 100,
			'offset'     => 0,
		);

		$options = wp_parse_args($options, $defaults);

		$sanitized_query = sanitize_text_field($query);

		if (
			empty($sanitized_query) &&
			empty($options['channel_id']) &&
			empty($options['from_user']) &&
			empty($options['date_from']) &&
			empty($options['date_to'])
		) {
			return array(
				'count'   => 0,
				'query'   => $sanitized_query,
				'results' => array(),
			);
		}

		$table_messages = $wpdb->prefix . 'lms_chat_messages';
		$table_threads = $wpdb->prefix . 'lms_chat_thread_messages';
		$table_channels = $wpdb->prefix . 'lms_chat_channels';
		$table_lms_users = $wpdb->prefix . 'lms_users';

		$sql_select = "
			SELECT
				combined_messages.id,
				combined_messages.channel_id,
				combined_messages.user_id,
				combined_messages.message,
				combined_messages.created_at,
				combined_messages.is_thread_reply,
				combined_messages.parent_id,
				combined_messages.parent_channel_id,
				combined_messages.parent_message_content,
				CASE 
					WHEN combined_messages.channel_id > 0 THEN c.name
					WHEN combined_messages.parent_channel_id > 0 THEN c2.name
					ELSE '不明なチャンネル'
				END AS channel_name,
				CASE 
					WHEN combined_messages.channel_id > 0 THEN c.type
					WHEN combined_messages.parent_channel_id > 0 THEN c2.type
					ELSE NULL
				END AS channel_type,
				COALESCE(lu.display_name, u.display_name, u.user_login, 'Unknown User') as user_name,
				u.user_login,
				um.meta_value AS nickname,
				u.user_nicename
			FROM (
				SELECT
					m.id,
					m.channel_id,
					m.user_id,
					m.message,
					m.created_at,
					0 as is_thread_reply,
					NULL as parent_id,
					NULL as parent_channel_id,
					NULL as parent_message_content
				FROM {$table_messages} m
				WHERE " . (!empty($sanitized_query) ? "BINARY m.message LIKE %s" : "1=1") . "
					AND (m.deleted_at IS NULL OR m.deleted_at = '0000-00-00 00:00:00')

				UNION ALL

				SELECT
					t.id,
					COALESCE(p.channel_id, nearby.channel_id, 0) as channel_id,
					t.user_id,
					t.message,
					t.created_at,
					1 as is_thread_reply,
					t.parent_message_id as parent_id,
					COALESCE(p.channel_id, nearby.channel_id) as parent_channel_id,
					CASE 
						WHEN p.message IS NOT NULL AND p.message != '' THEN p.message
						WHEN p.id IS NOT NULL AND (p.message IS NULL OR p.message = '') THEN '[削除されたメッセージ]'
						WHEN nearby.message IS NOT NULL THEN CONCAT('[推定] ', LEFT(nearby.message, 50))
						ELSE ''
					END as parent_message_content
				FROM {$table_threads} t
				LEFT JOIN {$table_messages} p ON t.parent_message_id = p.id
				LEFT JOIN {$table_messages} nearby ON (
					p.id IS NULL 
					AND nearby.id BETWEEN t.parent_message_id - 3 AND t.parent_message_id + 3
					AND nearby.id != t.parent_message_id
					AND (nearby.deleted_at IS NULL OR nearby.deleted_at = '0000-00-00 00:00:00')
				)
				WHERE " . (!empty($sanitized_query) ? "BINARY t.message LIKE %s" : "1=1") . "
					AND (t.deleted_at IS NULL OR t.deleted_at = '0000-00-00 00:00:00')
					AND (p.id IS NOT NULL OR nearby.id IS NOT NULL)
			) as combined_messages
			LEFT JOIN {$table_channels} c ON combined_messages.channel_id = c.id
			LEFT JOIN {$table_channels} c2 ON combined_messages.parent_channel_id = c2.id
			LEFT JOIN {$wpdb->users} u ON combined_messages.user_id = u.ID
			LEFT JOIN {$table_lms_users} lu ON combined_messages.user_id = lu.id
			LEFT JOIN {$wpdb->usermeta} um ON u.ID = um.user_id AND um.meta_key = 'nickname'
			WHERE 1=1
		";

		$sql_values = array();

		if (!empty($sanitized_query)) {
			$sql_values[] = '%' . $wpdb->esc_like($sanitized_query) . '%';
			$sql_values[] = '%' . $wpdb->esc_like($sanitized_query) . '%';
		}

		if (!empty($options['channel_id'])) {
			$sql_select .= " AND combined_messages.channel_id = %d";
			$sql_values[] = $options['channel_id'];
		}

		if (!empty($options['from_user'])) {
			$sql_select .= " AND combined_messages.user_id = %d";
			$sql_values[] = $options['from_user'];
		} elseif (!empty($options['user_id'])) { // 後方互換性のため
			$sql_select .= " AND combined_messages.user_id = %d";
			$sql_values[] = $options['user_id'];
		}

		if (!empty($options['date_from'])) {
			$sql_select .= " AND combined_messages.created_at >= %s";
			$sql_values[] = $options['date_from'] . ' 00:00:00';
		}

		if (!empty($options['date_to'])) {
			$sql_select .= " AND combined_messages.created_at <= %s";
			$sql_values[] = $options['date_to'] . ' 23:59:59';
		}

		$count_sql = "SELECT COUNT(*) FROM (
			{$sql_select}
		) as temp";
		$total_count = $wpdb->get_var($wpdb->prepare($count_sql, $sql_values));

		$sql_select .= " GROUP BY combined_messages.id, combined_messages.is_thread_reply ORDER BY combined_messages.created_at DESC LIMIT %d OFFSET %d";
		$sql_values[] = $options['limit'];
		$sql_values[] = $options['offset'];

		$results = $wpdb->get_results($wpdb->prepare($sql_select, $sql_values), ARRAY_A);

		// デバッグ用: SQLクエリを一時的にログ出力
		if ($wpdb->last_error) {
		}

		if (!$results) {
			return array(
				'count'   => 0,
				'query'   => $sanitized_query,
				'results' => array(),
			);
		}

		$current_user_id = isset($_SESSION['lms_user_id']) ? (int) $_SESSION['lms_user_id'] : 0;

		$processed_results = array();
		foreach ($results as $result) {
			// デバッグ: 問題のあるケースのみログ出力
			if ($result['is_thread_reply'] && empty($result['parent_message_content'])) {
			}
			
			$result['is_current_user'] = (int)$result['user_id'] === $current_user_id;

			$result['attachments'] = $this->get_message_attachments_safe($result['id']);

			$result['formatted_time'] = $this->format_message_time($result['created_at'], true);

			// 汎用的な親メッセージ取得ルーチン
			$result['parent_message'] = $this->get_parent_message_for_result($result);
			
			if (!$result['is_thread_reply']) {
				$thread_count_sql = "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages
									WHERE parent_message_id = %d";
				$result['thread_count'] = (int) $wpdb->get_var($wpdb->prepare($thread_count_sql, $result['id']));
			} else {
				$result['thread_count'] = 0;
			}

			$processed_results[] = $result;
		}

		return array(
			'count'   => (int) $total_count,
			'query'   => $sanitized_query,
			'results' => $processed_results,
		);
	}

	/**
	 * 検索結果に対して汎用的に親メッセージを取得
	 *
	 * @param array $result 検索結果の1行
	 * @return string 親メッセージの内容
	 */
	private function get_parent_message_for_result($result)
	{
		global $wpdb;
		
		// スレッド返信でない場合は空文字を返す
		if (!$result['is_thread_reply'] || empty($result['parent_id'])) {
			return '';
		}
		
		if (isset($result['parent_message_content']) && !empty($result['parent_message_content']) && $result['parent_message_content'] !== '') {
			return $result['parent_message_content'];
		}
		
		static $parent_cache = array();
		$parent_id = $result['parent_id'];
		
		if (isset($parent_cache[$parent_id])) {
			return $parent_cache[$parent_id];
		}
		
		// 包括的な親メッセージ検索ルーチン
		$parent_message = $this->find_parent_message_comprehensive($parent_id);
		
		$parent_cache[$parent_id] = $parent_message;
		return $parent_message;
	}
	
	/**
	 * 包括的な親メッセージ検索（データ整合性問題への対応）
	 *
	 * @param int $parent_id 親メッセージID
	 * @return string 親メッセージの内容
	 */
	private function find_parent_message_comprehensive($parent_id)
	{
		global $wpdb;
		
		$parent_message = $wpdb->get_var($wpdb->prepare(
			"SELECT message FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')",
			$parent_id
		));
		
		if ($parent_message) {
			return $parent_message;
		}
		
		$parent_message_deleted = $wpdb->get_var($wpdb->prepare(
			"SELECT message FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
			$parent_id
		));
		
		if ($parent_message_deleted) {
			return '[削除済み] ' . $parent_message_deleted;
		}
		
		$thread_parent_message = $wpdb->get_var($wpdb->prepare(
			"SELECT message FROM {$wpdb->prefix}lms_chat_thread_messages WHERE id = %d",
			$parent_id
		));
		
		if ($thread_parent_message) {
			return '[スレッド] ' . $thread_parent_message;
		}
		
		// $auto_repair_result = $this->auto_repair_orphaned_thread($parent_id);
		// }
		
		return $this->generate_fallback_parent_message($parent_id);
	}
	
	/**
	 * 孤立したスレッドメッセージの自動修復
	 *
	 * @param int $parent_id 存在しない親メッセージID
	 * @return string|false 修復された親メッセージまたはfalse
	 */
	private function auto_repair_orphaned_thread($parent_id)
	{
		global $wpdb;
		
		// 同じ時期に作成された近くのメッセージIDを検索
		$nearby_messages = $wpdb->get_results($wpdb->prepare("
			SELECT id, message, created_at, channel_id
			FROM {$wpdb->prefix}lms_chat_messages 
			WHERE id BETWEEN %d AND %d 
			AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')
			ORDER BY ABS(id - %d) ASC
			LIMIT 3
		", $parent_id - 5, $parent_id + 5, $parent_id));
		
		if ($nearby_messages) {
			$best_candidate = $nearby_messages[0];
			
			// 自動修復: 孤立したスレッドの親IDを最も近いメッセージIDに変更
			$update_result = $wpdb->update(
				$wpdb->prefix . 'lms_chat_thread_messages',
				array('parent_message_id' => $best_candidate->id),
				array('parent_message_id' => $parent_id),
				array('%d'),
				array('%d')
			);
			
			if ($update_result !== false && $update_result > 0) {
				return '[自動修復] ' . $best_candidate->message;
			}
		}
		
		return false;
	}
	
	/**
	 * 親メッセージが見つからない場合の代替メッセージ生成
	 *
	 * @param int $parent_id 親メッセージID
	 * @return string 代替メッセージ
	 */
	private function generate_fallback_parent_message($parent_id)
	{
		global $wpdb;
		
		// 近隣のメッセージから推定可能な情報を取得
		$nearby_message = $wpdb->get_row($wpdb->prepare("
			SELECT id, message, created_at, channel_id
			FROM {$wpdb->prefix}lms_chat_messages 
			WHERE id BETWEEN %d AND %d 
			AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')
			ORDER BY ABS(id - %d) ASC
			LIMIT 1
		", $parent_id - 3, $parent_id + 3, $parent_id));
		
		// 同じparent_idを持つスレッドメッセージの数を取得
		$thread_count = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d",
			$parent_id
		));
		
		if ($nearby_message) {
			$short_message = mb_substr($nearby_message->message, 0, 30) . '...';
			return "[推定元] {$short_message} (近似ID: {$nearby_message->id})";
		} elseif ($thread_count >= 10) {
			// 大量のスレッドがある場合は、自動的にダミー親メッセージを作成
			$auto_created = $this->auto_create_missing_parent_message($parent_id, $nearby_message);
			if ($auto_created) {
				return $auto_created;
			}
			return "[データ不整合] 削除された親メッセージ (関連スレッド: {$thread_count}件)";
		} elseif ($thread_count > 1) {
			return "[データ不整合] 削除された親メッセージ (関連スレッド: {$thread_count}件)";
		} else {
			return "[データ不整合] 削除された親メッセージ";
		}
	}
	
	/**
	 * 欠損した親メッセージの自動作成
	 *
	 * @param int $parent_id 欠損している親メッセージID
	 * @param object|null $nearby_message 近隣メッセージ
	 * @return string|false 作成された親メッセージまたはfalse
	 */
	private function auto_create_missing_parent_message($parent_id, $nearby_message = null)
	{
		global $wpdb;
		
		// セーフティチェック: 既に存在する場合は何もしない
		$existing = $wpdb->get_var($wpdb->prepare(
			"SELECT id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
			$parent_id
		));
		
		if ($existing) {
			return false;
		}
		
		// 関連スレッド数を確認（10件以上の場合のみ自動作成）
		$thread_count = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d",
			$parent_id
		));
		
		if ($thread_count < 10) {
			return false;
		}
		
		// 最初のスレッドメッセージから情報を取得
		$first_thread = $wpdb->get_row($wpdb->prepare("
			SELECT user_id, created_at, LEFT(message, 50) as sample_message
			FROM {$wpdb->prefix}lms_chat_thread_messages 
			WHERE parent_message_id = %d 
			ORDER BY created_at ASC 
			LIMIT 1
		", $parent_id));
		
		if (!$first_thread) {
			return false;
		}
		
		// 近隣メッセージがない場合は、適切なデフォルト値を設定
		$channel_id = 1; // デフォルトチャンネル
		$base_time = $first_thread->created_at;
		
		if ($nearby_message) {
			$channel_id = $nearby_message->channel_id;
		}
		
		// ダミー親メッセージを作成
		$dummy_message = "[システム自動復旧] このメッセージは失われましたが、{$thread_count}件の返信があるため自動復旧しました。";
		
		$insert_data = [
			'id' => $parent_id,
			'channel_id' => $channel_id,
			'user_id' => $first_thread->user_id,
			'message' => $dummy_message,
			'created_at' => $base_time,
			'updated_at' => current_time('mysql'),
			'is_deleted' => 0,
			'is_system_message' => 1,
			'thread_count' => $thread_count
		];
		
		// トランザクションで安全に実行
		$wpdb->query('START TRANSACTION');
		
		try {
			$result = $wpdb->insert(
				$wpdb->prefix . 'lms_chat_messages',
				$insert_data,
				['%d', '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%d']
			);
			
			if ($result === false) {
				throw new Exception("Insert failed: " . $wpdb->last_error);
			}
			
			// 挿入確認
			$verify = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
				$parent_id
			));
			
			if ($verify != 1) {
				throw new Exception("Verification failed");
			}
			
			$wpdb->query('COMMIT');
			
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			return false;
		}
		
		if ($result) {
			return $dummy_message;
		}
		
		return false;
	}

	/**
	 * 添付ファイル情報を安全に取得（thread_message_idカラムがない場合のエラー回避）
	 *
	 * @param int $message_id メッセージID
	 * @return array 添付ファイル情報
	 */
	private function get_message_attachments_safe($message_id)
	{
		global $wpdb;

		$columns = $wpdb->get_results("SHOW COLUMNS FROM {$wpdb->prefix}lms_chat_attachments");
		$has_thread_message_id = false;

		foreach ($columns as $column) {
			if ($column->Field === 'thread_message_id') {
				$has_thread_message_id = true;
				break;
			}
		}

		if ($has_thread_message_id) {
			$sql = "SELECT * FROM {$wpdb->prefix}lms_chat_attachments
					WHERE message_id = %d OR thread_message_id = %d
					ORDER BY id ASC";
			$attachments = $wpdb->get_results($wpdb->prepare($sql, $message_id));
		} else {
			$sql = "SELECT * FROM {$wpdb->prefix}lms_chat_attachments
					WHERE message_id = %d
					ORDER BY id ASC";
			$attachments = $wpdb->get_results($wpdb->prepare($sql, $message_id));
		}

		return $attachments ? $attachments : array();
	}

	/**
	 * 検索履歴の数を制限
	 *
	 * @param int $user_id ユーザーID
	 * @param int $max_entries 最大エントリ数
	 * @return bool 成功したかどうか
	 */
	private function limit_search_history($user_id, $max_entries = 20)
	{
		global $wpdb;
		$table_name = $wpdb->prefix . 'lms_chat_search_history';

		$count = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM $table_name WHERE user_id = %d",
			$user_id
		));

		if ($count <= $max_entries) {
			return true;
		}

		$deleted = $wpdb->query($wpdb->prepare(
			"DELETE FROM $table_name
			WHERE user_id = %d
			AND id NOT IN (
				SELECT id FROM (
					SELECT id FROM $table_name
					WHERE user_id = %d
					ORDER BY created_at DESC
					LIMIT %d
				) temp
			)",
			$user_id,
			$user_id,
			$max_entries
		));

		return $deleted !== false;
	}

	/**
	 * メッセージの添付ファイル情報を取得
	 *
	 * @param int $message_id メッセージID
	 * @return array 添付ファイル情報の配列
	 */
	public function get_message_attachments($message_id)
	{
		global $wpdb;

		$sql = "SELECT a.*
				FROM {$wpdb->prefix}lms_chat_attachments a
				WHERE a.message_id = %d 				ORDER BY a.id ASC";

		$attachments = $wpdb->get_results($wpdb->prepare($sql, $message_id));

		return $attachments ? $attachments : array();
	}

	/**
	 * ユーザー一覧取得AJAXハンドラ
	 */
	public function handle_get_users()
	{
		$this->acquireSession();

		$session_user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		$this->releaseSession();

		try {
			$nonce = isset($_REQUEST['nonce']) ? $_REQUEST['nonce'] : '';

			if (!$nonce) {
				if (defined('WP_DEBUG') && WP_DEBUG) {
				} else {
					wp_send_json_error('nonceが必要です');
					return;
				}
			} else {
				$nonce_valid = false;
				$nonce_actions = ['lms_ajax_nonce', 'lms_nonce', 'wp_rest'];

				foreach ($nonce_actions as $action) {
					if (wp_verify_nonce($nonce, $action)) {
						$nonce_valid = true;
						break;
					}
				}

				if (!$nonce_valid) {
					wp_send_json_error('セキュリティチェックに失敗しました');
					return;
				}
			}

			$user_id = 0;
			$is_logged_in = false;

			if (class_exists('LMS_Auth')) {
				$auth = LMS_Auth::get_instance();
				if ($auth && method_exists($auth, 'get_current_user_id')) {
					$user_id = $auth->get_current_user_id();
					if ($user_id > 0) {
						$is_logged_in = true;
					}
				}
			}

			if (!$is_logged_in && $session_user_id > 0) {
				$user_id = $session_user_id;
				$is_logged_in = true;
			}

			if (!$is_logged_in && lms_is_user_logged_in()) {
				$user_id = lms_get_current_user_id();
				$is_logged_in = true;
			}

			if (!$is_logged_in) {
				wp_send_json_error('ユーザー認証が必要です');
				return;
			}

			global $wpdb;
			$user_data = array();

			$lms_table = $wpdb->prefix . 'lms_users';
			if ($wpdb->get_var("SHOW TABLES LIKE '$lms_table'") === $lms_table) {
				$lms_users = $wpdb->get_results(
					"
			SELECT id, display_name, email
			FROM {$lms_table}
			WHERE status = 'active'
			ORDER BY display_name ASC
			",
					ARRAY_A
				);

				if ($lms_users) {
					foreach ($lms_users as $user) {
						if (!empty($user['display_name'])) {
							$user_data[] = array(
								'id' => intval($user['id']),
								'display_name' => sanitize_text_field($user['display_name']),
								'avatar_url' => get_avatar_url($user['email'], array('size' => 96))
							);
						}
					}
				}
			}

			if (empty($user_data)) {
				$wp_users = get_users(array(
					'role__in' => array('administrator', 'editor', 'author', 'contributor', 'subscriber'),
					'orderby' => 'display_name',
					'order' => 'ASC',
					'fields' => array('ID', 'display_name', 'user_email')
				));

				if ($wp_users && !is_wp_error($wp_users)) {
					foreach ($wp_users as $user) {
						if (isset($user->ID) && isset($user->display_name)) {
							$user_data[] = array(
								'id' => intval($user->ID),
								'display_name' => sanitize_text_field($user->display_name),
								'avatar_url' => get_avatar_url($user->ID, array('size' => 96))
							);
						}
					}
				}
			}

			if (empty($user_data)) {
				$user_data = array(
					array(
						'id' => 0,
						'display_name' => 'すべてのユーザー',
						'avatar_url' => get_avatar_url('', array('size' => 96))
					)
				);
			}

			wp_send_json_success(array(
				'users' => $user_data,
				'timestamp' => current_time('mysql')
			));
		} catch (Exception $e) {
			wp_send_json_error('ユーザー一覧の取得に失敗しました: ' . $e->getMessage());
		}
	}


	/**
	 * 新しいスレッド情報取得メソッド
	 * チャンネルIDでフィルタリングし、正確なスレッド情報を取得
	 */
	public function get_thread_info_for_messages($message_ids, $channel_id, $user_id = 0, $include_deleted = false)
	{
		global $wpdb;
		
		if (empty($message_ids)) {
			return ['thread_map' => [], 'avatar_map' => []];
		}

		$placeholders = implode(',', array_fill(0, count($message_ids), '%d'));
		
		// ソフトデリートクラスを使用
		$soft_delete = LMS_Soft_Delete::get_instance();
		$deleted_condition = $include_deleted ? '' : 'AND t.deleted_at IS NULL';
		
		$thread_query = "SELECT t.parent_message_id, COUNT(*) as thread_count, MAX(t.created_at) as latest_reply
						FROM {$wpdb->prefix}lms_chat_thread_messages t
						WHERE t.parent_message_id IN ($placeholders) $deleted_condition
						GROUP BY t.parent_message_id";
		
		
		$thread_info = $wpdb->get_results($wpdb->prepare($thread_query, $message_ids));
		
		$unread_counts = [];
		if ($user_id > 0) {
			// Calculate actual unread count for each thread
			foreach ($message_ids as $parent_message_id) {
				$unread_count = $wpdb->get_var($wpdb->prepare(
					"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
					 LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed lv ON (t.parent_message_id = lv.parent_message_id AND lv.user_id = %d)
					 WHERE t.parent_message_id = %d 
					 AND t.user_id != %d
					 AND (lv.last_viewed_at IS NULL OR t.created_at > lv.last_viewed_at)
					 AND t.deleted_at IS NULL",
					$user_id, $parent_message_id, $user_id
				));
				if ($unread_count > 0) {
					$unread_counts[$parent_message_id] = (int) $unread_count;
				}
			}
		}
		
		if ($wpdb->last_error) {
		}
		
		$test_query = "SELECT COUNT(*) as total_threads FROM {$wpdb->prefix}lms_chat_thread_messages";
		$total_threads = $wpdb->get_var($test_query);
		
		$channel_test_query = "SELECT COUNT(*) as channel_threads 
							   FROM {$wpdb->prefix}lms_chat_thread_messages t
							   JOIN {$wpdb->prefix}lms_chat_messages m ON t.parent_message_id = m.id
							   WHERE m.channel_id = %d";
		$channel_threads = $wpdb->get_var($wpdb->prepare($channel_test_query, $channel_id));
		
		$thread_map = [];
		foreach ($thread_info as $info) {
			$latest_reply = '';
			if ($info->latest_reply) {
				$timestamp = strtotime($info->latest_reply);
				$diff = time() - $timestamp;
				if ($diff < 60) {
					$latest_reply = 'たった今';
				} elseif ($diff < 3600) {
					$latest_reply = floor($diff / 60) . '分前';
				} elseif ($diff < 86400) {
					$latest_reply = floor($diff / 3600) . '時間前';
				} else {
					$latest_reply = floor($diff / 86400) . '日前';
				}
			}
			
			$thread_map[$info->parent_message_id] = [
				'thread_count' => (int) $info->thread_count,
				'latest_reply' => $latest_reply,
				'thread_unread_count' => $unread_counts[$info->parent_message_id] ?? 0
			];
		}
		
		if ($user_id > 0 && !empty($thread_map)) {
			$thread_parent_ids = array_keys($thread_map);
			$unread_placeholders = implode(',', array_fill(0, count($thread_parent_ids), '%d'));
			
			$unread_query = "SELECT t.parent_message_id, COUNT(*) as unread_count
							FROM {$wpdb->prefix}lms_chat_thread_messages t
							LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
								ON v.parent_message_id = t.parent_message_id
								AND v.user_id = %d
							WHERE t.parent_message_id IN ($unread_placeholders)
							AND t.user_id != %d
							AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)
							GROUP BY t.parent_message_id";
			
			$unread_counts = $wpdb->get_results($wpdb->prepare($unread_query, array_merge([$user_id, $user_id], $thread_parent_ids)), OBJECT_K);
			
			foreach ($thread_map as $parent_id => &$thread_data) {
				if (isset($unread_counts[$parent_id])) {
					$thread_data['thread_unread_count'] = (int) $unread_counts[$parent_id]->unread_count;
				}
			}
		}
		
		$avatar_map = [];
		if (!empty($thread_map)) {
			$thread_parent_ids = array_keys($thread_map);
			$avatar_placeholders = implode(',', array_fill(0, count($thread_parent_ids), '%d'));
			
			$thread_users_query = "SELECT parent_message_id, user_id, MIN(created_at) as first_post_time
								   FROM {$wpdb->prefix}lms_chat_thread_messages
								   WHERE parent_message_id IN ($avatar_placeholders)
								   AND deleted_at IS NULL
								   GROUP BY parent_message_id, user_id
								   ORDER BY parent_message_id, first_post_time ASC";
			
			$thread_users = $wpdb->get_results($wpdb->prepare($thread_users_query, $thread_parent_ids));
			
			$user_ids = [];
			foreach ($thread_users as $thread_user) {
				$user_ids[] = (int) $thread_user->user_id;
			}
			$user_ids = array_unique($user_ids);
			
			$avatar_results = [];
			if (!empty($user_ids)) {
				$user_placeholders = implode(',', array_fill(0, count($user_ids), '%d'));
				$users_query = "SELECT id, display_name, avatar_url
								FROM {$wpdb->prefix}lms_users
								WHERE id IN ($user_placeholders)
								AND status = 'active'";
				
				$users_data = $wpdb->get_results($wpdb->prepare($users_query, $user_ids));
				
				$users_map = [];
				foreach ($users_data as $user) {
					$users_map[(int) $user->id] = $user;
				}
				
				foreach ($thread_users as $thread_user) {
					$user_id = (int) $thread_user->user_id;
					if (isset($users_map[$user_id])) {
						$user_data = $users_map[$user_id];
						$avatar_results[] = (object) [
							'parent_message_id' => $thread_user->parent_message_id,
							'user_id' => $user_id,
							'display_name' => $user_data->display_name,
							'avatar_url' => $user_data->avatar_url,
							'first_post_time' => $thread_user->first_post_time
						];
					}
				}
			}
			
			foreach ($avatar_results as $avatar) {
				if (!isset($avatar_map[$avatar->parent_message_id])) {
					$avatar_map[$avatar->parent_message_id] = [];
				}
				
				$user_exists = false;
				foreach ($avatar_map[$avatar->parent_message_id] as $existing_avatar) {
					if ($existing_avatar['user_id'] === (int) $avatar->user_id) {
						$user_exists = true;
						break;
					}
				}
				
				if (!$user_exists) {
					$avatar_map[$avatar->parent_message_id][] = [
						'user_id' => (int) $avatar->user_id,
						'display_name' => $avatar->display_name,
						'avatar_url' => $avatar->avatar_url ?: '',
					];
				}
			}
			
		}
		
		return [
			'thread_map' => $thread_map,
			'avatar_map' => $avatar_map
		];
	}

	/**
	 * メッセージ検索AJAXハンドラ
	 */
	public function handle_search_messages()
	{
		if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error(['message' => 'Invalid nonce']);
			return;
		}

		$query = isset($_GET['query']) ? sanitize_text_field($_GET['query']) : '';
		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		$page = isset($_GET['page']) ? intval($_GET['page']) : 1;

		$options = [
			'channel_id' => isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0,
			'from_user' => isset($_GET['from_user']) ? intval($_GET['from_user']) : 0,
			'user_id' => isset($_GET['user_id']) ? intval($_GET['user_id']) : 0, // 後方互換性のため
			'date_from' => isset($_GET['date_from']) ? sanitize_text_field($_GET['date_from']) : '',
			'date_to' => isset($_GET['date_to']) ? sanitize_text_field($_GET['date_to']) : '',
			'page' => $page,
			'per_page' => isset($_GET['per_page']) ? intval($_GET['per_page']) : 20,
			'limit' => isset($_GET['limit']) ? intval($_GET['limit']) : 20,
			'offset' => isset($_GET['offset']) ? intval($_GET['offset']) : (($page - 1) * (isset($_GET['per_page']) ? intval($_GET['per_page']) : 20)),
			'with_threads' => isset($_GET['with_threads']) && $_GET['with_threads'] === 'true',
			'search_in_threads' => isset($_GET['search_in_threads']) && $_GET['search_in_threads'] === 'true',
		];

		if (!empty($options['from_user'])) {
			$options['user_id'] = $options['from_user'];
		}

		if (
			empty($query) && empty($options['channel_id']) && empty($options['from_user']) &&
			empty($options['user_id']) && empty($options['date_from']) && empty($options['date_to'])
		) {
			wp_send_json_error(['message' => 'Search query or other filter is required']);
			return;
		}

		$cache_key = '';
		if (!empty($user_id)) {
			$options_json = json_encode($options);
			$cache_key = 'lms_chat_search_' . md5(($query ? $query : 'filter_only') . '_' . $user_id . '_' . $options_json);
		}

		$results = false;
		if ($this->is_valid_cache_key($cache_key)) {
			$results = $this->cache_helper->get($cache_key, 'lms_chat');
		}

		if (false === $results) {
			if (!empty($query)) {
				$history_key = "lms_chat_search_history_{$user_id}";
				$search_history = get_user_meta($user_id, $history_key, true);
				if (!$search_history) {
					$search_history = [];
				}

				array_unshift($search_history, [
					'query' => $query,
					'timestamp' => time(),
					'options' => $options
				]);

				$unique_history = [];
				$seen_queries = [];
				foreach ($search_history as $item) {
					if (!isset($seen_queries[$item['query']])) {
						$unique_history[] = $item;
						$seen_queries[$item['query']] = true;
					}
				}

				$unique_history = array_slice($unique_history, 0, 20);
				update_user_meta($user_id, $history_key, $unique_history);
			}

			$results = $this->search_messages($query, $options);

			if ($this->is_valid_cache_key($cache_key)) {
				$this->cache_helper->set($cache_key, $results, 'lms_chat', 30);
			}
		}

		wp_send_json_success($results);
	}

	/**
	 * ユーザーの表示名を取得（LMSテーマ特有の処理）
	 *
	 * @param int $user_id ユーザーID
	 * @return string 表示名
	 */
	private function get_lms_user_display_name($user_id)
	{
		global $wpdb;

		if (empty($user_id) || $user_id <= 0) {
			return '不明なユーザー';
		}

		$lms_user_table = $wpdb->prefix . 'lms_users';
		$lms_display_name = $wpdb->get_var($wpdb->prepare(
			"SELECT display_name FROM {$lms_user_table} WHERE id = %d",
			$user_id
		));

		if (!empty($lms_display_name)) {
			return $lms_display_name;
		}

		$wp_display_name = $wpdb->get_var($wpdb->prepare(
			"SELECT display_name FROM {$wpdb->users} WHERE ID = %d",
			$user_id
		));

		if (!empty($wp_display_name)) {
			return $wp_display_name;
		}

		$nickname = $wpdb->get_var($wpdb->prepare(
			"SELECT meta_value FROM {$wpdb->usermeta}
			 WHERE user_id = %d AND meta_key = 'nickname'",
			$user_id
		));

		if (!empty($nickname)) {
			return $nickname;
		}

		$user_data = get_userdata($user_id);
		if ($user_data) {
			if (!empty($user_data->display_name)) {
				return $user_data->display_name;
			} elseif (!empty($user_data->nickname)) {
				return $user_data->nickname;
			} elseif (!empty($user_data->user_nicename)) {
				return $user_data->user_nicename;
			} elseif (!empty($user_data->user_login)) {
				return $user_data->user_login;
			}
		}

		return 'ユーザー ' . $user_id;
	}

	/**
	 * 特定のメッセージを含むページを検索・表示するAjaxハンドラー
	 */
	public function handle_load_messages()
	{
		try {
			if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
				wp_send_json_error(['message' => 'セキュリティチェックが失敗しました。ページを更新してください。'], 400);
				return;
			}

			if (!isset($_GET['channel_id'])) {
				wp_send_json_error('チャンネルIDが指定されていません。');
				return;
			}

			$channel_id = intval($_GET['channel_id']);
			$page = isset($_GET['page']) ? intval($_GET['page']) : 1;
			$search_message_id = isset($_GET['search_message_id']) ? intval($_GET['search_message_id']) : 0;
			$find_specific_message = isset($_GET['find_specific_message']) ? (bool)$_GET['find_specific_message'] : false;

			if ($search_message_id > 0 && $find_specific_message) {
				global $wpdb;

				$message_check = $wpdb->get_row($wpdb->prepare(
					"SELECT id, channel_id, user_id, message, created_at FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
					$search_message_id
				));

				if (!$message_check) {
					wp_send_json_error([
						'error' => 'メッセージが見つかりません',
						'message_not_found' => true,
						'message_id' => $search_message_id
					]);
					return;
				} else {
					$channel_id = $message_check->channel_id;
				}

				$context_messages = $wpdb->get_results($wpdb->prepare(
					"(SELECT id, channel_id, user_id, message, created_at,
                     file_ids, is_system_message, parent_message_id, reactions_count,
                     thread_count, is_deleted
                     FROM {$wpdb->prefix}lms_chat_messages
					 WHERE channel_id = %d AND id <= %d AND is_deleted = 0
                     ORDER BY id DESC LIMIT 25)
                     UNION
                     (SELECT id, channel_id, user_id, message, created_at,
                     file_ids, is_system_message, parent_message_id, reactions_count,
                     thread_count, is_deleted
                     FROM {$wpdb->prefix}lms_chat_messages
					 WHERE channel_id = %d AND id > %d AND is_deleted = 0
                     ORDER BY id ASC LIMIT 25)
                     ORDER BY id ASC",
					$channel_id,
					$search_message_id,
					$channel_id,
					$search_message_id
				));

				if (empty($context_messages)) {
					$latest_messages = $wpdb->get_results($wpdb->prepare(
						"SELECT id, channel_id, user_id, message, created_at,
						 file_ids, is_system_message, parent_message_id, reactions_count,
						 thread_count, is_deleted
						 FROM {$wpdb->prefix}lms_chat_messages
						 WHERE channel_id = %d AND is_deleted = 0
						 ORDER BY id DESC LIMIT 50",
						$channel_id
					));

					if (empty($latest_messages)) {
						wp_send_json_error([
							'error' => 'チャンネル内にメッセージが見つかりません',
							'channel_id' => $channel_id
						]);
						return;
					}

					$context_messages = array_reverse($latest_messages);
				}

				$formatted_messages = array();

				foreach ($context_messages as $message) {
					$user_data = get_userdata($message->user_id);
					$display_name = $this->get_lms_user_display_name($message->user_id);

					$attachments = array();
					if (!empty($message->file_ids)) {
						$file_ids = explode(',', $message->file_ids);
						foreach ($file_ids as $file_id) {
							$attachment = $this->get_message_attachments_safe(intval($file_id));
							if ($attachment) {
								$attachments[] = $attachment;
							}
						}
					}

					$formatted_message = array(
						'id' => $message->id,
						'channel_id' => $message->channel_id,
						'user_id' => $message->user_id,
						'user_name' => $display_name,
						'avatar' => get_avatar_url($message->user_id, array('size' => 96)),
						'message' => $message->message,
						'created_at' => $message->created_at,
						'formatted_time' => $this->format_message_time($message->created_at),
						'attachments' => $attachments,
						'is_system_message' => (bool)$message->is_system_message,
						'parent_message_id' => $message->parent_message_id,
						'thread_count' => $message->thread_count,
						'reactions_count' => $message->reactions_count
					);

					$formatted_messages[] = $formatted_message;
				}

				$result = array(
					'messages' => $formatted_messages,
					'target_message_id' => $search_message_id,
					'pagination' => array(
						'current_page' => 1,
						'has_more' => false
					),
					'direct_message_load' => true,
					'channel_id' => $channel_id // チャンネルIDを返す
				);

				$result['debug'] = [
					'searched_message_id' => $search_message_id,
					'messages_found' => count($formatted_messages),
					'original_channel_id' => intval($_GET['channel_id']),
					'actual_channel_id' => $channel_id,
					'query_type' => 'direct_message_load'
				];

				wp_send_json_success($result);
				return;
			}

			$messages = $this->get_messages($channel_id, $page, 50);
			wp_send_json_success($messages);
		} catch (Exception $e) {
			wp_send_json_error([
				'message' => 'メッセージの検索中にエラーが発生しました: ' . $e->getMessage(),
				'error_details' => $e->getTraceAsString()
			]);
		}
	}

	/**
	 * メッセージのスレッド情報を取得
	 *
	 * @param int $message_id 親メッセージID
	 * @param int $user_id 現在のユーザーID
	 * @param int $channel_id チャンネルID（オプション）
	 * @return array スレッド情報
	 */
	private function get_thread_info($message_id, $user_id, $channel_id = null)
	{
		global $wpdb;

		if ($channel_id !== null) {
			$parent_channel_id = $wpdb->get_var($wpdb->prepare(
				"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages 
				WHERE id = %d",
				$message_id
			));
			
			if ($parent_channel_id != $channel_id) {
				return [
					'total' => 0,
					'unread' => 0,
					'avatars' => [],
					'latest_reply' => ''
				];
			}
		}

		$cache_key = $this->cache_helper->generate_key([$message_id, $user_id], 'lms_chat_thread_info_detail');

		$cached_info = $this->cache_helper->get($cache_key);
		if (false !== $cached_info) {
			return $cached_info;
		}

		try {
			$count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages
				WHERE parent_message_id = %d AND deleted_at IS NULL",
				$message_id
			));

			if (empty($count) || $count == 0) {
				$result = [
					'total' => 0,
					'unread' => 0,
					'avatars' => [],
					'latest_reply' => ''
				];
				$this->cache_helper->set($cache_key, $result, null, 30);
				return $result;
			}

			$unread_count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
				LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
					ON t.parent_message_id = v.parent_message_id
					AND v.user_id = %d
				WHERE t.parent_message_id = %d
				AND t.user_id != %d
				AND t.deleted_at IS NULL
				AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)",
				$user_id,
				$message_id,
				$user_id
			));

			$latest_reply = $wpdb->get_row($wpdb->prepare(
				"SELECT t.created_at, u.display_name
				FROM {$wpdb->prefix}lms_chat_thread_messages t
				JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
				WHERE t.parent_message_id = %d
				AND t.deleted_at IS NULL
				ORDER BY t.created_at DESC
				LIMIT 1",
				$message_id
			));

			$avatars = $wpdb->get_results($wpdb->prepare(
				"SELECT DISTINCT u.id as user_id, u.display_name, u.avatar_url
				FROM {$wpdb->prefix}lms_chat_thread_messages t
				JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
				WHERE t.parent_message_id = %d
				AND t.deleted_at IS NULL
				ORDER BY t.created_at DESC
				LIMIT 3",
				$message_id
			));

			$formatted_avatars = array_map(function ($user) {
				return [
					'user_id' => (int)$user->user_id,
					'avatar_url' => $user->avatar_url ?: '',
					'display_name' => $user->display_name
				];
			}, $avatars);

			$latest_reply_text = '';
			if ($latest_reply) {
				$timestamp = strtotime($latest_reply->created_at);
				$diff = time() - $timestamp;

				if ($diff < 60) {
					$time_text = 'たった今';
				} elseif ($diff < 3600) {
					$time_text = floor($diff / 60) . '分前';
				} elseif ($diff < 86400) {
					$time_text = floor($diff / 3600) . '時間前';
				} else {
					$time_text = floor($diff / 86400) . '日前';
				}

				$latest_reply_text = sprintf(
					'%sさんが%s',
					$latest_reply->display_name,
					$time_text
				);
			}

			$result = [
				'total' => (int)$count,
				'unread' => (int)$unread_count,
				'avatars' => $formatted_avatars,
				'latest_reply' => $latest_reply_text
			];

			$this->cache_helper->set($cache_key, $result, null, 30);

			return $result;
		} catch (Exception $e) {
			$fallback = [
				'total' => (int)$count ?? 0,
				'unread' => 0,
				'avatars' => [],
				'latest_reply' => ''
			];
			$this->cache_helper->set($cache_key, $fallback, null, 10);

			return $fallback;
		}
	}

	/**
	 * 特定のメッセージを取得するAJAXハンドラー
	 */
	public function handle_get_message()
	{
		try {
			if (!isset($_GET['nonce']) || !wp_verify_nonce($_GET['nonce'], 'lms_ajax_nonce')) {
				wp_send_json_error('セキュリティチェックに失敗しました。', 400);
				return;
			}

			$message_id = isset($_GET['message_id']) ? intval($_GET['message_id']) : 0;
			if (!$message_id) {
				wp_send_json_error('メッセージIDが指定されていません。', 400);
				return;
			}

			$channel_id = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
			$parent_message_id = isset($_GET['parent_message_id']) ? intval($_GET['parent_message_id']) : 0;

			global $wpdb;
			$message_data = null;

			if ($channel_id > 0) {
				$message_data = $wpdb->get_row(
					$wpdb->prepare(
						"SELECT m.*, u.display_name as user_name
						FROM {$wpdb->prefix}lms_chat_messages m
						JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
						WHERE m.id = %d AND m.channel_id = %d",
						$message_id,
						$channel_id
					)
				);
			} else {
				$message_data = $wpdb->get_row(
					$wpdb->prepare(
						"SELECT m.*, u.display_name as user_name
						FROM {$wpdb->prefix}lms_chat_messages m
						JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
						WHERE m.id = %d",
						$message_id
					)
				);
			}

			if (!$message_data && $parent_message_id > 0) {
				$message_data = $wpdb->get_row(
					$wpdb->prepare(
						"SELECT t.*, t.parent_message_id as parent_id, u.display_name as user_name
						FROM {$wpdb->prefix}lms_chat_thread_messages t
						JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
						WHERE t.id = %d AND t.parent_message_id = %d",
						$message_id,
						$parent_message_id
					)
				);
			} else if (!$message_data) {
				$message_data = $wpdb->get_row(
					$wpdb->prepare(
						"SELECT t.*, t.parent_message_id as parent_id, u.display_name as user_name
						FROM {$wpdb->prefix}lms_chat_thread_messages t
						JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
						WHERE t.id = %d",
						$message_id
					)
				);
			}

			if (!$message_data) {
				wp_send_json_error('指定されたメッセージが見つかりません。', 404);
				return;
			}

			$attachments = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
					WHERE message_id = %d OR thread_message_id = %d
					ORDER BY created_at ASC",
					$message_id,
					$message_id
				)
			);

			$message_data = (array) $message_data;
			$message_data['attachments'] = $attachments ? $attachments : array();
			$message_data['avatar_url'] = lms_get_user_avatar_url($message_data['user_id']);
			$message_data['formatted_time'] = $this->format_message_time($message_data['created_at']);

			wp_send_json_success($message_data);
		} catch (Exception $e) {
			wp_send_json_error('メッセージの取得中にエラーが発生しました: ' . $e->getMessage(), 500);
		}
	}

	/**
	 * メッセージ更新を取得
	 * @param int $channel_id チャンネルID
	 * @param int $user_id ユーザーID
	 * @param int $last_timestamp 最後のタイムスタンプ
	 * @return array メッセージ更新データ
	 */
	private function get_message_updates($channel_id, $user_id, $last_timestamp = 0)
	{
		global $wpdb;

		try {
			$channel_id = intval($channel_id);
			$user_id = intval($user_id);
			$last_timestamp = intval($last_timestamp);

			if ($channel_id <= 0) {
				return array();
			}
			$where_clause = "WHERE m.channel_id = %d";
			$params = array($channel_id);

			$current_time = time();
			$min_allowed_time = $current_time - 86400; // 24時間前

			if ($last_timestamp > $current_time) {
				$last_timestamp = $current_time - 10; // 現在時刻の10秒前
			}

			if ($last_timestamp < $min_allowed_time) {
				$last_timestamp = $current_time - 600; // 10分前
			}

			if ($last_timestamp > 0) {
				$last_timestamp = max(0, $last_timestamp - 5);

				$where_clause .= " AND UNIX_TIMESTAMP(m.created_at) > %d";
				$params[] = $last_timestamp;

			} else {
				$ten_minutes_ago = $current_time - 600; // 10分前
				$where_clause .= " AND UNIX_TIMESTAMP(m.created_at) > %d";
				$params[] = $ten_minutes_ago;

			}

			$table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$wpdb->prefix}lms_chat_messages'");
			if (!$table_exists) {
				return array();
			}

			$sql = "SELECT m.*, COALESCE(u.display_name, 'Unknown User') as display_name,
					UNIX_TIMESTAMP(m.created_at) as unix_timestamp
					FROM {$wpdb->prefix}lms_chat_messages m
					LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
					{$where_clause}
					ORDER BY m.created_at ASC
					LIMIT 50";

			$prepared_sql = $wpdb->prepare($sql, $params);
			$messages = $wpdb->get_results($prepared_sql, ARRAY_A);

			if ($wpdb->last_error) {
				return array();
			}

			if (empty($messages)) {
				return array();
			}
			$formatted_messages = array();
			foreach ($messages as $message) {
				$message_id = isset($message['id']) ? intval($message['id']) : 0;
				$message_channel_id = isset($message['channel_id']) ? intval($message['channel_id']) : 0;
				$message_user_id = isset($message['user_id']) ? intval($message['user_id']) : 0;
				$message_content = isset($message['message']) ? $message['message'] : '';
				$message_created_at = isset($message['created_at']) ? $message['created_at'] : current_time('mysql');
				$message_display_name = isset($message['display_name']) ? $message['display_name'] : 'Unknown User';
				$unix_timestamp = isset($message['unix_timestamp']) ? intval($message['unix_timestamp']) : time();

				$attachments = array();
				try {
					$attachments = $this->get_message_attachments($message_id);
				} catch (Exception $e) {
				}

				$formatted_message = array(
					'message' => array(
						'id' => $message_id,
						'channel_id' => $message_channel_id,
						'user_id' => $message_user_id,
						'message' => $message_content,
						'created_at' => $message_created_at,
						'display_name' => $message_display_name,
						'is_new' => true,
						'attachments' => $attachments,
						'unix_timestamp' => $unix_timestamp // UNIXタイムスタンプを追加
					),
					'channel_id' => $channel_id,
					'timestamp' => $unix_timestamp
				);
				$formatted_messages[] = $formatted_message;
			}

			return $formatted_messages;
		} catch (Exception $e) {
			return array();
		}
	}

	/**
	 * 未読カウント更新を取得
	 * @param int $user_id ユーザーID
	 * @return array 未読カウント更新データ
	 */
	private function get_unread_count_updates($user_id)
	{
		$unread_counts = $this->get_unread_counts($user_id);
		return $unread_counts;
	}

	/**
	 * リアクション更新を取得（ロングポーリング用）
	 * @param int $channel_id チャンネルID
	 * @param int $user_id ユーザーID
	 * @param int $last_reaction_timestamp 最後のリアクションタイムスタンプ
	 * @return array リアクション更新データ
	 */
	public function get_reaction_updates($channel_id, $user_id, $last_reaction_timestamp = 0)
	{
		global $wpdb;
		
		// 🔥 統合システム対応: 新しいリアルタイムイベントテーブルを優先して使用
		$realtime_table = $wpdb->prefix . 'lms_chat_realtime_events';
		$legacy_table = $wpdb->prefix . 'lms_chat_reaction_updates';
		
		$this->create_reaction_updates_table();
		
		$reactions = [];
		
		// 1. まず新しいリアルタイムイベントテーブルから取得
		$table_exists = $wpdb->get_var("SHOW TABLES LIKE '$realtime_table'") === $realtime_table;
		
		if ($table_exists) {
			$where_clause = "event_type = 'reaction_update'";
			$where_params = [];
			
			if ($channel_id > 0) {
				$where_clause .= " AND channel_id = %d";
				$where_params[] = $channel_id;
			}
			
			if ($last_reaction_timestamp > 0) {
				$where_clause .= " AND timestamp > %d";
				$where_params[] = $last_reaction_timestamp;
			}
			
			$realtime_updates = $wpdb->get_results($wpdb->prepare(
				"SELECT message_id, data, timestamp
				FROM {$realtime_table}
				WHERE {$where_clause}
				ORDER BY timestamp ASC
				LIMIT 50",
				$where_params
			));
			
			foreach ($realtime_updates as $update) {
				$event_data = json_decode($update->data, true);
				if ($event_data && isset($event_data['reactions'])) {
					$reactions[] = array(
						'message_id' => $update->message_id,
						'reactions' => $event_data['reactions'],
						'is_thread' => $event_data['is_thread'] ?? false,
						'timestamp' => $update->timestamp
					);
				}
			}
		}
		
		// 2. レガシーテーブルからも取得（後方互換性）
		$where_clause = "ru.is_thread = 0";
		$where_params = [];
		
		if ($last_reaction_timestamp > 0) {
			$where_clause .= " AND ru.timestamp > %d";
			$where_params[] = $last_reaction_timestamp;
		}
		
		if ($channel_id > 0) {
			$legacy_updates = $wpdb->get_results($wpdb->prepare(
				"SELECT ru.message_id, ru.reactions, ru.is_thread, ru.timestamp
				FROM {$legacy_table} ru
				JOIN {$wpdb->prefix}lms_chat_messages m ON ru.message_id = m.id
				WHERE m.channel_id = %d AND {$where_clause}
				ORDER BY ru.timestamp ASC
				LIMIT 50",
				array_merge([$channel_id], $where_params)
			));
		} else {
			$legacy_updates = $wpdb->get_results($wpdb->prepare(
				"SELECT ru.message_id, ru.reactions, ru.is_thread, ru.timestamp
				FROM {$legacy_table} ru
				WHERE {$where_clause}
				ORDER BY ru.timestamp ASC
				LIMIT 50",
				$where_params
			));
		}
		
		// レガシーデータを追加
		if (!empty($legacy_updates)) {
			foreach ($legacy_updates as $update) {
				$reactions[] = array(
					'message_id' => $update->message_id,
					'reactions' => json_decode($update->reactions, true),
					'is_thread' => (bool)$update->is_thread,
					'timestamp' => $update->timestamp
				);
			}
		}
		
		// 3. 重複削除とソート
		if (!empty($reactions)) {
			// タイムスタンプでソート
			usort($reactions, function($a, $b) {
				return $a['timestamp'] - $b['timestamp'];
			});
		}
		
		if (empty($reactions)) {
			return [];
		}
		
		// 4. 古いデータをクリーンアップ
		$wpdb->query($wpdb->prepare(
			"DELETE FROM {$legacy_table} WHERE timestamp <= %d AND is_thread = 0",
			time() - 600 // 10分前より古いものを削除
		));
		
		// リアルタイムイベントテーブルの古いデータもクリーンアップ
		if ($table_exists) {
			$wpdb->query($wpdb->prepare(
				"DELETE FROM {$realtime_table} WHERE timestamp <= %d AND event_type = 'reaction_update'",
				time() - 3600 // 1時間前より古いものを削除
			));
		}

		return $reactions;
	}

	/**
	 * スレッド更新を取得（ロングポーリング用）
	 * @param int $thread_id スレッドID
	 * @param int $user_id ユーザーID
	 * @param int $last_message_timestamp 最後のメッセージタイムスタンプ
	 * @return array スレッド更新データ
	 */
	private function get_thread_updates($thread_id, $user_id, $last_message_timestamp = 0)
	{
		global $wpdb;

		$cache_key = '';
		if (!empty($thread_id) && !empty($user_id)) {
			$cache_key = $this->cache_helper->generate_key([$thread_id, $user_id, $last_message_timestamp], 'lms_chat_thread_updates');
		}

		if (empty($cache_key)) {
			return [];
		}

		$cached_updates = $this->cache_helper->get($cache_key);
		if (false !== $cached_updates) {
			return $cached_updates;
		}

		$updates = [];

		$where_clause = "t.parent_message_id = %d";
		$where_params = [$thread_id];

		if ($last_message_timestamp > 0) {
			$where_clause .= " AND UNIX_TIMESTAMP(t.created_at) > %d";
			$where_params[] = $last_message_timestamp;
		}

		$new_messages = $wpdb->get_results($wpdb->prepare(
			"SELECT t.*, u.display_name, u.avatar_url,
			TIME(t.created_at) as message_time,
			UNIX_TIMESTAMP(t.created_at) as timestamp
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE {$where_clause}
			ORDER BY t.created_at DESC
			LIMIT 10",
			$where_params
		));

		if (!empty($new_messages)) {
			$latest_timestamp = 0;

			foreach ($new_messages as &$message) {
				if ($message->timestamp > $latest_timestamp) {
					$latest_timestamp = $message->timestamp;
				}

				$message->reactions = $this->get_thread_message_reactions($message->id);

				$attachments = $wpdb->get_results($wpdb->prepare(
					"SELECT * FROM {$wpdb->prefix}lms_chat_attachments
					WHERE message_id = %d
					ORDER BY created_at ASC",
					$message->id
				));

				if ($attachments) {
					$upload_dir = wp_upload_dir();
					$upload_base_dir = ABSPATH . 'wp-content/chat-files-uploads';
					foreach ($attachments as &$attachment) {
						$attachment->url = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->file_path;
						if ($attachment->thumbnail_path) {
							// サムネイルファイルの存在チェック
							$thumb_file = $upload_base_dir . '/' . $attachment->thumbnail_path;
							if (file_exists($thumb_file)) {
								$attachment->thumbnail = $upload_dir['baseurl'] . '/chat-files-uploads/' . $attachment->thumbnail_path;
							} else {
								// サムネイルが存在しない場合はnullにする
								$attachment->thumbnail_path = null;
							}
						}
					}
					$message->attachments = $attachments;
				} else {
					$message->attachments = array();
				}

				$message->formatted_time = date('H:i', strtotime($message->message_time));
			}

			$updates['messages'] = $new_messages;
			$updates['timestamp'] = $latest_timestamp;
		}

		$this->cache_helper->set($cache_key, $updates, null, 30);
		return $updates;
	}

	public function get_thread_reaction_updates($thread_ids, $user_id, $last_reaction_timestamp = 0)
	{
		// get_thread_reaction_updates start (debug log removed)
		
		global $wpdb;

		$table_name = $wpdb->prefix . 'lms_chat_reaction_updates';
		$this->create_reaction_updates_table();

		$normalized_thread_ids = array();
		if (is_array($thread_ids)) {
			foreach ($thread_ids as $candidate) {
				$candidate = intval($candidate);
				if ($candidate > 0) {
					$normalized_thread_ids[] = $candidate;
				}
			}
		} else {
			$single_id = intval($thread_ids);
			if ($single_id > 0) {
				$normalized_thread_ids[] = $single_id;
			}
		}
		$normalized_thread_ids = array_values(array_unique($normalized_thread_ids));

		$where_parts = array('ru.is_thread = 1');
		$query_params = array();

		if ($last_reaction_timestamp > 0) {
			$where_parts[] = 'ru.timestamp > %d';
			$query_params[] = (int) $last_reaction_timestamp;
		}

		if (!empty($normalized_thread_ids)) {
			$placeholders = implode(',', array_fill(0, count($normalized_thread_ids), '%d'));
			$where_parts[] = sprintf(
				'(ru.thread_id IN (%1$s) OR (ru.thread_id = 0 AND tm.parent_message_id IN (%1$s)))',
				$placeholders
			);
			$query_params = array_merge($query_params, $normalized_thread_ids, $normalized_thread_ids);
		}

		$where_sql = implode(' AND ', $where_parts);

		$sql = "SELECT 
			ru.message_id,
			ru.reactions,
			ru.is_thread,
			ru.timestamp,
			CASE 
				WHEN ru.thread_id IS NOT NULL AND ru.thread_id > 0 THEN ru.thread_id
				ELSE tm.parent_message_id
			END AS thread_id
		FROM {$table_name} ru
		LEFT JOIN {$wpdb->prefix}lms_chat_thread_messages tm ON ru.message_id = tm.id
		WHERE {$where_sql}
		ORDER BY ru.timestamp ASC
		LIMIT 50";

		$prepared_sql = !empty($query_params) ? $wpdb->prepare($sql, $query_params) : $sql;
		$updates = $wpdb->get_results($prepared_sql);

		// query finished (debug log removed)

		if (!$updates) {
			return array();
		}

		$results = array();
		foreach ($updates as $update) {
			$decoded = is_array($update->reactions) ? $update->reactions : json_decode($update->reactions, true);
			$thread_id = isset($update->thread_id) ? intval($update->thread_id) : 0;

			$results[] = array(
				'message_id' => (int) $update->message_id,
				'reactions' => is_array($decoded) ? $decoded : array(),
				'is_thread' => (bool) $update->is_thread,
				'timestamp' => (int) $update->timestamp,
				'thread_id' => $thread_id,
			);
		}

		$wpdb->query($wpdb->prepare(
			"DELETE FROM {$table_name} WHERE timestamp <= %d AND is_thread = 1",
			time() - 300
		));

		return $results;
	}

	/**
	 * すべてのテーブルにdeleted_atカラムを追加
	 */
	public function add_deleted_at_to_all_tables()
	{
		global $wpdb;
		
		$tables = [
			$wpdb->prefix . 'lms_chat_messages',
			$wpdb->prefix . 'lms_chat_thread_messages',
			$wpdb->prefix . 'lms_chat_attachments',
			$wpdb->prefix . 'lms_chat_reactions',
			$wpdb->prefix . 'lms_users'
		];

		foreach ($tables as $table_name) {
			// テーブルが存在するかチェック
			$table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$table_name}'");
			if (!$table_exists) {
				continue;
			}

			$column_exists = $wpdb->get_results("SHOW COLUMNS FROM {$table_name} LIKE 'deleted_at'");

			if (empty($column_exists)) {
				$wpdb->query("ALTER TABLE {$table_name} ADD COLUMN deleted_at datetime DEFAULT NULL");
				
				// インデックスを追加
				$wpdb->query("ALTER TABLE {$table_name} ADD INDEX idx_deleted_at (deleted_at)");
			}
		}
		return true;
	}

	/**
	 * スレッドメッセージテーブルにdeleted_atカラムを追加（互換性のため残す）
	 */
	public function add_deleted_at_to_thread_messages()
	{
		$this->add_deleted_at_to_all_tables();
		return true;
	}

	/**
	 * SSEクライアントにリアルタイム通知を送信（削除済み）
	 * @param string $event_type イベントタイプ
	 * @param array $data 送信データ
	 */
	public function notify_sse_clients($event_type, $data) {
		return;
	}

	/**
	 * Nonceリフレッシュ処理
	 */
	public function handle_refresh_nonce()
	{
		try {
			$user_id = 0;
			
			if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] > 0) {
				$user_id = intval($_SESSION['lms_user_id']);
			} elseif (function_exists('is_user_logged_in') && lms_is_user_logged_in()) {
				$user_id = lms_get_current_user_id();
			}
			
			$new_nonce = wp_create_nonce('lms_ajax_nonce');
			
			wp_send_json_success([
				'nonce' => $new_nonce,
				'user_id' => $user_id,
				'timestamp' => time()
			]);
			
		} catch (Exception $e) {
			wp_send_json_error('Nonce refresh failed');
		}
	}

	/**
	 * ユーザーの表示情報を取得
	 *
	 * @param int $user_id ユーザーID
	 * @return array ユーザーの表示情報
	 */
	public function get_user_display_info($user_id) {
		$cache_key = 'user_display_info_' . $user_id;
		
		$cached_info = wp_cache_get($cache_key, 'lms_chat');
		if ($cached_info !== false) {
			return $cached_info;
		}

		global $wpdb;
		
		$user_info = [
			'display_name' => 'Unknown User',
			'avatar_url' => '',
			'user_id' => $user_id
		];

		try {
			$user = $wpdb->get_row($wpdb->prepare(
				"SELECT id, username, display_name, email FROM {$wpdb->prefix}lms_users WHERE id = %d",
				$user_id
			));

			if ($user) {
				$user_info['display_name'] = $user->display_name ?: $user->username ?: 'User ' . $user_id;
				$user_info['email'] = $user->email ?: '';
			} else {
				$wp_user = get_user_by('id', $user_id);
				if ($wp_user) {
					$user_info['display_name'] = $wp_user->display_name ?: $wp_user->user_login;
					$user_info['email'] = $wp_user->user_email ?: '';
				}
			}

			if (!empty($user_info['email'])) {
				$user_info['avatar_url'] = 'https://www.gravatar.com/avatar/' . md5(strtolower(trim($user_info['email']))) . '?s=32&d=identicon';
			} else {
				$user_info['avatar_url'] = 'https://www.gravatar.com/avatar/default?s=32&d=identicon';
			}

		} catch (Exception $e) {
		}

		wp_cache_set($cache_key, $user_info, 'lms_chat', 300);

		return $user_info;
	}

	/**
	 * スレッドアバターのテスト用AJAXハンドラー
	 */
	public function handle_test_thread_avatars()
	{
		if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 0;
		if (!$message_id) {
			wp_send_json_error('Message ID is required');
			return;
		}

		global $wpdb;

		$message = $wpdb->get_row($wpdb->prepare(
			"SELECT id, channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
			$message_id
		));

		if (!$message) {
			wp_send_json_error('Message not found');
			return;
		}

		$thread_info = $this->get_thread_info_for_messages([$message_id], $message->channel_id);

		$thread_count = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d AND deleted_at IS NULL",
			$message_id
		));

		$avatars = [];
		if (isset($thread_info['avatar_map'][$message_id])) {
			$avatars = $thread_info['avatar_map'][$message_id];
		}

		wp_send_json_success([
			'message_id' => $message_id,
			'thread_count' => (int) $thread_count,
			'avatar_count' => count($avatars),
			'avatars' => $avatars,
			'raw_thread_info' => $thread_info
		]);
	}

	/**
	 * スレッド情報のデバッグ用AJAXハンドラー
	 * 実際のリクエストパラメータと処理結果を詳細にログ出力
	 */
	public function handle_debug_thread_info()
	{
		$debug_info = [
			'timestamp' => date('Y-m-d H:i:s'),
			'request_method' => $_SERVER['REQUEST_METHOD'],
			'post_data' => $_POST,
			'get_data' => $_GET,
			'session_user_id' => isset($_SESSION['lms_user_id']) ? $_SESSION['lms_user_id'] : null
		];
		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : (isset($_GET['nonce']) ? $_GET['nonce'] : '');
		if (!$nonce || !wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
		if (!$user_id) {
			wp_send_json_error('User not found');
			return;
		}

		$message_id = isset($_POST['message_id']) ? intval($_POST['message_id']) : 
						(isset($_GET['message_id']) ? intval($_GET['message_id']) : 0);

		if (!$message_id) {
			wp_send_json_error('Message ID is required');
			return;
		}

		global $wpdb;

		$raw_thread_messages = $wpdb->get_results($wpdb->prepare("
			SELECT t.*, u.display_name, u.avatar_url, u.status
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE t.parent_message_id = %d
			ORDER BY t.created_at ASC
		", $message_id));

		$active_messages = $wpdb->get_results($wpdb->prepare("
			SELECT t.*, u.display_name, u.avatar_url, u.status
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE t.parent_message_id = %d AND t.deleted_at IS NULL
			ORDER BY t.created_at ASC
		", $message_id));

		$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 1;
		$api_result = $this->get_thread_info_for_messages([$message_id], $channel_id, $user_id);

		$unique_users = $wpdb->get_results($wpdb->prepare("
			SELECT DISTINCT u.id as user_id, u.display_name, u.avatar_url, u.status
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE t.parent_message_id = %d AND t.deleted_at IS NULL
			ORDER BY u.id
		", $message_id));

		$debug_result = [
			'message_id' => $message_id,
			'channel_id' => $channel_id,
			'user_id' => $user_id,
			'raw_thread_messages_count' => count($raw_thread_messages),
			'active_messages_count' => count($active_messages),
			'unique_users_count' => count($unique_users),
			'raw_messages' => $raw_thread_messages,
			'active_messages' => $active_messages,
			'unique_users' => $unique_users,
			'api_result' => $api_result,
			'user_ids_found' => array_column($unique_users, 'user_id'),
			'has_user_2' => in_array(2, array_column($unique_users, 'user_id')),
			'has_user_4' => in_array(4, array_column($unique_users, 'user_id'))
		];
		wp_send_json_success($debug_result);
	}

	/**
	 * 新しいシンプルで確実なスレッドアバター取得メソッド
	 * 複雑なロジックを排除し、確実に全参加者を取得
	 */
	public function get_thread_avatars_simple($parent_message_id)
	{
		global $wpdb;

		if (!$parent_message_id || !is_numeric($parent_message_id)) {
			return [];
		}

		$query = "
			SELECT DISTINCT 
				u.id as user_id,
				u.display_name,
				u.avatar_url,
				u.status,
				MIN(t.created_at) as first_post_time
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			INNER JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
			WHERE t.parent_message_id = %d
			AND t.deleted_at IS NULL
			GROUP BY u.id, u.display_name, u.avatar_url, u.status
			ORDER BY first_post_time ASC
		";

		$results = $wpdb->get_results($wpdb->prepare($query, $parent_message_id));

		if ($wpdb->last_error) {
			return [];
		}

		$avatars = [];
		foreach ($results as $user) {
			if ($user->status === 'active') {
				$avatars[] = [
					'user_id' => (int) $user->user_id,
					'display_name' => $user->display_name,
					'avatar_url' => $user->avatar_url ?: '',
				];
			}
		}
		return $avatars;
	}

	/**
	 * 新しい汎用スレッド情報取得メソッド
	 * 確実性を最優先とした実装
	 */
	public function get_thread_info_reliable($parent_message_ids, $channel_id = null, $user_id = 0)
	{
		global $wpdb;

		if (empty($parent_message_ids)) {
			return ['thread_map' => [], 'avatar_map' => []];
		}

		if (!is_array($parent_message_ids)) {
			$parent_message_ids = [$parent_message_ids];
		}

		$thread_map = [];
		$avatar_map = [];

		foreach ($parent_message_ids as $message_id) {
			$message_id = (int) $message_id;
			if ($message_id <= 0) continue;

			if ($channel_id !== null) {
				$parent_channel = $wpdb->get_var($wpdb->prepare(
					"SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d",
					$message_id
				));
				
				if ($parent_channel != $channel_id) {
					continue;
				}
			}

			$thread_count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages 
				WHERE parent_message_id = %d AND deleted_at IS NULL",
				$message_id
			));

			$thread_count = (int) $thread_count;

			if ($thread_count > 0) {
				$latest_reply_time = $wpdb->get_var($wpdb->prepare(
					"SELECT MAX(created_at) FROM {$wpdb->prefix}lms_chat_thread_messages 
					WHERE parent_message_id = %d AND deleted_at IS NULL",
					$message_id
				));

				$latest_reply = '';
				if ($latest_reply_time) {
					$timestamp = strtotime($latest_reply_time);
					$diff = time() - $timestamp;
					if ($diff < 60) {
						$latest_reply = 'たった今';
					} elseif ($diff < 3600) {
						$latest_reply = floor($diff / 60) . '分前';
					} elseif ($diff < 86400) {
						$latest_reply = floor($diff / 3600) . '時間前';
					} else {
						$latest_reply = floor($diff / 86400) . '日前';
					}
				}

				$unread_count = 0;
				if ($user_id > 0) {
					$unread_count = $wpdb->get_var($wpdb->prepare(
						"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
						LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
							ON v.parent_message_id = t.parent_message_id AND v.user_id = %d
						WHERE t.parent_message_id = %d
						AND t.user_id != %d
						AND t.deleted_at IS NULL
						AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)",
						$user_id, $message_id, $user_id
					));
				}

				$thread_map[$message_id] = [
					'thread_count' => $thread_count,
					'latest_reply' => $latest_reply,
					'thread_unread_count' => (int) $unread_count
				];

				$avatar_map[$message_id] = $this->get_thread_avatars_simple($message_id);
			}
		}

		return [
			'thread_map' => $thread_map,
			'avatar_map' => $avatar_map
		];
	}

	/**
	 * 新しいAPIハンドラー（確実版）
	 */
	public function handle_get_thread_info_reliable()
	{
		$nonce = isset($_POST['nonce']) ? $_POST['nonce'] : (isset($_GET['nonce']) ? $_GET['nonce'] : '');
		if (!$nonce || !wp_verify_nonce($nonce, 'lms_ajax_nonce')) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;

		$parent_message_ids = [];
		
		if (isset($_POST['parent_message_ids']) && is_array($_POST['parent_message_ids'])) {
			$parent_message_ids = array_map('intval', $_POST['parent_message_ids']);
		} elseif (isset($_POST['parent_message_id'])) {
			$parent_message_ids = [intval($_POST['parent_message_id'])];
		} elseif (isset($_GET['parent_message_ids'])) {
			$ids_string = sanitize_text_field($_GET['parent_message_ids']);
			$parent_message_ids = array_map('intval', explode(',', $ids_string));
		} elseif (isset($_GET['parent_message_id'])) {
			$parent_message_ids = [intval($_GET['parent_message_id'])];
		}

		if (empty($parent_message_ids)) {
			wp_send_json_error('Parent message ID is required');
			return;
		}

		$channel_id = isset($_POST['channel_id']) ? intval($_POST['channel_id']) : 
					  (isset($_GET['channel_id']) ? intval($_GET['channel_id']) : null);

		$result = $this->get_thread_info_reliable($parent_message_ids, $channel_id, $user_id);

		$response_data = [];
		foreach ($parent_message_ids as $msg_id) {
			if (isset($result['thread_map'][$msg_id])) {
				$thread_data = $result['thread_map'][$msg_id];
				$avatars = isset($result['avatar_map'][$msg_id]) ? $result['avatar_map'][$msg_id] : [];
				
				$response_data[$msg_id] = [
					'thread_count' => $thread_data['thread_count'],
					'thread_unread_count' => $thread_data['thread_unread_count'],
					'latest_reply' => $thread_data['latest_reply'],
					'avatars' => $avatars
				];
			} else {
				$response_data[$msg_id] = [
					'thread_count' => 0,
					'thread_unread_count' => 0,
					'latest_reply' => '',
					'avatars' => []
				];
			}
		}
		wp_send_json_success($response_data);
	}
	
	/**
	 * 必要なデータベーステーブルが存在するかチェックし、必要に応じて作成
	 */
	private function ensure_all_tables_exist()
	{
		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();

		$tables = array(
			"{$wpdb->prefix}lms_chat_mentions" => "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_mentions (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				message_id bigint(20) NOT NULL,
				mentioned_user_id bigint(20) NOT NULL,
				created_at datetime DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY message_id (message_id),
				KEY mentioned_user_id (mentioned_user_id)
			) $charset_collate;",
			
			"{$wpdb->prefix}lms_message_read_status" => "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_message_read_status (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				message_id bigint(20) NOT NULL,
				user_id bigint(20) NOT NULL,
				read_at datetime DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY unique_message_user (message_id, user_id),
				KEY message_id (message_id),
				KEY user_id (user_id)
			) $charset_collate;",
			
			"{$wpdb->prefix}lms_thread_read_status" => "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_thread_read_status (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				parent_message_id bigint(20) NOT NULL,
				user_id bigint(20) NOT NULL,
				last_read_at datetime DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY unique_thread_user (parent_message_id, user_id),
				KEY parent_message_id (parent_message_id),
				KEY user_id (user_id)
			) $charset_collate;",
			
			"{$wpdb->prefix}lms_channel_members" => "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_channel_members (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				channel_id bigint(20) NOT NULL,
				user_id bigint(20) NOT NULL,
				joined_at datetime DEFAULT CURRENT_TIMESTAMP,
				role enum('member', 'admin') DEFAULT 'member',
				PRIMARY KEY (id),
				UNIQUE KEY unique_channel_user (channel_id, user_id),
				KEY channel_id (channel_id),
				KEY user_id (user_id)
			) $charset_collate;",
			
			"{$wpdb->prefix}lms_chat_thread_reactions" => "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_thread_reactions (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				message_id bigint(20) NOT NULL,
				user_id bigint(20) NOT NULL,
				reaction varchar(50) NOT NULL,
				created_at datetime DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY message_id (message_id),
				KEY user_id (user_id),
				UNIQUE KEY unique_message_user_reaction (message_id, user_id, reaction)
			) $charset_collate;",
			
			"{$wpdb->prefix}lms_chat_deletion_log" => "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_deletion_log (
				id bigint(20) NOT NULL AUTO_INCREMENT,
				message_id bigint(20) NOT NULL,
				message_type enum('main', 'thread') NOT NULL,
				channel_id bigint(20) NOT NULL,
				thread_id bigint(20) NULL,
				deleted_at datetime DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY channel_id (channel_id),
				KEY deleted_at (deleted_at)
			) $charset_collate;"
		);

		require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
		
		foreach ($tables as $table_name => $sql) {
			try {
				if ($wpdb->get_var("SHOW TABLES LIKE '$table_name'") !== $table_name) {
					dbDelta($sql);
					
					if ($wpdb->last_error) {
					}
				}
			} catch (Exception $e) {
			}
		}
	}

	/**
	 * 最適化された認証処理（キャッシュ機構付き）
	 * 
	 * @return int ユーザーID（0の場合は認証失敗）
	 */
	private function get_authenticated_user_id_optimized()
	{
		$now = time();
		
		if (self::$cached_user_id !== null && ($now - self::$cache_timestamp) < 300) {
			return self::$cached_user_id;
		}
		
		$user_id = 0;
		
		if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] > 0) {
			$user_id = intval($_SESSION['lms_user_id']);
		}
		elseif (class_exists('LMS_Auth')) {
			$lms_auth = LMS_Auth::get_instance();
			if ($lms_auth && method_exists($lms_auth, 'get_current_user_id')) {
				$temp_user_id = $lms_auth->get_current_user_id();
				if ($temp_user_id > 0) {
					$user_id = intval($temp_user_id);
				}
			}
		}
		elseif (lms_is_user_logged_in()) {
			$temp_user_id = lms_get_current_user_id();
			if ($temp_user_id > 0) {
				$user_id = intval($temp_user_id);
			}
		}
		
		self::$cached_user_id = $user_id;
		self::$cache_timestamp = $now;
		
		return $user_id;
	}
	
	/**
	 * データ整合性チェックと修復のためのヘルパー関数
	 * 管理者用の一時的な関数
	 */
	public function check_and_repair_orphaned_threads()
	{
		global $wpdb;
		
		// 孤立したスレッドメッセージを検出
		$orphaned_threads = $wpdb->get_results("
			SELECT 
				t.id as thread_id, 
				t.parent_message_id, 
				t.user_id, 
				LEFT(t.message, 100) as thread_message,
				t.created_at
			FROM {$wpdb->prefix}lms_chat_thread_messages t
			LEFT JOIN {$wpdb->prefix}lms_chat_messages m ON t.parent_message_id = m.id
			WHERE m.id IS NULL
			ORDER BY t.parent_message_id, t.id
		");
		
		$report = [
			'total_orphaned' => count($orphaned_threads),
			'orphaned_by_parent' => [],
			'repair_suggestions' => []
		];
		
		// 親IDごとにグループ化
		foreach ($orphaned_threads as $orphan) {
			$parent_id = $orphan->parent_message_id;
			if (!isset($report['orphaned_by_parent'][$parent_id])) {
				$report['orphaned_by_parent'][$parent_id] = [];
			}
			$report['orphaned_by_parent'][$parent_id][] = $orphan;
		}
		
		// 修復提案を生成
		foreach ($report['orphaned_by_parent'] as $parent_id => $threads) {
			$count = count($threads);
			
			// 近隣のメッセージを検索
			$nearby_messages = $wpdb->get_results($wpdb->prepare("
				SELECT id, LEFT(message, 50) as message_preview, channel_id, created_at
				FROM {$wpdb->prefix}lms_chat_messages 
				WHERE id BETWEEN %d AND %d 
				AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')
				ORDER BY ABS(id - %d) ASC
				LIMIT 3
			", $parent_id - 5, $parent_id + 5, $parent_id));
			
			$report['repair_suggestions'][$parent_id] = [
				'thread_count' => $count,
				'nearby_messages' => $nearby_messages,
				'recommended_action' => $count > 5 ? 'reassign_to_nearby' : 'create_dummy_parent'
			];
		}
		
		return $report;
	}
	
	/**
	 * 手動でparent_id=251を修復
	 * 管理者コンソールから呼び出し可能
	 */
	public function manual_repair_parent_251()
	{
		global $wpdb;
		
		// 既に存在する場合はスキップ
		$exists = $wpdb->get_var($wpdb->prepare("
			SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_messages WHERE id = %d
		", 251));
		
		if ($exists) {
			return ['success' => false, 'message' => 'メッセージID 251は既に存在します。'];
		}
		
		// 孤立スレッド数確認
		$thread_count = $wpdb->get_var($wpdb->prepare("
			SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages WHERE parent_message_id = %d
		", 251));
		
		if ($thread_count == 0) {
			return ['success' => false, 'message' => '修復対象のスレッドメッセージがありません。'];
		}
		
		// 最初のスレッド情報を取得
		$first_thread = $wpdb->get_row($wpdb->prepare("
			SELECT user_id, created_at 
			FROM {$wpdb->prefix}lms_chat_thread_messages 
			WHERE parent_message_id = %d 
			ORDER BY created_at ASC 
			LIMIT 1
		", 251));
		
		// 近隣メッセージからチャンネル情報取得
		$nearby_message = $wpdb->get_row($wpdb->prepare("
			SELECT channel_id FROM {$wpdb->prefix}lms_chat_messages 
			WHERE id BETWEEN %d AND %d 
			AND (deleted_at IS NULL OR deleted_at = '0000-00-00 00:00:00')
			ORDER BY ABS(id - 251) ASC 
			LIMIT 1
		", 248, 254));
		
		$insert_data = [
			'id' => 251,
			'channel_id' => $nearby_message ? $nearby_message->channel_id : 1,
			'user_id' => $first_thread ? $first_thread->user_id : 1,
			'message' => "[手動復旧] このメッセージは削除されましたが、{$thread_count}件の返信があるため手動復旧しました。元の内容は不明です。",
			'created_at' => $first_thread ? $first_thread->created_at : current_time('mysql'),
			'updated_at' => current_time('mysql'),
			'is_deleted' => 0,
			'is_system_message' => 1,
			'thread_count' => $thread_count
		];
		
		$wpdb->query('START TRANSACTION');
		
		try {
			$result = $wpdb->insert(
				$wpdb->prefix . 'lms_chat_messages',
				$insert_data,
				['%d', '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%d']
			);
			
			if ($result === false) {
				throw new Exception("Insert failed: " . $wpdb->last_error);
			}
			
			$wpdb->query('COMMIT');
			
			return [
				'success' => true, 
				'message' => "メッセージID 251を手動復旧しました。{$thread_count}件のスレッドが復活します。"
			];
			
		} catch (Exception $e) {
			$wpdb->query('ROLLBACK');
			return ['success' => false, 'message' => '修復に失敗しました: ' . $e->getMessage()];
		}
	}

	/**
	 * リアルタイム未読バッジシステム用メソッド群
	 */
	
	/**
	 * メッセージを未読としてマーク（リアルタイム版）
	 */
	public function handle_mark_message_as_unread_realtime()
	{
		global $wpdb;
		
		try {
			
			if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
				wp_send_json_error('Invalid nonce');
				return;
			}

			$user_id = lms_get_current_user_id();
			if (!$user_id) {
				wp_send_json_error('User not authenticated');
				return;
			}

			$message_id = intval($_POST['message_id'] ?? 0);
			$channel_id = intval($_POST['channel_id'] ?? 0);
			$parent_message_id = isset($_POST['parent_message_id']) ? intval($_POST['parent_message_id']) : null;
			$message_type = sanitize_text_field($_POST['message_type'] ?? 'main');
			if (!$message_id || !$channel_id) {
				wp_send_json_error('Missing required parameters');
				return;
			}

			// 未読メッセージテーブルが存在することを確認
			$this->ensure_unread_messages_table_exists();

			// 既存の未読レコードをチェック
			$existing = $wpdb->get_row($wpdb->prepare(
				"SELECT id FROM {$wpdb->prefix}lms_chat_unread_messages 
				 WHERE user_id = %d AND message_id = %d AND message_type = %s",
				$user_id, $message_id, $message_type
			));

			if (!$existing) {
				// 新規未読レコードを挿入
				$result = $wpdb->insert(
					"{$wpdb->prefix}lms_chat_unread_messages",
					array(
						'user_id' => $user_id,
						'message_id' => $message_id,
						'channel_id' => $channel_id,
						'parent_message_id' => $parent_message_id,
						'message_type' => $message_type,
						'created_at' => current_time('mysql')
					),
					array('%d', '%d', '%d', '%d', '%s', '%s')
				);

				if ($result !== false) {
					wp_send_json_success(array(
						'message' => 'Message marked as unread successfully',
						'unread_id' => $wpdb->insert_id
					));
				} else {
					wp_send_json_error('Failed to mark message as unread');
				}
			} else {
				wp_send_json_success(array(
					'message' => 'Message already marked as unread',
					'unread_id' => $existing->id
				));
			}
		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

	/**
	 * チャンネル別未読数を取得
	 */
	public function handle_get_channel_unread_count()
	{
		global $wpdb;
		
		try {
			// テーブルの存在を確認
			$this->ensure_unread_messages_table_exists();
			
			if (!isset($_POST["nonce"]) || !wp_verify_nonce($_POST["nonce"], "lms_ajax_nonce")) {
				wp_send_json_error('Invalid nonce');
				return;
			}

			$user_id = lms_get_current_user_id();
			if (!$user_id) {
				wp_send_json_error('User not authenticated');
				return;
			}

			$channel_id = intval($_POST['channel_id'] ?? 0);
			if (!$channel_id) {
				wp_send_json_error('Channel ID is required');
				return;
			}

			// チャンネルの未読数を取得（メインメッセージ + スレッドメッセージ）
			$count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_unread_messages 
				 WHERE user_id = %d AND channel_id = %d",
				$user_id, $channel_id
			));

			wp_send_json_success(array(
				'channel_id' => $channel_id,
				'count' => intval($count)
			));
		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

	/**
	 * スレッド別未読数を取得
	 */
	public function handle_get_thread_unread_count()
	{
		global $wpdb;
		
		try {
			if (!isset($_POST["nonce"]) || !wp_verify_nonce($_POST["nonce"], "lms_ajax_nonce")) {
				wp_send_json_error('Invalid nonce');
				return;
			}

			$user_id = lms_get_current_user_id();
			if (!$user_id) {
				wp_send_json_error('User not authenticated');
				return;
			}

			$parent_message_id = intval($_POST['parent_message_id'] ?? 0);
			if (!$parent_message_id) {
				wp_send_json_error('Parent message ID is required');
				return;
			}

			// スレッドの未読数を取得
			$count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_unread_messages 
				 WHERE user_id = %d AND parent_message_id = %d AND message_type = 'thread'",
				$user_id, $parent_message_id
			));

			wp_send_json_success(array(
				'parent_message_id' => $parent_message_id,
				'count' => intval($count)
			));
		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

	/**
	 * 全体の未読数を取得
	 */
	public function handle_get_total_unread_count()
	{
		global $wpdb;
		
		try {
			
			// テーブルの存在を確認
			$this->ensure_unread_messages_table_exists();
			
			if (!isset($_POST["nonce"]) || !wp_verify_nonce($_POST["nonce"], "lms_ajax_nonce")) {
				wp_send_json_error('Invalid nonce');
				return;
			}

			$user_id = lms_get_current_user_id();
			
			if (!$user_id) {
				wp_send_json_error('User not authenticated');
				return;
			}

			// 全体の未読数を取得
			$count = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_unread_messages 
				 WHERE user_id = %d",
				$user_id
			));
			
			if ($wpdb->last_error) {
				wp_send_json_error('SQL Error: ' . $wpdb->last_error);
				return;
			}
			

			wp_send_json_success(array(
				'count' => intval($count),
				'user_id' => $user_id
			));
		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

	/**
	 * チャンネルを既読としてマーク（リアルタイム版）
	 */
	public function handle_mark_channel_as_read_realtime()
	{
		global $wpdb;
		
		try {
			if (!isset($_POST["nonce"]) || !wp_verify_nonce($_POST["nonce"], "lms_ajax_nonce")) {
				wp_send_json_error('Invalid nonce');
				return;
			}

			$user_id = lms_get_current_user_id();
			if (!$user_id) {
				wp_send_json_error('User not authenticated');
				return;
			}

			$channel_id = intval($_POST['channel_id'] ?? 0);
			if (!$channel_id) {
				wp_send_json_error('Channel ID is required');
				return;
			}

			// チャンネル内の全未読メッセージを削除
			$result = $wpdb->delete(
				"{$wpdb->prefix}lms_chat_unread_messages",
				array(
					'user_id' => $user_id,
					'channel_id' => $channel_id
				),
				array('%d', '%d')
			);

			if ($result !== false) {
				wp_send_json_success(array(
					'message' => 'Channel marked as read successfully',
					'deleted_count' => $result
				));
			} else {
				wp_send_json_error('Failed to mark channel as read');
			}
		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

	/**
	 * スレッドを既読としてマーク（リアルタイム版）
	 */
	public function handle_mark_thread_as_read_realtime()
	{
		if (!isset($_POST["nonce"]) || !wp_verify_nonce($_POST["nonce"], "lms_ajax_nonce")) {
			wp_send_json_error('Invalid nonce');
			return;
		}

		$user_id = lms_get_current_user_id();
		if (!$user_id) {
			wp_send_json_error('User not authenticated');
			return;
		}

		$parent_message_id = intval($_POST['parent_message_id'] ?? 0);
		if (!$parent_message_id) {
			wp_send_json_error('Parent message ID is required');
			return;
		}

		global $wpdb;

		// スレッド内の全未読メッセージを削除
		$result = $wpdb->delete(
			"{$wpdb->prefix}lms_chat_unread_messages",
			array(
				'user_id' => $user_id,
				'parent_message_id' => $parent_message_id,
				'message_type' => 'thread'
			),
			array('%d', '%d', '%s')
		);

		if ($result !== false) {
			wp_send_json_success(array(
				'message' => 'Thread marked as read successfully',
				'deleted_count' => $result
			));
		} else {
			wp_send_json_error('Failed to mark thread as read');
		}
	}

	/**
	 * 単一メッセージの未読レコードを削除
	 */
	public function handle_remove_unread_message() {
		try {
			if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
				wp_send_json_error('Invalid nonce');
				return;
			}

			$user_id = lms_get_current_user_id();
			if (!$user_id) {
				wp_send_json_error('User not logged in');
				return;
			}

			$message_id = intval($_POST['message_id'] ?? 0);
			if (!$message_id) {
				wp_send_json_error('Message ID is required');
				return;
			}

			global $wpdb;

			// 特定メッセージの未読レコードを削除
			$result = $wpdb->delete(
				"{$wpdb->prefix}lms_chat_unread_messages",
				array(
					'user_id' => $user_id,
					'message_id' => $message_id
				),
				array('%d', '%d')
			);

			if ($result !== false) {
				wp_send_json_success(array(
					'message' => 'Message marked as read successfully',
					'message_id' => $message_id,
					'deleted_count' => $result
				));
			} else {
				wp_send_json_error('Failed to mark message as read');
			}
		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

	/**
	 * インフィニティスクロール用：履歴メッセージ読み込み
	 */
	public function handle_load_history_messages()
	{
		try {
			if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'lms_ajax_nonce')) {
				wp_send_json_error(['message' => 'セキュリティチェックが失敗しました。']);
				return;
			}

			$channel_id = intval($_POST['channel_id']);
			$before_message_id = intval($_POST['before_message_id']);
			$limit = min(intval($_POST['limit'] ?? 20), 2000); // MVP無限スクロール：最大2000件対応（2月7日まで確実読み込み）

			if (!$channel_id) {
				wp_send_json_error('チャンネルIDが必要です。');
				return;
			}

			if (!$before_message_id) {
				wp_send_json_error('基準メッセージIDが必要です。');
				return;
			}

			global $wpdb;

			// 指定されたメッセージIDより前のメッセージを取得（通常メッセージと同じlms_usersテーブルを使用）
			$messages = $wpdb->get_results($wpdb->prepare("
				SELECT m.*, 
					   u.display_name, 
					   u.id as lms_user_id,
					   COALESCE(p.meta_value, '') as profile_image
				FROM {$wpdb->prefix}lms_chat_messages m
				LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id  
				LEFT JOIN {$wpdb->usermeta} p ON u.id = p.user_id AND p.meta_key = 'profile_image'
				WHERE m.channel_id = %d 
				AND m.id < %d
				AND (m.deleted_at IS NULL OR m.deleted_at = '0000-00-00 00:00:00')
				ORDER BY m.created_at DESC, m.id DESC
				LIMIT %d
			", $channel_id, $before_message_id, $limit), ARRAY_A);

			// メッセージを正しい順序（古い順）に並び替え
			$messages = array_reverse($messages);

			// メッセージデータを整形
			$formatted_messages = [];
			foreach ($messages as $message) {
				$final_display_name = '';
				
				if (!empty($message['display_name'])) {
					$final_display_name = $message['display_name'];
				} else {
					// フォールバック処理
					$final_display_name = 'ユーザー' . $message['user_id'];
				}
				
				$formatted_message = [
					'id' => intval($message['id']),
					'channel_id' => intval($message['channel_id']),
					'user_id' => intval($message['user_id']),
					'message' => $message['message'],
					'created_at' => $message['created_at'],
					'display_name' => $final_display_name,
					'profile_image' => $message['profile_image'] ?? '',
					'file_ids' => $message['file_ids'] ?? null,
					'is_system_message' => (bool)($message['is_system_message'] ?? false),
					'parent_message_id' => $message['parent_message_id'] ?? null,
					'reactions_count' => intval($message['reactions_count'] ?? 0),
					'thread_count' => intval($message['thread_count'] ?? 0),
				];
				
				$formatted_messages[] = $formatted_message;
			}

			wp_send_json_success([
				'messages' => $formatted_messages,
				'has_more' => count($messages) === $limit,
				'oldest_message_id' => !empty($messages) ? intval($messages[0]['id']) : null,
				'count' => count($formatted_messages)
			]);

		} catch (Exception $e) {
			wp_send_json_error('Database error: ' . $e->getMessage());
		}
	}

}

function lms_create_chat_tables()
{
	global $wpdb;
	$charset_collate = $wpdb->get_charset_collate();

	$sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lms_chat_last_viewed (
		user_id bigint(20) NOT NULL,
		channel_id bigint(20) NOT NULL,
		last_viewed_at datetime DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (user_id, channel_id)
	) $charset_collate;";

	require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
	dbDelta($sql);
}

add_action('after_switch_theme', 'lms_create_chat_tables');
