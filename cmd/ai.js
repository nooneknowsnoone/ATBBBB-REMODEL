// ai.js
const axios = require("axios");

const config = {
  name: "ai",
  aliases: ["gpt", "chatgpt", "ask"],
  version: "1.0.0",
  role: 0,
  cooldown: 3,
  credits: "Autobot Project",
  description: "Chat with AI powered by GPT-4",
  category: "ai",
  hasPrefix: true,
  usage: "{pn} [your question]",
  example: "{pn} What is the capital of France?"
};

async function run({ api, event, args, prefix }) {
  const { messageID, messageReply, threadID, senderID } = event;
  let userInput = args.join(" ").trim();

  if (messageReply) {
    const repliedMessage = messageReply.body;
    userInput = `${repliedMessage} ${userInput}`;
  }

  if (!userInput) {
    return api.sendMessage(
      `📝 **Usage:** ${prefix}${config.name} [your question]\n\n` +
      `📌 **Example:** ${prefix}${config.name} What is the capital of France?\n\n` +
      `💬 **Reply to a message:** ${prefix}${config.name} (to ask about the replied message)`,
      threadID,
      messageID
    );
  }

  // Show processing reaction
  api.setMessageReaction("⏳", messageID, () => {}, true);

  try {
    await fetchAIResponse(api, event, userInput, senderID, prefix);
  } catch (error) {
    console.error(`Error fetching AI response for "${userInput}":`, error);
    api.sendMessage(`❌ Sorry, there was an error getting the AI response. Please try again later!`, threadID, messageID);
  } finally {
    api.setMessageReaction("", messageID, () => {}, true);
  }
}

async function fetchAIResponse(api, event, userInput, senderID, prefix) {
  const { threadID, messageID } = event;

  try {
    const apiUrl = `https://yin-api.vercel.app/ai/chatgptfree?prompt=${encodeURIComponent(userInput)}&model=chatgpt4`;
    const response = await axios.get(apiUrl, { timeout: 30000 });

    if (response.data && response.data.answer) {
      const generatedText = response.data.answer;
      const formattedResponse = `🤖 **AI Response**\n━━━━━━━━━━━━━━━━━━\n${generatedText}\n━━━━━━━━━━━━━━━━━━`;

      api.sendMessage(formattedResponse, threadID, messageID);
    } else {
      api.sendMessage('❌ An error occurred while generating the response. Please try again later.', threadID, messageID);
    }
  } catch (error) {
    console.error('Error fetching from AI API:', error.message || error);
    
    let errMsg = "❌ Sorry, there was an error connecting to the AI service.";
    
    if (error.code === "ECONNABORTED") {
      errMsg = "❌ The AI service took too long to respond (timeout).";
    } else if (error.response) {
      errMsg = `❌ API error: ${error.response.status} - ${error.message}`;
    }
    
    api.sendMessage(errMsg, threadID, messageID);
  }
}

module.exports = {
  config,
  run
};