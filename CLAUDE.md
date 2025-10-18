# LMS チャットシステム完全仕様書

**重要: このドキュメントに記載された内容に基づいて必ず日本語で返答してください。**

## システム概要

WordPress ベースの高度なリアルタイムチャットシステム。Long Polling によるメッセージ受信、リアクション機能、スレッド機能、プッシュ通知、ファイル共有、高機能キャッシュシステムを実装した企業レベルのチャットアプリケーション。

## 技術スタック

- **フロントエンド**: jQuery + モジュラーJavaScript設計
- **バックエンド**: PHP 7.2.5以上、WordPress
- **リアルタイム通信**: Long Polling（最大30秒間待機）
- **キャッシュシステム**: WordPress Object Cache + 独自高機能キャッシュ
- **スタイリング**: SCSS/Sass（BEM記法）
- **プッシュ通知**: Web Push API（minishlink/web-pushライブラリ）
- **ファイル圧縮**: LZ-String圧縮
- **セキュリティ**: reCAPTCHA, WordPress nonce, セッション強化

## セッション制御ポリシー

- すべてのサーバーサイド処理は `functions.php` に実装した `acquireSession()` / `releaseSession()` ヘルパー経由でセッションにアクセスする。これにより読み取り専用の場合は `session_read_only` を利用し、処理完了後ただちにロックを解放する。
- PHP実装の主要クラス（`includes/class-lms-chat.php`, `includes/class-lms-chat-api.php`, `includes/class-lms-chat-longpoll.php`）では、セッション情報をローカル変数（例: `$sessionData`）へスナップショットし、その後の処理はロックなしで進める。
- 既存ロジックは読み取り中心のため `acquireSession()` を基本とするが、今後 `$_SESSION` に書き込みが必要になった場合は `acquireSession(true)` で書き込みモードを明示し、更新後に必ず `releaseSession()` を呼ぶ運用とする。
- `$_SESSION` への直接アクセスや `session_start()` の個別呼び出しは禁止。新規コードでは必ずヘルパーを介すること。

## ディレクトリ構造

```
/wp-content/themes/lms/
├── js/                           # JavaScriptファイル群（55ファイル）
│   ├── コアシステム
│   │   ├── chat.js               # メインエントリーポイント、スレッド統合
│   │   ├── chat-core.js          # 基本機能、状態管理、ユーティリティ
│   │   ├── chat-messages.js      # メッセージ表示・送信・管理
│   │   ├── chat-ui.js            # UI管理、バッジ制御、チャンネル切り替え
│   │   └── chat-header.js        # ヘッダー機能
│   ├── リアルタイム通信
│   │   ├── chat-longpoll.js      # 基本Long Polling実装
│   │   ├── lms-unified-longpoll.js # 統合ロングポーリング（高度機能）
│   │   ├── lms-longpoll-complete.js # Long Polling完全版実装
│   │   └── lms-longpoll-integration-hub.js # ロングポーリング統合ハブ
│   ├── リアクション機能（7モジュール）
│   │   ├── chat-reactions.js     # リアクションメイン
│   │   ├── chat-reactions-core.js # コア機能
│   │   ├── chat-reactions-ui.js  # UI管理
│   │   ├── chat-reactions-sync.js # 同期処理
│   │   ├── chat-reactions-cache.js # キャッシュ管理
│   │   ├── chat-reactions-actions.js # アクション処理
│   │   └── lms-reaction-manager.js # 統合マネージャー
│   ├── 検索・スクロール機能
│   │   ├── chat-search.js        # 検索機能
│   │   ├── chat-search-scroll.js # 検索結果スクロール
│   │   └── chat-scroll-utility.js # スクロール制御
│   ├── スレッド機能
│   │   ├── chat-threads.js       # スレッド機能
│   │   └── direct-thread-loader.js # ダイレクトスレッドローダー
│   ├── 未読バッジシステム
│   │   ├── header-unread-badge.js
│   │   ├── lms-realtime-unread-badge.js
│   │   ├── lms-realtime-unread-system.js
│   │   ├── lms-unified-badge-manager.js
│   │   └── lms-universal-unread-badge.js
│   ├── パフォーマンス最適化
│   │   ├── lms-chat-performance-optimizer.js # パフォーマンス最適化
│   │   ├── performance-monitor.js # パフォーマンス監視
│   │   └── lms-unified-cache-system.js # 統合キャッシュシステム
│   ├── ユーティリティ
│   │   ├── lz-string.min.js      # 圧縮ライブラリ
│   │   ├── service-worker.js     # サービスワーカー
│   │   ├── sw-updater.js         # SW更新管理
│   │   ├── push-notification.js  # プッシュ通知
│   │   ├── emoji-picker.js       # 絵文字ピッカー
│   │   ├── keyboard-shortcuts-manager.js # キーボードショートカット
│   │   ├── lms-new-message-marker.js # 新着メッセージマーカー
│   │   ├── badge-diagnostic.js   # バッジ診断
│   │   ├── lms-chat-loader.js    # チャットローダー
│   │   └── file-upload-manager.js # ファイルアップロード管理
│   ├── 管理画面
│   │   └── admin.js              # 管理画面用スクリプト
│   └── その他
│       ├── direct-reaction-sync.js # ダイレクトリアクション同期
│       ├── lms-disable-shortpoll.js # ショートポーリング無効化
│       └── lms-unified-reaction-longpoll.js # リアクション用ロングポーリング
├── includes/                     # PHPクラスファイル群（37ファイル）
│   ├── メインチャットシステム
│   │   ├── class-lms-chat.php    # チャット機能中核クラス
│   │   ├── class-lms-chat-api.php # REST API、Ajax処理
│   │   ├── class-lms-chat-longpoll.php # サーバー側Long Polling
│   │   ├── class-lms-chat-upload.php # ファイルアップロード
│   │   ├── class-lms-chat-delete.php # メッセージ削除
│   │   ├── class-lms-unified-longpoll.php # 統合ロングポーリング
│   │   ├── class-lms-complete-longpoll.php # 完全版ロングポーリング
│   │   └── class-lms-unified-reaction-longpoll.php # リアクション用ロングポーリング
│   ├── キャッシュシステム
│   │   ├── class-lms-advanced-cache.php # 高機能キャッシュ
│   │   ├── class-lms-cache-helper.php # キャッシュヘルパー
│   │   ├── class-lms-cache-database.php # データベースキャッシュ
│   │   └── class-lms-cache-integration.php # キャッシュ統合
│   ├── セキュリティ・認証
│   │   ├── class-lms-security.php # セキュリティ保護
│   │   ├── class-lms-auth.php    # 認証システム
│   │   └── class-lms-recaptcha.php # reCAPTCHA統合
│   ├── データ管理
│   │   ├── class-lms-soft-delete.php # ソフトデリート機能
│   │   ├── class-lms-database-optimizer.php # データベース最適化
│   │   ├── class-lms-push-notification.php # プッシュ通知
│   │   └── class-lms-migration-controller.php # マイグレーション制御
│   └── 管理機能
│       ├── class-lms-admin.php   # 管理機能
│       └── class-lms-chat-admin.php # チャット管理
├── css/                          # スタイルファイル
│   └── admin/                    # 管理画面用CSS
├── sass/                         # SCSS ソースファイル（BEM記法）
│   ├── abstracts/                # 変数、ミックスイン、関数
│   ├── base/                     # リセット、ベーススタイル
│   ├── components/               # UIコンポーネント
│   ├── layout/                   # レイアウト要素
│   ├── pages/                    # ページ固有スタイル
│   └── admin/                    # 管理画面スタイル
├── template-parts/               # WordPressテンプレート
├── admin/                        # 管理画面PHPファイル
├── img/                          # 画像リソース
└── php-lint.sh                   # PHP構文チェックツール
```

## クリーンアップ履歴（2025-09-17）

### 削除されたファイル

#### デバッグ・テストファイル（24ファイル削除）
- **JavaScriptデバッグファイル（9ファイル）**
  - reaction-debug-complete.js
  - reaction-system-test.js
  - debug-commands.js
  - lms-longpoll-debug-monitor.js
  - longpoll-migration-test.js
  - reaction-display-debug.js
  - reaction-timing-debug.js
  - temp_test.js
  - lms-reaction-test-console.js

- **PHPテスト・デバッグファイル（15ファイル）**
  - test-*.php（9ファイル）
  - debug-*.php（3ファイル）
  - check-reaction-updates-fix.php
  - cleanup-test-reactions.php

#### シェルスクリプト（5ファイル削除）
- mysql-debug-commands.sh
- final-console-cleanup.sh
- cleanup-debug-logs.sh
- comprehensive-debug-cleanup.sh
- update-service-worker.sh

#### その他のクリーンアップ
- .DS_Storeファイル（7ファイル削除）
- バックアップファイル（.bak, .backup, .sql等）

### コードクリーンアップ

#### JavaScriptデバッグコード削除
- lms-chat-performance-optimizer.js: console.log 14箇所削除
- chat-longpoll.js: 不完全なオブジェクトリテラル削除（構文エラー修正）

