# Phase 1 実装ガイド - データベース最適化

**LMSチャット最適化プロジェクト v4.0**  
**Phase 1: データベース最適化**  
**作成日**: 2025-01-10

---

## 📋 実装完了内容

### ✅ Phase 0: ベースライン測定用ツール

**ファイル**: `phase0_baseline_measurement.sql`

**内容**:
- 4つのクエリのEXPLAIN実行計画取得
- インデックス使用状況の確認
- テーブルサイズとレコード数の確認
- 実行時間測定（10回平均）

**使用方法**:
```bash
# MySQLクライアントで実行
mysql -u username -p database_name < phase0_baseline_measurement.sql
```

---

### ✅ Phase 1-1: インデックス作成SQL

**ファイル**: `phase1_step1_create_indexes.sql`

**作成されるインデックス**:
1. `idx_thread_messages_composite_1` (parent_message_id, deleted_at, created_at)
2. `idx_thread_messages_composite_2` (parent_message_id, user_id, created_at)
3. `idx_thread_last_viewed_composite` (parent_message_id, user_id, last_viewed_at)

**特徴**:
- `ALGORITHM=INPLACE, LOCK=NONE` でオンライン実行
- テーブルロックなしで作成可能

**実行タイミング**: 夜間メンテナンス時間帯推奨

---

### ✅ Phase 1-2: 統合クエリの実装

**ファイル**: `includes/class-lms-chat.php`  
**メソッド**: `handle_get_thread_count_optimized_v4()`

**変更内容**:
```php
// 4つのクエリを2つに統合
// クエリ1: COUNT + 未読カウント + 最新時刻（統合）
// クエリ2: アバター取得
```

**期待効果**: 20-40ms短縮

---

### ✅ Phase 1-3: Feature Flag対応

**ファイル**: `includes/class-lms-chat.php`  
**メソッド**: `handle_get_thread_count()`

**Feature Flag**:
```php
// オプション名: lms_optimized_thread_query_v4
// デフォルト: false（無効）
```

**制御方法**:
```php
// 有効化
update_option('lms_optimized_thread_query_v4', true);

// 無効化（ロールバック）
update_option('lms_optimized_thread_query_v4', false);
```

**安全機能**:
- 最適化版でエラー発生時は自動的に従来版にフォールバック
- エラーログに記録

---

## 🚀 実装手順

### ステップ1: Phase 0の実行（ベースライン測定）

**目的**: 現状を正確に把握

```bash
# 1. SQLファイルを編集
vi phase0_baseline_measurement.sql

# 2. {parent_message_id}と{user_id}を実際の値に置き換え

# 3. 実行
mysql -u root -p lms_database < phase0_baseline_measurement.sql > baseline_result.txt

# 4. 結果を確認
cat baseline_result.txt
```

**記録すべき項目**:
- [ ] クエリ1の実行時間: __ms
- [ ] クエリ2の実行時間: __ms  
- [ ] クエリ3の実行時間: __ms
- [ ] クエリ4の実行時間: __ms
- [ ] 合計実行時間: __ms
- [ ] 使用インデックス: ______
- [ ] テーブルサイズ: __MB

---

### ステップ2: Phase 1-1の実行（インデックス作成）

**目的**: クエリを高速化するインデックスを追加

**実行前の確認**:
```bash
# MySQLバージョン確認（5.6以上）
mysql -u root -p -e "SELECT VERSION();"

# テーブルサイズ確認
mysql -u root -p lms_database -e "
SELECT 
    table_name,
    ROUND((data_length + index_length) / 1024 / 1024, 2) AS 'サイズ(MB)'
FROM information_schema.tables
WHERE table_name IN ('wp_lms_chat_thread_messages', 'wp_lms_chat_thread_last_viewed');"
```

**実行**:
```bash
# 夜間メンテナンス時間帯に実行
mysql -u root -p lms_database < phase1_step1_create_indexes.sql > index_creation_result.txt

# 所要時間を記録
# - wp_lms_chat_thread_messages: __分__秒
# - wp_lms_chat_thread_last_viewed: __分__秒
```

**実行後の確認**:
```bash
# インデックスが作成されたか確認
mysql -u root -p lms_database -e "
SHOW INDEX FROM wp_lms_chat_thread_messages WHERE Key_name LIKE 'idx_thread%';"
```

**確認項目**:
- [ ] idx_thread_messages_composite_1 が作成された
- [ ] idx_thread_messages_composite_2 が作成された
- [ ] idx_thread_last_viewed_composite が作成された
- [ ] エラーが発生しなかった

---

### ステップ3: Phase 1-2 & 1-3の確認（コード実装）

**目的**: Feature Flag付き統合クエリが実装されたことを確認

**確認項目**:
```bash
# 構文チェック
php -l includes/class-lms-chat.php

# メソッドの存在確認
grep -n "handle_get_thread_count_optimized_v4" includes/class-lms-chat.php

# Feature Flagの確認
grep -n "lms_optimized_thread_query_v4" includes/class-lms-chat.php
```

**確認結果**:
- [ ] 構文エラーなし
- [ ] `handle_get_thread_count_optimized_v4()` メソッドが存在
- [ ] Feature Flag `lms_optimized_thread_query_v4` が実装されている
- [ ] フォールバック処理が実装されている

