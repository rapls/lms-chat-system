<?php
/**
 * 超シンプルなCronクリアスクリプト
 * WordPress読み込み不要版
 */

// データベース接続情報を直接設定
define('DB_NAME', 'local');
define('DB_USER', 'root');
define('DB_PASSWORD', 'root');
define('DB_HOST', 'localhost');
define('DB_CHARSET', 'utf8mb4');

// テーブル接頭辞
$table_prefix = 'wp_';

// エラー表示
@ini_set('display_errors', 1);
@error_reporting(E_ALL);
@set_time_limit(300);

header('Content-Type: text/html; charset=UTF-8');

echo "<!DOCTYPE html>\n";
echo "<html><head><meta charset='UTF-8'><title>Cron クリーンアップ</title></head><body>\n";
echo "<h1>🔧 Cron イベントクリーンアップ（直接DB版）</h1>\n";
echo "<pre>\n";

try {
    // MySQLi接続
    $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);

    if ($mysqli->connect_error) {
        throw new Exception('データベース接続失敗: ' . $mysqli->connect_error);
    }

    $mysqli->set_charset(DB_CHARSET);

    echo "✅ データベース接続成功\n\n";

    // オプションテーブル名
    $options_table = $table_prefix . 'options';

    // 現在のcron配列を取得
    $query = "SELECT option_value FROM {$options_table} WHERE option_name = 'cron'";
    $result = $mysqli->query($query);

    if (!$result) {
        throw new Exception('クエリ失敗: ' . $mysqli->error);
    }

    $row = $result->fetch_assoc();

    if (!$row) {
        echo "⚠️ Cronデータが見つかりません\n";
        exit;
    }

    $cron_array = @unserialize($row['option_value']);

    if (!is_array($cron_array)) {
        echo "❌ Cron配列のデシリアライズに失敗\n";
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

    if ($lms_push_count == 0 && $lms_longpoll_count == 0) {
        echo "✅ クリーンアップ不要（既にクリーンです）\n";
        exit;
    }

    // 新しい配列を作成
    $new_cron_array = array();

    foreach ($cron_array as $timestamp => $cron) {
        $filtered_cron = array();

        foreach ($cron as $hook => $events) {
            if ($hook !== 'lms_send_push_notification' && $hook !== 'lms_send_longpoll_notification') {
                $filtered_cron[$hook] = $events;
            }
        }

        if (!empty($filtered_cron)) {
            $new_cron_array[$timestamp] = $filtered_cron;
        }
    }

    // シリアライズ
    $serialized = serialize($new_cron_array);

    // データベースに保存
    $escaped = $mysqli->real_escape_string($serialized);
    $update_query = "UPDATE {$options_table} SET option_value = '{$escaped}' WHERE option_name = 'cron'";

    if (!$mysqli->query($update_query)) {
        throw new Exception('更新失敗: ' . $mysqli->error);
    }

    echo "✅ データベース更新成功\n\n";

    // 結果確認
    $result2 = $mysqli->query($query);
    $row2 = $result2->fetch_assoc();
    $new_cron_array = @unserialize($row2['option_value']);

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
    echo "  - 削除された: " . (($lms_push_count + $lms_longpoll_count) - ($new_lms_push_count + $new_lms_longpoll_count)) . " 件\n\n";

    echo "✅ クリーンアップ完了！\n";

    $mysqli->close();

} catch (Exception $e) {
    echo "❌ エラー: " . $e->getMessage() . "\n";
}

echo "</pre>\n";

// 自動削除オプション
if (isset($_GET['delete']) && $_GET['delete'] === 'yes') {
    @unlink(__FILE__);
    echo "<p style='color: green;'>✅ このスクリプトを削除しました</p>\n";
} else {
    echo "<p><a href='?delete=yes' style='color: red; font-weight: bold;'>このスクリプトを削除する</a></p>\n";
}

echo "</body></html>";
