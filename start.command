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
  echo "请打开同目录的 00-第一次使用请先看.html，查看安装步骤。"
  if [ -t 0 ]; then printf "按回车关闭此窗口…"; read -r reply; fi
  exit 1
fi
node launcher.cjs "$@"
result=$?
if [ "$result" -ne 0 ] && [ -t 0 ]; then
  echo "启动未完成。请打开同目录的 00-第一次使用请先看.html，按报错检查。"
  printf "按回车关闭此窗口…"
  read -r reply
fi
exit "$result"
