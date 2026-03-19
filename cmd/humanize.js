// cmd/humanize.js

const axios = require("axios");

const config = {
  name: "humanize",
  aliases: ["human", "makehuman", "convo"],
  version: "1.0.1",
  role: 1,                    // 0 = everyone (changed from hasPermssion:1)
  cooldown: 5,
  credits: "VincentSensei, RY",
  description: "Make text sound more natural, human-like and conversational",
  category: "utility",
  hasPrefix: true,
  usage: "{pn} <text>   or   reply to a message",
  example: "{pn} This is very formal text from AI"
};

async function run({ api, event, args, prefix }) {
  const { threadID, messageID, messageReply } = event;

  // ─── Get input text ───────────────────────────────────────────────
  let inputText = "";

  if (messageReply?.body) {
    inputText = messageReply.body.trim();
  } else if (args.length > 0) {
    inputText = args.join(" ").trim();
  }

  if (!inputText) {
    return api.sendMessage(
      `ℹ️  Please provide some text to humanize.\n\n` +
      `Usage:\n` +
      `• \( {prefix} \){config.name} This is a very robotic sentence\n` +
      `• Reply to any message + \( {prefix} \){config.name}`,
      threadID,
      messageID
    );
  }

  // ─── Show processing state ────────────────────────────────────────
  api.setMessageReaction("⏳", messageID, () => {}, true);

  try {
    const { data } = await axios.get(
      `https://hutchingd-ccprojectsjonell.hf.space/api/aihuman?text=${encodeURIComponent(inputText)}`,
      { timeout: 15000 }
    );

    if (!data?.message) {
      throw new Error("No valid response from API");
    }

    const humanized = data.message.trim();

    const responseText = 
      `✨ **Humanized Version**\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${humanized}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Original (shortened):\n` +
      `└─ "\( {inputText.slice(0, 80)} \){inputText.length > 80 ? "..." : ""}"`;

    await api.sendMessage(responseText, threadID, messageID);

  } catch (error) {
    console.error("[humanize]", error.message);

    let errMsg = "❌ Sorry, something went wrong while humanizing the text.";

    if (error.code === "ECONNABORTED") {
      errMsg = "❌ The humanize service took too long to respond (timeout).";
    } else if (error.response) {
      errMsg = `❌ API error: ${error.response.status} - ${error.message}`;
    }

    api.sendMessage(errMsg, threadID, messageID);
  } finally {
    // Optional: remove reaction after done
    api.setMessageReaction("", messageID, () => {}, true);
  }
}

module.exports = {
  config,
  run
};