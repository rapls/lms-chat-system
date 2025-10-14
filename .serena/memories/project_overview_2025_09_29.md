# LMSチャットシステム プロジェクト概要（最新版 2025-09-29）

## プロジェクトの目的
WordPress ベースの高度なリアルタイムチャットシステム。企業レベルのチャットアプリケーションとして、Long Polling によるメッセージ受信、リアクション機能、スレッド機能、プッシュ通知、ファイル共有、高機能キャッシュシステムを実装。

## 技術スタック
- **フロントエンド**: jQuery + モジュラーJavaScript設計
- **バックエンド**: PHP 7.2.5以上、WordPress
- **リアルタイム通信**: Long Polling（最大30秒間待機）
- **キャッシュシステム**: WordPress Object Cache + 独自高機能キャッシュ
- **スタイリング**: SCSS/Sass（BEM記法）
- **プッシュ通知**: Web Push API（minishlink/web-pushライブラリ）
- **ファイル圧縮**: LZ-String圧縮
- **セキュリティ**: reCAPTCHA, WordPress nonce, セッション強化

## 主要機能
- **リアルタイムメッセージング**: Long Polling（最大30秒間待機）
- **スレッド機能**: メッセージへの返信スレッド、軽量同期システム
- **リアクション機能**: 絵文字リアクション（即時ハイドレーション対応、7モジュール構成）
- **プッシュ通知**: Web Push API対応、Service Worker統合
- **ファイル共有**: セキュアなアップロード・ダウンロード機能
- **検索機能**: リアルタイム検索とハイライト表示
- **未読バッジシステム**: 多層バッジ管理（グローバル・チャンネル・スレッド）
- **高機能キャッシュシステム**: 多層キャッシュ戦略、圧縮機能

## 現在のディレクトリ構造（2025-09-29）
### JavaScript（55ファイル）
- **コアシステム**: chat.js, chat-core.js, chat-messages.js, chat-ui.js, chat-header.js
- **リアルタイム通信**: lms-unified-longpoll.js, chat-longpoll.js, lms-longpoll-complete.js, lightweight-thread-sync.js
- **リアクション機能（7モジュール）**: chat-reactions.js, chat-reactions-core.js, chat-reactions-ui.js, chat-reactions-sync.js, chat-reactions-cache.js, chat-reactions-actions.js, lms-reaction-manager.js
- **検索・スクロール**: chat-search.js, chat-search-scroll.js, chat-scroll-utility.js
- **スレッド機能**: chat-threads.js, direct-thread-loader.js
- **未読バッジシステム**: 5つのバッジ管理モジュール
- **パフォーマンス最適化**: lms-chat-performance-optimizer.js, performance-monitor.js, lms-unified-cache-system.js
- **ユーティリティ**: emoji-picker.js, keyboard-shortcuts-manager.js, push-notification.js, service-worker.js等

### PHP（37ファイル）
- **メインチャットシステム**: class-lms-chat.php, class-lms-chat-api.php, class-lms-chat-longpoll.php等
- **キャッシュシステム**: class-lms-advanced-cache.php, class-lms-cache-helper.php等
- **セキュリティ・認証**: class-lms-security.php, class-lms-auth.php, class-lms-recaptcha.php
- **データ管理**: class-lms-soft-delete.php, class-lms-database-optimizer.php等

## セッション制御ポリシー
- すべてのサーバーサイド処理は`functions.php`の`acquireSession()`/`releaseSession()`ヘルパー経由でセッションアクセス
- 読み取り専用時は`session_read_only`利用で処理完了後即座にロック解放
- 書き込み時は`acquireSession(true)`で明示し更新後必ず`releaseSession()`呼び出し
- `$_SESSION`直接アクセスと`session_start()`個別呼び出し禁止

## 大規模クリーンアップ履歴

### 2025-09-17 初回クリーンアップ
- デバッグ・テストファイル24個削除
- シェルスクリプト5個削除
- 基本的なconsole.logとerror_log削除

### 2025-09-29 大規模クリーンアップ
- **デバッグコード大量削除**: 150+ console.log/console.error + 30+ error_log削除
- **不要ファイル削除**: 44KB削減（6ファイル削除）
- **不要コメント削除**: 開発用コメント削除、機能説明コメントは保持
- **構文エラー修正**: Promise チェーン修復、オブジェクトリテラル修正
- **データベースエラー修正**: 存在しないカラム参照削除

### 現在のファイル統計
- **JavaScriptファイル**: 55個（アクティブファイル、バックアップ除く）
- **PHPファイル（includes）**: 37個
- **総ファイル数（JS+PHP、vendor除く）**: 92個

## データベース構造
### 主要テーブル
- `wp_lms_chat_messages`: メインメッセージ
- `wp_lms_chat_thread_messages`: スレッドメッセージ
- `wp_lms_chat_channels`: チャンネル
- `wp_lms_chat_channel_members`: チャンネルメンバー
- `wp_lms_chat_last_viewed`: 最終閲覧時刻
- `wp_lms_chat_thread_last_viewed`: スレッド最終閲覧時刻
- `wp_lms_chat_reactions`: リアクション
- `wp_lms_chat_thread_reactions`: スレッドリアクション

### パフォーマンス最適化
- 複合インデックス設計
- 未読カウント専用クエリ最適化
- キャッシュ戦略実装

## アーキテクチャ特徴
### 設計パターン
- **Singleton Pattern**: 主要クラスでシングルトン採用
- **Module Pattern**: JavaScript モジュラー設計
- **Observer Pattern**: イベント駆動アーキテクチャ
- **Strategy Pattern**: フォールバック戦略
- **Factory Pattern**: コンポーネント生成

### セキュリティ機能
- reCAPTCHA統合（ユーザー登録保護）
- WordPress nonce使用（CSRF対策）
- セッション強化（HTTPOnly, Secure設定）
- データ整合性チェック

## システム健全性（2025-09-29現在）
- ✅ 全JavaScript/PHP構文エラー解決
- ✅ データベーススキーマエラー解決
- ✅ 本番環境デバッグコードクリーンアップ完了
- ✅ ドキュメンテーション最新化完了
- ✅ 性能最適化実装済み

最終更新: 2025-09-29