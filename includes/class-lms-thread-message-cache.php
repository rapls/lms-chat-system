<?php
/**
 * スレッドメッセージ専用高速キャッシュシステム
 * 
 * 特徴:
 * - 超高速メモリキャッシュ（TTL 5秒）
 * - 差分更新サポート
 * - バッチ取得最適化
 * - 自動クリーンアップ
 * 
 * @package LMS Theme
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Thread_Message_Cache
{
    private static $instance = null;
    
    /**
     * メモリキャッシュ（スレッドID => メッセージ配列）
     */
    private $memory_cache = [];
    
    /**
     * 最終更新時刻（スレッドID => timestamp）
     */
    private $last_updated = [];
    
    /**
     * キャッシュTTL（秒）
     */
    const CACHE_TTL = 5;
    
    /**
     * 最大キャッシュサイズ（スレッド数）
     */
    const MAX_THREADS = 100;
    
    /**
     * 統計情報
     */
    private $stats = [
        'hits' => 0,
        'misses' => 0,
        'sets' => 0,
        'evictions' => 0,
    ];
    
    /**
     * シングルトンインスタンス取得
     */
    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * コンストラクタ
     */
    private function __construct()
    {
        // シャットダウン時に統計を記録
        add_action('shutdown', [$this, 'log_stats']);
    }
    
    /**
     * スレッドメッセージの取得
     * 
     * @param int $thread_id スレッドID（親メッセージID）
     * @param int $since_message_id この ID より新しいメッセージのみ取得（差分更新）
     * @return array|null キャッシュヒット時はメッセージ配列、ミス時は null
     */
    public function get($thread_id, $since_message_id = 0)
    {
        $thread_id = (int) $thread_id;
        
        // キャッシュの有効性チェック
        if (!$this->is_cache_valid($thread_id)) {
            $this->stats['misses']++;
            return null;
        }
        
        $messages = $this->memory_cache[$thread_id] ?? null;
        
        if ($messages === null) {
            $this->stats['misses']++;
            return null;
        }
        
        $this->stats['hits']++;
        
        // 差分更新モード
        if ($since_message_id > 0) {
            return array_filter($messages, function($msg) use ($since_message_id) {
                return isset($msg['id']) && (int)$msg['id'] > $since_message_id;
            });
        }
        
        return $messages;
    }
    
    /**
     * スレッドメッセージの保存
     * 
     * @param int $thread_id スレッドID
     * @param array $messages メッセージ配列
     * @return bool
     */
    public function set($thread_id, $messages)
    {
        $thread_id = (int) $thread_id;
        
        // キャッシュサイズ制限チェック
        if (count($this->memory_cache) >= self::MAX_THREADS && !isset($this->memory_cache[$thread_id])) {
            $this->evict_oldest();
        }
        
        // メッセージIDでソート（最新が最後）
        usort($messages, function($a, $b) {
            return ((int)$a['id']) - ((int)$b['id']);
        });
        
        $this->memory_cache[$thread_id] = $messages;
        $this->last_updated[$thread_id] = time();
        $this->stats['sets']++;
        
        return true;
    }
    
    /**
     * 単一メッセージの追加（差分更新用）
     * 
     * @param int $thread_id スレッドID
     * @param array $message メッセージデータ
     * @return bool
     */
    public function add_message($thread_id, $message)
    {
        $thread_id = (int) $thread_id;
        
        if (!isset($this->memory_cache[$thread_id])) {
            // キャッシュが存在しない場合は新規作成
            $this->set($thread_id, [$message]);
            return true;
        }
        
        // 重複チェック
        $message_id = (int) $message['id'];
        foreach ($this->memory_cache[$thread_id] as $existing) {
            if ((int)$existing['id'] === $message_id) {
                return false; // 既に存在
            }
        }
        
        // メッセージを追加
        $this->memory_cache[$thread_id][] = $message;
        $this->last_updated[$thread_id] = time();
        
        // ソート（最新が最後）
        usort($this->memory_cache[$thread_id], function($a, $b) {
            return ((int)$a['id']) - ((int)$b['id']);
        });
        
        return true;
    }
    
    /**
     * メッセージの削除
     * 
     * @param int $thread_id スレッドID
     * @param int $message_id 削除するメッセージID
     * @return bool
     */
    public function remove_message($thread_id, $message_id)
    {
        $thread_id = (int) $thread_id;
        $message_id = (int) $message_id;
        
        if (!isset($this->memory_cache[$thread_id])) {
            return false;
        }
        
        $original_count = count($this->memory_cache[$thread_id]);
        
        $this->memory_cache[$thread_id] = array_filter(
            $this->memory_cache[$thread_id],
            function($msg) use ($message_id) {
                return (int)$msg['id'] !== $message_id;
            }
        );
        
        // インデックスを再構築
        $this->memory_cache[$thread_id] = array_values($this->memory_cache[$thread_id]);
        
        if (count($this->memory_cache[$thread_id]) < $original_count) {
            $this->last_updated[$thread_id] = time();
            return true;
        }
        
        return false;
    }
    
    /**
     * スレッド全体のキャッシュを無効化
     * 
     * @param int $thread_id スレッドID
     * @return bool
     */
    public function invalidate($thread_id)
    {
        $thread_id = (int) $thread_id;
        
        unset($this->memory_cache[$thread_id]);
        unset($this->last_updated[$thread_id]);
        
        return true;
    }
    
    /**
     * 全キャッシュをクリア
     */
    public function clear_all()
    {
        $this->memory_cache = [];
        $this->last_updated = [];
    }
    
    /**
     * キャッシュの有効性チェック
     * 
     * @param int $thread_id スレッドID
     * @return bool
     */
    private function is_cache_valid($thread_id)
    {
        if (!isset($this->last_updated[$thread_id])) {
            return false;
        }
        
        $age = time() - $this->last_updated[$thread_id];
        return $age <= self::CACHE_TTL;
    }
    
    /**
     * 最も古いキャッシュを削除
     */
    private function evict_oldest()
    {
        if (empty($this->last_updated)) {
            return;
        }
        
        $oldest_thread = null;
        $oldest_time = PHP_INT_MAX;
        
        foreach ($this->last_updated as $thread_id => $time) {
            if ($time < $oldest_time) {
                $oldest_time = $time;
                $oldest_thread = $thread_id;
            }
        }
        
        if ($oldest_thread !== null) {
            unset($this->memory_cache[$oldest_thread]);
            unset($this->last_updated[$oldest_thread]);
            $this->stats['evictions']++;
        }
    }
    
    /**
     * 統計情報の記録
     */
    public function log_stats()
    {
        $hit_rate = $this->stats['hits'] + $this->stats['misses'] > 0
            ? round(($this->stats['hits'] / ($this->stats['hits'] + $this->stats['misses'])) * 100, 2)
            : 0;
        
        $memory_usage = 0;
        foreach ($this->memory_cache as $messages) {
            $memory_usage += strlen(serialize($messages));
        }
        
        // WP_DEBUGが有効な場合のみログ出力
        if (defined('WP_DEBUG') && WP_DEBUG && defined('WP_DEBUG_LOG') && WP_DEBUG_LOG) {
            error_log(sprintf(
                '[LMS Thread Cache] Hits: %d, Misses: %d, Hit Rate: %s%%, Sets: %d, Evictions: %d, Memory: %s',
                $this->stats['hits'],
                $this->stats['misses'],
                $hit_rate,
                $this->stats['sets'],
                $this->stats['evictions'],
                size_format($memory_usage)
            ));
        }
    }
    
    /**
     * 統計情報を取得
     * 
     * @return array
     */
    public function get_stats()
    {
        $hit_rate = $this->stats['hits'] + $this->stats['misses'] > 0
            ? round(($this->stats['hits'] / ($this->stats['hits'] + $this->stats['misses'])) * 100, 2)
            : 0;
        
        $memory_usage = 0;
        foreach ($this->memory_cache as $messages) {
            $memory_usage += strlen(serialize($messages));
        }
        
        return array_merge($this->stats, [
            'hit_rate' => $hit_rate,
            'memory_usage' => $memory_usage,
            'cached_threads' => count($this->memory_cache),
        ]);
    }
}
