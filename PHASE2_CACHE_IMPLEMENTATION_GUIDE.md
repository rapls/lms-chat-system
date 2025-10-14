# Phase 2: キャッシュシステム実装ガイド

**作成日**: 2025-01-10
**Phase**: Phase 2 - キャッシュシステム構築
**目標**: スレッド情報取得を93%高速化（キャッシュヒット時）

---

## 📋 実装概要

Phase 2では、Phase 1で最適化したクエリにキャッシュレイヤーを追加し、さらなる高速化を実現します。

### 実装内容

1. **handle_get_thread_count_optimized_v4にキャッシュレイヤー追加**
   - L1: メモリキャッシュ（15秒TTL）
   - L2: APCuキャッシュ（60秒TTL）
   - L3: ファイルキャッシュ（180秒TTL）

2. **キャッシュ無効化フックの実装**
   - スレッドメッセージ作成時に自動無効化
   - メッセージ削除時に自動無効化

3. **Prefetch機能の実装**
   - メッセージ一覧取得時に上位10件を先読み
   - キャッシュヒット率を50%→70%に向上

---

## 🚀 デプロイ手順

### ステップ1: コード確認

修正済みファイル:
- `includes/class-lms-chat.php`

追加メソッド:
- `handle_get_thread_count_optimized_v4()` - キャッシュ対応版に更新
- `fetch_thread_count_from_db_v4()` - DB取得処理を分離
- `invalidate_thread_cache_v4()` - キャッシュ無効化（作成時）
- `invalidate_thread_cache_on_delete_v4()` - キャッシュ無効化（削除時）
- `prefetch_thread_info_v4()` - Prefetch処理

### ステップ2: 前提条件の確認

```bash
# Phase 1が有効化されているか確認
wp option get lms_optimized_thread_query_v4
# => 1 (有効) または false (無効)

# LMS_Advanced_Cacheが利用可能か確認
wp eval "echo class_exists('LMS_Advanced_Cache') ? 'OK' : 'NG';"
# => OK が表示されること
```

### ステップ3: Phase 2.1 - キャッシュ機能の有効化

```bash
# キャッシュ機能を有効化
wp option update lms_thread_cache_enabled_v4 1

# 確認
wp option get lms_thread_cache_enabled_v4
# => 1
```

**期待される効果**:
- キャッシュヒット時: **5ms以下** （従来30-80ms → 約93%短縮）
- キャッシュミス時: **20-40ms** （Phase 1と同等）

### ステップ4: Phase 2.2 - Prefetch機能の有効化

```bash
# Prefetch機能を有効化
wp option update lms_thread_prefetch_enabled_v4 1

# 確認
wp option get lms_thread_prefetch_enabled_v4
# => 1
```

**期待される効果**:
- キャッシュヒット率: **50%→70%**
- 体感速度の大幅向上

---

## 🧪 テスト手順

### テスト1: キャッシュ動作確認

1. ブラウザでチャット画面を開く
2. スレッドボタンをクリック（スレッド情報を取得）
3. ブラウザの開発者ツールで応答を確認:
   ```json
   {
     "success": true,
     "data": {
       "count": 5,
       "unread": 2,
       "cache_hit": false,  // 1回目はfalse
       "version": "v4_optimized"
     }
   }
   ```

4. 同じスレッドボタンをもう一度クリック
5. 応答を確認:
   ```json
   {
     "success": true,
     "data": {
       "count": 5,
       "unread": 2,
       "cache_hit": true,  // 2回目はtrue
       "version": "v4_optimized"
     }
   }
   ```

**期待結果**: 2回目のレスポンス時間が大幅に短縮（5ms以下）

### テスト2: キャッシュ無効化確認

1. スレッドにメッセージを投稿
2. スレッドボタンをクリック
3. 応答を確認:
   ```json
   {
     "success": true,
     "data": {
       "count": 6,  // カウントが増えている
       "cache_hit": false,  // キャッシュが無効化されている
       "version": "v4_optimized"
     }
   }
   ```

**期待結果**: メッセージ投稿後、キャッシュが自動的に無効化される

### テスト3: Prefetch動作確認

1. チャンネルを切り替えてメッセージ一覧を取得
2. ブラウザの開発者ツールのNetworkタブで確認
3. 最初のスレッドボタンをクリック
4. レスポンス時間が非常に短いことを確認（Prefetchが効いている）

**期待結果**: 一覧表示後、最初の数件のスレッド情報が即座に表示される

### テスト4: メッセージ同期確認

1. 2つのブラウザでログイン（異なるユーザー）
2. ブラウザAでスレッドにメッセージを投稿
3. ブラウザBで自動的にメッセージが表示されることを確認

**期待結果**: キャッシュ実装後もメッセージ同期が100%正常に動作

---

## 📊 パフォーマンス測定

### 測定項目

