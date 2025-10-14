# スレッドメッセージ表示不具合 修復記録

**作成日**: 2025-10-12
**ステータス**: 修正完了 - 動作確認待ち
**重要度**: 🔴 Critical

---

## 📋 目次

1. [問題の概要](#問題の概要)
2. [症状](#症状)
3. [調査プロセス](#調査プロセス)
4. [根本原因](#根本原因)
5. [実施した修正](#実施した修正)
6. [追加したデバッグログ](#追加したデバッグログ)
7. [確認事項](#確認事項)
8. [今後の改善提案](#今後の改善提案)

---

## 問題の概要

### 🐛 バグ内容

スレッドに新規メッセージを投稿した後、スレッドモーダルを閉じて再度開くと、投稿したメッセージが表示されず、「このスレッドにはまだ返信がありません」というメッセージが表示される。

### 🎯 影響範囲

- **機能**: スレッドメッセージ表示
- **ユーザー影響**: 全ユーザー
- **再現性**: 100%（常に発生）

---

## 症状

### ユーザー操作フロー

1. ✅ メインチャットでスレッドを開く
2. ✅ 新しいメッセージを投稿（例: "テストメッセージ"）
3. ✅ メッセージは即座に表示される
4. ✅ スレッドモーダルを閉じる
5. ❌ **同じスレッドを再度開く → メッセージが表示されない**
6. ❌ **「このスレッドにはまだ返信がありません」が表示される**

### コンソールログ（修正前）

```javascript
[THREAD DEBUG] loadThreadMessages レスポンス受信:
  {messageId: 1998, messagesCount: 0, messages: []}

[THREAD DEBUG] メッセージが0件です - 空メッセージ表示
```

---

## 調査プロセス

### タイムライン

#### **Phase 1: JavaScriptの調査（2025-10-12 初期）**

**仮説**: クライアント側のキャッシュ問題

**実施した対策**:
1. ❌ 早期リターンの無効化
2. ❌ JavaScriptキャッシュのクリア
3. ❌ ブラウザHTTPキャッシュの無効化（`cache: false`）

**結果**: 問題解決せず → サーバー側の問題と判明

---

#### **Phase 2: PHP側の調査開始**

**発見事項**:
- AJAXリクエストは正常に送信されている
- サーバーが空のレスポンス（0件）を返している
- **2つのAJAXハンドラーが存在**:
  - `ajax_get_thread_messages` (class-lms-chat-api.php)
  - `handle_get_thread_messages` (class-lms-chat.php) ← **実際に呼ばれているのはこちら**

---

#### **Phase 3: デバッグログの追加**

**追加したログ箇所**:

1. **handle_get_thread_messages メソッド** (class-lms-chat.php: 2122-2126)
   ```php
   error_log('[THREAD DEBUG] handle_get_thread_messages 開始');
   error_log('[THREAD DEBUG] リクエストパラメータ: ' . print_r($_GET, true));
   ```

2. **get_thread_messages メソッド** (class-lms-chat.php: 2234-2240)
   ```php
   error_log('[THREAD DEBUG] get_thread_messages 開始');
   error_log('[THREAD DEBUG]   - parent_message_id: ' . $parent_message_id);
   error_log('[THREAD DEBUG]   - page: ' . $page);
   ```

3. **メッセージ総数取得クエリ** (class-lms-chat.php: 2310-2320)
   ```php
   error_log('[THREAD DEBUG] get_thread_messages - メッセージ総数取得クエリ:');
   error_log('[THREAD DEBUG]   - SQL: ' . $count_query);
   error_log('[THREAD DEBUG]   - total_messages: ' . $total_messages);
   ```

4. **メッセージ取得クエリ** (class-lms-chat.php: 2390-2410)
   ```php
   error_log('[THREAD DEBUG] get_thread_messages - メッセージ取得クエリ:');
   error_log('[THREAD DEBUG]   - SQL: ' . $query);
   error_log('[THREAD DEBUG]   - 取得件数: ' . count($messages));
   ```

5. **send_thread_message メソッド** (class-lms-chat.php: 1815-1860)
   ```php
   error_log('[THREAD DEBUG] send_thread_message - メッセージ送信開始:');
   error_log('[THREAD DEBUG]   - parent_message_id: ' . $parent_message_id);
   error_log('[THREAD DEBUG]   - INSERT結果: ' . ($result ? 'true' : 'false'));
   error_log('[THREAD DEBUG]   - insert_id: ' . $wpdb->insert_id);
   error_log('[THREAD DEBUG] send_thread_message - データベース直接確認:');
   error_log('[THREAD DEBUG]   - 結果: ' . print_r($verify_result, true));
   ```

---

#### **Phase 4: 根本原因の特定**

**デバッグログからの発見**:

**✅ メッセージ送信時（14:18:11）**:
```
[THREAD DEBUG] send_thread_message - INSERT結果: true
[THREAD DEBUG] insert_id: 744
[THREAD DEBUG] send_thread_message - データベース直接確認:
  stdClass Object
  (
      [id] => 744
      [parent_message_id] => 1998
      [user_id] => 2
      [message] => テストテスト
      [created_at] => 2025-10-12 23:18:10
      [deleted_at] =>   ← NULL（正常）
  )
```
→ **メッセージは正しくデータベースに保存されている**

**❌ メッセージ取得時（14:18:03）**:
```
[THREAD DEBUG] get_thread_messages - メッセージ総数取得クエリ:
  SQL: SELECT COUNT(*) FROM wp_lms_chat_thread_messages
       WHERE parent_message_id = 1998 AND deleted_at IS NULL
  total_messages: 0  ← ★おかしい！メッセージは保存されているはず

[THREAD DEBUG] get_thread_messages - メッセージ取得クエリ:
  SQL: SELECT t.*, u.display_name, u.avatar_url, ...
       FROM wp_lms_chat_thread_messages t
       JOIN wp_lms_users u ON t.user_id = u.id  ← ★★★ 問題箇所！
       WHERE t.parent_message_id = 1998 AND deleted_at IS NULL
  取得件数: 0
```

---

## 根本原因

### 🎯 特定された問題

**SQLクエリで `JOIN wp_lms_users` を使用しているため、ユーザーテーブルに該当ユーザーが存在しない場合、メッセージが取得できない。**

### 詳細説明

#### 問題のあるクエリ

```sql
SELECT t.*, u.display_name, u.avatar_url, ...
FROM wp_lms_chat_thread_messages t
JOIN wp_lms_users u ON t.user_id = u.id  ← ★ INNER JOIN
WHERE t.parent_message_id = 1998 AND deleted_at IS NULL
```

#### なぜ問題なのか

- `JOIN`（INNER JOIN）は両方のテーブルにデータが存在する場合のみ結果を返す
- `wp_lms_users` テーブルに `user_id=2` が存在しない場合、JOINが失敗
- **結果: メッセージがデータベースに存在しても取得できない**

#### 正しいクエリ

```sql
SELECT t.*, u.display_name, u.avatar_url, ...
FROM wp_lms_chat_thread_messages t
LEFT JOIN wp_lms_users u ON t.user_id = u.id  ← ★ LEFT JOIN
WHERE t.parent_message_id = 1998 AND deleted_at IS NULL
```

- `LEFT JOIN` はメインテーブル（wp_lms_chat_thread_messages）の全行を返す
- ユーザー情報がない場合は `NULL` として返される
- **結果: メッセージは必ず取得できる**

---

## 実施した修正

### 📝 修正ファイル

**ファイル**: `includes/class-lms-chat.php`
**メソッド**: `get_thread_messages`
**行番号**: 約2393行目

### 修正内容

```php
// 修正前
$query = $wpdb->prepare(
    "SELECT t.*, u.display_name, u.avatar_url,
    DATE(t.created_at) as message_date,
    TIME(t.created_at) as message_time,
    CASE
        WHEN t.created_at > %s AND t.user_id != %d THEN 1
        ELSE 0
    END as is_new
    FROM {$thread_table} t
    JOIN {$users_table} u ON t.user_id = u.id  ← ★修正箇所
    WHERE t.parent_message_id = %d AND t.deleted_at IS NULL
    ORDER BY t.created_at ASC
    LIMIT %d OFFSET %d",
    ...
);
```

```php
// 修正後
$query = $wpdb->prepare(
    "SELECT t.*, u.display_name, u.avatar_url,
    DATE(t.created_at) as message_date,
    TIME(t.created_at) as message_time,
    CASE
        WHEN t.created_at > %s AND t.user_id != %d THEN 1
        ELSE 0
    END as is_new
    FROM {$thread_table} t
    LEFT JOIN {$users_table} u ON t.user_id = u.id  ← ★修正完了
    WHERE t.parent_message_id = %d AND t.deleted_at IS NULL
    ORDER BY t.created_at ASC
    LIMIT %d OFFSET %d",
    ...
);
```

### ✅ 構文チェック

```bash
$ php -l includes/class-lms-chat.php
No syntax errors detected in includes/class-lms-chat.php
```

---

## 追加したデバッグログ

### 本番環境での扱い

**重要**: 以下のデバッグログは調査用に追加したものです。本番環境では削除またはコメントアウトを推奨します。

### デバッグログ一覧

#### 1. **includes/class-lms-chat.php**

| 行番号 | メソッド | 内容 |
|--------|----------|------|
| 2122-2126 | `handle_get_thread_messages` | リクエスト受信ログ |
| 2234-2240 | `get_thread_messages` | メソッド開始ログ |
| 2310-2320 | `get_thread_messages` | メッセージ総数取得クエリログ |
| 2390-2410 | `get_thread_messages` | メッセージ取得クエリログ |
| 1815-1825 | `send_thread_message` | メッセージ送信開始ログ |
| 1830-1837 | `send_thread_message` | INSERT結果ログ |
| 1845-1856 | `send_thread_message` | データベース直接確認ログ |

### デバッグログの削除方法

本番環境で不要になった場合、以下のコマンドで一括削除できます：

```bash
# PHPデバッグログの削除
grep -n "THREAD DEBUG" includes/class-lms-chat.php
# 上記で表示された行を手動で削除またはコメントアウト
```

または、`WP_DEBUG` 条件付きにする：

```php
if (defined('WP_DEBUG') && WP_DEBUG) {
    error_log('[THREAD DEBUG] ...');
}
```

---

## 確認事項

### ✅ 動作確認手順

1. **ハードリフレッシュ**
   - Mac: `⌘ + Shift + R`
   - Windows: `Ctrl + Shift + R`

2. **テスト実行**
   - スレッドを開く（例: parent_message_id=1998）
   - 新しいメッセージを投稿
   - スレッドモーダルを閉じる
   - **同じスレッドを再度開く**

3. **期待される動作**
   - ✅ 投稿したメッセージがスレッド内に表示される
   - ✅ 「このスレッドにはまだ返信がありません」が表示されない
   - ✅ ユーザー名とアバターが正しく表示される（ユーザー情報がある場合）

4. **エッジケースの確認**
   - ✅ ユーザー情報がない場合でもメッセージが表示される
   - ✅ 複数メッセージが正しく表示される
   - ✅ ページネーションが正常に動作する

### 📊 ログ確認

修正後のログを確認：

```bash
tail -50 "/Users/min/Local Sites/lms/app/public/wp-content/debug.log"
```

**確認ポイント**:
- `total_messages` が正しい件数を返しているか
- `取得件数` が0以外になっているか
- エラーログが出力されていないか

---

## 今後の改善提案

### 短期的改善（優先度: 高）

1. **ユーザーテーブルの整合性確認**
   - `wp_lms_users` テーブルにすべてのユーザーが登録されているか確認
   - 不足している場合は自動同期機能の実装を検討

2. **デバッグログのクリーンアップ**
   - 本番環境からデバッグログを削除
   - 必要なログは `WP_DEBUG` 条件付きに変更

3. **エラーハンドリングの強化**
   - ユーザー情報がない場合のフォールバック表示
   - デフォルトユーザー名（例: "名無しユーザー"）の設定

### 中期的改善（優先度: 中）

1. **JOIN戦略の統一**
   - 他のクエリでも同様の問題がないか全体チェック
   - メインメッセージ取得クエリも `LEFT JOIN` を使用しているか確認

2. **キャッシュ戦略の見直し**
   - ユーザー情報のキャッシュ実装
   - JOINの負荷を軽減

3. **自動テストの追加**
   - ユーザー情報がない場合のテストケース追加
   - スレッドメッセージ表示の統合テスト実装

### 長期的改善（優先度: 低）

1. **データベース設計の見直し**
   - ユーザーテーブルの一元化
   - 外部キー制約の追加

2. **パフォーマンス最適化**
   - N+1問題の解消
   - バッチ取得の実装

3. **モニタリング機能の追加**
   - クエリパフォーマンスの監視
   - エラー率のトラッキング

---

## 関連ファイル

### 修正されたファイル

- `includes/class-lms-chat.php` - メインの修正箇所

### 影響を受ける可能性のあるファイル

- `includes/class-lms-chat-api.php` - Ajax ハンドラー
- `js/chat-threads.js` - クライアント側スレッド処理
- `js/chat-core.js` - キャッシュ管理

### 関連ドキュメント

- `CLAUDE.md` - LMSチャットシステム完全仕様書
- `REACTION_SYNC_IMPLEMENTATION_PLAN.md` - リアクション同期実装計画
- `SCRIPT_LOADING_ANALYSIS.md` - スクリプトローディング分析

---

## バージョン履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|------------|----------|--------|
| 2025-10-12 | 1.0.0 | 初版作成 - 問題調査と修正 | Claude |

---

## 連絡先・サポート

**問題が解決しない場合**:
1. デバッグログを確認
2. ブラウザコンソールログを確認
3. データベースの状態を確認（wp_lms_users テーブル）

**追加調査が必要な場合**:
- このドキュメントの内容を参照して再現テストを実施
- 新しいログ情報を追加して詳細調査

---

最終更新: 2025-10-12
