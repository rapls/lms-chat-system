日本語で簡潔かつ丁寧に回答してください

# AGENTS.md（`js` ディレクトリ配下向け）

このドキュメントは `wp-content/themes/lms/js` 以下のチャット関連スクリプトを改修するエージェント向けの作業指針です。テーマ全体の規約は同階層の `agent.md` を参照し、本書では特にチャット UI・リアクション同期周りの JavaScript 実装上の注意点を補足します。

## 関連モジュール概要
- `chat-messages.js`: メッセージ描画と補完ロジック。`complementMissingThreadAndReactionInfo` と `complementAllVisibleMessages` が初回ハイドレーションを担当。
- `chat-longpoll.js`: メッセージ・リアクション更新を取得する基本ロングポーリング。`scheduleNextPoll` と `pollReactionUpdates` の遅延がクライアント同期のベースになる。
- `chat-reactions-*.js`: リアクション表示/操作の各モジュール。`reactionCore` が状態保持、`reactionSync`・`direct-reaction-sync` が即時同期系のサポートを担う。
- PHP 側では `includes/class-lms-chat.php` が `lms_get_reactions`, `lms_get_reaction_updates`, `lms_get_thread_reaction_updates` を提供し、`lms_chat_reaction_updates` テーブルを管理。

## 初回リアクション同期の方針
1. **即時ハイドレーションを必須とする**: 画面に表示されたメッセージは、ロングポーリング結果を待たず `lms_get_reactions` でリアクションを取得する。`chat-messages.js` ではプレースホルダー要素のみ存在するケースでも Ajax を発火できるよう、以下のフラグを用いて冪等制御している。
   - `.data('reactionHydrationPending')`: リクエスト中であることを示す。
   - `data-reactions-hydrated="1"`: 同一要素に対して追加リクエストを行わないためのマーキング。
   これらの属性は削除や初期化の際に必ず整合を保つこと。
2. **空コンテナの扱い**: リアクションが存在しない場合でも空の `<div class="message-reactions">` を生成し、ハイドレーション済みのマークを付与する。これにより `complementAllVisibleMessages` が再度同一メッセージをキューに入れることを防ぐ。
3. **バッチ処理**: `complementAllVisibleMessages` は 5 件単位で `Promise.allSettled` を使用。負荷調整のため待機 100ms を維持し、新規の高速化を行う場合もバッチサイズとウェイトを調整してから適用する。

## ロングポーリングとの連携
- `chat-longpoll.js` の `pollReactionUpdates` / `pollThreadReactions` は 3 秒周期（アクティブ時）でリアクション更新を受信する。初回同期はハイドレーションで賄うため、ロングポール側の間隔を過度に短縮しない。
- `chat-longpoll.js` から返される更新は `window.LMSChat.reactionUI.updateMessageReactions` を経由して UI へ適用される。ハイドレーションと衝突しないよう、`reactionSync.addSkipUpdateMessageId` で短時間の除外処理を挟む設計を尊重する。

## 実装時の注意
- **DOM セレクタ**: `.chat-message[data-message-id]` をベースに処理する。セレクタを変更する場合、補完処理・スクロール制御・リアクション UI の全モジュールを確認。
- **Ajax パラメータ**: `lms_get_reactions` には `message_id`（単体）または `message_ids`（カンマ区切り最大 5 件）を渡せる。初回同期では単体リクエストを想定しているため、多数取得を追加する際はサーバー側の上限とキャッシュ (`LMS_Chat::get_message_reactions`) を必ず確認。
- **エラーハンドリング**: ハイドレーション時の Ajax 例外は握りつぶしているが、今後ログを追加する際はデバッグ用フラグで制御する（本番環境での console.error は避ける）。
- **データ属性**: 他モジュールとの連携で `data-message-id`, `data-parent-id` 等が参照されている。新しい属性を導入する際は命名衝突に注意し、`data-lms-*` 前置を推奨。

## 典型的な改修フロー
1. 仕様確認: `agent.md`, `REACTION_SYNC_IMPLEMENTATION_PLAN.md`, `SCRIPT_LOADING_ANALYSIS.md` を読み、対象タスクの前提を整理。
2. コード修正: 既存ネームスペース（`window.LMSChat.*`）を拡張する形で実装し、グローバル汚染を避ける。
3. 動作確認: ブラウザでチャット画面を開き、初回ロード後 5 秒以内にリアクションが表示されるか、ロングポールが正常に回っているかを確認。
4. ドキュメント更新: 挙動や制約を変更した場合、本ファイルまたは関連ドキュメントにも追記する。

## PHPリンターの利用
- ルート直下にある `php-lint.sh` を使用する。`./php-lint.sh path/to/file.php` で `php -l` を実行できる。
- Local アプリに同梱されている PHP 実行ファイルを自動検出するため、追加セットアップは不要。別バージョンを使う場合は `LOCAL_PHP_BIN=/path/to/php` を指定して実行する。
- Lint 結果をコミット前に確認し、構文エラーが残らないようにする。

## デバッグコード整理ルール
- 本番配布される JavaScript / PHP には `console.*` や `error_log` を残さない。必要な場合は `WP_DEBUG` や開発フラグで明示的に制御すること。
- 過去のバックアップファイル（`*.backup`, `*.bak`, `.tmp` など）や SQL スクリプトを作業中に生成した場合、使用後は必ず削除する。
- セッション操作は `acquireSession()` / `releaseSession()` を介する。将来的に `$_SESSION` へ書き込む必要が発生した場合は `acquireSession(true)` を利用し、更新後すぐにクローズする。

## 禁則事項
- 既存のハイドレーション制御フラグを削除し、初回表示がロングポーリング待ちになる状態へ戻さない。
- `chat-longpoll.js` のポーリング間隔・タイムアウトを調整する場合は、`lms-longpoll-debug-monitor.js` や PHP 側の `LMS_Unified_LongPoll` への影響を合わせて検討せずに変更しない。
- 直接 DOM を大量に書き換える同期処理（`innerHTML` 連打など）を導入しない。既存の `updateMessageReactions` / `updateThreadMessageReactions` を再利用する。

---
本ガイドに従い、チャットリアクション同期の初動を高速に保ちつつ、安全に機能追加・調整を行ってください。
