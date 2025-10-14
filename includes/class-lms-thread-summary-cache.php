<?php
/**
 * スレッドサマリーキャッシュクラス
 * サーバー負荷を最小限に抑えながらスレッド情報を効率的に管理
 *
 * @package LMS
 * @since 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Class LMS_Thread_Summary_Cache
 */
class LMS_Thread_Summary_Cache {
    
    /**
     * シングルトンインスタンス
     * @var LMS_Thread_Summary_Cache
     */
    private static $instance = null;
    
    /**
     * キャッシュヘルパー
     * @var LMS_Cache_Helper
     */
    private $cache_helper;
    
    /**
     * アドバンスドキャッシュ
     * @var LMS_Advanced_Cache
     */
    private $advanced_cache;
    
    /**
     * ホットキー追跡
     * @var array
     */
    private $hot_keys = [];
    
    /**
     * ホットキー閾値（アクセス回数）
     * @var int
     */
    private $hot_threshold = 5;
    
    /**
     * バッチ処理用の保留サマリー
     * @var array
     */
    private $pending_summaries = [];
    
    /**
     * 最後のフラッシュ時刻
     * @var float
     */
    private $last_flush_time = 0;
    
    /**
     * デバウンス時間（秒）
     * @var float
     */
    private $debounce_interval = 0.1;
    
    /**
     * コンストラクタ
     */
    private function __construct() {
        // 既存のキャッシュシステムを利用
        if (class_exists('LMS_Cache_Helper')) {
            $this->cache_helper = LMS_Cache_Helper::get_instance();
        }
        if (class_exists('LMS_Advanced_Cache')) {
            $this->advanced_cache = LMS_Advanced_Cache::get_instance();
        }
        
        // フックの登録
        add_action('lms_chat_thread_message_sent', array($this, 'invalidate_parent_cache'), 10, 2);
        add_action('lms_chat_thread_message_deleted', array($this, 'invalidate_parent_cache'), 10, 2);
        add_action('shutdown', array($this, 'flush_pending_summaries'));
    }
    
    /**
     * インスタンス取得
     * @return LMS_Thread_Summary_Cache
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * スレッドサマリー取得（キャッシュファースト）
     * 
     * @param int $parent_message_id 親メッセージID
     * @param int $channel_id チャンネルID
     * @param int $user_id ユーザーID（未読計算用）
     * @return array サマリーデータ
     */
    public function get_summary($parent_message_id, $channel_id, $user_id = 0) {
        try {
            $cache_key = $this->generate_cache_key($parent_message_id, $channel_id);
            
            // アクセス回数を記録（ホットキー判定用）
            $this->track_access($cache_key);
            
            // 1. メモリキャッシュ確認
            if ($this->advanced_cache) {
                $cached = $this->advanced_cache->get($cache_key, 'thread_summary');
                if ($cached !== false) {
                    // ユーザー別の未読数を追加
                    if ($user_id > 0) {
                        $cached['unread'] = $this->get_unread_count($parent_message_id, $user_id);
                    }
                    return $cached;
                }
            } elseif ($this->cache_helper) {
                $cached = $this->cache_helper->get($cache_key, 'thread_summary');
                if ($cached !== false) {
                    if ($user_id > 0) {
                        $cached['unread'] = $this->get_unread_count($parent_message_id, $user_id);
                    }
                    return $cached;
                }
            }
            
            // 2. データベースから最小限のクエリで取得
            $summary = $this->calculate_minimal_summary($parent_message_id, $channel_id, $user_id);
            
            // 3. キャッシュに保存（ホットデータは長めにキャッシュ）
            $ttl = $this->is_hot($cache_key) ? 90 : 30;
            $this->set_cache($cache_key, $summary, $ttl);
            
            return $summary;
            
        } catch (Exception $e) {
            // エラー時は空のサマリーを返す（システムが停止しないように）
            return $this->get_empty_summary();
        }
    }
    
