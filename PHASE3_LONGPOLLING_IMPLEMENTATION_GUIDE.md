# Phase 3: Long Polling最適化実装ガイド

**作成日**: 2025-01-10
**Phase**: Phase 3 - Long Polling最適化
**目標**: サーバー負荷を20-30%削減（アイドル時）

---

## 📋 実装概要

Phase 3では、Long Pollingシステムにアダプティブ待機機能を追加し、サーバー負荷を削減します。

### Phase 3.1: サーバー側アダプティブ待機（実装済み）

Long Polling時の待機間隔を動的に調整し、アイドル時のCPU使用率を削減します。

**実装内容**:
- **0-1.5秒**: 高頻度チェック（150ms間隔）
- **1.5-3秒**: 中頻度チェック（300ms間隔）
- **3秒以上**: 低頻度チェック（600ms間隔）

**修正ファイル**: `includes/class-lms-unified-longpoll.php`

**追加メソッド**:
1. `poll_for_unified_events()` - アダプティブ待機対応版に更新
2. `get_queue_depth()` - キュー深度の取得
3. `calculate_retry_after_v4()` - retry_afterの計算
4. `handle_unified_long_poll()` - レスポンスにretry_after追加

### Phase 3.2: クライアント側動的調整（未実装）

クライアント側でサーバー推奨値を使用し、再接続遅延を動的に調整します。

**実装予定**: 将来のフェーズで実装

---

## 🚀 デプロイ手順

### ステップ1: コード確認

修正済みファイル:
- `includes/class-lms-unified-longpoll.php`

追加メソッド:
- `poll_for_unified_events()` - Feature Flag対応
- `get_queue_depth()` - 未処理イベント数取得
- `calculate_retry_after_v4()` - サーバー負荷に応じたretry_after計算
- `handle_unified_long_poll()` - retry_afterとqueue_depthをレスポンスに追加

### ステップ2: 前提条件の確認

```bash
# Phase 1とPhase 2が有効化されているか確認
wp option get lms_optimized_thread_query_v4
# => 1 (有効)

wp option get lms_thread_cache_enabled_v4
# => 1 (有効)
```

### ステップ3: Phase 3.1の有効化

```bash
# アダプティブポーリングを有効化
wp option update lms_adaptive_polling_v4 1

# 確認
wp option get lms_adaptive_polling_v4
# => 1
```

**期待される効果**:
- **アイドル時のサーバー負荷**: **20-30%削減**
- **イベント検出速度**: 維持（変化なし）
- **レスポンスにretry_after情報**: 含まれる

---

## 🧪 テスト手順

### テスト1: アダプティブ待機の動作確認

1. ブラウザの開発者ツールを開く
2. Networkタブで`lms_unified_long_poll`を監視
3. メッセージを投稿せずに待機
4. レスポンスを確認:
   ```json
   {
     "success": true,
     "data": {
       "events": [],
       "retry_after": 500,      // サーバー推奨値
       "queue_depth": 0,        // キュー深度
       "system": "unified_longpoll"
     }
   }
   ```

**期待結果**: retry_afterとqueue_depthが含まれる

### テスト2: 負荷に応じたretry_after

1. 複数のメッセージを連続投稿
2. Long Pollレスポンスを確認
3. queue_depthが増加すると、retry_afterも増加することを確認

**queue_depth → retry_after対応**:
- 0-10: 500ms（通常）
- 11-50: 1000ms（低負荷）
- 51-100: 2000ms（中負荷）
- 101以上: 5000ms（高負荷）

### テスト3: メッセージ同期確認

1. 2つのブラウザでログイン
2. ブラウザAでメッセージを投稿
3. ブラウザBで自動的にメッセージが表示されることを確認

**期待結果**: Phase 3実装後もメッセージ同期が100%正常に動作

### テスト4: サーバー負荷確認

```bash
# サーバーCPU使用率を確認（macOS）
top -l 1 | grep "CPU usage"

# または
ps aux | grep php | awk '{sum+=$3} END {print "Total PHP CPU:", sum "%"}'
```

**期待結果**: アイドル時のCPU使用率が20-30%削減

---

## 📊 パフォーマンス測定

### 測定項目

1. **サーバー負荷（アイドル時）**
   ```bash
   # 10分間のCPU使用率平均を測定
   while true; do
     ps aux | grep php-fpm | awk '{sum+=$3} END {print strftime("%H:%M:%S"), "CPU:", sum "%"}'
     sleep 60
   done
   ```

2. **イベント検出速度**
   - ブラウザAでメッセージ投稿
   - ブラウザBで受信するまでの時間を測定
   - 10回測定して平均値を算出

3. **Long Pollレスポンス時間**
   - 開発者ツールのNetworkタブで測定
   - 平均レスポンス時間を確認

### 期待値

