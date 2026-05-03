#!/bin/bash
set -e

echo "=============================="
echo "  DC Music Bot 一鍵部署腳本"
echo "=============================="

# 1. 檢查 Node.js
if ! command -v node &>/dev/null; then
  echo "❌ 找不到 Node.js，請先安裝：https://nodejs.org/"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# 2. 安裝 yt-dlp
if ! command -v yt-dlp &>/dev/null; then
  echo "📦 安裝 yt-dlp..."
  if command -v pip3 &>/dev/null; then
    pip3 install yt-dlp
  else
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    chmod +x /usr/local/bin/yt-dlp
  fi
fi
echo "✅ yt-dlp $(yt-dlp --version)"

# 3. 安裝 ffmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "📦 安裝 ffmpeg..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y ffmpeg
  elif command -v yum &>/dev/null; then
    sudo yum install -y ffmpeg
  elif command -v brew &>/dev/null; then
    brew install ffmpeg
  else
    echo "⚠️  請手動安裝 ffmpeg：https://ffmpeg.org/download.html"
  fi
fi
echo "✅ ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"

# 4. 安裝 npm 套件
echo "📦 安裝 npm 套件..."
npm install
echo "✅ npm 套件安裝完成"

# 5. 設定 .env
if [ ! -f ".env" ]; then
  echo ""
  echo "=============================="
  echo "  設定 Discord Bot 憑證"
  echo "=============================="
  echo "請前往 https://discord.com/developers/applications 取得以下資訊："
  echo ""
  read -p "請輸入 DISCORD_TOKEN：" DISCORD_TOKEN
  while [ -z "$DISCORD_TOKEN" ]; do
    echo "❌ Token 不能為空"
    read -p "請輸入 DISCORD_TOKEN：" DISCORD_TOKEN
  done
  read -p "請輸入 CLIENT_ID（Application ID）：" CLIENT_ID
  while [ -z "$CLIENT_ID" ]; do
    echo "❌ Client ID 不能為空"
    read -p "請輸入 CLIENT_ID：" CLIENT_ID
  done
  cat > .env <<EOF
DISCORD_TOKEN=${DISCORD_TOKEN}
CLIENT_ID=${CLIENT_ID}
EOF
  echo "✅ .env 已建立（Token 僅存在此伺服器，不會上傳到 GitHub）"
else
  echo "✅ .env 已存在，跳過設定"
fi

# 6. 啟動機器人
echo ""
echo "=============================="
echo "  選擇啟動方式"
echo "=============================="
echo "1) 前景執行 (關掉視窗就停止)"
echo "2) 用 pm2 背景執行 (推薦，重開機自動啟動)"
read -p "請選擇 [1/2]: " choice

if [ "$choice" = "2" ]; then
  if ! command -v pm2 &>/dev/null; then
    echo "📦 安裝 pm2..."
    npm install -g pm2
  fi
  pm2 start index.js --name dc-music-bot
  pm2 save
  pm2 startup | tail -1 | bash 2>/dev/null || true
  echo "✅ 機器人已在背景啟動！"
  echo "   查看日誌：pm2 logs dc-music-bot"
  echo "   停止機器人：pm2 stop dc-music-bot"
else
  echo "🤖 啟動機器人..."
  node index.js
fi