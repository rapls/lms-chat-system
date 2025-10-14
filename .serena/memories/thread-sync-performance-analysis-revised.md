# スレッド情報同期パフォーマンス分析レポート（改訂版）

作成日: 2025-01-07
改訂版: 詳細調査に基づく評価とブラッシュアップ

## 1. 詳細調査結果

### 1.1 重要な発見事項

#### ❌ 発見1: 遅延削除が不完全
**chat-longpoll.js に100msの遅延が残っている**

```javascript
// 行604-611（投稿時）
setTimeout(() => {
    if (typeof window.refreshThreadInfo === 'function') {
        console.log('🧵 [THREAD_INFO] 受信側：refreshThreadInfo 呼び出し:', { parentMessageId });
        window.refreshThreadInfo(parentMessageId);
    }
}, 100);  // ← まだ残っている！

// 行665-675（削除時）
setTimeout(() => {
    if (typeof window.refreshThreadInfo === 'function') {
        window.refreshThreadInfo(parentMessageId);
    }
}, 100);  // ← まだ残っている！
```

**影響**: 各イベントで100msの遅延が発生

#### ✅ 発見2: refreshThreadInfo() の詳細実装

**js/chat-threads.js:4135-4220**
```javascript
$.ajax({
    url: lmsChat.ajaxUrl,
    type: 'GET',
    timeout: 1000,  // 1秒のタイムアウト
    cache: false,
    data: {
        action: 'lms_get_thread_count',
        parent_message_id: parentMessageId,
        nonce: lmsChat.nonce,
    },
    // ...
});
```

**サーバー側の処理**（includes/class-lms-chat.php:7142-7220）:
1. COUNT クエリ（スレッドメッセージ数）
2. 未読カウントクエリ（JOIN含む）
3. 最新返信クエリ
4. アバター取得クエリ（最大3件、DISTINCT使用）

**推定処理時間**: 30-80ms（DBクエリ）+ ネットワーク遅延

#### ✅ 発見3: ポーリング間隔の実態

**基本実装（class-lms-chat-longpoll.php）**:
```php
const POLL_INTERVAL = 100000; // 100ms = 0.1秒
```

**統合実装（class-lms-unified-longpoll.php）**:
```php
const POLL_INTERVAL = 250000; // 250ms = 0.25秒
```

**同時接続制限**:
```javascript
// chat-longpoll.js
maxConcurrentRequests: 2  // 最大2接続
```

### 1.2 修正された処理フロー図

```
[投稿者側] メッセージ投稿
    ↓ 50-200ms (Ajax)
[サーバー] DBに保存・イベント記録
    ↓
[ポーリングループ] 0-250msのランダム遅延で検出
    ↓ 10-30ms (イベント収集)
[同期側クライアント] ロングポーリングレスポンス受信
    ↓ 5-20ms (イベント処理)
[handleNewThreadMessage] 呼び出し
    ↓ **100ms 遅延** ← まだ残っている！
[refreshThreadInfo] Ajax呼び出し
    ↓ 50-200ms (ネットワーク + DBクエリ)
[サーバー] 4つのDBクエリ実行（30-80ms）
    ↓ 10-50ms (ネットワーク)
[クライアント] UI更新
    ↓ 5-15ms (DOM操作)
完了
```

### 1.3 正確な処理時間の内訳

| ステップ | 処理内容 | 推定時間 | 備考 |
|---------|---------|---------|------|
| 1 | メッセージ投稿 Ajax | 50-200ms | |
| 2 | サーバー側DB処理 | 10-50ms | |
| 3 | **ポーリング検出待機** | **0-250ms** | **最大遅延** |
| 4 | イベント収集・レスポンス生成 | 10-30ms | |
| 5 | ネットワーク転送 | 10-50ms | |
| 6 | イベントハンドラー実行 | 5-20ms | |
| 7 | **setTimeout 遅延** | **100ms** | **削除漏れ** |
| 8 | refreshThreadInfo Ajax | 50-200ms | timeout設定1秒 |
| 9 | サーバー側4つのクエリ | 30-80ms | COUNT, 未読, 最新, アバター |
| 10 | レスポンス転送 | 10-50ms | |
| 11 | UI更新 | 5-15ms | |
| **合計（最小）** | | **180-465ms** | 理想的なケース |
| **合計（最大）** | | **490-915ms** | 最悪ケース |
| **平均** | | **335-690ms** | 通常ケース |

