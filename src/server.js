// src/server.js
// השרת המרכזי: מגיש את הדשבורד, מנהל הגדרות, ומפעיל את הבוט

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const { loadConfig, updateConfig } = require('./configStore');
const {
  startBot, stopBot, isReady, publishMenu, publishTicketPanel,
  createVoiceChannel, listGuildRoles, previewVerifyLockdown,
  executeVerifyLockdown, publishReactionRolePanel, createPoll
} = require('./botEngine');
const { buildMenuFromDescription, analyzeExampleImage, buildTicketSystemFromDescription, buildVoiceChannelFromDescription } = require('./aiMenuBuilder');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// ---------- הגדרות ----------

app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({
    discordToken: cfg.discordToken ? '••••••••' + cfg.discordToken.slice(-4) : '',
    groqApiKey: cfg.groqApiKey ? '••••••••' + cfg.groqApiKey.slice(-4) : '',
    guildId: cfg.guildId || '',
    hasDiscordToken: !!cfg.discordToken,
    hasGroqKey: !!cfg.groqApiKey,
    botReady: isReady()
  });
});

app.post('/api/config', (req, res) => {
  const { discordToken, groqApiKey, guildId } = req.body;
  const updates = {};
  if (discordToken !== undefined && discordToken !== '') updates.discordToken = discordToken;
  if (groqApiKey !== undefined && groqApiKey !== '') updates.groqApiKey = groqApiKey;
  if (guildId !== undefined) updates.guildId = guildId;
  const updated = updateConfig(updates);
  res.json({ success: true, guildId: updated.guildId });
});

// ---------- שליטה בבוט ----------

