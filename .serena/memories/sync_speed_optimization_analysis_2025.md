# LMSチャットシステム同期速度・キャッシュ最適化 調査報告書

**作成日**: 2025-01-XX  
**目的**: スレッドメッセージ、メインメッセージ、スレッド情報の同期速度を高速化し、キャッシュシステムを最適化する

---

## 📊 1. 現状分析

### 1.1 Long Polling実装の詳細

#### サーバー側ポーリング間隔
| 実装 | ファイル | POLL_INTERVAL | 備考 |
|------|---------|--------------|------|
| 統合実装 | class-lms-unified-longpoll.php | 150ms (150000μs) | 段階的最適化ステップ1 |
| 基本実装 | class-lms-chat-longpoll.php | 100ms (100000μs) | 高速化済み |

#### クライアント側設定 (chat-longpoll.js)
- **メインLong Pollingタイムアウト**: 30秒
- **ポーリング再開遅延**: 
  - 通常時: 3秒
  - 非アクティブ時: 10秒
- **リアクションポーリング間隔**: 30秒（サーバー負荷軽減のため延長済み）
- **最大同時リクエスト数**: 2

#### イベントタイプ
統合Long Pollingで対応:
- `message_create` (メインメッセージ作成)
- `message_delete` (メインメッセージ削除)
- `thread_create` (スレッドメッセージ作成)
- `thread_delete` (スレッドメッセージ削除)
- `reaction_update` (メインリアクション更新)
- `thread_reaction` / `thread_reaction_update` (スレッドリアクション更新)
- `thread_summary_update` (スレッドサマリー更新)

### 1.2 キャッシュシステムの現状

#### 多層キャッシュアーキテクチャ (LMS_Advanced_Cache)

| レイヤー | 有効条件 | TTL | 最大サイズ | 用途 |
|---------|---------|-----|-----------|------|
| MEMORY | 常に有効 | 5分 | 100MB | 最速アクセス |
| APCu | extension_loaded('apcu') | 1時間 | 500MB | メモリキャッシュ |
| Redis | extension_loaded('redis') | 24時間 | 2GB | 永続化キャッシュ |
| Memcached | extension_loaded('memcached') | 24時間 | - | 分散キャッシュ |
| FILE | 常に有効 | 7日 | 10GB | ディスクキャッシュ |
| DATABASE | 常に有効 | 30日 | - | 最終フォールバック |

#### キャッシュ機能
- **Prefetch (先読み)**: 有効、最大1000件キュー、バッチサイズ50
- **Writeback (遅延書き込み)**: 有効、最大500件キュー、バッチサイズ25、30秒間隔
- **圧縮**: 有効、1KB以上で圧縮、gzip、バランスレベル
- **ホット検出**: 有効、10回以上アクセスでホット認定、1時間ウィンドウ

### 1.3 スレッド情報更新の処理フロー

#### handle_get_thread_count() の問題点
**現在**: 4つの独立したDBクエリを毎回実行
```php
// 1. COUNT クエリ（スレッドメッセージ数）
SELECT COUNT(*) FROM lms_chat_thread_messages 
WHERE parent_message_id = ? AND deleted_at IS NULL

// 2. 未読カウントクエリ（JOIN含む）
SELECT COUNT(*) FROM lms_chat_thread_messages t
LEFT JOIN lms_chat_thread_last_viewed v ...

// 3. 最新返信クエリ
SELECT t.created_at, u.display_name FROM ...
ORDER BY t.created_at DESC LIMIT 1

// 4. アバター取得クエリ（DISTINCT使用、最大3件）
SELECT u.id as user_id, u.display_name, u.avatar_url
FROM lms_chat_thread_messages t
JOIN lms_users u ON t.user_id = u.id
WHERE t.parent_message_id = ?
GROUP BY u.id
ORDER BY MAX(t.created_at) DESC LIMIT 3
```

**問題**: 
- キャッシュが活用されていない
- 毎回4回のDBクエリ実行
- アバター取得でGROUP BY使用（重い）

**推定処理時間**: 30-80ms (DBクエリ) + ネットワーク遅延

### 1.4 リアクション同期の現状

#### エンドポイント
- `lms_get_reaction_updates`: メインチャットのリアクション更新
  - パラメータ: channel_id, last_timestamp
  - 戻り値: 更新されたメッセージのリアクションデータ配列

- `lms_get_thread_reaction_updates`: スレッドのリアクション更新
  - パラメータ: thread_id(s), last_timestamp
  - 戻り値: 更新されたスレッドメッセージのリアクションデータ配列
  - 最大25スレッドまで同時取得可能

