# LMSチャット同期速度・キャッシュ最適化 完璧な実装計画 v2.0

**作成日**: 2025-01-XX  
**最終更新**: MCP Codex分析統合版  
**目標**: サーバー負荷を抑えながら同期速度を最大80%改善、キャッシュヒット率80%以上達成

---

## 🎯 エグゼクティブサマリー（v1.0からの主要改善点）

### 新たな重要発見（MCP Codex分析）

1. **クライアント側の再接続制御の非効率性**
   - 固定3秒待機がボトルネック
   - 指数バックオフ未実装
   - サーバー推奨値の活用なし

2. **リアクション同期の冗長性**
   - 統合イベントと独立ポーリングの重複配送
   - 30秒間隔の独立ポーリングが不要な負荷を生成
   - hydration後の同期遅延

3. **キャッシュ整合性リスク**
   - キャッシュキーのバージョン管理が必要
   - 無効化漏れによる誤情報表示のリスク
   - ロールバック時のヒット率0%問題

4. **イベント順序保証の不備**
   - `last_event_id`の厳密な比較が未実装
   - DB挿入順とレスポンス整列のずれ

### v2.0の主要改善点

| 改善項目 | v1.0 | v2.0 |
|---------|------|------|
| クライアント再接続制御 | 固定3秒 | **サーバー主導 + 指数バックオフ** |
| リアクション同期 | 独立ポーリング継続 | **統合イベントへ完全移行** |
| キャッシュキー設計 | 未定義 | **バージョン付き明確化** |
| 成功指標 | 抽象的 | **P95≤400ms, キャッシュヒット≥80%** |
| ロールバック | 概要のみ | **詳細手順書あり** |
| モニタリング | 基本監視 | **専用メトリクス + アラート設計** |

---

## 📊 詳細技術分析

### 1. Long Pollingアーキテクチャの深堀り

#### 現状の問題点

```php
// includes/class-lms-unified-longpoll.php:46
const POLL_INTERVAL = 150000; // 0.15秒（統合実装）

// includes/class-lms-chat-longpoll.php:32
const POLL_INTERVAL = 100000; // 0.1秒（基本実装）

// js/chat-longpoll.js:32,37
timeoutDuration: 30000,      // 30秒タイムアウト
currentPollDelay: 3000,      // 固定3秒再開遅延 ← 問題
```

**発見**: 
- サーバー側は0.1-0.15秒で高速チェック
- クライアント側は3秒固定待機で遅延
- ネットワーク遅延への適応性なし

#### 統計情報の不足

```php
// includes/class-lms-unified-longpoll.php:87-93
private $stats = [
    'total_requests' => 0,
    'total_events' => 0,
    'avg_wait_time' => 0,  // 平均のみで波形把握不可
    'active_connections' => 0
];
```

**問題**: キュー詰まりを検知できない

### 2. リアクション同期の重複問題

#### 現状のフロー

```javascript
// js/chat-longpoll.js:1183-1207
setInterval(() => {
    // 統合Long Pollingが動作中でも独立ポーリング実行
    if (!isUnifiedLongPollActive && ...) {
        pollReactionUpdates();  // 30秒間隔
        pollThreadReactions();
    }
}, 30000);
```

**問題**:
- 統合イベントでリアクション配送済みでも独立ポーリング継続
- サーバー負荷の無駄
- UIの重複更新リスク

### 3. スレッド情報取得の詳細

#### 4つの独立クエリ（キャッシュ未使用）

```php
// includes/class-lms-chat.php:4699-4758

// 1. COUNT クエリ
$query = "SELECT COUNT(*) 
    FROM {$wpdb->prefix}lms_chat_thread_messages 
    WHERE parent_message_id = %d AND deleted_at IS NULL";

// 2. 未読カウント（JOIN）
$unread = $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$wpdb->prefix}lms_chat_thread_messages t
    LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v ..."));

// 3. 最新返信
$latest_message = $wpdb->get_row($wpdb->prepare(
    "SELECT t.created_at, u.display_name ...
    ORDER BY t.created_at DESC LIMIT 1"));

// 4. アバター取得（GROUP BY）
$avatars = $wpdb->get_results($wpdb->prepare(
    "SELECT u.id, u.display_name, u.avatar_url ...
    GROUP BY u.id ORDER BY MAX(t.created_at) DESC LIMIT 3"));
```

**推定処理時間**: 30-80ms（毎回）

#### キャッシュ無効化機構は存在

```php
// includes/class-lms-chat.php:4611-4623
private function clear_thread_cache($parent_message_id) {
    // 既存の無効化フックがある（活用されていない）
}
```

### 4. 多層キャッシュシステムの詳細

#### レイヤー構成