### 1.4 ボトルネックの再評価

| 優先度 | ボトルネック | 遅延時間 | 改善難易度 | 改善効果 |
|--------|------------|---------|----------|---------|
| ★★★★★ | setTimeout 100ms（削除漏れ）| 100ms | ★☆☆☆☆ | 即座 |
| ★★★★★ | ポーリング検出遅延 | 0-250ms（平均125ms）| ★☆☆☆☆ | 高 |
| ★★★★☆ | refreshThreadInfo の追加Ajax | 50-200ms | ★★☆☆☆ | 高 |
| ★★★☆☆ | サーバー側の4つのDBクエリ | 30-80ms | ★★★☆☆ | 中 |
| ★★☆☆☆ | ポーリング再開遅延（3秒）| 次回影響 | ★☆☆☆☆ | 低 |

## 2. 改善計画の評価とブラッシュアップ

### 2.1 フェーズ1: 緊急修正（即座実装、30分）

#### 🔴 A-0: setTimeout 100ms の削除（最優先）

**現状**: chat-longpoll.js に削除漏れがある

**対策**:
```javascript
// 行604-611 を修正
// 変更前
setTimeout(() => {
    if (typeof window.refreshThreadInfo === 'function') {
        window.refreshThreadInfo(parentMessageId);
    }
}, 100);

// 変更後
if (typeof window.refreshThreadInfo === 'function') {
    window.refreshThreadInfo(parentMessageId);
}

// 行665-675 も同様に修正
```

- **期待効果**: -100ms（確実）
- **実装難易度**: ★☆☆☆☆（超簡単）
- **リスク**: なし
- **変更範囲**: js/chat-longpoll.js の2箇所のみ

#### 🟡 A-1: ポーリング間隔の段階的最適化

**重要な制約**: サーバー負荷を考慮して段階的に実施

**ステップ1（即座実装）**: 250ms → 150ms
```php
// includes/class-lms-unified-longpoll.php
const POLL_INTERVAL = 150000; // 0.15秒
```

- **期待効果**: -50ms（平均）
- **負荷増加**: 1.67倍（250ms → 150ms）
- **リスク**: 低

**ステップ2（1週間後、負荷監視後）**: 150ms → 100ms
- **期待効果**: 追加-25ms
- **負荷増加**: 2.5倍（250ms → 100ms）

**ステップ3（2週間後、負荷監視後）**: 100ms → 50ms
- **期待効果**: 追加-25ms
- **負荷増加**: 5倍（250ms → 50ms）

**サーバー負荷の具体的計算**:

現状（統合実装）:
- ポーリング間隔: 250ms
- 1秒あたりのチェック回数: 4回
- 10ユーザーが同時接続: 40回/秒
- 100ユーザーが同時接続: 400回/秒

50msに変更した場合:
- ポーリング間隔: 50ms
- 1秒あたりのチェック回数: 20回
- 10ユーザーが同時接続: 200回/秒（5倍）
- 100ユーザーが同時接続: 2000回/秒（5倍）

**対策**: アダプティブポーリング（次のフェーズ）で負荷を軽減

#### 🟢 A-2-修正版: スレッド情報のレスポンス同梱（見直し）

**元の計画を再評価**:

❌ **問題点**:
1. refreshThreadInfo() は lms_get_thread_count を呼び出している
2. サーバー側で4つの独立したDBクエリを実行
3. アバター画像URLも含まれる
4. ロングポーリングレスポンスに含めるにはサーバー側の大幅な変更が必要

✅ **改善案**:

**オプション2A: 軽量版スレッド情報の同梱**
- 件数のみを同梱（アバターは後で取得）
- サーバー側の変更を最小限に

```php
// includes/class-lms-unified-longpoll.php
// イベント生成時にスレッド件数を追加
$event = [
    'type' => 'thread_message_created',
    'data' => $message_data,
    'thread_count' => $thread_count  // ← COUNT のみ追加
];
```

```javascript
// js/chat-longpoll.js
// クライアント側で件数のみ即座に更新
if (event.thread_count !== undefined) {
    updateThreadCountOnly(parentMessageId, event.thread_count);
}
// アバター更新は後で非同期に
setTimeout(() => refreshThreadAvatars(parentMessageId), 500);
```

