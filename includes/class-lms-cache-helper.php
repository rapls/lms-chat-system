<?php

/**
 * キャッシュ操作を安全に行うためのヘルパークラス
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
	exit;
}

/**
 * LMSキャッシュヘルパークラス
 * WordPressのオブジェクトキャッシュ操作を安全に行うための共通関数を提供します
 */
class LMS_Cache_Helper
{
	/**
	 * シングルトンインスタンス
	 *
	 * @var LMS_Cache_Helper
	 */
	private static $instance = null;

	/**
	 * デフォルトのキャッシュグループ
	 *
	 * @var string
	 */
	private $default_group = 'lms_chat';
	
	/**
	 * 高機能キャッシュインスタンス
	 *
	 * @var LMS_Advanced_Cache
	 */
	private $advanced_cache = null;
	
	/**
	 * 下位互換性のためのプレフィックス
	 *
	 * @var string
	 */
	private $cache_prefix = 'lms_chat_';
	
	/**
	 * デフォルト有効期限
	 *
	 * @var int
	 */
	private $default_expiration = 300;
	
	/**
	 * 高機能キャッシュ使用フラグ
	 *
	 * @var bool
	 */
	private $use_advanced_cache = true;

	/**
	 * コンストラクタ
	 */
	private function __construct()
	{
		$this->init_advanced_cache();
	}
	
