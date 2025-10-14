# スレッド情報表示修正の進捗記録

**作成日**: 2025-10-13
**対象**: LMS チャットシステムのスレッド情報表示問題

---

## 問題の概要

### 主要な問題
1. **スレッドにメッセージを投稿すると、デフォルトアバターが表示される**
   - 正しいユーザーアバターではなく `/img/default-avatar.png` が表示される
   - `data-temporary="true"` 属性が付いている
   - 「最終返信: たった今」が表示されない

2. **正しい情報への変化**
   - スレッドモーダルを閉じると正しい情報に変化する
   - 「しばらくすると」正しい情報に変化する（ロングポーリング更新）

3. **リロード時の問題**
   - ページリロード時も同様にデフォルトアバターが表示される
   - スレッドメッセージのないスレッドにも「1件の返信」が誤表示される

### 正しい表示形式
```html
<div class="thread-info" data-message-id="2000">
    <div class="thread-info-avatars">
        <img src="https://lms.local/wp-content/uploads/2025/01/iconfinder-3-avatar-2754579_120516.png"
             alt="テスト2" title="テスト2" class="thread-avatar" data-user-id="2" style="z-index: 100;">
    </div>
    <div class="thread-info-text">
        <div class="thread-info-status">
            <span class="thread-reply-count">1件の返信</span>
        </div>
        <div class="thread-info-latest">最終返信: たった今</div>
    </div>
</div>
```

---

## 原因の分析

### コンソールログからの発見

#### メッセージ投稿時のログ
```javascript
[THREAD] Full response: {success: true, data: {...}}
[THREAD] Response thread_info: {total: 1, latest_reply: 'たった今', parent_message_id: 2000, avatars: Array(1)}
[THREAD] Processed avatars array: [{...}]
[THREAD] Final thread data: {total: 1, unread: 0, avatars: Array(1), latest_reply: 'たった今'}
[THREAD] Cache updated IMMEDIATELY for parent: 2000
[THREAD] After update DOM check: {avatarSrc: 'https://...png', hasTemporary: false, latestReply: '最終返信: たった今'}
```

**重要な発見**:
- `updateMessageThreadInfo`は正しく動作している（100ms後の確認で正しいデータ）
- しかし、その後に別の処理がデフォルトアバターで上書きしている

#### performActualUpdateのログ（リロード時）
```javascript
[PERFORM-UPDATE] Message: 1997 Avatars: 0 Priority: undefined Confirmed: undefined
[PERFORM-UPDATE] Message: 1999 Avatars: 0 Priority: undefined Confirmed: undefined
[PERFORM-UPDATE] Message: 2000 Avatars: 0 Priority: undefined Confirmed: undefined
// ... (複数回、空のavatarsで呼ばれる)

[PERFORM-UPDATE] Message: 2000 Avatars: 1 Priority: high Confirmed: true (正しいデータ)
[PERFORM-UPDATE] Message: 2000 Avatars: 0 Priority: undefined (再度古いデータで上書き)
```

**原因の特定**:
1. **リロード時**: `restoreThreadInfoFromCache`や他の自動復元処理が、キャッシュ保存前に空のavatarsでDOM更新
2. **メッセージ投稿後**: 正しいデータで更新されるが、100ms後に古いデータで再度上書き
3. **キャッシュのタイミング問題**: 新しいデータをキャッシュに保存する前に、古いキャッシュが読み込まれている

---

## 実施した修正

### 1. キャッシュ保存タイミングの最適化

**chat-threads.js (Line 3844-3861)**
```javascript
const threadData = {
    total: actualTotal,
    unread: 0,
    avatars: avatarsArray,
    latest_reply: threadInfo.latest_reply || '',
    timestamp: Date.now(),
    priority: 'high',
    confirmed: true
};

// 🔥 CRITICAL FIX: 最優先でキャッシュを更新（他の処理より先に実行）
if (!window.LMSChat.state.threadInfoCache) {
    window.LMSChat.state.threadInfoCache = new Map();
}
window.LMSChat.state.threadInfoCache.set(parentMessageId, threadData);
console.log('[THREAD] Cache updated IMMEDIATELY for parent:', parentMessageId);
```

