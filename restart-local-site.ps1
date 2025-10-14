# Localサイト再起動スクリプト
# 使い方: PowerShellで実行
# .\restart-local-site.ps1

Write-Host "=== Localサイト再起動スクリプト ===" -ForegroundColor Cyan
Write-Host ""

# Localアプリのパスを検索
$localPath = "C:\Program Files (x86)\Local\local.exe"

if (Test-Path $localPath) {
    Write-Host "✓ Localアプリが見つかりました" -ForegroundColor Green
    Write-Host "  パス: $localPath" -ForegroundColor Gray
    Write-Host ""

    Write-Host "手動での再起動手順:" -ForegroundColor Yellow
    Write-Host "1. Localアプリを開く" -ForegroundColor White
    Write-Host "2. サイト 'lms' を選択" -ForegroundColor White
    Write-Host "3. 'Stop' ボタンをクリック" -ForegroundColor White
    Write-Host "4. 数秒待つ" -ForegroundColor White
    Write-Host "5. 'Start' ボタンをクリック" -ForegroundColor White
    Write-Host ""
    Write-Host "または、以下のコマンドでPHPサービスを再起動:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Localアプリ → サイト 'lms' を右クリック → 'Open Site Shell'" -ForegroundColor White
    Write-Host "  → 以下のコマンドを実行:" -ForegroundColor White
    Write-Host ""
    Write-Host "  sudo service php-fpm restart" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "✗ Localアプリが見つかりません" -ForegroundColor Red
    Write-Host "  期待されるパス: $localPath" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "代替方法: clear-opcache.php を実行" -ForegroundColor Yellow
Write-Host "  https://lms.local/wp-content/themes/lms/clear-opcache.php" -ForegroundColor Cyan
Write-Host ""

Read-Host "Enterキーを押して終了"
