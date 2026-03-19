const axios = require('axios');

module.exports.config = {
  name: "animeme",
  version: "1.0.0",
  credits: "developer",
  description: "Get random anime memes from the Animemes subreddit.",
  hasPrefix: true,
  cooldown: 5,
  aliases: ["animejoke", "animem"],
};

module.exports.run = async function ({ api, event, args }) {
  try {
    api.sendMessage("🎌 Fetching a random anime meme...", event.threadID, async () => {
      try {
        const res = await axios.get('https://meme-api.com/gimme/animemes');
        const meme = res.data;

        if (!meme || meme.nsfw) {
          return api.sendMessage("❌ No safe anime meme available at the moment.", event.threadID, event.messageID);
        }

        const imageStream = await axios.get(meme.url, { responseType: 'stream' });

        api.sendMessage({
          body: `🖼️ "${meme.title}"`,
          attachment: imageStream.data
        }, event.threadID);
      } catch (err) {
        console.error("animeme error:", err);
        api.sendMessage("❌ Failed to retrieve anime meme.", event.threadID, event.messageID);
      }
    });
  } catch (e) {
    api.sendMessage(e.message, event.threadID, event.messageID);
  }
};