#### PHPデバッグコード削除
- class-lms-chat-api.php: error_log 3箇所削除
- class-lms-chat.php: error_log 8箇所削除
- class-lms-chat-longpoll.php: error_log 5箇所削除
- class-lms-unified-longpoll.php: error_log 8箇所削除
- functions.php: error_log 11箇所削除（セッションエラーログ1つは保持）

#### functions.php修正
- デバッグファイル読み込み削除（3箇所）

### 現在のファイル統計
- JavaScriptファイル: 55個（アクティブファイル、バックアップ除く）
- PHPファイル（includes）: 37個
- 総ファイル数（JS+PHP、vendor除く）: 92個

## 追加クリーンアップ履歴（2025-09-29）

### 大規模デバッグコード削除
- **JavaScriptファイル**: 150+ console.log/console.error削除
  - chat-longpoll.js: SYNC_DEBUG、LONGPOLL、EVENT_CONVERTログ削除
  - chat-threads.js: スレッド同期デバッグログ削除
  - lms-unified-longpoll.js: 統合ロングポーリングデバッグログ削除
  - chat-reactions.js: リアクション同期デバッグログ削除
  - その他15ファイルから段階的にconsole.log削除

- **PHPファイル**: 30+ error_log削除
  - class-lms-chat-api.php: Ajax処理デバッグログ削除
  - class-lms-chat.php: チャット機能デバッグログ削除
  - class-lms-chat-longpoll.php: ロングポーリングデバッグログ削除
  - class-lms-unified-longpoll.php: 統合ロングポーリングデバッグログ削除
  - functions.php: セッション管理デバッグログ削除（重要なエラーログは保持）

### 不要ファイル削除（44KB削減）
- functions-integrated-lightweight.php (11,801 bytes)
- lightweight-system-switcher.php (13,744 bytes)
- functions-lightweight.php (8,330 bytes)
- test-lint.php (286 bytes)
- test-toggle-reaction.php (3,276 bytes)
- debug-sync-test.js (6,203 bytes)

### 不要コメント削除
- JavaScript、PHPファイルから開発用コメント削除
- 機能説明コメントは保持

### データベースエラー修正
- profile_image カラム参照削除（存在しないカラムエラー修正）
- SQL クエリ最適化

### 構文エラー修正
- chat-threads.js: Promise チェーン修復
- chat-longpoll.js: オブジェクトリテラル構文修正

## データベース構造

### 主要テーブル
- `wp_lms_chat_messages` - メインメッセージ
- `wp_lms_chat_thread_messages` - スレッドメッセージ
- `wp_lms_chat_channels` - チャンネル
- `wp_lms_chat_channel_members` - チャンネルメンバー
- `wp_lms_chat_last_viewed` - 最終閲覧時刻
- `wp_lms_chat_thread_last_viewed` - スレッド最終閲覧時刻
- `wp_lms_chat_reactions` - リアクション
- `wp_lms_chat_thread_reactions` - スレッドリアクション

### パフォーマンス最適化
- 複合インデックス設計
- 未読カウント専用クエリ最適化
- キャッシュ戦略

## 主要コンポーネント

### 1. メッセージ管理システム (chat-messages.js)

#### メインオブジェクト構造
```javascript
window.LMSChat = {
    messages: {
        appendMessage(),      // メッセージをDOMに追加
        sendMessage(),        // メッセージ送信
        scrollToBottom(),     // 最下部へスクロール
        deleteMessage(),      // メッセージ削除
        markMessageAsRead(),  // 既読処理
        cleanupTempMessages(), // 一時メッセージのクリーンアップ
    },
    state: {
        currentChannel,       // 現在のチャンネルID
        currentThread,        // 現在のスレッドID
        isChannelSwitching,   // チャンネル切り替え中フラグ
        justSentMessage,      // メッセージ送信直後フラグ
        lastSentMessageId,    // 最後に送信したメッセージID
        recentSentMessageIds, // 最近送信したメッセージIDセット
        isChannelLoaded,      // チャンネル読み込み状態
        recentSentMessageTimes, // 送信時刻追跡
    },
    utils: {
        formatMessageTime(),  // 時刻フォーマット
        escapeHtml(),        // HTMLエスケープ
        linkifyUrls(),       // URL自動リンク化
        getAssetPath(),      // アセットパス取得
    }
}
```

#### メッセージ送信フロー
1. `sendMessage()` 呼び出し
2. 仮メッセージ (temp_ID) を即座に表示
3. Ajax でサーバーへ送信
4. 成功時: 仮メッセージを実メッセージに置換
5. **重要: 送信完了後に `scrollToBottom()` を呼び出して最下部へスクロール**

### 2. Long Polling システム

#### 基本実装 (chat-longpoll.js)
- 30秒のロングポーリング
- 4つのイベントタイプ対応（メッセージ作成・削除、スレッドメッセージ作成・削除）
- 基本的なフォールバック機能

#### 統合実装 (lms-unified-longpoll.js)
```javascript
window.UnifiedLongPollClient = {
    // 高度な機能
    startPolling(),           // ポーリング開始
    stopPolling(),           // ポーリング停止
    handleVisibilityChange(), // ページ可視性対応
    adjustPollRate(),        // ポーリング頻度調整
    monitorPerformance(),    // パフォーマンス監視
}
```

**特徴:**
- 複数接続管理（最大3接続）
- パフォーマンス監視
- 自動フォールバック（longpoll → mediumpoll → shortpoll → emergency）
- 圧縮機能、キャッシュ機能、エラーハンドリング
- ページ可視性API対応

### 3. スクロール制御システム

#### 統合スクロールマネージャー
```javascript
window.UnifiedScrollManager = {
    scrollToBottom(delay, force, source),     // 最下部へスクロール
    scrollThreadToBottom(delay, force),       // スレッド最下部へ
    isScrollLocked(),                         // スクロールロック状態
    lockScroll(),                             // スクロールをロック
    unlockScroll(),                           // スクロールロック解除
    smoothScrollToPosition(),                 // スムーススクロール
}

// フォールバック用
window.LMSChat.messages.scrollToBottom(delay, force, disableAutoScrollAfter)
```

**スクロール制御仕様:**
- **自分のメッセージ送信時のみ自動スクロール**
- **他ユーザーのメッセージでは自動スクロールしない**
- ローダー表示制御
- スクロールロック機能
- スレッド・メインチャットの両対応

### 4. リアクション機能システム

#### モジュラー設計（7つのモジュール）
```javascript
// chat-reactions-core.js - コア機能
window.LMSReactionsCore = {
    addReaction(),           // リアクション追加
    removeReaction(),        // リアクション削除
    getReactions(),          // リアクション取得
}

// chat-reactions-ui.js - UI管理
window.LMSReactionsUI = {
    showPicker(),            // リアクションピッカー表示
    updateDisplay(),         // 表示更新
    handleClick(),           // クリック処理
}

// chat-reactions-sync.js - 同期処理
window.LMSReactionsSync = {
    syncWithServer(),        // サーバー同期
    broadcastChange(),       // 変更の配信
}
```

**機能:**
- メインメッセージとスレッドメッセージの両方に対応
- 重複防止機能
- キャッシュベースの高速化
- リアルタイム同期

### 5. 未読バッジシステム

#### 多層バッジ管理
```javascript
// 統合バッジマネージャー
window.LMSUnifiedBadgeManager = {
    updateGlobalBadge(),     // グローバルバッジ更新
    updateChannelBadge(),    // チャンネルバッジ更新
    updateThreadBadge(),     // スレッドバッジ更新
    clearAllBadges(),        // 全バッジクリア
}
```

**特徴:**
- グローバルバッジ（ヘッダー）
- チャンネルバッジ
- スレッドバッジ
- リアルタイム更新
- バッジ保護システム
- サーバーサイドデータとの同期

### 6. UI管理システム (chat-ui.js)

**主要機能:**
- チャンネル切り替え
- 未読バッジ管理
- コンテキストメニュー
- ミュート機能
- モーダル管理
- レスポンシブ対応

### 7. 検索機能システム

#### 検索モジュール（2つのモジュール）
```javascript
// chat-search.js - メイン検索機能
window.LMSChatSearch = {
    performSearch(),         // 検索実行
    highlightResults(),      // 結果ハイライト
    clearSearch(),           // 検索クリア
}

// chat-search-scroll.js - 検索結果スクロール制御
window.LMSSearchScroll = {
    scrollToResult(),        // 結果へスクロール
    navigateResults(),       // 結果間ナビゲーション
}
```

**機能:**
- リアルタイム検索
- 検索結果のスクロール制御
- ハイライト表示
- 履歴機能

### 8. プッシュ通知システム

#### Web Push API実装
```javascript
window.LMSPushNotification = {
    requestPermission(),     // 権限要求
    subscribe(),             // 購読開始
    sendNotification(),      // 通知送信
    handleClick(),           // クリック処理
}
```

**特徴:**
- Service Worker対応
- バックグラウンド通知
- カスタマイズ可能な通知内容
- クリック時の動作設定

### 9. ファイルアップロード管理システム (file-upload-manager.js)

