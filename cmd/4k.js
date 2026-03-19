const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);
const API_ENDPOINT = "https://free-goat-api.onrender.com/4k";
const CACHE_DIR = path.join(__dirname, 'cache');

const config = {
  name: "4k",
  aliases: ["upscale", "hd", "enhance"],
  version: "1.0",
  role: 0,                      // 0 = everyone (changed from hasPermssion:0)
  cooldown: 15,                  // changed from cooldowns:15
  credits: "NeoKEX",
  description: "Upscales an image to higher resolution (4K) using AI",
  category: "image",             // changed from commandCategory: "image"
  hasPrefix: true,
  usage: "{pn} <image_url>   or   reply to an image",
  example: "{pn} https://example.com/image.jpg"
};

function extractImageUrl(args, event) {
  // Check if URL is in arguments
  let imageUrl = args.find(arg => arg.startsWith('http'));

  // Check if replying to an image
  if (!imageUrl && event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0) {
    const imageAttachment = event.messageReply.attachments.find(att => att.type === 'photo' || att.type === 'image');
    if (imageAttachment && imageAttachment.url) {
      imageUrl = imageAttachment.url;
    }
  }
  return imageUrl;
}

async function run({ api, event, args, prefix }) {
  const { threadID, messageID } = event;

  // Get image URL from args or reply
  const imageUrl = extractImageUrl(args, event);

  if (!imageUrl) {
    api.sendMessage("❌ Please provide an image URL or reply to an image to upscale.", threadID, messageID);
    return;
  }

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  let tempFilePath;

  try {
    // Send reacting message
    api.sendMessage("⏳ Upscaling image to 4K...", threadID, messageID);

    // Call the API
    const fullApiUrl = `${API_ENDPOINT}?url=${encodeURIComponent(imageUrl)}`;
    const apiResponse = await axios.get(fullApiUrl, { timeout: 45000 });
    const data = apiResponse.data;

    if (!data.image) {
      throw new Error("API returned success but missing final image URL.");
    }

    const upscaledImageUrl = data.image;

    // Download the upscaled image
    const imageDownloadResponse = await axios.get(upscaledImageUrl, {
      responseType: 'stream',
      timeout: 60000,
    });

    // Save to temporary file
    const fileHash = Date.now() + Math.random().toString(36).substring(2, 8);
    tempFilePath = path.join(CACHE_DIR, `upscale_4k_${fileHash}.jpg`);

    await pipeline(imageDownloadResponse.data, fs.createWriteStream(tempFilePath));

    // Send the upscaled image
    api.sendMessage(
      { 
        body: "🖼️ Image successfully upscaled to 4K!",
        attachment: fs.createReadStream(tempFilePath)
      },
      threadID,
      messageID
    );

  } catch (error) {
    let errorMessage = "❌ Failed to upscale image. An error occurred.";

    if (error.response) {
      if (error.response.status === 400) {
        errorMessage = "❌ Error: The provided URL might be invalid or the image is too small/large.";
      } else {
        errorMessage = `❌ HTTP Error ${error.response.status}. The API may be unavailable.`;
      }
    } else if (error.message.includes('timeout')) {
      errorMessage = "❌ Request timed out. Please try again.";
    } else if (error.message) {
      errorMessage = `❌ ${error.message}`;
    }

    console.error("4K Upscale Command Error:", error);
    api.sendMessage(errorMessage, threadID, messageID);

  } finally {
    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlink(tempFilePath).catch(console.error);
    }
  }
}

module.exports = {
  config,
  run
};