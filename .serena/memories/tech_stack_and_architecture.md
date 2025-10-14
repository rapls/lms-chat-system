# LMSチャットシステム 技術スタック＆アーキテクチャ

## 技術スタック

### フロントエンド
- **JavaScript**: jQuery + モジュラーJavaScript設計
- **名前空間**: `window.LMSChat.*`（グローバル汚染回避）
- **スタイリング**: SCSS/Sass（BEM記法）
- **圧縮ライブラリ**: LZ-String（データ圧縮）

### バックエンド  
- **言語**: PHP 7.2.5以上
- **フレームワーク**: WordPress
- **データベース**: MySQL（WordPress標準）

### リアルタイム通信
- **メイン**: Long Polling（最大30秒間待機）
- **実装**:
  - `chat-longpoll.js`: 基本実装
  - `lms-unified-longpoll.js`: 統合実装（高度機能）
  - `lms-longpoll-complete.js`: 完全版実装
- **フォールバック**: longpoll → mediumpoll → shortpoll → emergency

### セキュリティ
- **認証**: WordPress nonce
- **セッション管理**: 独自セッション名（`LMS_SESSION_*`）
- **CSRF対策**: nonceトークン
- **reCAPTCHA**: ユーザー登録時保護
- **セッション操作**: `acquireSession()`/`releaseSession()`ヘルパー必須

### キャッシュシステム
- **Object Cache**: WordPress標準
- **Advanced Cache**: LMS独自高機能キャッシュ（TTL管理）
- **Database Cache**: クエリキャッシュ
- **Compression Cache**: LZ-String圧縮

### プッシュ通知
- **API**: Web Push API
- **ライブラリ**: minishlink/web-push
- **Service Worker**: バックグラウンド通知対応

## アーキテクチャパターン

### 設計パターン
- **Singleton Pattern**: 主要PHPクラス
- **Module Pattern**: JavaScriptモジュラー設計
- **Observer Pattern**: イベント駆動アーキテクチャ
- **Strategy Pattern**: フォールバック戦略
- **Factory Pattern**: コンポーネント生成

### JavaScriptアーキテクチャ
- **メインオブジェクト**: `window.LMSChat`
  - `messages`: メッセージ管理
  - `state`: 状態管理
  - `utils`: ユーティリティ
  - `reactionCore/UI/Sync`: リアクション機能
- **統合マネージャー**:
  - `UnifiedLongPollClient`: ロングポーリング
  - `UnifiedScrollManager`: スクロール制御
  - `LMSUnifiedBadgeManager`: バッジ管理

### PHPアーキテクチャ
- **主要クラス**:
  - `LMS_Chat`: チャット中核機能
  - `LMS_Chat_API`: REST API/Ajax
  - `LMS_Chat_LongPoll`: サーバー側Long Polling
  - `LMS_Security`: セキュリティ保護
  - `LMS_Advanced_Cache`: 高機能キャッシュ

### パフォーマンス最適化
- モジュラー設計によるコード分割
- 遅延読み込み
- イベントデリゲーション
- 複合インデックス設計
- バッチ処理実装

最終更新: 2025-09-19