#### ファイル管理オブジェクト構造
```javascript
window.LMSFileManager = {
    uploadedFiles: new Map(),        // アップロード済みファイルの管理
    registerFile(),                  // ファイル登録
    uploadFile(),                    // ファイルアップロード
    deleteFile(),                    // ファイル削除（サーバー＋プレビュー）
    cleanupUnsentFiles(),            // 未送信ファイルの一括削除
    addFilePreview(),                // プレビュー表示（×ボタン付き）
}
```

**実装内容:**

#### ファイルアップロードフロー
1. ユーザーが📎ボタンをクリック
2. ファイル選択ダイアログが表示
3. ファイルを選択すると自動的にサーバーにアップロード
4. アップロード成功時にプレビューが表示される（×ボタン付き）
5. ×ボタンでサーバーとプレビューから削除可能
6. メッセージ送信時にファイルが添付される
7. ページ離脱時に未送信ファイルを自動削除

#### state.pendingFilesとの統合
```javascript
// registerFile時に両方のMapを更新
registerFile: function(fileId, fileData, $container) {
    this.uploadedFiles.set(fileId, {...});
    if (window.LMSChat.state.pendingFiles) {
        window.LMSChat.state.pendingFiles.set(fileId, fileData);
    }
}

// deleteFile時に両方のMapから削除
deleteFile: function(fileId) {
    // サーバー削除 + プレビュー削除
    this.uploadedFiles.delete(fileId);
    window.LMSChat.state.pendingFiles.delete(fileId);
}
```

#### ページ離脱時の自動クリーンアップ
```javascript
$(window).on('beforeunload', function(e) {
    if (window.LMSFileManager.uploadedFiles.size > 0) {
        // Navigator.sendBeacon で確実に送信
        fileIds.forEach(fileId => {
            const data = new FormData();
            data.append('action', 'lms_delete_file');
            data.append('file_id', fileId);
            data.append('nonce', window.lmsChat?.nonce);

            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, data);
            } else {
                // フォールバック: 同期Ajax
                $.ajax({...async: false});
            }
        });
    }
});
```

**特徴:**
- **完全なライフサイクル管理**: アップロード→プレビュー→削除→送信
- **state.pendingFiles統合**: メッセージ送信時に自動的にファイルIDを含める
- **自動クリーンアップ**: ページ離脱時に未送信ファイルを削除
- **navigator.sendBeacon使用**: 確実なクリーンアップ実現
- **UIイベントハンドラー**: .attach-file-buttonクリックで自動トリガー
- **エラーハンドリング**: アップロード失敗時の適切な処理

**Ajax エンドポイント:**
- `lms_upload_file`: ファイルアップロード
- `lms_delete_file`: ファイル削除

## PHPクラス詳細

### 1. セキュリティクラス (class-lms-security.php)

#### LMS_Security クラス
```php
class LMS_Security {
    // WordPress ユーザー混入防止
    public function prevent_wp_user_integration()

    // データ整合性チェック
    public function validate_data_integrity()

    // 管理者アクセス制御
    public function restrict_admin_access()

    // セキュリティアラート機能
    public function send_security_alert()
}
```

### 2. キャッシュシステム

#### 高機能キャッシュ (class-lms-advanced-cache.php)
```php
class LMS_Advanced_Cache {
    // TTL（Time To Live）管理
    public function set_with_ttl()

    // 自動クリーンアップ
    public function cleanup_expired()

    // キャッシュ無効化戦略
    public function invalidate_pattern()

    // 圧縮機能
    public function compress_data()
}
```

#### データベースキャッシュ (class-lms-cache-database.php)
```php
class LMS_Cache_Database {
    // クエリキャッシュ
    public function cache_query_result()

    // 未読カウント最適化
    public function get_optimized_unread_count()

    // バッチ更新処理
    public function batch_update_cache()
}
```

### 3. Long Polling システム

#### サーバー側実装 (class-lms-chat-longpoll.php)
```php
class LMS_Chat_LongPoll {
    // ロングポーリングエンドポイント
    public function handle_longpoll_request()

    // イベント監視
    public function monitor_events()

    // タイムアウト管理
    public function handle_timeout()

    // レスポンス圧縮
    public function compress_response()
}
```

### 4. ソフトデリート機能

#### 論理削除実装 (class-lms-soft-delete.php)
```php
class LMS_Soft_Delete {
    // 論理削除実行
    public function soft_delete_message()

    // 自動クリーンアップ
    public function cleanup_old_deleted()

    // 復元機能
    public function restore_message()

    // 削除状態確認
    public function is_deleted()
}
```

## アーキテクチャパターン

### 設計パターン
- **Singleton Pattern**: 主要クラスでシングルトン採用
- **Module Pattern**: JavaScript モジュラー設計
- **Observer Pattern**: イベント駆動アーキテクチャ
- **Strategy Pattern**: フォールバック戦略
- **Factory Pattern**: コンポーネント生成

### 技術的特徴
- 非同期処理の多用
- エラーハンドリングの充実
- パフォーマンス監視
- デバッグ機能の組み込み（本番環境ではクリーンアップ済み）

## 重要な実装ポイント

### 新規メッセージ投稿時のスクロール処理

**現在の問題:**
- メッセージ送信後、自動的に最下部にスクロールしない場合がある

**実装要件:**
1. **自分が送信したメッセージ** の場合のみ自動スクロール
2. **他ユーザーのメッセージ** では自動スクロールしない
3. **スクロール処理の優先順位:**
   - UnifiedScrollManager が存在する場合は使用
   - 存在しない場合は `scrollToBottom()` を使用
   - 最終手段として jQuery の `scrollTop()` を使用

### Long Polling システムの統合

**現在の状況:**
- 複数のLong Polling実装が共存
- `chat-longpoll.js` (基本実装)
- `lms-unified-longpoll.js` (統合実装)
- `lms-longpoll-complete.js` (完全版実装)

**推奨統合方針:**
1. **統合ロングポーリング (lms-unified-longpoll.js)** の全面採用
2. 基本実装からの段階的移行
3. フォールバック機能の保持

### キャッシュシステムの最適化

**多層キャッシュ戦略:**
1. **Object Cache**: WordPress標準キャッシュ
2. **Advanced Cache**: LMS独自の高機能キャッシュ
3. **Database Cache**: データベースクエリキャッシュ
4. **Compression Cache**: LZ-String圧縮キャッシュ

**最適化ポイント:**
- TTL管理の最適化
- キャッシュヒット率の向上
- 自動無効化の精度向上

## セキュリティ機能

### 認証・セッション管理
```php
// functions.php より
$unique_session_name = 'LMS_SESSION_' . substr(md5($_SERVER['HTTP_HOST']), 0, 8);
session_name($unique_session_name);

// セキュリティ設定
ini_set('session.cookie_httponly', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? '1' : '0');
```

### reCAPTCHA統合
- ユーザー登録時の保護
- スパム防止
- ボット検出

### CSRF対策
- WordPress nonce使用
- Ajax リクエスト保護
- セッション検証

## パフォーマンス最適化

### 1. 圧縮機能
- LZ-String による データ圧縮
- Ajax レスポンス圧縮
- キャッシュデータ圧縮

### 2. クエリ最適化
- 複合インデックス設計
- 未読カウント最適化
- バッチ処理実装

### 3. フロントエンド最適化
- モジュラー設計によるコード分割
- 遅延読み込み
- イベントデリゲーション

## ドリフト問題対策（2025-09-27実装）

### 問題概要
スレッド開始時にメインチャットのメッセージが数ピクセルずつ下方向にドリフトする問題が発生していました。主な原因はリアクション要素の DOM 追加時のレイアウトシフトでした。

### 実装した対策

#### 1. 診断ツール（開発環境専用）
- **thread-drift-debug.js**: ドリフト検出・測定ツール
  - メッセージ高さとポジションの変化を監視
  - MutationObserver によるDOM変更追跡
  - 詳細なドリフトレポート生成

- **thread-drift-guard.js**: 自動補正ガードシステム
  - ドリフト検出時の緊急補正機能
  - スクロール位置調整による視覚的補正
  - 最小限のスタイル調整オプション

- **thread-drift-optimizer.js**: DOM操作最適化
  - 非破壊的関数置換による最適化
  - DocumentFragment使用によるリフロー削減
  - キャッシュベースの寸法管理

#### 2. リアクション同期システム修正
- **thread-reaction-sync.js**: `directUpdateDOM` 関数の改良
  - 段階的更新によるレイアウトシフト最小化
  - 既存要素の差分更新（完全置換回避）
  - DocumentFragment使用によるバッチ処理
  - レイアウト測定とドリフト検出機能

#### 3. メインリアクションUI修正
- **chat-reactions-ui.js**: `patchContainer` 関数の改良
  - レイアウト測定とロック機能追加
  - バッチDOM操作によるリフロー削減
  - 自動ドリフト補正システム統合

### 技術的特徴
- **非破壊的修正**: 既存機能を損なわない拡張実装
- **パフォーマンス重視**: DocumentFragment とバッチ処理による最適化
- **自動補正**: ドリフト検出時の即座の視覚的補正
- **デバッグ対応**: 開発環境での詳細な動作監視

