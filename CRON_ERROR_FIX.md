# Cronイベントエラー修正ガイド

**作成日**: 2025-10-13
**エラー内容**: `Cron イベントのリストを保存できません。`

---

## 問題の概要

プッシュ通知とLong Poll通知のcronイベントが大量に溜まり、WordPressがcron配列を保存できなくなっている。

### エラーログ例
```
フックの cron 予約解除イベントエラー: lms_send_push_notification、
エラーコード: could_not_set、
エラーメッセージ: Cron イベントのリストを保存できません。
```

---

## 📋 修正手順

### ステップ1: 強制クリーンアップスクリプトを実行

1. ブラウザで以下のURLにアクセス（管理者としてログイン済みであること）:
   ```
   https://lms.local/wp-content/themes/lms/force-clear-cron.php
   ```

2. スクリプトが実行され、以下の情報が表示されます:
   - 削除前のイベント数
   - 削除後のイベント数
   - 削除されたイベント総数

3. 実行完了後、画面の指示に従ってスクリプトファイルを削除してください

### ステップ2: 動作確認

1. WordPressサイトにアクセス
2. チャットでメッセージを送信
3. エラーログを確認:
   ```
   tail -f "C:\Users\shake\Local Sites\lms\app\public\wp-content\debug.log"
   ```
4. エラーが出ていないことを確認

---

## 🔧 実装した修正内容

### 1. プッシュ通知のスケジュール改善 (includes/class-lms-chat.php)

**変更前**:
```php
wp_schedule_single_event(time(), 'lms_send_push_notification', array(...));
```

**変更後**:
```php
// プッシュ通知が有効な場合のみスケジュール
if (get_option('lms_push_notifications_enabled', 'yes') === 'yes') {
    $args = array(...);

    // 既にスケジュール済みでないか確認（重複防止）
    $timestamp = wp_next_scheduled('lms_send_push_notification', $args);
    if (!$timestamp) {
        wp_schedule_single_event(time() + 1, 'lms_send_push_notification', $args);
    }
}
```

**効果**: イベントの重複登録を防止

### 2. 自動クリーンアップ機能 (functions.php)

```php
function lms_cleanup_old_cron_events() {
    try {
        $cron_array = _get_cron_array();
        $now = time();
        $cleaned = 0;
        $max_deletions = 100; // 一度に100件まで削除

        foreach ($cron_array as $timestamp => $cron) {
            // 10分以上前のイベントは削除
            if ($timestamp < ($now - 600)) {
                // lms_send_push_notification を削除
                // lms_send_longpoll_notification を削除
            }
        }
    } catch (Exception $e) {
        error_log("LMS: cronクリーンアップエラー: " . $e->getMessage());
    }
}
```

**効果**:
- 10分以上前の古いイベントを自動削除
- 1回の実行で最大100件まで削除（負荷軽減）
- エラーが発生しても処理を継続

**実行タイミング**:
- 1日1回の定期実行
- WordPressの`init`フック時に即座に実行

---

## 🚨 緊急時の対処法

### 手動クリーンアップスクリプト

エラーが続く場合は、以下のスクリプトで全削除:

```
https://lms.local/wp-content/themes/lms/clear-cron-events.php
```

このスクリプトは:
- 全てのLMS関連cronイベントを削除
- 他のWordPressイベントは保持
- 実行後に自己削除可能

---

## 📊 監視方法

### エラーログの確認

```bash
# Windowsの場合
Get-Content "C:\Users\shake\Local Sites\lms\app\public\wp-content\debug.log" -Tail 50

# または
tail -f "C:\Users\shake\Local Sites\lms\app\public\wp-content\debug.log" | grep -i cron
```

### 正常なログの例

```
LMS: 15 件の古いcronイベントをクリーンアップしました
```

### 異常なログの例

```
フックの cron 予約解除イベントエラー: lms_send_push_notification
```

---

## 💡 予防策

### 1. プッシュ通知を一時無効化

大量のユーザーがいる場合、プッシュ通知を無効化することを検討:

管理画面 → LMS設定 → プッシュ通知 → 「無効」

### 2. 定期的なクリーンアップ

自動クリーンアップが正常に動作しているか定期確認:

```bash
# cronイベント数を確認
wp cron event list --url=https://lms.local
```

---

## 🔍 トラブルシューティング

### Q: スクリプト実行後もエラーが出る

A: 以下を確認:
1. ブラウザのキャッシュをクリア
2. WordPressのオブジェクトキャッシュをクリア
3. サーバーを再起動

### Q: スクリプトが403エラーになる

A: 管理者としてログインしているか確認

### Q: スクリプトが動作しない

A: PHPエラーログを確認:
```
C:\Users\shake\Local Sites\lms\app\public\wp-content\debug.log
```

---

## 📝 関連ファイル

- `functions.php` - 自動クリーンアップ機能
- `includes/class-lms-chat.php` - イベントスケジュール処理
- `force-clear-cron.php` - 強制クリーンアップスクリプト
- `clear-cron-events.php` - 通常クリーンアップスクリプト

---

## ✅ 動作確認チェックリスト

- [ ] force-clear-cron.php を実行
- [ ] エラーログにcronエラーが出ていない
- [ ] チャットでメッセージ送信が正常
- [ ] 新しいcronイベントが溜まっていない
- [ ] クリーンアップスクリプトを削除

---

最終更新: 2025-10-13
