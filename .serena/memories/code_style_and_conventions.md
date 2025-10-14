# LMSチャットシステム コードスタイル＆規約

## 全般的な規約
- **言語**: 日本語でのコメント・ドキュメント記述必須
- **デバッグコード**: 本番環境から`console.*`と`error_log`完全削除
- **バックアップファイル**: `*.backup`, `*.bak`, `.tmp`等は作業後削除

## JavaScript規約

### 命名規則
- **名前空間**: `window.LMSChat.*`使用（グローバル汚染回避）
- **データ属性**: 新属性は`data-lms-*`前置推奨
- **関数名**: camelCase使用（例: `scrollToBottom`）
- **定数**: UPPER_SNAKE_CASE使用

### DOMセレクタ
- **基本セレクタ**: `.chat-message[data-message-id]`
- **スレッド**: `.thread-message[data-thread-message-id]`
- **リアクション**: `.message-reactions`

### リアクション同期規約
- **即時ハイドレーション必須**: ロングポーリング待たない
- **冪等制御フラグ**:
  - `.data('reactionHydrationPending')`: リクエスト中
  - `data-reactions-hydrated="1"`: 処理済みマーク
- **バッチ処理**: 5件単位、100ms待機
- **空コンテナ管理**: リアクションなしでも空要素生成

### Ajaxパラメータ
- **単体**: `message_id`
- **複数**: `message_ids`（カンマ区切り、最大5件）
- **nonce**: 必須（CSRF対策）

### エラーハンドリング
- 本番環境での`console.error`禁止
- 開発時は`WP_DEBUG`フラグで制御
- `Promise.allSettled`使用（部分的失敗許容）

## PHP規約

### セッション操作
- `acquireSession()`/`releaseSession()`ヘルパー必須
- 書き込み時: `acquireSession(true)`後即座に`releaseSession()`
- `$_SESSION`直接アクセス禁止
- `session_start()`個別呼び出し禁止

### クラス設計
- **Singleton Pattern**: getInstance()メソッド実装
- **名前空間**: なし（WordPress標準）
- **プレフィックス**: `LMS_`使用

### データベース操作
- **プレフィックス**: `wp_lms_chat_*`
- **ソフトデリート**: `deleted_at`カラム使用
- **インデックス**: 複合インデックス最適化

## SCSS/CSS規約
- **方法論**: BEM記法
- **ネスト**: 最大3階層まで
- **変数**: `$lms-`プレフィックス使用

## 禁則事項

### JavaScript
1. ハイドレーション制御フラグ削除禁止
2. ポーリング間隔の無闇な変更禁止
3. DOM大量同期書き換え禁止（innerHTML連打等）
4. 既存の`updateMessageReactions`等を再利用

### PHP
1. セッションヘルパー以外でのセッション操作禁止
2. error_log直接記述禁止（デバッグフラグ使用）
3. ユーザー入力の直接出力禁止（エスケープ必須）

## 開発ツール

### PHPリンター
```bash
./php-lint.sh path/to/file.php
# 別バージョン指定
LOCAL_PHP_BIN=/path/to/php ./php-lint.sh file.php
```

### 改修フロー
1. 仕様確認: CLAUDE.md等確認
2. コード実装: 既存規約遵守
3. 動作確認: 初回ロード5秒以内リアクション表示
4. ドキュメント更新: 変更時は関連文書更新

最終更新: 2025-09-19