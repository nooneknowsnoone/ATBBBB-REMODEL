/**
 * External Storage Module
 * Handles data persistence using external JSON storage API
 * Works with Render, Heroku, and other cloud platforms
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Configuration for external storage
// You can use services like: jsonbin.io, file.io, or any cloud storage
const STORAGE_CONFIG = {
  // Set these environment variables in Render dashboard
  jsonbinApiKey: process.env.JSONBIN_API_KEY || "",
  jsonbinBinId: process.env.JSONBIN_BIN_ID || "",
  useExternalStorage: process.env.USE_EXTERNAL_STORAGE === "true",
  
  // Fallback to local file storage (default)
  dataDir: path.join(__dirname, "data"),
  historyFile: path.join(__dirname, "data", "history.json"),
  databaseFile: path.join(__dirname, "data", "database.json"),
  configFile: path.join(__dirname, "data", "config.json")
};

// Initialize local storage directory
function initStorage() {
  if (!fs.existsSync(STORAGE_CONFIG.dataDir)) {
    fs.mkdirSync(STORAGE_CONFIG.dataDir, { recursive: true });
  }
  
  // Initialize files if they don't exist
  const files = [
    { file: STORAGE_CONFIG.historyFile, default: "[]" },
    { file: STORAGE_CONFIG.databaseFile, default: "[]" },
    { file: STORAGE_CONFIG.configFile, default: "[]" }
  ];
  
  files.forEach(({ file, default: defaultData }) => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, defaultData, "utf-8");
    }
  });
}

// Read data from local file
function readLocalFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }
  return null;
}

// Write data to local file
function writeLocalFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error.message);
    return false;
  }
}

// Read from JSONBin.io (external storage)
async function readJsonBin() {
  if (!STORAGE_CONFIG.jsonbinApiKey || !STORAGE_CONFIG.jsonbinBinId) {
    return null;
  }
  
  try {
    const response = await axios.get(
      `https://api.jsonbin.io/v3/b/${STORAGE_CONFIG.jsonbinBinId}/latest`,
      {
        headers: {
          "X-Master-Key": STORAGE_CONFIG.jsonbinApiKey
        }
      }
    );
    return response.data.record;
  } catch (error) {
    console.error("JSONBin read error:", error.message);
    return null;
  }
}

// Write to JSONBin.io (external storage)
async function writeJsonBin(data) {
  if (!STORAGE_CONFIG.jsonbinApiKey || !STORAGE_CONFIG.jsonbinBinId) {
    return false;
  }
  
  try {
    await axios.put(
      `https://api.jsonbin.io/v3/b/${STORAGE_CONFIG.jsonbinBinId}`,
      data,
      {
        headers: {
          "X-Master-Key": STORAGE_CONFIG.jsonbinApiKey,
          "Content-Type": "application/json"
        }
      }
    );
    return true;
  } catch (error) {
    console.error("JSONBin write error:", error.message);
    return false;
  }
}

// Storage class for managing data
class Storage {
  constructor() {
    this.history = [];
    this.database = [];
    this.config = [];
    this.isExternal = STORAGE_CONFIG.useExternalStorage;
    initStorage();
  }

  async init() {
    if (this.isExternal && STORAGE_CONFIG.jsonbinApiKey) {
      const data = await readJsonBin();
      if (data) {
        this.history = data.history || [];
        this.database = data.database || [];
        this.config = data.config || [];
        console.log("[Storage] Loaded from external storage");
        return;
      }
    }
    
    // Fallback to local storage
    this.history = readLocalFile(STORAGE_CONFIG.historyFile) || [];
    this.database = readLocalFile(STORAGE_CONFIG.databaseFile) || [];
    this.config = readLocalFile(STORAGE_CONFIG.configFile) || [];
    console.log("[Storage] Loaded from local storage");
  }

  async save() {
    const data = {
      history: this.history,
      database: this.database,
      config: this.config
    };
    
    if (this.isExternal && STORAGE_CONFIG.jsonbinApiKey) {
      const success = await writeJsonBin(data);
      if (success) {
        console.log("[Storage] Saved to external storage");
        return true;
      }
    }
    
    // Fallback to local storage
    const historySaved = writeLocalFile(STORAGE_CONFIG.historyFile, this.history);
    const databaseSaved = writeLocalFile(STORAGE_CONFIG.databaseFile, this.database);
    const configSaved = writeLocalFile(STORAGE_CONFIG.configFile, this.config);
    
    console.log("[Storage] Saved to local storage");
    return historySaved && databaseSaved && configSaved;
  }

  // History methods
  getHistory() {
    return this.history;
  }

  getHistoryByUserId(userid) {
    return this.history.find(h => h.userid === userid);
  }

  addHistory(entry) {
    const existing = this.history.findIndex(h => h.userid === entry.userid);
    if (existing >= 0) {
      this.history[existing] = entry;
    } else {
      this.history.push(entry);
    }
    return this.save();
  }

  removeHistory(userid) {
    this.history = this.history.filter(h => h.userid !== userid);
    return this.save();
  }

  // Database methods
  getDatabase() {
    return this.database;
  }

  addToDatabase(entry) {
    this.database.push(entry);
    return this.save();
  }

  // Config methods
  getConfig() {
    return this.config;
  }

  updateConfig(newConfig) {
    this.config = newConfig;
    return this.save();
  }
}

// Export singleton instance
module.exports = new Storage();
