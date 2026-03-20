// active-session.js
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const historyFilePath = path.resolve(__dirname, '..', 'data', 'history.json');

let historyData = [];
try {
  historyData = require(historyFilePath);
} catch (err) {
  console.error('Failed to load history.json:', err.message);
}

module.exports = {
  config: {
    name: "active-session",
    aliases: [
      "listusers", "listbots", "active", "list-users", "bot-users",
      "active-users", "active-bots", "list-bot", "botstatus"
    ],
    version: "1.4.0",
    role: 0,
    cooldown: 0,
    hasPrefix: true,
    credits: "Jayy",
    description: "List all active bot sessions and system info",
    usage: "{pn} [logout]"
  },

  run: async function ({ api, event, args }) {
    const allowedUIDs = ["61587367127426", "61587367127426"];
    
    if (!allowedUIDs.includes(event.senderID)) {
      return api.sendMessage(
        "❌ This command is only for AUTOBOT owners.",
        event.threadID,
        event.messageID
      );
    }

    if (args[0]?.toLowerCase() === "logout") {
      return await handleLogout(api, event);
    }

    if (historyData.length === 0) {
      return api.sendMessage(
        "⚠️ No active sessions found in history.",
        event.threadID,
        event.messageID
      );
    }

    const currentUserID = api.getCurrentUserID();
    const mainBotIndex = historyData.findIndex(u => u.userid === currentUserID);

    if (mainBotIndex === -1) {
      return api.sendMessage(
        "⚠️ Main bot account not found in history data.",
        event.threadID,
        event.messageID
      );
    }

    const mainBot = historyData[mainBotIndex];
    const mainBotName = await getUserName(api, currentUserID) || "Unknown";
    const mainUptime = formatUptime(mainBot.time);
    const systemInfo = getSystemInfo();

    // Prepare list of other sessions
    const otherSessions = await Promise.all(
      historyData
        .filter(u => u.userid !== currentUserID)
        .map(async (user, index) => {
          const name = await getUserName(api, user.userid) || "Unknown";
          const uptime = formatUptime(user.time);
          return `[${index + 1}] ${name}\nID: ${user.userid}\nUptime: ${uptime}`;
        })
    );

    const count = otherSessions.length;

    const message = 
`𝗠𝗔𝗜𝗡 𝗕𝗢𝗧
Name: ${mainBotName}
ID: ${currentUserID}
Uptime: ${mainUptime}

| SYSTEM INFO |
${systemInfo}

𝗢𝗧𝗛𝗘𝗥 𝗔𝗖𝗧𝗜𝗩𝗘 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦 [${count}]
${otherSessions.length > 0 ? otherSessions.join("\n\n") : "No other sessions"}

🔌 Use {pn} logout  to stop this bot session gracefully.`;

    return api.sendMessage(message, event.threadID, event.messageID);
  }
};

async function handleLogout(api, event) {
  const currentUserID = api.getCurrentUserID();
  const sessionFile = path.resolve(__dirname, '..', 'data', 'session', `${currentUserID}.json`);

  try {
    await fs.unlink(sessionFile);
    await api.sendMessage(
      "✅ Bot session logged out successfully.",
      event.threadID,
      event.messageID,
      () => process.exit(0)
    );
  } catch (err) {
    console.error("Logout failed:", err.message);
    return api.sendMessage(
      `❌ Failed to logout: ${err.message}`,
      event.threadID,
      event.messageID
    );
  }
}

async function getUserName(api, userID) {
  try {
    const info = await api.getUserInfo(userID);
    return info?.[userID]?.name;
  } catch {
    return null;
  }
}

function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = formatBytes(os.totalmem());
  const freeMem = formatBytes(os.freemem());

  return `OS: ${os.type()} \( {os.release()} ( \){os.platform()}) ${os.arch()}
CPU: ${cpus[0]?.model || "Unknown"}
Cores: ${cpus.length}
Memory: ${totalMem} total  •  ${freeMem} free`;
}

function formatUptime(seconds) {
  const total = Number(seconds) || 0;
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);

  return parts.join(" ");
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
}