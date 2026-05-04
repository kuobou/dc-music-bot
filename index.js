require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  enterState
} = require("@discordjs/voice");
const { spawn, exec } = require("child_process");
const prism = require("prism-media");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

const queues = new Map();

const commands = [
  new SlashCommandBuilder().setName('play').setDescription('點歌播放 (合輯上限 20 首)').addStringOption(o => o.setName('query').setDescription('歌名或網址').setRequired(true)),
  new SlashCommandBuilder().setName('loop').setDescription('循環播放控制 (可輸入新歌或切換模式)')
    .addStringOption(o => o.setName('query').setDescription('輸入網址或歌名以加入並循環 (留空則切換模式)').setRequired(false)),
  new SlashCommandBuilder().setName('skip').setDescription('跳過目前歌曲'),
  new SlashCommandBuilder().setName('stop').setDescription('停止並離開'),
  new SlashCommandBuilder().setName('q').setDescription('查看隊列'),
  new SlashCommandBuilder().setName('check').setDescription('檢查系統版本與更新狀態'),
  new SlashCommandBuilder().setName('help').setDescription('指令說明'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`✅ 機器人已上線：${client.user.tag}`);
  } catch (error) { console.error('❌ 註冊失敗:', error); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guildId } = interaction;

  // --- /check 指令 ---
  if (commandName === "check") {
    await interaction.deferReply();
    exec("yt-dlp --version", (err, stdout) => {
      const currentV = err ? "未知" : stdout.trim();
      exec("curl -s https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest | grep 'tag_name'", (err2, stdout2) => {
        let latestV = "無法取得";
        if (!err2 && stdout2) {
          const match = stdout2.match(/\d{4}\.\d{2}\.\d{2}/);
          if (match) latestV = match[0];
        }
        let statusMsg = `🛠️ **版本檢查報告**\n**當前版本：** \`${currentV}\`\n**最新版本：** \`${latestV}\`\n`;
        if (currentV !== latestV && latestV !== "無法取得") {
          statusMsg += `\n⚠️ **偵測到新版本！請通知管理員。**\n💡 指令：\`yt-dlp -U\``;
        } else { statusMsg += `\n✅ 系統已是最新版本。`; }
        interaction.editReply({ content: statusMsg });
      });
    });
    return;
  }

  // --- /play & /loop 指令 ---
  if (commandName === "play" || commandName === "loop") {
    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member?.voice?.channel;

    if (commandName === "loop" && !query) {
      const q = queues.get(guildId);
      if (!q) return interaction.reply("❌ 目前沒在播歌");
      q.isLoop = !q.isLoop;
      return interaction.reply(q.isLoop ? "🔁 已開啟「全隊列」循環模式" : "➡️ 已關閉循環模式");
    }

    if (!voiceChannel) return interaction.reply({ content: "❌ 請先加入語音頻道", ephemeral: true });
    await interaction.deferReply();

    const isUrl = query.startsWith('http');
    const searchTarget = isUrl ? query : `ytsearch1:${query}`;
    
    // 改用 --playlist-end 20 限制只抓取前 20 首
    const ytdl = spawn("yt-dlp", [
      "--get-title", "--get-id", 
      "--flat-playlist", 
      "--playlist-end", "20",
      "--quiet", "--no-warnings", 
      searchTarget
    ]);
    
    let output = "";
    ytdl.stdout.on("data", (d) => output += d.toString());
    ytdl.on("close", async (code) => {
      const lines = output.trim().split("\n");
      if (code !== 0 || lines.length < 2) return interaction.editReply("❌ 搜尋失敗。");
      
      const foundSongs = [];
      for (let i = 0; i < lines.length; i += 2) {
        if (lines[i] && lines[i+1]) {
          foundSongs.push({ title: lines[i], url: `https://www.youtube.com/watch?v=${lines[i+1]}` });
        }
      }

      if (foundSongs.length === 0) return interaction.editReply("❌ 找不到歌曲。");

      let serverQueue = queues.get(guildId);

      if (!serverQueue) {
        const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: guildId, adapterCreator: interaction.guild.voiceAdapterCreator });
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
        const queueConstruct = { connection, player, songs: foundSongs, isLoop: (commandName === "loop"), timeoutId: null };
        queues.set(guildId, queueConstruct);
        connection.subscribe(player);
        
        setupPlayerEvents(guildId);
        playStream(guildId, foundSongs[0]);
        
        const msg = foundSongs.length > 1 
          ? `🎶 **匯入合輯：** 已加入前 **${foundSongs.length}** 首歌並開始播放`
          : `🎶 **現在播放：** ${foundSongs[0].title}`;
        interaction.editReply(msg);
      } else {
        if (serverQueue.timeoutId) { clearTimeout(serverQueue.timeoutId); serverQueue.timeoutId = null; }
        serverQueue.songs.push(...foundSongs);
        if (commandName === "loop") serverQueue.isLoop = true;
        if (serverQueue.player.state.status === AudioPlayerStatus.Idle) playStream(guildId, serverQueue.songs[0]);
        
        const msg = foundSongs.length > 1 
          ? `✅ **已加入合輯：** 匯入前 **${foundSongs.length}** 首歌至隊列`
          : `✅ **已加入隊列：** ${foundSongs[0].title}`;
        interaction.editReply(msg);
      }
    });
  }

  // --- skip, stop, q, help ---
  if (commandName === "skip") {
    const q = queues.get(guildId);
    if (q) { 
      interaction.reply(`⏭️ 跳過當前歌曲`);
      q.player.stop(); 
    } else interaction.reply("沒在播歌");
  }

  if (commandName === "stop") {
    const q = queues.get(guildId);
    if (q) { if (q.timeoutId) clearTimeout(q.timeoutId); q.connection.destroy(); queues.delete(guildId); interaction.reply("🛑 已停止播放"); }
    else interaction.reply("不在頻道中");
  }

  if (commandName === "q") {
    const q = queues.get(guildId);
    if (!q || q.songs.length === 0) return interaction.reply("📋 隊列是空的");
    
    // 限制 /q 顯示前 20 首
    const list = q.songs.slice(0, 20).map((s, i) => `${i === 0 ? "▶️" : i + "."} ${s.title}`).join("\n");
    const more = q.songs.length > 20 ? `\n...還有 ${q.songs.length - 20} 首歌` : "";
    
    interaction.reply(`📋 **目前隊列 (上限顯示 20 首)：**\n${list}${more}${q.isLoop ? "\n\n🔁 全隊列循環中" : ""}`);
  }

  if (commandName === "help") {
    interaction.reply("💡 **指令說明**：\n`/play`：點歌/合輯(限20首)\n`/skip`: 跳過\n`/loop`: 循環\n`/stop`: 停止\n`/q`: 看隊列\n`/check`: 版本");
  }
});