- **期待効果**: -30~50ms（部分的改善）
- **実装難易度**: ★★☆☆☆
- **リスク**: 低

**オプション2B: 完全版スレッド情報の同梱**
- 件数、アバター、最新返信をすべて同梱
- refreshThreadInfo の Ajax を完全に削除

- **期待効果**: -50~200ms（最大改善）
- **実装難易度**: ★★★☆☆
- **リスク**: 中（レスポンスサイズ増加）

**推奨**: オプション2A（軽量版）から開始

### 2.2 フェーズ1の修正版サマリー

| 施策 | 改善効果 | 難易度 | リスク | 優先度 |
|------|---------|--------|--------|--------|
| A-0: setTimeout削除 | **-100ms** | ★☆☆☆☆ | なし | ★★★★★ |
| A-1: ポーリング150ms | **-50ms** | ★☆☆☆☆ | 低 | ★★★★☆ |
| A-2A: 軽量版同梱 | -30~50ms | ★★☆☆☆ | 低 | ★★★☆☆ |

**合計改善効果**: **180-200ms短縮**
**実装後の反映時間**: **155-490ms**（現状の約半分）

### 2.3 フェーズ2: 中期施策の見直し（1週間）

#### B-1-修正版: アダプティブポーリング間隔

**目的**: ポーリング間隔短縮による負荷増加を緩和

```php
class AdaptivePolling {
    private $intervals = [
        'high_activity' => 50000,    // 50ms（高頻度）
        'medium_activity' => 100000, // 100ms（中頻度）
        'low_activity' => 250000,    // 250ms（低頻度）
        'idle' => 500000             // 500ms（アイドル）
    ];
    
    public function getCurrentInterval() {
        $recent_events = $this->countRecentEvents(60); // 過去60秒
        
        if ($recent_events > 20) return $this->intervals['high_activity'];
        if ($recent_events > 5) return $this->intervals['medium_activity'];
        if ($recent_events > 0) return $this->intervals['low_activity'];
        return $this->intervals['idle'];
    }
}
```

**効果**:
- 高頻度時: 平均125ms短縮
- 中頻度時: 平均75ms短縮
- 低頻度時: 負荷削減（現状と同じ）

- **実装難易度**: ★★★☆☆
- **リスク**: 低
- **優先度**: ★★★★☆

#### B-2-修正版: DBクエリの最適化

**refreshThreadInfo で実行される4つのクエリ**:

現状:
```sql
-- 1. COUNT クエリ
SELECT COUNT(*) FROM lms_chat_thread_messages 
WHERE parent_message_id = ? AND deleted_at IS NULL

-- 2. 未読カウント（JOIN含む）
SELECT COUNT(*) FROM lms_chat_thread_messages t
LEFT JOIN lms_chat_thread_last_viewed v ...

-- 3. 最新返信
SELECT created_at, display_name FROM ...
ORDER BY created_at DESC LIMIT 1

-- 4. アバター（DISTINCT使用）
SELECT DISTINCT user_id, display_name, avatar_url ...
ORDER BY created_at DESC LIMIT 3
```

**最適化案**:

```sql
-- 単一クエリで全情報を取得
SELECT 
    COUNT(*) as total_count,
    SUM(CASE WHEN ... THEN 1 ELSE 0 END) as unread_count,
    MAX(t.created_at) as latest_time,
    (SELECT GROUP_CONCAT(DISTINCT ...) 
     FROM ... LIMIT 3) as avatars
FROM lms_chat_thread_messages t
LEFT JOIN lms_chat_thread_last_viewed v ...
WHERE t.parent_message_id = ?
AND t.deleted_at IS NULL
```

- **期待効果**: -20~40ms
- **実装難易度**: ★★★☆☆
- **リスク**: 低
- **優先度**: ★★★☆☆

#### B-3: イベントキャッシュの導入（変更なし）

元の計画通り

### 2.4 フェーズ3: 長期施策の見直し

#### C-1: WebSocket導入の再評価

**詳細な比較**:

| 項目 | ロングポーリング | WebSocket |
|------|----------------|-----------|
| レイテンシ | 50-250ms | 5-50ms |
| サーバー負荷 | 高（ポーリング） | 低（イベント駆動）|
| 実装コスト | 低 | 高 |
| インフラ要件 | 標準HTTP | WebSocketサーバー |
| 互換性 | 高 | 中（IE非対応）|
| 運用コスト | 低 | 高（接続管理）|
| スケーラビリティ | 中 | 高 |
| フォールバック | 不要 | 必要 |

