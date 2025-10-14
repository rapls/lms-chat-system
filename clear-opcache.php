<?php
/**
 * OPcache クリアスクリプト
 */

header('Content-Type: text/html; charset=UTF-8');

echo "<!DOCTYPE html>\n";
echo "<html><head><meta charset='UTF-8'><title>OPcache クリア</title></head><body>\n";
echo "<h1>🔧 OPcache クリーンアップ</h1>\n";
echo "<pre>\n";

if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "✅ OPcache がクリアされました\n\n";
    } else {
        echo "❌ OPcache のクリアに失敗しました\n\n";
    }

    $status = opcache_get_status();
    if ($status) {
        echo "OPcache 情報:\n";
        echo "  - 有効: " . ($status['opcache_enabled'] ? 'はい' : 'いいえ') . "\n";
        echo "  - キャッシュフル: " . ($status['cache_full'] ? 'はい' : 'いいえ') . "\n";
        echo "  - ヒット数: " . number_format($status['opcache_statistics']['hits']) . "\n";
        echo "  - ミス数: " . number_format($status['opcache_statistics']['misses']) . "\n";
    }
} else {
    echo "⚠️ OPcache が有効になっていません\n";
}

echo "\n✅ 完了しました\n";
echo "</pre>\n";

// 自動削除オプション
if (isset($_GET['delete']) && $_GET['delete'] === 'yes') {
    @unlink(__FILE__);
    echo "<p style='color: green;'>✅ このスクリプトを削除しました</p>\n";
} else {
    echo "<p><a href='?delete=yes' style='color: red; font-weight: bold;'>このスクリプトを削除する</a></p>\n";
}

echo "</body></html>";