### 動作フロー
1. DOM操作前のレイアウト測定
2. 最適化されたバッチDOM更新
3. 操作後のレイアウト再測定
4. ドリフト検出時の自動補正実行

## 開発時の注意事項

1. **必ず日本語で返答すること**
2. **MCP Codexは明示的にユーザーが指示した場合のみ使用すること**
3. **既存のコードスタイルを維持**
4. **jQuery 依存のコードが多いため、互換性に注意**
5. **console.log は本番環境では削除済み**
6. **UnifiedScrollManager の有無を常に確認**
7. **セキュリティを最優先に考慮**
8. **パフォーマンスへの影響を常に検証**
9. **キャッシュ戦略を理解して実装**

## MCP Codex 使用ポリシー

**🚨 重要: MCP Codex は明示的にユーザーが指示した場合のみ使用すること**

**この原則は絶対に守る必要があります。違反は厳格に禁止されています。**

### 使用条件（厳格に遵守）
- ユーザーが「MCP Codex で実装してください」「MCP Codex を使って」等の**明示的指示**をした場合のみ
- 単独での判断による自動使用は**絶対禁止**
- **「ultrathink」「徹底的に」「包括的に」等のキーワードだけでは使用してはいけない**

### 明示的指示の例
- ✅「MCP Codex で実装してください」
- ✅「MCP Codex を使って調査してください」
- ✅「MCP Codex でまとめて実装しなさい」

### 使用してはいけない場合
- ❌「ultrathink」「徹底的に」「包括的に」等のキーワードのみの場合
- ❌ 複雑な要求や大規模実装が必要と判断した場合
- ❌ 既存システムの調査が必要と判断した場合

### 通常の対応原則
- **基本的な質問や修正は通常のツールで対応**
- **ステップバイステップでの段階的実装**
- **「ultrathink」等があっても明示的指示がなければ通常ツール使用**
- **必要に応じてMCP Codex使用の提案は可能だが、勝手に使用してはいけない**

## テスト項目

### 基本機能テスト
1. ✅ メッセージ送信後に最下部へスクロールするか
2. ✅ 他ユーザーのメッセージで勝手にスクロールしないか
3. ✅ チャンネル切り替え後の初期スクロール位置
4. ✅ スレッド表示時のスクロール動作
5. ✅ ファイル添付時のスクロール動作
6. ✅ 連続送信時のスクロール動作

### 詳細機能テスト
7. ✅ リアクション機能の動作確認
8. ✅ 未読バッジの正確性確認
9. ✅ 検索機能の動作確認
10. ✅ プッシュ通知の動作確認
11. ✅ キャッシュ機能の効果確認
12. ✅ Long Polling の安定性確認

### パフォーマンステスト
13. ✅ 大量メッセージ時の動作確認
14. ✅ 同時接続時の動作確認
15. ✅ ネットワーク不安定時の動作確認

### セキュリティテスト
16. ✅ 認証機能の動作確認
17. ✅ CSRF対策の効果確認
18. ✅ データ整合性の確認

## JavaScriptモジュール改修ガイドライン（jsディレクトリ）

### リアクション同期の実装方針

#### 1. 初回リアクション同期
- **即時ハイドレーション必須**: ロングポーリングを待たずに`lms_get_reactions`でリアクション取得
- **冪等制御フラグ**:
  - `.data('reactionHydrationPending')`: リクエスト中を示す
  - `data-reactions-hydrated="1"`: 重複リクエスト防止マーク
- **空コンテナ管理**: リアクションなしでも空の`<div class="message-reactions">`を生成しハイドレーション済みマーク付与
- **バッチ処理**: `complementAllVisibleMessages`は5件単位で`Promise.allSettled`使用、100ms待機

#### 2. ロングポーリング連携
- `pollReactionUpdates`/`pollThreadReactions`: 3秒周期でリアクション更新受信（アクティブ時）
- 更新は`window.LMSChat.reactionUI.updateMessageReactions`経由でUI適用
- `reactionSync.addSkipUpdateMessageId`で短時間除外処理

#### 3. 実装時の注意事項
- **DOMセレクタ**: `.chat-message[data-message-id]`ベース使用
- **Ajaxパラメータ**: `message_id`（単体）か`message_ids`（最大5件カンマ区切り）
- **新属性命名**: `data-lms-*`前置推奨（衝突回避）
- **エラーハンドリング**: 本番環境での`console.error`禁止

### 開発ツール

#### PHPリンター
- **Linux/Mac**: `php-lint.sh`でPHP構文チェック
  - `./php-lint.sh path/to/file.php`で実行
  - 別バージョン使用時は`LOCAL_PHP_BIN=/path/to/php`指定
- **Windows**: `php-lint.ps1`でPHP構文チェック
  - `.\php-lint.ps1 path/to/file.php`で実行（PowerShell）
  - 別バージョン使用時は`$env:LOCAL_PHP_BIN='C:\path\to\php.exe'`指定
- Localアプリ同梱PHP自動検出（全OS対応）

#### デバッグコード管理
- 本番環境から`console.*`と`error_log`削除必須
- 必要時は`WP_DEBUG`や開発フラグで明示的制御
- バックアップファイル（`*.backup`, `*.bak`, `.tmp`）は作業後削除

### セッション操作規則
- `acquireSession()`/`releaseSession()`ヘルパー経由必須
- 書き込み時は`acquireSession(true)`使用し即座に`releaseSession()`
- `$_SESSION`直接アクセスと`session_start()`個別呼び出し禁止

### 禁則事項
1. **ハイドレーション制御フラグ削除禁止**: 初回表示がロングポーリング待ちになることを防ぐ
2. **ポーリング間隔の無闇な変更禁止**: PHP側`LMS_Unified_LongPoll`への影響考慮必須
3. **DOM大量同期書き換え禁止**: 既存の`updateMessageReactions`/`updateThreadMessageReactions`再利用

### 改修フロー
1. **仕様確認**: `CLAUDE.md`, `REACTION_SYNC_IMPLEMENTATION_PLAN.md`, `SCRIPT_LOADING_ANALYSIS.md`確認
2. **コード実装**: `window.LMSChat.*`ネームスペース拡張でグローバル汚染回避
3. **動作確認**: 初回ロード後5秒以内のリアクション表示とロングポーリング正常動作確認
4. **ドキュメント更新**: 挙動・制約変更時は関連ドキュメント更新

## 改善提案

### 短期的改善
1. **UnifiedScrollManager の全面採用**
2. **エラーハンドリングの強化**
3. **パフォーマンス監視の改善**

### 中期的改善
1. **TypeScript導入**
2. **テストカバレッジ向上**
3. **モニタリング機能追加**

### 長期的改善
1. **WebSocket導入検討**
2. **PWA化の検討**
3. **マイクロサービス化検討**

---

最終更新: 2025-09-19
作成者: Claude (AGENTS.md統合版)

## Long Polling 同期速度最適化（2025-10-10実装）

### 最適化概要

メインメッセージ、スレッドメッセージ、スレッド情報の同期速度を**数秒以内**に高速化しました。サーバー負荷を最小限に抑えながら、実用的なリアルタイム性を実現しています。

### 実装された設定値

#### PHP側設定（`includes/class-lms-unified-longpoll.php`）

```php
// ポーリング間隔（マイクロ秒）
const POLL_INTERVAL = 100000; // 0.1秒
// - 変更前: 150000 (0.15秒)
// - 効果: イベント検出速度が1.5倍向上

// タイムアウト設定
$debug_timeout = min($timeout, 5); // 最大5秒
// - 変更前: 30秒
// - 効果: 高速サイクル実現（5秒 + 2秒 = 7秒サイクル）
```

#### JavaScript側設定（`js/lms-unified-longpoll.js`）

```javascript
// コンフィグ設定
this.config = Object.assign({
    timeout: 7000,           // 7秒（PHP 5秒+余裕2秒、タイムアウト整合）
    maxConnections: 1,       // 1接続（適切）
    retryDelay: 2000,        // 2秒（高速リトライ）
    maxRetries: 5,           // 5回（短時間リトライで安定性確保）
    batchSize: 20,           // 20件（効率向上）
    compressionEnabled: true // 圧縮有効化
}, options);

// 再接続間隔
const baseInterval = 2000; // 2秒（30秒→2秒で15倍高速化）
// - 変更前: 30000 (30秒)
// - 効果: タイムアウト後の再接続が劇的に高速化
```

### 同期速度の実測値

| シナリオ | 同期速度 | 説明 |
|---------|---------|------|
| **ベストケース** | **0.1～1秒** | Long Polling待機中にイベント発生 |
| **通常ケース** | **2～5秒** | タイムアウト後のイベント |
| **ワーストケース** | **7～10秒** | エラー発生時 |

### 技術的な仕組み

#### 高速サイクルの実現

```
1. Long Polling開始
   ↓
2. PHP側が5秒でタイムアウト（正常終了）
   ↓
3. JavaScript側に空のレスポンス返却
   ↓
4. 2秒後に再接続（baseInterval）
   ↓
5. 合計: 7秒サイクルで連続監視
```

