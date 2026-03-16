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
  dev = fs.existsSync(path.join(__dirname, './dev.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, './dev.json'), 'utf8')) : [];
}

const Utils = new Object({
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map(),
  replyData: new Map(),
});

fs.readdirSync(CMD_DIR).forEach((file) => {
  if (!file.endsWith('.js')) return;
  
  try {
    const cmdPath = path.join(CMD_DIR, file);
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
      
      aliases.push(name);
      
      if (run) {
        Utils.commands.set(aliases, {
          name,
          role,
          run,
          aliases,
          description,
          usage,
          version,
          hasPrefix,
          credits,
          cooldown,
          dev: devOnly
        });
      }
      
      if (handleEvent) {
        Utils.handleEvent.set(aliases, {
          name,
          handleEvent,
          role,
          description,
          usage,
          version,
          hasPrefix,
          credits,
          cooldown,
          dev: devOnly
        });
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error loading command ${file}: ${error.message}`));
  }
});

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
  // Get all bot info from storage (without exposing sensitive data)
  const historyData = Storage.getHistory();
  
  // Get userids from Utils.account keys
  const userids = Array.from(Utils.account.keys());
  
  const data = userids.map((userid, index) => {
    const account = Utils.account.get(userid);
    // Find the corresponding history entry for this account
    const historyEntry = historyData.find(h => h.userid === userid);
    return {
      userid: userid,
      name: account.name,
      profileUrl: account.profileUrl,
      thumbSrc: account.thumbSrc,
      time: account.time
    };
  });
  res.json(JSON.parse(JSON.stringify(data, null, 2)));
});

app.get('/commands', (req, res) => {
  const command = new Set();
  const commands = [...Utils.commands.values()].map(({ name }) => (command.add(name), name));
  const handleEvent = [...Utils.handleEvent.values()].map(({ name }) => command.has(name) ? null : (command.add(name), name)).filter(Boolean);
  const role = [...Utils.commands.values()].map(({ role }) => role);
  const aliases = [...Utils.commands.values()].map(({ aliases }) => aliases);
  
  res.json(JSON.parse(JSON.stringify({ commands, handleEvent, role, aliases }, null, 2)));
});

app.post('/login', async (req, res) => {
  const { state, commands, prefix, admin } = req.body;
  
  try {
    if (!state) {
      throw new Error('Missing app state data');
    }
    
    const cUser = state.find(item => item.key === 'c_user');
    if (cUser) {
      const existingUser = Utils.account.get(cUser.value);
      if (existingUser) {
        console.log(`User ${cUser.value} is already logged in`);
        return res.status(400).json({
          error: false,
          message: "Active user session detected; already logged in",
          user: existingUser
        });
      } else {
        try {
          await accountLogin(state, commands, prefix, [admin]);
          res.status(200).json({
            success: true,
            message: 'Authentication process completed successfully; login achieved.'
          });
        } catch (error) {
          console.error(error);
          res.status(400).json({
            error: true,
            message: error.message
          });
        }
      }
    } else {
      return res.status(400).json({
        error: true,
        message: "There's an issue with the appstate data; it's invalid."
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: true,
      message: "There's an issue with the appstate data; it's invalid."
    });
  }
});

app.listen(3000, () => {
  console.log(chalk.green(`Server running at http://localhost:3000`));
  main();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

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
        if (!userInfo || !userInfo[userid]?.name || !userInfo[userid]?.profileUrl || !userInfo[userid]?.thumbSrc) {
          throw new Error('Unable to locate the account; it appears to be in a suspended or locked state.');
        }
        
        const { name, profileUrl, thumbSrc } = userInfo[userid];
        let historyEntry = Storage.getHistoryByUserId(userid);
        let time = historyEntry?.time || 0;
        
        Utils.account.set(userid, {
          name,
          profileUrl,
          thumbSrc,
          time: time
        });
        
        const intervalId = setInterval(() => {
          try {
            const account = Utils.account.get(userid);
            if (!account) throw new Error('Account not found');
            Utils.account.set(userid, {
              ...account,
              time: account.time + 1
            });
          } catch (error) {
            clearInterval(intervalId);
            return;
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
      
      try {
        var listenEmitter = api.listenMqtt(async (error, event) => {
          if (error) {
            if (error === 'Connection closed.') {
              console.error(`Error during API listen: ${error}`, userid);
            }
            console.log(error);
            return;
          }
          
          let database = Storage.getDatabase();
          let data = Array.isArray(database) ? database.find(item => Object.keys(item)[0] === event?.threadID) : {};
          let adminIDS = data ? database : createThread(event.threadID, api);
          let historyEntry = Storage.getHistoryByUserId(userid);
          let blacklist = historyEntry?.blacklist || [];
          
          let hasPrefix = (event.body && aliases((event.body || '')?.trim().toLowerCase().split(/ +/).shift())?.hasPrefix == false) ? '' : prefix;
          let [command, ...args] = ((event.body || '').trim().toLowerCase().startsWith(hasPrefix?.toLowerCase()) ? (event.body || '').trim().substring(hasPrefix?.length).trim().split(/\s+/).map(arg => arg.trim()) : []);
          
          if (hasPrefix && aliases(command)?.hasPrefix === false) {
            api.sendMessage(`Invalid usage this command doesn't need a prefix`, event.threadID, event.messageID);
            return;
          }
          
          if (event.body && aliases(command)?.name) {
            const isDevOnly = aliases(command)?.dev;
            if (isDevOnly) {
              if (!dev.includes(event.senderID)) {
                return api.sendMessage("You don't have access to this command, you need to be a developer.", event.threadID, event.messageID);
              }
            }
            
            const role = aliases(command)?.role ?? 0;
            const isAdmin = config?.[0]?.masterKey?.admin?.includes(event.senderID) || admin.includes(event.senderID);
            const isThreadAdmin = isAdmin || ((Array.isArray(adminIDS) ? adminIDS.find(admin => Object.keys(admin)[0] === event.threadID) : {})?.[event.threadID] || []).some(admin => admin.id === event.senderID);
            
            if ((role == 1 && !isAdmin) || (role == 2 && !isThreadAdmin) || (role == 3 && !config?.[0]?.masterKey?.admin?.includes(event.senderID))) {
              api.sendMessage(`You don't have permission to use this command.`, event.threadID, event.messageID);
              return;
            }
          }
          
          if (event.body && event.body?.toLowerCase().startsWith(prefix.toLowerCase()) && aliases(command)?.name) {
            if (blacklist.includes(event.senderID)) {
              api.sendMessage("We're sorry, but you've been banned from using bot. If you believe this is a mistake or would like to appeal, please contact one of the bot admins for further assistance.", event.threadID, event.messageID);
              return;
            }
          }
          
          if (event.body && aliases(command)?.name) {
            const now = Date.now();
            const name = aliases(command)?.name;
            const sender = Utils.cooldowns.get(`${event.senderID}_${name}_${userid}`);
            const delay = aliases(command)?.cooldown ?? 0;
            
            if (!sender || (now - sender.timestamp) >= delay * 1000) {
              Utils.cooldowns.set(`${event.senderID}_${name}_${userid}`, {
                timestamp: now,
                command: name
              });
            } else {
              const active = Math.ceil((sender.timestamp + delay * 1000 - now) / 1000);
              api.sendMessage(`Please wait ${active} seconds before using the "${name}" command again.`, event.threadID, event.messageID);
              return;
            }
          }
          
          if (event.body && !command && event.body?.toLowerCase().startsWith(prefix.toLowerCase())) {
            api.sendMessage(`Invalid command please use ${prefix}help to see the list of available commands.`, event.threadID, event.messageID);
            return;
          }
          
          if (event.body && command && prefix && event.body?.toLowerCase().startsWith(prefix.toLowerCase()) && !aliases(command)?.name) {
            api.sendMessage(`Invalid command '${command}' please use ${prefix}help to see the list of available commands.`, event.threadID, event.messageID);
            return;
          }
          
          for (const { handleEvent, name } of Utils.handleEvent.values()) {
            if (handleEvent && name && (
              (enableCommands[1].handleEvent || []).includes(name) || (enableCommands[0].commands || []).includes(name))) {
              handleEvent({
                api,
                event,
                enableCommands,
                admin,
                prefix,
                blacklist
              });
            }
          }
          
          switch (event.type) {
            case 'message':
            case 'message_reply':
            case 'message_unsend':
            case 'message_reaction':
              if (enableCommands[0].commands.includes(aliases(command?.toLowerCase())?.name)) {
                await ((aliases(command?.toLowerCase())?.run || (() => {}))({
                  api,
                  event,
                  args,
                  enableCommands,
                  admin,
                  prefix,
                  blacklist,
                  Utils,
                }));
              }
              
              // Handle replies - check if this is a reply to a bot message
              if (event.type === 'message_reply' && event.messageReply) {
                const replyMsgID = event.messageReply.messageID;
                
                // Check if we have handleReply commands stored
                for (const [commands, cmdData] of Utils.commands.entries()) {
                  if (cmdData.handleReply && Utils.replyData && Utils.replyData.has(replyMsgID)) {
                    const replyData = Utils.replyData.get(replyMsgID);
                    
                    // Verify it's the same user who initiated the search
                    if (replyData.userId === event.senderID && replyData.command === cmdData.name) {
                      await cmdData.handleReply({
                        api,
                        event,
                        handleReply: replyData,
                        Utils,
                        args: event.body.trim().split(/\s+/)
                      });
                      break;
                    }
                  }
                }
              }
              break;
          }
        });
      } catch (error) {
        console.error('Error during API listen, outside of listen', userid);
        Utils.account.delete(userid);
        deleteThisUser(userid);
        return;
      }
      
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
  
  // Add to storage
  await Storage.addHistory({
    userid,
    prefix: prefix || "",
    admin: admin || [],
    blacklist: blacklist || [],
    enableCommands,
    time: 0
  });
  
  fs.writeFileSync(sessionFile, JSON.stringify(state));
}

function aliases(command) {
  const aliases = Array.from(Utils.commands.entries()).find(([commands]) => commands.includes(command?.toLowerCase()));
  if (aliases) {
    return aliases[1];
  }
  return null;
}

async function main() {
  const cacheFile = './cmd/cache';
  if (!fs.existsSync(cacheFile)) fs.mkdirSync(cacheFile);
  
  // Initialize config first
  await initConfig();
  
  const sessionFolder = path.join('./data/session');
  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder);
  
  // Get history data from storage
  const historyData = Storage.getHistory();
  
  // Scheduled restart
  cron.schedule(`*/${config[0].masterKey.restartTime} * * * *`, async () => {
    const history = Storage.getHistory();
    history.forEach(user => {
      (!user || typeof user !== 'object') ? process.exit(1) : null;
      (user.time === undefined || user.time === null || isNaN(user.time)) ? process.exit(1) : null;
      const update = Utils.account.get(user.userid);
      update ? user.time = update.time : null;
    });
    await fsExtra.emptyDir(cacheFile);
    await Storage.save();
    process.exit(1);
  });
  
  // Load existing sessions
  try {
    for (const file of fs.readdirSync(sessionFolder)) {
      const filePath = path.join(sessionFolder, file);
      try {
        const { enableCommands, prefix, admin, blacklist } = historyData.find(item => item.userid === path.parse(file).name) || {};
        const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (enableCommands) await accountLogin(state, enableCommands, prefix, admin, blacklist);
      } catch (error) {
        deleteThisUser(path.parse(file).name);
      }
    }
  } catch (error) {
    console.log('No existing sessions found');
  }
}

function createConfig() {
  const config = [{
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
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64",
      online: true,
      autoMarkDelivery: false,
      autoMarkRead: false
    }
  }];
  
  const dataFolder = './data';
  if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder);
  fs.writeFileSync('./data/config.json', JSON.stringify(config, null, 2));
  return config;
}

async function createThread(threadID, api) {
  try {
    const database = JSON.parse(fs.readFileSync('./data/database.json', 'utf8'));
    let threadInfo = await api.getThreadInfo(threadID);
    let adminIDs = threadInfo ? threadInfo.adminIDs : [];
    const data = {};
    data[threadID] = adminIDs;
    database.push(data);
    await fs.writeFileSync('./data/database.json', JSON.stringify(database, null, 2), 'utf-8');
    return database;
  } catch (error) {
    console.log(error);
  }
}

async function createDatabase() {
  const data = './data';
  if (!fs.existsSync(data)) fs.mkdirSync(data);
  fs.writeFileSync('./data/database.json', '[]', 'utf-8');
  return [];
}

// Create dev.json if not exists
if (!fs.existsSync('./dev.json')) {
  fs.writeFileSync('./dev.json', '[]');
}

// Start main
main();
