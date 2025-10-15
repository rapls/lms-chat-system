# Xserver本番環境 デプロイメント＆テストガイド

## 📦 デプロイするファイル

以下の3つのファイルをXserverにアップロードします：

```
1. /wp-content/object-cache.php              (17 KB) - メインキャッシュシステム
2. /wp-content/themes/lms/apcu-clear-cache.php  (5.6 KB) - 管理インターフェース
3. /wp-content/themes/lms/APCU_CACHE_README.md  (8.7 KB) - ドキュメント（オプション）
```

---

## 🔧 Step 1: 事前準備

### 1-1. バックアップ作成

**必ず実施してください！**

```bash
# FTPクライアントまたはXserverのファイルマネージャーで以下をバックアップ
/public_html/wp-content/
```

**Xserverサーバーパネルでのバックアップ方法:**
1. サーバーパネル → 「バックアップ」
2. 「自動バックアップデータ取得・復元」を開く
3. 最新のバックアップを確認

### 1-2. APCu利用可能性の確認

**方法1: Xserverサーバーパネルで確認**
1. サーバーパネルにログイン
2. 「PHP Ver.切替」をクリック
3. 現在のPHPバージョンを確認（推奨: 8.0以上）
4. 「php.ini設定」でAPCuが有効か確認

**方法2: phpinfo()で確認**
1. 以下の内容で `info.php` を作成:
```php
<?php phpinfo(); ?>
```
2. `/public_html/info.php` にアップロード
3. `https://yourdomain.com/info.php` にアクセス
4. ページ内で「apcu」を検索
5. 確認後、**必ず `info.php` を削除**（セキュリティ上重要）

---

## 📤 Step 2: ファイルアップロード

### 2-1. FTP接続情報を確認

Xserverサーバーパネル → 「FTPアカウント設定」

```
FTPホスト: sv******.xserver.jp
FTPユーザー: your-account
FTPパスワード: ********
ポート: 21
```

### 2-2. FileZillaでアップロード

#### ① object-cache.php をアップロード

```
ローカル: /wp-content/object-cache.php
↓
サーバー: /public_html/wp-content/object-cache.php
```

**注意点:**
- 転送モード: **ASCII モード**（重要）
- パーミッション: **644**
- 既存ファイルがある場合は上書き確認

#### ② apcu-clear-cache.php をアップロード

```
ローカル: /wp-content/themes/lms/apcu-clear-cache.php
↓
サーバー: /public_html/wp-content/themes/lms/apcu-clear-cache.php
```

**パーミッション:** 644

#### ③ APCU_CACHE_README.md をアップロード（オプション）

```
ローカル: /wp-content/themes/lms/APCU_CACHE_README.md
↓
サーバー: /public_html/wp-content/themes/lms/APCU_CACHE_README.md
```

---

## 🔒 Step 3: セキュリティ設定

### 3-1. キャッシュクリアキーの変更

`apcu-clear-cache.php` をテキストエディタで開き、14行目を変更します：

**変更前:**
```php
define('CACHE_CLEAR_KEY', 'your-secret-key-here');
```

**変更後（ランダムな文字列に）:**
```php
define('CACHE_CLEAR_KEY', 'a3f2c1e8d9b4a6f7e3c8d2b5a9f4e1c3');
```

**強力なキーの生成方法:**
```bash
# macOS/Linuxの場合
openssl rand -hex 16

# または
echo -n "$(date +%s)$RANDOM" | md5sum | cut -d' ' -f1
```

**生成したキーを必ずメモしてください！**

### 3-2. wp-config.php の設定（オプション）

`/public_html/wp-config.php` を編集し、「編集が必要なのはここまでです」の**前**に追加：

```php
/**
 * APCu Object Cache 設定
 */
// キャッシュの有効化
define('WP_CACHE', true);

// キャッシュキープレフィックス（サイト固有に設定）
define('WP_CACHE_KEY_SALT', 'lms_site_production_');
```

**注意:** この設定は必須ではありません。設定しなくても自動的に動作します。

---

## ✅ Step 4: 動作確認テスト

### テスト1: サイトが正常に表示されるか

**手順:**
1. ブラウザで本番サイトにアクセス
2. トップページが正常に表示されることを確認
3. 管理画面（`/wp-admin/`）にログインできることを確認

**確認項目:**
- ✅ ページが正常に表示される
- ✅ 真っ白な画面が表示されない
- ✅ エラーメッセージが表示されない