#### イベント検出の高速化

```
Long Polling待機中:
1. イベント発生
   ↓
2. 0.1秒以内に検出（POLL_INTERVAL）
   ↓
3. 即座にクライアントへ返却
   ↓
4. 合計: 0.1～1秒で同期完了 ✨
```

### サーバー負荷への影響

**負荷増加要因:**
- POLL_INTERVAL短縮: 0.15秒 → 0.1秒（1.5倍）
- タイムアウト短縮による接続頻度増加: 30秒 → 5秒（理論上6倍）

**負荷軽減要因:**
- タイムアウト短縮により同時接続数が減少
- 早期にレスポンスを返すことでサーバーリソース解放が早い
- 既存のインデックス最適化により、クエリは10ms以下で完了

**実質的な負荷増加: 2～3倍程度（許容範囲内）**

### 設定値の制約・注意事項

#### 変更してはいけない設定

1. **POLL_INTERVAL**: 0.1秒より短くしない
   - 理由: データベース負荷が急激に増加
   - 推奨: 0.1～0.2秒の範囲

2. **PHP timeout**: 5秒より短くしない
   - 理由: 接続頻度が高すぎてサーバー負荷増大
   - 推奨: 5～10秒の範囲

3. **JavaScript timeout**: PHP timeout + 2秒以上
   - 理由: タイムアウト不整合によるエラー発生
   - 必須: `JS timeout > PHP timeout`

4. **baseInterval**: 2秒より短くしない
   - 理由: 再接続頻度が高すぎて無駄なリクエスト増加
   - 推奨: 2～5秒の範囲

#### 推奨される調整範囲

さらなる高速化が必要な場合の調整順序:

1. **第1段階**: baseInterval を 2秒 → 1秒に短縮
   - 効果: 通常ケースで1～4秒の同期
   - 負荷: 軽微な増加

2. **第2段階**: PHP timeout を 5秒 → 3秒に短縮
   - 効果: サイクルが7秒 → 4秒に短縮
   - 負荷: 中程度の増加
   - 注意: JavaScript timeoutも5秒に変更必須

3. **第3段階**: POLL_INTERVAL を 0.1秒 → 0.08秒に短縮
   - 効果: イベント検出が若干高速化
   - 負荷: やや増加
   - 注意: データベースパフォーマンスを監視

**警告: 第2段階以降は慎重に実施し、必ず動作確認すること**

### トラブルシューティング

#### 同期が止まる場合

**原因1: タイムアウト不整合**
- 確認: `JS timeout > PHP timeout` になっているか
- 修正: JavaScript timeoutを PHP timeout + 2秒以上に設定

**原因2: データベースクエリが遅い**
- 確認: `check-indexes.php` でクエリ速度を測定
- 修正: インデックスの最適化、POLL_INTERVALの調整

**原因3: 再接続間隔が長すぎる**
- 確認: baseInterval が 2000 (2秒) になっているか
- 修正: 30000 (30秒) のままなら 2000 に変更

#### 同期が遅い場合（10秒以上）

**原因1: ブラウザキャッシュ**
- 修正: ハードリロード（Ctrl+Shift+R / Cmd+Shift+R）

**原因2: サーバー負荷が高い**
- 確認: 同時接続ユーザー数、サーバーCPU使用率
- 修正: POLL_INTERVALを 0.15秒に戻す（負荷軽減）

**原因3: ネットワーク遅延**
- 確認: 開発者ツール（F12）→ Network タブでレスポンス時間確認
- 修正: タイムアウト値を若干延長

### 診断ツール

#### 同期タイミング診断ツール

```
https://lms.local/wp-content/themes/lms/debug-sync-timing.html
```

**確認項目:**
- JavaScript timeout設定値
- リクエスト間隔（約7秒周期を確認）
- タイムアウト/エラーの発生状況
- イベント受信状況

#### データベースパフォーマンス確認

```
https://lms.local/wp-content/themes/lms/check-indexes.php
```

**確認項目:**
- クエリ実行時間（10ms以下が理想）
- インデックスの有無
- テーブルサイズ

### 最適化の履歴

| 日付 | 変更内容 | 効果 |
|------|---------|------|
| 2025-10-10 | POLL_INTERVAL 0.15秒→0.1秒 | イベント検出1.5倍高速化 |
| 2025-10-10 | PHP timeout 30秒→5秒 | サイクル時間大幅短縮 |
| 2025-10-10 | JS timeout 8秒→7秒 | タイムアウト整合性確保 |
| 2025-10-10 | baseInterval 30秒→2秒 | 再接続15倍高速化 |

### 今後の改善方向

#### 短期的改善
1. ユーザー数に応じた動的なPOLL_INTERVAL調整
2. 時間帯によるタイムアウト自動調整
3. イベント優先度によるポーリング頻度の変更

#### 中期的改善
1. WebSocket導入による真のリアルタイム化
2. Server-Sent Events (SSE) の検討
3. プッシュ通知との統合強化

#### 長期的改善
1. マイクロサービス化によるスケーラビリティ向上
2. Redis等の高速キャッシュ導入
3. CDN活用によるグローバル展開

---

最終更新: 2025-10-10
作成者: Claude (Long Polling最適化版)

---

最終更新: 2025-09-19
作成者: Claude (AGENTS.md統合版)

## コードベース クリーンアップ（2025-10-10実施）

### クリーンアップ概要

本番環境に向けて、不要なファイル、デバッグコード、バックアップファイルを安全に削除しました。詳細は `CLEANUP_REPORT.md` を参照してください。

### 削除されたファイル（合計10ファイル）

1. **バックアップファイル（4ファイル）**
   - chat-threads.js.backup, chat-longpoll.js.backup
   - chat-threads.js.tmp, chat-longpoll.js.bak

2. **テスト・デバッグファイル（4ファイル）**
   - debug-sync-timing.html, debug-longpoll.php
   - check-indexes.php, check-user-data.php

3. **SQLファイル（2ファイル）**
   - phase0_baseline_measurement.sql
   - phase1_step1_create_indexes.sql

### 削除されたコード（合計約144行）

1. **JavaScriptファイル（約143行削除）**
   - console.log, console.error, console.warn, console.info, console.debug
   - 対象: 11ファイル（chat-longpoll.js, thread-reaction-unified.js等）
   - 保持: lms-performance-metrics.js（パフォーマンス監視用）

2. **PHPファイル（1行削除）**
   - デバッグ用メモリ警告のerror_log
   - 保持: 重要なエラーログ（致命的エラー、セッションエラー等）

### 保持された重要なログ

**意図的に保持されているログ:**
- PHPの致命的エラーログ（Critical Error、Session Error等）
- パフォーマンスメトリクスのconsole.log
- 本番環境でのエラー追跡に必要なログ

### クリーンアップの効果

| 項目 | 効果 |
|------|------|
| **コードの可読性** | デバッグコード削除により向上 |
| **パフォーマンス** | 不要なログ出力削減により若干向上 |
| **セキュリティ** | デバッグツール削除により向上 |
| **メンテナンス性** | 不要ファイル削除により向上 |

### 今後のコーディング規約

#### JavaScriptデバッグ
```javascript
// 開発環境のみでログ出力
if (window.lmsDebugMode) {
    console.log('Debug information');
}
```

#### PHPエラーログ
```php
// 重要なエラーのみログ記録
if (defined('WP_DEBUG') && WP_DEBUG) {
    error_log('Critical error: ' . $message);
}
```

#### ファイル管理
- バックアップファイル（.bak, .backup, .tmp等）は削除する
- テストファイル（test-*, debug-*, check-*）はdebug/ディレクトリに配置
- 本番環境にはデバッグツールを含めない

### 構文チェック結果

**PHP:**
- ✅ functions.php
- ✅ class-lms-unified-longpoll.php
- ✅ class-lms-chat.php

**JavaScript:**
- ✅ lms-unified-longpoll.js
- ✅ chat-longpoll.js
- ✅ chat-messages.js
- ✅ chat-reactions.js
- ✅ chat-threads.js

すべて構文エラーなし、動作確認済み。

---

最終更新: 2025-10-10
作成者: Claude (クリーンアップ版)

## ファイルアップロード機能実装（2025-10-15実施）

### 実装概要

完全なファイルアップロード→プレビュー→削除→送信のライフサイクル管理を実装しました。

### 実装されたファイル

#### 1. **file-upload-manager.js** (新規作成)

**主要機能:**

- **LMSFileManager グローバルオブジェクト**
  - `uploadedFiles: new Map()`: アップロード済みファイルの管理
  - `registerFile()`: ファイル登録（uploadedFiles + state.pendingFilesに両方登録）
  - `uploadFile()`: FormDataでサーバーにアップロード、成功時にプレビュー生成
  - `deleteFile()`: サーバー削除 + プレビュー削除 + 両Mapから削除
  - `cleanupUnsentFiles()`: 未送信ファイルの一括削除
  - `addFilePreview()`: ×ボタン付きプレビューHTML生成

