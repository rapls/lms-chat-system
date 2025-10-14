<?php
/**
 * リアクション操作を共通化するサービスクラス
 *
 * メインチャットおよびスレッドチャットのリアクション処理を
 * 単一のエントリーポイントで扱えるようにする。
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Reaction_Service
{
    /**
     * シングルトンインスタンス
     *
     * @var self|null
     */
    private static $instance = null;

    /**
     * キャッシュヘルパー
     *
     * @var LMS_Cache_Helper
     */
    private $cache_helper;

    /**
     * チャットメインクラス
     *
     * @var LMS_Chat
     */
    private $chat;

    /**
     * インスタンス取得
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
        if (!class_exists('LMS_Cache_Helper')) {
            require_once get_template_directory() . '/includes/class-lms-cache-helper.php';
        }

        $this->cache_helper = LMS_Cache_Helper::get_instance();
        $this->chat = LMS_Chat::get_instance();
    }

    /**
     * メインチャットのリアクションをトグル
     *
     * @param int   $message_id メッセージID
     * @param string $emoji      絵文字
     * @param int   $user_id     操作者
     * @param array $options     追加オプション（is_removing など）
     * @return array
     */
    public function toggle_main($message_id, $emoji, $user_id, $options = array())
    {
        global $wpdb;

        $table = $wpdb->prefix . 'lms_chat_reactions';
        $is_removing = !empty($options['is_removing']);

        try {
            $existing = $wpdb->get_var($wpdb->prepare(
                "SELECT id FROM {$table} WHERE message_id = %d AND user_id = %d AND reaction = %s",
                $message_id,
                $user_id,
                $emoji
            ));

            if ($is_removing || $existing) {
                if (!$existing) {
                    return array(
                        'success' => false,
                        'error' => '削除対象のリアクションが存在しません。'
                    );
                }

                $deleted = $wpdb->delete(
                    $table,
                    array(
                        'message_id' => $message_id,
                        'user_id' => $user_id,
                        'reaction' => $emoji
                    ),
                    array('%d', '%d', '%s')
                );

                if ($deleted === false) {
                    throw new Exception('リアクションの削除に失敗しました。');
                }

                $action = 'removed';
            } else {
                $inserted = $wpdb->insert(
                    $table,
                    array(
                        'message_id' => $message_id,
                        'user_id' => $user_id,
                        'reaction' => $emoji,
                        'created_at' => current_time('mysql')
                    ),
                    array('%d', '%d', '%s', '%s')
                );

                if ($inserted === false) {
                    if (empty($wpdb->last_error) || stripos($wpdb->last_error, 'duplicate') !== false) {
                        // 既に存在している場合は成功扱い（ハードデリート済みなど）
                        $action = 'added';
                    } else {
                        throw new Exception('リアクションの保存に失敗しました。');
                    }
                } else {
                    $action = 'added';
                }
            }

			$reaction_cache_key = $this->cache_helper->generate_message_key($message_id, 'reactions');
			if (!empty($reaction_cache_key)) {
				$this->cache_helper->delete($reaction_cache_key);
			}

			$cache_key = $this->cache_helper->generate_key([$message_id], 'lms_chat_reactions');
			if (!empty($cache_key)) {
				$this->cache_helper->delete($cache_key);
			}

			$updated_reactions = $this->chat->get_message_reactions($message_id);

            $this->chat->notify_reaction_update(
                $message_id,
                $updated_reactions,
                false,
                array('user_id' => $user_id)
            );

            return array(
                'success' => true,
                'reactions' => $updated_reactions,
                'action' => $action,
                'removed' => ($action === 'removed')
            );
        } catch (Exception $e) {
            return array(
                'success' => false,
                'error' => $e->getMessage()
            );
        }
    }

    /**
     * スレッドチャットのリアクションをトグル
     *
     * @param int    $message_id メッセージID
     * @param string $emoji      絵文字
     * @param int    $user_id    操作者
     * @param array  $options    追加オプション（thread_id など）
     * @return array
     */
    public function toggle_thread($message_id, $emoji, $user_id, $options = array())
    {
        global $wpdb;

        $table = $wpdb->prefix . 'lms_chat_thread_reactions';
        $is_removing = !empty($options['is_removing']);

        if (!class_exists('LMS_Thread_Reaction_Migration')) {
            require_once get_template_directory() . '/includes/class-lms-thread-reaction-migration.php';
        }

        $migration = LMS_Thread_Reaction_Migration::get_instance();
        if (method_exists($migration, 'check_and_run_migrations')) {
            $migration->check_and_run_migrations();
        }

        $this->chat->create_thread_reactions_table();

        $parent_message_id = isset($options['thread_id'])
            ? (int) $options['thread_id']
            : (int) $this->chat->get_thread_parent_message_id($message_id);

        $transaction_started = false;

        try {
            if ($wpdb->query('START TRANSACTION')) {
                $transaction_started = true;
            }

            $existing_reaction = $wpdb->get_row($wpdb->prepare(
                "SELECT id, deleted_at FROM {$table} WHERE message_id = %d AND user_id = %d AND reaction = %s LIMIT 1",
                $message_id,
                $user_id,
                $emoji
            ));

            $action = 'added';

            if ($existing_reaction && is_null($existing_reaction->deleted_at)) {
                $deleted = $wpdb->update(
                    $table,
                    array('deleted_at' => current_time('mysql')),
                    array('id' => $existing_reaction->id),
                    array('%s'),
                    array('%d')
                );

                if ($deleted === false) {
                    throw new Exception('リアクションのソフトデリートに失敗しました。');
                }

                $action = 'removed';
            } elseif ($existing_reaction && !is_null($existing_reaction->deleted_at)) {
                $restored = $wpdb->update(
                    $table,
                    array(
                        'deleted_at' => null,
                        'created_at' => current_time('mysql')
                    ),
                    array('id' => $existing_reaction->id),
                    array('%s', '%s'),
                    array('%d')
                );

                if ($restored === false) {
                    throw new Exception('リアクションの復活に失敗しました。');
                }

                $action = 'added';
            } else {
                $inserted = $wpdb->insert(
                    $table,
                    array(
                        'message_id' => $message_id,
                        'user_id' => $user_id,
                        'reaction' => $emoji,
                        'created_at' => current_time('mysql'),
                        'deleted_at' => null
                    ),
                    array('%d', '%d', '%s', '%s', '%s')
                );

                if ($inserted === false) {
                    throw new Exception('リアクションの保存に失敗しました。');
                }
            }

            if ($transaction_started) {
                $wpdb->query('COMMIT');
                $transaction_started = false;
            }

            $parent_message_id = $this->chat->clear_thread_reaction_cache($message_id, $parent_message_id);

			$updated_reactions = $this->chat->get_thread_message_reactions($message_id, true);

			$notification_meta = $this->chat->notify_reaction_update(
				$message_id,
				$updated_reactions,
				true,
				array(
					'thread_id' => $parent_message_id,
					'user_id' => $user_id
				)
			);
			$server_timestamp = is_array($notification_meta) && isset($notification_meta['timestamp'])
				? (int) $notification_meta['timestamp']
				: time();

			return array(
				'success' => true,
				'reactions' => $updated_reactions,
				'action' => $action,
				'removed' => ($action === 'removed'),
				'thread_id' => $parent_message_id,
				'server_timestamp' => $server_timestamp
			);
        } catch (Exception $e) {
            if ($transaction_started) {
                $wpdb->query('ROLLBACK');
            }

            return array(
                'success' => false,
                'error' => $e->getMessage()
            );
        }
    }
}