**もしエラーが出た場合:**
→ 即座に `object-cache.php` を削除してロールバック

---

### テスト2: APCu状態の確認

**アクセス先:**
```
https://yourdomain.com/wp-content/themes/lms/apcu-clear-cache.php?key=YOUR_SECRET_KEY
```

**YOUR_SECRET_KEY を実際のキーに置き換えてください！**

**期待される表示:**

```
APCu Cache Clear

📊 APCu Status

APCu Version:       5.1.21
Enabled:            ✅ Yes
Memory Size:        64 MB
Cached Entries:     0 (初回は0)
Cache Hits:         0
Cache Misses:       0
Object Cache:       ✅ Active (APCu)
```

**確認ポイント:**
- ✅ APCu Version が表示される
- ✅ Enabled が「✅ Yes」になっている
- ✅ Object Cache が「✅ Active (APCu)」になっている

**❌ もし「APCu is not available」と表示された場合:**
1. Xserverサポートに連絡してAPCuを有効化してもらう
2. PHPバージョンを8.0以上に変更する

---

### テスト3: キャッシュの読み書きテスト

**方法1: 管理画面から確認**

1. WordPress管理画面にログイン
2. いくつかのページを閲覧（投稿一覧、固定ページなど）
3. 再度 `apcu-clear-cache.php` にアクセス
4. 「Cached Entries」が増えていることを確認

**期待される結果:**
```
Cached Entries:     50～200（ページ閲覧後）
Cache Hits:         100～500
Hit Rate:           95% 以上（理想）
```

**方法2: テストページで確認**

以下の内容で `cache-test.php` を作成し、テーマディレクトリにアップロード：

```php
<?php
// cache-test.php
require_once(__DIR__ . '/../../../wp-load.php');

echo "<h1>キャッシュ動作テスト</h1>";

// テストデータを書き込み
$test_key = 'production_test_' . time();
$test_value = 'テストデータ: ' . date('Y-m-d H:i:s');

wp_cache_set($test_key, $test_value, 'test_group', 60);
echo "<p>✅ 書き込み完了: {$test_value}</p>";

// 読み込みテスト
$cached_value = wp_cache_get($test_key, 'test_group');
if ($cached_value === $test_value) {
    echo "<p style='color:green;'>✅ 読み込み成功: キャッシュが正常に動作しています！</p>";
} else {
    echo "<p style='color:red;'>❌ 読み込み失敗: キャッシュが動作していません</p>";
}

// APCu状態
if (defined('WP_APCU_ENABLED') && WP_APCU_ENABLED) {
    echo "<p style='color:green;'>✅ APCuが有効です</p>";
} else {
    echo "<p style='color:orange;'>⚠️ APCuが無効です（メモリキャッシュで動作中）</p>";
}
?>
```

**アクセス先:**
```
https://yourdomain.com/wp-content/themes/lms/cache-test.php
```

**テスト後、必ず `cache-test.php` を削除してください！**

---

### テスト4: パフォーマンス測定

#### 測定ツール

**方法1: Google PageSpeed Insights**
1. https://pagespeed.web.dev/ にアクセス
2. サイトURLを入力
3. スコアを確認

**APCu導入前後の比較:**
```
導入前: スコア 60～70
導入後: スコア 80～95（期待値）
```

**方法2: GTmetrix**
1. https://gtmetrix.com/ にアクセス
2. サイトURLを入力
3. ページ読み込み時間を確認

**期待される改善:**
```
導入前: 2.0～3.0秒
導入後: 0.5～1.2秒（60～80%改善）
```

**方法3: ブラウザ開発者ツール**
1. Chrome開発者ツール（F12）を開く
2. Networkタブを選択
3. ページをリロード（Ctrl+Shift+R）
4. 「DOMContentLoaded」と「Load」の時間を確認

---

### テスト5: チャット機能の動作確認

**確認項目:**
1. ✅ メッセージ送信が正常に動作する
2. ✅ リアクション機能が動作する
3. ✅ スレッド機能が動作する
4. ✅ ファイルアップロードが動作する
5. ✅ 未読バッジが正常に表示される

**もし問題が発生した場合:**
→ キャッシュが原因の可能性があるため、一度クリアしてテスト

---

## 🗑️ Step 5: キャッシュクリア方法

### 方法1: 管理インターフェースを使用（推奨）

```
https://yourdomain.com/wp-content/themes/lms/apcu-clear-cache.php?key=YOUR_SECRET_KEY&action=clear
```

