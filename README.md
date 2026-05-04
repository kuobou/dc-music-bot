# 🎵 DC Music Bot

一個基於 Discord.js 的音樂機器人，支援 YouTube 搜尋、播放清單、循環播放等功能。

---

## 指令說明

| 指令 | 說明 |
|------|------|
| `/play <歌名或網址>` | 搜尋並播放歌曲，支援 YouTube 播放清單（上限 20 首） |
| `/skip` | 跳過目前播放的歌曲 |
| `/loop [歌名或網址]` | 切換循環模式，或加入歌曲並開啟循環 |
| `/stop` | 停止播放並讓機器人離開語音頻道 |
| `/q` | 查看目前播放隊列（最多顯示 20 首） |
| `/check` | 檢查 yt-dlp 版本與更新狀態 |
| `/help` | 顯示指令說明 |

---

## 一鍵安裝（Linux）

在你的 Linux 伺服器上執行以下指令：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kuobou/dc-music-bot/main/install.sh)
```

腳本會自動完成：
- 安裝 Node.js（若未安裝）
- 安裝 `yt-dlp`、`ffmpeg`
- 安裝 Node.js 套件
- 引導你輸入 Discord Bot Token
- 使用 pm2 在背景啟動機器人（重開機自動重啟）

---

## 手動安裝

### 系統需求

- Node.js v18 以上
- `yt-dlp`
- `ffmpeg`

### 步驟

```bash
# 1. Clone 專案
git clone https://github.com/kuobou/dc-music-bot.git
cd dc-music-bot

# 2. 安裝套件
npm install

# 3. 建立 .env 並填入 Token
cp .env.example .env
nano .env

# 4. 啟動機器人
node index.js
```

### .env 設定

```env
DISCORD_TOKEN=你的_Discord_Bot_Token
CLIENT_ID=你的_Discord_Application_ID
```

前往 [Discord Developer Portal](https://discord.com/developers/applications) 取得上述資訊。

> **Bot 需要的權限：** `Connect`、`Speak`（語音頻道）

---

## pm2 常用指令

```bash
pm2 logs dc-music-bot     # 查看即時日誌
pm2 restart dc-music-bot  # 重新啟動
pm2 stop dc-music-bot     # 停止機器人
pm2 status                # 查看所有程序狀態
pm2 startup               # 設定開機自動啟動（輸出的指令需手動執行一次）
pm2 save                  # 儲存目前程序列表供開機還原
```