**変更のポイント**:
- threadData作成直後にキャッシュを更新
- `priority: 'high'` と `confirmed: true` フラグを追加
- 他の処理より先にキャッシュに保存

### 2. displayMessages関数の最適化

**chat-messages.js (Line 1836-1855)**
```javascript
// 🔥 CRITICAL FIX: スレッド情報を最優先でキャッシュに保存（他の処理より先に実行）
if (data.thread_info && Array.isArray(data.thread_info) && data.thread_info.length > 0) {
    if (!state.threadInfoCache) {
        state.threadInfoCache = new Map();
    }
    data.thread_info.forEach((thread) => {
        if (thread.parent_message_id && thread.total_replies > 0) {
            const threadInfo = {
                total: thread.total_replies || 0,
                unread: thread.unread_count || 0,
                avatars: thread.avatars || [],
                latest_reply: thread.latest_reply || '',
                timestamp: Date.now(),
                priority: 'high',
                confirmed: true
            };
            state.threadInfoCache.set(thread.parent_message_id, threadInfo);
        }
    });
}
```

**変更のポイント**:
- displayMessages関数の**最初**（メッセージ表示前）にキャッシュ保存
- メッセージ処理前に実行することで、他の処理が常に最新キャッシュを読める

**キャッシュ使用の最適化 (Line 1933-1946)**
```javascript
if (data.thread_info && Array.isArray(data.thread_info) && data.thread_info.length > 0) {
    data.thread_info.forEach((thread) => {
        if (thread.parent_message_id) {
            const $message = $(`.chat-message[data-message-id="${thread.parent_message_id}"]`);
            if ($message.length) {
                // キャッシュから最新データを取得（既にLine 1836-1855で保存済み）
                const cachedData = state.threadInfoCache.get(thread.parent_message_id);
                if (cachedData) {
                    updateMessageThreadInfo($message, cachedData);
                }
            }
        }
    });
}
```

### 3. queueUpdate内でのキャッシュ確認

**chat-messages.js ThreadInfoUpdateManager.queueUpdate (Line 7069-7078)**
```javascript
// 🔥 CRITICAL FIX: キャッシュに優先度の高いデータがある場合はそれを使用
if (state.threadInfoCache && state.threadInfoCache.has(messageId)) {
    const cachedInfo = state.threadInfoCache.get(messageId);
    if (cachedInfo.priority === 'high' && cachedInfo.confirmed === true) {
        // キャッシュのデータの方が新しく信頼できる場合は、それを使用
        if (!threadInfo.timestamp || cachedInfo.timestamp > threadInfo.timestamp) {
            threadInfo = { ...cachedInfo };
        }
    }
}
```

**変更のポイント**:
- 古いデータが渡されても、キャッシュに新しいデータがあればそれを使用
- priority/confirmedフラグで信頼性を判定

### 4. performActualUpdate内での最終チェック

**chat-messages.js performActualUpdate (Line 7116-7128)**
```javascript
// 🔥 CRITICAL FIX: 古いデータが来た場合、キャッシュから最新データを取得
if (state.threadInfoCache && state.threadInfoCache.has(messageId)) {
    const cachedInfo = state.threadInfoCache.get(messageId);
    // キャッシュに優先度の高いデータがある場合
    if (cachedInfo.priority === 'high' && cachedInfo.confirmed === true) {
        // 渡されたデータに優先度がない、またはキャッシュの方が新しい場合
        if (!threadInfo.priority || !threadInfo.confirmed ||
            (cachedInfo.timestamp && (!threadInfo.timestamp || cachedInfo.timestamp > threadInfo.timestamp))) {
            threadInfo = { ...cachedInfo };
        }
    }
}
```

