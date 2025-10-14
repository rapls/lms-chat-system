<?php
/**
 * データベース最適化スクリプト
 * チャットシステムのパフォーマンス向上のためのインデックス作成
 * 
 * @package LMS Theme
 * @version 2.0
 */

if (!defined('ABSPATH')) {
    $wp_config_path = dirname(__FILE__) . '/../../../../wp-config.php';
    if (file_exists($wp_config_path)) {
        require_once($wp_config_path);
    } else {
        die('WordPress configuration not found.');
    }
}

class LMS_Database_Optimizer {
    
    private $wpdb;
    private $optimization_log = array();
    private $total_optimizations = 0;
    private $successful_optimizations = 0;
    
    public function __construct() {
        global $wpdb;
        $this->wpdb = $wpdb;
    }
    
    /**
     * 最適化を実行
     */
    public function run_optimization() {
        echo "<h2>LMS チャットシステム データベース最適化</h2>\n";
        echo "<p>開始時刻: " . date('Y-m-d H:i:s') . "</p>\n";
        
        $start_time = microtime(true);
        
        // インデックス最適化の実行
        $this->optimize_messages_table();
        $this->optimize_thread_messages_table();
        $this->optimize_reactions_tables();
        $this->optimize_attachments_table();
        $this->optimize_user_management_tables();
        $this->optimize_channel_tables();
        $this->optimize_additional_tables();
        
        $end_time = microtime(true);
        $execution_time = round($end_time - $start_time, 2);
        
        // 結果の表示
        echo "<h3>最適化結果</h3>\n";
        echo "<p>実行時間: {$execution_time}秒</p>\n";
        echo "<p>総最適化数: {$this->total_optimizations}</p>\n";
        echo "<p>成功: {$this->successful_optimizations}</p>\n";
        echo "<p>失敗: " . ($this->total_optimizations - $this->successful_optimizations) . "</p>\n";
        
        // 詳細ログの表示
        if (!empty($this->optimization_log)) {
            echo "<h3>詳細ログ</h3>\n";
            echo "<pre>" . implode("\n", $this->optimization_log) . "</pre>\n";
        }
        
        echo "<p>最適化完了時刻: " . date('Y-m-d H:i:s') . "</p>\n";
    }
    
    /**
     * メッセージテーブルの最適化
     */
    private function optimize_messages_table() {
        $table = $this->wpdb->prefix . 'lms_chat_messages';
        
        if (!$this->table_exists($table)) {
            $this->log("テーブル {$table} が存在しません - スキップ");
            return;
        }
        
        $indexes = array(
            'idx_channel_created' => '(channel_id, created_at DESC, deleted_at)',
            'idx_channel_id_desc' => '(channel_id, id DESC, deleted_at)',
            'idx_user_created' => '(user_id, created_at DESC)',
            'idx_created_id' => '(created_at DESC, id DESC)',
            'idx_deleted_at' => '(deleted_at)'
        );
        
        $this->create_indexes($table, $indexes, 'メッセージテーブル');
    }
    
    /**
     * スレッドメッセージテーブルの最適化
     */
    private function optimize_thread_messages_table() {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        
        if (!$this->table_exists($table)) {
            $this->log("テーブル {$table} が存在しません - スキップ");
            return;
        }
        
        $indexes = array(
            'idx_parent_created' => '(parent_message_id, created_at DESC, deleted_at)',
            'idx_parent_id_desc' => '(parent_message_id, id DESC, deleted_at)',
            'idx_user_parent' => '(user_id, parent_message_id, created_at DESC)',
            'idx_thread_created_id' => '(created_at DESC, id DESC)',
            'idx_thread_deleted_at' => '(deleted_at)'
        );
        
        $this->create_indexes($table, $indexes, 'スレッドメッセージテーブル');
    }
    
