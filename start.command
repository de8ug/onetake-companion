#!/bin/sh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/v*/bin/node; do
    if [ -x "$candidate" ]; then export PATH="$(dirname "$candidate"):$PATH"; fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22+：https://nodejs.org/"
  exit 1
fi
exec node launcher.cjs
