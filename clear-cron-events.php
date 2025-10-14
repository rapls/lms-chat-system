<?php
/**
 * 溜まったcronイベントをクリアするスクリプト（軽量版）
 *
 * 使用方法: ブラウザで直接アクセス
 * https://lms.local/wp-content/themes/lms/clear-cron-events.php
 */

// エラー表示を有効化
@ini_set('display_errors', 1);
@error_reporting(E_ALL);

// タイムアウトを延長
@set_time_limit(300);

// 出力バッファリング開始
@ob_start();

// WordPressを読み込む
$wp_load_path = __DIR__ . '/../../../../wp-load.php';

if (!file_exists($wp_load_path)) {
    die('❌ WordPress が見つかりません: ' . $wp_load_path);
}

try {
    require_once($wp_load_path);
} catch (Exception $e) {
    die('❌ WordPress 読み込みエラー: ' . $e->getMessage());
}

// 管理者チェック
if (!function_exists('current_user_can') || !current_user_can('manage_options')) {
    die('❌ このスクリプトは管理者のみ実行できます。');
}

echo "<h1>Cron イベントクリーンアップ（軽量版）</h1>\n";
echo "<pre>\n";

try {
    // cron配列を直接取得
    $cron_array = get_option('cron');

    if (!is_array($cron_array)) {
        echo "❌ Cron配列が見つかりません\n";
        exit;
    }

    echo "現在のcronタイムスタンプ数: " . count($cron_array) . "\n\n";

    // カウント
    $lms_push_count = 0;
    $lms_longpoll_count = 0;

    foreach ($cron_array as $timestamp => $cron) {
        if (isset($cron['lms_send_push_notification'])) {
            $lms_push_count += count($cron['lms_send_push_notification']);
        }
        if (isset($cron['lms_send_longpoll_notification'])) {
            $lms_longpoll_count += count($cron['lms_send_longpoll_notification']);
        }
    }

    echo "削除前:\n";
    echo "  - lms_send_push_notification: {$lms_push_count} 件\n";
    echo "  - lms_send_longpoll_notification: {$lms_longpoll_count} 件\n\n";

    // 新しい配列を作成（LMS関連イベントを除外）
    $new_cron_array = array();

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

    if ($result !== false) {
        echo "✅ Cron配列を正常に更新しました\n\n";
    } else {
        echo "⚠️ Cron配列は既にクリーンです（変更なし）\n\n";
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

    echo "削除後:\n";
    echo "  - lms_send_push_notification: {$new_lms_push_count} 件\n";
    echo "  - lms_send_longpoll_notification: {$new_lms_longpoll_count} 件\n";
    echo "  - 削除された: " . (($lms_push_count + $lms_longpoll_count) - ($new_lms_push_count + $new_lms_longpoll_count)) . " 件\n";

    echo "\n✅ クリーンアップ完了\n";

} catch (Exception $e) {
    echo "❌ エラー: " . $e->getMessage() . "\n";
    echo "スタックトレース:\n" . $e->getTraceAsString() . "\n";
}

echo "</pre>\n";

// 自動削除オプション（セキュリティのため）
if (isset($_GET['delete_script']) && $_GET['delete_script'] === 'yes') {
    @unlink(__FILE__);
    echo "<p style='color: green;'>✅ このスクリプトファイルを削除しました</p>\n";
} else {
    echo "<p><a href='?delete_script=yes'>このスクリプトファイルを削除する</a></p>\n";
}
