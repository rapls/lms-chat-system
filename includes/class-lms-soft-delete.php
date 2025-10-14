<?php
/**
 * LMSソフトデリート（論理削除）管理クラス
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Soft_Delete
{
    private static $instance = null;
    private $wpdb;

    public static function get_instance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        global $wpdb;
        $this->wpdb = $wpdb;
    }

    /**
     * アクティブ（削除されていない）レコードのみを取得するスコープ
     */
    public function scope_active($table, $where_conditions = [], $params = [])
    {
        $where_conditions[] = "deleted_at IS NULL";
        return $this->build_query($table, $where_conditions, $params);
    }

    /**
     * 削除されたレコードも含めて取得するスコープ
     */
    public function scope_with_deleted($table, $where_conditions = [], $params = [])
    {
        return $this->build_query($table, $where_conditions, $params);
    }

    /**
     * 削除されたレコードのみを取得するスコープ
     */
    public function scope_only_deleted($table, $where_conditions = [], $params = [])
    {
        $where_conditions[] = "deleted_at IS NOT NULL";
        return $this->build_query($table, $where_conditions, $params);
    }

    /**
     * クエリビルダー
     */
    private function build_query($table, $where_conditions, $params)
    {
        $where_clause = '';
        if (!empty($where_conditions)) {
            $where_clause = 'WHERE ' . implode(' AND ', $where_conditions);
        }

        $query = "SELECT * FROM {$table} {$where_clause}";
        
        if (!empty($params)) {
            return $this->wpdb->prepare($query, $params);
        }
        
        return $query;
    }

    /**
     * メッセージの論理削除
     */
    public function soft_delete_message($message_id, $user_id = null)
    {
        $table = $this->wpdb->prefix . 'lms_chat_messages';
        
        $where = ['id' => $message_id];
        if ($user_id) {
            $where['user_id'] = $user_id;
        }

        return $this->wpdb->update(
            $table,
            ['deleted_at' => current_time('mysql')],
            $where,
            ['%s'],
            ['%d'] + ($user_id ? ['%d'] : [])
        );
    }

    /**
     * スレッドメッセージの論理削除
     */
    public function soft_delete_thread_message($message_id, $user_id = null)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        
        $where = ['id' => $message_id];
        if ($user_id) {
            $where['user_id'] = $user_id;
        }

        return $this->wpdb->update(
            $table,
            ['deleted_at' => current_time('mysql')],
            $where,
            ['%s'],
            ['%d'] + ($user_id ? ['%d'] : [])
        );
    }

    /**
     * メッセージの復活
     */
    public function restore_message($message_id)
    {
        $table = $this->wpdb->prefix . 'lms_chat_messages';
        
        return $this->wpdb->update(
            $table,
            ['deleted_at' => null],
            ['id' => $message_id],
            ['%s'],
            ['%d']
        );
    }

    /**
     * スレッドメッセージの復活
     */
    public function restore_thread_message($message_id)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        
        return $this->wpdb->update(
            $table,
            ['deleted_at' => null],
            ['id' => $message_id],
            ['%s'],
            ['%d']
        );
    }

    /**
     * 親メッセージのすべてのスレッドメッセージを復活
     */
    public function restore_thread_messages_by_parent($parent_message_id)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        
        return $this->wpdb->update(
            $table,
            ['deleted_at' => null],
            ['parent_message_id' => $parent_message_id],
            ['%s'],
            ['%d']
        );
    }

    /**
     * アクティブなメッセージを取得
     */
    public function get_active_messages($channel_id, $limit = 50, $offset = 0)
    {
        $table = $this->wpdb->prefix . 'lms_chat_messages';
        $query = $this->scope_active($table, ['channel_id = %d'], [$channel_id]);
        $query .= " ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}";
        
        return $this->wpdb->get_results($this->wpdb->prepare($query, $channel_id));
    }

    /**
     * アクティブなスレッドメッセージを取得
     */
    public function get_active_thread_messages($parent_message_id, $limit = 50, $offset = 0)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        $query = $this->scope_active($table, ['parent_message_id = %d'], [$parent_message_id]);
        $query .= " ORDER BY created_at ASC LIMIT {$limit} OFFSET {$offset}";
        
        return $this->wpdb->get_results($this->wpdb->prepare($query, $parent_message_id));
    }

    /**
     * 削除されたメッセージも含めて取得
     */
    public function get_messages_with_deleted($channel_id, $limit = 50, $offset = 0)
    {
        $table = $this->wpdb->prefix . 'lms_chat_messages';
        $query = $this->scope_with_deleted($table, ['channel_id = %d'], [$channel_id]);
        $query .= " ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}";
        
        return $this->wpdb->get_results($this->wpdb->prepare($query, $channel_id));
    }

    /**
     * 削除されたスレッドメッセージも含めて取得
     */
    public function get_thread_messages_with_deleted($parent_message_id, $limit = 50, $offset = 0)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        $query = $this->scope_with_deleted($table, ['parent_message_id = %d'], [$parent_message_id]);
        $query .= " ORDER BY created_at ASC LIMIT {$limit} OFFSET {$offset}";
        
        return $this->wpdb->get_results($this->wpdb->prepare($query, $parent_message_id));
    }

    /**
     * スレッド数を取得（アクティブのみ）
     */
    public function get_active_thread_count($parent_message_id)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        $query = "SELECT COUNT(*) FROM {$table} WHERE parent_message_id = %d AND deleted_at IS NULL";
        
        return (int) $this->wpdb->get_var($this->wpdb->prepare($query, $parent_message_id));
    }

    /**
     * スレッド数を取得（削除されたものも含む）
     */
    public function get_thread_count_with_deleted($parent_message_id)
    {
        $table = $this->wpdb->prefix . 'lms_chat_thread_messages';
        $query = "SELECT COUNT(*) FROM {$table} WHERE parent_message_id = %d";
        
        return (int) $this->wpdb->get_var($this->wpdb->prepare($query, $parent_message_id));
    }

    /**
     * 古い削除データの物理削除（クリーンアップ）
     */
    public function cleanup_old_deleted_data($days = 30)
    {
        $tables = [
            $this->wpdb->prefix . 'lms_chat_messages',
            $this->wpdb->prefix . 'lms_chat_thread_messages',
            $this->wpdb->prefix . 'lms_chat_attachments',
            $this->wpdb->prefix . 'lms_chat_reactions'
        ];

        $cleanup_date = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        $total_deleted = 0;

        foreach ($tables as $table) {
            $deleted = $this->wpdb->query($this->wpdb->prepare(
                "DELETE FROM {$table} WHERE deleted_at IS NOT NULL AND deleted_at < %s",
                $cleanup_date
            ));
            
            if ($deleted !== false) {
                $total_deleted += $deleted;
            }
        }

        return $total_deleted;
    }

    /**
     * 削除統計を取得
     */
    public function get_deletion_stats()
    {
        $tables = [
            'messages' => $this->wpdb->prefix . 'lms_chat_messages',
            'thread_messages' => $this->wpdb->prefix . 'lms_chat_thread_messages',
            'attachments' => $this->wpdb->prefix . 'lms_chat_attachments',
            'reactions' => $this->wpdb->prefix . 'lms_chat_reactions'
        ];

        $stats = [];

        foreach ($tables as $name => $table) {
            $total = $this->wpdb->get_var("SELECT COUNT(*) FROM {$table}");
            $deleted = $this->wpdb->get_var("SELECT COUNT(*) FROM {$table} WHERE deleted_at IS NOT NULL");
            $active = $total - $deleted;

            $stats[$name] = [
                'total' => (int) $total,
                'active' => (int) $active,
                'deleted' => (int) $deleted,
                'deletion_rate' => $total > 0 ? round(($deleted / $total) * 100, 2) : 0
            ];
        }

        return $stats;
    }
}