| 指標 | Phase 2のみ | Phase 3.1追加 | 改善率 |
|------|------------|--------------|--------|
| **サーバーCPU（アイドル時）** | 基準 | **-20～-30%** | 削減 |
| **イベント検出速度** | 165-355ms | **165-355ms** | 変化なし |
| **レスポンス時間（P50）** | 30-100ms | **30-100ms** | 変化なし |

---

## 🔄 ロールバック手順

### Phase 3.1のみ無効化

```bash
# アダプティブポーリングを無効化
wp option update lms_adaptive_polling_v4 0
```

**結果**: 固定間隔（150ms）に戻る

### Phase全体を無効化

```bash
# Phase 3を無効化
wp option update lms_adaptive_polling_v4 0

# Phase 2も無効化する場合
wp option update lms_thread_cache_enabled_v4 0
wp option update lms_thread_prefetch_enabled_v4 0

# Phase 1も無効化する場合
wp option update lms_optimized_thread_query_v4 0
```

---

## 🐛 トラブルシューティング

### 問題1: retry_afterが含まれない

**症状**: レスポンスに`retry_after`と`queue_depth`が含まれない

**確認事項**:
```bash
# Feature Flagが有効か確認
wp option get lms_adaptive_polling_v4
# => 1 であること
```

**対処法**:
```bash
# Feature Flagを再設定
wp option update lms_adaptive_polling_v4 1
```

### 問題2: メッセージ同期が遅い

**症状**: メッセージが表示されるまで時間がかかる

**確認事項**:
- イベント検出速度は維持されているはず
- retry_afterが大きすぎないか確認

**対処法**:
```bash
# キュー深度を確認
wp db query "SELECT COUNT(*) as count FROM wp_lms_chat_realtime_events WHERE expires_at > UNIX_TIMESTAMP();"

# キューが多すぎる場合はクリーンアップ
wp eval "LMS_Unified_LongPoll::get_instance()->cleanup_expired_events();"
```

### 問題3: サーバー負荷が増加

**症状**: アイドル時でもサーバー負荷が高い

**確認事項**:
```bash
# アダプティブ待機が有効か確認
wp option get lms_adaptive_polling_v4
# => 1 であること
```

**対処法**:
- Phase 3.1を一時的に無効化してテスト
- データベースのクリーンアップを実行

---

## 📈 統計の確認

### サーバー側統計

```bash
# キュー深度を確認
wp db query "SELECT COUNT(*) as pending_events FROM wp_lms_chat_realtime_events WHERE expires_at > UNIX_TIMESTAMP();"

# イベントテーブルサイズを確認
wp db query "SELECT
    table_name,
    ROUND(data_length / 1024 / 1024, 2) AS data_mb,
    ROUND(index_length / 1024 / 1024, 2) AS index_mb,
    table_rows
FROM information_schema.tables
WHERE table_name = 'wp_lms_chat_realtime_events';"
```

### クライアント側統計

ブラウザコンソールで実行:
```javascript
// Long Poll統計を確認
if (window.unifiedLongPoll) {
    console.log('Long Poll Stats:', window.unifiedLongPoll.getStats());
}
```

---

## ✅ Phase 3.1完了チェックリスト

- [ ] `class-lms-unified-longpoll.php`の構文チェックが成功
- [ ] Feature Flag `lms_adaptive_polling_v4` を有効化
- [ ] テスト1: retry_afterとqueue_depthが含まれる ✓
- [ ] テスト2: 負荷に応じたretry_after値の変化 ✓
- [ ] テスト3: メッセージ同期確認 ✓
- [ ] テスト4: サーバー負荷削減確認 ✓
- [ ] アイドル時のCPU使用率が20-30%削減
- [ ] イベント検出速度が維持される
- [ ] エラーが発生していない

---

## 🎯 Phase 3.2について（将来の実装）

Phase 3.2（クライアント側動的調整）は、以下の機能を含みます:

1. **サーバー推奨値の使用**
   - レスポンスの`retry_after`を使用
   - 再接続遅延を動的に調整

2. **Page Visibility API対応**
   - バックグラウンド時は10秒以上の遅延
   - アクティブ時は通常の遅延

3. **動的調整ロジック**
   - 最近の遅延の中央値を計算
   - 1.2倍の係数で調整

**実装ファイル**: `js/chat-longpoll.js` または `js/lms-unified-longpoll.js`

現時点では、Phase 3.1（サーバー側のみ）でも十分な効果があるため、Phase 3.2は将来のフェーズで実装することをお勧めします。

---

## 📝 次のステップ

Phase 3.1が正常に動作したら、**1週間の観測期間**を設けてください。

観測項目:
- サーバーCPU使用率（アイドル時・高負荷時）
- イベント検出速度（P50, P95, P99）
- エラー率
- キュー深度の推移

観測期間後、問題がなければ **Phase 3.2（クライアント側動的調整）** への進行を検討できます。

---

**Phase 3.1実装完了日**: _________
**Phase 3.1有効化日**: _________
**観測期間終了予定日**: _________