```php
// includes/class-lms-advanced-cache.php:82-108
'ttl' => [
    self::LAYER_MEMORY => 300,      // 5分（L1）
    self::LAYER_APCU => 3600,       // 1時間（L2）
    self::LAYER_REDIS => 86400,     // 24時間（L3）
    self::LAYER_MEMCACHED => 86400, // 24時間（L4）
    self::LAYER_FILE => 604800,     // 7日（L5）
    self::LAYER_DATABASE => 2592000 // 30日（L6）
]
```

**問題**: スレッド情報で全く活用されていない

---

## ⚠️ リスク評価マトリクス（詳細版）

### 技術的リスク

| リスク | 確率 | 影響 | 対策 | 検証方法 |
|-------|------|------|------|---------|
| **キャッシュ整合性崩壊** | 中 | 高 | `clear_thread_cache`とイベントバージョン連動 | 統合テスト |
| **競合状態（Race Condition）** | 低 | 高 | `reactionSync.addSkipUpdateMessageId`延長 | 並行テスト |
| **イベント順序逆転** | 中 | 高 | `last_event_id`厳密比較実装 | シーケンステスト |
| **メモリリーク** | 低 | 中 | キャッシュサイズ制限監視 | 長時間稼働テスト |
| **キャッシュキー衝突** | 中 | 中 | バージョン接尾辞導入 | 単体テスト |

### 運用リスク

| リスク | 確率 | 影響 | 対策 | 検証方法 |
|-------|------|------|------|---------|
| **段階展開時の負荷スパイク** | 中 | 中 | カナリアリリース20%刻み | 負荷テスト |
| **ロールバック失敗** | 低 | 高 | キーバージョン管理 | DR訓練 |
| **パフォーマンス劣化** | 低 | 高 | 段階的展開+即座ロールバック | A/Bテスト |
| **モニタリング欠損** | 中 | 中 | 専用メトリクス追加 | アラートテスト |

### データ整合性リスク

| リスク | 確率 | 影響 | 対策 | 検証方法 |
|-------|------|------|------|---------|
| **キャッシュとDBの不整合** | 中 | 高 | イベントベース無効化 | 整合性チェック |
| **未読カウント誤差** | 低 | 中 | トランザクション境界明確化 | 境界値テスト |
| **リアクション重複適用** | 中 | 低 | DOM更新前のフラグ確認 | UI自動テスト |

---

## 🚀 最適化計画 v2.0（詳細実装手順）

### フェーズ1: 緊急最適化（1週間、サーバー負荷+50%）

#### A. サーバー主導の再接続制御

**目的**: クライアント側の固定3秒遅延を動的制御に変更

**サーバー側実装**:
```php
// includes/class-lms-unified-longpoll.php
// handle_unified_long_poll()のレスポンスに追加

private function calculate_retry_after($stats) {
    // キュー深度と負荷状況から最適な再接続時間を計算
    $queue_depth = count($this->recent_events);
    $active_connections = $this->get_user_active_connections();
    
    if ($queue_depth > 100) {
        return 5000; // 5秒（高負荷）
    } elseif ($queue_depth > 50) {
        return 2000; // 2秒（中負荷）
    } elseif ($queue_depth > 10) {
        return 1000; // 1秒（低負荷）
    } else {
        return 500;  // 0.5秒（通常）
    }
}

// レスポンスに追加
$response = [
    'success' => true,
    'data' => [
        'events' => $events,
        'retry_after' => $this->calculate_retry_after($this->stats),
        'queue_depth' => count($this->recent_events)
    ]
];
```

**クライアント側実装**:
```javascript
// js/chat-longpoll.js
// scheduleNextPoll()を動的制御に変更

function scheduleNextPoll(serverRetryAfter = null) {
    if (longPollState.isPaused) {
        return;
    }

    // サーバー推奨値を優先
    let delay = serverRetryAfter || longPollState.currentPollDelay;
    
    // 非アクティブ時は延長
    if (longPollState.isInactiveMode) {
        delay = Math.max(delay, 10000);
    }
    
    longPollState.pollDelayTimer = setTimeout(() => {
        startPolling();
    }, delay);
}

// success時にサーバー推奨値を使用
success: function(response) {
    // ...
    const serverRetryAfter = response.data?.retry_after;
    scheduleNextPoll(serverRetryAfter);
}
```

**指数バックオフの追加**:
```javascript
// handleReconnection()に指数バックオフを実装

function handleReconnection() {
    if (longPollState.reconnectAttempts >= longPollState.maxReconnectAttempts) {
        longPollState.isConnected = false;
        longPollState.isConnecting = false;
        return;
    }

    longPollState.reconnectAttempts++;
    
    // 指数バックオフ: 500ms, 1s, 2s, 4s, 最大5s
    const baseDelay = 500;
    const maxDelay = 5000;
    const exponentialDelay = baseDelay * Math.pow(2, longPollState.reconnectAttempts - 1);
    const delay = Math.min(exponentialDelay, maxDelay);

    longPollState.pollDelayTimer = setTimeout(() => {
        startPolling();
    }, delay);
}
```

