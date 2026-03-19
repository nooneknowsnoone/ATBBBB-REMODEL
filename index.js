const fs = require('fs');
const path = require('path');
const express = require('express');
const chalk = require('chalk');
const cron = require('node-cron');
const fsExtra = require('fs-extra');

const login = require('@dongdev/fca-unofficial');   // ← your chosen library

const Storage = require('./storage');
const { aliases, loadCommands } = require('./commandLoader');

const app = express();
const CMD_DIR = path.join(__dirname, 'cmd');
const DATA_DIR = path.join(__dirname, 'data');
const SESSION_DIR = path.join(DATA_DIR, 'session');
const CACHE_DIR = path.join(CMD_DIR, 'cache');

const Utils = {
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map(),
  replyData: new Map(),
};

// ────────────────────────────────────────────────
//              Initialization
// ────────────────────────────────────────────────

async function initialize() {
  // Create necessary directories
  [DATA_DIR, SESSION_DIR, CACHE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Initialize storage & config
  await Storage.init();
  let config = Storage.getConfig();

  if (!config || !Array.isArray(config) || config.length === 0) {
    config = createDefaultConfig();
    await Storage.updateConfig(config);
  }

  // Load developer list
  const devList = loadDevList();

  // Load all commands
  loadCommands(CMD_DIR, Utils);

  // Load & restore existing bot sessions
  await restoreExistingSessions();

  console.log(chalk.green('Initialization completed'));
  return config;
}

// ────────────────────────────────────────────────
//              Express Routes
// ────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const pages = [
  { path: '/',          file: 'index.html' },
  { path: '/guide',     file: 'guide.html' },
  { path: '/active',    file: 'online.html' },
];

