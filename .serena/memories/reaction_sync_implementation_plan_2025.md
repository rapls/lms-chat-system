# リアクション同期システム改善計画 v2.0
作成日: 2025-01-13

## 📊 現在のシステム分析結果

### システム構成
- **JavaScript**: 6つのリアクション関連モジュール
  - chat-reactions-core.js (状態管理)
  - chat-reactions-ui.js (UI更新)
  - chat-reactions-actions.js (Ajax処理)
  - chat-reactions-sync.js (15分間隔ポーリング)
  - chat-reactions-cache.js (キャッシュ管理)
  - chat-reactions.js (統合)

- **PHP**: 
  - class-lms-chat.php (CRUD操作、notify_reaction_update実装済み)
  - class-lms-chat-api.php (Ajaxエンドポイント)
  - class-lms-chat-longpoll.php (リアクションイベント未実装)

- **データベース**:
  - wp_lms_chat_reactions (リアクションデータ)
  - wp_lms_chat_reaction_updates (更新通知用、未活用)

### 発見された重要な事実
1. **リアクション更新通知システムが既に存在** (`wp_lms_chat_reaction_updates`テーブル)
2. **Long Pollingとリアクションが未接続**
3. **エラーハンドリングとリトライ機構実装済み**
4. **多層キャッシュシステム存在**

### 主な問題点
1. **15分間隔の独立ポーリング** - リアルタイム性欠如
2. **Long Polling未活用** - 既存インフラが使われていない
3. **状態管理の複雑性** - 処理中フラグが分散
4. **スケーラビリティ** - 不要なデータ取得

## 🎯 実装計画

### Phase 1: Long Polling統合 (1-2日) 【最優先】

#### Step 1.1: Long Pollingにリアクションイベント追加
**ファイル**: `includes/class-lms-chat-longpoll.php`

```php
// 定数追加
const EVENT_REACTION_UPDATE = 'reaction_update';

// check_updates()メソッドに追加
private function check_reaction_updates($last_poll_time, $channels) {
    global $wpdb;
    $table = $wpdb->prefix . 'lms_chat_reaction_updates';
    
    $updates = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $table 
         WHERE timestamp > %d 
         AND message_id IN (
            SELECT id FROM {$wpdb->prefix}lms_chat_messages 
            WHERE channel_id IN (" . implode(',', $channels) . ")
         )
         ORDER BY timestamp ASC",
        $last_poll_time
    ));
    
    foreach ($updates as $update) {
        $this->recent_events[] = [
            'type' => self::EVENT_REACTION_UPDATE,
            'message_id' => $update->message_id,
            'reactions' => json_decode($update->reactions),
            'is_thread' => $update->is_thread,
            'timestamp' => $update->timestamp
        ];
    }
}
```

#### Step 1.2: JavaScript側のイベントリスナー実装
**ファイル**: `js/chat-longpoll.js`

```javascript
case 'reaction_update':
    handleReactionUpdate(event.message_id, event.reactions, event.is_thread);
    break;

function handleReactionUpdate(messageId, reactions, isThread) {
    // キャッシュ更新
    if (window.LMSChat.reactionCore) {
        window.LMSChat.reactionCore.cacheReactionData(messageId, reactions, isThread);
    }
    
    // UI更新
    if (window.LMSChat.reactionUI) {
        if (isThread) {
            window.LMSChat.reactionUI.updateThreadMessageReactions(messageId, reactions, false);
        } else {
            window.LMSChat.reactionUI.updateMessageReactions(messageId, reactions, false);
        }
    }
}
```

### Phase 2: ポーリング削除と最適化 (2-3日)

#### Step 2.1: 統合リアクションマネージャー作成
**新規ファイル**: `js/lms-reaction-manager.js`

```javascript
class LMSReactionManager {
    constructor() {
        this.state = new Map();
        this.pendingActions = new Map();
        this.processingActions = new Set();
    }
    
    async handleUserAction(messageId, emoji) {
        const actionKey = `${messageId}:${emoji}`;
        if (this.processingActions.has(actionKey)) return;
        
        this.processingActions.add(actionKey);
        try {
            this.optimisticUpdate(messageId, emoji);
            const response = await this.sendToServer(messageId, emoji);
            if (!response.success) {
                this.rollbackUpdate(messageId, emoji);
            }
        } finally {
            this.processingActions.delete(actionKey);
        }
    }
}
```

