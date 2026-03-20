// bible.js
const axios = require("axios");

const config = {
  name: "bible",
  aliases: ["verse", "bibleverse"],
  version: "1.0.0",
  role: 0,
  cooldown: 5,
  credits: "Autobot Project",
  description: "Get a random Bible verse",
  category: "random",
  hasPrefix: true,
  usage: "{pn}",
  example: "{pn}"
};

async function run({ api, event, args, prefix }) {
  const { threadID, messageID } = event;
  
  // Show processing reaction
  api.setMessageReaction("📖", messageID, () => {}, true);
  
  try {
    const response = await axios.get("https://bible-api.com/?random=verse&translation=web", { timeout: 10000 });
    const { text: verse, reference } = response.data;
    
    const message = `📖 **${reference}**\n━━━━━━━━━━━━━━━━━━\n${verse.trim()}\n━━━━━━━━━━━━━━━━━━\n\n— World English Bible\n💡 **Powered by:** Autobot Project`;
    
    await api.sendMessage(message, threadID, messageID);
  } catch (error) {
    console.error("[bible]", error.message);
    
    let errMsg = "❌ An error occurred while fetching a Bible verse. Please try again later.";
    
    if (error.code === "ECONNABORTED") {
      errMsg = "❌ The Bible API took too long to respond. Please try again.";
    } else if (error.response) {
      errMsg = `❌ API error: ${error.response.status} - ${error.message}`;
    }
    
    api.sendMessage(errMsg, threadID, messageID);
  } finally {
    // Remove reaction after done
    setTimeout(() => {
      api.setMessageReaction("", messageID, () => {}, true);
    }, 1000);
  }
}

module.exports = {
  config,
  run
};