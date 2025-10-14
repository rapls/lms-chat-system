# LMSチャット同期速度・キャッシュ最適化 最終完璧計画 v4.0

**作成日**: 2025-01-10  
**最終更新**: v3.0 + MCP Codex分析統合版  
**目標**: メッセージ同期を絶対に壊さず、安全に同期速度を50-70%改善

---

## 🎯 v4.0の位置づけ

**v1.0**: 概念的な計画  
**v2.0**: 詳細な技術計画（メッセージ同期停止で失敗）  
**v3.0**: 失敗を教訓にした安全重視計画  
**v4.0**: **v3.0 + MCP Codex分析を統合した完璧な実装計画**

---

## 📊 MCP Codex分析からの主要な追加知見

### 1. 前回失敗の根本原因の明確化

**MCP Codexの発見**:
```php
// 問題の本質
do_action('lms_chat_message_created', ...) が発火する前に
LMS_Unified_LongPoll がインスタンス化されず、
フックが未登録状態となった
```

**タイミング図**:
```
修正前（動作OK）:
1. LMS_Unified_LongPoll::__construct() でフック登録
2. send_message_optimized() で直接呼び出し → イベント登録
3. do_action() でもイベント登録（二重だが問題なし）

修正後（動作NG）:
1. LMS_Unified_LongPoll::__construct() でフック登録
2. send_message_optimized() で直接呼び出しなし
3. do_action() 発火 → フック実行
   ⚠️ しかしインスタンス化タイミングによってはフック未登録
```

**結論**: 直接呼び出しは**インスタンス化を保証する役割**も担っている

### 2. データベース最適化の詳細仕様

**MCP Codexの提案**:
- MySQL 8のCTEまたはサブクエリによる統合
- `JSON_OBJECTAGG`による最新ユーザー情報の取得
- `ROW_NUMBER()`によるTop 3ユーザー抽出
- カバリングインデックスの設計

**インデックス仕様**:
```sql
-- 提案インデックス
CREATE INDEX idx_thread_messages_composite_1 
ON lms_chat_thread_messages(parent_message_id, deleted_at, created_at);

CREATE INDEX idx_thread_messages_composite_2 
ON lms_chat_thread_messages(parent_message_id, user_id, created_at);

CREATE INDEX idx_thread_last_viewed_composite
ON lms_chat_thread_last_viewed(parent_message_id, user_id, last_viewed_at);
```

### 3. キャッシュシステムの詳細設計

**MCP Codexの提案**:

**TTL設定（v3.0より詳細化）**:
- スレッド数/未読情報: L1=15秒、L2=60秒、L3=180秒
- スレッドサマリー: L1=5分、L2=15分、L3=60分

**キー命名規則**:
```
chat:thread:{threadId}:v4           # グローバル情報
chat:thread:{threadId}:user:{userId}:v4  # ユーザー依存情報
```

**Prefetch/Write-back戦略**:
- スレッド一覧表示前にTop 10を先読み
- 大規模更新時は即時書き込みに切替

### 4. Long Polling最適化の高度な仕様

**MCP Codexの提案**:

**アダプティブ待機**:
```
レスポンス無し経過時間 → 待機間隔
0-1.5秒 → 150ms（高頻度）
1.5-3秒 → 300ms（中頻度）
3秒以上 → 600ms（低頻度）
```

**クライアント側動的調整**:
```javascript
// 成功直後の漸増
直後 → 0.5秒
1回後 → 1秒
2回後以降 → 3秒

// Page Visibility API活用
バックグラウンド → 10秒
アクティブ → 遅延中央値×係数
```

---

## 🛡️ v4.0の統合最適化計画

### Phase 0: 準備フェーズ（1日）

#### 0A. 現状メトリクス取得

**実施内容**:
```sql
-- 現在のクエリ実行計画を取得
EXPLAIN SELECT COUNT(*) FROM wp_lms_chat_thread_messages 
WHERE parent_message_id = 123 AND deleted_at IS NULL;

EXPLAIN SELECT COUNT(*) FROM wp_lms_chat_thread_messages t
LEFT JOIN wp_lms_chat_thread_last_viewed v ...;

-- インデックス使用状況
SHOW INDEX FROM wp_lms_chat_thread_messages;
SHOW INDEX FROM wp_lms_chat_thread_last_viewed;

-- テーブルサイズ
SELECT 
    table_name,
    ROUND(data_length / 1024 / 1024, 2) AS data_mb,
    ROUND(index_length / 1024 / 1024, 2) AS index_mb,
    table_rows
FROM information_schema.tables
WHERE table_schema = 'lms' 
AND table_name LIKE 'wp_lms_chat%';
```

