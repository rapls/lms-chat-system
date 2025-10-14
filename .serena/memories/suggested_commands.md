# 推奨開発コマンド

## Local by Flywheel環境
```bash
# Local環境の起動
# Local by Flywheelアプリケーションからlms2サイトを開始

# サイトアクセス
# http://lms2.local/
# http://lms2.local/wp-admin/
```

## 開発ツールとリンティング

### JavaScript
```bash
# ESLintチェック (グローバルインストールが必要)
eslint js/**/*.js --config eslint.config.js

# JSHintチェック (グローバルインストールが必要) 
jshint js/**/*.js --config .jshintrc
```

### PHP
```bash
# PHPシンタックスチェック
find . -name "*.php" -exec php -l {} \;

# WordPress Coding Standardsチェック (インストールが必要)
phpcs --standard=WordPress .
```

## SCSS/CSSビルド
```bash
# Sass監視・コンパイル (グローバルインストールが必要)
sass --watch sass/style.scss:style.css
sass --watch sass/admin.scss:admin.css

# 本番用圧縮
sass sass/style.scss:style.css --style compressed
sass sass/admin.scss:admin.css --style compressed
```

## データベース操作
```bash
# MySQL接続 (Local環境)
mysql -u root -proot -h localhost -P 10004 lms2

# データベースバックアップ
mysqldump -u root -proot -h localhost -P 10004 lms2 > backup.sql

# データベース復元
mysql -u root -proot -h localhost -P 10004 lms2 < backup.sql
```

## 開発用デバッグ

### Long Polling移行テスト
```bash
# 管理画面アクセス
# http://lms2.local/wp-admin/tools.php?page=longpoll-migration

# フロントエンドテストツール (チャット画面で)
# Ctrl + Shift + T でテストパネル表示
```

### ブラウザコンソールでの確認
```javascript
// システム状態確認
console.log(window.LMSChat);
console.log(window.UnifiedLongPollClient);
console.log(lmsLongPollConfig);

// 統合ロングポーリングテスト
LongPollSystemTester.debugInfo();

// スクロール状態確認
window.LMSChat.messages.checkScrollState();
```

## ファイル監視・自動更新
```bash
# macOS用ファイル監視 (fswatch使用)
fswatch -o js/ sass/ | xargs -n1 sh -c 'echo "Files changed, reloading..."'

# サービスワーカー更新確認
# ブラウザ開発者ツール > Application > Service Workers
```

## Git操作 (推奨)
```bash
# 現在のブランチ確認
git status

# 変更の確認
git diff

# ステージング
git add .

# コミット
git commit -m "feat: implement unified long polling system"

# プッシュ
git push origin main
```