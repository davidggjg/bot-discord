// src/configStore.js
// ב-Render (ובכל סביבת production) — קורא טוקן/מפתחות מ-Environment Variables.
// בסביבת dev מקומית — שומר/קורא מ-data/config.json כרגיל.
//
// משתני סביבה שניתן להגדיר ב-Render:
//   DISCORD_TOKEN   — טוקן הבוט
//   GROQ_API_KEY    — מפתח Groq
//   GUILD_ID        — מזהה השרת

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');

function defaultConfig() {
  return {
    discordToken: '',
    groqApiKey: '',
    guildId: '',
    menus: [],
    warnings: {},
    polls: {},
    welcomeSystem: {
      enabled: false,
      channelName: 'ברוכים-הבאים',
      messageTemplate: 'ברוך הבא לשרת, {user}! 🎉'
    },
    leaveSystem: {
      enabled: false,
      channelName: 'ברוכים-הבאים',
      messageTemplate: 'להתראות, **{username}**! נשמח לראות אותך שוב. 👋'
    },
    autoRole: {
      enabled: false,
      roleId: ''
    },
    verifyGate: {
      enabled: false,
      verifyChannelName: 'verify',
      verifiedRoleName: 'מאומת',
      verifiedRoleId: '',
      verifyMessage: 'לחץ על הכפתור כדי לאשר שאתה אנושי ולקבל גישה לכל ערוצי השרת.',
      successMessage: 'אומתת בהצלחה! כל הערוצים בשרת נפתחו לך. 🎉',
      buttonLabel: 'אישור / Verify',
      lockdownExecuted: false
    },
    ticketSystem: {
      logChannelName: 'ticket-logs',
      staffRoleIds: [],
      categories: [],
      published: false
    }
  };
}

function readFileConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return defaultConfig();
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch (err) {
    console.error('שגיאה בטעינת קובץ ההגדרות:', err.message);
    return defaultConfig();
  }
}

function loadConfig() {
  const fileConfig = readFileConfig();

  // Environment Variables תמיד מנצחים את קובץ ה-config
  // זה מאפשר ל-Render לספק את הסודות דרך env vars בצורה בטוחה
  if (process.env.DISCORD_TOKEN) fileConfig.discordToken = process.env.DISCORD_TOKEN;
  if (process.env.GROQ_API_KEY)  fileConfig.groqApiKey  = process.env.GROQ_API_KEY;
  if (process.env.GUILD_ID)      fileConfig.guildId     = process.env.GUILD_ID;

  // merge nested objects properly
  fileConfig.ticketSystem = { ...defaultConfig().ticketSystem, ...(fileConfig.ticketSystem || {}) };
  fileConfig.welcomeSystem = { ...defaultConfig().welcomeSystem, ...(fileConfig.welcomeSystem || {}) };
  fileConfig.leaveSystem = { ...defaultConfig().leaveSystem, ...(fileConfig.leaveSystem || {}) };
  fileConfig.autoRole = { ...defaultConfig().autoRole, ...(fileConfig.autoRole || {}) };
  fileConfig.verifyGate = { ...defaultConfig().verifyGate, ...(fileConfig.verifyGate || {}) };
  fileConfig.warnings = fileConfig.warnings || {};
  fileConfig.polls = fileConfig.polls || {};

  return fileConfig;
}

function saveConfig(config) {
  try {
    // אל תשמור את הסודות לקובץ אם הם הגיעו מ-env vars
    const toSave = { ...config };
    if (process.env.DISCORD_TOKEN) delete toSave.discordToken;
    if (process.env.GROQ_API_KEY)  delete toSave.groqApiKey;
    if (process.env.GUILD_ID)      delete toSave.guildId;

    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn('לא ניתן לשמור config.json (ייתכן שהמערכת קבועה בלבד):', err.message);
    return false;
  }
}

function updateConfig(partial) {
  const current = loadConfig();
  const updated = { ...current, ...partial };
  saveConfig(updated);
  return updated;
}

module.exports = { loadConfig, saveConfig, updateConfig, CONFIG_PATH };
