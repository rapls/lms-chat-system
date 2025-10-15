<?php
/**
 * APCuキャッシュクリアスクリプト
 * 
 * 使用方法:
 * - ブラウザで直接アクセス: https://yoursite.com/wp-content/themes/lms/apcu-clear-cache.php
 * - コマンドライン: php apcu-clear-cache.php
 * 
 * セキュリティ: 
 * - 使用後は必ずこのファイルを削除するか、認証を追加してください
 */

// セキュリティキー（変更してください）
define('CACHE_CLEAR_KEY', 'your-secret-key-here');

// キーの確認
if (!isset($_GET['key']) || $_GET['key'] !== CACHE_CLEAR_KEY) {
	http_response_code(403);
	die('Access denied. Invalid key.');
}

// WordPressを読み込み
require_once(__DIR__ . '/../../../wp-load.php');

// 管理者権限チェック（WordPressにログインしている場合）
if (function_exists('current_user_can') && !current_user_can('manage_options')) {
	http_response_code(403);
	die('Access denied. Administrator only.');
}

?>
<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>APCu Cache Clear</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			max-width: 800px;
			margin: 50px auto;
			padding: 20px;
			background: #f5f5f5;
		}
		.container {
			background: white;
			padding: 30px;
			border-radius: 8px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
		}
		h1 {
			color: #333;
			border-bottom: 3px solid #0066ff;
			padding-bottom: 10px;
		}
		.success {
			background: #d4edda;
			color: #155724;
			padding: 15px;
			border-radius: 4px;
			margin: 20px 0;
			border-left: 4px solid #28a745;
		}
		.info {
			background: #d1ecf1;
			color: #0c5460;
			padding: 15px;
			border-radius: 4px;
			margin: 20px 0;
			border-left: 4px solid #17a2b8;
		}
		.stats {
			background: #f8f9fa;
			padding: 15px;
			border-radius: 4px;
			margin: 20px 0;
		}
		.stats table {
			width: 100%;
			border-collapse: collapse;
		}
		.stats td {
			padding: 8px;
			border-bottom: 1px solid #dee2e6;
		}
		.stats td:first-child {
			font-weight: bold;
			width: 200px;
		}
		.button {
			display: inline-block;
			background: #0066ff;
			color: white;
			padding: 10px 20px;
			text-decoration: none;
			border-radius: 4px;
			margin-top: 20px;
		}
		.button:hover {
			background: #0052cc;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>🗑️ APCu Cache Clear</h1>

		<?php
		// キャッシュクリア実行
		if (isset($_GET['action']) && $_GET['action'] === 'clear') {
			// WordPressキャッシュをクリア
			if (function_exists('wp_cache_flush')) {
				wp_cache_flush();
				echo '<div class="success">✅ WordPress object cache cleared successfully!</div>';
			}
			
			// APCu全体をクリア
			if (function_exists('apcu_clear_cache')) {
				apcu_clear_cache();
				echo '<div class="success">✅ APCu cache cleared successfully!</div>';
			}
			
			echo '<div class="info">キャッシュがクリアされました。ページのパフォーマンスが一時的に低下する可能性がありますが、すぐに回復します。</div>';
		}
		?>

		<h2>📊 APCu Status</h2>
		<div class="stats">
			<table>
				<?php
				if (function_exists('apcu_cache_info')) {
					$info = apcu_cache_info(true);
					
					echo '<tr><td>APCu Version:</td><td>' . phpversion('apcu') . '</td></tr>';
					echo '<tr><td>Enabled:</td><td>' . (ini_get('apc.enabled') ? '✅ Yes' : '❌ No') . '</td></tr>';
					
					if ($info) {
						echo '<tr><td>Memory Size:</td><td>' . size_format($info['mem_size']) . '</td></tr>';
						echo '<tr><td>Cached Entries:</td><td>' . number_format($info['num_entries']) . '</td></tr>';
						echo '<tr><td>Cache Hits:</td><td>' . number_format($info['num_hits']) . '</td></tr>';
						echo '<tr><td>Cache Misses:</td><td>' . number_format($info['num_misses']) . '</td></tr>';
						
						if ($info['num_hits'] + $info['num_misses'] > 0) {
							$hit_rate = ($info['num_hits'] / ($info['num_hits'] + $info['num_misses'])) * 100;
							echo '<tr><td>Hit Rate:</td><td>' . number_format($hit_rate, 2) . '%</td></tr>';
						}
						
						echo '<tr><td>Start Time:</td><td>' . date('Y-m-d H:i:s', $info['start_time']) . '</td></tr>';
					}
				} else {
					echo '<tr><td colspan="2">❌ APCu is not available</td></tr>';
				}
				
				// Object Cache情報
				if (isset($GLOBALS['wp_object_cache'])) {
					echo '<tr><td>Object Cache:</td><td>✅ Active (APCu)</td></tr>';
					
					$cache = $GLOBALS['wp_object_cache'];
					if (isset($cache->cache_hits) && isset($cache->cache_misses)) {
						echo '<tr><td>Request Hits:</td><td>' . number_format($cache->cache_hits) . '</td></tr>';
						echo '<tr><td>Request Misses:</td><td>' . number_format($cache->cache_misses) . '</td></tr>';
						
						if ($cache->cache_hits + $cache->cache_misses > 0) {
							$request_hit_rate = ($cache->cache_hits / ($cache->cache_hits + $cache->cache_misses)) * 100;
							echo '<tr><td>Request Hit Rate:</td><td>' . number_format($request_hit_rate, 2) . '%</td></tr>';
						}
					}
				} else {
					echo '<tr><td>Object Cache:</td><td>❌ Not active</td></tr>';
				}
				?>
			</table>
		</div>

		<?php if (!isset($_GET['action'])): ?>
		<a href="?key=<?php echo urlencode(CACHE_CLEAR_KEY); ?>&action=clear" class="button">🗑️ Clear All Cache</a>
		<?php else: ?>
		<a href="?key=<?php echo urlencode(CACHE_CLEAR_KEY); ?>" class="button">🔄 Refresh Status</a>
		<?php endif; ?>

		<div class="info" style="margin-top: 30px;">
			<strong>⚠️ セキュリティ警告:</strong><br>
			このファイルは管理用です。使用後は必ず削除するか、CACHE_CLEAR_KEYを変更してください。
		</div>
	</div>
</body>
</html>
