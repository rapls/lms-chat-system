# 本番環境デプロイメント チェックリスト

## 🚀 デプロイ前（ローカル環境）

- [ ] すべての変更をコミット済み
- [ ] ローカル環境でテスト済み
- [ ] バックアップファイル（.bak, .tmp等）を削除済み
- [ ] デバッグコード（console.log, error_log）を削除済み
- [ ] Xserverサポートに連絡してAPCuが有効か確認済み

## 📦 アップロードファイルの準備

- [ ] `/wp-content/object-cache.php` (17 KB)
- [ ] `/wp-content/themes/lms/apcu-clear-cache.php` (5.6 KB)
- [ ] `/wp-content/themes/lms/production-cache-test.php` (テスト用)

## 🔒 セキュリティ設定

- [ ] `apcu-clear-cache.php` のセキュリティキーを変更済み
- [ ] 変更したキーをメモ済み（安全な場所に保存）
- [ ] ファイルのパーミッションを確認（644）

## ⬆️ アップロード

- [ ] FTP接続情報を確認済み
- [ ] `object-cache.php` をアップロード → `/public_html/wp-content/`
- [ ] `apcu-clear-cache.php` をアップロード → `/public_html/wp-content/themes/lms/`
- [ ] `production-cache-test.php` をアップロード → `/public_html/wp-content/themes/lms/`
- [ ] ファイルのパーミッションを確認（644）

## ✅ 動作確認テスト

### テスト1: サイト表示確認
- [ ] トップページが正常に表示される
- [ ] 管理画面（/wp-admin/）にログインできる
- [ ] エラーメッセージが表示されない
- [ ] 真っ白な画面が表示されない

### テスト2: APCu状態確認
- [ ] `https://yourdomain.com/wp-content/themes/lms/apcu-clear-cache.php?key=YOUR_KEY` にアクセス
- [ ] APCu Version が表示される
- [ ] Enabled が「✅ Yes」と表示される
- [ ] Object Cache が「✅ Active (APCu)」と表示される

### テスト3: 包括的テスト実行
- [ ] `https://yourdomain.com/wp-content/themes/lms/production-cache-test.php` にアクセス
- [ ] すべてのテストが「✅ 成功」と表示される
- [ ] APCuが「有効」と表示される
- [ ] キャッシュ読み書きテストが成功する

### テスト4: チャット機能確認
- [ ] メッセージ送信が正常に動作する
- [ ] リアクション機能が動作する
- [ ] スレッド機能が動作する
- [ ] ファイルアップロードが動作する
- [ ] 未読バッジが正常に表示される

### テスト5: パフォーマンス測定
- [ ] Google PageSpeed Insights でスコアを測定
- [ ] スコアが80点以上（目標）
- [ ] ページ読み込み時間が改善された（目標: 60%以上改善）

## 📊 監視設定

- [ ] キャッシュヒット率を確認（目標: 95%以上）
- [ ] メモリ使用量を確認（目標: 80%以下）
- [ ] エラーログを確認（エラーがないこと）

## 🗑️ クリーンアップ

- [ ] **重要:** `production-cache-test.php` を削除
- [ ] **重要:** `info.php` を削除（作成した場合）
- [ ] **重要:** テスト用ファイルをすべて削除

## 📝 ドキュメント更新

- [ ] デプロイ日時を記録
- [ ] セキュリティキーを安全な場所に保存
- [ ] パフォーマンス測定結果を記録（Before/After）
- [ ] 次回のメンテナンス日を設定

## 📞 トラブル時の連絡先

### エラーが発生した場合

**即座に実施:**
1. FTPで `object-cache.php` を削除
2. サイトが復旧することを確認
3. エラーログを確認

**Xserverサポート:**
- 電話: 平日10:00～18:00
- メール: 24時間受付

## 🎯 成功の基準

すべてチェックが付いたら成功です：

- [ ] サイトが正常に表示される
- [ ] APCuが有効と表示される
- [ ] すべてのテストが成功する
- [ ] チャット機能が正常に動作する
- [ ] PageSpeedスコアが改善した
- [ ] キャッシュヒット率が95%以上
- [ ] テストファイルを削除した

---

## 📅 デプロイメント記録

| 項目 | 内容 |
|------|------|
| デプロイ日 | YYYY-MM-DD |
| 実施者 | |
| PHPバージョン | |
| APCuバージョン | |
| PageSpeed（Before） | 点 |
| PageSpeed（After） | 点 |
| 改善率 | % |

---

最終更新: 2025-10-15