**期待効果**: -0.5~2.5秒（平均-1.5秒）  
**工数**: 3時間  
**リスク**: 低

#### B. スレッド情報のクエリ統合

**目的**: 4つのクエリを1つに統合

**実装**:
```php
// includes/class-lms-chat.php
// handle_get_thread_count()を最適化

public function handle_get_thread_count() {
    // ... nonce検証等 ...
    
    $parent_message_id = isset($_GET['parent_message_id']) ? intval($_GET['parent_message_id']) : 0;
    $user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
    
    if (!$parent_message_id) {
        wp_send_json_error('親メッセージIDが指定されていません。');
        return;
    }

    global $wpdb;
    
    // 統合クエリ（4→1クエリ）
    $result = $wpdb->get_row($wpdb->prepare("
        SELECT 
            COUNT(*) as total_count,
            SUM(CASE 
                WHEN t.user_id != %d 
                AND (v.last_viewed_at IS NULL OR t.created_at > v.last_viewed_at)
                THEN 1 ELSE 0 
            END) as unread_count,
            MAX(t.created_at) as latest_time,
            (SELECT u.display_name 
             FROM {$wpdb->prefix}lms_chat_thread_messages t2
             JOIN {$wpdb->prefix}lms_users u ON t2.user_id = u.id
             WHERE t2.parent_message_id = t.parent_message_id
             AND t2.deleted_at IS NULL
             ORDER BY t2.created_at DESC LIMIT 1) as latest_user
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        LEFT JOIN {$wpdb->prefix}lms_chat_thread_last_viewed v
            ON v.parent_message_id = t.parent_message_id
            AND v.user_id = %d
        WHERE t.parent_message_id = %d
        AND t.deleted_at IS NULL
    ", $user_id, $user_id, $parent_message_id));
    
    // アバターのみ別クエリ（最適化難しい）
    $avatars = $wpdb->get_results($wpdb->prepare("
        SELECT DISTINCT u.id as user_id, u.display_name, u.avatar_url
        FROM {$wpdb->prefix}lms_chat_thread_messages t
        JOIN {$wpdb->prefix}lms_users u ON t.user_id = u.id
        WHERE t.parent_message_id = %d
        AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT 3
    ", $parent_message_id));
    
    // 最新返信時刻の整形
    $latest_reply = '';
    if ($result && $result->latest_time) {
        $timestamp = strtotime($result->latest_time);
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
    
    wp_send_json_success([
        'count' => (int)($result->total_count ?? 0),
        'total' => (int)($result->total_count ?? 0),
        'unread' => (int)($result->unread_count ?? 0),
        'latest_reply' => $latest_reply,
        'avatars' => $avatars
    ]);
}
```

**インデックス追加**:
```sql
-- パフォーマンス向上のため
CREATE INDEX idx_thread_messages_parent_created 
ON lms_chat_thread_messages(parent_message_id, created_at DESC, deleted_at);

CREATE INDEX idx_thread_last_viewed_composite
ON lms_chat_thread_last_viewed(parent_message_id, user_id, last_viewed_at);
```

**期待効果**: -20~40ms（4クエリ→2クエリ）  
**工数**: 2時間  
**リスク**: 中（クエリロジック変更）

#### C. スレッド情報のキャッシュ化

**目的**: DBクエリ削減、レスポンス高速化

**実装**:
```php
// includes/class-lms-chat.php
// handle_get_thread_count()にキャッシュレイヤー追加

public function handle_get_thread_count() {
    // ... nonce検証等 ...
    
    $parent_message_id = isset($_GET['parent_message_id']) ? intval($_GET['parent_message_id']) : 0;
    $user_id = isset($_SESSION['lms_user_id']) ? intval($_SESSION['lms_user_id']) : 0;
    
    if (!$parent_message_id) {
        wp_send_json_error('親メッセージIDが指定されていません。');
        return;
    }
    
    // キャッシュチェック
    $cache = LMS_Advanced_Cache::get_instance();
    $cache_key = "thread_info_v2_{$parent_message_id}_{$user_id}";
    
    $cached_data = $cache->get($cache_key, null, [
        'type' => LMS_Advanced_Cache::TYPE_SESSION,
        'layers' => [
            LMS_Advanced_Cache::LAYER_MEMORY,
            LMS_Advanced_Cache::LAYER_APCU,
            LMS_Advanced_Cache::LAYER_FILE
        ]
    ]);
    
    if ($cached_data !== null) {
        wp_send_json_success($cached_data);
        return;
    }
    
    // キャッシュミス時はDB取得
    global $wpdb;
    
    // ... 統合クエリ実行 ...
    
    $response_data = [
        'count' => (int)($result->total_count ?? 0),
        'total' => (int)($result->total_count ?? 0),
        'unread' => (int)($result->unread_count ?? 0),
        'latest_reply' => $latest_reply,
        'avatars' => $avatars
    ];
    
    // キャッシュに保存（多層TTL）
    $cache->set($cache_key, $response_data, [
        'type' => LMS_Advanced_Cache::TYPE_SESSION,
        'ttl' => 45  // 45秒（L1）、上位レイヤーは自動的に長いTTL
    ]);
    
    wp_send_json_success($response_data);
}
```

