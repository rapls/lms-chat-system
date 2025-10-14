<?php
/**
 * リアクション更新テーブル構造マイグレーション
 *
 * wp_lms_chat_reaction_updates テーブルに thread_id / user_id を追加し、
 * スレッドリアクション同期に必要なインデックスを整備します。
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Reaction_Updates_Migration
{
    /**
     * シングルトンインスタンス
     *
     * @var self|null
     */
    private static $instance = null;

    /**
     * オプション保存用キー
     *
     * @var string
     */
    private $version_key = 'lms_reaction_updates_migration_version';

    /**
     * 現行バージョン
     *
     * @var string
     */
    private $current_version = '1.1.0';

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
        add_action('init', array($this, 'check_and_run_migrations'), 5);
    }

    /**
     * マイグレーション実行判定
     */
    public function check_and_run_migrations()
    {
        $installed_version = get_option($this->version_key, '0.0.0');

        if (version_compare($installed_version, $this->current_version, '<')) {
            $this->run_migrations($installed_version);
            update_option($this->version_key, $this->current_version);
        }
    }

    /**
     * バージョン別マイグレーション実行
     */
    private function run_migrations($from_version)
    {
        if (version_compare($from_version, '1.1.0', '<')) {
            $this->migrate_to_1_1_0();
        }
    }

    /**
     * 1.1.0 へのマイグレーション
     */
    private function migrate_to_1_1_0()
    {
        global $wpdb;

        $table_name = $wpdb->prefix . 'lms_chat_reaction_updates';

        $table_exists = $wpdb->get_var(
            $wpdb->prepare('SHOW TABLES LIKE %s', $table_name)
        ) === $table_name;

        if (!$table_exists) {
            return;
        }

        // カラム追加
        $this->ensure_column($table_name, 'thread_id', 'bigint(20) DEFAULT NULL AFTER message_id');
        $this->ensure_column($table_name, 'user_id', 'bigint(20) DEFAULT NULL AFTER is_thread');

        // 既存データの thread_id を補完
        $thread_messages_table = $wpdb->prefix . 'lms_chat_thread_messages';

        $wpdb->query("UPDATE {$table_name} SET thread_id = NULL WHERE thread_id = 0");

        $wpdb->query(
            "UPDATE {$table_name} ru
            JOIN {$thread_messages_table} tm ON ru.message_id = tm.id
            SET ru.thread_id = tm.parent_message_id
            WHERE ru.is_thread = 1 AND (ru.thread_id IS NULL OR ru.thread_id = 0)"
        );

        // インデックス整備
        $this->ensure_index($table_name, 'idx_message_thread_user', 'KEY idx_message_thread_user (message_id, thread_id, user_id)');
        $this->ensure_index($table_name, 'idx_thread_timestamp', 'KEY idx_thread_timestamp (thread_id, timestamp)');
        $this->ensure_index($table_name, 'idx_is_thread_timestamp', 'KEY idx_is_thread_timestamp (is_thread, timestamp)');
    }

    /**
     * カラム存在確認と追加
     */
    private function ensure_column($table, $column, $definition)
    {
        global $wpdb;

        $exists = $wpdb->get_var(
            $wpdb->prepare("SHOW COLUMNS FROM {$table} LIKE %s", $column)
        );

        if (!$exists) {
            $wpdb->query("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
        }
    }

    /**
     * インデックス存在確認と追加
     */
    private function ensure_index($table, $index, $definition)
    {
        global $wpdb;

        $exists = $wpdb->get_var(
            $wpdb->prepare('SHOW INDEX FROM ' . $table . ' WHERE Key_name = %s', $index)
        );

        if (!$exists) {
            $wpdb->query("ALTER TABLE {$table} ADD {$definition}");
        }
    }
}

LMS_Reaction_Updates_Migration::get_instance();