**変更のポイント**:
- DOM更新の直前に最終チェック
- 古いデータ（priority/confirmedなし）が来た場合、キャッシュから最新データを取得
- これにより、どこから呼ばれても常に最新データでDOM更新される

---

## 関連ファイル

### 修正したファイル
1. **chat-threads.js** - スレッドメッセージ送信処理
   - Line 3844-3861: キャッシュ即時更新

2. **chat-messages.js** - メッセージ表示・スレッド情報管理
   - Line 1836-1855: displayMessages最初でキャッシュ保存
   - Line 1933-1946: キャッシュデータ使用
   - Line 7069-7078: queueUpdateでキャッシュ確認
   - Line 7116-7128: performActualUpdateで最終チェック

### サーバー側ファイル（確認済み・問題なし）
- **class-lms-chat.php** - `get_thread_info_for_messages` (Line 6720-6898)
- **class-lms-chat-api.php** - `ajax_get_messages` (Line 628-690), `ajax_send_thread_message` (Line 2230-2293)

---

## 技術的詳細

### データフロー

#### メッセージ投稿時
```
1. ユーザーがスレッドにメッセージ投稿
2. ajax_send_thread_message (PHP) → thread_infoを返す
3. chat-threads.js: レスポンス受信
4. threadData作成（avatars含む）
5. 【重要】threadInfoCache.set() - 最優先で保存
6. updateMessageThreadInfo() 呼び出し
7. ThreadInfoUpdateManager.queueUpdate()
8. → キャッシュ確認（Line 7069-7078）
9. → performActualUpdate()
10. → キャッシュ再確認（Line 7116-7128）
11. → DOM更新（正しいアバター）
```

#### ページリロード時
```
1. ajax_get_messages (PHP) → thread_infoを返す
2. displayMessages() 開始
3. 【最優先】thread_infoをキャッシュに保存（Line 1836-1855）
4. メッセージ表示処理
5. thread_info更新ループ（Line 1933-1946）
6. → キャッシュから最新データ取得
7. → updateMessageThreadInfo()
8. → performActualUpdate()
9. → DOM更新（正しいアバター）
```

### キャッシュデータ構造
```javascript
{
    total: 1,                    // スレッド返信数
    unread: 0,                   // 未読数
    avatars: [{                  // アバター情報配列
        user_id: 2,
        display_name: 'テスト2',
        avatar_url: 'https://...'
    }],
    latest_reply: 'たった今',    // 最終返信時刻
    timestamp: 1760336824387,    // キャッシュ保存時刻
    priority: 'high',            // 優先度フラグ
    confirmed: true              // サーバー確定フラグ
}
```

---

## デバッグログ（削除済み）

### 追加したログ
- `[THREAD] Cache updated IMMEDIATELY for parent:` - キャッシュ保存
- `[THREAD] After update DOM check:` - DOM更新後確認
- `[PERFORM-UPDATE] Message: X Avatars: Y Priority: Z` - DOM更新呼び出し
- `[GET-MESSAGES] Server thread_info received:` - サーバーレスポンス

### 削除理由
- 502 Bad Gateway エラーが大量発生
- console.logによるサーバー過負荷の可能性
- 本番環境ではデバッグログ不要

---

## 既知の問題と対処

### 問題1: 502 Bad Gateway エラー
**原因**:
- console.logの大量出力によるサーバー過負荷
- PHP-FPMのメモリ不足またはタイムアウト

**対処**:
1. デバッグログをすべて削除
2. Localアプリを再起動（Stop → Start）
3. ブラウザのハードリロード（Ctrl+Shift+R）

### 問題2: OPcache による古いコード実行
**原因**:
- PHPのOPcacheが古いバイトコードをキャッシュ

**対処**:
1. clear-opcache.php を実行
2. Localアプリを再起動

---

## 残存する可能性のある問題

### 1. 自動復元処理との競合
**関連コード**:
- `restoreThreadInfoFromCache()` (Line 7249)
- `protectThreadButtons()` (Line 7361) - 20msごとに実行
- `emergencyRestoreThreadInfo()` (Line 7289)