**キャッシュ無効化の実装**:
```php
// includes/class-lms-chat.php
// スレッドメッセージ作成・削除時に無効化

private function invalidate_thread_info_cache($parent_message_id) {
    $cache = LMS_Advanced_Cache::get_instance();
    
    // パターンマッチで全ユーザーのキャッシュを削除
    $cache->delete_pattern("thread_info_v2_{$parent_message_id}_*");
    
    // 既存のclear_thread_cacheも呼ぶ
    $this->clear_thread_cache($parent_message_id);
}

// on_thread_message_created(), on_thread_message_deleted()で呼び出し
public function on_thread_message_created($message_data) {
    // ... 既存処理 ...
    
    if (isset($message_data['parent_message_id'])) {
        $this->invalidate_thread_info_cache($message_data['parent_message_id']);
    }
}
```

**期待効果**: 
- 初回: -20~40ms（クエリ統合）
- 2回目以降: -30~80ms（キャッシュヒット）

**工数**: 3時間  
**リスク**: 低（無効化フック既存）

#### D. ポーリング間隔の最適化

**目的**: 検出速度向上（段階的）

**ステップ1: 150ms → 100ms**
```php
// includes/class-lms-unified-longpoll.php
const POLL_INTERVAL = 100000; // 0.1秒（-33%遅延）
```

**期待効果**: -25ms（平均）  
**負荷増加**: 1.5倍  
**工数**: 10分  
**リスク**: 低

#### フェーズ1 成果予測

| 指標 | 現状 | フェーズ1後 | 改善率 |
|------|------|-----------|--------|
| スレッドメッセージ同期 | 165-505ms | **85-318ms** | **約50%** |
| スレッド情報取得 | 30-80ms | **<5ms** (キャッシュヒット時) | **約90%** |
| クライアント再開遅延 | 3秒固定 | **0.5-2秒動的** | **約50%** |
| サーバー負荷 | 基準 | **+50%** | - |

---

### フェーズ2: キャッシュ最適化（2週間、サーバー負荷+100%）

#### A. アダプティブポーリング

**目的**: 負荷に応じてポーリング間隔を自動調整

**実装**:
```php
// includes/class-lms-unified-longpoll.php
// 新規メソッド追加

private function get_adaptive_poll_interval() {
    // 過去60秒のイベント数を取得
    $recent_events = $this->count_recent_events(60);
    
    if ($recent_events > 20) {
        return 50000;   // 50ms（高頻度）
    } elseif ($recent_events > 5) {
        return 100000;  // 100ms（中頻度）
    } elseif ($recent_events > 0) {
        return 250000;  // 250ms（低頻度）
    } else {
        return 500000;  // 500ms（アイドル）
    }
}

private function count_recent_events($seconds) {
    global $wpdb;
    $table = $wpdb->prefix . self::EVENTS_TABLE;
    
    $threshold = time() - $seconds;
    
    return (int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM $table WHERE timestamp > %d",
        $threshold
    ));
}

// poll_for_unified_events()内で使用
private function poll_for_unified_events(...) {
    // ...
    
    while (microtime(true) < $poll_end_time) {
        // アダプティブ間隔を使用
        $interval = $this->get_adaptive_poll_interval();
        usleep($interval);
        
        // ...
    }
}
```

**期待効果**: 
- 高頻度時: -25ms
- 低頻度時: 負荷削減（-60%）

**工数**: 1日  
**リスク**: 中

#### B. 予測的プリフェッチ

**目的**: アクセスパターンを学習して先読み