    /**
     * リアクションテーブルの最適化
     */
    private function optimize_reactions_tables() {
        // メインリアクションテーブル
        $table = $this->wpdb->prefix . 'lms_chat_reactions';
        if ($this->table_exists($table)) {
            $indexes = array(
                'idx_message_reaction' => '(message_id, reaction, user_id)',
                'idx_message_created' => '(message_id, created_at ASC)',
                'idx_user_message' => '(user_id, message_id)'
            );
            $this->create_indexes($table, $indexes, 'リアクションテーブル');
        }
        
        // スレッドリアクションテーブル
        $thread_table = $this->wpdb->prefix . 'lms_chat_thread_reactions';
        if ($this->table_exists($thread_table)) {
            $indexes = array(
                'idx_thread_message_reaction' => '(message_id, reaction, user_id)',
                'idx_thread_message_created' => '(message_id, created_at ASC)',
                'idx_thread_user_message' => '(user_id, message_id)'
            );
            $this->create_indexes($thread_table, $indexes, 'スレッドリアクションテーブル');
        }
    }
    
    /**
     * 添付ファイルテーブルの最適化
     */
    private function optimize_attachments_table() {
        $table = $this->wpdb->prefix . 'lms_chat_attachments';
        
        if (!$this->table_exists($table)) {
            $this->log("テーブル {$table} が存在しません - スキップ");
            return;
        }
        
        $indexes = array(
            'idx_message_created' => '(message_id, created_at ASC)',
            'idx_user_created' => '(user_id, created_at DESC)',
            'idx_created_message' => '(created_at DESC, message_id)'
        );
        
        $this->create_indexes($table, $indexes, '添付ファイルテーブル');
    }
    
    /**
     * ユーザー管理テーブルの最適化
     */
    private function optimize_user_management_tables() {
        // 未読管理テーブル
        $last_viewed_table = $this->wpdb->prefix . 'lms_chat_last_viewed';
        if ($this->table_exists($last_viewed_table)) {
            $indexes = array(
                'idx_user_channel_viewed' => '(user_id, channel_id, last_viewed_at DESC)',
                'idx_channel_viewed' => '(channel_id, last_viewed_at DESC)'
            );
            $this->create_indexes($last_viewed_table, $indexes, '最終閲覧時刻テーブル');
        }
        
        // スレッド最終閲覧時刻テーブル
        $thread_viewed_table = $this->wpdb->prefix . 'lms_chat_thread_last_viewed';
        if ($this->table_exists($thread_viewed_table)) {
            $indexes = array(
                'idx_user_parent_viewed' => '(user_id, parent_message_id, last_viewed_at DESC)',
                'idx_parent_viewed' => '(parent_message_id, last_viewed_at DESC)'
            );
            $this->create_indexes($thread_viewed_table, $indexes, 'スレッド最終閲覧時刻テーブル');
        }
        
        // メッセージ読み取り状況テーブル
        $read_status_table = $this->wpdb->prefix . 'lms_message_read_status';
        if ($this->table_exists($read_status_table)) {
            $indexes = array(
                'idx_message_user' => '(message_id, user_id)',
                'idx_user_message' => '(user_id, message_id)',
                'idx_read_at' => '(read_at DESC)'
            );
            $this->create_indexes($read_status_table, $indexes, 'メッセージ読み取り状況テーブル');
        }
    }
    