#### 現在のポーリング間隔
- **30秒間隔** (元は3秒、サーバー負荷軽減のため90%削減済み)
- 同時リクエスト数制限: 最大2リクエスト

---

## 🔍 2. ボトルネック特定

### 2.1 主要ボトルネック

| 優先度 | ボトルネック | 影響範囲 | 遅延時間 | 改善難易度 |
|-------|------------|---------|---------|----------|
| ★★★★★ | スレッド情報の毎回DBクエリ | スレッド表示・更新 | 30-80ms/回 | ★★★☆☆ |
| ★★★★★ | ポーリング間隔（統合150ms） | 全イベント検出 | 平均75ms | ★☆☆☆☆ |
| ★★★★☆ | リアクションポーリング30秒間隔 | リアクション反映 | 最大30秒 | ★★☆☆☆ |
| ★★★★☆ | キャッシュ未活用（スレッド情報） | スレッド表示 | 30-80ms | ★★☆☆☆ |
| ★★★☆☆ | クライアント側再開遅延3秒 | ポーリング再開 | 3秒 | ★☆☆☆☆ |
| ★★☆☆☆ | スレッドサマリー更新のバッチ処理 | 大量更新時 | 50ms/バッチ | ★★★☆☆ |

### 2.2 処理時間の内訳（スレッドメッセージ同期の例）

| ステップ | 処理内容 | 推定時間 | 改善可能性 |
|---------|---------|---------|----------|
| 1 | メッセージ投稿 | 50-200ms | 低 |
| 2 | サーバー側DB処理 | 10-50ms | 低 |
| 3 | ポーリング検出待機 | 0-150ms | ★高★ |
| 4 | イベント収集・レスポンス生成 | 10-30ms | 中 |
| 5 | ネットワーク転送 | 10-50ms | 低 |
| 6 | クライアント側処理 | 5-20ms | 低 |
| 7 | スレッド情報更新（4クエリ） | 30-80ms | ★高★ |
| **合計（最小）** | | **115-430ms** | |
| **合計（最大）** | | **215-580ms** | |
| **平均** | | **165-505ms** | |

---

## 💡 3. 最適化戦略

### 3.1 即座実施可能な最適化（フェーズ1）

#### A. ポーリング間隔の最適化
**目標**: サーバー負荷を上げずに検出速度を向上

**段階的アプローチ**:
1. **ステップ1**: 統合実装 150ms → 100ms（-33%遅延）
   - 負荷増加: 1.5倍
   - 期待効果: 平均-25ms

2. **ステップ2**: 統合実装 100ms → 75ms（1週間後、負荷監視後）
   - 負荷増加: 2倍（150ms比）
   - 期待効果: 追加-12.5ms

3. **ステップ3**: アダプティブポーリング導入（2週間後）
   - 高頻度時: 50ms
   - 中頻度時: 100ms
   - 低頻度時: 250ms
   - アイドル時: 500ms
   - 期待効果: 負荷を抑えつつ高速化

#### B. スレッド情報のキャッシュ化
**目標**: DBクエリ削減、レスポンス高速化

**実装方針**:
```php
// 1. 統合クエリへの最適化
// 4つのクエリを1つに統合
SELECT 
    COUNT(*) as total_count,
    SUM(CASE WHEN ... THEN 1 ELSE 0 END) as unread_count,
    MAX(t.created_at) as latest_time,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'user_id', u.id,
        'display_name', u.display_name,
        'avatar_url', u.avatar_url
    )) FROM (
        SELECT DISTINCT u.id, u.display_name, u.avatar_url
        FROM lms_chat_thread_messages t2
        JOIN lms_users u ON t2.user_id = u.id
        WHERE t2.parent_message_id = ?
        ORDER BY t2.created_at DESC LIMIT 3
    ) sub) as avatars
FROM lms_chat_thread_messages t
LEFT JOIN lms_chat_thread_last_viewed v ...
WHERE t.parent_message_id = ?

// 2. キャッシュレイヤー追加
$cache_key = "thread_info_{$parent_message_id}";
$cached = $this->cache->get($cache_key);
if ($cached !== null) {
    return $cached;
}
// DBクエリ実行
$result = $wpdb->get_row(...);
$this->cache->set($cache_key, $result, ['type' => 'session', 'ttl' => 60]);
```

**期待効果**: 
- 初回: -20~40ms (4クエリ→1クエリ)
- 2回目以降: -30~80ms (キャッシュヒット)

#### C. Long Polling統合への移行促進
**目標**: 統合実装の完全採用

**実装**:
- 基本実装から統合実装への段階的移行
- 統合実装のイベントタイプ完全対応確認
- スレッド情報更新イベント (EVENT_THREAD_SUMMARY_UPDATE) の活用

