<?php
/**
 * LMS管理画面クラス
 */
class LMS_Admin {

    /**
     * プッシュ通知のテスト機能を追加するためのJavaScriptを追加
     */
    public function enqueue_admin_scripts() {
        // 管理画面でのスクリプト読み込み
        wp_enqueue_script( 'lms-admin-js', get_template_directory_uri() . '/js/admin.js', array( 'jquery' ), filemtime( get_template_directory() . '/js/admin.js' ), true );

        // ユーザー一覧ページでのみテスト通知機能を追加
        if ( current_user_can( 'manage_options' ) && isset( $_GET['page'] ) && $_GET['page'] === 'lms-settings' ) {
            // 設定ページにテスト通知機能を追加
            wp_localize_script( 'lms-admin-js', 'lmsAdmin', array(
                'ajaxUrl' => admin_url( 'admin-ajax.php' ),
                'nonce' => wp_create_nonce( 'lms_admin_nonce' ),
                'testNotificationNonce' => wp_create_nonce( 'lms_test_notification_nonce' ),
                'i18n' => array(
                    'testNotificationSuccess' => __( 'テスト通知を送信しました', 'lms' ),
                    'testNotificationError' => __( 'テスト通知の送信に失敗しました', 'lms' ),
                    'confirm' => __( '本当に実行しますか？', 'lms' ),
                ),
            ) );
        }
    }

    /**
     * 管理画面にテスト通知機能を表示するための処理
     */
    public function display_admin_settings_page() {
        // 権限チェック
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        // 設定ページの表示
        ?>
        <div class="wrap">
            <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

            <div class="lms-admin-section">
                <h2><?php _e( 'プッシュ通知設定', 'lms' ); ?></h2>
                <p><?php _e( 'プッシュ通知の設定とテスト機能です。', 'lms' ); ?></p>

                <div class="lms-admin-card">
                    <h3><?php _e( 'テスト通知', 'lms' ); ?></h3>
                    <p><?php _e( '特定のユーザーにテスト通知を送信できます。', 'lms' ); ?></p>

                    <div class="lms-admin-form">
                        <div class="lms-form-row">
                            <label for="test-notification-user-id"><?php _e( 'ユーザーID', 'lms' ); ?></label>
                            <input type="number" id="test-notification-user-id" min="1" placeholder="2">
                            <p class="description"><?php _e( '通知を送信するユーザーIDを入力してください。', 'lms' ); ?></p>
                        </div>

                        <div class="lms-form-row">
                            <button id="send-test-notification" class="button button-primary"><?php _e( 'テスト通知を送信', 'lms' ); ?></button>
                            <span id="test-notification-result"></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <style>
            .lms-admin-card {
                background: #fff;
                border: 1px solid #ccd0d4;
                border-radius: 4px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 1px 1px rgba(0,0,0,.04);
            }
            .lms-form-row {
                margin-bottom: 15px;
            }
            .lms-form-row label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
            }
            .lms-form-row input {
                width: 100%;
                max-width: 300px;
            }
            .description {
                color: #666;
                font-style: italic;
                margin-top: 5px;
            }
        </style>
        <?php
    }
}