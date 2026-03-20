// bible.js
module.exports = {
  config: {
    name: "bible",
    aliases: [],
    version: "1.0.0",
    role: 0,
    cooldown: 3,
    hasPrefix: true,
    credits: "Autobot Project",
    description: "Fetch a random Bible verse",
    usage: "{pn}"
  },

  run: async function ({ api, event }) {
    const { threadID, messageID } = event;

    try {
      await api.sendMessage("📖 Fetching a Bible verse...", threadID, messageID);

      const response = await axios.get("https://beta.ourmanna.com/api/v1/get/?format=text");
      const verse = response.data.trim();

      if (!verse) {
        return api.sendMessage("🥺 Sorry, I couldn't fetch a Bible verse right now.", threadID, messageID);
      }

      return api.sendMessage(
        `📜 Bible Verse\n\n"${verse}"`,
        threadID,
        messageID
      );

    } catch (error) {
      console.error("Bible command error:", error.message);
      
      return api.sendMessage(
        `❌ Sorry, something went wrong.\n${error.message}`,
        threadID,
        messageID
      );
    }
  }
};