#### D. クライアント側遅延の削除
**目標**: 不要な遅延削除

**実装**:
```javascript
// scheduleNextPoll() の遅延調整
const delay = longPollState.isInactiveMode ? 5000 : 1000; // 3秒→1秒
```

**期待効果**: -2秒（平均-1秒）

### 3.2 キャッシュシステム最適化（フェーズ2）

#### A. スレッド関連データのキャッシュ戦略

**対象データ**:
1. スレッド情報（件数、未読、アバター）
2. スレッドメッセージ一覧
3. スレッドリアクション

**戦略**:
```php
// 1. セッションスコープキャッシュ（短期、高頻度アクセス）
$cache_key = "thread_info_{$parent_message_id}_user_{$user_id}";
$this->cache->set($cache_key, $data, [
    'type' => LMS_Advanced_Cache::TYPE_SESSION,
    'ttl' => 60  // 1分
]);

// 2. ユーザースコープキャッシュ（中期）
$cache_key = "thread_messages_{$parent_message_id}";
$this->cache->set($cache_key, $messages, [
    'type' => LMS_Advanced_Cache::TYPE_USER,
    'ttl' => 300  // 5分
]);

// 3. グローバルキャッシュ（長期、変更頻度低）
$cache_key = "thread_summary_{$parent_message_id}";
$this->cache->set($cache_key, $summary, [
    'type' => LMS_Advanced_Cache::TYPE_GLOBAL,
    'ttl' => 3600  // 1時間
]);
```

#### B. キャッシュ無効化戦略

**イベントベース無効化**:
```php
// スレッドメッセージ作成時
public function on_thread_message_created($parent_message_id) {
    // 関連キャッシュを削除
    $this->cache->delete_pattern("thread_info_{$parent_message_id}*");
    $this->cache->delete_pattern("thread_messages_{$parent_message_id}");
    $this->cache->delete("thread_summary_{$parent_message_id}");
}
```

#### C. プリフェッチ最適化

**予測的キャッシュ**:
- スレッド一覧表示時に上位10件のスレッド情報を先読み
- アクセスパターン学習による予測
- バックグラウンドでの先読み処理

### 3.3 リアクション同期の高速化（フェーズ3）

#### A. Long Pollingへの統合
**目標**: 独立ポーリング廃止、イベント駆動化

**実装**:
- `reaction_update` および `thread_reaction_update` イベントを統合Long Pollingで配信
- 30秒間隔の独立ポーリング廃止
- イベント検出後の即座反映

**期待効果**: 
- 最大30秒 → 平均75ms（統合ポーリング間隔依存）
- サーバー負荷削減（独立リクエスト廃止）

#### B. リアクションデータのキャッシュ
**実装**:
```php
// リアクション取得時のキャッシュ
$cache_key = "message_reactions_{$message_id}";
$cached = $this->cache->get($cache_key);
if ($cached !== null) {
    return $cached;
}
$reactions = $this->get_reactions_from_db($message_id);
$this->cache->set($cache_key, $reactions, [
    'type' => LMS_Advanced_Cache::TYPE_TEMPORARY,
    'ttl' => 300
]);
```

---

## 📋 4. 実装ロードマップ

### フェーズ1: 即座実施（1週間）

| 施策 | 工数 | 期待効果 | リスク |
|------|-----|---------|--------|
| A-1: ポーリング間隔100ms | 10分 | -25ms | 低 |
| A-2: スレッド情報クエリ統合 | 2時間 | -20~40ms | 中 |
| A-3: スレッド情報キャッシュ化 | 3時間 | -30~80ms | 低 |
| A-4: クライアント側遅延削減 | 5分 | -2秒 | 低 |

**合計改善効果**: -50~147ms（初回）、-80~187ms（2回目以降）

### フェーズ2: キャッシュ最適化（2週間）

| 施策 | 工数 | 期待効果 | リスク |
|------|-----|---------|--------|
| B-1: アダプティブポーリング | 1日 | -25~50ms | 中 |
| B-2: スレッドデータキャッシュ戦略 | 2日 | -20~50ms | 低 |
| B-3: キャッシュ無効化最適化 | 1日 | 一貫性向上 | 低 |
| B-4: プリフェッチ強化 | 1日 | -10~30ms | 低 |

**合計改善効果**: フェーズ1 + -55~130ms

### フェーズ3: リアクション最適化（3週間）

| 施策 | 工数 | 期待効果 | リスク |
|------|-----|---------|--------|
| C-1: リアクションLong Polling統合 | 2日 | 最大-30秒 | 中 |
| C-2: リアクションキャッシュ | 1日 | -10~30ms | 低 |
| C-3: バッチ更新最適化 | 1日 | -20~40ms | 中 |