#### Step 2.2: 旧ポーリング無効化
- `chat-reactions-sync.js`の`startReactionPolling()`を削除
- 15分間隔のsetIntervalを削除

### Phase 3: パフォーマンス最適化 (3-4日)

#### Step 3.1: バッチ処理実装
**ファイル**: `includes/class-lms-chat.php`

```php
public function batch_update_reactions($updates) {
    global $wpdb;
    $wpdb->query('START TRANSACTION');
    
    try {
        foreach ($updates as $update) {
            $this->handle_single_reaction_update(
                $update['message_id'],
                $update['user_id'],
                $update['emoji'],
                $update['action']
            );
        }
        $wpdb->query('COMMIT');
        return ['success' => true];
    } catch (Exception $e) {
        $wpdb->query('ROLLBACK');
        return ['success' => false, 'error' => $e->getMessage()];
    }
}
```

#### Step 3.2: Virtual DOM的差分更新
```javascript
class ReactionRenderer {
    queueRender(messageId, reactions) {
        this.renderQueue.push({ messageId, reactions });
        if (!this.isRendering) {
            requestAnimationFrame(() => this.processQueue());
        }
    }
}
```

### Phase 4: 監視とデバッグツール (1日)

パフォーマンスモニター実装
- リクエスト数、レスポンス時間、キャッシュヒット率、エラー率の追跡

## 📊 実装優先順位

| フェーズ | 影響度 | 難易度 | 所要時間 | 優先度 |
|---------|--------|--------|----------|--------|
| Phase 1 | 高 | 低 | 1-2日 | **最優先** |
| Phase 2 | 高 | 中 | 2-3日 | **高** |
| Phase 3 | 中 | 高 | 3-4日 | **中** |
| Phase 4 | 低 | 低 | 1日 | **低** |

## 🚀 Quick Wins (即座に実装可能)

1. **リアクション更新テーブルのクリーンアップ**
```sql
DELETE FROM wp_lms_chat_reaction_updates 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY);
```

2. **ポーリング間隔短縮** (一時的改善)
```javascript
syncState.pollingInterval = 60000; // 15分→1分
```

3. **キャッシュTTL最適化**
```javascript
cacheState.cacheExpiration = 300000; // 1分→5分
```

## ✅ 成功指標 (KPI)

| 指標 | 現状 | 目標 | 測定方法 |
|------|------|------|----------|
| リアクション反映時間 | 最大15分 | 2秒以内 | Long Polling統合後測定 |
| CPU使用率 | - | 50%削減 | Performance Monitor |
| ネットワーク帯域 | - | 30%削減 | Network Tab |
| エラー率 | - | 0.1%以下 | エラーログ分析 |

## 📋 実装チェックリスト

### Phase 1
- [ ] Long Pollingにリアクションイベント追加
- [ ] JavaScriptイベントハンドラー実装
- [ ] 既存UIとの接続確認
- [ ] テスト環境での動作確認

### Phase 2
- [ ] 統合マネージャー実装
- [ ] 旧ポーリングコード削除
- [ ] 重複防止ロジック確認
- [ ] ロールバック機能テスト

### Phase 3
- [ ] バッチ処理実装
- [ ] Virtual DOM的更新実装
- [ ] パフォーマンス測定
- [ ] 負荷テスト実施

### Phase 4
- [ ] モニタリングツール実装
- [ ] ダッシュボード作成
- [ ] アラート設定
- [ ] ドキュメント作成

## 重要な注意点

1. **既存インフラの活用**: `wp_lms_chat_reaction_updates`テーブルが既に存在
2. **段階的移行**: Phase 1だけでも大幅な改善が可能
3. **後方互換性**: 旧システムとの並行稼働を考慮
4. **テスト重視**: 各フェーズごとに十分なテストを実施

## 関連ファイル一覧

### JavaScript
- js/chat-reactions-core.js
- js/chat-reactions-ui.js
- js/chat-reactions-actions.js
- js/chat-reactions-sync.js (廃止予定)
- js/chat-reactions-cache.js
- js/chat-reactions.js
- js/chat-longpoll.js (修正対象)
- js/lms-reaction-manager.js (新規作成)

### PHP
- includes/class-lms-chat.php
- includes/class-lms-chat-api.php
- includes/class-lms-chat-longpoll.php (修正対象)

### データベース
- wp_lms_chat_reactions
- wp_lms_chat_reaction_updates (活用対象)

---
最終更新: 2025-01-13
この計画は既存システムの詳細調査に基づいて作成されました。