    /**
     * バッチでサマリー取得（複数の親メッセージ）
     * 
     * @param array $parent_message_ids 親メッセージIDの配列
     * @param int $channel_id チャンネルID
     * @param int $user_id ユーザーID
     * @return array 親メッセージID => サマリーの連想配列
     */
    public function get_batch_summaries($parent_message_ids, $channel_id, $user_id = 0) {
        if (empty($parent_message_ids)) {
            return [];
        }
        
        $summaries = [];
        $uncached_ids = [];
        
        // まずキャッシュから取得を試みる
        foreach ($parent_message_ids as $parent_id) {
            $cache_key = $this->generate_cache_key($parent_id, $channel_id);
            $cached = $this->get_from_cache($cache_key);
            
            if ($cached !== false) {
                // キャッシュデータが配列形式であることを確認
                if (is_array($cached)) {
                    if ($user_id > 0) {
                        $cached['unread'] = $this->get_unread_count($parent_id, $user_id);
                    }
                    $summaries[$parent_id] = $cached;
                } else {
                    // キャッシュデータが不正な形式の場合は再取得対象に
                    $uncached_ids[] = $parent_id;
                }
            } else {
                $uncached_ids[] = $parent_id;
            }
        }
        
        // キャッシュにないものはバッチでデータベースから取得
        if (!empty($uncached_ids)) {
            $db_summaries = $this->calculate_batch_summaries($uncached_ids, $channel_id, $user_id);
            foreach ($db_summaries as $parent_id => $summary) {
                $summaries[$parent_id] = $summary;
                // キャッシュに保存
                $cache_key = $this->generate_cache_key($parent_id, $channel_id);
                $ttl = $this->is_hot($cache_key) ? 90 : 30;
                $this->set_cache($cache_key, $summary, $ttl);
            }
        }
        
        return $summaries;
    }
    
    /**
     * 最小限のクエリでサマリー計算
     * 
     * @param int $parent_message_id 親メッセージID
     * @param int $channel_id チャンネルID
     * @param int $user_id ユーザーID
     * @return array サマリーデータ
     */
    private function calculate_minimal_summary($parent_message_id, $channel_id, $user_id = 0) {
        global $wpdb;
        
        // 単一の最適化されたクエリで必要な情報を取得
        $result = $wpdb->get_row($wpdb->prepare(
            "SELECT 
                COUNT(*) as total,
                MAX(created_at) as latest_reply_time,
                GROUP_CONCAT(DISTINCT user_id ORDER BY created_at DESC LIMIT 3) as recent_users
            FROM {$wpdb->prefix}lms_chat_thread_messages
            WHERE parent_message_id = %d 
                AND deleted_at IS NULL",
            $parent_message_id
        ));
        
        if (!$result) {
            return $this->get_empty_summary();
        }
        
        // 最終返信の相対時間を計算
        $latest_reply = '';
        if ($result->latest_reply_time) {
            $timestamp = strtotime($result->latest_reply_time);
            $diff = time() - $timestamp;
            
            if ($diff < 60) {
                $latest_reply = 'たった今';
            } elseif ($diff < 3600) {
                $latest_reply = floor($diff / 60) . '分前';
            } elseif ($diff < 86400) {
                $latest_reply = floor($diff / 3600) . '時間前';
            } else {
                $latest_reply = floor($diff / 86400) . '日前';
            }
        }
        
        // アバター情報を取得（最新3人まで）
        $avatars = [];
        if ($result->recent_users) {
            $user_ids = array_slice(explode(',', $result->recent_users), 0, 3);
            foreach ($user_ids as $uid) {
                $user = get_userdata($uid);
                if ($user) {
                    $avatars[] = [
                        'user_id' => $uid,
                        'avatar' => get_avatar_url($uid, ['size' => 32]),
                        'name' => $user->display_name
                    ];
                }
            }
        }
        
        // 未読数を計算（必要な場合のみ）
        $unread = 0;
        if ($user_id > 0) {
            $unread = $this->get_unread_count($parent_message_id, $user_id);
        }
        
        return [
            'parent_message_id' => $parent_message_id,
            'total' => intval($result->total),
            'unread' => $unread,
            'latest_reply' => $latest_reply,
            'latest_reply_time' => $result->latest_reply_time,
            'avatars' => $avatars,
            'timestamp' => time(),
            'version' => $this->get_version()
        ];
    }
    