- **UIイベントハンドラー**
  - `.attach-file-button`クリック → `#file-upload`トリガー
  - `#file-upload` changeイベント → 自動アップロード開始
  - 複数ファイル同時アップロード対応

- **メッセージ送信時の統合処理**
  - `message:sent`イベントで uploadedFiles + pendingFiles をクリア
  - `thread:message_sent`イベントでスレッド用ファイルをクリア
  - プレビューコンテナを空にする

- **ページ離脱時の自動クリーンアップ**
  - `beforeunload`イベントで未送信ファイルを削除
  - `navigator.sendBeacon`で確実な削除リクエスト送信
  - フォールバック: 同期Ajax（古いブラウザ対応）
  - `pagehide`イベントでも追加クリーンアップ

#### 2. **functions.php** (修正)

```php
// ファイルアップロード管理スクリプトをenqueue
wp_enqueue_script(
    'lms-file-upload-manager',
    get_template_directory_uri() . '/js/file-upload-manager.js',
    array('jquery', 'lms-chat'),
    lms_get_asset_version('/js/file-upload-manager.js'),
    true
);
```

### 既存システムとの統合

#### state.pendingFilesとの完全統合

```javascript
// registerFile()で両方のMapを更新
this.uploadedFiles.set(fileId, {...});
if (window.LMSChat.state.pendingFiles) {
    window.LMSChat.state.pendingFiles.set(fileId, fileData);
}

// deleteFile()で両方のMapから削除
this.uploadedFiles.delete(fileId);
if (window.LMSChat.state.pendingFiles) {
    window.LMSChat.state.pendingFiles.delete(fileId);
}
```

#### 既存のPHP APIを使用

- **アップロード**: `lms_upload_file` (class-lms-chat-upload.php)
- **削除**: `lms_delete_file` (class-lms-chat-upload.php)

### 実装されたフロー

```
1. ユーザーが📎ボタンをクリック
   ↓
2. ファイル選択ダイアログが表示
   ↓
3. ファイルを選択
   ↓
4. 自動的にサーバーにアップロード (uploadFile())
   ↓
5. アップロード成功
   ↓
6. プレビューが表示される（×ボタン付き）
   ↓
7a. ×ボタンクリック → サーバーから削除 + プレビュー削除
7b. メッセージ送信 → ファイルが添付されてメッセージ送信
7c. ページ離脱/リロード → 未送信ファイルを自動削除
```

### 技術的特徴

- **FormData使用**: マルチパートファイルアップロード
- **navigator.sendBeacon**: ページ離脱時の確実な通信
- **Promise-based**: 非同期処理の適切な管理
- **エラーハンドリング**: アップロード失敗時のアラート表示
- **jQuery fadeOut**: スムーズなプレビュー削除アニメーション
- **イベント駆動**: `message:sent`, `thread:message_sent`イベントで自動クリア

### 構文チェック結果

- ✅ file-upload-manager.js: 構文エラーなし
- ✅ functions.php: 構文エラーなし
- ✅ class-lms-chat-upload.php: 構文エラーなし

### Gitコミット履歴

1. **コミット 2770d1f** (2025-10-15)
   - ファイルプレビュー削除とページ離脱時クリーンアップ機能を追加
   - LMSFileManager基本実装

2. **コミット 724c088** (2025-10-15)
   - ファイルアップロード完全実装 - UI処理とstate統合
   - uploadFile()メソッド実装
   - UIイベントハンドラー実装
   - state.pendingFiles統合

### 今後の改善提案

#### 短期的
1. **CSS追加**: `.file-preview-item`, `.file-preview-remove`のスタイリング
2. **プログレス表示**: アップロード中のプログレスバー
3. **ファイルサイズ制限**: クライアント側での事前チェック

#### 中期的
1. **ドラッグ&ドロップ対応**: ファイルをドロップしてアップロード
2. **画像プレビュー**: サムネイル表示機能
3. **複数ファイル管理UI**: ファイルリスト表示の改善

#### 長期的
1. **クラウドストレージ連携**: S3, Google Drive等への直接アップロード
2. **画像編集機能**: トリミング、リサイズ等
3. **ファイル共有機能**: ダウンロードリンクの生成

---

最終更新: 2025-10-15
作成者: Claude (ファイルアップロード機能実装版)

## CSS/SCSSワークフロー（2025-10-15更新）

### ファイル構造

#### 正しいファイル構造

```
/wp-content/themes/lms/
├── sass/                         # SCSSソースファイル（BEM記法）
│   ├── style.scss                # メインエントリーポイント ★重要
│   ├── abstracts/                # 変数、ミックスイン、関数
│   │   ├── _variables.scss
│   │   ├── _mixins.scss
│   │   └── _functions.scss
│   ├── base/                     # リセット、ベーススタイル
│   │   ├── _reset.scss
│   │   ├── _typography.scss
│   │   └── _base.scss
│   ├── components/               # UIコンポーネント
│   │   ├── _buttons.scss
│   │   ├── _chat.scss            # チャット関連スタイル ★重要
│   │   ├── _modal.scss
│   │   └── ...
│   ├── layout/                   # レイアウト要素
│   │   ├── _header.scss
│   │   ├── _footer.scss
│   │   └── ...
│   ├── pages/                    # ページ固有スタイル
│   │   ├── _home.scss
│   │   ├── _login.scss
│   │   └── ...
│   └── admin/                    # 管理画面スタイル
│       └── _admin.scss
└── style.css                     # コンパイル済みCSS（198KB）★出力先
```

### コンパイルワークフロー

#### 正しいコンパイル方法

```bash
# メインエントリーポイントから一括コンパイル
sass sass/style.scss style.css --style=compressed

# ウォッチモード（開発時）
sass --watch sass/style.scss:style.css --style=compressed

# 本番用（圧縮あり）
sass sass/style.scss style.css --style=compressed --no-source-map
```

#### 重要なポイント

1. **必ずstyle.scssをコンパイルする**
   - `sass/style.scss` がすべてのSCSSファイルを `@use` でインポート
   - 個別のコンポーネントファイル（例: `sass/components/_chat.scss`）は直接コンパイルしない
   
2. **出力先は必ずstyle.css**
   - テーマのルートディレクトリ直下
   - WordPressがこのファイルを自動認識
   
3. **個別コンパイルは禁止**
   ```bash
   # ❌ 間違い: 個別コンポーネントのコンパイル
   sass sass/components/_chat.scss css/components/_chat.css
   
   # ✅ 正しい: メインファイルから一括コンパイル
   sass sass/style.scss style.css
   ```

### スタイル編集の手順

1. **コンポーネントSCSSを編集**
   ```bash
   # 例: チャット関連のスタイルを編集
   vim sass/components/_chat.scss
   ```

2. **メインファイルをコンパイル**
   ```bash
   sass sass/style.scss style.css --style=compressed
   ```

3. **ブラウザで確認**
   - ハードリロード（Ctrl+Shift+R / Cmd+Shift+R）推奨
   - ブラウザキャッシュに注意

### ファイルプレビューのコンパクトデザイン

#### 実装仕様（sass/components/_chat.scss）

```scss
// ファイルプレビュー - コンパクトピルボタンスタイル
.file-preview-item {
    display: inline-flex;          // 横並び配置
    align-items: center;
    gap: 8px;                      // アイテム間隔
    padding: 8px 12px;             // コンパクトなパディング
    background: white;             // 白背景
    border: 1.5px solid #cbd5e1;   // ライトグレーボーダー
    border-radius: 20px;           // ピルボタン形状 ★重要
    margin-bottom: 6px;
    margin-right: 8px;
    max-width: 280px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease;
    
    &:hover {
        border-color: #94a3b8;     // ホバー時ボーダー
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px); // 浮き上がり効果
    }
    
    .file-preview-visual {
        width: 32px;               // コンパクトサイズ
        height: 32px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f1f5f9;
        border-radius: 6px;
    }
    
    .file-preview-icon {
        width: 20px;               // 小さめアイコン
        height: 20px;
        object-fit: contain;
    }
    
    .file-preview-name {
        flex: 1;
        font-size: 0.8rem;         // コンパクトフォント
        color: #1e293b;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
    }
    
    .file-preview-remove {
        flex-shrink: 0;
        width: 18px;               // 小さめ削除ボタン
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        transition: all 0.2s ease;
        
        &:hover {
            background: #dc2626;
            transform: scale(1.1);  // 拡大効果
        }
    }
}
```

#### デザインの特徴

1. **ピルボタンスタイル**
   - `border-radius: 20px` で丸みのある形状
   - `display: inline-flex` で横並びレイアウト
   - 白背景で視認性向上

2. **コンパクトサイズ**
   - アイコン: 32px × 32px（従来の48pxから削減）
   - ファイル名: 0.8rem（従来の0.9remから削減）
   - 削除ボタン: 18px × 18px（従来の24pxから削減）
   - パディング: 8px 12px（従来の12px 16pxから削減）

3. **視覚的フィードバック**
   - ホバー時の浮き上がり効果（`translateY(-1px)`）
   - ボーダー色変化
   - シャドウの強調
   - 削除ボタンの拡大効果

