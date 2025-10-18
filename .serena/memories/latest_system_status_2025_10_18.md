# LMS チャットシステム - 最新システム状態 (2025-10-18)

## 最新実装機能

### 1. メディアプレビュー・再生機能 (2025-10-18実装)

**実装ファイル:**
- `js/media-preview.js` (新規作成 - 181行)
- `js/chat-messages.js` (createAttachmentHtml修正)
- `footer.php` (モーダルHTML追加)
- `sass/components/_chat.scss` (+195行のモーダルスタイル)
- `functions.php` (JavaScript enqueue)

**対応フォーマット:**
- 画像: jpg, jpeg, png, gif, webp, svg, avif
- 動画: mp4, webm, ogg, mov, avi, mkv
- 音声: mp3, wav, ogg, aac, m4a, flac

**機能:**
- 添付ファイル（ダウンロードボタン以外）クリックでプレビュー・再生
- 画像: フルサイズプレビュー
- 動画・音声: 自動再生
- ESCキー、オーバーレイクリック、×ボタンでモーダルを閉じる
- モーダル閉じる際にメディア自動停止
- レスポンシブ対応（モバイル95vw）
- backdrop-filter: blur(4px)でモダンなオーバーレイ

**技術:**
- イベント委譲による効率的な処理
- ダウンロードボタンのクリックイベント伝播防止
- body.media-modal-openクラスで背景スクロール禁止

### 2. リアクションと添付ファイルの表示順序修正 (2025-10-18実装)

**修正内容:**
- 修正前: リアクション → 添付ファイル
- 修正後: 添付ファイル → リアクション

**実装:**
- `chat-reactions-ui.js` - ensureContainer関数修正
- fixExistingReactionPositions関数追加
  - ページロード時に既存メッセージの位置を修正
  - 定期実行（1秒間隔）でMutationObserver代替
  - イベント駆動で自動修正（messages:loaded, thread:opened等）

**技術:**
- data-protected="true"属性で保護されたリアクションはスキップ
- .detach()と.after()でDOM位置変更

### 3. スレッド親メッセージ表示の重複コード削除 (2025-10-18修正)

**削除内容:**
- `chat-threads.js` openThread関数の1034-1088行目（約56行）を削除

**問題:**
- openThread関数とupdateThreadInfo関数で親メッセージを2回レンダリング
- 2回目のレンダリング時にリアクション・添付ファイルが既に消失

**修正後の処理フロー:**
1. openThread関数（902-933行目）: リアクション・添付ファイルをクローンしてstate.threadParentCacheに保存
2. loadThreadMessages関数（1513行目）: 親メッセージデータ取得後updateThreadInfo呼び出し
3. updateThreadInfo関数（1175-1273行目）: stateから保存済みHTMLを取得して表示

**効果:**
- 約56行のコード削減
- 単一責任の原則準拠（updateThreadInfo関数に統合）
- 早期キャッシングによりリアクション・添付ファイル保護実現

## ファイル構成（2025-10-18現在）

### JavaScriptファイル（56ファイル）

**新規追加:**
- `js/media-preview.js` (181行) - メディアプレビュー・再生機能

**主要ファイル:**
- `js/chat.js` - メインエントリーポイント
- `js/chat-core.js` - 基本機能、状態管理
- `js/chat-messages.js` - メッセージ表示・送信（createAttachmentHtml修正済み）
- `js/chat-ui.js` - UI管理
- `js/chat-threads.js` - スレッド機能（重複コード削除済み）
- `js/chat-reactions-ui.js` - リアクションUI（表示順序修正済み）
- `js/file-upload-manager.js` - ファイルアップロード管理
- `js/lms-unified-longpoll.js` - 統合ロングポーリング

**リアクション機能（7モジュール）:**
- `chat-reactions.js` - リアクションメイン
- `chat-reactions-core.js` - コア機能
- `chat-reactions-ui.js` - UI管理（修正済み）
- `chat-reactions-sync.js` - 同期処理
- `chat-reactions-cache.js` - キャッシュ管理
- `chat-reactions-actions.js` - アクション処理
- `lms-reaction-manager.js` - 統合マネージャー

### PHPファイル（37ファイル - includes/）

**主要クラス:**
- `class-lms-chat.php` - チャット機能中核
- `class-lms-chat-api.php` - REST API、Ajax処理
- `class-lms-chat-longpoll.php` - サーバー側Long Polling
- `class-lms-chat-upload.php` - ファイルアップロード
- `class-lms-unified-longpoll.php` - 統合ロングポーリング
- `class-lms-advanced-cache.php` - 高機能キャッシュ
- `class-lms-security.php` - セキュリティ保護
- `class-lms-auth.php` - 認証システム

### スタイルファイル