    /**
     * バッチでサマリー計算
     * 
     * @param array $parent_message_ids 親メッセージIDの配列
     * @param int $channel_id チャンネルID
     * @param int $user_id ユーザーID
     * @return array サマリーデータの配列
     */
    private function calculate_batch_summaries($parent_message_ids, $channel_id, $user_id = 0) {
        global $wpdb;
        
        if (empty($parent_message_ids)) {
            return [];
        }
        
        $placeholders = implode(',', array_fill(0, count($parent_message_ids), '%d'));
        
        // 一括クエリで全親メッセージのサマリーを取得
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT 
                parent_message_id,
                COUNT(*) as total,
                MAX(created_at) as latest_reply_time,
                GROUP_CONCAT(DISTINCT user_id ORDER BY created_at DESC SEPARATOR ',') as recent_users
            FROM {$wpdb->prefix}lms_chat_thread_messages
            WHERE parent_message_id IN ($placeholders) 
                AND deleted_at IS NULL
            GROUP BY parent_message_id",
            $parent_message_ids
        ), OBJECT_K);
        
        $summaries = [];
        foreach ($parent_message_ids as $parent_id) {
            if (isset($results[$parent_id])) {
                $result = $results[$parent_id];
                
                // 最終返信の相対時間を計算
                $latest_reply = '';
                if ($result->latest_reply_time) {
                    $timestamp = strtotime($result->latest_reply_time);
                    $diff = time() - $timestamp;
                    
                    if ($diff < 60) {
                        $latest_reply = 'たった今';
                    } elseif ($diff < 3600) {
                        $latest_reply = floor($diff / 60) . '分前';
                    } elseif ($diff < 86400) {
                        $latest_reply = floor($diff / 3600) . '時間前';
                    } else {
                        $latest_reply = floor($diff / 86400) . '日前';
                    }
                }
                
                // アバター情報
                $avatars = [];
                if ($result->recent_users) {
                    $user_ids = array_slice(explode(',', $result->recent_users), 0, 3);
                    foreach ($user_ids as $uid) {
                        $user = get_userdata($uid);
                        if ($user) {
                            $avatars[] = [
                                'user_id' => $uid,
                                'avatar' => get_avatar_url($uid, ['size' => 32]),
                                'name' => $user->display_name
                            ];
                        }
                    }
                }
                
                $summaries[$parent_id] = [
                    'parent_message_id' => $parent_id,
                    'total' => intval($result->total),
                    'unread' => $user_id > 0 ? $this->get_unread_count($parent_id, $user_id) : 0,
                    'latest_reply' => $latest_reply,
                    'latest_reply_time' => $result->latest_reply_time,
                    'avatars' => $avatars,
                    'timestamp' => time(),
                    'version' => $this->get_version()
                ];
            } else {
                $summaries[$parent_id] = $this->get_empty_summary();
            }
        }
        
        return $summaries;
    }
    
    /**
     * 未読数取得（キャッシュ付き）
     * 
     * @param int $parent_message_id 親メッセージID
     * @param int $user_id ユーザーID
     * @return int 未読数
     */
    private function get_unread_count($parent_message_id, $user_id) {
        global $wpdb;
        
        $cache_key = "thread_unread_{$parent_message_id}_{$user_id}";
        
        // キャッシュ確認
        $cached = $this->get_from_cache($cache_key);
        if ($cached !== false) {
            return intval($cached);
        }
        
        // 未読数を計算
        $unread = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) 
            FROM {$wpdb->prefix}lms_chat_thread_messages t
            LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed lv 
                ON (t.parent_message_id = lv.parent_message_id AND lv.user_id = %d)
            WHERE t.parent_message_id = %d 
                AND t.user_id != %d
                AND (lv.last_viewed_at IS NULL OR t.created_at > lv.last_viewed_at)
                AND t.deleted_at IS NULL",
            $user_id, $parent_message_id, $user_id
        ));
        
        // キャッシュに保存（短めのTTL）
        $this->set_cache($cache_key, $unread, 15);
        
        return intval($unread);
    }
    
    /**
     * キャッシュキー生成
     * 
     * @param int $parent_message_id 親メッセージID
     * @param int $channel_id チャンネルID
     * @return string キャッシュキー
     */
    private function generate_cache_key($parent_message_id, $channel_id) {
        return "thread_summary:{$parent_message_id}:{$channel_id}";
    }
    
    /**
     * キャッシュから取得
     * 
     * @param string $cache_key キャッシュキー
     * @return mixed キャッシュデータまたはfalse
     */
    private function get_from_cache($cache_key) {
        $data = false;

        if ($this->advanced_cache) {
            $data = $this->advanced_cache->get($cache_key, 'thread_summary');
        } elseif ($this->cache_helper) {
            $data = $this->cache_helper->get($cache_key, 'thread_summary');
        } else {
            $data = wp_cache_get($cache_key, 'thread_summary');
        }

        // データが文字列の場合、JSON デシリアライゼーションを試行
        if (is_string($data) && !empty($data)) {
            $decoded = json_decode($data, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }
            // JSONでない場合はfalseを返して再取得させる
            return false;
        }

        return $data;
    }
    
    /**
     * キャッシュに設定
     * 
     * @param string $cache_key キャッシュキー
     * @param mixed $data データ
     * @param int $ttl 有効期限（秒）
     */
    private function set_cache($cache_key, $data, $ttl = 30) {
        // 配列データをJSON形式で保存（一貫性確保）
        $cache_data = is_array($data) ? $data : $data;

        if ($this->advanced_cache) {
            $this->advanced_cache->set($cache_key, $cache_data, 'thread_summary', $ttl);
        } elseif ($this->cache_helper) {
            $this->cache_helper->set($cache_key, $cache_data, 'thread_summary', $ttl);
        } else {
            wp_cache_set($cache_key, $cache_data, 'thread_summary', $ttl);
        }
    }
    
    /**
     * アクセス追跡（ホットキー判定用）
     * 
     * @param string $cache_key キャッシュキー
     */
    private function track_access($cache_key) {
        if (!isset($this->hot_keys[$cache_key])) {
            $this->hot_keys[$cache_key] = 0;
        }
        $this->hot_keys[$cache_key]++;
    }
    
    /**
     * ホットキー判定
     * 
     * @param string $cache_key キャッシュキー
     * @return bool ホットキーかどうか
     */
    private function is_hot($cache_key) {
        return isset($this->hot_keys[$cache_key]) && $this->hot_keys[$cache_key] >= $this->hot_threshold;
    }
    
    /**
     * 親メッセージのキャッシュ無効化
     * 
     * @param int $thread_message_id スレッドメッセージID
     * @param int $parent_message_id 親メッセージID
     */
    public function invalidate_parent_cache($thread_message_id, $parent_message_id) {
        // 親メッセージに関連するキャッシュをクリア
        $pattern = "thread_summary:{$parent_message_id}:*";
        
        if ($this->advanced_cache) {
            $this->advanced_cache->delete_pattern($pattern, 'thread_summary');
        } elseif ($this->cache_helper) {
            // パターンマッチング削除がない場合は個別に削除
            global $wpdb;
            $channels = $wpdb->get_col("SELECT DISTINCT id FROM {$wpdb->prefix}lms_chat_channels");
            foreach ($channels as $channel_id) {
                $cache_key = $this->generate_cache_key($parent_message_id, $channel_id);
                $this->cache_helper->delete($cache_key, 'thread_summary');
            }
        }
        
        // 未読キャッシュもクリア
        $unread_pattern = "thread_unread_{$parent_message_id}_*";
        wp_cache_delete($unread_pattern, 'thread_summary');
    }
    
    /**
     * イベント用サマリー追加（デバウンス付き）
     * 
     * @param int $parent_message_id 親メッセージID
     * @param int $channel_id チャンネルID
     */
    public function queue_summary_update($parent_message_id, $channel_id) {
        $this->pending_summaries[$parent_message_id] = [
            'channel_id' => $channel_id,
            'timestamp' => microtime(true)
        ];
        
        // デバウンス時間を超えていたら即座にフラッシュ
        if (microtime(true) - $this->last_flush_time > $this->debounce_interval) {
            $this->flush_pending_summaries();
        }
    }
    
    /**
     * 保留中のサマリーをフラッシュ
     */
    public function flush_pending_summaries() {
        if (empty($this->pending_summaries)) {
            return;
        }
        
        // 統合Long Pollingシステムにイベントを送信
        if (class_exists('LMS_Unified_LongPoll')) {
            $longpoll = LMS_Unified_LongPoll::get_instance();
            
            // バッチでサマリーを取得
            $parent_ids = array_keys($this->pending_summaries);
            $channel_id = reset($this->pending_summaries)['channel_id'];
            $summaries = $this->get_batch_summaries($parent_ids, $channel_id, get_current_user_id());
            
            // イベントとして送信
            foreach ($summaries as $parent_id => $summary) {
                $longpoll->add_event([
                    'type' => 'thread_summary_update',
                    'parent_message_id' => $parent_id,
                    'channel_id' => $channel_id,
                    'summary' => $summary,
                    'version' => $this->get_version()
                ]);
            }
        }
        
        $this->pending_summaries = [];
        $this->last_flush_time = microtime(true);
    }
    
    /**
     * 空のサマリーを取得
     * 
     * @return array 空のサマリーデータ
     */
    private function get_empty_summary() {
        return [
            'parent_message_id' => 0,
            'total' => 0,
            'unread' => 0,
            'latest_reply' => '',
            'latest_reply_time' => null,
            'avatars' => [],
            'timestamp' => time(),
            'version' => $this->get_version()
        ];
    }
    
    /**
     * バージョン番号取得
     * 
     * @return int バージョン番号
     */
    private function get_version() {
        static $version = null;
        if ($version === null) {
            $version = get_option('lms_thread_summary_version', 1);
        }
        return $version;
    }
    
    /**
     * バージョン番号をインクリメント
     * 
     * @return int 新しいバージョン番号
     */
    public function increment_version() {
        $version = $this->get_version() + 1;
        update_option('lms_thread_summary_version', $version);
        return $version;
    }
}

// インスタンス初期化
LMS_Thread_Summary_Cache::get_instance();