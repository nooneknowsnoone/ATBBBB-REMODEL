const axios = require("axios");

module.exports.config = {
  name: "humanize",
  version: "1.0",
  hasPermssion: 2,
  credits: "VincentSensei, RY",
  description: "Makes text sound more human-like and conversational",
  commandCategory: "utility",
  usages: "humanize [text] - or reply to a message",
  cooldowns: 5,
  role: 0
};

module.exports.run = async function({ api, event, args }) {
  const { messageID, messageReply, threadID } = event;

  // Get text from either reply or direct input
  let text = "";

  if (messageReply) {
    text = messageReply.body;
  } else {
    text = args.join(" ").trim();
  }

  if (!text) {
    return api.sendMessage(
      "❌ Please provide text to humanize or reply to a message.\n\n" +
      "Example: humanize This is a formal statement that needs to be more conversational.",
      threadID,
      messageID
    );
  }

  try {
    // Send typing indicator
    api.sendMessage("⏳ Humanizing your text...", threadID, messageID);

    // Call the humanize API
    const response = await axios.get(
      `https://hutchingd-ccprojectsjonell.hf.space/api/aihuman?text=${encodeURIComponent(text)}`
    );

    if (response.data && response.data.message) {
      const humanizedText = response.data.message;

      // Format the response
      const formattedResponse =
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔄 **HUMANIZED TEXT**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${humanizedText}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 Original: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`;

      api.sendMessage(formattedResponse, threadID, messageID);
    } else {
      api.sendMessage("❌ Failed to humanize text. Please try again.", threadID, messageID);
    }

  } catch (error) {
    console.error("Error in humanize command:", error);
    api.sendMessage(
      "❌ An error occurred while humanizing your text. Please try again later.",
      threadID,
      messageID
    );
  }
};