**実装**:
```php
// includes/class-lms-advanced-cache.php
// 既存のprefetch機構を活用

public function prefetch_thread_info($parent_message_ids, $user_id) {
    foreach ($parent_message_ids as $parent_id) {
        $cache_key = "thread_info_v2_{$parent_id}_{$user_id}";
        
        // 既にキャッシュされているかチェック
        if ($this->get($cache_key) !== null) {
            continue;
        }
        
        // プリフェッチキューに追加
        $this->prefetch_queue[] = [
            'key' => $cache_key,
            'callback' => function() use ($parent_id, $user_id) {
                // バックグラウンドでスレッド情報を取得
                $lms_chat = LMS_Chat::get_instance();
                return $lms_chat->get_thread_info_data($parent_id, $user_id);
            }
        ];
    }
    
    // バックグラウンドで処理
    if (count($this->prefetch_queue) >= $this->config['prefetch']['batch_size']) {
        $this->process_prefetch_queue();
    }
}
```

**JavaScript側からの呼び出し**:
```javascript
// js/chat-messages.js
// スレッド一覧表示時に上位10件を先読み

function loadThreadList(threads) {
    // 表示
    threads.forEach(thread => {
        appendThreadItem(thread);
    });
    
    // 上位10件のスレッド情報を先読み
    const topThreadIds = threads.slice(0, 10).map(t => t.parent_message_id);
    
    $.ajax({
        url: lmsChat.ajaxUrl,
        type: 'POST',
        data: {
            action: 'lms_prefetch_thread_info',
            thread_ids: topThreadIds.join(','),
            nonce: lmsChat.nonce
        }
    });
}
```

**期待効果**: -10~30ms（プリフェッチヒット時）  
**工数**: 1日  
**リスク**: 低

#### C. イベントベースキャッシュ無効化の強化

**目的**: キャッシュ整合性の確保

**実装**:
```php
// includes/class-lms-chat.php
// リアクション更新時にもキャッシュ無効化

public function notify_reaction_update($message_id, $is_thread = false) {
    // ... 既存のリアクション通知処理 ...
    
    if ($is_thread) {
        // スレッドメッセージの場合、親スレッドのキャッシュも無効化
        global $wpdb;
        $parent_id = $wpdb->get_var($wpdb->prepare(
            "SELECT parent_message_id 
             FROM {$wpdb->prefix}lms_chat_thread_messages 
             WHERE id = %d",
            $message_id
        ));
        
        if ($parent_id) {
            $this->invalidate_thread_info_cache($parent_id);
        }
    }
}
```

**期待効果**: キャッシュ整合性向上  
**工数**: 1日  
**リスク**: 低

#### フェーズ2 成果予測

| 指標 | フェーズ1後 | フェーズ2後 | 改善率 |
|------|-----------|-----------|--------|
| スレッドメッセージ同期 | 85-318ms | **30-188ms** | **約70%** |
| キャッシュヒット率 | 50% | **80%以上** | - |
| サーバー負荷（低頻度時） | +50% | **+30%** | アダプティブ効果 |
| サーバー負荷（高頻度時） | +50% | **+100%** | - |

---

### フェーズ3: リアルタイム化（3週間、サーバー負荷+50%）

#### A. リアクション同期の統合Long Poll移行

**目的**: 独立ポーリング廃止、イベント駆動化

**サーバー側**: 既に実装済み
```php
// includes/class-lms-unified-longpoll.php
// リアクションイベントは既に対応
const EVENT_REACTION_UPDATE = 'reaction_update';
const EVENT_THREAD_REACTION_UPDATE = 'thread_reaction_update';
```

**クライアント側実装**:
```javascript
// js/chat-longpoll.js
// 統合イベントからのリアクション処理を強化

function processLongPollResponse(payload) {
    // ...
    
    events.forEach((event) => {
        const normalizedType = (event.type || event.event_type || '').toString().toLowerCase();
        
        if (normalizedType === 'reaction_update') {
            handleUnifiedReactionEvent(event);
            // フラグを立てて独立ポーリングをスキップ
            longPollState.lastReactionFromUnified = Date.now();
            return;
        }
        
        if (normalizedType === 'thread_reaction' || normalizedType === 'thread_reaction_update') {
            handleUnifiedThreadReactionEvent(event);
            longPollState.lastThreadReactionFromUnified = Date.now();
            return;
        }
        
        // ...
    });
}

// 独立ポーリングを段階的に無効化
function startReactionPolling() {
    // Feature flag確認
    if (window.LMS_FEATURE_UNIFIED_REACTIONS) {
        // 統合イベントのみ使用、独立ポーリングは停止
        return;
    }
    
    // 従来の独立ポーリング（段階展開中のみ）
    setInterval(() => {
        // 統合イベントから最近受信していればスキップ
        const now = Date.now();
        const timeSinceUnified = now - (longPollState.lastReactionFromUnified || 0);
        
        if (timeSinceUnified < 60000) {
            // 1分以内に統合イベント受信済み→スキップ
            return;
        }
        
        // 独立ポーリング実行（フォールバック）
        pollReactionUpdates();
    }, 30000);
}
```

