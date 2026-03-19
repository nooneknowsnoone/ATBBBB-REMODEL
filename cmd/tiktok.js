const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const TIKTOK_API = 'https://ccprojectapis.ddns.net/api/tiktok/searchvideo';
const CACHE_DIR = path.join(__dirname, 'cache');

const config = {
  name: "tiktok",
  version: "1.0.0",
  role: 0,                      // 0 = everyone (changed from hasPermssion:0)
  cooldown: 5,                   // changed from cooldowns:5
  credits: "Kim Joseph DG Bien - REMAKE BY JONELL",
  description: "Search and download TikTok video",
  category: "media",             // changed from commandCategory: "media"
  hasPrefix: true,
  usage: "{pn} <search>",
  example: "{pn} funny cats"
};

async function run({ api, event, args, prefix }) {
  const { threadID, messageID } = event;
  const searchQuery = args.join(" ");

  if (!searchQuery) {
    api.sendMessage(`Usage: ${prefix}${config.name} <search text>`, threadID, messageID);
    return;
  }

  try {
    const loadingMsg = await api.sendMessage("Searching, please wait...", threadID, messageID);

    const response = await axios.get(`${TIKTOK_API}?keywords=${encodeURIComponent(searchQuery)}`);
    const videos = response.data.data.videos;

    if (!videos || videos.length === 0) {
      api.sendMessage("No videos found for the given search query.", threadID, messageID);
      return;
    }

    // Get first video result
    const videoData = videos[0];
    const videoUrl = videoData.play;

    const message = `TikTok Result:\n\n` +
      `Posted by: ${videoData.author.nickname}\n` +
      `Username: @${videoData.author.unique_id}\n\n` +
      `Title: ${videoData.title}`;

    await api.unsendMessage(loadingMsg.messageID);

    // Ensure cache directory exists
    await fs.ensureDir(CACHE_DIR);

    const filePath = path.join(CACHE_DIR, `tiktok_video_${Date.now()}.mp4`);
    const writer = fs.createWriteStream(filePath);

    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      timeout: 120000
    });

    videoResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    api.sendMessage(
      { body: message, attachment: fs.createReadStream(filePath) },
      threadID,
      (err) => {
        // Clean up file after sending
        fs.unlink(filePath).catch(console.error);

        if (err) {
          console.error("Send video error:", err);
          api.sendMessage("Failed to send video. The file may be too large.", threadID, messageID);
        }
      },
      messageID
    );

  } catch (error) {
    console.error("TikTok Error:", error.message);
    api.sendMessage("Error: " + error.message, threadID, messageID);
  }
}

module.exports = {
  config,
  run
};