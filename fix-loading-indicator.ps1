$filePath = "C:\Users\shake\Local Sites\lms\app\public\wp-content\themes\lms\js\chat-threads.js"
$content = Get-Content $filePath -Raw -Encoding UTF8

$old = @"
		} else {
			`$threadMessages.html(``
				<div class="thread-loading-subtle">
					<div class="loading-dots">
						<span></span>
						<span></span>
						<span></span>
					</div>
					<span class="loading-text">メッセージを読み込み中...</span>
				</div>
			``);
		}
"@

$new = @"
		} else {
			`$threadMessages.html('<div class="loading-indicator">メッセージを読み込み中...</div>');
		}
"@

$content = $content.Replace($old, $new)
Set-Content $filePath -Value $content -NoNewline -Encoding UTF8
Write-Host "Fixed loading indicator at line 978" -ForegroundColor Green