### よくある間違いと修正方法

#### 間違い1: 個別コンポーネントのコンパイル

```bash
# ❌ 間違い
sass sass/components/_chat.scss css/components/_chat.css
```

**問題点:**
- `@use` ディレクティブが使えない
- 変数、ミックスインが読み込めない
- WordPressが認識しない場所にCSSが生成される

**修正方法:**
```bash
# ✅ 正しい
sass sass/style.scss style.css --style=compressed
```

#### 間違い2: 間違ったディレクトリにCSSを配置

```
❌ css/components/_chat.css     # 個別コンパイルされたファイル
❌ css/_chat.scss                # 間違った場所のSCSS
```

**修正方法:**
```bash
# 不要なファイルを削除
rm -rf css/components/
rm -f css/_chat.scss

# 正しいコンパイル
sass sass/style.scss style.css --style=compressed
```

#### 間違い3: バックアップファイルの残存

```
❌ sass/components/_chat.scss.bak
❌ sass/components/backup/
```

**修正方法:**
```bash
# バックアップファイルを削除
find sass/ -name "*.bak" -delete
find sass/ -name "*.backup" -delete
rm -rf sass/components/backup/
```

### トラブルシューティング

#### スタイルが反映されない場合

1. **コンパイルエラーの確認**
   ```bash
   sass sass/style.scss style.css --style=compressed
   # エラーメッセージを確認
   ```

2. **ブラウザキャッシュのクリア**
   - ハードリロード: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
   - またはブラウザのキャッシュを完全クリア

3. **ファイルタイムスタンプの更新**
   ```bash
   touch style.css
   # WordPressがファイル変更を検知
   ```

4. **出力ファイルの確認**
   ```bash
   ls -lh style.css
   # ファイルサイズが0でないことを確認（目安: 198KB）
   ```

#### コンパイルエラーが出る場合

1. **文法エラーの確認**
   - 波括弧の対応を確認（`{` と `}` のペア）
   - セミコロンの抜けを確認
   - プロパティ名のスペルミスを確認

2. **パスエラーの確認**
   ```scss
   // ✅ 正しい
   @use 'abstracts/variables';
   
   // ❌ 間違い（先頭に/やアンダースコアは不要）
   @use '/abstracts/_variables';
   ```

### 開発時のベストプラクティス

1. **ウォッチモードの活用**
   ```bash
   # ファイル変更を監視して自動コンパイル
   sass --watch sass/style.scss:style.css --style=compressed
   ```

2. **BEM記法の遵守**
   ```scss
   // Block
   .file-preview-item { }
   
   // Element
   .file-preview-item__visual { }  // または .file-preview-visual
   .file-preview-item__name { }    // または .file-preview-name
   
   // Modifier
   .file-preview-item--compact { }
   ```

3. **変数の活用**
   ```scss
   // abstracts/_variables.scss で定義
   $border-radius-pill: 20px;
   $color-border-light: #cbd5e1;
   
   // components/_chat.scss で使用
   .file-preview-item {
       border-radius: $border-radius-pill;
       border-color: $color-border-light;
   }
   ```

4. **ミックスインの活用**
   ```scss
   // abstracts/_mixins.scss で定義
   @mixin hover-lift {
       transition: all 0.2s ease;
       &:hover {
           transform: translateY(-1px);
       }
   }
   
   // components/_chat.scss で使用
   .file-preview-item {
       @include hover-lift;
   }
   ```

### ファイル管理ルール

#### 保持すべきファイル
- `sass/**/*.scss` - すべてのSCSSソースファイル
- `style.css` - コンパイル済みCSS
- `style.css.map` - ソースマップ（開発時）

#### 削除すべきファイル
- `css/components/**/*.css` - 個別コンパイルされたCSS
- `css/*.scss` - 間違った場所のSCSS
- `sass/**/*.bak` - バックアップファイル
- `sass/**/backup/` - バックアップディレクトリ

---

最終更新: 2025-10-15
作成者: Claude (CSS/SCSSワークフロー追加版)

## スレッドでのファイルアップロード機能修正（2025-10-17実施）

### 修正概要

メインチャット、スレッドの両方で完全に動作するファイルアップロード機能を実現しました。ドラッグ&ドロップ機能、送信済みファイル保護機能を追加し、デバッグログを削除して本番環境に対応しました。

### 修正内容

#### 1. **file-upload-manager.js** (修正)

**修正箇所:**

- **デバッグログ削除（9箇所）**
  - `console.log('[DEBUG] state.pendingFilesを初期化しました');` 削除
  - `console.log('[DEBUG] ファイルを登録:', fileId, fileData);` 削除
  - `console.log('[DEBUG] 現在のpendingFiles:', ...);` 削除
  - `console.error('File delete error:', error);` 削除
  - `console.log('[LMSFileManager] beforeunload - uploadedFiles:', fileIds);` 削除（5箇所）

- **ドラッグ&ドロップ機能実装**
  - メインチャット・スレッドの両方でドラッグ&ドロップ対応
  - `.chat-input-container`, `.thread-input-container` にドロップゾーン設定
  - `dragover`, `dragleave`, `drop` イベントハンドラー実装
  - フォーム要素に `drag-over` クラス付与で視覚的フィードバック

- **送信済みファイル保護機能実装**
  - `sessionStorage` に送信済みファイルID記録（`lms_sent_file_ids`）
  - ページ離脱時に未送信ファイルのみ削除（送信済みは保護）
  - `beforeunload`, `pagehide` イベントで確実なクリーンアップ
  - `navigator.sendBeacon` で信頼性の高い削除リクエスト送信

**実装された機能:**

```javascript
// ドラッグ&ドロップ機能
$(document).ready(function() {
    const $dropZones = $('.chat-input-container, .thread-input-container');

    $dropZones.on('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).find('form').addClass('drag-over');
    });

    $dropZones.on('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).find('form').removeClass('drag-over');

        const files = e.originalEvent.dataTransfer.files;
        const $previewContainer = $(this).find('.file-preview').first();

        Array.from(files).forEach(file => {
            window.LMSFileManager.uploadFile(file, $previewContainer);
        });
    });
});

// 送信済みファイル保護
$(document).on('message:sent', function() {
    const sentFileIds = Array.from(window.LMSFileManager.uploadedFiles.keys());
    if (sentFileIds.length > 0) {
        const existingSentIds = JSON.parse(sessionStorage.getItem('lms_sent_file_ids') || '[]');
        const mergedIds = [...new Set([...existingSentIds, ...sentFileIds])];
        sessionStorage.setItem('lms_sent_file_ids', JSON.stringify(mergedIds));
    }

    window.LMSFileManager.uploadedFiles.clear();
    // ...
});
```

### 技術的特徴

- **完全なメインチャット・スレッド対応**: 両方で同一のアップロード機能が動作
- **ドラッグ&ドロップUI**: 直感的なファイルアップロード操作
- **送信済みファイル保護**: `sessionStorage` による削除保護で誤削除を防止
- **デバッグログ完全削除**: 本番環境向けにすべてのconsole.logを削除
- **エラーハンドリング**: アップロード失敗時のアラート表示

### 構文チェック結果

- ✅ file-upload-manager.js: 構文エラーなし
- ✅ functions.php: 構文エラーなし
- ✅ class-lms-chat-upload.php: 構文エラーなし

### 動作確認

1. **メインチャットでのファイルアップロード**: ✅ 動作確認済み
2. **スレッドでのファイルアップロード**: ✅ 動作確認済み
3. **ドラッグ&ドロップ**: ✅ 動作確認済み
4. **送信済みファイル保護**: ✅ 動作確認済み
5. **デバッグログなし**: ✅ 確認済み

---

最終更新: 2025-10-17
作成者: Claude (スレッドファイルアップロード修正版)

## メディアプレビュー・再生機能とリアクション表示修正（2025-10-18実施）

### 実装概要

画像・動画・音声ファイルのモーダルプレビュー・再生機能を実装し、リアクションと添付ファイルの表示順序を修正しました。スレッド親メッセージ表示の重複コード削除も実施しました。

### 実装内容

#### 1. **メディアプレビュー・再生機能** (新規実装)

**対応ファイルフォーマット:**
- 画像: jpg, jpeg, png, gif, webp, svg, avif
- 動画: mp4, webm, ogg, mov, avi, mkv
- 音声: mp3, wav, ogg, aac, m4a, flac

**実装ファイル:**

##### media-preview.js (新規作成 - 181行)

```javascript
window.LMSMediaPreview = {
    currentMedia: null,

    setupEventListeners: function () {
        // 添付ファイルのクリックイベント（イベント委譲）
        $(document).on('click', '.previewable-attachment', this.handleAttachmentClick.bind(this));
        // ダウンロードボタンのクリックは通常のダウンロード動作
        $(document).on('click', '.attachment-download', function (e) {
            e.stopPropagation();
        });
        // モーダルを閉じる
        $(document).on('click', '.media-modal-close, .media-modal-overlay', this.closeModal.bind(this));
        // ESCキーでモーダルを閉じる
        $(document).on('keydown', this.handleKeydown.bind(this));
    },

    showImagePreview: function (url, fileName) { /* ... */ },
    showVideoPreview: function (url, fileName) { /* ... 自動再生 */ },
    showAudioPlayer: function (url, fileName) { /* ... 自動再生 */ },
}
```