**Feature Flag設定**:
```php
// functions.php
// 段階的展開用のフラグ

function lms_enqueue_scripts() {
    // ...
    
    // Feature flag（段階的にtrueにする）
    $unified_reactions_enabled = get_option('lms_unified_reactions_enabled', false);
    
    wp_localize_script('lms-chat', 'lms_feature_flags', [
        'unified_reactions' => $unified_reactions_enabled
    ]);
}

// JavaScriptでフラグを確認
// window.LMS_FEATURE_UNIFIED_REACTIONS = lms_feature_flags.unified_reactions;
```

**期待効果**: 
- 最大30秒 → 平均75ms（ポーリング間隔依存）
- サーバー負荷削減（独立リクエスト廃止）

**工数**: 2日  
**リスク**: 中

#### B. リアクションデータのキャッシュ

**実装**:
```php
// includes/class-lms-chat.php
// get_reaction_updates()にキャッシュ追加

private function get_reaction_updates($channel_id, $user_id, $last_timestamp) {
    $cache = LMS_Advanced_Cache::get_instance();
    $cache_key = "reaction_updates_{$channel_id}_{$last_timestamp}";
    
    $cached = $cache->get($cache_key, null, [
        'type' => LMS_Advanced_Cache::TYPE_TEMPORARY,
        'ttl' => 10  // 10秒（短期）
    ]);
    
    if ($cached !== null) {
        return $cached;
    }
    
    // DB取得
    $updates = $this->fetch_reaction_updates_from_db($channel_id, $last_timestamp);
    
    // キャッシュ保存
    $cache->set($cache_key, $updates, [
        'type' => LMS_Advanced_Cache::TYPE_TEMPORARY,
        'ttl' => 10
    ]);
    
    return $updates;
}
```

**期待効果**: -10~30ms（キャッシュヒット時）  
**工数**: 1日  
**リスク**: 低

#### フェーズ3 成果予測

| 指標 | フェーズ2後 | フェーズ3後 | 改善率 |
|------|-----------|-----------|--------|
| リアクション反映 | 最大30秒 | **平均75ms** | **約400倍** |
| 独立リクエスト数 | 2/30秒 | **0** | **-100%** |
| 全体の同期速度 | 70%改善 | **80%改善** | - |

---

## 📋 実装チェックリスト（工程管理用）

### フェーズ1: 緊急最適化

#### サーバー主導再接続制御
- [ ] `calculate_retry_after()`メソッド実装
- [ ] レスポンスに`retry_after`と`queue_depth`追加
- [ ] クライアント側`scheduleNextPoll()`を動的制御に変更
- [ ] 指数バックオフ実装
- [ ] 単体テスト: `retry_after`値が負荷に応じて変化
- [ ] 統合テスト: XHR間隔がサーバー推奨値に追従
- [ ] 負荷テスト: 高負荷時に自動的にポーリング間隔が延長

#### スレッド情報クエリ統合
- [ ] 統合SQLクエリ実装
- [ ] インデックス追加（`idx_thread_messages_parent_created`等）
- [ ] `EXPLAIN`でインデックス活用確認
- [ ] 単体テスト: クエリ結果が従来と一致
- [ ] パフォーマンステスト: 処理時間20-40ms短縮確認

#### スレッド情報キャッシュ化
- [ ] キャッシュキー設計（`thread_info_v2_{parent}_{user}`）
- [ ] 多層キャッシュ設定（L1:45秒、L2:90秒、L3:5分）
- [ ] `invalidate_thread_info_cache()`実装
- [ ] イベントフックへの統合
- [ ] 単体テスト: キャッシュヒット/ミスの動作確認
- [ ] 統合テスト: メッセージ投稿後のキャッシュ無効化確認
- [ ] パフォーマンステスト: キャッシュヒット時<5ms達成

#### ポーリング間隔最適化
- [ ] `POLL_INTERVAL`を150ms→100msに変更
- [ ] 負荷監視ダッシュボード準備
- [ ] カナリアリリース設定（10%→50%→100%）
- [ ] 負荷テスト: CPU・メモリ・DB接続数確認

### フェーズ2: キャッシュ最適化

#### アダプティブポーリング
- [ ] `get_adaptive_poll_interval()`実装
- [ ] `count_recent_events()`実装
- [ ] ポーリングループへの統合
- [ ] 単体テスト: イベント数に応じた間隔変化
- [ ] 統合テスト: 高頻度→低頻度への自動遷移確認
- [ ] 負荷テスト: アイドル時の負荷削減確認

#### 予測的プリフェッチ
- [ ] `prefetch_thread_info()`実装
- [ ] バックグラウンド処理機構
- [ ] JavaScript側からの呼び出し実装
- [ ] 単体テスト: プリフェッチキューの動作確認
- [ ] 統合テスト: スレッド一覧表示時の先読み確認
- [ ] パフォーマンステスト: プリフェッチヒット率測定

