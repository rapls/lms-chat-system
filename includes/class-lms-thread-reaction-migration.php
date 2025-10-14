<?php

/**
 * スレッドリアクション テーブルソフトデリート対応マイグレーション
 *
 * wp_lms_chat_thread_reactions テーブルに deleted_at カラムを追加し、
 * ソフトデリート機能を有効化します。
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Thread_Reaction_Migration
{
    private static $instance = null;
    private $version_key = 'lms_thread_reaction_migration_version';
    private $current_version = '1.0.0';
    
    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct()
    {
        add_action('init', array($this, 'check_and_run_migrations'));
    }
    
    /**
     * マイグレーション実行チェック
     */
    public function check_and_run_migrations()
    {
        $installed_version = get_option($this->version_key, '0.0.0');
        
        if (version_compare($installed_version, $this->current_version, '<')) {
            $this->run_migrations($installed_version);
        }
    }
    
    /**
     * マイグレーション実行
     */
    private function run_migrations($from_version)
    {
        global $wpdb;
        
        // バージョン別マイグレーション実行
        if (version_compare($from_version, '1.0.0', '<')) {
            $this->migrate_to_1_0_0();
        }
        
        // マイグレーション完了後、バージョンを更新
        update_option($this->version_key, $this->current_version);
    }
    
    /**
     * バージョン 1.0.0 マイグレーション
     * deleted_at カラムを追加してソフトデリート対応
     */
    private function migrate_to_1_0_0()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_chat_thread_reactions';
        
        // テーブル存在確認
        $table_exists = $wpdb->get_var(
            $wpdb->prepare("SHOW TABLES LIKE %s", $table_name)
        ) === $table_name;
        
        if (!$table_exists) {
            return false;
        }
        
        // deleted_at カラム存在確認
        $column_exists = $wpdb->get_results(
            $wpdb->prepare(
                "SHOW COLUMNS FROM {$table_name} LIKE %s",
                'deleted_at'
            )
        );
        
        if (!empty($column_exists)) {
            return true;
        }
        
        // deleted_at カラム追加
        $alter_query = "ALTER TABLE {$table_name} ADD COLUMN deleted_at datetime DEFAULT NULL";
        
        $result = $wpdb->query($alter_query);
        
        if ($result === false) {
            return false;
        }
        
        // deleted_at カラム用インデックス追加
        $index_query = "ALTER TABLE {$table_name} ADD INDEX idx_deleted_at (deleted_at)";
        
        $index_result = $wpdb->query($index_query);
        
        if ($index_result === false) {
            // インデックス追加失敗は致命的ではないので継続
        }
        
        // deleted_at カラムとインデックスの追加が完了しました
        return true;
    }
    
    /**
     * 手動マイグレーション実行（管理画面用）
     */
    public function force_migration()
    {
        if (!current_user_can('manage_options')) {
            return false;
        }
        
        $this->run_migrations('0.0.0');
        return true;
    }
    
    /**
     * マイグレーション状態確認
     */
    public function get_migration_status()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_chat_thread_reactions';
        $installed_version = get_option($this->version_key, '0.0.0');
        
        // テーブル存在確認
        $table_exists = $wpdb->get_var(
            $wpdb->prepare("SHOW TABLES LIKE %s", $table_name)
        ) === $table_name;
        
        // deleted_at カラム存在確認
        $column_exists = false;
        if ($table_exists) {
            $column_result = $wpdb->get_results(
                $wpdb->prepare(
                    "SHOW COLUMNS FROM {$table_name} LIKE %s",
                    'deleted_at'
                )
            );
            $column_exists = !empty($column_result);
        }
        
        return array(
            'table_exists' => $table_exists,
            'column_exists' => $column_exists,
            'installed_version' => $installed_version,
            'current_version' => $this->current_version,
            'migration_needed' => version_compare($installed_version, $this->current_version, '<'),
            'migration_complete' => $table_exists && $column_exists && version_compare($installed_version, $this->current_version, '>=')
        );
    }
    
    /**
     * ロールバック（注意：データ損失の可能性）
     */
    public function rollback_migration()
    {
        if (!current_user_can('manage_options')) {
            return false;
        }
        
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_chat_thread_reactions';
        
        // 警告: deleted_at カラムを削除するとソフトデリートされたデータが完全に失われる
        $confirm = apply_filters('lms_thread_reaction_migration_rollback_confirm', false);
        
        if (!$confirm) {
            return false;
        }
        
        // deleted_at カラム削除
        $alter_query = "ALTER TABLE {$table_name} DROP COLUMN deleted_at";
        
        $result = $wpdb->query($alter_query);
        
        if ($result === false) {
            return false;
        }
        
        // バージョンをリセット
        update_option($this->version_key, '0.0.0');
        
        // ロールバックが完了しました
        return true;
    }
}

// シングルトンインスタンス初期化
LMS_Thread_Reaction_Migration::get_instance();