<?php
/**
 * 空のスレッド情報をクリーンアップするスクリプト
 * 
 * このスクリプトは、削除されたスレッドメッセージにより
 * thread_countが0になったメッセージのthread_infoをクリーンアップします。
 * 
 * 実行方法:
 * php cleanup-empty-threads.php
 */

// WordPressの読み込み
$wp_load_path = __DIR__ . '/../../../wp-load.php';
if (!file_exists($wp_load_path)) {
    die("エラー: wp-load.php が見つかりません: {$wp_load_path}
");
}
require_once $wp_load_path;

global $wpdb;

echo "空のスレッド情報をクリーンアップ中...\n\n";

// thread_countが0だが、thread_last_reply_atなどが設定されているメッセージを検索
$messages_with_empty_threads = $wpdb->get_results("
    SELECT id, thread_count, thread_last_reply_at, thread_last_user_id
    FROM {$wpdb->prefix}lms_chat_messages
    WHERE (thread_count IS NULL OR thread_count = 0)
    AND (thread_last_reply_at IS NOT NULL OR thread_last_user_id IS NOT NULL)
");

if (empty($messages_with_empty_threads)) {
    echo "クリーンアップが必要なメッセージはありません。\n";
    exit(0);
}

echo "見つかったメッセージ: " . count($messages_with_empty_threads) . "件\n\n";

foreach ($messages_with_empty_threads as $message) {
    echo "メッセージID {$message->id}:
";
    echo "  現在のthread_count: " . ($message->thread_count ?? 'NULL') . "\n";
    echo "  thread_last_reply_at: " . ($message->thread_last_reply_at ?? 'NULL') . "\n";
    echo "  thread_last_user_id: " . ($message->thread_last_user_id ?? 'NULL') . "\n";
    
    // 実際のスレッドメッセージ数を確認
    $actual_count = $wpdb->get_var($wpdb->prepare("
        SELECT COUNT(*)
        FROM {$wpdb->prefix}lms_chat_thread_messages
        WHERE parent_message_id = %d
        AND deleted_at IS NULL
    ", $message->id));
    
    echo "  実際のスレッドメッセージ数: {$actual_count}\n";
    
    if ($actual_count == 0) {
        // スレッド情報をクリーンアップ
        $result = $wpdb->update(
            $wpdb->prefix . 'lms_chat_messages',
            [
                'thread_count' => 0,
                'thread_last_reply_at' => null,
                'thread_last_user_id' => null
            ],
            ['id' => $message->id],
            ['%d', '%s', '%d'],
            ['%d']
        );
        
        if ($result !== false) {
            echo "  ✅ クリーンアップ完了\n";
        } else {
            echo "  ❌ エラー: " . $wpdb->last_error . "\n";
        }
    } else {
        echo "  ⚠️ スキップ: 実際のスレッドメッセージが存在します\n";
    }
    
    echo "\n";
}

echo "クリーンアップ完了！\n";