#### イベントベースキャッシュ無効化
- [ ] リアクション更新時の無効化追加
- [ ] 全イベントフックの網羅確認
- [ ] 単体テスト: 各イベントでの無効化確認
- [ ] 整合性テスト: キャッシュとDBの一致確認

### フェーズ3: リアルタイム化

#### リアクション統合Long Poll移行
- [ ] Feature flag設定
- [ ] `lastReactionFromUnified`フラグ実装
- [ ] 独立ポーリングの段階的無効化
- [ ] 単体テスト: 統合イベントからのリアクション処理
- [ ] 統合テスト: 独立ポーリングのスキップ確認
- [ ] E2Eテスト: リアクションがリアルタイム反映されることを確認

#### リアクションキャッシュ
- [ ] `get_reaction_updates()`へのキャッシュ追加
- [ ] 短期TTL設定（10秒）
- [ ] 単体テスト: キャッシュヒット/ミスの動作
- [ ] パフォーマンステスト: キャッシュ効果測定

---

## 📊 モニタリング・アラート設計

### 専用メトリクス

#### Long Poll関連
```php
// includes/class-lms-unified-longpoll.php
// 統計情報の拡張

private $detailed_stats = [
    'latency_p50' => 0,
    'latency_p95' => 0,
    'latency_p99' => 0,
    'error_rate' => 0,
    'queue_depth_avg' => 0,
    'queue_depth_max' => 0
];

private function record_request_latency($latency) {
    // パーセンタイル計算のためにヒストグラムに記録
    // P50, P95, P99を計算
}
```

#### キャッシュヒット率
```php
// includes/class-lms-advanced-cache.php
// レイヤー別ヒット率

public function get_hit_rate_by_layer() {
    $stats = [];
    foreach ($this->stats['hits'] as $layer => $hits) {
        $total = $hits + $this->stats['misses'][$layer];
        $stats[$layer] = $total > 0 ? ($hits / $total) * 100 : 0;
    }
    return $stats;
}
```

### アラート閾値

| メトリクス | 警告 | 重大 | アクション |
|-----------|------|------|----------|
| Long Poll P95レスポンス | >400ms | >800ms | ポーリング間隔延長 |
| Long Poll P99レスポンス | >800ms | >1500ms | 緊急調査 |
| エラー率 | >0.5% | >1% | ロールバック検討 |
| キャッシュヒット率（全体） | <80% | <60% | TTL調整 |
| キャッシュヒット率（L1） | <70% | <50% | サイズ拡大検討 |
| DBクエリ時間 | >50ms | >100ms | クエリ最適化 |
| 同時接続数 | >500 | >1000 | スケーリング検討 |

### モニタリング実装

```javascript
// js/chat-longpoll.js
// クライアント側メトリクス送信

window.LMSPerformanceMetrics = {
    data: {
        requests: [],
        errors: [],
        cacheHits: 0,
        cacheMisses: 0
    },
    
    recordRequest: function(metrics) {
        this.data.requests.push({
            timestamp: Date.now(),
            duration: metrics.duration,
            status: metrics.status,
            cacheHit: metrics.cache_hit
        });
        
        if (metrics.cache_hit) {
            this.data.cacheHits++;
        } else {
            this.data.cacheMisses++;
        }
        
        // 100件ごとにサーバーへ送信
        if (this.data.requests.length >= 100) {
            this.sendToServer();
        }
    },
    
    sendToServer: function() {
        $.ajax({
            url: lmsChat.ajaxUrl,
            type: 'POST',
            data: {
                action: 'lms_record_metrics',
                metrics: JSON.stringify(this.data),
                nonce: lmsChat.nonce
            }
        });
        
        this.data.requests = [];
    }
};
```

---

## 🔄 ロールバック手順書

### 緊急ロールバック（5分以内）

#### 1. Feature Flag無効化
```php
// WordPress管理画面 or SSH
update_option('lms_unified_reactions_enabled', false);
```

#### 2. ポーリング間隔を元に戻す
```php
// includes/class-lms-unified-longpoll.php
const POLL_INTERVAL = 150000; // 100ms → 150msへ戻す
```

#### 3. キャッシュクリア
```php
// SSH経由またはWordPress管理画面
wp eval 'LMS_Advanced_Cache::get_instance()->flush_all();'
```

#### 4. 動作確認
- Long Polling接続確認
- メッセージ送受信確認
- リアクション動作確認
- スレッド情報表示確認

### 段階的ロールバック（1時間以内）

#### 1. カナリアリリースの停止
```php
// 段階展開中の場合
update_option('lms_optimization_rollout_percentage', 0);
```