app.post('/api/bot/start', async (req, res) => {
  try {
    const result = await startBot();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/stop', async (req, res) => {
  try {
    await stopBot();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/bot/status', (req, res) => {
  res.json({ ready: isReady() });
});

// ---------- תפריטים AI ----------

app.post('/api/menu/build', async (req, res) => {
  try {
    const { description, existingMenuId } = req.body;
    if (!description?.trim()) return res.status(400).json({ success: false, error: 'יש לכתוב תיאור.' });
    const cfg = loadConfig();
    const existingMenu = existingMenuId ? (cfg.menus || []).find(m => m.id === existingMenuId) : null;
    const built = await buildMenuFromDescription({ apiKey: cfg.groqApiKey, description, existingMenu });
    const menuId = existingMenu ? existingMenu.id : 'menu_' + Date.now();
    built.id = menuId;
    built.active = existingMenu ? existingMenu.active : false;
    const menus = (cfg.menus || []).filter(m => m.id !== menuId);
    menus.push(built);
    updateConfig({ menus });
    res.json({ success: true, menu: built });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/menu/list', (req, res) => {
  const cfg = loadConfig();
  res.json({ menus: cfg.menus || [] });
});

app.delete('/api/menu/:id', (req, res) => {
  const cfg = loadConfig();
  const menus = (cfg.menus || []).filter(m => m.id !== req.params.id);
  updateConfig({ menus });
  res.json({ success: true });
});

app.post('/api/menu/:id/publish', async (req, res) => {
  try {
    const cfg = loadConfig();
    const menu = (cfg.menus || []).find(m => m.id === req.params.id);
    if (!menu) return res.status(404).json({ success: false, error: 'תפריט לא נמצא.' });
    await publishMenu(menu);
    const menus = cfg.menus.map(m => m.id === menu.id ? { ...m, active: true } : m);
    updateConfig({ menus });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- טיקטים ----------

app.get('/api/tickets/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ ticketSystem: cfg.ticketSystem });
});

app.post('/api/tickets/build', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description?.trim()) return res.status(400).json({ success: false, error: 'יש לכתוב תיאור.' });
    const cfg = loadConfig();
    const built = await buildTicketSystemFromDescription({ apiKey: cfg.groqApiKey, description });
    const updated = { ...cfg.ticketSystem, ...built, published: false };
    updateConfig({ ticketSystem: updated });
    res.json({ success: true, ticketSystem: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/tickets/categories/:id', (req, res) => {
  const cfg = loadConfig();
  const categories = (cfg.ticketSystem.categories || []).filter(c => c.id !== req.params.id);
  updateConfig({ ticketSystem: { ...cfg.ticketSystem, categories } });
  res.json({ success: true });
});

app.post('/api/tickets/publish', async (req, res) => {
  try {
    const cfg = loadConfig();
    await publishTicketPanel(cfg.ticketSystem);
    updateConfig({ ticketSystem: { ...cfg.ticketSystem, published: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- שער אימות (Verify Gate) ----------

app.get('/api/verify/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ verifyGate: cfg.verifyGate });
});

app.post('/api/verify/config', (req, res) => {
  const { verifyChannelName, verifiedRoleName, verifyMessage, successMessage, buttonLabel } = req.body;
  const cfg = loadConfig();
  const updated = {
    ...cfg.verifyGate,
    ...(verifyChannelName !== undefined ? { verifyChannelName } : {}),
    ...(verifiedRoleName !== undefined ? { verifiedRoleName } : {}),
    ...(verifyMessage !== undefined ? { verifyMessage } : {}),
    ...(successMessage !== undefined ? { successMessage } : {}),
    ...(buttonLabel !== undefined ? { buttonLabel } : {})
  };
  updateConfig({ verifyGate: updated });
  res.json({ success: true, verifyGate: updated });
});

app.get('/api/verify/preview', async (req, res) => {
  try {
    const preview = await previewVerifyLockdown();
    res.json({ success: true, preview });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/verify/execute', async (req, res) => {
  try {
    const result = await executeVerifyLockdown();
    const cfg = loadConfig();
    updateConfig({
      verifyGate: { ...cfg.verifyGate, enabled: true, verifiedRoleId: result.verifiedRoleId, lockdownExecuted: true }
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- ברכת חבר חדש ----------

app.get('/api/welcome/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ welcomeSystem: cfg.welcomeSystem });
});

app.post('/api/welcome/config', (req, res) => {
  const { enabled, channelName, messageTemplate } = req.body;
  const cfg = loadConfig();
  const updated = {
    ...cfg.welcomeSystem,
    ...(enabled !== undefined ? { enabled: !!enabled } : {}),
    ...(channelName !== undefined ? { channelName } : {}),
    ...(messageTemplate !== undefined ? { messageTemplate } : {})
  };
  updateConfig({ welcomeSystem: updated });
  res.json({ success: true, welcomeSystem: updated });
});

// ---------- הודעת פרידה ----------

app.get('/api/leave/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ leaveSystem: cfg.leaveSystem });
});

app.post('/api/leave/config', (req, res) => {
  const { enabled, channelName, messageTemplate } = req.body;
  const cfg = loadConfig();
  const updated = {
    ...cfg.leaveSystem,
    ...(enabled !== undefined ? { enabled: !!enabled } : {}),
    ...(channelName !== undefined ? { channelName } : {}),
    ...(messageTemplate !== undefined ? { messageTemplate } : {})
  };
  updateConfig({ leaveSystem: updated });
  res.json({ success: true, leaveSystem: updated });
});

// ---------- Auto Role ----------

app.get('/api/autorole/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ autoRole: cfg.autoRole });
});

app.post('/api/autorole/config', (req, res) => {
  const { enabled, roleId } = req.body;
  const cfg = loadConfig();
  const updated = {
    ...cfg.autoRole,
    ...(enabled !== undefined ? { enabled: !!enabled } : {}),
    ...(roleId !== undefined ? { roleId } : {})
  };
  updateConfig({ autoRole: updated });
  res.json({ success: true, autoRole: updated });
});

// ---------- Reaction Roles ----------

app.post('/api/reactionroles/publish', async (req, res) => {
  try {
    const { panelConfig } = req.body;
    if (!panelConfig) return res.status(400).json({ success: false, error: 'חסר מבנה לוח Reaction Roles.' });
    const result = await publishReactionRolePanel(panelConfig);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- סקרים ----------

app.post('/api/polls/create', async (req, res) => {
  try {
    const { pollConfig } = req.body;
    if (!pollConfig) return res.status(400).json({ success: false, error: 'חסר מבנה סקר.' });
    const pollId = await createPoll(pollConfig);
    res.json({ success: true, pollId });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/polls/list', (req, res) => {
  const cfg = loadConfig();
  const polls = cfg.polls || {};
  const list = Object.entries(polls).map(([id, p]) => ({
    id,
    question: p.question,
    totalVotes: p.options.reduce((s, o) => s + o.votes.length, 0),
    createdAt: p.createdAt
  }));
  res.json({ success: true, polls: list });
});

// ---------- חדרים קוליים נעולים ----------

app.get('/api/voice/roles', async (req, res) => {
  try {
    const roles = await listGuildRoles();
    res.json({ success: true, roles });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/voice/build', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description?.trim()) return res.status(400).json({ success: false, error: 'יש לכתוב תיאור.' });
    const cfg = loadConfig();
    const availableRoles = await listGuildRoles();
    const built = await buildVoiceChannelFromDescription({ apiKey: cfg.groqApiKey, description, availableRoles });
    res.json({ success: true, voiceConfig: built, availableRoles });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/voice/create', async (req, res) => {
  try {
    const { voiceConfig } = req.body;
    if (!voiceConfig) return res.status(400).json({ success: false, error: 'חסר מבנה חדר קולי.' });
    const channel = await createVoiceChannel(voiceConfig);
    res.json({ success: true, channelName: channel.name });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- ניתוח תמונה ----------

app.post('/api/menu/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'לא הועלתה תמונה.' });
    const cfg = loadConfig();
    const base64Image = req.file.buffer.toString('base64');
    const description = await analyzeExampleImage({
      apiKey: cfg.groqApiKey,
      base64Image,
      mimeType: req.file.mimetype,
      description: req.body.context || ''
    });
    res.json({ success: true, description });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- טיפול שגיאות גלובלי ----------

app.use((err, req, res, next) => {
  console.error('שגיאת שרת:', err.message);
  if (res.headersSent) return next(err);
  res.status(400).json({ success: false, error: err.message || 'שגיאה לא צפויה' });
});

process.on('uncaughtException', (err) => console.error('uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));

app.listen(PORT, () => {
  console.log(`🚀 הדשבורד פעיל בכתובת: http://localhost:${PORT}`);
});
