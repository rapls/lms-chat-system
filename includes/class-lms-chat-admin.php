<?php
/**
 * LMS Chat Admin
 * WordPress管理画面でのチャット管理機能
 */

class LMS_Chat_Admin {
    
    private $chat_instance;
    private $push_notification;
    
    /**
     * コンストラクタ
     */
    public function __construct($chat_instance = null) {
        $this->chat_instance = $chat_instance;
        
        if (class_exists('LMS_Push_Notification')) {
            $this->push_notification = LMS_Push_Notification::get_instance();
        } else {
            $this->push_notification = null;
        }
        
        // 管理メニューの追加
        add_action('admin_menu', array($this, 'add_admin_menu'));
        
        add_action('wp_ajax_lms_chat_health_check', array($this, 'ajax_health_check'));
        add_action('wp_ajax_lms_chat_fix_integrity', array($this, 'ajax_fix_integrity'));
        add_action('wp_ajax_lms_push_debug_test', array($this, 'ajax_push_debug_test'));
        add_action('wp_ajax_lms_chat_fix_individual', array($this, 'ajax_fix_individual'));
        add_action('wp_ajax_lms_update_subscriptions', array($this, 'ajax_update_subscriptions'));
        add_action('wp_ajax_lms_fix_lms_users', array($this, 'ajax_fix_lms_users'));
        
        // 管理画面用のスクリプトとスタイル
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
    }
    
    /**
     * 管理メニューの追加
     */
    public function add_admin_menu() {
        add_menu_page(
            'CHAT管理',
            'CHAT管理',
            'manage_options',
            'lms-chat-admin',
            array($this, 'render_health_check_page'),
            'dashicons-format-chat',
            30
        );

        add_submenu_page(
            'lms-chat-admin',
            'Push通知デバッグ',
            'Push通知デバッグ',
            'manage_options',
            'lms-push-notification-debug',
            array($this, 'render_push_notification_debug_page')
        );
    }
    
    /**
     * 管理画面用スクリプトとスタイルの登録
     */
    public function enqueue_admin_scripts($hook) {
        if (strpos($hook, 'lms-chat') === false) {
            return;
        }
        
        // 管理画面用JavaScript
        wp_enqueue_script(
            'lms-chat-admin',
            get_template_directory_uri() . '/js/admin/lms-chat-admin.js',
            array('jquery'),
            time(), // キャッシュバスティング用に時刻を使用
            true
        );
        
        wp_localize_script('lms-chat-admin', 'lms_chat_admin', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('lms_chat_admin_nonce'),
            'confirm_individual_fix' => "この問題を個別に修復しますか？\n\nこの操作は元に戻すことができません。"
        ));
        