**表示されるメッセージ:**
```
✅ WordPress object cache cleared successfully!
✅ APCu cache cleared successfully!
キャッシュがクリアされました。
```

### 方法2: FTPで object-cache.php を一時的にリネーム

```
object-cache.php → object-cache.php.disabled
```

→ ページにアクセス → 再度リネーム

---

## 🚨 トラブルシューティング

### 問題1: サイトが真っ白になった

**原因:** object-cache.php のエラー

**解決方法:**
1. FTPで `/public_html/wp-content/object-cache.php` を削除
2. サイトが復旧することを確認
3. Xserverサポートに連絡してAPCu設定を確認

### 問題2: 「APCu is not available」と表示される

**原因:** APCuが無効

**解決方法:**
1. Xserverサーバーパネル → 「php.ini設定」
2. `apc.enabled = On` を確認
3. または、Xserverサポートに連絡

### 問題3: データが更新されない

**原因:** キャッシュが古い

**解決方法:**
1. キャッシュをクリア（上記の方法で）
2. ブラウザのキャッシュもクリア（Ctrl+Shift+R）

### 問題4: メモリ不足エラー

**原因:** APCuのメモリサイズが小さい

**解決方法:**
Xserverの php.ini で以下を設定：
```ini
apc.shm_size = 64M
```

---

## 🔄 ロールバック手順

万が一問題が発生した場合、すぐにロールバックできます。

### 緊急ロールバック（即座に実施）

**FTPクライアントで:**
```bash
# object-cache.php を削除
/public_html/wp-content/object-cache.php を削除

# または、リネーム
object-cache.php → object-cache.php.disabled
```

**これだけで元の状態に戻ります！**

### 完全ロールバック

1. `object-cache.php` を削除
2. `apcu-clear-cache.php` を削除（オプション）
3. `wp-config.php` から追加した設定を削除（追加した場合）

---

## 📊 監視すべき指標

### 日次チェック項目

1. **キャッシュヒット率**
   - `apcu-clear-cache.php` で確認
   - **目標: 95%以上**

2. **メモリ使用量**
   - APCu Memory Size が80%を超えたら増量を検討
   - Xserverのphp.ini で `apc.shm_size` を調整

3. **エラーログ**
   - `/public_html/wp-content/debug.log` を確認
   - APCu関連のエラーがないか確認

### 週次チェック項目

1. **パフォーマンス測定**
   - Google PageSpeed Insights でスコア確認
   - 目標: 80点以上

2. **キャッシュエントリー数**
   - 急増している場合は無限ループの可能性
   - 正常範囲: 100～1000エントリー

---

## 📞 サポート連絡先

### Xserverサポート

**電話サポート:**
- 平日10:00～18:00

**メールサポート:**
- サーバーパネル → お問い合わせ
- 24時間受付、原則24時間以内に返信

**問い合わせ内容の例:**
```
件名: APCuの有効化について

本文:
お世話になっております。
WordPressでAPCuオブジェクトキャッシュを導入したいのですが、
現在APCuが利用可能か確認したいです。

また、もし無効になっている場合は有効化をお願いできますでしょうか。

サーバーID: sv******
ドメイン: yourdomain.com
```

---

## ✅ デプロイメントチェックリスト

デプロイ前に以下を確認してください：

- [ ] バックアップを作成した
- [ ] APCuが利用可能か確認した
- [ ] セキュリティキーを変更した
- [ ] ローカル環境でテストした
- [ ] アップロードするファイルを確認した
- [ ] パーミッションを確認した（644）
- [ ] トラブルシューティング手順を理解した
- [ ] ロールバック手順を理解した

---

## 🎯 成功の基準

以下がすべて確認できれば成功です：

1. ✅ サイトが正常に表示される
2. ✅ APCuが有効と表示される
3. ✅ キャッシュの読み書きが成功する
4. ✅ PageSpeedスコアが改善する
5. ✅ チャット機能が正常に動作する
6. ✅ キャッシュヒット率が95%以上
7. ✅ エラーログにエラーがない

---

## 📚 参考資料

- [Xserver公式マニュアル](https://www.xserver.ne.jp/manual/)
- [WordPress Object Cache](https://developer.wordpress.org/reference/classes/wp_object_cache/)
- [APCu公式ドキュメント](https://www.php.net/manual/ja/book.apcu.php)

---

最終更新: 2025-10-15
作成者: Claude Code

🤖 Generated with [Claude Code](https://claude.com/claude-code)