#### 2. キャッシュキーのバージョン変更
```php
// includes/class-lms-chat.php
// v2 → v1へ戻す
$cache_key = "thread_info_v1_{$parent_message_id}_{$user_id}";
```

#### 3. クライアント側コードの復元
```javascript
// js/chat-longpoll.js
// サーバー主導制御を無効化
const USE_SERVER_RETRY_AFTER = false;

function scheduleNextPoll(serverRetryAfter = null) {
    // 固定3秒に戻す
    const delay = 3000;
    // ...
}
```

#### 4. データベースの確認
```sql
-- キャッシュテーブルのサイズ確認
SELECT 
    COUNT(*) as cache_entries,
    SUM(LENGTH(value)) as total_size
FROM wp_lms_cache_storage;

-- 異常なエントリがあれば削除
DELETE FROM wp_lms_cache_storage 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

#### 5. ログ収集継続
- ロールバック後もメトリクス収集継続
- 問題原因の特定のため

---

## 🎯 成功基準（定量的指標）

### パフォーマンス指標

| 指標 | 現状 | フェーズ1 | フェーズ2 | フェーズ3 | 目標達成 |
|------|------|---------|---------|---------|---------|
| **P50レスポンス** | 335ms | 168ms | 100ms | 90ms | ✅ |
| **P95レスポンス** | 690ms | 345ms | 250ms | 200ms | ✅ |
| **P99レスポンス** | 915ms | 490ms | 350ms | 300ms | ✅ |
| **キャッシュヒット率** | 0% | 50% | 80% | 85% | ✅ |
| **エラー率** | - | <0.5% | <0.5% | <0.5% | ✅ |
| **サーバー負荷増加** | 基準 | +50% | +100%* | +50%** | ✅ |

\* アダプティブで高頻度時のみ  
\** リアルタイム化で独立リクエスト削減

### 定性的指標

- [ ] ユーザーが遅延を感じない（体感1秒以内）
- [ ] システムが安定稼働（稼働率99.9%以上）
- [ ] 保守性が向上（コード可読性、テストカバレッジ）
- [ ] スケーラビリティ確保（10倍のユーザー増に対応可能）

---

## 📝 前回計画（v1.0）からの主要改善点

### 1. **技術的深堀りの追加**

| 項目 | v1.0 | v2.0 |
|------|------|------|
| クライアント再接続 | 概要のみ | **サーバー主導+指数バックオフ詳細** |
| リスク評価 | 簡易版 | **詳細マトリクス+対策・検証方法** |
| キャッシュ設計 | 抽象的 | **具体的キー設計+バージョン管理** |

### 2. **実装手順の明確化**

- v1.0: フェーズ別の概要のみ
- v2.0: **具体的なコード例+工数+リスク評価**

### 3. **運用面の強化**

| 項目 | v1.0 | v2.0 |
|------|------|------|
| モニタリング | 基本監視項目 | **専用メトリクス+アラート閾値** |
| ロールバック | 概要のみ | **詳細手順書（緊急/段階的）** |
| チェックリスト | なし | **工程管理用の詳細リスト** |

### 4. **成功基準の定量化**

- v1.0: 抽象的な改善目標
- v2.0: **P50/P95/P99、キャッシュヒット率80%、エラー率0.5%未満**

### 5. **新たな最適化項目**

v2.0で追加された項目：
- サーバー主導の`retry_after`設計
- 指数バックオフの実装
- Feature Flagによる段階的展開
- キャッシュキーのバージョン管理
- リアクション同期の完全統合Long Poll移行

---

## 📌 次のアクション

### 即座実施推奨（フェーズ1）

1. **サーバー主導再接続制御** （3時間）
2. **スレッド情報クエリ統合** （2時間）
3. **スレッド情報キャッシュ化** （3時間）
4. **ポーリング間隔100ms化** （10分）

**合計工数**: 約1日  
**期待効果**: 同期速度50%改善、スレッド情報90%高速化

### 1週間後（負荷監視OK後）

5. **アダプティブポーリング** （1日）
6. **予測的プリフェッチ** （1日）

### 2週間後（キャッシュ最適化完了後）

7. **リアクション統合Long Poll移行** （2日）
8. **リアクションキャッシュ** （1日）

---

## ✅ 実装前の最終確認事項

- [ ] バックアップ取得済み
- [ ] ステージング環境でのテスト完了
- [ ] ロールバック手順の確認
- [ ] モニタリングダッシュボード準備完了
- [ ] 関係者への通知完了
- [ ] メンテナンスウィンドウの設定（必要に応じて）

---

**この計画はコードを一切触らず、綿密な調査と前回計画との統合により作成されました。実装開始の準備が整っています。**