**測定項目**:
- [ ] `handle_get_thread_count()`の実行時間（10回平均）
- [ ] Long Pollレスポンス時間（P50, P95, P99）
- [ ] サーバーCPU/メモリ使用率
- [ ] DB接続数
- [ ] キャッシュヒット率（現状は0%）

**成果物**: ベースライン測定レポート

---

### Phase 1: データベース最適化（3日）

#### ステップ1.1: インデックス作成（夜間メンテナンス時）

**実施内容**:
```sql
-- オンラインALTER TABLEで実行（ロック最小化）
ALTER TABLE wp_lms_chat_thread_messages
ADD INDEX idx_thread_messages_composite_1 (parent_message_id, deleted_at, created_at),
ADD INDEX idx_thread_messages_composite_2 (parent_message_id, user_id, created_at),
ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE wp_lms_chat_thread_last_viewed
ADD INDEX idx_thread_last_viewed_composite (parent_message_id, user_id, last_viewed_at),
ALGORITHM=INPLACE, LOCK=NONE;

-- 作成後の確認
SHOW INDEX FROM wp_lms_chat_thread_messages;
ANALYZE TABLE wp_lms_chat_thread_messages;
ANALYZE TABLE wp_lms_chat_thread_last_viewed;
```

**検証**:
- [ ] インデックスが正常に作成された
- [ ] 既存クエリの実行計画が改善された
- [ ] テーブルロックが発生しなかった
- [ ] ディスク使用量が許容範囲内

**ロールバック**:
```sql
ALTER TABLE wp_lms_chat_thread_messages
DROP INDEX idx_thread_messages_composite_1,
DROP INDEX idx_thread_messages_composite_2;
```

**期待効果**: クエリ実行時間 20-30%短縮

---

#### ステップ1.2: 統合クエリの実装（Feature Flag付き）

**実装方針**:
```php
// handle_get_thread_count()に Feature Flag を追加
public function handle_get_thread_count() {
    // ...nonce検証等...
    
    // Feature Flag確認
    $use_optimized_query = get_option('lms_optimized_thread_query_v4', false);
    
    if ($use_optimized_query) {
        return $this->handle_get_thread_count_optimized_v4(...);
    }
    
    // 従来のロジック（フォールバック）
    // ...既存の4クエリ...
}

// 新規メソッド（既存コードに影響なし）
private function handle_get_thread_count_optimized_v4($parent_message_id, $user_id) {
    global $wpdb;
    
    // MySQL 8のCTEを使用した統合クエリ
    $result = $wpdb->get_row($wpdb->prepare("
        WITH thread_stats AS (
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE 
                    WHEN t.user_id != %d 
                    AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)
                    THEN 1 ELSE 0 
                END) as unread_count,
                MAX(t.created_at) as latest_time,
                MAX(CASE WHEN t.created_at = (
                    SELECT MAX(t2.created_at) 
                    FROM {$wpdb->prefix}lms_chat_thread_messages t2
                    WHERE t2.parent_message_id = t.parent_message_id
                    AND t2.deleted_at IS NULL
                ) THEN t.user_id END) as latest_user_id
            FROM {$wpdb->prefix}lms_chat_thread_messages t
            LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
                ON v.parent_message_id = t.parent_message_id
                AND v.user_id = %d
            WHERE t.parent_message_id = %d
            AND t.deleted_at IS NULL
        )
        SELECT 
            s.*,
            u.display_name as latest_user_name
        FROM thread_stats s
        LEFT JOIN {$wpdb->prefix}lms_users u ON s.latest_user_id = u.id
    ", $user_id, $user_id, $parent_message_id));
    
    // アバターのみ別クエリ（統合困難）
    $avatars = $wpdb->get_results($wpdb->prepare("
        SELECT u.id as user_id, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        INNER JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        AND t.deleted_at IS NULL
        GROUP BY u.id
        ORDER BY MAX(t.created_at) DESC
        LIMIT 3
    ", $parent_message_id));
    
    // 時刻整形
    $latest_reply = $this->format_time_ago($result->latest_time);
    
    return [
        'count' => (int)($result->total_count ?? 0),
        'total' => (int)($result->total_count ?? 0),
        'unread' => (int)($result->unread_count ?? 0),
        'latest_reply' => $latest_reply,
        'avatars' => $avatars,
        'version' => 'v4_optimized'  // デバッグ用
    ];
}
```