**合計改善効果**: フェーズ1+2 + リアクション大幅高速化

---

## ⚠️ 5. 注意事項とリスク管理

### 5.1 サーバー負荷監視

**必須監視項目**:
- CPU使用率
- メモリ使用率
- データベース接続数
- DBクエリレスポンス時間
- 同時Long Polling接続数

**アラート閾値**:
- CPU > 70%: ポーリング間隔を1段階戻す
- DB接続数 > 80%: ポーリング間隔を2段階戻す
- メモリ使用率 > 85%: キャッシュサイズ削減

### 5.2 段階的ロールアウト

**推奨手順**:
1. 開発環境で完全テスト
2. 本番環境の10%ユーザーで1日テスト
3. 問題なければ50%に拡大
4. 最終的に100%展開

### 5.3 ロールバック計画

**即座ロールバック可能項目**:
- ポーリング間隔（定数変更のみ、再起動不要）
- クライアント側遅延（JavaScriptのみ）
- キャッシュTTL（設定変更のみ）

**データベース変更が必要な項目**:
- スレッド情報クエリ統合（旧クエリも保持）
- 新インデックス追加（削除可能）

---

## 📈 6. 期待される最終成果

### 6.1 パフォーマンス目標

| 指標 | 現状 | フェーズ1後 | フェーズ2後 | フェーズ3後 |
|------|------|-----------|-----------|-----------|
| スレッドメッセージ同期 | 165-505ms | 85-318ms | 30-188ms | 30-188ms |
| メインメッセージ同期 | 135-480ms | 60-293ms | 25-163ms | 25-163ms |
| スレッド情報更新 | 30-80ms | 10-40ms | <5ms | <5ms |
| リアクション反映 | 最大30秒 | 最大30秒 | 最大30秒 | 平均75ms |
| サーバー負荷 | 基準 | +50% | +100% | +50% |

### 6.2 成功基準

**短期（フェーズ1完了時）**:
- ✅ 平均同期速度: 50%改善
- ✅ スレッド情報取得: 50%高速化
- ✅ サーバー負荷増加: 50%以内

**中期（フェーズ2完了時）**:
- ✅ 平均同期速度: 70%改善
- ✅ キャッシュヒット率: 70%以上
- ✅ サーバー負荷: アダプティブで抑制

**長期（フェーズ3完了時）**:
- ✅ リアクション反映: ほぼリアルタイム（1秒以内）
- ✅ 全体の同期速度: 80%改善
- ✅ ユーザー体験: 遅延を感じない

---

## 🔧 7. 実装時の技術的考慮事項

### 7.1 データベースインデックス

**追加推奨インデックス**:
```sql
-- スレッド情報取得の高速化
CREATE INDEX idx_thread_messages_parent_created 
ON lms_chat_thread_messages(parent_message_id, created_at DESC, deleted_at);

-- 未読カウントの高速化
CREATE INDEX idx_thread_last_viewed_composite
ON lms_chat_thread_last_viewed(parent_message_id, user_id, last_viewed_at);
```

### 7.2 キャッシュキー設計

**命名規則**:
```
{scope}_{entity}_{id}_{user_id}
例: session_thread_info_123_45
   user_thread_messages_123
   global_thread_summary_123
```

### 7.3 エラーハンドリング

**キャッシュ失敗時のフォールバック**:
```php
try {
    $result = $this->cache->get($key);
    if ($result === null) {
        $result = $this->fetchFromDatabase();
        $this->cache->set($key, $result);
    }
} catch (Exception $e) {
    // キャッシュ失敗時はDB直接取得
    $result = $this->fetchFromDatabase();
}
```

---

## 📝 8. まとめ

### 主要な最適化ポイント

1. **ポーリング間隔の段階的短縮**: 150ms → 100ms → 75ms → アダプティブ
2. **スレッド情報のキャッシュ化**: 4クエリ→1クエリ + キャッシュ活用
3. **リアクション同期のLong Polling統合**: 30秒間隔 → ほぼリアルタイム
4. **多層キャッシュ戦略の活用**: セッション・ユーザー・グローバルスコープ
5. **クライアント側遅延の最適化**: 不要な待機時間削除

### 実装の優先順位

**最優先（今週中）**:
- ポーリング間隔100ms化
- スレッド情報クエリ統合
- スレッド情報キャッシュ化

**高優先（2週間以内）**:
- アダプティブポーリング
- キャッシュ戦略の完全実装

**中優先（3週間以内）**:
- リアクションLong Polling統合
- プリフェッチ強化

この計画により、**サーバー負荷を抑えながら同期速度を50-80%改善**できる見込みです。
