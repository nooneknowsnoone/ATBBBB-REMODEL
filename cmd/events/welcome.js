const knights = require('knights-canvas');
const fs = require('fs');
const path = require('path');

module.exports = {
  config: {
    name: "welcome",
    version: "1.0.0",
    role: 0,
    credits: "Lance Cochangco",
    description: "Automatically sends a welcome image when a new member joins the group",
    hasPrefix: false,
    cooldown: 0
  },

  handleEvent: async function ({ api, event }) {
    // Check if event is about a new member joining
    if (event.type !== "event") return;
    if (event.logMessageType !== "log:subscribe") return;

    const addedParticipants = event.logMessageData?.addedParticipants;
    if (!addedParticipants || addedParticipants.length === 0) return;

    // Process each new member (usually just one)
    for (const participant of addedParticipants) {
      const senderID = participant.userFbId;
      
      try {
        // Get member name
        let name = await api.getUserInfo(senderID).then(info => info[senderID].name);
        
        // Truncate name if it's too long
        const maxLength = 15;
        if (name.length > maxLength) {
          name = name.substring(0, maxLength - 3) + '...';
        }

        // Get group information
        const groupInfo = await api.getThreadInfo(event.threadID);
        const memberCount = groupInfo.participantIDs.length;
        const groupName = groupInfo.threadName || "this group";
        const background = groupInfo.imageSrc || "https://i.ibb.co/4YBNyvP/images-76.jpg";
        
        // Construct avatar URL using Facebook Graph API
        const avatarUrl = `https://graph.facebook.com/${senderID}/picture?width=500&height=500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

        try {
          // Generate welcome image using knights-canvas
          const image = await new knights.Welcome2()
            .setAvatar(avatarUrl)
            .setUsername(name)
            .setBg(background)
            .setGroupname(groupName)
            .setMember(memberCount)
            .toAttachment();

          const imageBuffer = image.toBuffer();
          
          // Save to cache directory
          const cacheDir = path.join(__dirname, 'cache');
          if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
          }
          const filePath = path.join(cacheDir, `welcome_${Date.now()}.png`);
          fs.writeFileSync(filePath, imageBuffer);

          // Send welcome message with image
          api.sendMessage({
            body: `🎉 Welcome to the group, ${name}! 🎉\n\n👥 Member count: ${memberCount}`,
            attachment: fs.createReadStream(filePath)
          }, event.threadID, () => {
            // Clean up: delete the file after sending
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });

        } catch (imageError) {
          console.error("Error generating welcome image:", imageError);
          // Fallback: send text-only welcome message
          api.sendMessage({
            body: `🎉 Welcome to the group, ${name}! 🎉\n\n👥 Member count: ${memberCount}`
          }, event.threadID);
        }

      } catch (error) {
        console.error("Error in welcome event:", error);
        api.sendMessage({
          body: `🎉 A new member has joined the group!`
        }, event.threadID);
      }
    }
  }
};