**段階的展開**:
```php
// WordPressオプションで制御
// 0% → 10% → 50% → 100%
update_option('lms_optimized_thread_query_v4', false);  // 無効
update_option('lms_optimized_thread_query_v4', true);   // 有効
```

**検証**:
- [ ] 新旧のレスポンスが完全一致（JSON比較）
- [ ] 実行時間が20-40ms短縮
- [ ] EXPLAINで新インデックスが使用される
- [ ] エラーが発生しない

**ロールバック**:
```php
update_option('lms_optimized_thread_query_v4', false);
```

**期待効果**: 4クエリ→2クエリで 20-40ms短縮

---

### Phase 2: キャッシュシステム構築（2日）

#### ステップ2.1: キャッシュレイヤーの追加

**実装方針**:
```php
// handle_get_thread_count_optimized_v4() にキャッシュを追加
private function handle_get_thread_count_optimized_v4($parent_message_id, $user_id) {
    // Feature Flag確認
    if (!get_option('lms_thread_cache_enabled_v4', false)) {
        // キャッシュなしで実行
        return $this->fetch_thread_count_from_db($parent_message_id, $user_id);
    }
    
    // キャッシュチェック
    $cache = LMS_Advanced_Cache::get_instance();
    $cache_key = "chat:thread:{$parent_message_id}:user:{$user_id}:v4";
    
    $cached_data = $cache->get($cache_key, null, [
        'type' => LMS_Advanced_Cache::TYPE_USER,
        'layers' => [
            LMS_Advanced_Cache::LAYER_MEMORY,   // L1: 15秒
            LMS_Advanced_Cache::LAYER_APCU,     // L2: 60秒
            LMS_Advanced_Cache::LAYER_FILE      // L3: 180秒
        ]
    ]);
    
    if ($cached_data !== null) {
        $cached_data['cache_hit'] = true;  // デバッグ用
        return $cached_data;
    }
    
    // キャッシュミス時はDB取得
    $data = $this->fetch_thread_count_from_db($parent_message_id, $user_id);
    $data['cache_hit'] = false;
    
    // キャッシュに保存
    $cache->set($cache_key, $data, [
        'type' => LMS_Advanced_Cache::TYPE_USER,
        'ttl' => 15  // L1: 15秒、L2/L3は自動的に長いTTL
    ]);
    
    return $data;
}
```

**キャッシュ無効化**:
```php
// コンストラクタに追加（既存コードを壊さない）
add_action('lms_chat_thread_message_sent', array($this, 'invalidate_thread_cache_v4'), 20, 4);
add_action('lms_chat_thread_message_deleted', array($this, 'invalidate_thread_cache_v4'), 20, 3);

// 新規メソッド
public function invalidate_thread_cache_v4($message_id, $parent_id, $channel_id, $user_id = null) {
    if (!class_exists('LMS_Advanced_Cache')) {
        return;
    }
    
    try {
        $cache = LMS_Advanced_Cache::get_instance();
        
        // パターンマッチで全ユーザーのキャッシュを削除
        $cache->delete_pattern("chat:thread:{$parent_id}:user:*:v4");
        
        // グローバルキャッシュも削除
        $cache->delete_pattern("chat:thread:{$parent_id}:v4");
        
    } catch (Exception $e) {
        // エラーでもメッセージ同期には影響させない
        error_log("Cache invalidation failed: " . $e->getMessage());
    }
}
```

**検証**:
- [ ] キャッシュヒット時のレスポンスが5ms以下
- [ ] キャッシュミス時のレスポンスが従来と同等
- [ ] メッセージ投稿後にキャッシュが無効化される
- [ ] キャッシュヒット率が測定できる

**ロールバック**:
```php
update_option('lms_thread_cache_enabled_v4', false);
wp eval 'LMS_Advanced_Cache::get_instance()->flush_all();'
```

**期待効果**: キャッシュヒット時に 30-80ms短縮

---

#### ステップ2.2: Prefetch機能の実装