```javascript
// ブラウザコンソールで実行
const startTime = performance.now();
// スレッドボタンをクリック
// レスポンス受信後
const endTime = performance.now();
console.log(`Response time: ${endTime - startTime}ms`);
```

### 期待値

| 状態 | Phase 1のみ | Phase 2（キャッシュヒット） | 改善率 |
|------|------------|---------------------------|--------|
| 初回取得 | 20-40ms | 20-40ms | - |
| 2回目以降 | 20-40ms | **<5ms** | **約87%** |
| 全体平均 | 30ms | **10ms** | **約67%** |

---

## 🔄 ロールバック手順

### Phase 2.2のみ無効化

```bash
# Prefetch機能のみ無効化
wp option update lms_thread_prefetch_enabled_v4 0
```

### Phase 2.1のみ無効化

```bash
# キャッシュ機能のみ無効化
wp option update lms_thread_cache_enabled_v4 0

# キャッシュクリア
wp eval "if (class_exists('LMS_Advanced_Cache')) { LMS_Advanced_Cache::get_instance()->flush_all(); }"
```

### Phase 2全体を無効化

```bash
# 両方無効化
wp option update lms_thread_cache_enabled_v4 0
wp option update lms_thread_prefetch_enabled_v4 0

# キャッシュクリア
wp eval "if (class_exists('LMS_Advanced_Cache')) { LMS_Advanced_Cache::get_instance()->flush_all(); }"
```

**注意**: Phase 1（`lms_optimized_thread_query_v4`）は引き続き有効です。

---

## 🐛 トラブルシューティング

### 問題1: キャッシュが効かない

**症状**: `cache_hit` が常に `false`

**確認事項**:
```bash
# Feature Flagが有効か確認
wp option get lms_thread_cache_enabled_v4
# => 1 であること

# LMS_Advanced_Cacheが利用可能か確認
wp eval "echo class_exists('LMS_Advanced_Cache') ? 'OK' : 'NG';"
# => OK であること
```

**対処法**:
```bash
# キャッシュをクリアして再試行
wp eval "if (class_exists('LMS_Advanced_Cache')) { LMS_Advanced_Cache::get_instance()->flush_all(); }"
```

### 問題2: メッセージ投稿後も古いカウントが表示される

**症状**: スレッドにメッセージを投稿しても、カウントが更新されない

**原因**: キャッシュ無効化フックが動作していない

**確認事項**:
```bash
# エラーログを確認
tail -f /path/to/wordpress/wp-content/debug.log | grep "cache invalidation"
```

**対処法**:
```bash
# 手動でキャッシュクリア
wp eval "
if (class_exists('LMS_Advanced_Cache')) {
  \$cache = LMS_Advanced_Cache::get_instance();
  \$cache->delete_pattern('chat:thread:*:v4');
  echo 'Cleared all thread caches';
}
"
```

### 問題3: Prefetchでエラーが発生

**症状**: メッセージ一覧取得時にエラー

**確認事項**:
```bash
# エラーログを確認
tail -f /path/to/wordpress/wp-content/debug.log | grep "prefetch"
```

**対処法**:
```bash
# Prefetch機能を一時的に無効化
wp option update lms_thread_prefetch_enabled_v4 0
```

---

## 📈 キャッシュ統計の確認

```bash
# キャッシュヒット率を確認
wp eval "
if (class_exists('LMS_Advanced_Cache')) {
  \$cache = LMS_Advanced_Cache::get_instance();
  \$stats = \$cache->get_stats();
  print_r(\$stats);
}
"
```

**期待される統計**:
```
Array
(
    [hits] => 700
    [misses] => 300
    [hit_rate] => 0.7  // 70%
    [memory_usage] => 2048576
    [keys_count] => 150
)
```

---

## ✅ Phase 2完了チェックリスト

- [ ] `class-lms-chat.php`の構文チェックが成功
- [ ] Feature Flag `lms_thread_cache_enabled_v4` を有効化
- [ ] Feature Flag `lms_thread_prefetch_enabled_v4` を有効化
- [ ] テスト1: キャッシュ動作確認 ✓
- [ ] テスト2: キャッシュ無効化確認 ✓
- [ ] テスト3: Prefetch動作確認 ✓
- [ ] テスト4: メッセージ同期確認 ✓
- [ ] キャッシュヒット率が70%以上
- [ ] レスポンス時間が5ms以下（キャッシュヒット時）
- [ ] エラーが発生していない

---

## 🎯 次のステップ

Phase 2が正常に動作したら、**1週間の観測期間**を設けてください。

観測項目:
- キャッシュヒット率
- レスポンス時間（P50, P95, P99）
- エラー率
- サーバー負荷（CPU/メモリ）

観測期間後、問題がなければ **Phase 3: Long Polling最適化** に進みます。

---

**Phase 2実装完了日**: _________
**Phase 2有効化日**: _________
**観測期間終了予定日**: _________
