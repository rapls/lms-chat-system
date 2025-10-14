<?php
/**
 * LMSソフトデリート管理画面クラス
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Soft_Delete_Admin
{
    private static $instance = null;
    private $soft_delete;

    public static function get_instance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        $this->soft_delete = LMS_Soft_Delete::get_instance();
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('wp_ajax_lms_soft_delete_action', array($this, 'handle_admin_actions'));
    }

    /**
     * 管理メニューを追加
     */
    public function add_admin_menu()
    {
        add_submenu_page(
            'lms-chat-admin',
            'チャット削除管理',
            'チャット削除管理',
            'manage_options',
            'lms-soft-delete-admin',
            array($this, 'admin_page')
        );
    }

    /**
     * 管理画面ページ
     */
    public function admin_page()
    {
        $action = isset($_GET['action']) ? sanitize_text_field($_GET['action']) : 'stats';
        $stats = $this->soft_delete->get_deletion_stats();

        ?>
        <div class="wrap">
            <h1>チャット削除管理</h1>
            
            <nav class="nav-tab-wrapper">
                <a href="?page=lms-soft-delete-admin&action=stats" 
                   class="nav-tab <?php echo $action === 'stats' ? 'nav-tab-active' : ''; ?>">統計</a>
                <a href="?page=lms-soft-delete-admin&action=messages" 
                   class="nav-tab <?php echo $action === 'messages' ? 'nav-tab-active' : ''; ?>">削除済みメッセージ</a>
                <a href="?page=lms-soft-delete-admin&action=auto-cleanup" 
                   class="nav-tab <?php echo $action === 'auto-cleanup' ? 'nav-tab-active' : ''; ?>">自動クリーンアップ</a>
            </nav>

            <?php
            switch ($action) {
                case 'stats':
                    $this->show_stats($stats);
                    break;
                case 'messages':
                    $this->show_deleted_messages();
                    break;
                case 'auto-cleanup':
                    $this->show_auto_cleanup_settings();
                    break;
            }
            ?>
        </div>
        <?php
    }

    /**
     * 統計表示
     */
    private function show_stats($stats)
    {
        ?>
        <div class="stats-container">
            <h2>削除統計</h2>
            
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th>データ種別</th>
                        <th>総数</th>
                        <th>アクティブ</th>
                        <th>削除済み</th>
                        <th>削除率</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($stats as $name => $data): ?>
                    <tr>
                        <td><?php echo $this->get_data_type_label($name); ?></td>
                        <td><?php echo number_format($data['total']); ?></td>
                        <td><?php echo number_format($data['active']); ?></td>
                        <td><?php echo number_format($data['deleted']); ?></td>
                        <td><?php echo $data['deletion_rate']; ?>%</td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php
    }

    /**
     * 削除済みメッセージ表示
     */
    private function show_deleted_messages()
    {
        global $wpdb;
        
        $page = isset($_GET['paged']) ? max(1, intval($_GET['paged'])) : 1;
        $per_page = 20;
        $offset = ($page - 1) * $per_page;

        // 削除済みメッセージを取得
        $messages = $wpdb->get_results($wpdb->prepare(
            "SELECT m.*, u.display_name, c.name as channel_name 
             FROM {$wpdb->prefix}lms_chat_messages m
             LEFT JOIN {$wpdb->prefix}lms_users u ON m.user_id = u.id
             LEFT JOIN {$wpdb->prefix}lms_chat_channels c ON m.channel_id = c.id
             WHERE m.deleted_at IS NOT NULL
             ORDER BY m.deleted_at DESC
             LIMIT %d OFFSET %d",
            $per_page, $offset
        ));

        $total = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_messages WHERE deleted_at IS NOT NULL"
        );

        ?>
        <div class="deleted-messages-container">
            <h2>削除済みメッセージ</h2>
            
            <?php if (empty($messages)): ?>
                <p>削除済みメッセージはありません。</p>
            <?php else: ?>
                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>メッセージ</th>
                            <th>ユーザー</th>
                            <th>チャンネル</th>
                            <th>作成日時</th>
                            <th>削除日時</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($messages as $message): ?>
                        <tr>
                            <td><?php echo $message->id; ?></td>
                            <td>
                                <div class="message-ellipsis">
                                    <?php echo esc_html(wp_trim_words($message->message, 10)); ?>
                                </div>
                            </td>
                            <td><?php echo esc_html($message->display_name ?: 'Unknown'); ?></td>
                            <td><?php echo esc_html($message->channel_name ?: 'Unknown'); ?></td>
                            <td><?php echo date('Y-m-d H:i:s', strtotime($message->created_at)); ?></td>
                            <td><?php echo date('Y-m-d H:i:s', strtotime($message->deleted_at)); ?></td>
                            <td>
                                <button class="button button-primary restore-message" 
                                        data-message-id="<?php echo $message->id; ?>"
                                        data-type="message">復活</button>
                                <button class="button button-secondary permanently-delete" 
                                        data-message-id="<?php echo $message->id; ?>"
                                        data-type="message">完全削除</button>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>

                <?php
                // ページネーション
                $total_pages = ceil($total / $per_page);
                if ($total_pages > 1) {
                    echo '<div class="tablenav">';
                    echo '<div class="tablenav-pages">';
                    echo paginate_links(array(
                        'base' => add_query_arg('paged', '%#%'),
                        'format' => '',
                        'prev_text' => '&laquo;',
                        'next_text' => '&raquo;',
                        'total' => $total_pages,
                        'current' => $page
                    ));
                    echo '</div>';
                    echo '</div>';
                }
                ?>
            <?php endif; ?>
        </div>

        <script>
        jQuery(document).ready(function($) {
            $('.restore-message, .permanently-delete').on('click', function() {
                var messageId = $(this).data('message-id');
                var type = $(this).data('type');
                var action = $(this).hasClass('restore-message') ? 'restore' : 'permanently_delete';
                var confirmMessage = action === 'restore' ? 
                    'このメッセージを復活させますか？' : 
                    'このメッセージを完全に削除しますか？（復旧不可能）';

                if (confirm(confirmMessage)) {
                    $.ajax({
                        url: ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'lms_soft_delete_action',
                            soft_delete_action: action,
                            message_id: messageId,
                            message_type: type,
                            nonce: '<?php echo wp_create_nonce('lms_soft_delete_nonce'); ?>'
                        },
                        success: function(response) {
                            if (response.success) {
                                location.reload();
                            } else {
                                alert('エラーが発生しました: ' + response.data);
                            }
                        }
                    });
                }
            });
        });
        </script>
        <?php
    }
    /**
     * AJAX アクション処理
     */
    public function handle_admin_actions()
    {
        if (!wp_verify_nonce($_POST['nonce'], 'lms_soft_delete_nonce')) {
            wp_send_json_error('Invalid nonce');
            return;
        }

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
            return;
        }

        $action = sanitize_text_field($_POST['soft_delete_action']);
        $message_id = intval($_POST['message_id']);
        $message_type = sanitize_text_field($_POST['message_type']);

        switch ($action) {
            case 'restore':
                if ($message_type === 'message') {
                    $result = $this->soft_delete->restore_message($message_id);
                } else {
                    $result = $this->soft_delete->restore_thread_message($message_id);
                }
                break;

            case 'permanently_delete':
                global $wpdb;
                if ($message_type === 'message') {
                    $result = $wpdb->delete(
                        $wpdb->prefix . 'lms_chat_messages',
                        ['id' => $message_id],
                        ['%d']
                    );
                } else {
                    $result = $wpdb->delete(
                        $wpdb->prefix . 'lms_chat_thread_messages',
                        ['id' => $message_id],
                        ['%d']
                    );
                }
                break;

            case 'manual_cleanup':
                $retention_days = isset($_POST['retention_days']) ? max(1, intval($_POST['retention_days'])) : 30;
                $deleted_count = $this->soft_delete->cleanup_old_deleted_data($retention_days);
                wp_send_json_success($deleted_count . '件のデータを完全に削除しました。');
                return;

            default:
                wp_send_json_error('Invalid action');
                return;
        }

        if ($result !== false) {
            wp_send_json_success('Action completed successfully');
        } else {
            wp_send_json_error('Action failed');
        }
    }

    /**
     * 自動クリーンアップ設定画面
     */
    private function show_auto_cleanup_settings()
    {
        // 設定保存処理
        if (isset($_POST['save_auto_cleanup_settings']) && wp_verify_nonce($_POST['auto_cleanup_nonce'], 'lms_auto_cleanup_nonce')) {
            $auto_cleanup_enabled = isset($_POST['auto_cleanup_enabled']) ? 1 : 0;
            $cleanup_interval_days = max(1, intval($_POST['cleanup_interval_days']));
            $cleanup_retention_days = max(1, intval($_POST['cleanup_retention_days']));
            
            update_option('lms_auto_cleanup_enabled', $auto_cleanup_enabled);
            update_option('lms_cleanup_interval_days', $cleanup_interval_days);
            update_option('lms_cleanup_retention_days', $cleanup_retention_days);
            
            wp_clear_scheduled_hook('lms_auto_cleanup_hook');
            if ($auto_cleanup_enabled) {
                wp_schedule_event(time(), 'daily', 'lms_auto_cleanup_hook');
            }
            
            echo '<div class="notice notice-success"><p>設定を保存しました。</p></div>';
        }
        
        // 現在の設定を取得
        $auto_cleanup_enabled = get_option('lms_auto_cleanup_enabled', 0);
        $cleanup_interval_days = get_option('lms_cleanup_interval_days', 7);
        $cleanup_retention_days = get_option('lms_cleanup_retention_days', 30);
        
        // 次回実行予定時刻
        $next_cleanup = wp_next_scheduled('lms_auto_cleanup_hook');
        $next_cleanup_date = $next_cleanup ? date('Y-m-d H:i:s', $next_cleanup) : '設定されていません';
        
        ?>
        <div class="auto-cleanup-container">
            <h2>自動クリーンアップ設定</h2>
            
            <div class="auto-cleanup-status">
                <h3>現在の状態</h3>
                <table class="form-table">
                    <tr>
                        <th>自動クリーンアップ</th>
                        <td>
                            <span class="status-badge <?php echo $auto_cleanup_enabled ? 'enabled' : 'disabled'; ?>">
                                <?php echo $auto_cleanup_enabled ? '有効' : '無効'; ?>
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <th>次回実行予定</th>
                        <td><?php echo $next_cleanup_date; ?></td>
                    </tr>
                </table>
            </div>
            
            <form method="post" action="">
                <?php wp_nonce_field('lms_auto_cleanup_nonce', 'auto_cleanup_nonce'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row">自動クリーンアップ</th>
                        <td>
                            <label>
                                <input type="checkbox" name="auto_cleanup_enabled" value="1" 
                                       <?php checked($auto_cleanup_enabled, 1); ?> />
                                自動クリーンアップを有効にする
                            </label>
                            <p class="description">定期的に古い削除済みデータを物理削除します。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">実行間隔</th>
                        <td>
                            <select name="cleanup_interval_days">
                                <option value="1" <?php selected($cleanup_interval_days, 1); ?>>毎日</option>
                                <option value="3" <?php selected($cleanup_interval_days, 3); ?>>3日毎</option>
                                <option value="7" <?php selected($cleanup_interval_days, 7); ?>>毎週</option>
                                <option value="14" <?php selected($cleanup_interval_days, 14); ?>>2週間毎</option>
                                <option value="30" <?php selected($cleanup_interval_days, 30); ?>>毎月</option>
                            </select>
                            <p class="description">クリーンアップを実行する頻度を設定します。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">データ保持期間</th>
                        <td>
                            <input type="number" name="cleanup_retention_days" 
                                   value="<?php echo $cleanup_retention_days; ?>" 
                                   min="1" max="365" /> 日
                            <p class="description">削除済みデータを保持する期間。この期間を過ぎたデータは物理削除されます。</p>
                        </td>
                    </tr>
                </table>
                
                <p class="submit">
                    <input type="submit" name="save_auto_cleanup_settings" 
                           class="button-primary" value="設定を保存" />
                </p>
            </form>
            
            <div class="preview-section">
                <h3>削除対象プレビュー</h3>
                <p>指定した保持期間より古い削除済みデータを確認します。</p>
                <form method="post" action="">
                    <?php wp_nonce_field('lms_cleanup_preview_nonce', 'preview_nonce'); ?>
                    <table class="form-table">
                        <tr>
                            <th scope="row">プレビュー期間</th>
                            <td>
                                <input type="number" name="preview_days" value="<?php echo $cleanup_retention_days; ?>" min="1" max="365" />
                                <span class="description">日数（この日数より古い削除データを表示）</span>
                            </td>
                        </tr>
                    </table>
                    <button type="submit" name="preview_action" value="preview" class="button">
                        削除対象をプレビュー
                    </button>
                </form>

                <?php $this->handle_preview_form(); ?>
            </div>

            <div class="manual-execution">
                <h3>手動実行</h3>
                <p>自動クリーンアップを今すぐ実行します。</p>
                <button type="button" class="button" id="manual-cleanup-btn">
                    クリーンアップを今すぐ実行
                </button>
                <div id="manual-cleanup-result"></div>
            </div>
        </div>

        <script>
        jQuery(document).ready(function($) {
            $('#manual-cleanup-btn').on('click', function() {
                var $btn = $(this);
                var $result = $('#manual-cleanup-result');
                
                $btn.prop('disabled', true).text('実行中...');
                $result.html('');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'lms_soft_delete_action',
                        soft_delete_action: 'manual_cleanup',
                        retention_days: $('input[name="cleanup_retention_days"]').val(),
                        nonce: '<?php echo wp_create_nonce('lms_soft_delete_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            $result.html('<div class="notice notice-success"><p>' + response.data + '</p></div>');
                        } else {
                            $result.html('<div class="notice notice-error"><p>エラー: ' + response.data + '</p></div>');
                        }
                    },
                    error: function() {
                        $result.html('<div class="notice notice-error"><p>通信エラーが発生しました。</p></div>');
                    },
                    complete: function() {
                        $btn.prop('disabled', false).text('クリーンアップを今すぐ実行');
                    }
                });
            });
        });
        </script>
        <?php
    }

    /**
     * プレビューフォーム処理
     */
    private function handle_preview_form()
    {
        if (!isset($_POST['preview_action']) || !wp_verify_nonce($_POST['preview_nonce'], 'lms_cleanup_preview_nonce')) {
            return;
        }

        $days = isset($_POST['preview_days']) ? max(1, intval($_POST['preview_days'])) : 30;
        
        global $wpdb;
        $cleanup_date = date('Y-m-d H:i:s', strtotime("-{$days} days"));

        $tables = [
            'メッセージ' => $wpdb->prefix . 'lms_chat_messages',
            'スレッドメッセージ' => $wpdb->prefix . 'lms_chat_thread_messages',
            '添付ファイル' => $wpdb->prefix . 'lms_chat_attachments',
            'リアクション' => $wpdb->prefix . 'lms_chat_reactions'
        ];

        echo '<div class="notice notice-info"><p><strong>削除対象プレビュー（' . $days . '日より古いデータ）:</strong></p>';
        
        $total_count = 0;
        foreach ($tables as $name => $table) {
            $count = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE deleted_at IS NOT NULL AND deleted_at < %s",
                $cleanup_date
            ));
            echo '<p>' . $name . ': ' . number_format($count) . '件</p>';
            $total_count += $count;
        }
        
        echo '<p><strong>合計: ' . number_format($total_count) . '件</strong></p></div>';
    }

    /**
     * データ種別ラベル取得
     */
    private function get_data_type_label($name)
    {
        $labels = [
            'messages' => 'メッセージ',
            'thread_messages' => 'スレッドメッセージ',
            'attachments' => '添付ファイル',
            'reactions' => 'リアクション'
        ];

        return isset($labels[$name]) ? $labels[$name] : $name;
    }
}