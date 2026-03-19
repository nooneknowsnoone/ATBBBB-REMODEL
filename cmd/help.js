// cmd/help.js

const config = {
  name: "help",
  aliases: ["menu", "cmds", "commands", "h"],
  version: "1.1.0",
  role: 0,
  cooldown: 5,
  credits: "Jayy",
  description: "Shows list of commands (grouped by category)",
  hasPrefix: true,
  usage: "{pn} [category or command name]",
  category: "system"
};

async function run({ api, event, args, prefix, Utils }) {
  const { threadID, messageID } = event;

  // ─── Collect all commands ────────────────────────────────────────
  const cmdList = Array.from(Utils.commands.values());

  // ─── Group by category ───────────────────────────────────────────
  const categories = new Map();

  for (const cmd of cmdList) {
    const cat = cmd.category || "uncategorized";
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat).push(cmd);
  }

  // ─── No argument → show category list + stats ───────────────────
  if (args.length === 0) {
    let txt = `🌟 **Available Commands**\n\n`;

    txt += `Total commands: ${cmdList.length}\n`;
    txt += `Categories: ${categories.size}\n\n`;

    // Sort categories alphabetically
    const sortedCats = [...categories.keys()].sort();

    for (const cat of sortedCats) {
      const cmds = categories.get(cat);
      txt += `📌 **\( {cat.toUpperCase()}** ( \){cmds.length})\n`;
      txt += `→ ${prefix}help ${cat.toLowerCase()}\n\n`;
    }

    txt += `Type ${prefix}help <category> to see commands in that category\n`;
    txt += `Type ${prefix}help <command> to see detailed info about a command`;

    return api.sendMessage(txt, threadID, messageID);
  }

  // ─── Argument given ──────────────────────────────────────────────
  const query = args[0].toLowerCase();

  // 1. Try to find exact command
  const foundCmd = cmdList.find(
    c => c.name.toLowerCase() === query ||
         (c.aliases || []).some(a => a.toLowerCase() === query)
  );

  if (foundCmd) {
    const cmd = foundCmd;
    let detail = `「 ${cmd.name.toUpperCase()} 」\n\n`;

    detail += `Description : ${cmd.description || "No description"}\n`;
    detail += `Category    : ${cmd.category || "uncategorized"}\n`;
    detail += `Aliases     : ${(cmd.aliases || []).join(", ") || "none"}\n`;
    detail += `Cooldown    : ${cmd.cooldown || 5} seconds\n`;
    detail += `Permission  : ${getRoleText(cmd.role || 0)}\n`;
    detail += `Credits     : ${cmd.credits || "unknown"}\n`;
    detail += `Usage       : ${cmd.usage ? cmd.usage.replace("{pn}", prefix + cmd.name) : prefix + cmd.name}\n`;

    return api.sendMessage(detail, threadID, messageID);
  }

  // 2. Try to find category
  const targetCat = [...categories.keys()].find(
    c => c.toLowerCase() === query
  );

  if (targetCat) {
    const cmds = categories.get(targetCat);
    let txt = `📚 **\( {targetCat.toUpperCase()} Commands** ( \){cmds.length})\n\n`;

    // Sort by name
    cmds.sort((a, b) => a.name.localeCompare(b.name));

    for (const cmd of cmds) {
      txt += `❯ \( {prefix} \){cmd.name}`;
      if (cmd.aliases?.length) txt += ` (${cmd.aliases.join(", ")})`;
      txt += `\n   ${cmd.description || "no description"}\n\n`;
    }

    txt += `Use ${prefix}help <command> for more details.`;

    return api.sendMessage(txt, threadID, messageID);
  }

  // ─── Not found ───────────────────────────────────────────────────
  return api.sendMessage(
    `No command or category found with "${query}"\n` +
    `Try ${prefix}help to see all categories.`,
    threadID, messageID
  );
}

// Helper to make role more readable
function getRoleText(role) {
  const roles = {
    0: "Everyone",
    1: "Bot Admin",
    2: "Thread Admin",
    3: "Owner Only"
  };
  return roles[role] || `Level ${role}`;
}

module.exports = {
  config,
  run
};