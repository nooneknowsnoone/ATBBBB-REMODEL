// remini.js
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const API_ENDPOINT = "https://api-library-kohi.onrender.com/api/upscale";

const config = {
  name: "remini",
  aliases: ["upscale", "hd", "enhance"],
  version: "1.0.0",
  role: 0,
  cooldown: 10,
  credits: "Autobot Project",
  description: "Enhance and upscale an image using AI.",
  category: "image",
  hasPrefix: true,
  usage: "{pn} (reply to an image)",
  example: "{pn} (reply to an image you want to enhance)"
};

async function run({ api, event, args, prefix }) {
  const { messageReply, threadID, messageID } = event;

  if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
    return api.sendMessage(`❌ Please reply to an image to enhance.\n\n💡 **Usage:** ${prefix}${config.name} (reply to an image)`, threadID, messageID);
  }

  const attachment = messageReply.attachments[0];
  if (attachment.type !== "photo") {
    return api.sendMessage("❌ The replied message must be a photo.", threadID, messageID);
  }

  const imageUrl = encodeURIComponent(attachment.url);
  const fullApiUrl = `${API_ENDPOINT}?url=${imageUrl}`;

  let tempFilePath;

  try {
    // Show processing reaction
    api.setMessageReaction("⏳", messageID, () => {}, true);
    await api.sendMessage("⏳ Enhancing image, please wait...", threadID, messageID);

    // First request to get the URL of the enhanced image
    const response = await axios.get(fullApiUrl, { timeout: 30000 });

    if (!response.data.status || !response.data.data || !response.data.data.url) {
      throw new Error("Invalid API response structure");
    }

    const enhancedImageUrl = response.data.data.url;

    // Download the enhanced image
    const imageResponse = await axios.get(enhancedImageUrl, {
      responseType: 'stream',
      timeout: 30000
    });

    if (imageResponse.status !== 200) {
      throw new Error(`Failed to download enhanced image. Status code: ${imageResponse.status}`);
    }

    // Create cache directory if it doesn't exist
    const cacheDir = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheDir)) {
      await fs.mkdirp(cacheDir);
    }

    tempFilePath = path.join(cacheDir, `remini_enhanced_${Date.now()}.jpg`);

    // Save the image stream to file
    const writer = fs.createWriteStream(tempFilePath);
    imageResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", (err) => {
        writer.close();
        reject(err);
      });
    });

    api.setMessageReaction("✅", messageID, () => {}, true);
    await api.sendMessage({
      body: "✨ **Image Enhanced Successfully!**\n━━━━━━━━━━━━━━━━━━\n✅ Your image has been upscaled and enhanced using AI.\n💡 **Powered by:** Autobot Project",
      attachment: fs.createReadStream(tempFilePath)
    }, threadID, messageID);

  } catch (error) {
    api.setMessageReaction("❌", messageID, () => {}, true);

    let errorMessage = "❌ An error occurred during image enhancement.";

    if (error.response) {
      if (error.response.status === 404) {
        errorMessage = "❌ API endpoint not found (404). The service might be temporarily unavailable.";
      } else if (error.response.status === 400) {
        errorMessage = "❌ Invalid image URL or bad request. Please try a different image.";
      } else {
        errorMessage = `❌ HTTP Error: ${error.response.status} - ${error.response.statusText}`;
      }
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorMessage = "❌ Request timed out. The service might be busy. Please try again in a few moments.";
    } else if (error.message) {
      errorMessage = `❌ ${error.message}`;
    } else {
      errorMessage = "❌ Unknown error occurred. Please try again later.";
    }

    console.error("[remini] Error:", error.message || error);
    api.sendMessage(errorMessage, threadID, messageID);

  } finally {
    // Clean up temporary file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.unlink(tempFilePath);
      } catch (err) {
        console.error("[remini] Error deleting temporary file:", err);
      }
    }
    
    // Remove reaction after delay
    setTimeout(() => {
      api.setMessageReaction("", messageID, () => {}, true);
    }, 2000);
  }
}

module.exports = {
  config,
  run
};