function setupPlayerEvents(guildId) {
  const q = queues.get(guildId);
  if (!q) return;
  q.player.on(AudioPlayerStatus.Idle, () => {
    const sq = queues.get(guildId);
    if (!sq) return;
    const finished = sq.songs.shift(); 
    if (sq.isLoop && finished) sq.songs.push(finished); 
    if (sq.songs.length > 0) {
      playStream(guildId, sq.songs[0]);
    } else {
      sq.timeoutId = setTimeout(() => {
        const checkQ = queues.get(guildId);
        if (checkQ && checkQ.songs.length === 0) { checkQ.connection.destroy(); queues.delete(guildId); }
      }, 5 * 60 * 1000);
    }
  });
}

function playStream(guildId, song) {
  const q = queues.get(guildId);
  if (!q || !song) return;
  const ytdlp = spawn("yt-dlp", ["-f", "bestaudio/best", "--no-playlist", "--buffer-size", "4M", "-o", "-", song.url]);
  const ffmpeg = new prism.FFmpeg({ args: ["-analyzeduration", "0", "-loglevel", "0", "-f", "s16le", "-ar", "48000", "-ac", "2"] });
  q.player.play(createAudioResource(ytdlp.stdout.pipe(ffmpeg), { inputType: StreamType.Raw }));
}

client.login(process.env.DISCORD_TOKEN);