    /**
     * チャンネル関連テーブルの最適化
     */
    private function optimize_channel_tables() {
        // チャンネルメンバーテーブル
        $members_table = $this->wpdb->prefix . 'lms_chat_channel_members';
        if ($this->table_exists($members_table)) {
            $indexes = array(
                'idx_user_channel' => '(user_id, channel_id)',
                'idx_channel_user' => '(channel_id, user_id)'
            );
            $this->create_indexes($members_table, $indexes, 'チャンネルメンバーテーブル');
        }
        
        // チャンネルテーブル
        $channels_table = $this->wpdb->prefix . 'lms_chat_channels';
        if ($this->table_exists($channels_table)) {
            $indexes = array(
                'idx_name' => '(name)',
                'idx_type' => '(type)',
                'idx_created' => '(created_at DESC)'
            );
            $this->create_indexes($channels_table, $indexes, 'チャンネルテーブル');
        }
        
        // ユーザーテーブル
        $users_table = $this->wpdb->prefix . 'lms_users';
        if ($this->table_exists($users_table)) {
            $indexes = array(
                'idx_status' => '(status)',
                'idx_display_name' => '(display_name)',
                'idx_created' => '(created_at DESC)'
            );
            $this->create_indexes($users_table, $indexes, 'ユーザーテーブル');
        }
    }
    
    /**
     * その他のテーブルの最適化
     */
    private function optimize_additional_tables() {
        // メンション機能テーブル
        $mentions_table = $this->wpdb->prefix . 'lms_chat_mentions';
        if ($this->table_exists($mentions_table)) {
            $indexes = array(
                'idx_message_user' => '(message_id, user_id)',
                'idx_user_message' => '(user_id, message_id)'
            );
            $this->create_indexes($mentions_table, $indexes, 'メンションテーブル');
        }
    }
    
    /**
     * インデックスを作成
     */
    private function create_indexes($table, $indexes, $table_description) {
        $this->log("\n=== {$table_description} ({$table}) の最適化 ===");
        
        foreach ($indexes as $index_name => $columns) {
            $this->total_optimizations++;
            
            // 既存インデックスの確認
            if ($this->index_exists($table, $index_name)) {
                $this->log("インデックス {$index_name} は既に存在します - スキップ");
                $this->successful_optimizations++;
                continue;
            }
            
            // インデックス作成
            $sql = "ALTER TABLE {$table} ADD INDEX {$index_name} {$columns}";
            
            $start_time = microtime(true);
            $result = $this->wpdb->query($sql);
            $execution_time = round((microtime(true) - $start_time) * 1000, 2);
            
            if ($result !== false) {
                $this->log("✓ インデックス {$index_name} を作成しました ({$execution_time}ms)");
                $this->successful_optimizations++;
            } else {
                $error = $this->wpdb->last_error;
                $this->log("✗ インデックス {$index_name} の作成に失敗: {$error}");
            }
        }
    }
    
    /**
     * テーブルの存在確認
     */
    private function table_exists($table) {
        $result = $this->wpdb->get_var($this->wpdb->prepare(
            "SHOW TABLES LIKE %s",
            $table
        ));
        return $result === $table;
    }
    
    /**
     * インデックスの存在確認
     */
    private function index_exists($table, $index_name) {
        $result = $this->wpdb->get_results($this->wpdb->prepare(
            "SHOW INDEX FROM {$table} WHERE Key_name = %s",
            $index_name
        ));
        return !empty($result);
    }
    
    /**
     * ログ記録
     */
    private function log($message) {
        $this->optimization_log[] = '[' . date('H:i:s') . '] ' . $message;
        echo $message . "\n";
        flush();
    }
}

// 実行
if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::line('Starting database optimization...');
    $optimizer = new LMS_Database_Optimizer();
    $optimizer->run_optimization();
} else if (php_sapi_name() === 'cli') {
    // コマンドライン実行
    $optimizer = new LMS_Database_Optimizer();
    $optimizer->run_optimization();
} else if (isset($_GET['run_optimization']) && $_GET['run_optimization'] === 'yes') {
    if (is_admin() && current_user_can('manage_options')) {
        echo "<!DOCTYPE html><html><head><title>Database Optimization</title></head><body>";
        $optimizer = new LMS_Database_Optimizer();
        $optimizer->run_optimization();
        echo "</body></html>";
    } else {
        die('Permission denied.');
    }
} else {
    echo "Database optimization script loaded. Add ?run_optimization=yes to execute.";
}
?>