**実装方針**:
```php
// スレッド一覧取得時に上位10件を先読み
public function handle_get_thread_list() {
    // ...既存のスレッド一覧取得...
    
    // Prefetch（Feature Flag付き）
    if (get_option('lms_thread_prefetch_enabled_v4', false)) {
        $top_thread_ids = array_slice(array_column($threads, 'id'), 0, 10);
        $this->prefetch_thread_info_v4($top_thread_ids, $user_id);
    }
    
    return $threads;
}

private function prefetch_thread_info_v4($thread_ids, $user_id) {
    if (!class_exists('LMS_Advanced_Cache')) {
        return;
    }
    
    $cache = LMS_Advanced_Cache::get_instance();
    
    foreach ($thread_ids as $thread_id) {
        $cache_key = "chat:thread:{$thread_id}:user:{$user_id}:v4";
        
        // 既にキャッシュされているかチェック
        if ($cache->get($cache_key) !== null) {
            continue;
        }
        
        // Prefetchキューに追加
        $cache->prefetch([
            'key' => $cache_key,
            'callback' => function() use ($thread_id, $user_id) {
                return $this->fetch_thread_count_from_db($thread_id, $user_id);
            }
        ]);
    }
}
```

**検証**:
- [ ] Prefetch後のキャッシュヒット率が向上
- [ ] サーバー負荷が許容範囲内

**期待効果**: キャッシュヒット率を 50%→70%に向上

---

### Phase 3: Long Polling最適化（2日）

#### ステップ3.1: サーバー側アダプティブ待機

**実装方針**:
```php
// includes/class-lms-unified-longpoll.php
private function poll_for_unified_events(...) {
    $start_time = microtime(true);
    $poll_end_time = $start_time + $timeout;
    
    // Feature Flag確認
    $use_adaptive = get_option('lms_adaptive_polling_v4', false);
    
    while (microtime(true) < $poll_end_time) {
        $elapsed = microtime(true) - $start_time;
        
        if ($use_adaptive) {
            // アダプティブ待機
            if ($elapsed < 1.5) {
                $interval = 150000;  // 150ms
            } elseif ($elapsed < 3.0) {
                $interval = 300000;  // 300ms
            } else {
                $interval = 600000;  // 600ms
            }
        } else {
            // 固定間隔
            $interval = self::POLL_INTERVAL;  // 150ms
        }
        
        usleep($interval);
        
        $events = $this->check_for_unified_events(...);
        if (!empty($events)) {
            break;
        }
    }
    
    return $events;
}
```

**検証**:
- [ ] アイドル時のCPU使用率が低下
- [ ] イベント検出速度が維持される

**期待効果**: サーバー負荷を 20-30%削減（アイドル時）

---

#### ステップ3.2: クライアント側動的調整

**実装方針**:
```javascript
// js/chat-longpoll.js
// サーバー推奨値を使用
function scheduleNextPoll(serverRetryAfter = null) {
    if (longPollState.isPaused) {
        return;
    }

    let delay;
    
    if (serverRetryAfter && window.LMS_DYNAMIC_RECONNECT_V4) {
        // サーバー推奨値を優先
        delay = serverRetryAfter;
    } else if (window.LMS_DYNAMIC_RECONNECT_V4) {
        // 動的調整
        const recentDelays = longPollState.recentDelays || [];
        const median = calculateMedian(recentDelays);
        delay = Math.max(500, Math.min(median * 1.2, 5000));
    } else {
        // 固定3秒（従来）
        delay = longPollState.currentPollDelay;
    }
    
    // Page Visibility API
    if (document.hidden && window.LMS_DYNAMIC_RECONNECT_V4) {
        delay = Math.max(delay, 10000);  // バックグラウンド時は10秒
    }
    
    longPollState.pollDelayTimer = setTimeout(() => {
        startPolling();
    }, delay);
}
```

**サーバー側のretry_after追加**:
```php
// handle_unified_long_poll()のレスポンスに追加
$response = [
    'success' => true,
    'data' => [
        'events' => $events,
        'timestamp' => time(),
        'retry_after' => $this->calculate_retry_after_v4(),
        'queue_depth' => $this->get_queue_depth()
    ]
];

private function calculate_retry_after_v4() {
    $queue_depth = $this->get_queue_depth();
    
    if ($queue_depth > 100) {
        return 5000;  // 高負荷
    } elseif ($queue_depth > 50) {
        return 2000;
    } elseif ($queue_depth > 10) {
        return 1000;
    } else {
        return 500;   // 通常
    }
}
```

**検証**:
- [ ] クライアント側がretry_afterに従う
- [ ] バックグラウンド時に再接続が遅延する
- [ ] メッセージ同期が正常

**期待効果**: 再接続遅延を平均 1.5秒短縮

---

### Phase 4: 統合テストと観測（1週間）

#### 4.1. 全機能の統合検証

**テストシナリオ**:
```
1. メッセージ送受信（2ユーザー間）
2. スレッド返信
3. リアクション追加
4. スレッド情報表示
5. チャンネル切り替え
6. バックグラウンド→フォアグラウンド切替
7. 高負荷状態（10ユーザー同時送信）
```

