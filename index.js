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

const Utils = {
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map(),
  replyData: new Map(),
};

// ────────────────────────────────
//     Improved Command & Event Loader
// ────────────────────────────────

function loadCommandsAndEvents() {
  function loadFromDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // recursive para sa subfolders (hal. cmd/events/)
        loadFromDirectory(fullPath);
        continue;
      }

      if (!file.endsWith('.js')) continue;

      try {
        const module = require(fullPath);
        const { config: cmdConfig, run, handleEvent } = module;

        if (!cmdConfig) continue;

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

        const cmdAliases = [...aliases, ...(Array.isArray(name) ? name : [name])];

        const cmdData = {
          name: Array.isArray(name) ? name[0] : name,
          role,
          run,
          aliases: cmdAliases,
          description,
          usage,
          version,
          hasPrefix,
          credits,
          cooldown,
          dev: devOnly
        };

        if (run) {
          Utils.commands.set(cmdAliases, cmdData);
        }

        if (handleEvent) {
          Utils.handleEvent.set(cmdAliases, {
            ...cmdData,
            handleEvent
          });
        }
      } catch (error) {
        console.error(chalk.red(`Error loading ${file}: ${error.message}`));
      }
    }
  }

  // Load lahat mula sa cmd/ at subfolders nito
  loadFromDirectory(CMD_DIR);
}

// Tawagin pagkatapos mag-init ng config
initConfig().then(() => {
  loadCommandsAndEvents();   // ← dito na-load ang commands at events

  app.listen(3000, () => {
    console.log(chalk.green(`Server running at http://localhost:3000`));
    main();
  });
}).catch(err => {
  console.error(chalk.red('Failed to initialize:'), err);
  process.exit(1);
});

// ────────────────────────────────────────────────
//              Express Routes (walang binago)
// ────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(express.json());

// ... (routes, /info, /commands, /login — walang binago, pareho pa rin)

// Account login logic (may maliit na pag-aayos lang sa event loop)
async function accountLogin(state, enableCommands = [], prefix, admin = []) {
  return new Promise((resolve, reject) => {
    login({ appState: state }, async (error, api) => {
      if (error) return reject(error);

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

        setInterval(() => {
          const account = Utils.account.get(userid);
          if (!account) return;
          Utils.account.set(userid, { ...account, time: account.time + 1 });
        }, 1000);
      } catch (err) {
        return reject(err);
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

        // ... (database, threadData, blacklist, prefix parsing, permission, cooldown — pareho pa rin)

        // Handle events (parehong logic tulad ng original mo)
        for (const entry of Utils.handleEvent.values()) {
          const { handleEvent, name } = entry;
          if (!handleEvent) continue;

          // parehong condition tulad ng dati
          if (
            (enableCommands[1]?.handleEvent || []).includes(name) ||
            (enableCommands[0]?.commands || []).includes(name)
          ) {
            try {
              await handleEvent({
                api,
                event,
                enableCommands,
                admin,
                prefix,
                blacklist
              });
            } catch (err) {
              console.error(`Event error in ${name}:`, err);
            }
          }
        }

        // Handle commands and replies (pareho rin)
        if (event.type === 'message' || event.type === 'message_reply') {
          const cmd = aliases(command?.toLowerCase());
          if (cmd && enableCommands[0].commands.includes(cmd.name)) {
            await cmd.run({
              api,
              event,
              args,
              enableCommands,
              admin,
              prefix,
              blacklist,
              Utils,
            });
          }

          // reply handling (handleReply)
          if (event.type === 'message_reply' && event.messageReply) {
            const replyData = Utils.replyData.get(event.messageReply.messageID);
            if (replyData && replyData.userId === event.senderID) {
              const cmd = aliases(replyData.command);
              if (cmd?.handleReply) {
                await cmd.handleReply({
                  api,
                  event,
                  handleReply: replyData,
                  Utils,
                  args: event.body?.trim().split(/\s+/) || []
                });
              }
            }
          }
        }
      });

      resolve();
    });
  });
}

// ────────────────────────────────────────────────
//              Natitirang functions (walang binago)
// ────────────────────────────────────────────────

async function deleteThisUser(userid) { /* pareho */ }
async function addThisUser(userid, enableCommands, state, prefix, admin, blacklist = []) { /* pareho */ }
function aliases(command) { /* pareho */ }
async function main() { /* pareho */ }
function createConfig() { /* pareho */ }
async function createThread(threadID, api) { /* pareho */ }

// Ensure dev.json
if (!fs.existsSync('./dev.json')) {
  fs.writeFileSync('./dev.json', '[]');
}