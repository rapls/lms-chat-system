<?php
/**
 * LMSセキュリティクラス
 * WordPressユーザーの混入防止とデータ整合性保護
 */

class LMS_Security {
    
    private $table_name;
    
    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'lms_users';
        
        add_action('user_register', array($this, 'prevent_wp_user_auto_add'));
        add_action('wp_login', array($this, 'prevent_wp_user_auto_add_on_login'), 10, 2);
        
        add_action('admin_init', array($this, 'check_data_integrity'));
        
        add_action('init', array($this, 'monitor_member_number_changes'));
        
        add_action('wp_loaded', array($this, 'periodic_integrity_check'));
        
        add_action('admin_init', array($this, 'block_wp_admin_lms_access'));
        
        add_action('user_register', array($this, 'immediate_cleanup_on_wp_user_creation'), 999);
        
        add_action('lms_cleanup_after_wp_user_creation', array($this, 'cleanup_after_wp_user_creation'));
        
        $this->block_wordpress_integration();
    }
    
    /**
     * WordPressユーザー登録時の自動追加を防止（強化版）
     */
    public function prevent_wp_user_auto_add($user_id) {
        global $wpdb;
        
        
        $existing_user = $wpdb->get_row($wpdb->prepare(
            "SELECT id, username, member_number FROM {$this->table_name} WHERE wp_user_id = %d",
            $user_id
        ));
        
        if ($existing_user) {
            
            $wpdb->update(
                $this->table_name,
                array('wp_user_id' => 0),
                array('id' => $existing_user->id),
                array('%d'),
                array('%d')
            );
            
            $this->send_security_alert("WordPress user auto-registration blocked", array(
                'wp_user_id' => $user_id,
                'lms_user_id' => $existing_user->id,
                'username' => $existing_user->username,
                'member_number' => $existing_user->member_number
            ));
        }
    }
    
    /**
     * WordPressログイン時の自動追加を防止
     */
    public function prevent_wp_user_auto_add_on_login($user_login, $user) {
        global $wpdb;
        
        $existing_lms_user = $wpdb->get_row($wpdb->prepare(
            "SELECT id, wp_user_id, member_number, username FROM {$this->table_name} WHERE wp_user_id = %d",
            $user->ID
        ));
        
        if ($existing_lms_user) {
            $this->log_user_data_change($existing_lms_user, 'WordPress login detected');
        }
    }
    
    /**
     * データ整合性チェック
     */
    public function check_data_integrity() {
        if (!current_user_can('manage_options')) {
            return;
        }
        
        global $wpdb;
        
        $wp_linked_users = $wpdb->get_results(
            "SELECT id, wp_user_id, member_number, username, created_at 
             FROM {$this->table_name} 
             WHERE wp_user_id > 0 
             ORDER BY created_at DESC"
        );
        
        foreach ($wp_linked_users as $user) {
            $created_time = strtotime($user->created_at);
            if ($created_time > (time() - 86400)) { // 24時間以内
                $this->log_suspicious_activity($user, 'Recent WordPress-linked user detected');
            }
        }
        
        $duplicate_members = $wpdb->get_results(
            "SELECT member_number, COUNT(*) as count 
             FROM {$this->table_name} 
             WHERE member_number IS NOT NULL AND member_number != '' 
             GROUP BY member_number 
             HAVING count > 1"
        );
        
        if (!empty($duplicate_members)) {
            foreach ($duplicate_members as $duplicate) {
            }
        }
    }
    
    /**
     * ユーザーデータ変更のログ記録
     */
    private function log_user_data_change($user, $context) {
        $log_message = sprintf(
            "[LMS Security] %s - User: %s (ID: %d, wp_user_id: %d, member_number: %s)",
            $context,
            $user->username,
            $user->id,
            $user->wp_user_id,
            $user->member_number
        );
    }
    
    /**
     * 疑わしい活動のログ記録
     */
    private function log_suspicious_activity($user, $reason) {
        $log_message = sprintf(
            "[LMS Security WARNING] %s - User: %s (ID: %d, wp_user_id: %d, member_number: %s, created: %s)",
            $reason,
            $user->username,
            $user->id,
            $user->wp_user_id,
            $user->member_number,
            $user->created_at
        );
    }
    
    /**
     * LMSユーザーテーブルからWordPressユーザーを削除
     */
    public function remove_wordpress_users() {
        global $wpdb;
        
        $wp_users = $wpdb->get_results(
            "SELECT id, username, wp_user_id, member_number, created_at 
             FROM {$this->table_name} 
             WHERE wp_user_id > 0"
        );
        
        $removed_count = 0;
        foreach ($wp_users as $user) {
            $wp_user = get_user_by('ID', $user->wp_user_id);
            if ($wp_user && user_can($wp_user, 'manage_options')) {
                $this->log_suspicious_activity($user, 'WordPress admin user found in LMS table');
                
            }
        }
        
        return $removed_count;
    }
    
    /**
     * member_numberの整合性を修復
     */
    public function fix_member_numbers() {
        global $wpdb;
        
        $problematic_users = $wpdb->get_results(
            "SELECT id, member_number, username 
             FROM {$this->table_name} 
             WHERE status = 'active' 
             AND (member_number = 0 OR member_number IS NULL)
             ORDER BY id ASC"
        );
        
        foreach ($problematic_users as $user) {
            $max_number = $wpdb->get_var(
                "SELECT MAX(member_number) FROM {$this->table_name} 
                 WHERE member_number IS NOT NULL AND member_number > 0"
            );
            $next_number = $max_number ? $max_number + 1 : 1;
            
            $wpdb->update(
                $this->table_name,
                array('member_number' => $next_number),
                array('id' => $user->id),
                array('%d'),
                array('%d')
            );
            
        }
    }
    
    /**
     * member_number変更監視
     */
    public function monitor_member_number_changes() {
        global $wpdb;
        
        if (!get_transient('lms_member_numbers_baseline')) {
            $current_numbers = $wpdb->get_results(
                "SELECT id, member_number, username FROM {$this->table_name} WHERE status = 'active'",
                OBJECT_K
            );
            set_transient('lms_member_numbers_baseline', $current_numbers, HOUR_IN_SECONDS);
        }
    }
    
    /**
     * 定期的な整合性チェック
     */
    public function periodic_integrity_check() {
        global $wpdb;
        
        if (get_transient('lms_daily_integrity_check')) {
            return;
        }
        
        set_transient('lms_daily_integrity_check', true, DAY_IN_SECONDS);
        
        $wp_linked_users = $wpdb->get_results(
            "SELECT id, wp_user_id, username, member_number, created_at 
             FROM {$this->table_name} 
             WHERE wp_user_id > 0"
        );
        
        if (!empty($wp_linked_users)) {
            foreach ($wp_linked_users as $user) {
                $wpdb->update(
                    $this->table_name,
                    array('wp_user_id' => 0),
                    array('id' => $user->id),
                    array('%d'),
                    array('%d')
                );
                
            }
            
            $this->send_security_alert("WordPress users detected and unlinked", array(
                'count' => count($wp_linked_users),
                'users' => array_map(function($u) { return $u->username; }, $wp_linked_users)
            ));
        }
        
        $this->check_member_number_integrity();
    }
    
    /**
     * WordPress管理画面でのLMS操作を完全に遮断
     */
    public function block_wp_admin_lms_access() {
        global $wpdb;
        
        if (is_admin() && current_user_can('manage_options')) {
            $invalid_records = $wpdb->get_results(
                "SELECT id, wp_user_id, username, member_number 
                 FROM {$this->table_name} 
                 WHERE wp_user_id > 0"
            );
            
            if (!empty($invalid_records)) {
                foreach ($invalid_records as $record) {
                    $wpdb->update(
                        $this->table_name,
                        array('wp_user_id' => 0),
                        array('id' => $record->id),
                        array('%d'),
                        array('%d')
                    );
                    
                }
                
                add_action('admin_notices', function() use ($invalid_records) {
                    echo '<div class="notice notice-error is-dismissible">';
                    echo '<p><strong>LMS Security Alert:</strong> ' . count($invalid_records) . ' WordPress-linked users were detected and automatically cleaned up.</p>';
                    echo '</div>';
                });
            }
        }
    }
    
    /**
     * WordPressユーザー作成時の即座修復
     */
    public function immediate_cleanup_on_wp_user_creation($user_id) {
        global $wpdb;
        
        wp_schedule_single_event(time() + 5, 'lms_cleanup_after_wp_user_creation', array($user_id));
        
    }
    
    /**
     * 遅延実行されるWordPressユーザー作成後のクリーンアップ
     */
    public function cleanup_after_wp_user_creation($user_id) {
        global $wpdb;
        
        $linked_records = $wpdb->get_results($wpdb->prepare(
            "SELECT id, username, member_number FROM {$this->table_name} WHERE wp_user_id = %d",
            $user_id
        ));
        
        if (!empty($linked_records)) {
            foreach ($linked_records as $record) {
                $wpdb->update(
                    $this->table_name,
                    array('wp_user_id' => 0),
                    array('id' => $record->id),
                    array('%d'),
                    array('%d')
                );
                
            }
            
            $this->send_security_alert("Emergency WordPress user auto-link cleanup", array(
                'wp_user_id' => $user_id,
                'affected_lms_users' => array_map(function($r) { return $r->username; }, $linked_records),
                'count' => count($linked_records)
            ));
        }
    }
    
    /**
     * member_number整合性チェック
     */
    public function check_member_number_integrity() {
        global $wpdb;
        
        $baseline = get_transient('lms_member_numbers_baseline');
        if (!$baseline) {
            return;
        }
        
        $current_numbers = $wpdb->get_results(
            "SELECT id, member_number, username FROM {$this->table_name} WHERE status = 'active'",
            OBJECT_K
        );
        
        foreach ($current_numbers as $id => $current_user) {
            if (isset($baseline[$id])) {
                $baseline_user = $baseline[$id];
                
                if ($baseline_user->member_number != $current_user->member_number) {
                    $wpdb->update(
                        $this->table_name,
                        array('member_number' => $baseline_user->member_number),
                        array('id' => $id),
                        array('%d'),
                        array('%d')
                    );
                    
                    
                    $this->send_security_alert("member_number unauthorized change", array(
                        'user_id' => $id,
                        'username' => $current_user->username,
                        'original_number' => $baseline_user->member_number,
                        'changed_number' => $current_user->member_number
                    ));
                }
            }
        }
        
        set_transient('lms_member_numbers_baseline', $current_numbers, HOUR_IN_SECONDS);
    }
    
    /**
     * WordPress統合を完全に遮断
     */
    private function block_wordpress_integration() {
        remove_all_actions('wp_login');
        remove_all_actions('user_register');
        remove_all_actions('profile_update');
        remove_all_actions('delete_user');
        
        add_filter('authenticate', array($this, 'block_wp_lms_auth_integration'), 9999, 3);
        add_filter('wp_authenticate_user', array($this, 'prevent_wp_user_lms_link'), 9999, 2);
        
        remove_action('wp_login', 'wp_new_user_notification');
        remove_action('wp_login', 'wp_update_user');
        
    }
    
    /**
     * WordPress認証とLMSの統合を防ぐ
     */
    public function block_wp_lms_auth_integration($user, $username, $password) {
        if (is_wp_error($user) || !$user) {
            return $user;
        }
        
        global $wpdb;
        $contaminated_record = $wpdb->get_row($wpdb->prepare(
            "SELECT id, username FROM {$this->table_name} WHERE wp_user_id = %d",
            $user->ID
        ));
        
        if ($contaminated_record) {
            $wpdb->update(
                $this->table_name,
                array('wp_user_id' => 0),
                array('id' => $contaminated_record->id),
                array('%d'),
                array('%d')
            );
            
        }
        
        return $user;
    }
    
    /**
     * WordPressユーザーとLMSユーザーのリンクを防ぐ
     */
    public function prevent_wp_user_lms_link($user, $password) {
        if (is_wp_error($user) || !$user) {
            return $user;
        }
        
        global $wpdb;
        $check_contamination = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->table_name} WHERE wp_user_id = %d",
            $user->ID
        ));
        
        if ($check_contamination > 0) {
            $wpdb->update(
                $this->table_name,
                array('wp_user_id' => 0),
                array('wp_user_id' => $user->ID),
                array('%d'),
                array('%d')
            );
            
        }
        
        return $user;
    }
    
    /**
     * セキュリティアラート送信
     */
    private function send_security_alert($type, $data) {
        $alert_message = sprintf(
            "[LMS Security Alert] %s - %s",
            $type,
            json_encode($data, JSON_UNESCAPED_UNICODE)
        );
        
        
        if (defined('LMS_SECURITY_ALERT_EMAIL') && LMS_SECURITY_ALERT_EMAIL) {
            $admin_email = get_option('admin_email');
            if ($admin_email) {
                wp_mail(
                    $admin_email,
                    'LMS Security Alert: ' . $type,
                    $alert_message
                );
            }
        }
    }
}

new LMS_Security();