**測定項目**:
- [ ] メッセージ同期速度（P50, P95, P99）
- [ ] スレッド情報取得時間
- [ ] キャッシュヒット率（レイヤー別）
- [ ] サーバーCPU/メモリ使用率
- [ ] DB接続数
- [ ] エラー率

#### 4.2. パフォーマンスダッシュボード

**実装**:
```php
// WordPress管理画面に統計ページを追加
add_action('admin_menu', function() {
    add_menu_page(
        'LMS Performance',
        'Performance',
        'manage_options',
        'lms-performance',
        'lms_render_performance_dashboard'
    );
});

function lms_render_performance_dashboard() {
    $cache = LMS_Advanced_Cache::get_instance();
    $stats = $cache->get_stats();
    
    // キャッシュヒット率
    // Long Pollレスポンス時間
    // サーバー負荷
    // エラー率
    // などを表示
}
```

---

## 📊 v4.0の最終成果予測

| 指標 | 現状 | v4.0 Phase完了後 | 改善率 |
|------|------|-----------------|--------|
| **メインメッセージ同期** | 165-355ms | **90-230ms** | **約45%** |
| **スレッドメッセージ同期** | 165-505ms | **90-380ms** | **約45%** |
| **スレッド情報取得** | 30-80ms | **<5ms**（キャッシュ時） | **約93%** |
| **クライアント再開遅延** | 3秒固定 | **0.5-2秒動的** | **約50%** |
| **キャッシュヒット率** | 0% | **70-85%** | - |
| **サーバー負荷（アイドル時）** | 基準 | **-20%** | 削減 |
| **サーバー負荷（高負荷時）** | 基準 | **+40%** | 許容範囲 |

---

## 🚨 ロールバック手順（v4.0版）

### 緊急ロールバック（1分以内）

```bash
# 1. Feature Flagを全て無効化
wp option update lms_optimized_thread_query_v4 false
wp option update lms_thread_cache_enabled_v4 false
wp option update lms_thread_prefetch_enabled_v4 false
wp option update lms_adaptive_polling_v4 false

# 2. キャッシュクリア
wp eval 'LMS_Advanced_Cache::get_instance()->flush_all();'

# 3. クライアント側のフラグを無効化
# window.LMS_DYNAMIC_RECONNECT_V4 = false;
```

### Git ロールバック（必要に応じて）

```bash
# 各フェーズごとにコミット済みの場合
git checkout HEAD~1 -- includes/class-lms-chat.php
git checkout HEAD~1 -- js/chat-longpoll.js
```

---

## ✅ v3.0からv4.0への主要改善点

| 項目 | v3.0 | v4.0 |
|------|------|------|
| データベース最適化 | 概要のみ | **MySQL 8のCTE/インデックス詳細仕様** |
| キャッシュ設計 | 基本設計 | **TTL/Prefetch/Write-back詳細** |
| Long Polling最適化 | 基本方針 | **アダプティブ待機/Page Visibility API** |
| 前回失敗分析 | 表面的 | **インスタンス化タイミングまで深掘り** |
| Feature Flag | なし | **全ステップでFeature Flag対応** |
| ロールバック | 手動手順 | **1分以内の自動化可能な手順** |
| 観測 | 基本測定 | **パフォーマンスダッシュボード** |

---

## 🎓 v4.0の哲学

**「絶対に壊さない」> 「速くする」> 「観測する」**

1. **絶対に壊さない**: Feature Flagでいつでも元に戻せる
2. **速くする**: 段階的最適化で45%高速化
3. **観測する**: ダッシュボードで継続的に監視

---

## 📝 実装前の最終チェックリスト

### 環境準備
- [ ] 本番環境のフルバックアップ
- [ ] ステージング環境の準備
- [ ] MySQLバージョン確認（8.0以上推奨）
- [ ] LMS_Advanced_Cacheの動作確認
- [ ] Git最新コミット

### Phase 0完了条件
- [ ] ベースライン測定完了
- [ ] EXPLAIN結果取得
- [ ] テーブルサイズ確認
- [ ] 現在のキャッシュヒット率確認

### 各Phase完了条件
- [ ] 新旧レスポンスの一致確認
- [ ] パフォーマンス改善確認
- [ ] メッセージ同期が100%正常
- [ ] エラー率が0.5%未満

---

**この計画はv3.0とMCP Codex分析を統合し、実装可能性と安全性を最大化した最終版です。**