**SCSS:**
- `sass/style.scss` - メインエントリーポイント
- `sass/components/_chat.scss` - チャット関連スタイル（6302行、モーダルスタイル+195行）
- その他コンポーネント、レイアウト、ページ固有スタイル

**コンパイル済みCSS:**
- `style.css` - 6302行（圧縮済み）
- `style.css.map` - ソースマップ

**コンパイルコマンド:**
```bash
sass sass/style.scss style.css --style=compressed
```

### テンプレートファイル

**修正済み:**
- `footer.php` - メディアプレビューモーダルHTML追加
- `functions.php` - lms-media-previewスクリプトenqueue追加

## データベース構造

**主要テーブル:**
- `wp_lms_chat_messages` - メインメッセージ
- `wp_lms_chat_thread_messages` - スレッドメッセージ
- `wp_lms_chat_channels` - チャンネル
- `wp_lms_chat_channel_members` - チャンネルメンバー
- `wp_lms_chat_last_viewed` - 最終閲覧時刻
- `wp_lms_chat_thread_last_viewed` - スレッド最終閲覧時刻
- `wp_lms_chat_reactions` - リアクション
- `wp_lms_chat_thread_reactions` - スレッドリアクション

**最適化:**
- 複合インデックス設計
- 未読カウント専用クエリ最適化
- キャッシュ戦略

## パフォーマンス設定（2025-10-10最適化）

### Long Polling設定

**PHP側（class-lms-unified-longpoll.php）:**
- POLL_INTERVAL: 100000 (0.1秒)
- タイムアウト: 5秒

**JavaScript側（lms-unified-longpoll.js）:**
- timeout: 7000 (7秒)
- retryDelay: 2000 (2秒)
- maxConnections: 1
- baseInterval: 2000 (2秒)

**同期速度:**
- ベストケース: 0.1～1秒
- 通常ケース: 2～5秒
- ワーストケース: 7～10秒

## 重要な実装ポイント

### メディアプレビュー

**使用方法:**
1. 画像・動画・音声ファイル（ダウンロードボタン以外）をクリック
2. モーダル表示（動画・音声は自動再生）
3. ESCキー、オーバーレイクリック、×ボタンで閉じる

**技術:**
- イベント委譲（.previewable-attachment）
- データ属性（data-file-url, data-media-type等）
- backdrop-filter: blur(4px)
- body.media-modal-openでスクロール制御

### リアクション表示位置

**実装:**
- ensureContainer関数で位置チェック＆修正
- fixExistingReactionPositions関数で定期実行（1秒間隔）
- イベント駆動で自動修正

**保護機能:**
- data-protected="true"属性でスレッド開始時のメインチャットリアクションを保護

### スレッド親メッセージ

**キャッシュ戦略:**
- window.LMSChat.state.threadParentCacheにリアクション・添付ファイルのHTMLを保存
- openThread関数で早期クローン
- updateThreadInfo関数で取得＆表示

## Gitコミット履歴（最新）

**コミット 02af110** (2025-10-18)
- feat: メディアプレビュー・再生機能とリアクション表示修正を実装
- 変更: 9ファイル（+667行, -369行）
- 新規作成: js/media-preview.js

**主な変更:**
- メディアプレビュー・再生機能実装
- リアクションと添付ファイルの表示順序修正
- スレッド親メッセージ表示の重複コード削除（約56行）

## 構文チェック結果

✅ **JavaScript:** media-preview.js, chat-messages.js, chat-reactions-ui.js, chat-threads.js - エラーなし
✅ **PHP:** footer.php, functions.php - エラーなし
✅ **SCSS:** コンパイル成功 → style.css生成完了（6302行）

## 開発ガイドライン

### デバッグコード
- 本番環境からconsole.*とerror_log削除必須
- WP_DEBUGや開発フラグで明示的制御

### セッション操作
- acquireSession()/releaseSession()ヘルパー経由必須
- $_SESSION直接アクセス禁止

### SCSSワークフロー
- sass/style.scssから一括コンパイル
- 個別コンポーネントファイルは直接コンパイル禁止
- 出力先は必ずstyle.css（テーマルート直下）

### Git操作
- functions.php内のacquireSession()/releaseSession()ヘルパー使用
- コミットメッセージに🤖 Generated with Claude Code追記

## 今後の改善提案

### 短期的
- メディアプレビュー: プログレスバー表示
- UnifiedScrollManagerの全面採用
- エラーハンドリング強化

### 中期的
- ドラッグ&ドロップでメディアアップロード
- TypeScript導入
- テストカバレッジ向上

### 長期的
- WebSocket導入による真のリアルタイム化
- PWA化の検討
- マイクロサービス化検討

---

最終更新: 2025-10-18
作成者: Claude (Serena Memory)
