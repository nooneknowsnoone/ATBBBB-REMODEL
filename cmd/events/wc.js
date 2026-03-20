module.exports = {
  config: {
    name: "goodbye",
    version: "1.0.0",
    role: 0,
    credits: "YourName / Original Author",
    description: "Sends a goodbye message and image when a member leaves the group",
    hasPrefix: false,
    cooldown: 0
  },

  handleEvent: async function ({ api, event }) {
    // Check if the event is a member leaving
    if (event.type !== "event") return;
    if (event.logMessageType !== "log:unsubscribe") return;

    const leftID = event.logMessageData?.leftParticipantFbId;
    if (!leftID) return;

    // Don't send goodbye message if the bot itself left
    if (leftID === api.getCurrentUserID()) return;

    try {
      // Get the leaving member's name
      let name = await api.getUserInfo(leftID).then(info => info[leftID].name);

      // Truncate name if it's too long
      const maxLength = 15;
      if (name.length > maxLength) {
        name = name.substring(0, maxLength - 3) + '...';
      }

      // Get group information
      const groupInfo = await api.getThreadInfo(event.threadID);
      const groupName = groupInfo.threadName || "this group";
      const memberCount = groupInfo.participantIDs.length;
      const background = groupInfo.imageSrc || "https://i.ibb.co/4YBNyvP/images-76.jpg";

      // Construct the API URL for the goodbye image
      const url = `https://kryptonite-api-library.onrender.com/api/goodbye?pp=https://kryptonite-api-library.onrender.com/api/profile?uid=${leftID}&name=${encodeURIComponent(name)}&bg=${encodeURIComponent(background)}&member=${memberCount}`;

      // Try to fetch and send the goodbye image
      const axios = require('axios');
      const fs = require('fs');
      
      try {
        const { data } = await axios.get(url, { responseType: 'arraybuffer' });
        const filePath = './script/cache/goodbye_image.jpg';
        
        // Ensure the cache directory exists
        if (!fs.existsSync('./script/cache')) {
          fs.mkdirSync('./script/cache', { recursive: true });
        }
        
        fs.writeFileSync(filePath, Buffer.from(data));

        await api.sendMessage({
          body: `👋 ${name} has left ${groupName}. We'll miss you!`,
          attachment: fs.createReadStream(filePath)
        }, event.threadID);
        
        // Clean up the file
        fs.unlinkSync(filePath);
        
      } catch (imageError) {
        console.error("Error fetching goodbye image:", imageError);
        // Fallback: send message without image
        await api.sendMessage({
          body: `👋 ${name} has left ${groupName}.`
        }, event.threadID);
      }
      
    } catch (error) {
      console.error("Error in goodbye event:", error);
      api.sendMessage(
        "❌ There was an error processing the goodbye message. Please try again later.",
        event.threadID
      );
    }
  }
};