	/**
	 * シングルトンパターンを使用してインスタンスを取得
	 *
	 * @return LMS_Cache_Helper インスタンス
	 */
	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}
	
	/**
	 * 高機能キャッシュの初期化
	 */
	private function init_advanced_cache()
	{
		if (class_exists('LMS_Advanced_Cache')) {
			$this->advanced_cache = LMS_Advanced_Cache::get_instance();
			$this->use_advanced_cache = true;
		} else {
			$this->use_advanced_cache = false;
		}
	}

	/**
	 * すべてのキャッシュをクリア
	 */
	public function clear_all_cache()
	{
		wp_cache_flush();
		
		if ($this->use_advanced_cache && $this->advanced_cache) {
			$this->advanced_cache->flush_all();
		}
		
		$cache_groups = array(
			'lms_chat',
			'lms_chat_messages',
			'lms_chat_channels',
			'lms_chat_threads',
			'lms_chat_unread'
		);
		
		foreach ($cache_groups as $group) {
			wp_cache_flush_group($group);
		}
		
		return true;
	}

	/**
	 * キャッシュキーが有効かどうかを検証する
	 *
	 * @param string $key キャッシュキー
	 * @param string $group キャッシュグループ
	 * @return bool キャッシュキーが有効かどうか
	 */
	public function is_valid_key($key, $group = null)
	{
		$group = $group ?: $this->default_group;

		if (empty($key)) {
			$caller = '';
			$trace_info = '';
			for ($i = 0; $i < count($backtrace) && $i < 10; $i++) {
				if (isset($backtrace[$i]['file']) && isset($backtrace[$i]['line'])) {
					$file = basename($backtrace[$i]['file']);
					$line = $backtrace[$i]['line'];
					$function = isset($backtrace[$i]['function']) ? $backtrace[$i]['function'] : '';
					$class = isset($backtrace[$i]['class']) ? $backtrace[$i]['class'] : '';
					$type = isset($backtrace[$i]['type']) ? $backtrace[$i]['type'] : '';

					if ($i === 0) {
						$caller = "{$file}:{$line}";
					}

					$trace_info .= "#{$i} {$file}({$line})";
					if ($class) {
						$trace_info .= " {$class}{$type}{$function}()";
					} elseif ($function) {
						$trace_info .= " {$function}()";
					}
					$trace_info .= "\n";
				}
			}

			return false;
		}

		if (!preg_match('/^[a-zA-Z0-9_]+$/', $key)) {
			$caller = '';
			if (isset($backtrace[1]['file']) && isset($backtrace[1]['line'])) {
				$caller = basename($backtrace[1]['file']) . ':' . $backtrace[1]['line'];
			}
			return false;
		}

		return true;
	}

	/**
	 * 複数のパラメータから安全なキャッシュキーを生成する
	 *
	 * @param array $parts キャッシュキーの一部となる配列
	 * @param string $prefix キャッシュキーのプレフィックス
	 * @return string 生成されたキャッシュキー、または無効な場合は空文字列
	 */
	public function generate_key($parts, $prefix = '')
	{
		if (!is_array($parts)) {
			$type = gettype($parts);
			$caller = '';
			if (isset($bt[1]['file']) && isset($bt[1]['line'])) {
				$caller = basename($bt[1]['file']) . ':' . $bt[1]['line'];
			}

			if (defined('WP_DEBUG') && WP_DEBUG) {
				$trace_info = '';
				foreach ($bt as $i => $trace) {
					if (isset($trace['file']) && isset($trace['line'])) {
						$trace_info .= "#{$i} " . basename($trace['file']) . "(" . $trace['line'] . ") ";
						if (isset($trace['function'])) {
							$trace_info .= (isset($trace['class']) ? $trace['class'] . $trace['type'] : '') . $trace['function'] . "()";
						}
						$trace_info .= "\n";
					}
				}
			}

			$emergency_key = !empty($prefix) ? $prefix . '_emergency_' . substr(md5(microtime()), 0, 8) : 'emergency_non_array_' . substr(md5(microtime()), 0, 8);
			return $emergency_key;
		}

		if (empty($parts)) {
			$caller = (isset($bt[1]['file']) && isset($bt[1]['line'])) ? basename($bt[1]['file']) . ':' . $bt[1]['line'] : 'unknown';
			$emergency_key = !empty($prefix) ? $prefix . '_empty_parts_' . substr(md5(microtime()), 0, 8) : 'emergency_empty_parts_' . substr(md5(microtime()), 0, 8);
			return $emergency_key;
		}

		$valid_parts = [];
		foreach ($parts as $key => $part) {
			if (empty($part) && $part !== 0 && $part !== '0') {
				$caller = '';
				if (isset($bt[1]['file']) && isset($bt[1]['line'])) {
					$caller = basename($bt[1]['file']) . ':' . $bt[1]['line'];
				}
				continue;
			}
			$valid_parts[] = $part;
		}

		if (empty($valid_parts)) {
			$emergency_key = !empty($prefix) ? $prefix . '_no_valid_parts_' . substr(md5(microtime()), 0, 8) : 'emergency_no_valid_parts_' . substr(md5(microtime()), 0, 8);
			return $emergency_key;
		}

		$key = $prefix ? $prefix . '_' : '';
		$key .= implode('_', array_map(function ($part) {
			if (!is_scalar($part)) {
				return md5(serialize($part));
			}
			return (string)$part;
		}, $valid_parts));

		$key = preg_replace('/[^a-zA-Z0-9_]/', '', $key);

		if (strlen($key) > 40) {
			$key = substr($prefix, 0, 10) . '_' . md5($key);
		}

		if (empty($key)) {
			$caller = '';
			if (isset($bt[1]['file']) && isset($bt[1]['line'])) {
				$caller = basename($bt[1]['file']) . ':' . $bt[1]['line'];
			}

			$emergency_key = 'emergency_' . substr(md5(microtime()), 0, 12);
			return $emergency_key;
		}

		if (!$this->is_valid_key($key)) {
			$emergency_key = 'validated_emergency_' . substr(md5(microtime()), 0, 8);
			return $emergency_key;
		}

		return $key;
	}

	/**
	 * メッセージIDからキャッシュキーを生成
	 *
	 * @param int $message_id メッセージID
	 * @param string $type キーのタイプ（reactions, attachments など）
	 * @return string 生成されたキャッシュキー
	 */
	public function generate_message_key($message_id, $type = 'data')
	{
		if (empty($message_id)) {
			return 'emergency_message_' . substr(md5(microtime()), 0, 8);
		}
		return $this->generate_key([$message_id], "lms_chat_{$type}");
	}

	/**
	 * 複数のIDからハッシュを使用してキャッシュキーを生成
	 *
	 * @param array $ids IDの配列
	 * @param string $prefix キーのプレフィックス
	 * @param int $user_id オプションのユーザーID
	 * @return string 生成されたキャッシュキー
	 */
	public function generate_hash_key($ids, $prefix, $user_id = 0)
	{
		if (empty($ids)) {
			return !empty($prefix) ? $prefix . '_no_valid_ids_' . substr(md5(microtime()), 0, 8) : 'emergency_no_valid_ids_' . substr(md5(microtime()), 0, 8);
		}
		$hash = md5(implode(',', $ids));
		$parts = [$hash];
		if (!empty($user_id)) {
			$parts[] = $user_id;
		}
		return $this->generate_key($parts, $prefix);
	}

	/**
	 * キャッシュから安全に値を取得する
	 *
	 * @param string $key キャッシュキー
	 * @param string $group キャッシュグループ
	 * @return mixed キャッシュの値、または存在しない場合はfalse
	 */
	public function get($key, $group = null)
	{
		$group = $group ?: $this->default_group;

		if (empty($key)) {
			if (defined('WP_DEBUG') && WP_DEBUG) {
				$caller = isset($bt[1]['file']) ? basename($bt[1]['file']) . ':' . $bt[1]['line'] : 'unknown';
			}
			return false;
		}

		if (!$this->is_valid_key($key, $group)) {
			return false;
		}

		if ($this->use_advanced_cache && $this->advanced_cache) {
			$cache_key = $this->build_cache_key($key, $group);
			return $this->advanced_cache->get($cache_key, false, [
				'type' => $this->map_group_to_type($group),
				'prefetch' => true,
			]);
		}

		try {
			$sanitized_key = $this->sanitize_key($key);
			if (empty($sanitized_key)) {
				return false;
			}
			if ($sanitized_key !== $key) {
			}
			return wp_cache_get($sanitized_key, $group);
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * キャッシュに安全に値を設定する
	 *
	 * @param string $key キャッシュキー
	 * @param mixed $value 保存する値
	 * @param string $group キャッシュグループ
	 * @param int $expiration 有効期限（秒）
	 * @return bool 成功した場合はtrue、それ以外はfalse
	 */
	public function set($key, $value, $group = null, $expiration = 0)
	{
		$group = $group ?: $this->default_group;
		$expiration = $expiration ?: $this->default_expiration;

		if (empty($key)) {
			if (defined('WP_DEBUG') && WP_DEBUG) {
				$caller = isset($bt[1]['file']) ? basename($bt[1]['file']) . ':' . $bt[1]['line'] : 'unknown';
			}
			return false;
		}

		if (!$this->is_valid_key($key, $group)) {
			return false;
		}

		if ($this->use_advanced_cache && $this->advanced_cache) {
			$cache_key = $this->build_cache_key($key, $group);
			return $this->advanced_cache->set($cache_key, $value, $expiration, [
				'type' => $this->map_group_to_type($group),
				'compress' => $this->should_compress($value),
				'writeback' => $this->should_use_writeback($group),
			]);
		}

		try {
			$sanitized_key = $this->sanitize_key($key);
			if (empty($sanitized_key)) {
				return false;
			}
			if ($sanitized_key !== $key) {
			}
			return wp_cache_set($sanitized_key, $value, $group, $expiration);
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * キャッシュから安全に値を削除する
	 *
	 * @param string $key キャッシュキー
	 * @param string $group キャッシュグループ
	 * @return bool 成功した場合はtrue、それ以外はfalse
	 */
	public function delete($key, $group = null)
	{
		$group = $group ?: $this->default_group;

		if (empty($key)) {
			if (defined('WP_DEBUG') && WP_DEBUG) {
				$caller = isset($bt[1]['file']) ? basename($bt[1]['file']) . ':' . $bt[1]['line'] : 'unknown';
			}
			return false;
		}

		if (!$this->is_valid_key($key, $group)) {
			return false;
		}

		if ($this->use_advanced_cache && $this->advanced_cache) {
			$cache_key = $this->build_cache_key($key, $group);
			return $this->advanced_cache->delete($cache_key, [
				'cascade' => true,
				'pattern' => false,
			]);
		}

		try {
			$sanitized_key = $this->sanitize_key($key);
			if (empty($sanitized_key)) {
				return false;
			}
			if ($sanitized_key !== $key) {
			}
			return wp_cache_delete($sanitized_key, $group);
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * キャッシュに値を追加する（キーが存在しない場合のみ）
	 *
	 * @param string $key キャッシュキー
	 * @param mixed $value 保存する値
	 * @param string $group キャッシュグループ
	 * @param int $expiration 有効期限（秒）
	 * @return bool 成功した場合はtrue、それ以外はfalse
	 */
	public function add($key, $value, $group = null, $expiration = 0)
	{
		$group = $group ?: $this->default_group;

		if (empty($key)) {
			if (defined('WP_DEBUG') && WP_DEBUG) {
				$caller = isset($backtrace[1]) ? $backtrace[1] : array();
				$caller_file = isset($caller['file']) ? $caller['file'] : 'unknown';
				$caller_line = isset($caller['line']) ? $caller['line'] : 'unknown';
			}
			return false;
		}

		if (!$this->is_valid_key($key, $group)) {
			$caller = isset($backtrace[1]) ? $backtrace[1] : array();
			$caller_file = isset($caller['file']) ? $caller['file'] : 'unknown';
			$caller_line = isset($caller['line']) ? $caller['line'] : 'unknown';
			return false;
		}

		try {
			$sanitized_key = $this->sanitize_key($key);
			if (empty($sanitized_key)) {
				return false;
			}
			if ($sanitized_key !== $key) {
			}
			return wp_cache_add($sanitized_key, $value, $group, $expiration);
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * キャッシュキーをサニタイズして必ず有効なものにする
	 *
	 * @param string $key キャッシュキー
	 * @return string サニタイズされたキー
	 */
	private function sanitize_key($key)
	{
		if (empty($key) || !is_scalar($key) || (is_string($key) && trim($key) === '')) {
			$emergency_key = 'emergency_key_' . substr(md5(microtime(true)), 0, 10);
			return $emergency_key;
		}

		if (!is_string($key)) {
			$key = (string)$key;
		}

		$sanitized = preg_replace('/[^a-zA-Z0-9_]/', '', $key);

		if (empty($sanitized)) {
			$sanitized = 'sanitized_' . substr(md5($key . microtime(true)), 0, 12);
		}

		return $sanitized;
	}

	/**
	 * デバッグ用のキャッシュ追加メソッド
	 * エラーの特定と診断に使用
	 *
	 * @param string $key キャッシュキー
	 * @param mixed $value 保存する値
	 * @param string $group キャッシュグループ
	 * @param int $expiration 有効期限（秒）
	 * @return bool 成功した場合はtrue、それ以外はfalse
	 */
	public function debugging_add($key, $value, $group = null, $expiration = 0)
	{
		$group = $group ?: $this->default_group;
		$result = false;

		try {
			$result = $this->add($key, $value, $group, $expiration);
		} catch (Exception $e) {
		}

		return $result;
	}

	/**
	 * デバッグ用のキャッシュ設定メソッド
	 *
	 * @param string $key キャッシュキー
	 * @param mixed $value 保存する値
	 * @param string $group キャッシュグループ
	 * @param int $expiration 有効期限（秒）
	 * @return bool 成功した場合はtrue、それ以外はfalse
	 */
	public function debugging_set($key, $value, $group = null, $expiration = 0)
	{
		$group = $group ?: $this->default_group;

		try {
			$result = $this->set($key, $value, $group, $expiration);
			return $result;
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * デバッグ用のキャッシュ取得メソッド
	 *
	 * @param string $key キャッシュキー
	 * @param string $group キャッシュグループ
	 * @return mixed キャッシュの値、または存在しない場合はfalse
	 */
	public function debugging_get($key, $group = null)
	{
		$group = $group ?: $this->default_group;

		try {
			$result = $this->get($key, $group);
			$found = ($result !== false);
			return $result;
		} catch (Exception $e) {
			return false;
		}
	}

	/**
	 * デバッグ用のキャッシュ削除メソッド
	 *
	 * @param string $key キャッシュキー
	 * @param string $group キャッシュグループ
	 * @return bool 成功した場合はtrue、それ以外はfalse
	 */
	public function debugging_delete($key, $group = null)
	{
		$group = $group ?: $this->default_group;

		try {
			$result = $this->delete($key, $group);
			return $result;
		} catch (Exception $e) {
			return false;
		}
	}
	
	/**
	 * グループをキャッシュタイプにマップ
	 */
	private function map_group_to_type($group)
	{
		$type_mapping = [
			'lms_chat' => 'temporary',
			'lms_chat_messages' => 'persistent',
			'lms_chat_channels' => 'persistent',
			'lms_chat_threads' => 'persistent',
			'lms_chat_unread' => 'session',
			'lms_users' => 'user',
		];
		
		return $type_mapping[$group] ?? 'temporary';
	}
	
	/**
	 * キャッシュキーを構築
	 */
	private function build_cache_key($key, $group)
	{
		return $this->cache_prefix . $group . '_' . $key;
	}
	
	/**
	 * 圧縮すべきか判定
	 */
	private function should_compress($value)
	{
		$serialized_size = strlen(serialize($value));
		return $serialized_size > 1024; // 1KB以上で圧縮
	}
	
	/**
	 * ライトバックを使用すべきか判定
	 */
	private function should_use_writeback($group)
	{
		$writeback_groups = [
			'lms_chat_messages',
			'lms_chat_threads',
			'lms_users',
		];
		
		return in_array($group, $writeback_groups);
	}
	
	/**
	 * 多層キャッシュの統計情報取得
	 */
	public function get_advanced_stats()
	{
		if ($this->use_advanced_cache && $this->advanced_cache) {
			return $this->advanced_cache->get_stats();
		}
		
		return [
			'status' => 'legacy_cache_only',
			'message' => 'Advanced cache not available'
		];
	}
	
	/**
	 * パターンマッチ削除
	 */
	public function delete_pattern($pattern, $group = null)
	{
		$group = $group ?: $this->default_group;
		
		if ($this->use_advanced_cache && $this->advanced_cache) {
			$cache_pattern = $this->build_cache_key($pattern, $group);
			return $this->advanced_cache->delete($cache_pattern, [
				'pattern' => true,
				'cascade' => true,
			]);
		}
		
		return false;
	}
	
	/**
	 * 多層キャッシュの全クリア
	 */
	public function flush_advanced_cache()
	{
		if ($this->use_advanced_cache && $this->advanced_cache) {
			return $this->advanced_cache->flush_all();
		}
		
		return $this->clear_all_cache();
	}
}