**現在の対策**:
- performActualUpdate内でキャッシュ再確認（Line 7116-7128）
- queueUpdate内でキャッシュ確認（Line 7069-7078）

**追加対策が必要な場合**:
- `restoreThreadInfoFromCache`を修正して、既存のthread-infoが`priority: 'high'`の場合は更新しない
- `protectThreadButtons`の実行間隔を調整（20ms → 100ms等）

### 2. generateThreadInfoHtmlのフォールバック
**関連コード**: chat-messages.js Line 1271-1274
```javascript
if (validAvatars.length === 0) {
    avatarsHtml = `<img src="${utils.getAssetPath('wp-content/themes/lms/img/default-avatar.png')}"
                   alt="ユーザー" class="thread-avatar" data-temporary="true">`;
}
```

**問題**: avatarsが空配列の場合、デフォルトアバターを生成

**現在の対策**: performActualUpdateでキャッシュ確認により、空のavatarsが渡されないようにしている

**追加対策が必要な場合**:
- generateThreadInfoHtml内でキャッシュ確認を追加
- avatarsが空の場合、キャッシュから取得して使用

---

## 今後の改善提案

### 短期的改善
1. **デバッグモードの実装**
   - WP_DEBUGフラグでconsole.logを制御
   - 本番環境では完全に無効化

2. **自動復元処理の最適化**
   - `protectThreadButtons`の実行間隔を調整
   - キャッシュのpriorityフラグを確認してから実行

3. **エラーハンドリング強化**
   - 502エラー時の自動リトライ
   - フォールバック処理の改善

### 中期的改善
1. **キャッシュシステムの統一**
   - 複数のキャッシュ処理を統合
   - 単一のキャッシュマネージャーで管理

2. **テストの追加**
   - スレッド情報表示のユニットテスト
   - キャッシュ動作の統合テスト

3. **パフォーマンス監視**
   - DOM更新回数の監視
   - キャッシュヒット率の測定

---

## 確認手順

### 基本動作確認
1. **ブラウザでハードリロード**: `Ctrl+Shift+R`
2. **ページをリロード**
   - 既存のスレッド情報が正しいアバターで表示されるか
   - デフォルトアバターが表示されないか
3. **スレッドにメッセージを投稿**
   - 投稿直後から正しいアバターが表示されるか
   - 「最終返信: たった今」が表示されるか
   - デフォルトアバターで上書きされないか
4. **スレッドモーダルを開く・閉じる**
   - 情報が保持されているか

### エラー確認
1. コンソールにエラーが出ていないか
2. 502 Bad Gatewayエラーが発生していないか
3. Network タブで Ajax リクエストが正常か

---

## 参考情報

### 関連ドキュメント
- `CLAUDE.md` - システム全体仕様書
- `REACTION_SYNC_IMPLEMENTATION_PLAN.md` - リアクション同期仕様
- `SCRIPT_LOADING_ANALYSIS.md` - スクリプトロード分析

### 主要な関数

#### JavaScript
- `updateMessageThreadInfo()` - スレッド情報DOM更新
- `ThreadInfoUpdateManager.queueUpdate()` - 更新キュー管理
- `ThreadInfoUpdateManager.performActualUpdate()` - 実際のDOM更新
- `generateThreadInfoHtml()` - スレッド情報HTML生成
- `displayMessages()` - メッセージ表示処理

#### PHP
- `get_thread_info_for_messages()` - スレッド情報取得
- `ajax_get_messages()` - メッセージ一覧取得
- `ajax_send_thread_message()` - スレッドメッセージ送信

---

## 最終更新

**日時**: 2025-10-13 12:30
**状態**: 修正実装完了、動作確認待ち
**次のステップ**:
1. Localアプリ再起動
2. ブラウザハードリロード
3. 動作確認
4. 必要に応じて追加修正
