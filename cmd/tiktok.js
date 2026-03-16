const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const TIKTOK_API = 'https://ccprojectapis.ddns.net/api/tiktok/searchvideo';
const CACHE_DIR = path.join(__dirname, 'cache');

module.exports.config = {
  name: "tiktok",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Kim Joseph DG Bien - REMAKE BY JONELL",
  description: "Search and download TikTok video",
  commandCategory: "media",
  usages: "<search>",
  cooldowns: 5,
  role: 0
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID } = event;
  const searchQuery = args.join(" ");

  if (!searchQuery) {
    api.sendMessage("Usage: tiktok <search text>", threadID, messageID);
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

    const message = `TikTok Result:

Posted by: ${videoData.author.nickname}
Username: @${videoData.author.unique_id}

Title: ${videoData.title}`;

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
};