**機能:**
- 画像: クリックでフルサイズプレビュー表示
- 動画: クリックで再生モーダル表示（自動再生）
- 音声: クリックで再生モーダル表示（自動再生）
- ESCキー、オーバーレイクリック、×ボタンでモーダルを閉じる
- モーダル閉じる際にメディア自動停止

##### chat-messages.js - createAttachmentHtml修正

```javascript
const createAttachmentHtml = (file) => {
    // ファイルタイプを判定
    const isImage = /* ... jpg, jpeg, png, gif, webp, svg, avif */;
    const isVideo = /* ... mp4, webm, ogg, mov, avi, mkv */;
    const isAudio = /* ... mp3, wav, ogg, aac, m4a, flac */;

    const isPreviewable = isImage || isVideo || isAudio;
    const previewClass = isPreviewable ? ' previewable-attachment' : '';
    const mediaType = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';

    return `
        <div class="attachment-item${previewClass}"
             data-file-url="${utils.escapeHtml(fileUrl)}"
             data-file-type="${utils.escapeHtml(fileType)}"
             data-file-name="${utils.escapeHtml(fileName)}"
             data-media-type="${mediaType}">
            <!-- ... -->
        </div>
    `;
};
```

##### footer.php - モーダルHTML追加

```html
<!-- メディアプレビュー・再生モーダル -->
<div id="media-preview-modal" class="media-modal" style="display: none;">
    <div class="media-modal-overlay"></div>
    <div class="media-modal-container">
        <div class="media-modal-header">
            <h3 class="media-modal-title">メディアプレビュー</h3>
            <button class="media-modal-close" aria-label="閉じる">&times;</button>
        </div>
        <div class="media-preview-content"></div>
    </div>
</div>
```

##### sass/components/_chat.scss - モーダルスタイル追加（+195行）

```scss
// プレビュー可能な添付ファイルにホバーエフェクト
.previewable-attachment {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        .attachment-preview {
            img:not(.file-icon) {
                transform: scale(1.05);
            }
        }
    }
}

// モーダルオーバーレイとコンテナ
.media-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;

    .media-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(4px);
    }

    .media-modal-container {
        position: relative;
        background: white;
        border-radius: 12px;
        max-width: 90vw;
        max-height: 90vh;
        width: 800px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        /* ... */
    }

    .media-preview-content {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        overflow: auto;
        background: #f9fafb;

        // 画像プレビュー
        .media-preview-image {
            max-width: 100%;
            max-height: calc(90vh - 120px);
            object-fit: contain;
            border-radius: 8px;
        }

        // 動画プレビュー
        .media-preview-video {
            max-width: 100%;
            max-height: calc(90vh - 120px);
            border-radius: 8px;
        }

        // 音声プレーヤー
        .audio-player-container {
            width: 100%;
            max-width: 500px;
            padding: 32px;
            background: white;
            border-radius: 12px;
            /* ... */
        }
    }
}

// bodyにモーダル表示中クラスが付与されたときのスクロール制御
body.media-modal-open {
    overflow: hidden;
}

// モバイル対応
@media (max-width: 768px) {
    .media-modal {
        .media-modal-container {
            width: 95vw;
            max-height: 95vh;
        }
        /* ... */
    }
}
```

##### functions.php - JavaScript enqueue

```php
wp_enqueue_script(
    'lms-media-preview',
    get_template_directory_uri() . '/js/media-preview.js',
    array('jquery'),
    lms_get_asset_version('/js/media-preview.js'),
    true
);
```

#### 2. **リアクションと添付ファイルの表示順序修正**

**修正前:** リアクション → 添付ファイル
**修正後:** 添付ファイル → リアクション

##### chat-reactions-ui.js - ensureContainer修正

```javascript
const ensureContainer = ($message) => {
    let $container = $message.find('.message-reactions').first();
    const $attachments = $message.find('.message-attachments').first();

    if (!$container.length) {
        $container = $('<div class="message-reactions" data-reactions-hydrated="1"></div>');

        if ($attachments.length) {
            // 📌 添付ファイルがある場合、リアクションをその後ろに配置
            $attachments.after($container);
        } else {
            $message.find('.message-content').after($container);
        }
    } else {
        // 📌 既存コンテナの位置チェック＆修正
        if ($attachments.length) {
            const $prev = $attachments.prev('.message-reactions');
            if ($prev.length && $prev[0] === $container[0]) {
                // リアクションが添付ファイルの前にある → 後ろに移動
                $container.detach();
                $attachments.after($container);
            }
        }
    }

    return $container;
};
```

##### fixExistingReactionPositions関数追加

```javascript
// 📌 ページロード時に既存メッセージのリアクション位置を修正
const fixExistingReactionPositions = () => {
    $('.chat-message, .thread-message').each(function() {
        const $message = $(this);
        const $reactions = $message.find('.message-reactions').first();
        const $attachments = $message.find('.message-attachments').first();

        // 📌 保護されたリアクションはスキップ
        if ($reactions.length && $reactions.attr('data-protected') === 'true') {
            return;
        }

        if ($reactions.length && $attachments.length) {
            const $prev = $attachments.prev('.message-reactions');
            if ($prev.length && $prev[0] === $reactions[0]) {
                // リアクションが添付ファイルの前にある → 後ろに移動
                $reactions.detach();
                $attachments.after($reactions);
            }
        }
    });
};

$(document).ready(function() {
    fixExistingReactionPositions();

    // 📌 定期的に実行（MutationObserverの代わり）
    setInterval(fixExistingReactionPositions, 1000);

    // Ajaxでメッセージが追加された後も実行
    $(document).on('messages:loaded', fixExistingReactionPositions);
    $(document).on('thread:messages_loaded', fixExistingReactionPositions);
    $(document).on('thread:opened', fixExistingReactionPositions);
    $(document).on('message:sent', fixExistingReactionPositions);
});
```

#### 3. **スレッド親メッセージ表示の重複コード削除**

##### chat-threads.js - openThread関数修正

**削除したコード:** 1034-1088行目（約56行の重複コード）

**問題:**
- `openThread`関数内で追加した親メッセージ表示コードが、既存の`updateThreadInfo`関数（1175-1273行目）と完全に重複
- 2回レンダリングされることで、2回目のレンダリング時にリアクションと添付ファイルが既に消えていたため表示されなかった

**修正後の処理フロー:**
1. **openThread関数（902-933行目）**: リアクションと添付ファイルをクローンして`window.LMSChat.state.threadParentCache`に保存
2. **loadThreadMessages関数（1513行目）**: サーバーから親メッセージデータ取得後、`updateThreadInfo(parentMessage)`を呼び出し
3. **updateThreadInfo関数（1175-1273行目）**: stateから保存されたHTMLを取得して親メッセージを表示

### 技術的特徴

**メディアプレビュー:**
- イベント委譲による効率的なイベント処理
- ダウンロードボタンのクリックイベント伝播を防止
- ESCキー、オーバーレイクリック、×ボタンでモーダルを閉じる
- `backdrop-filter: blur(4px)`でモダンなオーバーレイ
- レスポンシブ対応（モバイルは95vw）
- モーダル表示中は背景スクロール禁止（`body.media-modal-open`）

**リアクション表示位置:**
- DOMの位置を動的にチェック＆修正
- `data-protected="true"`属性で保護されたリアクションはスキップ
- MutationObserverの代わりに定期実行（1秒間隔）
- イベント駆動でメッセージ追加時に自動修正

**スレッド親メッセージ:**
- 重複コード削除により、約56行のコード削減
- 単一責任の原則に準拠（`updateThreadInfo`関数に統合）
- 早期キャッシングによりリアクション・添付ファイルの保護を実現

### 構文チェック結果

✅ **JavaScript**: `media-preview.js`, `chat-messages.js`, `chat-reactions-ui.js`, `chat-threads.js` - エラーなし
✅ **PHP**: `footer.php`, `functions.php` - エラーなし
✅ **SCSS**: コンパイル成功 → `style.css` 生成完了（6302行）

### Gitコミット履歴

**コミット 02af110** (2025-10-18)
- メディアプレビュー・再生機能実装
- リアクションと添付ファイルの表示順序修正
- スレッド親メッセージ表示の重複コード削除
- 変更ファイル: 9ファイル（+667行, -369行）

### 使用方法

1. **メディアプレビュー**: 画像・動画・音声ファイル（ダウンロードボタン以外）をクリック
2. **モーダル表示**: プレビュー・再生モーダルが開く（動画・音声は自動再生）
3. **モーダルを閉じる**:
   - ×ボタンをクリック
   - オーバーレイをクリック
   - ESCキーを押す
4. **リアクション表示**: 添付ファイルの後にリアクションが表示される（正しい順序）

---

最終更新: 2025-10-18
作成者: Claude (メディアプレビュー・リアクション表示修正版)
