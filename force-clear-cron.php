<?php
/**
 * 強制的にcronイベントをクリアするスクリプト
 *
 * 使用方法: ブラウザで直接アクセス
 * https://lms.local/wp-content/themes/lms/force-clear-cron.php
 */

// WordPressを読み込む
require_once(__DIR__ . '/../../../../wp-load.php');

// 管理者チェック
if (!current_user_can('manage_options')) {
    die('このスクリプトは管理者のみ実行できます。');
}

echo "<h1>🔥 強制Cronクリーンアップ</h1>\n";
echo "<pre>\n";

// cron配列を直接取得
$cron_array = get_option('cron');

if (!is_array($cron_array)) {
    echo "❌ Cron配列が見つかりません\n";
    exit;
}

echo "現在のcronイベント総数: " . count($cron_array) . " タイムスタンプ\n\n";

// 全てのlms関連イベントをカウント
$lms_push_count = 0;
$lms_longpoll_count = 0;
$other_count = 0;

foreach ($cron_array as $timestamp => $cron) {
    if (isset($cron['lms_send_push_notification'])) {
        $lms_push_count += count($cron['lms_send_push_notification']);
    }
    if (isset($cron['lms_send_longpoll_notification'])) {
        $lms_longpoll_count += count($cron['lms_send_longpoll_notification']);
    }
}

echo "📊 イベント数:\n";
echo "  - lms_send_push_notification: {$lms_push_count} 件\n";
echo "  - lms_send_longpoll_notification: {$lms_longpoll_count} 件\n";
echo "\n";

// 方法1: delete_optionで完全削除してから再作成（最も確実）
echo "🔥 方法1: Cron配列を完全に再構築...\n";

$new_cron_array = array();

// LMS以外のイベントだけを保持
foreach ($cron_array as $timestamp => $cron) {
    $filtered_cron = array();

    foreach ($cron as $hook => $events) {
        // LMS関連以外は保持
        if ($hook !== 'lms_send_push_notification' && $hook !== 'lms_send_longpoll_notification') {
            $filtered_cron[$hook] = $events;
        }
    }

    if (!empty($filtered_cron)) {
        $new_cron_array[$timestamp] = $filtered_cron;
    }
}

// 新しい配列で上書き
$result = update_option('cron', $new_cron_array);

if ($result) {
    echo "✅ Cron配列を正常に再構築しました\n";
} else {
    echo "⚠️ Cron配列の更新に失敗しました（変更がない可能性があります）\n";
}

// 結果を確認
$new_cron_array = get_option('cron');
$new_lms_push_count = 0;
$new_lms_longpoll_count = 0;

if (is_array($new_cron_array)) {
    foreach ($new_cron_array as $timestamp => $cron) {
        if (isset($cron['lms_send_push_notification'])) {
            $new_lms_push_count += count($cron['lms_send_push_notification']);
        }
        if (isset($cron['lms_send_longpoll_notification'])) {
            $new_lms_longpoll_count += count($cron['lms_send_longpoll_notification']);
        }
    }
}

echo "\n📊 クリーンアップ後:\n";
echo "  - lms_send_push_notification: {$new_lms_push_count} 件\n";
echo "  - lms_send_longpoll_notification: {$new_lms_longpoll_count} 件\n";
echo "  - 削除された: " . (($lms_push_count + $lms_longpoll_count) - ($new_lms_push_count + $new_lms_longpoll_count)) . " 件\n";

echo "\n✅ クリーンアップ完了\n";
echo "</pre>\n";

// 自動削除オプション
if (isset($_GET['delete_script']) && $_GET['delete_script'] === 'yes') {
    @unlink(__FILE__);
    echo "<p style='color: green;'>✅ このスクリプトファイルを削除しました</p>\n";
} else {
    echo "<p><a href='?delete_script=yes'>このスクリプトファイルを削除する</a></p>\n";
}
