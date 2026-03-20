// copilot.js
const axios = require("axios");
const WebSocket = require('ws');

const config = {
  name: "copilot",
  aliases: ["mscopilot", "copilotai"],
  version: "1.0.0",
  role: 0,
  cooldown: 5,
  credits: "Autobot Project",
  description: "Chat with Microsoft Copilot AI using different models",
  category: "ai",
  hasPrefix: true,
  usage: "{pn} [message] -or- {pn} [message] -model [default/think-deeper/gpt-5]",
  example: "{pn} What is the weather today? -model gpt-5"
};

async function run({ api, event, args, prefix }) {
  const { messageID, messageReply, threadID, senderID } = event;

  // Parse arguments for model selection
  let model = 'gpt-5'; // Default to gpt-5
  let userInput = args.join(" ").trim();

  // Check if model is specified
  const modelIndex = args.indexOf('-model');
  if (modelIndex !== -1 && args[modelIndex + 1]) {
    model = args[modelIndex + 1];
    // Remove model from user input
    userInput = args.filter((_, index) => index !== modelIndex && index !== modelIndex + 1).join(" ").trim();
  }

  // Handle message replies
  if (messageReply) {
    const repliedMessage = messageReply.body;
    userInput = `${repliedMessage} ${userInput}`;
  }

  if (!userInput) {
    return api.sendMessage(
      `📝 **Usage:** ${prefix}${config.name} [your question]\n\n` +
      `📌 **Example:** ${prefix}${config.name} What is the weather today?\n\n` +
      `🤖 **Model options:**\n` +
      `  • default - Standard Copilot\n` +
      `  • think-deeper - Deep reasoning mode\n` +
      `  • gpt-5 - Advanced GPT-5 model (default)\n\n` +
      `💡 **Change model:** ${prefix}${config.name} [question] -model [model]`,
      threadID,
      messageID
    );
  }

  // Show processing reaction
  api.setMessageReaction("⏳", messageID, () => {}, true);

  try {
    await fetchCopilotResponse(api, event, userInput, senderID, model, prefix);
  } catch (error) {
    console.error(`Error fetching Copilot response for "${userInput}":`, error);
    api.sendMessage(`❌ Sorry, there was an error getting the Copilot response. Please try again later!`, threadID, messageID);
  } finally {
    api.setMessageReaction("", messageID, () => {}, true);
  }
}

async function fetchCopilotResponse(api, event, userInput, senderID, model = 'gpt-5', prefix) {
  const { threadID, messageID } = event;

  try {
    // Send initial typing indicator
    api.sendMessage('⏳ Copilot is thinking...', threadID, messageID);

    // Initialize Copilot
    const headers = {
      origin: 'https://copilot.microsoft.com',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    };

    // Map models to Copilot modes
    const models = {
      default: 'chat',
      'think-deeper': 'reasoning',
      'gpt-5': 'smart'
    };

    // Validate model
    if (!models[model]) {
      return api.sendMessage(`❌ Invalid model. Available: ${Object.keys(models).join(', ')}\n\n💡 Example: ${prefix}${config.name} What is AI? -model gpt-5`, threadID, messageID);
    }

    // Create conversation
    const { data } = await axios.post('https://copilot.microsoft.com/c/api/conversations', null, { headers });
    const conversationId = data.id;

    // Create WebSocket connection
    const ws = new WebSocket(
      `wss://copilot.microsoft.com/c/api/chat?api-version=2&features=-,ncedge,edgepagecontext&setflight=-,ncedge,edgepagecontext&ncedge=1`,
      { headers }
    );

    let response = { text: '', citations: [] };

    // Setup WebSocket event handlers with Promise
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Request timeout'));
      }, 30000); // 30 second timeout

      ws.on('open', () => {
        // Send options
        ws.send(JSON.stringify({
          event: 'setOptions',
          supportedFeatures: ['partial-generated-images'],
          supportedCards: ['weather', 'local', 'image', 'sports', 'video', 'ads', 'safetyHelpline', 'quiz', 'finance', 'recipe'],
          ads: {
            supportedTypes: ['text', 'product', 'multimedia', 'tourActivity', 'propertyPromotion']
          }
        }));

        // Send the actual message
        ws.send(JSON.stringify({
          event: 'send',
          mode: models[model],
          conversationId,
          content: [{ type: 'text', text: userInput }],
          context: {}
        }));
      });

      ws.on('message', (chunk) => {
        try {
          const parsed = JSON.parse(chunk.toString());

          switch (parsed.event) {
            case 'appendText':
              response.text += parsed.text || '';
              break;

            case 'citation':
              response.citations.push({
                title: parsed.title,
                icon: parsed.iconUrl,
                url: parsed.url
              });
              break;

            case 'done':
              clearTimeout(timeout);
              ws.close();
              resolve();
              break;

            case 'error':
              clearTimeout(timeout);
              ws.close();
              reject(new Error(parsed.message));
              break;
          }
        } catch (err) {
          clearTimeout(timeout);
          ws.close();
          reject(err);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      });
    });

    // Format the response
    let formattedResponse = `🤖 Microsoft Copilot\n━━━━━━━━━━━━━━━━━━\n${response.text}\n━━━━━━━━━━━━━━━━━━`;

    api.sendMessage(formattedResponse, threadID, messageID);

  } catch (error) {
    console.error('Error fetching from Copilot:', error.message || error);
    
    let errMsg = `❌ Error: ${error.message || 'Sorry, there was an error connecting to Copilot!'}`;
    
    if (error.code === "ECONNABORTED") {
      errMsg = "❌ The Copilot service took too long to respond (timeout).";
    }
    
    errMsg += `\n\n💡 Tip: Try using a different model with: ${prefix}${config.name} [question] -model [default/think-deeper/gpt-5]`;
    api.sendMessage(errMsg, threadID, messageID);
  }
}

module.exports = {
  config,
  run
};