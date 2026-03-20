const fs = require('fs');
const path = require('path');
const login = require('@dongdev/fca-unofficial');
const express = require('express');
const app = express();
const chalk = require('chalk');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const fsExtra = require('fs-extra');
const Storage = require('./storage');

const CMD_DIR = path.join(__dirname, 'cmd');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Initialize storage
let config = [];
let dev = [];

async function initConfig() {
  await Storage.init();
  config = Storage.getConfig();
  if (!config || config.length === 0) {
    config = createConfig();
    await Storage.updateConfig(config);
  }
  dev = fs.existsSync(path.join(__dirname, './dev.json')) 
    ? JSON.parse(fs.readFileSync(path.join(__dirname, './dev.json'), 'utf8')) 
    : [];
}

const Utils = new Object({
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map(),
  replyData: new Map(),
});

// ────────────────────────────────────────────────
//     Improved Command & Event Loader (recursive)
//     → sinusuportahan na ang cmd/events/
// ────────────────────────────────────────────────

function loadCommandsAndEvents(dir = CMD_DIR) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursive call para sa subfolders tulad ng events/
      loadCommandsAndEvents(fullPath);
      continue;
    }

    if (!file.endsWith('.js')) continue;

    try {
      const cmdPath = fullPath;
      const { config: cmdConfig, run, handleEvent } = require(cmdPath);

      if (cmdConfig) {
        const {
          name = [], 
          role = '0', 
          version = '1.0.0', 
          hasPrefix = true, 
          aliases = [], 
          description = '', 
          usage = '', 
          credits = '', 
          cooldown = '5', 
          dev: devOnly = false
        } = cmdConfig;

        const cmdNameArray = Array.isArray(name) ? name : [name];
        const cmdAliases = [...aliases, ...cmdNameArray];

        const primaryName = cmdNameArray[0] || '';

        const cmdData = {
          name: primaryName,
          role,
          version,
          hasPrefix,
          aliases: cmdAliases,
          description,
          usage,
          credits,
          cooldown,
          dev: devOnly
        };

        if (run) {
          Utils.commands.set(cmdAliases, {
            ...cmdData,
            run
          });
        }

        if (handleEvent) {
          Utils.handleEvent.set(cmdAliases, {
            ...cmdData,
            handleEvent
          });
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error loading command/event ${file}: ${error.message}`));
    }
  }
}

// Express setup
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(express.json());

const routes = [
  { path: '/', file: 'index.html' },
  { path: '/guide', file: 'guide.html' },
  { path: '/active', file: 'online.html' },
];

routes.forEach(route => {
  app.get(route.path, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', route.file));
  });
});

app.get('/info', (req, res) => {
  const historyData = Storage.getHistory();
  const userids = Array.from(Utils.account.keys());

  const data = userids.map((userid) => {
    const account = Utils.account.get(userid);
    return {
      userid,
      name: account.name,
      profileUrl: account.profileUrl,
      thumbSrc: account.thumbSrc,
      time: account.time
    };
  });
  res.json(data);
});

app.get('/commands', (req, res) => {
  const commandSet = new Set();
  const commands = [...Utils.commands.values()].map(({ name }) => {
    commandSet.add(name);
    return name;
  });
  const handleEvent = [...Utils.handleEvent.values()]
    .map(({ name }) => commandSet.has(name) ? null : name)
    .filter(Boolean);
  const role = [...Utils.commands.values()].map(({ role }) => role);
  const aliases = [...Utils.commands.values()].map(({ aliases }) => aliases);

  res.json({ commands, handleEvent, role, aliases });
});

app.post('/login', async (req, res) => {
  const { state, commands, prefix, admin } = req.body;

  try {
    if (!state) throw new Error('Missing app state data');

    const cUser = state.find(item => item.key === 'c_user');
    if (!cUser) throw new Error('Invalid appstate data');

    const existingUser = Utils.account.get(cUser.value);
    if (existingUser) {
      console.log(`User ${cUser.value} is already logged in`);
      return res.status(400).json({
        error: false,
        message: "Active user session detected; already logged in",
        user: existingUser
      });
    }

    await accountLogin(state, commands, prefix, [admin]);
    res.status(200).json({
      success: true,
      message: 'Login successful.'
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: true, message: error.message });
  }
});

// Start server after config is loaded
initConfig().then(() => {
  loadCommandsAndEvents();   // ← importante: dito na-load ang cmd/ at cmd/events/

  app.listen(3000, () => {
    console.log(chalk.green(`Server running at http://localhost:3000`));
    main();
  });
}).catch(err => {
  console.error(chalk.red('Failed to initialize config:'), err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

// Account login logic
async function accountLogin(state, enableCommands = [], prefix, admin = []) {
  return new Promise((resolve, reject) => {
    login({ appState: state }, async (error, api) => {
      if (error) {
        reject(error);
        return;
      }

      const userid = await api.getCurrentUserID();
      addThisUser(userid, enableCommands, state, prefix, admin);

      try {
        const userInfo = await api.getUserInfo(userid);
        if (!userInfo || !userInfo[userid]?.name) {
          throw new Error('Account suspended or locked.');
        }

        const { name, profileUrl, thumbSrc } = userInfo[userid];
        let historyEntry = Storage.getHistoryByUserId(userid);
        let time = historyEntry?.time || 0;

        Utils.account.set(userid, { name, profileUrl, thumbSrc, time });

        const intervalId = setInterval(() => {
          try {
            const account = Utils.account.get(userid);
            if (!account) throw new Error('Account not found');
            Utils.account.set(userid, { ...account, time: account.time + 1 });
          } catch {
            clearInterval(intervalId);
          }
        }, 1000);
      } catch (error) {
        reject(error);
        return;
      }

      api.setOptions({
        listenEvents: config[0].fcaOption.listenEvents,
        logLevel: config[0].fcaOption.logLevel,
        updatePresence: config[0].fcaOption.updatePresence,
        selfListen: config[0].fcaOption.selfListen,
        forceLogin: config[0].fcaOption.forceLogin,
        online: config[0].fcaOption.online,
        autoMarkDelivery: config[0].fcaOption.autoMarkDelivery,
        autoMarkRead: config[0].fcaOption.autoMarkRead,
      });

      api.listenMqtt(async (error, event) => {
        if (error) {
          console.error(`Listen error for ${userid}:`, error);
          return;
        }

        let database = Storage.getDatabase();
        let threadData = database.find(item => Object.keys(item)[0] === event?.threadID) || {};
        let historyEntry = Storage.getHistoryByUserId(userid);
        let blacklist = historyEntry?.blacklist || [];

        let hasPrefix = (event.body && aliases(event.body?.trim().toLowerCase().split(/ +/).shift())?.hasPrefix === false) ? '' : prefix;
        let [command, ...args] = (event.body || '').trim().toLowerCase().startsWith(hasPrefix?.toLowerCase())
          ? event.body.trim().substring(hasPrefix.length).trim().split(/\s+/)
          : [];

        if (hasPrefix && aliases(command)?.hasPrefix === false) {
          api.sendMessage(`This command doesn't need a prefix.`, event.threadID, event.messageID);
          return;
        }

        if (event.body && aliases(command)?.name) {
          const cmd = aliases(command);
          if (cmd.dev && !dev.includes(event.senderID)) {
            return api.sendMessage("You need to be a developer to use this command.", event.threadID, event.messageID);
          }

          const role = cmd.role ?? 0;
          const isAdmin = config[0]?.masterKey?.admin?.includes(event.senderID) || admin.includes(event.senderID);
          const isThreadAdmin = isAdmin || (threadData[event.threadID] || []).some(a => a.id === event.senderID);

          if ((role == 1 && !isAdmin) || (role == 2 && !isThreadAdmin) || (role == 3 && !config[0]?.masterKey?.admin?.includes(event.senderID))) {
            api.sendMessage(`You don't have permission.`, event.threadID, event.messageID);
            return;
          }

          if (blacklist.includes(event.senderID)) {
            api.sendMessage("You are banned from using this bot.", event.threadID, event.messageID);
            return;
          }

          // Cooldown check
          const now = Date.now();
          const cooldownKey = `\( {event.senderID}_ \){cmd.name}_${userid}`;
          const lastUse = Utils.cooldowns.get(cooldownKey);
          const delay = cmd.cooldown ?? 0;
          if (lastUse && (now - lastUse.timestamp) < delay * 1000) {
            const remaining = Math.ceil((lastUse.timestamp + delay * 1000 - now) / 1000);
            api.sendMessage(`Please wait ${remaining}s.`, event.threadID, event.messageID);
            return;
          }
          Utils.cooldowns.set(cooldownKey, { timestamp: now, command: cmd.name });
        }

        // Handle unknown prefix/command
        if (event.body && !command && event.body.toLowerCase().startsWith(prefix.toLowerCase())) {
          api.sendMessage(`Invalid command. Use ${prefix}help.`, event.threadID, event.messageID);
          return;
        }
        if (event.body && command && prefix && event.body.toLowerCase().startsWith(prefix.toLowerCase()) && !aliases(command)) {
          api.sendMessage(`Command '${command}' not found.`, event.threadID, event.messageID);
          return;
        }

        // Handle events — pareho pa rin ang logic
        for (const { handleEvent, name } of Utils.handleEvent.values()) {
          if (handleEvent && (enableCommands[1]?.handleEvent?.includes(name) || enableCommands[0]?.commands?.includes(name))) {
            handleEvent({ api, event, enableCommands, admin, prefix, blacklist });
          }
        }

        // Handle commands and replies
        if (event.type === 'message' || event.type === 'message_reply') {
          const cmd = aliases(command?.toLowerCase());
          if (cmd && enableCommands[0].commands.includes(cmd.name)) {
            await cmd.run({ api, event, args, enableCommands, admin, prefix, blacklist, Utils });
          }

          if (event.type === 'message_reply' && event.messageReply) {
            const replyData = Utils.replyData.get(event.messageReply.messageID);
            if (replyData && replyData.userId === event.senderID) {
              const cmd = aliases(replyData.command);
              if (cmd && cmd.handleReply) {
                await cmd.handleReply({ api, event, handleReply: replyData, Utils, args: event.body.trim().split(/\s+/) });
              }
            }
          }
        }
      });

      resolve();
    });
  });
}

async function deleteThisUser(userid) {
  const sessionFile = path.join('./data/session', `${userid}.json`);
  await Storage.removeHistory(userid);
  try {
    fs.unlinkSync(sessionFile);
  } catch (error) {
    console.log(error);
  }
}

async function addThisUser(userid, enableCommands, state, prefix, admin, blacklist = []) {
  const sessionFolder = './data/session';
  const sessionFile = path.join(sessionFolder, `${userid}.json`);
  if (fs.existsSync(sessionFile)) return;

  await Storage.addHistory({
    userid,
    prefix: prefix || "",
    admin: admin || [],
    blacklist,
    enableCommands,
    time: 0
  });

  fs.writeFileSync(sessionFile, JSON.stringify(state));
}

function aliases(command) {
  for (let [aliases, cmd] of Utils.commands.entries()) {
    if (aliases.includes(command)) return cmd;
  }
  return null;
}

async function main() {
  const cacheFile = './cmd/cache';
  if (!fs.existsSync(cacheFile)) fs.mkdirSync(cacheFile);

  const sessionFolder = './data/session';
  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder);

  const historyData = Storage.getHistory();

  cron.schedule(`*/${config[0].masterKey.restartTime} * * * *`, async () => {
    const history = Storage.getHistory();
    history.forEach(user => {
      if (!user || typeof user !== 'object') process.exit(1);
      if (user.time === undefined || isNaN(user.time)) process.exit(1);
      const update = Utils.account.get(user.userid);
      if (update) user.time = update.time;
    });
    await fsExtra.emptyDir(cacheFile);
    await Storage.save();
    process.exit(1);
  });

  for (const file of fs.readdirSync(sessionFolder)) {
    const filePath = path.join(sessionFolder, file);
    try {
      const userid = path.parse(file).name;
      const userData = historyData.find(item => item.userid === userid);
      if (!userData) continue;
      const { enableCommands, prefix, admin, blacklist } = userData;
      const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      await accountLogin(state, enableCommands, prefix, admin, blacklist);
    } catch (error) {
      deleteThisUser(path.parse(file).name);
    }
  }
}

function createConfig() {
  const newConfig = [{
    masterKey: {
      admin: [],
      devMode: false,
      database: false,
      restartTime: 15,
    },
    fcaOption: {
      forceLogin: true,
      listenEvents: true,
      logLevel: "silent",
      updatePresence: true,
      selfListen: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      online: true,
      autoMarkDelivery: false,
      autoMarkRead: false
    }
  }];
  fs.writeFileSync('./data/config.json', JSON.stringify(newConfig, null, 2));
  return newConfig;
}

async function createThread(threadID, api) {
  try {
    const database = Storage.getDatabase() || [];
    const threadInfo = await api.getThreadInfo(threadID);
    const adminIDs = threadInfo ? threadInfo.adminIDs : [];
    const data = { [threadID]: adminIDs };
    database.push(data);
    await Storage.updateDatabase(database);
    return database;
  } catch (error) {
    console.log(error);
  }
}

// Ensure dev.json exists
if (!fs.existsSync('./dev.json')) {
  fs.writeFileSync('./dev.json', '[]');
}