**推奨**: 
- 現時点では保留
- フェーズ1、2の効果を測定後に判断
- 目標反映時間（150ms以下）を達成できれば不要

## 3. 修正版ロードマップ

### 🚀 フェーズ1A: 緊急修正（30分、即座実装）

| 施策 | 期待効果 | 優先度 |
|------|---------|--------|
| A-0: setTimeout削除 | -100ms | ★★★★★ |

**実装後**: 235-590ms（-100ms）

### 🚀 フェーズ1B: 即座実装（1日）

| 施策 | 期待効果 | 優先度 |
|------|---------|--------|
| A-1: ポーリング→150ms | -50ms | ★★★★☆ |
| A-2A: 軽量版同梱 | -30~50ms | ★★★☆☆ |

**累積効果**: -180~200ms
**実装後**: 135-490ms（現状の約50%改善）

### 📈 フェーズ2: 中期施策（1週間）

| 施策 | 期待効果 | 優先度 |
|------|---------|--------|
| A-1続き: →100ms | -25ms | ★★★★☆ |
| B-1: アダプティブ | -50~75ms | ★★★★☆ |
| B-2: クエリ最適化 | -20~40ms | ★★★☆☆ |

**累積効果**: -275~340ms
**実装後**: 60-350ms

### 🎯 フェーズ3: 最終調整（2週間）

| 施策 | 期待効果 | 優先度 |
|------|---------|--------|
| A-1完了: →50ms | -25ms | ★★★☆☆ |
| A-2B: 完全版同梱 | +50ms | ★★☆☆☆ |
| B-3: キャッシュ | -20~40ms | ★★☆☆☆ |

**累積効果**: -370~455ms
**実装後**: 35-245ms

## 4. 修正されたパフォーマンス目標

| フェーズ | 反映時間（平均） | 改善率 | 実装期間 |
|---------|----------------|--------|---------|
| **現状** | **335-690ms** | - | - |
| フェーズ1A | 235-590ms | 30%改善 | 30分 |
| フェーズ1B | **135-490ms** | **50%改善** | 1日 |
| フェーズ2 | 60-350ms | 70%改善 | 1週間 |
| フェーズ3 | 35-245ms | 85%改善 | 2週間 |

## 5. 実装上の注意事項

### 5.1 サーバー負荷の監視

**必須監視項目**:
- CPU使用率
- メモリ使用率
- データベース接続数
- DBクエリレスポンス時間
- 同時ロングポーリング接続数

**アラート閾値**:
- CPU > 70%: ポーリング間隔を1段階戻す
- DB接続数 > 80%: ポーリング間隔を2段階戻す

### 5.2 段階的ロールアウト

**推奨手順**:
1. 本番環境の10%のユーザーで1日テスト
2. 問題なければ50%に拡大
3. 最終的に100%展開

### 5.3 ロールバック計画

各フェーズで問題が発生した場合:
- 定数を元の値に戻す
- サーバー再起動不要
- 即座にロールバック可能

## 6. 最終推奨事項

### 🎯 最優先（今すぐ実施）

**A-0: setTimeout 100ms の削除**
- 労力: 5分
- 効果: -100ms
- リスク: なし

### 🎯 第2優先（今日中に実施）

**A-1: ポーリング間隔 250ms → 150ms**
- 労力: 5分
- 効果: -50ms
- リスク: 低（負荷1.67倍）

### 🎯 第3優先（今週中に実施）

**A-2A: 軽量版スレッド情報同梱**
- 労力: 2-3時間
- 効果: -30~50ms
- リスク: 低

**合計改善**: **180-200ms短縮**で、反映時間を**現状の半分**に削減可能

## 7. 成功基準

### 短期目標（フェーズ1B完了時）
- 平均反映時間: 300ms以下
- 95パーセンタイル: 500ms以下
- サーバー負荷増加: 2倍以内

### 中期目標（フェーズ2完了時）
- 平均反映時間: 150ms以下
- 95パーセンタイル: 300ms以下
- サーバー負荷: アダプティブで抑制

### 長期目標（フェーズ3完了時）
- 平均反映時間: 100ms以下
- 95パーセンタイル: 200ms以下
- WebSocket不要と判断