const WebSocket = require("ws");

const SOCKET_URL = "wss://ghz.indevs.in/ghz";
const KEEP_ALIVE_INTERVAL_MS = 10000;
const RECONNECT_DELAY_MS = 3000;

let sharedWebSocket = null;
let keepAliveInterval = null;
let reconnectTimeout = null;

const activeSessions = new Map();
const lastSentCache = new Map();
const favoriteMap = new Map();

function resolveWebSocketCtor() {
  if (typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }

  try {
    return require("ws");
  } catch (_error) {
    return null;
  }
}

function getOpenState(webSocketCtor, socket) {
  return socket?.OPEN ?? webSocketCtor?.OPEN ?? 1;
}

function isSocketOpen(webSocketCtor, socket) {
  return Boolean(socket && socket.readyState === getOpenState(webSocketCtor, socket));
}

function bindSocketEvent(socket, eventName, handler) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(eventName, handler);
    return;
  }

  if (typeof socket.on === "function") {
    socket.on(eventName, handler);
    return;
  }

  socket[`on${eventName}`] = handler;
}

function formatValue(value) {
  if (value >= 1000000) return `x${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `x${(value / 1000).toFixed(1)}K`;
  return `x${value}`;
}

function getPHTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

function cleanText(text) {
  return String(text || "").trim().toLowerCase();
}

function formatItems(items) {
  return items
    .filter((item) => item.quantity > 0)
    .map((item) => `- ${item.emoji ? `${item.emoji} ` : ""}${item.name}: ${formatValue(item.quantity)}`)
    .join("\n");
}

function getSessionKey(senderID, threadID) {
  return `${senderID}:${threadID}`;
}

function clearSocketTimers() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function closeSharedWebSocket() {
  try {
    sharedWebSocket?.close?.();
  } catch (_error) {
    // Ignore
  }
  sharedWebSocket = null;
}

async function sendSessionMessage(session, text) {
  if (!session || !session.api) {
    return;
  }

  try {
    await session.api.sendMessage(text, session.threadID);
  } catch (error) {
    console.error(`[GHZ] Failed to send update:`, error.message);
  }
}

function parseSocketMessage(rawData) {
  if (rawData == null) return null;

  if (typeof rawData === "string") {
    return JSON.parse(rawData);
  }

  if (Buffer.isBuffer(rawData)) {
    return JSON.parse(rawData.toString("utf8"));
  }

  if (rawData.data !== undefined) {
    return parseSocketMessage(rawData.data);
  }

  return JSON.parse(String(rawData));
}

async function handleSocketPayload(payload, api) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const seeds = Array.isArray(payload.seeds) ? payload.seeds : [];
  const gear = Array.isArray(payload.gear) ? payload.gear : [];
  const weather = payload.weather || null;

  for (const [sessionKey, session] of activeSessions.entries()) {
    const favoriteList = favoriteMap.get(session.senderID) || [];
    const sections = [];
    let matchCount = 0;

    function checkItems(label, items) {
      const available = items.filter((item) => item.quantity > 0);
      if (available.length === 0) return;

      const matched = favoriteList.length > 0
        ? available.filter((item) => favoriteList.includes(cleanText(item.name)))
        : available;

      if (favoriteList.length > 0 && matched.length === 0) {
        return;
      }

      matchCount += matched.length;
      sections.push(`${label}:\n${formatItems(matched)}`);
    }

    checkItems("Seeds", seeds);
    checkItems("Gear", gear);

    if (favoriteList.length > 0 && matchCount === 0) {
      continue;
    }

    if (sections.length === 0) {
      continue;
    }

    const weatherInfo = weather
      ? `Weather: ${weather.status}\nDetails: ${weather.description}\nStart: ${weather.startTime}\nEnd: ${weather.endTime}`
      : "";

    const updatedAt = payload.lastUpdated || getPHTime().toLocaleString("en-PH");
    const title = favoriteList.length > 0
      ? `${matchCount} favorite item${matchCount > 1 ? "s" : ""} found`
      : "Garden Horizon stock";

    const message = [title, sections.join("\n\n"), weatherInfo, `Updated: ${updatedAt}`]
      .filter(Boolean)
      .join("\n\n");

    if (lastSentCache.get(sessionKey) === message) {
      continue;
    }

    lastSentCache.set(sessionKey, message);
    await sendSessionMessage(session, message);
  }
}

function scheduleReconnect() {
  if (reconnectTimeout || activeSessions.size === 0) {
    return;
  }

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    ensureWebSocketConnection();
  }, RECONNECT_DELAY_MS);
}

function ensureWebSocketConnection() {
  const WebSocketCtor = resolveWebSocketCtor();
  if (!WebSocketCtor) {
    return false;
  }

  if (isSocketOpen(WebSocketCtor, sharedWebSocket) || isSocketOpen(WebSocketCtor, sharedWebSocket)) {
    return true;
  }

  clearSocketTimers();

  try {
    sharedWebSocket = new WebSocketCtor(SOCKET_URL);
  } catch (error) {
    console.error("[GHZ] Failed to create WebSocket:", error.message);
    scheduleReconnect();
    return false;
  }

  bindSocketEvent(sharedWebSocket, "open", () => {
    clearSocketTimers();
    console.log("[GHZ] WebSocket connected");

    keepAliveInterval = setInterval(() => {
      if (isSocketOpen(WebSocketCtor, sharedWebSocket)) {
        try {
          sharedWebSocket.send("ping");
        } catch (error) {
          console.error("[GHZ] Keep-alive failed:", error.message);
        }
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  });

  bindSocketEvent(sharedWebSocket, "message", async (event) => {
    try {
      const payload = parseSocketMessage(event);
      await handleSocketPayload(payload);
    } catch (_error) {
      // Ignore malformed payloads
    }
  });

  bindSocketEvent(sharedWebSocket, "close", () => {
    sharedWebSocket = null;
    clearSocketTimers();
    scheduleReconnect();
  });

  bindSocketEvent(sharedWebSocket, "error", () => {
    try {
      sharedWebSocket?.close?.();
    } catch (_error) {
      sharedWebSocket = null;
    }
  });

  return true;
}

module.exports.config = {
  name: "ghz",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Garden Horizon",
  description: "Garden Horizon live stock tracker using WebSocket",
  commandCategory: "tools",
  usages: "ghz on | ghz off | ghz fav add <item> | ghz fav remove <item>",
  cooldowns: 3,
  role: 0
};

module.exports.run = async function({ api, event, args }) {
  const senderID = String(event.senderID);
  const threadID = String(event.threadID);
  const threadIDNum = event.threadID;
  const sessionKey = getSessionKey(senderID, threadID);
  const subcommand = cleanText(args[0]);

  if (subcommand === "fav") {
    const action = cleanText(args[1]);
    const items = args
      .slice(2)
      .join(" ")
      .split("|")
      .map((item) => cleanText(item))
      .filter(Boolean);

    if (!action || !["add", "remove", "list"].includes(action) || (items.length === 0 && action !== "list")) {
      api.sendMessage(
        "Usage: ghz fav add Item1 | Item2\nUsage: ghz fav remove Item1 | Item2\nUsage: ghz fav list",
        threadIDNum,
        event.messageID
      );
      return;
    }

    if (action === "list") {
      const currentFavorites = favoriteMap.get(senderID) || [];
      const favDisplay = currentFavorites.join(", ") || "(empty)";
      api.sendMessage(`Favorite list:\n${favDisplay}`, threadIDNum, event.messageID);
      return;
    }

    const currentFavorites = new Set(favoriteMap.get(senderID) || []);
    for (const item of items) {
      if (action === "add") {
        currentFavorites.add(item);
      } else {
        currentFavorites.delete(item);
      }
    }

    const updatedFavorites = [...currentFavorites];
    favoriteMap.set(senderID, updatedFavorites);

    api.sendMessage(`Favorite list updated:\n${updatedFavorites.join(", ") || "(empty)"}`, threadIDNum, event.messageID);
    return;
  }

  if (subcommand === "off") {
    if (!activeSessions.has(sessionKey)) {
      api.sendMessage("You do not have an active ghz session in this chat.", threadIDNum, event.messageID);
      return;
    }

    activeSessions.delete(sessionKey);
    lastSentCache.delete(sessionKey);

    if (activeSessions.size === 0) {
      closeSharedWebSocket();
    }

    api.sendMessage("Garden Horizon tracking stopped.", threadIDNum, event.messageID);
    return;
  }

  if (subcommand !== "on") {
    api.sendMessage(
      [
        "Garden Horizon commands:",
        "ghz on - Start tracking",
        "ghz off - Stop tracking",
        "ghz fav add Carrot | Water",
        "ghz fav remove Carrot",
        "ghz fav list",
      ].join("\n"),
      threadIDNum,
      event.messageID
    );
    return;
  }

  if (activeSessions.has(sessionKey)) {
    api.sendMessage(`You are already tracking Garden Horizon.\nUse ghz off to stop.`, threadIDNum, event.messageID);
    return;
  }

  if (!ensureWebSocketConnection()) {
    api.sendMessage("WebSocket support is not available. Install the ws package.", threadIDNum, event.messageID);
    return;
  }

  activeSessions.set(sessionKey, {
    senderID,
    sessionKey,
    api,
    threadID: threadIDNum,
  });

  lastSentCache.delete(sessionKey);

  api.sendMessage("Garden Horizon tracking started.", threadIDNum, event.messageID);
};
