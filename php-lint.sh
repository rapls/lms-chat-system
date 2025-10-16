#!/bin/bash
set -euo pipefail

LOCAL_RUNTIME="$HOME/Library/Application Support/Local/lightning-services"
PHP_BIN="${LOCAL_PHP_BIN:-}"

if [ -z "$PHP_BIN" ] || [ ! -x "$PHP_BIN" ]; then
  if [ -d "$LOCAL_RUNTIME" ]; then
    while IFS= read -r candidate; do
      PHP_BIN="$candidate"
    done < <(find "$LOCAL_RUNTIME" -maxdepth 5 -type f -path '*bin/darwin/bin/php' 2>/dev/null | sort)
  fi
fi

if [ -z "${PHP_BIN:-}" ] || [ ! -x "$PHP_BIN" ]; then
  echo "PHP 実行ファイルが見つかりません。LOCAL_PHP_BIN 環境変数でパスを指定してください。" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "使い方: $0 <PHPファイル...>" >&2
  exit 1
fi

for target in "$@"; do
  if [ ! -f "$target" ]; then
    echo "ファイルが見つかりません: $target" >&2
    exit 1
  fi
  echo "Linting $target"
  "$PHP_BIN" -l "$target"
done
