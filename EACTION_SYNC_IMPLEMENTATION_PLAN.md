# EACTION_SYNC_IMPLEMENTATION_PLAN.md

> **注意**: ファイル名はユーザー要望どおり `EACTION_SYNC_IMPLEMENTATION_PLAN.md` としています（元ドキュメント `REACTION_SYNC_IMPLEMENTATION_PLAN.md` の補助資料）。

## 目的
- チャットリアクションの初回同期を数秒以内に完了させ、ユーザーがページ遷移直後から最新のリアクション状態を把握できるようにする。
- 既存のロングポーリング更新サイクル（約 3 秒）と干渉せず、AJAX 呼び出しの冪等性・負荷制御を維持する。

## 現状整理
- `chat-messages.js`
  - `complementMissingThreadAndReactionInfo(messageId)` がメッセージごとのリアクション補完を担当。
  - `complementAllVisibleMessages()` が画面上のメッセージをバッチ（5 件単位）で補完。
- `chat-longpoll.js`
  - `pollReactionUpdates` / `pollThreadReactions` が 3 秒周期で差分を取得。
  - 初期状態ではプレースホルダーのみ生成され、初回反映まで 30 秒以上要するケースが発生していた。

## 実装済み対策（2025-09-16）
1. リアクション枠のハイドレーションフラグ化
   - 空コンテナでも `data-reactions-hydrated="1"` を付与し、Ajax バタつきを防止。
   - リクエスト中は `.data('reactionHydrationPending', true)` で再入防止。
2. プレースホルダー検出の厳格化
   - `.reaction-item` が存在しない場合でも、ハイドレーション済みフラグが無ければ即座に `lms_get_reactions` を呼び出す。
3. 補完キューの最適化
   - `complementAllVisibleMessages()` が未同期メッセージのみをバッチ処理し、100ms のクールダウンでサーバー負荷を平準化。

## 今後の強化案
1. **バッチ API の検討**: `lms_get_reactions` に複数 ID を渡す経路を活用し、初回同期時だけでもメッセージ単位ではなくまとめて取得する。ただし以下の検証が必要。
   - PHP 側 `handle_get_reactions()` の 5 件上限を引き上げる影響（DB 負荷、キャッシュヒット率）。
   - クライアント側で結果を適切に分配する仕組み。
2. **キャッシュ階層統合**: `reactionCache`（JS 側）と `LMS_Chat::get_message_reactions()`（PHP 側キャッシュ）の TTL を同期し、初回アクセス時にもサーバーキャッシュヒット率を上げる。
3. **統計・監視**: ログを `WP_DEBUG` 時のみ出力する軽量モードを追加し、初回同期の平均時間や失敗率を測定。

## 作業フロー推奨
1. JS 側で追加改修 ⇒ `AGENTS.md` のガイドラインに従いネームスペースを保ちつつ実装。
2. サーバー API 変更が必要な場合は `includes/class-lms-chat.php` の対象メソッドを更新。
3. 検証はチャット画面のリロードで実施。初回 3 秒以内に既存メッセージへリアクションが反映されるか確認。
4. 変更内容は本ドキュメントと `REACTION_SYNC_IMPLEMENTATION_PLAN.md` に追記し、履歴を残す。

## ロールバック
- 初回同期関連の変更を戻す場合は以下を実施。
  1. `chat-messages.js` でフラグ管理ロジックを元に戻す。
  2. 本ファイルおよび `AGENTS.md` の該当追記を削除。
  3. ロングポーリングのみで同期する旧挙動が復元されることを確認。

---
本プランを基に、初回リアクション同期の迅速化と安定化を継続的に進めてください。