        // 管理画面用CSS
        wp_enqueue_style(
            'lms-chat-admin',
            get_template_directory_uri() . '/admin.css',
            array(),
            time() // キャッシュバスティング用に時刻を使用
        );
    }
    
    /**
     * データベース健全性チェックページの表示
     */
    public function render_health_check_page() {
        ?>
        <div class="wrap">
            <h1>CHAT管理</h1>
            
            <div class="lms-chat-health-check">
                <div class="card">
                    <h2>データベース健全性チェック</h2>
                    <p class="description">
                        チャットシステムのデータベースの整合性をチェックします。<br>
                        親メッセージの無いスレッドメッセージ、削除されたチャンネルへの参照、その他のデータ不整合を検出します。
                    </p>
                    
                    <p>
                        <button type="button" id="run-health-check" class="button button-primary">
                            <span class="dashicons dashicons-search"></span> チェック実行
                        </button>
                    </p>
                    
                    <div id="health-check-progress">
                        <div class="spinner is-active"></div>
                        <span>チェック中...</span>
                    </div>
                    
                    <div id="health-check-results">
                        <!-- 結果がここに表示されます -->
                    </div>
                    
                    
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * 健全性チェックのAjaxハンドラー
     */
    public function ajax_health_check() {
        if (!check_ajax_referer('lms_chat_admin_nonce', 'nonce', false)) {
            wp_send_json_error('セキュリティチェックに失敗しました');
        }
        
        // 権限チェック
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限がありません');
        }
        
        
        global $wpdb;
        
        $issues = array();
        
        // テーブル名
        $table_messages = $wpdb->prefix . 'lms_chat_messages';
        $table_threads = $wpdb->prefix . 'lms_chat_thread_messages';
        $table_channels = $wpdb->prefix . 'lms_chat_channels';
        $table_members = $wpdb->prefix . 'lms_chat_channel_members';
        
        // まず、スレッドテーブルとメッセージテーブルの状態を確認
        $total_threads = $wpdb->get_var("SELECT COUNT(*) FROM {$table_threads}");
        $total_messages = $wpdb->get_var("SELECT COUNT(*) FROM {$table_messages}");
        
        // サンプルスレッドの親メッセージIDを確認
        $sample_parent_ids = $wpdb->get_col("SELECT DISTINCT parent_message_id FROM {$table_threads} WHERE parent_message_id IS NOT NULL LIMIT 5");
        
        // 実際に存在するメッセージIDのサンプル
        $existing_message_ids = $wpdb->get_col("SELECT id FROM {$table_messages} ORDER BY id LIMIT 10");
        
        $orphaned_count_exists = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_threads} t
            WHERE t.parent_message_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM {$table_messages} m WHERE m.id = t.parent_message_id
            )
        ");
        
        $orphaned_threads = $wpdb->get_results("
            SELECT 
                t.parent_message_id,
                COUNT(*) as count,
                GROUP_CONCAT(t.id ORDER BY t.id LIMIT 10) as sample_ids
            FROM {$table_threads} t
            LEFT JOIN {$table_messages} m ON t.parent_message_id = m.id
            WHERE m.id IS NULL AND t.parent_message_id IS NOT NULL
            GROUP BY t.parent_message_id
        ");
        
        if (!empty($orphaned_threads)) {
            $total_orphaned = array_sum(array_column($orphaned_threads, 'count'));
            $debug_info = "<br>総スレッド数: {$total_threads}, 総メッセージ数: {$total_messages}";
            $debug_info .= "<br>EXISTS方式での孤立カウント: {$orphaned_count_exists}件";
            
            if (!empty($sample_parent_ids)) {
                $debug_info .= "<br>サンプル親メッセージID: " . implode(', ', $sample_parent_ids);
            }
            
            if (!empty($existing_message_ids)) {
                $debug_info .= "<br>存在するメッセージID: " . implode(', ', $existing_message_ids);
            }
            
            $issues['orphaned_threads'] = array(
                'type' => 'error',
                'title' => '親メッセージの無いスレッドメッセージ',
                'description' => "親メッセージが削除されているか存在しないスレッドメッセージが {$total_orphaned} 件見つかりました。<br><strong>影響:</strong> スレッドを開こうとした際にエラーが発生し、UIが壊れたりローディングが終わらない状態になります。また、検索結果に表示されるスレッドメッセージが親メッセージを表示できず、ユーザーが文脈を理解できなくなります。{$debug_info}",
                'count' => $total_orphaned,
                'details' => $orphaned_threads,
                'fix_available' => true,
                'fix_action' => 'fix_orphaned_threads'
            );
        } else {
            // 親メッセージの無いスレッドがない場合でもデバッグ情報を表示
            $debug_info = "<br>総スレッド数: {$total_threads}, 総メッセージ数: {$total_messages}";
            $debug_info .= "<br>EXISTS方式での孤立カウント: {$orphaned_count_exists}件";
            
            if (!empty($sample_parent_ids)) {
                $debug_info .= "<br>サンプル親メッセージID: " . implode(', ', $sample_parent_ids);
            }
            
            if (!empty($existing_message_ids)) {
                $debug_info .= "<br>存在するメッセージID: " . implode(', ', $existing_message_ids);
            }
            
            if ($orphaned_count_exists > 0) {
                $issues['orphaned_threads_exists'] = array(
                    'type' => 'error',
                    'title' => '親メッセージの無いスレッドメッセージ（EXISTS方式）',
                    'description' => "EXISTS方式で検出した孤立スレッドメッセージが {$orphaned_count_exists} 件あります。<br><strong>影響:</strong> スレッドを開こうとした際にエラーが発生し、UIが壊れたりローディングが終わらない状態になります。また、検索結果に表示されるスレッドメッセージが親メッセージを表示できず、ユーザーが文脈を理解できなくなります。{$debug_info}",
                    'count' => $orphaned_count_exists,
                    'fix_available' => true,
                    'fix_action' => 'fix_orphaned_threads'
                );
            } else {
                $issues['orphaned_threads_debug'] = array(
                    'type' => 'info',
                    'title' => '親メッセージチェック結果',
                    'description' => "親メッセージの無いスレッドメッセージは見つかりませんでした。{$debug_info}",
                    'count' => 0,
                    'fix_available' => false
                );
            }
        }
        
        $invalid_channel_messages = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_messages} m
            WHERE m.channel_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$table_channels} c WHERE c.id = m.channel_id
            )
        ");
        
        if ($invalid_channel_messages > 0) {
            $issues['invalid_channel_messages'] = array(
                'type' => 'warning',
                'title' => '無効なチャンネル参照',
                'description' => "存在しないチャンネルを参照しているメッセージが {$invalid_channel_messages} 件見つかりました。",
                'count' => $invalid_channel_messages,
                'fix_available' => true,
                'fix_action' => 'fix_invalid_channels'
            );
        }
        
        $lms_users_table = $wpdb->prefix . 'lms_users';
        
        $invalid_user_messages = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_messages} m
            WHERE m.user_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$lms_users_table} u WHERE u.id = m.user_id
            )
        ");
        
        if ($invalid_user_messages > 0) {
            $issues['invalid_user_messages'] = array(
                'type' => 'warning',
                'title' => '無効なユーザー参照（メッセージ）',
                'description' => "LMSユーザーテーブルに存在しないユーザーのメッセージが {$invalid_user_messages} 件見つかりました。",
                'count' => $invalid_user_messages,
                'fix_available' => true,
                'fix_action' => 'fix_invalid_users'
            );
        }
        
        $invalid_user_threads = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_threads} t
            WHERE t.user_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$lms_users_table} u WHERE u.id = t.user_id
            )
        ");
        
        if ($invalid_user_threads > 0) {
            $issues['invalid_user_threads'] = array(
                'type' => 'warning',
                'title' => '無効なユーザー参照（スレッド）',
                'description' => "存在しないユーザーのスレッドメッセージが {$invalid_user_threads} 件見つかりました。",
                'count' => $invalid_user_threads,
                'fix_available' => true,
                'fix_action' => 'fix_invalid_user_threads'
            );
        }
        
        $duplicate_members = $wpdb->get_results("
            SELECT 
                channel_id,
                user_id,
                COUNT(*) as count
            FROM {$table_members}
            GROUP BY channel_id, user_id
            HAVING COUNT(*) > 1
        ");
        
        if (!empty($duplicate_members)) {
            $total_duplicates = array_sum(array_column($duplicate_members, 'count')) - count($duplicate_members);
            $issues['duplicate_members'] = array(
                'type' => 'warning',
                'title' => '重複したチャンネルメンバー',
                'description' => "同一チャンネルに重複登録されているメンバーが {$total_duplicates} 件見つかりました。",
                'count' => $total_duplicates,
                'details' => $duplicate_members,
                'fix_available' => true,
                'fix_action' => 'fix_duplicate_members'
            );
        }
        
        $empty_channels = $wpdb->get_results("
            SELECT c.id, c.name, c.created_at
            FROM {$table_channels} c
            LEFT JOIN {$table_members} m ON c.id = m.channel_id
            WHERE m.channel_id IS NULL
            AND c.status = 'active'
        ");
        
        if (!empty($empty_channels)) {
            $empty_count = count($empty_channels);
            $issues['empty_channels'] = array(
                'type' => 'warning',
                'title' => 'メンバーのいないチャンネル',
                'description' => "アクティブなチャンネルなのにメンバーがいないチャンネルが {$empty_count} 件あります。<br><strong>影響:</strong> 誰もアクセスできないチャンネルはシステムリソースの無駄使いやパフォーマンス低下の原因となります。",
                'count' => $empty_count,
                'details' => $empty_channels,
                'fix_available' => true,
                'fix_action' => 'fix_empty_channels'
            );
        }
        
        $orphaned_members = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_members} m
            WHERE m.user_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$lms_users_table} u WHERE u.id = m.user_id
            )
        ");
        
        if ($orphaned_members > 0) {
            $issues['orphaned_members'] = array(
                'type' => 'error',
                'title' => '存在しないユーザーのメンバーレコード',
                'description' => "削除されたユーザーのメンバーレコードが {$orphaned_members} 件残っています。<br><strong>影響:</strong> チャンネルメンバー数の誤表示、通知送信エラー、データベースパフォーマンス低下を引き起こします。",
                'count' => $orphaned_members,
                'fix_available' => true,
                'fix_action' => 'fix_orphaned_members'
            );
        }
        
        $future_messages = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_messages}
            WHERE created_at > NOW() + INTERVAL 1 HOUR
        ");
        
        if ($future_messages > 0) {
            $issues['future_messages'] = array(
                'type' => 'warning',
                'title' => '作成日時が未来のメッセージ',
                'description' => "作成日時が未来に設定されたメッセージが {$future_messages} 件あります。<br><strong>影響:</strong> メッセージの表示順序が乱れ、検索やソート機能が正常に動作しない可能性があります。",
                'count' => $future_messages,
                'fix_available' => true,
                'fix_action' => 'fix_future_messages'
            );
        }
        
        $very_old_messages = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_messages}
            WHERE created_at < '2020-01-01 00:00:00'
        ");
        
        if ($very_old_messages > 0) {
            $issues['very_old_messages'] = array(
                'type' => 'info',
                'title' => '異常に古い作成日時のメッセージ',
                'description' => "2020年以前の作成日時を持つメッセージが {$very_old_messages} 件あります。<br><strong>影響:</strong> データの信頼性や統計情報の正確性に疑問が生じる可能性があります。",
                'count' => $very_old_messages,
                'fix_available' => true,
                'fix_action' => 'fix_very_old_messages'
            );
        }
        
        $empty_messages = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_messages}
            WHERE (message IS NULL OR TRIM(message) = '') AND file_path IS NULL
        ");
        
        if ($empty_messages > 0) {
            $issues['empty_messages'] = array(
                'type' => 'warning',
                'title' => '空のメッセージ内容',
                'description' => "メッセージ内容とファイルの両方が空のメッセージが {$empty_messages} 件あります。<br><strong>影響:</strong> ユーザーに意味のない空のメッセージが表示され、UIが乱れる可能性があります。",
                'count' => $empty_messages,
                'fix_available' => true,
                'fix_action' => 'fix_empty_messages'
            );
        }
        
        $circular_threads = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_threads} t1
            JOIN {$table_messages} m ON t1.parent_message_id = m.id
            JOIN {$table_threads} t2 ON m.id = t2.id
        ");
        
        if ($circular_threads > 0) {
            $issues['circular_threads'] = array(
                'type' => 'error',
                'title' => '循環参照スレッド',
                'description' => "親メッセージ自体がスレッドメッセージになっている循環参照が {$circular_threads} 件あります。<br><strong>影響:</strong> 無限ループやスタックオーバーフローを引き起こし、システムクラッシュの原因となります。",
                'count' => $circular_threads,
                'fix_available' => true,
                'fix_action' => 'fix_circular_threads'
            );
        }
        
        $timeline_inconsistent_threads = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$table_threads} t
            JOIN {$table_messages} m ON t.parent_message_id = m.id
            WHERE t.created_at < m.created_at
        ");
        
        if ($timeline_inconsistent_threads > 0) {
            $issues['timeline_inconsistent_threads'] = array(
                'type' => 'warning',
                'title' => '時系列順序の矛盾があるスレッド',
                'description' => "スレッドメッセージの作成日時が親メッセージより古いケースが {$timeline_inconsistent_threads} 件あります。<br><strong>影響:</strong> メッセージの表示順序が論理的でなくなり、ユーザーの混乱を招きます。",
                'count' => $timeline_inconsistent_threads,
                'fix_available' => true,
                'fix_action' => 'fix_timeline_inconsistent_threads'
            );
        }
        
        $expired_tokens = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$lms_users_table}
            WHERE (login_token IS NOT NULL AND login_token_expiry < NOW())
               OR (reset_token IS NOT NULL AND reset_token_expiry < NOW())
        ");
        
        if ($expired_tokens > 0) {
            $issues['expired_tokens'] = array(
                'type' => 'warning',
                'title' => '期限切れトークン',
                'description' => "期限切れのログイントークンやリセットトークンが {$expired_tokens} 件残っています。<br><strong>影韴:</strong> セキュリティリスクや不要なデータの蓄積、パフォーマンス低下の原因となります。",
                'count' => $expired_tokens,
                'fix_available' => true,
                'fix_action' => 'fix_expired_tokens'
            );
        }
        
        $duplicate_emails = $wpdb->get_results("
            SELECT email, COUNT(*) as count
            FROM {$lms_users_table}
            WHERE email IS NOT NULL AND email != ''
            GROUP BY email
            HAVING COUNT(*) > 1
        ");
        
        if (!empty($duplicate_emails)) {
            $total_duplicates = array_sum(array_column($duplicate_emails, 'count')) - count($duplicate_emails);
            $issues['duplicate_emails'] = array(
                'type' => 'error',
                'title' => '重複したユーザーメールアドレス',
                'description' => "同じメールアドレスを持つユーザーが {$total_duplicates} 件あります。<br><strong>影響:</strong> ログインやパスワードリセットの機能不全、通知の誤送信、セキュリティ上のリスクが発生します。",
                'count' => $total_duplicates,
                'details' => $duplicate_emails,
                'fix_available' => true,
                'fix_action' => 'fix_duplicate_emails'
            );
        }
        
        $high_volume_users = $wpdb->get_results("
            SELECT user_id, COUNT(*) as message_count
            FROM {$table_messages}
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            GROUP BY user_id
            HAVING COUNT(*) > 1000
        ");
        
        if (!empty($high_volume_users)) {
            $total_high_volume = count($high_volume_users);
            $issues['high_volume_users'] = array(
                'type' => 'warning',
                'title' => '異常に多いメッセージ数のユーザー',
                'description' => "直近24時間4で1000件以上のメッセージを投稿したユーザーが {$total_high_volume} 人います。<br><strong>影響:</strong> スパムやシステムの不正利用の可能性があり、パフォーマンス低下や他ユーザーの体験悪化を招きます。",
                'count' => $total_high_volume,
                'details' => $high_volume_users,
                'fix_available' => false,
                'fix_action' => null
            );
        }
        
        $inactive_users = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$lms_users_table}
            WHERE status = 'active' 
            AND (last_login IS NULL OR last_login < DATE_SUB(NOW(), INTERVAL 1 YEAR))
        ");
        
        if ($inactive_users > 0) {
            $issues['inactive_users'] = array(
                'type' => 'info',
                'title' => '長期間アクセスのないアクティブユーザー',
                'description' => "1年以上アクセスのないアクティブユーザーが {$inactive_users} 人います。<br><strong>影響:</strong> データベースの容量圧迫、パフォーマンス低下、適切なメンバー管理の障害となります。",
                'count' => $inactive_users,
                'fix_available' => false,
                'fix_action' => null
            );
        }
        
        $invalid_json_subscriptions = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$lms_users_table}
            WHERE subscribed_channels IS NOT NULL 
            AND subscribed_channels != ''
            AND JSON_VALID(subscribed_channels) = 0
        ");
        
        $invalid_json_push = $wpdb->get_var("
            SELECT COUNT(*)
            FROM {$lms_users_table}
            WHERE push_subscription IS NOT NULL 
            AND push_subscription != ''
            AND JSON_VALID(push_subscription) = 0
        ");
        
        if ($invalid_json_subscriptions > 0 || $invalid_json_push > 0) {
            $total_invalid_json = $invalid_json_subscriptions + $invalid_json_push;
            $issues['invalid_json_fields'] = array(
                'type' => 'error',
                'title' => '不正なJSONフィールド',
                'description' => "JSON形式が異常なフィールドが {$total_invalid_json} 件あります。<br><strong>影響:</strong> チャンネル購読情報やプッシュ通知設定が正常に動作せず、システムエラーの原因となります。",
                'count' => $total_invalid_json,
                'fix_available' => true,
                'fix_action' => 'fix_invalid_json_fields'
            );
        }
        
        $stats = array(
            'total_messages' => $wpdb->get_var("SELECT COUNT(*) FROM {$table_messages}"),
            'total_threads' => $wpdb->get_var("SELECT COUNT(*) FROM {$table_threads}"),
            'total_channels' => $wpdb->get_var("SELECT COUNT(*) FROM {$table_channels}"),
            'total_members' => $wpdb->get_var("SELECT COUNT(*) FROM {$table_members}"),
            'total_users' => $wpdb->get_var("SELECT COUNT(*) FROM {$lms_users_table}")
        );
        
        // テスト用: ダミー問題を追加
        if (empty($issues)) {
            $issues['test_issue'] = array(
                'type' => 'warning',
                'title' => 'テスト用問題（問題がない場合のダミー）',
                'description' => '現在、データベースに問題はありません。これはテスト用のダミー問題です。',
                'count' => 0,
                'fix_available' => true,
                'fix_action' => 'test_fix'
            );
        }
        
        $response = array(
            'success' => true,
            'issues' => $issues,
            'stats' => $stats,
            'issue_count' => count($issues),
            'fixable_count' => count(array_filter($issues, function($issue) { 
                return isset($issue['fix_available']) && $issue['fix_available']; 
            })),
            'timestamp' => current_time('mysql'),
            'debug_info' => 'Total issues: ' . count($issues) . ', Fixable: ' . count(array_filter($issues, function($issue) { 
                return isset($issue['fix_available']) && $issue['fix_available']; 
            }))
        );
        
        wp_send_json($response);
    }
    
    /**
     * データ不整合修正のAjaxハンドラー
     */
    public function ajax_fix_integrity() {
        if (!check_ajax_referer('lms_chat_admin_nonce', 'nonce', false)) {
            wp_die('セキュリティチェックに失敗しました');
        }
        
        // 権限チェック
        if (!current_user_can('manage_options')) {
            wp_die('権限がありません');
        }
        
        global $wpdb;
        
        $table_messages = $wpdb->prefix . 'lms_chat_messages';
        $table_threads = $wpdb->prefix . 'lms_chat_thread_messages';
        $table_channels = $wpdb->prefix . 'lms_chat_channels';
        $table_members = $wpdb->prefix . 'lms_chat_channel_members';
        
        $results = array();
        $total_fixed = 0;
        $total_errors = 0;
        
        $deleted_threads = $wpdb->query("
            DELETE t
            FROM {$table_threads} t
            LEFT JOIN {$table_messages} m ON t.parent_message_id = m.id
            WHERE m.id IS NULL AND t.parent_message_id IS NOT NULL
        ");
        
        if ($deleted_threads !== false) {
            $total_fixed += $deleted_threads;
            $results[] = array(
                'action' => '親メッセージの無いスレッドメッセージの削除',
                'count' => $deleted_threads,
                'success' => true
            );
        } else {
            $total_errors++;
            $results[] = array(
                'action' => '親メッセージの無いスレッドメッセージの削除',
                'success' => false,
                'error' => 'データベースエラーが発生しました'
            );
        }
        
        $default_channel = 1;
        $updated_channel_refs = $wpdb->query("
            UPDATE {$table_messages} m
            SET m.channel_id = {$default_channel}
            WHERE m.channel_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$table_channels} c WHERE c.id = m.channel_id
            )
        ");
        
        if ($updated_channel_refs !== false) {
            $total_fixed += $updated_channel_refs;
            $results[] = array(
                'action' => '無効なチャンネル参照の修正',
                'count' => $updated_channel_refs,
                'success' => true
            );
        }
        
        $lms_users_table = $wpdb->prefix . 'lms_users';
        $updated_user_msgs = $wpdb->query("
            UPDATE {$table_messages} m
            SET m.user_id = 0
            WHERE m.user_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$lms_users_table} u WHERE u.id = m.user_id
            )
        ");
        
        if ($updated_user_msgs !== false) {
            $total_fixed += $updated_user_msgs;
            $results[] = array(
                'action' => '無効なユーザー参照の修正（メッセージ）',
                'count' => $updated_user_msgs,
                'success' => true
            );
        }
        
        $updated_user_threads = $wpdb->query("
            UPDATE {$table_threads} t
            SET t.user_id = 0
            WHERE t.user_id > 0 
            AND NOT EXISTS (
                SELECT 1 FROM {$lms_users_table} u WHERE u.id = t.user_id
            )
        ");
        
        if ($updated_user_threads !== false) {
            $total_fixed += $updated_user_threads;
            $results[] = array(
                'action' => '無効なユーザー参照の修正（スレッド）',
                'count' => $updated_user_threads,
                'success' => true
            );
        }
        
        $duplicates = $wpdb->get_results("
            SELECT 
                channel_id,
                user_id,
                COUNT(*) as count,
                MIN(id) as keep_id
            FROM {$table_members}
            GROUP BY channel_id, user_id
            HAVING COUNT(*) > 1
        ");
        
        $deleted_duplicates = 0;
        foreach ($duplicates as $dup) {
            $deleted = $wpdb->query($wpdb->prepare("
                DELETE FROM {$table_members}
                WHERE channel_id = %d 
                AND user_id = %d 
                AND id != %d
            ", $dup->channel_id, $dup->user_id, $dup->keep_id));
            
            if ($deleted !== false) {
                $deleted_duplicates += $deleted;
            }
        }
        
        if ($deleted_duplicates > 0) {
            $total_fixed += $deleted_duplicates;
            $results[] = array(
                'action' => '重複メンバーの削除',
                'count' => $deleted_duplicates,
                'success' => true
            );
        }
        
        $response = array(
            'success' => true,
            'message' => "データベース修復が完了しました。{$total_fixed} 件の問題を修正しました。",
            'total_fixed' => $total_fixed,
            'total_errors' => $total_errors,
            'results' => $results,
            'timestamp' => current_time('mysql')
        );
        
        wp_send_json($response);
    }
    
    /**
     * 個別修復のAjaxハンドラー
     */
    public function ajax_fix_individual() {
        if (!check_ajax_referer('lms_chat_admin_nonce', 'nonce', false)) {
            wp_die('セキュリティチェックに失敗しました');
        }
        
        // 権限チェック
        if (!current_user_can('manage_options')) {
            wp_die('権限がありません');
        }
        
        $fix_action = sanitize_text_field($_POST['fix_action']);
        
        global $wpdb;
        
        $table_messages = $wpdb->prefix . 'lms_chat_messages';
        $table_threads = $wpdb->prefix . 'lms_chat_thread_messages';
        $table_channels = $wpdb->prefix . 'lms_chat_channels';
        $table_members = $wpdb->prefix . 'lms_chat_channel_members';
        $lms_users_table = $wpdb->prefix . 'lms_users';
        
        $result = array('success' => false, 'message' => '未定義の修復アクションです。', 'count' => 0);
        
        switch ($fix_action) {
            case 'fix_orphaned_threads':
                $affected = $wpdb->query("
                    DELETE t
                    FROM {$table_threads} t
                    LEFT JOIN {$table_messages} m ON t.parent_message_id = m.id
                    WHERE m.id IS NULL AND t.parent_message_id IS NOT NULL
                ");
                $result = array(
                    'success' => true,
                    'message' => '親メッセージの無いスレッドメッセージを削除しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_empty_channels':
                $affected = $wpdb->query("
                    UPDATE {$table_channels} c
                    LEFT JOIN {$table_members} m ON c.id = m.channel_id
                    SET c.status = 'inactive'
                    WHERE m.channel_id IS NULL AND c.status = 'active'
                ");
                $result = array(
                    'success' => true,
                    'message' => "メンバーのいないチャンネルを非アクティブにしました。",
                    'count' => $affected
                );
                break;
                
            case 'fix_orphaned_members':
                $affected = $wpdb->query("
                    DELETE m FROM {$table_members} m
                    WHERE m.user_id > 0 
                    AND NOT EXISTS (
                        SELECT 1 FROM {$lms_users_table} u WHERE u.id = m.user_id
                    )
                ");
                $result = array(
                    'success' => true,
                    'message' => '存在しないユーザーのメンバーレコードを削除しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_future_messages':
                $affected = $wpdb->query("
                    UPDATE {$table_messages}
                    SET created_at = NOW()
                    WHERE created_at > NOW() + INTERVAL 1 HOUR
                ");
                $result = array(
                    'success' => true,
                    'message' => '未来の作成日時を現在時刻に修正しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_very_old_messages':
                $affected = $wpdb->query("
                    UPDATE {$table_messages}
                    SET created_at = '2020-01-01 00:00:00'
                    WHERE created_at < '2020-01-01 00:00:00'
                ");
                $result = array(
                    'success' => true,
                    'message' => '異常に古い日時を2020年1月1日に修正しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_empty_messages':
                $affected = $wpdb->query("
                    DELETE FROM {$table_messages}
                    WHERE (message IS NULL OR TRIM(message) = '') AND file_path IS NULL
                ");
                $result = array(
                    'success' => true,
                    'message' => '空のメッセージを削除しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_circular_threads':
                $affected = $wpdb->query("
                    DELETE t1 FROM {$table_threads} t1
                    JOIN {$table_messages} m ON t1.parent_message_id = m.id
                    JOIN {$table_threads} t2 ON m.id = t2.id
                ");
                $result = array(
                    'success' => true,
                    'message' => '循環参照スレッドを削除しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_timeline_inconsistent_threads':
                $affected = $wpdb->query("
                    UPDATE {$table_threads} t
                    JOIN {$table_messages} m ON t.parent_message_id = m.id
                    SET t.created_at = DATE_ADD(m.created_at, INTERVAL 1 SECOND)
                    WHERE t.created_at < m.created_at
                ");
                $result = array(
                    'success' => true,
                    'message' => 'スレッドの作成日時を親メッセージの1秒後に修正しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_expired_tokens':
                $affected = $wpdb->query("
                    UPDATE {$lms_users_table}
                    SET login_token = NULL, login_token_expiry = NULL
                    WHERE login_token IS NOT NULL AND login_token_expiry < NOW()
                ");
                $affected += $wpdb->query("
                    UPDATE {$lms_users_table}
                    SET reset_token = NULL, reset_token_expiry = NULL
                    WHERE reset_token IS NOT NULL AND reset_token_expiry < NOW()
                ");
                $result = array(
                    'success' => true,
                    'message' => '期限切れトークンをクリアしました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_duplicate_emails':
                $duplicates = $wpdb->get_results("
                    SELECT email, MIN(id) as keep_id
                    FROM {$lms_users_table}
                    WHERE email IS NOT NULL AND email != ''
                    GROUP BY email
                    HAVING COUNT(*) > 1
                ");
                $affected = 0;
                foreach ($duplicates as $dup) {
                    $deleted = $wpdb->query($wpdb->prepare("
                        UPDATE {$lms_users_table}
                        SET email = CONCAT(email, '_duplicate_', id)
                        WHERE email = %s AND id != %d
                    ", $dup->email, $dup->keep_id));
                    $affected += $deleted;
                }
                $result = array(
                    'success' => true,
                    'message' => '重複メールアドレスにサフィックスを追加しました。',
                    'count' => $affected
                );
                break;
                
            case 'fix_invalid_json_fields':
                $affected = $wpdb->query("
                    UPDATE {$lms_users_table}
                    SET subscribed_channels = '[]'
                    WHERE subscribed_channels IS NOT NULL 
                    AND subscribed_channels != ''
                    AND JSON_VALID(subscribed_channels) = 0
                ");
                $affected += $wpdb->query("
                    UPDATE {$lms_users_table}
                    SET push_subscription = NULL
                    WHERE push_subscription IS NOT NULL 
                    AND push_subscription != ''
                    AND JSON_VALID(push_subscription) = 0
                ");
                $result = array(
                    'success' => true,
                    'message' => '不正なJSONフィールドを修正しました。',
                    'count' => $affected
                );
                break;
                
            case 'test_fix':
                $result = array(
                    'success' => true,
                    'message' => 'テスト用のダミー修復が完了しました。',
                    'count' => 1
                );
                break;
        }
        
        wp_send_json($result);
    }

    /**
     * Push通知デバッグページの描画
     */
    public function render_push_notification_debug_page() {
        global $wpdb;
        
        if (!$this->push_notification) {
            ?>
            <div class="wrap">
                <h1>Push通知デバッグ</h1>
                <div class="notice notice-error">
                    <p><strong>エラー:</strong> LMS_Push_Notification クラスが見つかりません。Push通知機能が正しく読み込まれていない可能性があります。</p>
                    <p>以下を確認してください：</p>
                    <ul>
                        <li>includes/class-lms-push-notification.php ファイルが存在するか</li>
                        <li>functions.php で正しく読み込まれているか</li>
                        <li>クラスファイルにシンタックスエラーがないか</li>
                    </ul>
                </div>
            </div>
            <?php
            return;
        }

        if (isset($_POST['update_subscriptions']) && check_admin_referer('update_subscriptions_nonce')) {
            // まずカラムを確認・追加
            $this->ensure_required_columns();
            $updated_count = $this->update_push_subscriptions();
            echo '<div class="notice notice-success"><p>' . $updated_count . '件の購読情報を更新しました。</p></div>';
        }

        if (isset($_POST['fix_lms_users']) && check_admin_referer('push_debug_action', 'push_debug_nonce')) {
            if ($this->push_notification) {
                $this->push_notification->fix_lms_users();
                echo '<div class="notice notice-success"><p>LMS会員情報を更新しました。</p></div>';
            }
        }
        
        // データベーステーブル確認
        $table_name = $wpdb->prefix . 'lms_users';
        
        // テーブルの存在確認
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$table_name}'");
        if (!$table_exists) {
            ?>
            <div class="wrap">
                <h1>Push通知デバッグ</h1>
                <div class="notice notice-error">
                    <p><strong>エラー:</strong> LMS Usersテーブル（<?php echo esc_html($table_name); ?>）が存在しません。</p>
                    <p>データベースの初期化が必要です。</p>
                </div>
            </div>
            <?php
            return;
        }
        
        $sql = "SHOW COLUMNS FROM `{$table_name}`";
        $columns = $wpdb->get_col($sql);
        $has_push_subscription = in_array('push_subscription', $columns);
        $has_subscription_updated = in_array('subscription_updated', $columns);
        $has_subscribed_channels = in_array('subscribed_channels', $columns);

        // 手動テーブル更新処理
        if (isset($_POST['update_table']) && check_admin_referer('update_table_action', 'update_table_nonce')) {
            if ($this->ensure_required_columns()) {
                echo '<div class="notice notice-success"><p>テーブルを更新しました。ページを<a href="' . esc_url($_SERVER['REQUEST_URI']) . '">リロード</a>してください。</p></div>';
                return;
            } else {
                echo '<div class="notice notice-error"><p>テーブル更新に失敗しました。</p></div>';
            }
        }
        
        $vapid_keys = $this->push_notification->get_vapid_keys();
        
        // サブスクリプション統計
        $push_subscriptions_table = $wpdb->prefix . 'lms_push_subscriptions';
        $subscription_table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$push_subscriptions_table}'");
        $subscription_stats = null;
        
        if ($subscription_table_exists) {
            $subscription_stats = $wpdb->get_row("
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active,
                    COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive
                FROM {$push_subscriptions_table}
            ");
        }

        // チャンネル情報取得
        $channels = [];
        $channels_table = $wpdb->prefix . 'lms_chat_channels';
        if ($wpdb->get_var("SHOW TABLES LIKE '{$channels_table}'")) {
            $channels = $wpdb->get_results(
                "SELECT c.id, c.name, c.type
                FROM {$channels_table} c
                ORDER BY c.type DESC, c.name ASC"
            );
        }

        // ミュートされたチャンネル情報
        $user_muted = [];
        $muted_table = $wpdb->prefix . 'lms_chat_muted_channels';
        if ($wpdb->get_var("SHOW TABLES LIKE '{$muted_table}'")) {
            $muted_channels = $wpdb->get_results(
                "SELECT user_id, channel_id FROM {$muted_table}"
            );
            
            if ($muted_channels) {
                foreach ($muted_channels as $muted) {
                    if (!isset($user_muted[$muted->user_id])) {
                        $user_muted[$muted->user_id] = [];
                    }
                    $user_muted[$muted->user_id][] = $muted->channel_id;
                }
            }
        }

        // 会員情報取得
        $members = [];
        if ($has_push_subscription && $has_subscription_updated && $has_subscribed_channels) {
            $members = $wpdb->get_results(
                "SELECT
                    u.id as member_id,
                    u.username as user_login,
                    u.display_name,
                    u.user_type as member_type,
                    u.slack_channel,
                    u.push_subscription,
                    u.subscription_updated,
                    u.subscribed_channels,
                    u.status
                FROM {$table_name} u
                ORDER BY u.id"
            );
        } else {
            $members = $wpdb->get_results(
                "SELECT
                    u.id as member_id,
                    u.username as user_login,
                    u.display_name,
                    u.user_type as member_type,
                    u.slack_channel,
                    u.status
                FROM {$table_name} u
                ORDER BY u.id"
            );
        }

        ?>
        <div class="wrap">
            <h1>Push通知デバッグ</h1>
            
            <?php if (!$has_push_subscription || !$has_subscription_updated || !$has_subscribed_channels): ?>
            <div class="notice notice-warning">
                <p><strong>警告:</strong> 必要なカラムが不足しています。購読情報を更新する前にテーブル構造を修復してください。</p>
                <p>不足しているカラム: 
                    <?php 
                    $missing = [];
                    if (!$has_push_subscription) $missing[] = 'push_subscription';
                    if (!$has_subscription_updated) $missing[] = 'subscription_updated';
                    if (!$has_subscribed_channels) $missing[] = 'subscribed_channels';
                    echo implode(', ', $missing);
                    ?>
                </p>
                <form method="post" action="" style="margin-top: 10px;">
                    <?php wp_nonce_field('update_table_action', 'update_table_nonce'); ?>
                    <button type="submit" name="update_table" class="button button-primary">
                        <span class="dashicons dashicons-database-update"></span>
                        テーブル構造を修復
                    </button>
                </form>
            </div>
            <?php endif; ?>
            
            <div class="push-debug-dashboard">
                <!-- システム状態 -->
                <div class="card">
                    <h2>システム状態</h2>
                    <table class="widefat">
                        <tr>
                            <th>Push通知機能</th>
                            <td><?php echo $this->push_notification->is_enabled() ? '✅ 有効' : '❌ 無効'; ?></td>
                        </tr>
                        <tr>
                            <th>VAPID キー</th>
                            <td><?php echo $vapid_keys ? '✅ 設定済み' : '❌ 未設定'; ?></td>
                        </tr>
                        <tr>
                            <th>サービスワーカー</th>
                            <td><?php echo file_exists(get_template_directory() . '/js/service-worker.js') ? '✅ 存在' : '❌ 未作成'; ?></td>
                        </tr>
                        <tr>
                            <th>LMS Usersテーブル</th>
                            <td><?php echo $table_exists ? '✅ 存在' : '❌ 未作成'; ?></td>
                        </tr>
                        <tr>
                            <th>Push通知カラム</th>
                            <td><?php echo ($has_push_subscription && $has_subscription_updated && $has_subscribed_channels) ? '✅ 準備完了' : '❌ 未準備'; ?></td>
                        </tr>
                        <tr>
                            <th>サブスクリプションテーブル</th>
                            <td><?php echo $subscription_table_exists ? '✅ 存在' : '❌ 未作成'; ?></td>
                        </tr>
                        <tr>
                            <th>総サブスクリプション数</th>
                            <td><?php echo $subscription_stats ? $subscription_stats->total : '0'; ?></td>
                        </tr>
                        <tr>
                            <th>アクティブ</th>
                            <td><?php echo $subscription_stats ? $subscription_stats->active : '0'; ?></td>
                        </tr>
                        <tr>
                            <th>非アクティブ</th>
                            <td><?php echo $subscription_stats ? $subscription_stats->inactive : '0'; ?></td>
                        </tr>
                    </table>
                </div>

                <!-- システム修復機能 -->
                <div class="card">
                    <h2>システム修復機能</h2>
                    <p>Push通知システムのデータベース修復とメンテナンスを実行できます。</p>
                    
                    <?php if ($has_push_subscription && $has_subscription_updated && $has_subscribed_channels): ?>
                    <form method="post" action="" style="display: inline-block; margin-right: 10px;">
                        <?php wp_nonce_field('update_subscriptions_nonce'); ?>
                        <button type="submit" name="update_subscriptions" class="button button-primary">
                            <span class="dashicons dashicons-database-update"></span>
                            購読情報を更新
                        </button>
                    </form>
                    <?php else: ?>
                    <button class="button button-primary" disabled title="テーブル構造の修復が必要です">
                        <span class="dashicons dashicons-database-update"></span>
                        購読情報を更新（無効）
                    </button>
                    <?php endif; ?>
                    
                    <form method="post" action="" style="display: inline-block; margin-right: 10px;">
                        <?php wp_nonce_field('push_debug_action', 'push_debug_nonce'); ?>
                        <button type="submit" name="fix_lms_users" class="button button-secondary">
                            <span class="dashicons dashicons-admin-users"></span>
                            LMSユーザー情報を修正
                        </button>
                    </form>
                    
                    <button onclick="location.reload()" class="button">
                        <span class="dashicons dashicons-update"></span>
                        統計更新
                    </button>
                </div>

                <!-- VAPID キー情報 -->
                <?php if ($vapid_keys): ?>
                <div class="card">
                    <h2>VAPID キー情報</h2>
                    <table class="widefat">
                        <tr>
                            <th>Public Key</th>
                            <td><code style="font-size: 11px; word-break: break-all;"><?php echo esc_html($vapid_keys['public_key']); ?></code></td>
                        </tr>
                        <tr>
                            <th>Private Key</th>
                            <td><code style="font-size: 11px; color: #666;">[セキュリティ上の理由で非表示]</code></td>
                        </tr>
                    </table>
                </div>
                <?php endif; ?>
            </div>

            <!-- 会員詳細リスト（全幅表示） -->
            <div class="push-members-fullwidth">
                <h2>LMS会員 Push通知状況</h2>
                
                <?php if ($members): ?>
                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th class="column-member_id">会員ID</th>
                            <th class="column-user_login">ログインID</th>
                            <th class="column-display_name">表示名</th>
                            <th class="column-member_type">会員種別</th>
                            <th class="column-slack_channel">Slackチャンネル</th>
                            <?php if ($has_subscribed_channels): ?>
                            <th class="column-subscribed_channels">購読チャンネル</th>
                            <?php endif; ?>
                            <?php if ($has_push_subscription): ?>
                            <th class="column-push_status">Push通知</th>
                            <?php endif; ?>
                            <?php if ($has_subscription_updated): ?>
                            <th class="column-last_updated">最終更新</th>
                            <?php endif; ?>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($members as $member): ?>
                        <?php
                            $push_status = '--';
                            $last_updated = '--';
                            $channel_html = '--';
                            
                            if ($has_push_subscription && isset($member->push_subscription)) {
                                $push_status = !empty($member->push_subscription) ?
                                    '<span class="status-icon status-active"></span>有効' :
                                    '<span class="status-icon status-inactive"></span>未設定';
                            }

                            if ($has_subscription_updated && isset($member->subscription_updated)) {
                                $last_updated = $member->subscription_updated ?
                                    wp_date('m/d H:i', strtotime($member->subscription_updated)) :
                                    '--';
                            }

                            if ($has_subscribed_channels && isset($member->subscribed_channels)) {
                                $subscribed_channels = $member->subscribed_channels ? json_decode($member->subscribed_channels, true) : [];

                                if (!empty($subscribed_channels) && is_array($subscribed_channels)) {
                                    $channel_html = '';
                                    foreach ($channels as $channel) {
                                        if (in_array($channel->id, $subscribed_channels)) {
                                            $is_muted = isset($user_muted[$member->member_id]) &&
                                                in_array($channel->id, $user_muted[$member->member_id]);

                                            $channel_html .= sprintf(
                                                '<span class="channel-tag%s" title="%s">%s</span>',
                                                $is_muted ? ' channel-muted' : '',
                                                $is_muted ? 'ミュート中' : '通知有効',
                                                esc_html($channel->name)
                                            );
                                        }
                                    }
                                }
                            }

                            $row_class = (isset($member->status) && $member->status === 'active') ? '' : ' class="inactive-member-row"';
                        ?>
                        <tr<?php echo $row_class; ?>>
                            <td><?php echo esc_html($member->member_id); ?></td>
                            <td><?php echo esc_html($member->user_login); ?></td>
                            <td><?php echo esc_html($member->display_name); ?></td>
                            <td><?php echo esc_html($member->member_type); ?></td>
                            <td><?php echo esc_html($member->slack_channel ?? '--'); ?></td>
                            <?php if ($has_subscribed_channels): ?>
                            <td><?php echo $channel_html; ?></td>
                            <?php endif; ?>
                            <?php if ($has_push_subscription): ?>
                            <td><?php echo $push_status; ?></td>
                            <?php endif; ?>
                            <?php if ($has_subscription_updated): ?>
                            <td><?php echo esc_html($last_updated); ?></td>
                            <?php endif; ?>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <?php else: ?>
                <p>LMS会員が見つかりません。</p>
                <p>テーブル名: <?php echo esc_html($table_name); ?></p>
                <?php endif; ?>
            </div>

            <style>
                /* カード内のスタイル */
                .push-debug-dashboard .card {
                    background: #fff;
                    border: 1px solid #c3c4c7;
                    box-shadow: 0 1px 1px rgba(0,0,0,.04);
                    margin-bottom: 20px;
                    padding: 20px;
                }
                .push-debug-dashboard .card h2 {
                    margin-top: 0;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #ddd;
                }

                /* 全幅会員リストのスタイル */
                .push-members-fullwidth {
                    background: #fff;
                    border: 1px solid #c3c4c7;
                    box-shadow: 0 1px 1px rgba(0,0,0,.04);
                    margin-top: 20px;
                    padding: 20px;
                }
                .push-members-fullwidth h2 {
                    margin-top: 0;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #ddd;
                }

                /* テーブル列幅の調整 */
                .push-members-fullwidth .wp-list-table .column-member_id { width: 8%; }
                .push-members-fullwidth .wp-list-table .column-user_login { width: 12%; }
                .push-members-fullwidth .wp-list-table .column-display_name { width: 12%; }
                .push-members-fullwidth .wp-list-table .column-member_type { width: 8%; }
                .push-members-fullwidth .wp-list-table .column-slack_channel { width: 15%; }
                .push-members-fullwidth .wp-list-table .column-subscribed_channels { width: 30%; }
                .push-members-fullwidth .wp-list-table .column-push_status { width: 8%; }
                .push-members-fullwidth .wp-list-table .column-last_updated { width: 7%; }

                /* ステータスアイコン */
                .status-icon {
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    margin-right: 5px;
                }
                .status-active { background-color: #46b450; }
                .status-inactive { background-color: #dc3232; }

                /* チャンネルタグ */
                .channel-tag {
                    display: inline-block;
                    padding: 2px 8px;
                    margin: 2px;
                    border-radius: 12px;
                    background: #e9ecef;
                    font-size: 0.9em;
                }
                .channel-muted {
                    background: #ffd7d7;
                    text-decoration: line-through;
                }
                
                /* 無効化されたボタン */
                .button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            </style>
        </div>
        <?php
    }

    /**
     * Push通知購読情報を更新
     */
    private function update_push_subscriptions() {
        global $wpdb;

        try {
            // テーブルの存在確認
            $tables_to_check = [
                $wpdb->prefix . 'lms_chat_channels',
                $wpdb->prefix . 'lms_chat_channel_members',
                $wpdb->prefix . 'lms_chat_muted_channels',
                $wpdb->prefix . 'lms_users'
            ];

            foreach ($tables_to_check as $table) {
                $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table'");
                if (!$table_exists) {return 0;
                }
            }

            // カラムの存在確認
            $lms_users_table = $wpdb->prefix . 'lms_users';
            $columns = $wpdb->get_col("SHOW COLUMNS FROM $lms_users_table");
            
            if (!in_array('push_subscription', $columns) || !in_array('subscribed_channels', $columns)) {return 0;
            }

            // チャンネル情報取得
            $channels = $wpdb->get_results(
                "SELECT id, name, type FROM {$wpdb->prefix}lms_chat_channels ORDER BY type DESC, name ASC"
            );

            if ($wpdb->last_error) {return 0;
            }

            // チャンネルメンバー情報取得
            $channel_members = $wpdb->get_results(
                "SELECT cm.user_id, cm.channel_id, c.name, c.type
                FROM {$wpdb->prefix}lms_chat_channel_members cm
                JOIN {$wpdb->prefix}lms_chat_channels c ON cm.channel_id = c.id"
            );

            if ($wpdb->last_error) {$channel_members = []; // エラーの場合は空配列で続行
            }

            // ミュートチャンネル情報取得
            $muted_channels = $wpdb->get_results(
                "SELECT user_id, channel_id FROM {$wpdb->prefix}lms_chat_muted_channels"
            );

            if ($wpdb->last_error) {$muted_channels = []; // エラーの場合は空配列で続行
            }

            // ユーザーチャンネル関係の構築
            $user_channels = [];
            $user_muted = [];

            foreach ($channel_members as $member) {
                if (!isset($user_channels[$member->user_id])) {
                    $user_channels[$member->user_id] = [];
                }
                $user_channels[$member->user_id][] = $member->channel_id;
            }

            foreach ($muted_channels as $muted) {
                if (!isset($user_muted[$muted->user_id])) {
                    $user_muted[$muted->user_id] = [];
                }
                $user_muted[$muted->user_id][] = $muted->channel_id;
            }

            // アクティブメンバー情報取得
            $members = $wpdb->get_results(
                "SELECT
                    id as member_id,
                    username as user_login,
                    display_name,
                    user_type as member_type,
                    slack_channel,
                    push_subscription
                FROM {$wpdb->prefix}lms_users
                WHERE status = 'active'
                ORDER BY id"
            );

            if ($wpdb->last_error) {return 0;
            }

            if (empty($members)) {return 0;
            }

            $updated_count = 0;
            foreach ($members as $member) {
                $existing_subscription = null;
                if (!empty($member->push_subscription)) {
                    $existing_subscription = json_decode($member->push_subscription, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        $existing_subscription = null;
                    }
                }

                $subscribed_channels = [];
                $muted_channel_ids = isset($user_muted[$member->member_id]) ? $user_muted[$member->member_id] : [];

                if (isset($user_channels[$member->member_id])) {
                    foreach ($user_channels[$member->member_id] as $channel_id) {
                        if (!in_array($channel_id, $muted_channel_ids)) {
                            $subscribed_channels[] = intval($channel_id);
                        }
                    }
                }

                // 既存のサブスクリプションがある場合はそれを使用、ない場合はダミーデータを作成
                $subscription = $existing_subscription ?: [
                    'endpoint' => 'https://fcm.googleapis.com/fcm/send/' . $member->member_id,
                    'expirationTime' => null,
                    'keys' => [
                        'p256dh' => 'BJ7MISip9lMZyhTJQZAahVViTqonX4vWhyt7DSxQdOm_9dXbY9pDCaaUvBVz22GnvA7LO4uxqhpSu4y7X8Wdxmc',
                        'auth'   => 'TTcdgHL63-G7X8THhlcBsQ'
                    ]
                ];

                $result = $wpdb->update(
                    $wpdb->prefix . 'lms_users',
                    [
                        'push_subscription' => wp_json_encode($subscription),
                        'subscribed_channels' => wp_json_encode($subscribed_channels),
                        'subscription_updated' => current_time('mysql')
                    ],
                    ['id' => $member->member_id],
                    ['%s', '%s', '%s'],
                    ['%d']
                );

                if ($result !== false) {
                    $updated_count++;
                } else if ($wpdb->last_error) {
                    // エラーログ出力は削除済み
                }
            }

            return $updated_count;

        } catch (Exception $e) {
            return 0;
        }
    }

    /**
     * データベーステーブルに必要なカラムを追加
     */
    private function ensure_required_columns() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'lms_users';
        $sql = "SHOW COLUMNS FROM `{$table_name}`";
        $columns = $wpdb->get_col($sql);
        
        $modifications = [];
        
        if (!in_array('push_subscription', $columns)) {
            $modifications[] = "ADD COLUMN `push_subscription` TEXT DEFAULT NULL";
        }
        
        if (!in_array('subscription_updated', $columns)) {
            $modifications[] = "ADD COLUMN `subscription_updated` DATETIME DEFAULT NULL";
        }
        
        if (!in_array('subscribed_channels', $columns)) {
            $modifications[] = "ADD COLUMN `subscribed_channels` TEXT DEFAULT NULL";
        }
        
        // カラムを追加
        if (!empty($modifications)) {
            $sql = "ALTER TABLE {$table_name} " . implode(', ', $modifications);
            $result = $wpdb->query($sql);
            
            if ($result === false) {return false;
            }
        }
        
        return true;
    }

    /**
     * Push通知デバッグテスト用Ajaxハンドラー
     */
    public function ajax_push_debug_test() {
        if (!wp_verify_nonce($_POST['nonce'], 'lms_push_debug')) {
            wp_send_json_error(array('message' => 'セキュリティ検証に失敗しました。'));
        }

        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => '権限が不足しています。'));
        }

        if (!$this->push_notification) {
            wp_send_json_error(array('message' => 'Push通知機能が利用できません。LMS_Push_Notification クラスが見つかりません。'));
        }

        $user_id = intval($_POST['user_id']);
        $message = sanitize_text_field($_POST['message']);

        if (!$user_id || !$message) {
            wp_send_json_error(array('message' => 'ユーザーIDとメッセージが必要です。'));
        }

        // テスト通知の送信
        try {
            $result = $this->push_notification->send_notification($user_id, array(
                'title' => 'LMS Push通知テスト',
                'body' => $message,
                'icon' => get_template_directory_uri() . '/images/notification-icon.png',
                'tag' => 'debug-test',
                'data' => array(
                    'type' => 'debug_test',
                    'timestamp' => time()
                )
            ));

            if ($result) {
                wp_send_json_success(array('message' => 'テスト通知を送信しました。'));
            } else {
                wp_send_json_error(array('message' => '通知送信に失敗しました。サブスクリプションが存在しない可能性があります。'));
            }
        } catch (Exception $e) {
            wp_send_json_error(array('message' => '送信エラー: ' . $e->getMessage()));
        }
    }
}

// クラスのインスタンス化
if (is_admin()) {
    global $lms_chat;
    new LMS_Chat_Admin($lms_chat);
}