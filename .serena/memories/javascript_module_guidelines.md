# JavaScriptモジュール改修ガイドライン

## 対象ディレクトリ
`/wp-content/themes/lms/js/` - チャット関連スクリプト43ファイル

## 主要モジュール構成

### コアシステム
- `chat.js`: メインエントリーポイント
- `chat-core.js`: 基本機能、状態管理
- `chat-messages.js`: メッセージ描画・補完ロジック
  - `complementMissingThreadAndReactionInfo`: 初回ハイドレーション
  - `complementAllVisibleMessages`: 可視メッセージ補完
- `chat-ui.js`: UI管理、バッジ制御

### リアルタイム通信
- `chat-longpoll.js`: 基本ロングポーリング
  - `scheduleNextPoll`: 次回ポーリング予約
  - `pollReactionUpdates`: リアクション更新取得（3秒周期）
- `lms-unified-longpoll.js`: 統合ロングポーリング（推奨）

### リアクション機能（7モジュール）
- `chat-reactions-core.js`: 状態保持
- `chat-reactions-ui.js`: UI更新
- `chat-reactions-sync.js`: サーバー同期
- `direct-reaction-sync.js`: 即時同期サポート

## リアクション同期の実装方針

### 1. 初回ハイドレーション（必須）
```javascript
// ロングポーリングを待たず即座に取得
// 冪等制御フラグで重複防止
.data('reactionHydrationPending') // リクエスト中
data-reactions-hydrated="1" // 処理済み

// 空でも要素生成
<div class="message-reactions"></div>
```

### 2. バッチ処理仕様
- 5件単位で`Promise.allSettled`使用
- 100ms待機で負荷調整
- 高速化時もバッチサイズ/ウェイト調整必須

### 3. ロングポーリング連携
- 3秒周期でリアクション更新受信（アクティブ時）
- `window.LMSChat.reactionUI.updateMessageReactions`経由
- `reactionSync.addSkipUpdateMessageId`で短時間除外

## 実装時の注意事項

### DOMセレクタ標準
```javascript
// メインメッセージ
$('.chat-message[data-message-id]')
// スレッドメッセージ  
$('.thread-message[data-thread-message-id]')
// リアクションコンテナ
$('.message-reactions')
```

### Ajaxパラメータ仕様
```javascript
// 単体取得
{ action: 'lms_get_reactions', message_id: 123 }
// 複数取得（最大5件）
{ action: 'lms_get_reactions', message_ids: '123,124,125' }
```

### データ属性命名
- 新属性は`data-lms-*`前置推奨
- 既存: `data-message-id`, `data-parent-id`
- 命名衝突回避必須

### エラーハンドリング
- 本番環境`console.error`禁止
- デバッグはフラグ制御
- Ajax例外は握りつぶし（将来的にログ追加時はフラグ制御）

## 禁則事項
1. **ハイドレーション制御フラグ削除**: 初回表示遅延防止
2. **ポーリング間隔無闇変更**: PHP側影響考慮必須
3. **DOM大量同期書き換え**: `innerHTML`連打禁止
4. **既存メソッド再実装**: `updateMessageReactions`等再利用

## 改修フロー
1. 関連ドキュメント確認
   - CLAUDE.md
   - REACTION_SYNC_IMPLEMENTATION_PLAN.md
   - SCRIPT_LOADING_ANALYSIS.md
2. `window.LMSChat.*`ネームスペース拡張
3. 動作確認
   - 初回ロード5秒以内リアクション表示
   - ロングポーリング正常動作
4. ドキュメント更新

## PHP側連携
- `includes/class-lms-chat.php`
  - `lms_get_reactions`
  - `lms_get_reaction_updates`
  - `lms_get_thread_reaction_updates`
- `lms_chat_reaction_updates`テーブル管理

最終更新: 2025-09-19