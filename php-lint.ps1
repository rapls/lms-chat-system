# ==============================================================================
# PHP Lint Checker for Windows PowerShell
# WordPress Theme Development Tool
# ==============================================================================

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Targets,

    [switch]$Help
)

# Initialize counters
$TotalFiles = 0
$ErrorFiles = 0
$SuccessFiles = 0
$PhpBin = ""

# Show help
if ($Help -or $Targets.Count -eq 0) {
    Write-Host "PHP Lint Checker for Windows PowerShell" -ForegroundColor Cyan
    Write-Host "WordPress Theme Development Tool"
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\php-lint.ps1 <file|directory> [<file|directory>...]"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\php-lint.ps1 functions.php"
    Write-Host "  .\php-lint.ps1 includes\"
    Write-Host "  .\php-lint.ps1 *.php"
    Write-Host "  .\php-lint.ps1 functions.php includes\"
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -Help         Show this help"
    Write-Host ""
    Write-Host "Environment:" -ForegroundColor Yellow
    Write-Host "  `$env:LOCAL_PHP_BIN     Custom PHP binary path (optional)"
    Write-Host ""
    Write-Host "Auto-detect:" -ForegroundColor Blue
    Write-Host "  - Local by Flywheel (Windows)"
    Write-Host "  - XAMPP"
    Write-Host "  - WAMP"
    Write-Host "  - Laragon"
    Write-Host "  - System PATH"
    exit 0
}

# Find PHP executable
function Find-PhpExecutable {
    # Check environment variable first
    if ($env:LOCAL_PHP_BIN -and (Test-Path $env:LOCAL_PHP_BIN)) {
        Write-Host "[DEBUG] Found via env var: $env:LOCAL_PHP_BIN" -ForegroundColor Gray
        return $env:LOCAL_PHP_BIN
    }

    # Try to find Local by Flywheel PHP (new version)
    $LocalProgramPaths = @(
        "$env:USERPROFILE\AppData\Local\Programs\Local\resources\extraResources\lightning-services",
        "C:\Program Files\Local\resources\extraResources\lightning-services",
        "C:\Program Files (x86)\Local\resources\extraResources\lightning-services"
    )

    foreach ($LocalPath in $LocalProgramPaths) {
        if (Test-Path $LocalPath) {
            Write-Host "[DEBUG] Searching Local directory: $LocalPath" -ForegroundColor Gray
            $PhpPaths = Get-ChildItem -Path $LocalPath -Filter "php.exe" -Recurse -ErrorAction SilentlyContinue |
                       Where-Object { $_.FullName -match "php-[\d\.]+.*\\bin\\(win32|darwin|linux)\\php\.exe" } |
                       Sort-Object { $_.DirectoryName } -Descending
            if ($PhpPaths) {
                Write-Host "[DEBUG] Found Local PHP: $($PhpPaths[0].FullName)" -ForegroundColor Gray
                return $PhpPaths[0].FullName
            }
        }
    }

    # Try legacy Local by Flywheel path
    $LocalRuntime = "$env:USERPROFILE\AppData\Local\Local\lightning-services"
    if (Test-Path $LocalRuntime) {
        Write-Host "[DEBUG] Searching legacy Local directory: $LocalRuntime" -ForegroundColor Gray
        $PhpPaths = Get-ChildItem -Path $LocalRuntime -Filter "php.exe" -Recurse -ErrorAction SilentlyContinue |
                   Where-Object { $_.FullName -like "*\bin\win32\php.exe" }
        if ($PhpPaths) {
            Write-Host "[DEBUG] Found legacy Local PHP: $($PhpPaths[0].FullName)" -ForegroundColor Gray
            return $PhpPaths[0].FullName
        }
    }

    # Try common installation paths
    $CommonPaths = @(
        "C:\php\php.exe",
        "C:\xampp\php\php.exe",
        "C:\wamp64\bin\php\php.exe"
    )

    foreach ($Path in $CommonPaths) {
        if (Test-Path $Path) {
            Write-Host "[DEBUG] Found via common path: $Path" -ForegroundColor Gray
            return $Path
        }
    }

    # Try WAMP and Laragon with wildcard
    if (Test-Path "C:\wamp\bin\php") {
        $WampPaths = Get-ChildItem -Path "C:\wamp\bin\php\php*\php.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($WampPaths) {
            Write-Host "[DEBUG] Found via WAMP: $($WampPaths.FullName)" -ForegroundColor Gray
            return $WampPaths.FullName
        }
    }

    if (Test-Path "C:\laragon\bin\php") {
        $LaragonPaths = Get-ChildItem -Path "C:\laragon\bin\php\php*\php.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($LaragonPaths) {
            Write-Host "[DEBUG] Found via Laragon: $($LaragonPaths.FullName)" -ForegroundColor Gray
            return $LaragonPaths.FullName
        }
    }

    # Try PATH
    $WherePhp = Get-Command php -ErrorAction SilentlyContinue
    if ($WherePhp) {
        Write-Host "[DEBUG] Found via system PATH: $($WherePhp.Source)" -ForegroundColor Gray
        return $WherePhp.Source
    }

    return ""
}

