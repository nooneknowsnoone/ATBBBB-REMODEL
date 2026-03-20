// ai.js
module.exports = {
  config: {
    name: "ai",
    aliases: ["gpt", "chatgpt", "ask"],
    version: "1.0.0",
    role: 0,
    cooldown: 3,
    hasPrefix: true,
    credits: "Autobot Project",
    description: "Chat with AI powered by GPT-4",
    usage: "{pn} [your question]"
  },

  run: async function ({ api, event, args, prefix }) {
    const axios = require("axios");
    const { messageID, messageReply, threadID, senderID } = event;
    let userInput = args.join(" ").trim();

    if (messageReply) {
      const repliedMessage = messageReply.body;
      userInput = `${repliedMessage} ${userInput}`;
    }

    if (!userInput) {
      return api.sendMessage(`📝 Usage: ${prefix}ai [your question]\n\nExample: ${prefix}ai What is the capital of France?`, threadID, messageID);
    }

    try {
      await fetchAIResponse(api, event, userInput, senderID);
    } catch (error) {
      console.error(`Error fetching AI response for "${userInput}":`, error);
      api.sendMessage(`❌ Sorry, there was an error getting the AI response. Please try again later!`, threadID, messageID);
    }
  },
};

async function fetchAIResponse(api, event, userInput, senderID) {
  const axios = require("axios");
  const { threadID, messageID } = event;

  try {
    const apiUrl = `https://yin-api.vercel.app/ai/chatgptfree?prompt=${encodeURIComponent(userInput)}&model=chatgpt4`;
    const response = await axios.get(apiUrl);

    if (response.data && response.data.answer) {
      const generatedText = response.data.answer;
      const formattedResponse = `🤖 AI Response:\n━━━━━━━━━━━━━━━━━━\n${generatedText}\n━━━━━━━━━━━━━━━━━━`;

      api.sendMessage(formattedResponse, threadID, messageID);
    } else {
      api.sendMessage('❌ An error occurred while generating the response. Please try again later.', threadID, messageID);
    }
  } catch (error) {
    console.error('Error fetching from AI API:', error.message || error);
    api.sendMessage(`❌ Sorry, there was an error connecting to the AI service. Please try again later!`, threadID, messageID);
  }
}