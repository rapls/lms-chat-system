<?php
/**
 * 管理画面用イベントクリーンアップページ
 * WordPress管理画面内で実行して古い無効なイベントデータを削除
 */

// WordPress管理画面でのみ実行可能
if (!is_admin()) {
    wp_die('このページは管理画面でのみアクセス可能です。');
}

// 管理者権限チェック
if (!current_user_can('manage_options')) {
    wp_die('このページにアクセスする権限がありません。');
}

global $wpdb;

// POST リクエストでクリーンアップ実行
if (isset($_POST['cleanup_events']) && wp_verify_nonce($_POST['_wpnonce'], 'cleanup_events')) {
    
    echo '<div class="notice notice-info"><p>イベントクリーンアップを開始しています...</p></div>';
    
    // 1. 無効なメッセージIDを参照しているイベントを削除
    $deleted_invalid = $wpdb->query("
        DELETE e FROM wp_lms_chat_realtime_events e
        LEFT JOIN wp_lms_chat_messages m ON e.message_id = m.id
        WHERE e.event_type IN ('message_create', 'message_delete')
        AND e.message_id IS NOT NULL
        AND m.id IS NULL
    ");
    
    // 2. 1時間以上古いイベントを削除
    $deleted_old = $wpdb->query("
        DELETE FROM wp_lms_chat_realtime_events 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
    ");
    
    echo '<div class="notice notice-success"><p>';
    echo "クリーンアップ完了: 無効なイベント {$deleted_invalid} 件、古いイベント {$deleted_old} 件を削除しました。";
    echo '</p></div>';
}

// 現在の状況を表示
$event_count = $wpdb->get_var("SELECT COUNT(*) FROM wp_lms_chat_realtime_events");
$invalid_count = $wpdb->get_var("
    SELECT COUNT(*) FROM wp_lms_chat_realtime_events e
    LEFT JOIN wp_lms_chat_messages m ON e.message_id = m.id
    WHERE e.event_type IN ('message_create', 'message_delete')
    AND e.message_id IS NOT NULL
    AND m.id IS NULL
");
$old_count = $wpdb->get_var("
    SELECT COUNT(*) 
    FROM wp_lms_chat_realtime_events 
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
");

?>
<div class="wrap">
    <h1>LMS Chat イベントクリーンアップ</h1>
    
    <div class="card">
        <h2>現在の状況</h2>
        <p><strong>総イベント数:</strong> <?php echo $event_count; ?> 件</p>
        <p><strong>無効なメッセージ参照イベント:</strong> <?php echo $invalid_count; ?> 件</p>
        <p><strong>1時間以上古いイベント:</strong> <?php echo $old_count; ?> 件</p>
    </div>
    
    <?php if ($invalid_count > 0 || $old_count > 0): ?>
    <div class="card">
        <h2>クリーンアップ実行</h2>
        <p>古いイベントと無効なイベントを削除して、メッセージ同期システムをクリーンな状態にします。</p>
        
        <form method="post">
            <?php wp_nonce_field('cleanup_events'); ?>
            <input type="hidden" name="cleanup_events" value="1">
            <p class="submit">
                <input type="submit" class="button-primary" value="クリーンアップ実行" 
                       onclick="return confirm('<?php echo $invalid_count + $old_count; ?> 件のイベントを削除します。よろしいですか？');">
            </p>
        </form>
    </div>
    <?php else: ?>
    <div class="notice notice-success">
        <p>クリーンアップの必要なイベントはありません。</p>
    </div>
    <?php endif; ?>
    
    <div class="card">
        <h2>最新のイベント（10件）</h2>
        <?php
        $recent_events = $wpdb->get_results("
            SELECT id, event_type, message_id, channel_id, user_id, created_at
            FROM wp_lms_chat_realtime_events
            ORDER BY created_at DESC
            LIMIT 10
        ");
        ?>
        <table class="widefat fixed striped">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>イベントタイプ</th>
                    <th>メッセージID</th>
                    <th>チャンネルID</th>
                    <th>ユーザーID</th>
                    <th>作成日時</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($recent_events as $event): ?>
                <tr>
                    <td><?php echo $event->id; ?></td>
                    <td><?php echo $event->event_type; ?></td>
                    <td><?php echo $event->message_id; ?></td>
                    <td><?php echo $event->channel_id; ?></td>
                    <td><?php echo $event->user_id; ?></td>
                    <td><?php echo $event->created_at; ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<style>
.card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 20px;
    margin: 20px 0;
    box-shadow: 0 1px 1px rgba(0,0,0,.04);
}
</style>