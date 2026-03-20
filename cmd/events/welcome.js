module.exports = {
  config: {
    name: "welcome",
    version: "1.0.0",
    role: 0,
    credits: "YourName / Original Author",
    description: "Sends a welcome message and image when a new member joins the group",
    hasPrefix: false,
    cooldown: 0
  },

  handleEvent: async function ({ api, event }) {
    // Check if the event is a new member joining
    if (event.type !== "event") return;
    if (event.logMessageType !== "log:subscribe") return;

    const addedParticipants = event.logMessageData?.addedParticipants;
    if (!addedParticipants || addedParticipants.length === 0) return;

    const senderID = addedParticipants[0].userFbId;
    
    try {
      // Get the new member's name
      let name = await api.getUserInfo(senderID).then(info => info[senderID].name);

      // Truncate name if it's too long
      const maxLength = 15;
      if (name.length > maxLength) {
        name = name.substring(0, maxLength - 3) + '...';
      }

      // Get group information
      const groupInfo = await api.getThreadInfo(event.threadID);
      const groupName = groupInfo.threadName || "this group";
      const background = groupInfo.imageSrc || "https://i.ibb.co/4YBNyvP/images-76.jpg";
      const memberCount = groupInfo.participantIDs.length;

      // Construct the API URL for the welcome image
      const url = `https://kryptonite-api-library.onrender.com/api/welcome?username=${encodeURIComponent(name)}&avatarUrl=https://graph.facebook.com/${senderID}/picture?width=500&height=500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662&groupname=${encodeURIComponent(groupName)}&bg=${encodeURIComponent(background)}&memberCount=${memberCount}`;

      // Try to fetch and send the welcome image
      const axios = require('axios');
      const fs = require('fs');
      
      try {
        const { data } = await axios.get(url, { responseType: 'arraybuffer' });
        const filePath = './script/cache/welcome_image.jpg';
        
        // Ensure the cache directory exists
        if (!fs.existsSync('./script/cache')) {
          fs.mkdirSync('./script/cache', { recursive: true });
        }
        
        fs.writeFileSync(filePath, Buffer.from(data));

        await api.sendMessage({
          body: `🎉 Everyone welcome the new member ${name} to ${groupName}! 🤩`,
          attachment: fs.createReadStream(filePath)
        }, event.threadID);
        
        // Clean up the file
        fs.unlinkSync(filePath);
        
      } catch (imageError) {
        console.error("Error fetching welcome image:", imageError);
        // Fallback: send message without image
        await api.sendMessage({
          body: `🎉 Everyone welcome the new member ${name} to ${groupName}!`
        }, event.threadID);
      }
      
    } catch (error) {
      console.error("Error in welcome event:", error);
      api.sendMessage(
        "❌ There was an error processing the welcome message. Please try again later.",
        event.threadID
      );
    }
  }
};