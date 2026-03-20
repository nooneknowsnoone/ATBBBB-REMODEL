// removebg.js
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const API_ENDPOINT = "https://api-library-kohi.onrender.com/api/removebg";

const config = {
  name: "removebg",
  aliases: ["rbg", "nobg", "erasebg"],
  version: "1.0.0",
  role: 0,
  cooldown: 10,
  credits: "Autobot Project",
  description: "Remove background from an image using AI.",
  category: "image",
  hasPrefix: true,
  usage: "{pn} (reply to an image)",
  example: "{pn} (reply to an image you want to remove background from)"
};

async function run({ api, event, args, prefix }) {
  const { messageReply, threadID, messageID } = event;

  if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
    return api.sendMessage(`❌ Please reply to an image to remove its background.\n\n💡 **Usage:** ${prefix}${config.name} (reply to an image)`, threadID, messageID);
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
    await api.sendMessage("⏳ Removing background, please wait...", threadID, messageID);

    // First request to get the URL of the image with background removed
    const response = await axios.get(fullApiUrl, { timeout: 30000 });

    if (!response.data.status || !response.data.data || !response.data.data.url) {
      throw new Error("Invalid API response structure");
    }

    const processedImageUrl = response.data.data.url;

    // Download the processed image
    const imageResponse = await axios.get(processedImageUrl, {
      responseType: 'stream',
      timeout: 30000
    });

    if (imageResponse.status !== 200) {
      throw new Error(`Failed to download processed image. Status code: ${imageResponse.status}`);
    }

    // Create cache directory if it doesn't exist
    const cacheDir = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheDir)) {
      await fs.mkdirp(cacheDir);
    }

    tempFilePath = path.join(cacheDir, `removebg_${Date.now()}.png`);

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
      body: "✨ **Background Removed Successfully!**\n━━━━━━━━━━━━━━━━━━\n✅ Your image now has a transparent background.\n💡 **Powered by:** Autobot Project",
      attachment: fs.createReadStream(tempFilePath)
    }, threadID, messageID);

  } catch (error) {
    api.setMessageReaction("❌", messageID, () => {}, true);

    let errorMessage = "❌ An error occurred while removing background.";

    if (error.response) {
      if (error.response.status === 404) {
        errorMessage = "❌ API endpoint not found (404). The service might be temporarily unavailable.";
      } else if (error.response.status === 400) {
        errorMessage = "❌ Invalid image URL or bad request. Please try a different image.";
      } else if (error.response.status === 415) {
        errorMessage = "❌ Unsupported image format. Please use JPG, PNG, or WebP format.";
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

    console.error("[removebg] Error:", error.message || error);
    api.sendMessage(errorMessage, threadID, messageID);

  } finally {
    // Clean up temporary file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.unlink(tempFilePath);
      } catch (err) {
        console.error("[removebg] Error deleting temporary file:", err);
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