---

## 🧪 動作確認手順

### テスト1: 従来版の動作確認（Feature Flag無効）

```php
// WordPressでオプションが無効であることを確認
wp option get lms_optimized_thread_query_v4
// 出力: false または空

// ブラウザで動作確認
// 1. チャット画面を開く
// 2. スレッドを表示
// 3. スレッド情報が正常に表示されるか確認
```

**確認項目**:
- [ ] スレッド返信数が表示される
- [ ] 未読数が表示される
- [ ] 最新返信時刻が表示される
- [ ] アバターが3件表示される
- [ ] エラーが発生しない

---

### テスト2: 最適化版の動作確認（Feature Flag有効）

```php
// Feature Flagを有効化
wp option update lms_optimized_thread_query_v4 true

// ブラウザで動作確認（上記と同じ手順）
```

**確認項目**:
- [ ] スレッド返信数が従来版と同じ
- [ ] 未読数が従来版と同じ
- [ ] 最新返信時刻が従来版と同じ
- [ ] アバターが従来版と同じ
- [ ] エラーが発生しない
- [ ] レスポンスに `version: "v4_optimized"` が含まれる

---

### テスト3: パフォーマンス測定

**ブラウザ開発者ツールで測定**:
```javascript
// ネットワークタブで以下を確認
// lms_get_thread_count のレスポンス時間
// 従来版: __ms
// 最適化版: __ms
// 短縮時間: __ms
```

**サーバー側で測定**（オプション）:
```php
// functions.php に一時的に追加
add_action('wp_ajax_lms_get_thread_count', function() {
    $start = microtime(true);
    // 既存処理
    $elapsed = (microtime(true) - $start) * 1000;
    error_log("Thread count query took: {$elapsed}ms");
}, 1);
```

---

## 🔄 ロールバック手順

### 緊急ロールバック（1分以内）

```php
// Feature Flagを無効化
wp option update lms_optimized_thread_query_v4 false

// 動作確認
// ブラウザで再度チャット画面をチェック
```

### インデックス削除（必要に応じて）

```sql
-- インデックスのみ削除（コードは変更なし）
ALTER TABLE wp_lms_chat_thread_messages
DROP INDEX idx_thread_messages_composite_1,
DROP INDEX idx_thread_messages_composite_2,
ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE wp_lms_chat_thread_last_viewed
DROP INDEX idx_thread_last_viewed_composite,
ALGORITHM=INPLACE, LOCK=NONE;
```

### Git ロールバック（コード変更を戻す）

```bash
# 変更を確認
git diff includes/class-lms-chat.php

# 元に戻す
git checkout HEAD -- includes/class-lms-chat.php
```

---

## 📊 成功基準

### 必須条件（1つでも満たさない場合はロールバック）

✅ **メッセージ送受信が100%正常に動作**  
✅ **スレッド返信が100%正常に動作**  
✅ **スレッド情報の表示内容が従来版と完全一致**  
✅ **エラー率が0.5%未満**

### 目標指標

✅ スレッド情報取得が20-40ms短縮  
✅ EXPLAINで新しいインデックスが使用されている  
✅ サーバー負荷が許容範囲内（+10%以内）

---

## 📝 実装チェックリスト

### Phase 0完了条件
- [ ] ベースライン測定SQL作成済み
- [ ] 実行時間を記録
- [ ] EXPLAIN結果を記録
- [ ] インデックス使用状況を記録

### Phase 1-1完了条件
- [ ] インデックス作成SQL作成済み
- [ ] インデックス作成実行済み
- [ ] 3つのインデックスが正常に作成された
- [ ] ANALYZE TABLE実行済み

### Phase 1-2完了条件
- [ ] `handle_get_thread_count_optimized_v4()` 実装済み
- [ ] 統合クエリが動作する
- [ ] レスポンス形式が従来版と一致

### Phase 1-3完了条件
- [ ] Feature Flag実装済み
- [ ] ON/OFF切り替えが動作する
- [ ] フォールバック処理が動作する

### Phase 1-4完了条件
- [ ] PHP構文チェック成功
- [ ] 従来版の動作確認OK
- [ ] 最適化版の動作確認OK
- [ ] パフォーマンス改善を確認

---

## 🎯 次のステップ

Phase 1が成功したら、Phase 2（キャッシュシステム構築）に進みます。

**Phase 2の内容**:
1. LMS_Advanced_Cacheの多層キャッシュ実装
2. Prefetch機能の実装
3. イベントベースの自動無効化

**Phase 2実施条件**:
- Phase 1が1週間安定稼働
- エラー率が0.5%未満
- サーバー負荷が許容範囲内

---

## 📞 問題が発生した場合

### よくある問題と対処法

**問題1**: インデックス作成に失敗
```
対処: MySQLバージョンを確認
ALTER TABLEの構文を確認
ディスク容量を確認
```

**問題2**: 最適化版のレスポンスが従来版と異なる
```
対処: 即座にFeature Flagを無効化
SQLクエリを確認
データの整合性を確認
```

**問題3**: パフォーマンスが改善しない
```
対処: EXPLAINでインデックスが使用されているか確認
ANALYZE TABLEを再実行
クエリキャッシュをクリア
```

---

**Phase 1実装ガイド以上**