pages.forEach(({ path, file }) => {
  app.get(path, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
});

app.get('/info', (req, res) => {
  const accounts = Array.from(Utils.account.entries()).map(([userid, acc]) => ({
    userid,
    name: acc.name,
    profileUrl: acc.profileUrl,
    thumbSrc: acc.thumbSrc,
    time: acc.time || 0
  }));
  res.json(accounts);
});

app.get('/commands', (req, res) => {
  const names = new Set();
  const data = {
    commands:   [...Utils.commands.values()].map(c => (names.add(c.name), c.name)),
    events:     [...Utils.handleEvent.values()].map(c => names.has(c.name) ? null : (names.add(c.name), c.name)).filter(Boolean),
    roles:      [...Utils.commands.values()].map(c => c.role),
    aliases:    [...Utils.commands.values()].map(c => c.aliases)
  };
  res.json(data);
});

app.post('/login', async (req, res) => {
  const { state, commands = [], prefix = "!", admin = [] } = req.body || {};

  if (!state || !Array.isArray(state)) {
    return res.status(400).json({ error: true, message: "Missing or invalid appstate" });
  }

  const cUser = state.find(item => item.key === 'c_user');
  if (!cUser?.value) {
    return res.status(400).json({ error: true, message: "Invalid appstate (missing c_user)" });
  }

  const userid = cUser.value;

  if (Utils.account.has(userid)) {
    return res.status(400).json({
      error: false,
      message: "This account is already logged in",
      user: Utils.account.get(userid)
    });
  }

  try {
    await startBotSession(state, { enableCommands: commands, prefix, admin });
    res.json({ success: true, message: "Login successful" });
  } catch (err) {
    console.error(chalk.red(`Login failed for ${userid}: ${err.message}`));
    res.status(400).json({ error: true, message: err.message });
  }
});

// ────────────────────────────────────────────────
//              Bot Session Logic
// ────────────────────────────────────────────────

async function startBotSession(appState, { enableCommands, prefix, admin }) {
  return new Promise((resolve, reject) => {
    login({ appState }, async (err, api) => {
      if (err) return reject(err);

      const userid = api.getCurrentUserID();

      // Save session
      await Storage.addOrUpdateHistory({
        userid,
        prefix,
        admin,
        enableCommands,
        time: 0,
        blacklist: []
      });

      fs.writeFileSync(
        path.join(SESSION_DIR, `${userid}.json`),
        JSON.stringify(appState, null, 2)
      );

      // Get basic user info
      const userInfo = (await api.getUserInfo(userid))?.[userid];
      if (!userInfo?.name) {
        return reject(new Error("Cannot fetch account info – possibly suspended"));
      }

      Utils.account.set(userid, {
        name: userInfo.name,
        profileUrl: userInfo.profileUrl || "",
        thumbSrc: userInfo.thumbSrc || "",
        time: 0
      });

      // Uptime counter
      const timer = setInterval(() => {
        const acc = Utils.account.get(userid);
        if (!acc) return clearInterval(timer);
        acc.time = (acc.time || 0) + 1;
      }, 1000);

      // Apply FCA options
      api.setOptions(Storage.getConfig()?.[0]?.fcaOption || {});

      // Listen to events
      api.listenMqtt(async (mqttErr, event) => {
        if (mqttErr) {
          console.warn(`MQTT error for ${userid}:`, mqttErr);
          return;
        }

        await handleIncomingEvent(api, event, { userid, prefix, enableCommands, admin });
      });

      resolve();
    });
  });
}

async function handleIncomingEvent(api, event, sessionInfo) {
  // ... (implement prefix parsing, cooldown, permission check, run command, handleEvent, reply handling)
  // This part is quite long — you can move it to a separate file (eventHandler.js)
  // for better readability.
  // For now, I'll leave a skeleton:

  // 1. prefix detection
  // 2. command matching via aliases()
  // 3. permission check (role, devOnly, blacklist)
  // 4. cooldown check
  // 5. execute run() or handleEvent()
  // 6. handle reply logic if event.type === 'message_reply'
}

async function restoreExistingSessions() {
  if (!fs.existsSync(SESSION_DIR)) return;

  const history = Storage.getHistory() || [];

  for (const file of fs.readdirSync(SESSION_DIR)) {
    if (!file.endsWith('.json')) continue;

    const userid = path.parse(file).name;
    const sessionPath = path.join(SESSION_DIR, file);

    try {
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      const sessionData = history.find(h => h.userid === userid);

      if (sessionData?.enableCommands) {
        await startBotSession(state, {
          enableCommands: sessionData.enableCommands,
          prefix: sessionData.prefix || "!",
          admin: sessionData.admin || []
        });
      }
    } catch (err) {
      console.warn(`Failed to restore session ${userid}:`, err.message);
      // Optionally remove broken session
      fs.unlinkSync(sessionPath).catch(() => {});
      await Storage.removeHistory(userid);
    }
  }
}

// ────────────────────────────────────────────────
//              Helpers
// ────────────────────────────────────────────────

function createDefaultConfig() {
  return [{
    masterKey: {
      admin: [],
      devMode: false,
      restartTime: 15
    },
    fcaOption: {
      forceLogin: true,
      listenEvents: true,
      logLevel: "silent",
      updatePresence: true,
      selfListen: true,
      online: true,
      autoMarkDelivery: false,
      autoMarkRead: false
    }
  }];
}

function loadDevList() {
  const devPath = path.join(__dirname, 'dev.json');
  if (!fs.existsSync(devPath)) {
    fs.writeFileSync(devPath, '[]', 'utf-8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(devPath, 'utf-8'));
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────
//              Startup
// ────────────────────────────────────────────────

(async () => {
  try {
    const config = await initialize();

    // Auto-restart cron
    cron.schedule(`*/${config[0].masterKey.restartTime} * * * *`, async () => {
      console.log(chalk.yellow("Performing scheduled restart..."));
      await fsExtra.emptyDir(CACHE_DIR);
      await Storage.save();
      process.exit(0); // or 1 — depending on your orchestrator
    });

    const PORT = 3000;
    app.listen(PORT, () => {
      console.log(chalk.green(`Server running → http://localhost:${PORT}`));
    });
  } catch (err) {
    console.error(chalk.red("Startup failed:"), err);
    process.exit(1);
  }
})();