# Check single file
function Test-PhpFile {
    param([string]$FilePath)

    $script:TotalFiles++

    # Skip vendor and cache directories
    if ($FilePath -match "(\\vendor\\|\\node_modules\\|\\cache\\|\\.git\\)") {
        return
    }

    Write-Host "Checking: $FilePath" -ForegroundColor Blue

    # Run PHP lint
    $Result = & $PhpBin -l $FilePath 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK]" -ForegroundColor Green
        $script:SuccessFiles++
    } else {
        Write-Host "  [SYNTAX ERROR]" -ForegroundColor Red
        Write-Host $Result
        $script:ErrorFiles++
    }
}

# Check directory recursively
function Test-PhpDirectory {
    param([string]$DirectoryPath)

    Write-Host "Checking directory: $DirectoryPath" -ForegroundColor Yellow

    $PhpFiles = Get-ChildItem -Path $DirectoryPath -Filter "*.php" -Recurse -ErrorAction SilentlyContinue
    foreach ($File in $PhpFiles) {
        Test-PhpFile $File.FullName
    }
}

# Main execution
$PhpBin = Find-PhpExecutable
if (-not $PhpBin) {
    Write-Host "ERROR: PHP executable not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please specify PHP path using one of these methods:"
    Write-Host "  1. Set environment variable: `$env:LOCAL_PHP_BIN='C:\path\to\php.exe'"
    Write-Host "  2. Add PHP to system PATH"
    exit 1
}

Write-Host "PHP Lint Checker - WordPress Theme Development" -ForegroundColor Cyan
Write-Host "PHP executable: $PhpBin" -ForegroundColor Blue
Write-Host ""

# Process targets
foreach ($Target in $Targets) {
    if (Test-Path $Target -PathType Container) {
        Test-PhpDirectory $Target
    } elseif (Test-Path $Target -PathType Leaf) {
        Test-PhpFile $Target
    } else {
        # Handle wildcards
        $MatchedFiles = Get-ChildItem -Path $Target -ErrorAction SilentlyContinue
        if ($MatchedFiles) {
            foreach ($File in $MatchedFiles) {
                if ($File.Extension -eq ".php") {
                    Test-PhpFile $File.FullName
                }
            }
        } else {
            Write-Host "ERROR: File or directory not found: $Target" -ForegroundColor Red
            $ErrorFiles++
        }
    }
}

# Show results
Write-Host ""
Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "Total files: $TotalFiles"
Write-Host "Success: $SuccessFiles" -ForegroundColor Green
Write-Host "Errors: $ErrorFiles" -ForegroundColor Red

if ($ErrorFiles -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Syntax errors found. Please fix the errors above." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "SUCCESS: All files passed syntax check." -ForegroundColor Green
    exit 0
}
