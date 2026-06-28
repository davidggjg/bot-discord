// src/botEngine.js
// המוח המבצעי של הבוט: מחבר את כל המנועים יחד.

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const { loadConfig } = require('./configStore');
const ticketEngine = require('./ticketEngine');
const voiceEngine = require('./voiceEngine');
const welcomeEngine = require('./welcomeEngine');
const leaveEngine = require('./leaveEngine');
const verifyGateEngine = require('./verifyGateEngine');
const reactionRoleEngine = require('./reactionRoleEngine');
const moderationEngine = require('./moderationEngine');
const pollEngine = require('./pollEngine');
const autoRoleEngine = require('./autoRoleEngine');

// state בזיכרון: עוקב מי באמצע "שיחת שאלה" עם הבוט
const pendingAnswers = new Map();

let client = null;

function getStyle(styleName) {
  const map = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger
  };
  return map[styleName] || ButtonStyle.Secondary;
}

function buildButtonRow(buttons, menuId) {
  const row = new ActionRowBuilder();
  for (const btn of buttons.slice(0, 5)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${menuId}::${btn.id}`)
        .setLabel(btn.label)
        .setStyle(getStyle(btn.style))
    );
  }
  return row;
}

function sanitizeChannelName(rawName, fallback) {
  const safe = (rawName || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9\-_]/g, '')
    .slice(0, 90);
  return safe || fallback;
}

async function sendTriggerMessage(guild, menu) {
  const { trigger } = menu;
  if (!trigger || trigger.type !== 'channel_message') return;

  const desiredName = sanitizeChannelName(trigger.channelName, `menu-${Date.now()}`);

  let channel = guild.channels.cache.find(
    (c) => c.name === trigger.channelName && c.type === ChannelType.GuildText
  );

  if (!channel) {
    channel = guild.channels.cache.find(
      (c) => c.name === desiredName && c.type === ChannelType.GuildText
    );
  }

  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: desiredName,
        type: ChannelType.GuildText,
        topic: `נוצר אוטומטית עבור התפריט: ${menu.name || ''}`
      });
      console.log(`✅ נוצר ערוץ חדש "${desiredName}" עבור התפריט "${menu.name}"`);
    } catch (err) {
      console.error(`שגיאה ביצירת ערוץ "${desiredName}":`, err.message);
      throw new Error(`לא הצלחתי ליצור את הערוץ "${desiredName}". ודא שלבוט יש הרשאת Manage Channels.`);
    }
  }

  const row = buildButtonRow(trigger.buttons || [], menu.id);
  await channel.send({
    content: trigger.messageText || ' ',
    components: trigger.buttons?.length ? [row] : []
  });
}

async function handleButtonClick(interaction, menus) {
  const [menuId, nodeId] = interaction.customId.split('::');
  const menu = menus.find((m) => m.id === menuId);
  if (!menu) {
    return interaction.reply({ content: 'תפריט זה אינו פעיל יותר.', ephemeral: true });
  }

  const node = menu.nodes?.[nodeId];
  if (!node) {
    return interaction.reply({ content: 'לא נמצאה פעולה מתאימה לכפתור זה.', ephemeral: true });
  }

  await executeNode({ node, menu, interaction });
}

async function executeNode({ node, menu, interaction }) {
  switch (node.action) {
    case 'ask_question': {
      await interaction.reply({ content: node.question, ephemeral: false });
      pendingAnswers.set(interaction.user.id, {
        node, menu, channelId: interaction.channelId
      });
      break;
    }
    case 'send_message': {
      await interaction.reply({ content: node.message || ' ' });
      break;
    }
    case 'show_buttons': {
      const row = buildButtonRow(node.nextButtons || [], menu.id);
      await interaction.reply({
        content: node.message || ' ',
        components: node.nextButtons?.length ? [row] : []
      });
      break;
    }
    case 'open_room': {
      await openRoomFromNode({ node, interaction, answerText: '', imageUrl: null, menu });
      break;
    }
    default:
      await interaction.reply({ content: 'פעולה לא מוגדרת.', ephemeral: true });
  }
}

function fillTemplate(template, { answer, username }) {
  if (!template) return '';
  return template
    .replace(/\{answer\}/g, answer || '')
    .replace(/\{username\}/g, username || '');
}

async function openRoomFromNode({ node, interaction, answerText, imageUrl, menu }) {
  const guild = interaction.guild;
  const username = interaction.user.username;

  let category = null;
  if (node.categoryName) {
    category = guild.channels.cache.find(
      (c) => c.name === node.categoryName && c.type === ChannelType.GuildCategory
    );
    if (!category) {
      category = await guild.channels.create({
        name: node.categoryName,
        type: ChannelType.GuildCategory
      });
    }
  }

  const rawName = fillTemplate(node.roomNameTemplate, { answer: answerText, username }) || `room-${username}`;
  const safeName = sanitizeChannelName(rawName, `room-${Date.now()}`);

  const newChannel = await guild.channels.create({
    name: safeName,
    type: ChannelType.GuildText,
    parent: category ? category.id : undefined,
    topic: node.roomTopic || undefined,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  });

  const msgInRoom = fillTemplate(node.messageInRoom, { answer: answerText, username }) ||
    `שלום ${username}, החדר שלך נפתח!`;

  if (imageUrl) {
    await newChannel.send({ content: msgInRoom, files: [imageUrl] });
  } else {
    await newChannel.send({ content: msgInRoom });
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: `נפתח עבורך חדר: <#${newChannel.id}>`, ephemeral: false });
  } else {
    await interaction.reply({ content: `נפתח עבורך חדר: <#${newChannel.id}>`, ephemeral: false });
  }

  if (node.nextButtons?.length && menu) {
    const row = buildButtonRow(node.nextButtons, menu.id);
    await newChannel.send({ content: 'בחר אפשרות:', components: [row] });
  }
}

async function handleMessageForPendingAnswer(message) {
  if (message.author.bot) return;
  const pending = pendingAnswers.get(message.author.id);
  if (!pending) return;
  if (message.channelId !== pending.channelId) return;

  const { node } = pending;
  const onAnswer = node.onAnswer;
  if (!onAnswer) {
    pendingAnswers.delete(message.author.id);
    return;
  }

  const answerText = message.content || '';
  let imageUrl = null;

  if (node.expectsImage && message.attachments.size > 0) {
    const attachment = message.attachments.first();
    imageUrl = attachment.url;
  } else if (node.expectsImage && message.attachments.size === 0) {
    await message.reply('שאלה זו דורשת העלאת תמונה. אנא שלח תמונה כדי להמשיך.');
    return;
  }

  pendingAnswers.delete(message.author.id);

  const fakeInteraction = {
    guild: message.guild,
    user: message.author,
    channelId: message.channelId,
    replied: false,
    deferred: false,
    reply: async (opts) => message.channel.send(opts),
    followUp: async (opts) => message.channel.send(opts)
  };

  switch (onAnswer.action) {
    case 'open_room':
      await openRoomFromNode({ node: onAnswer, interaction: fakeInteraction, answerText, imageUrl, menu: pending.menu });
      break;
    case 'send_message':
      await message.channel.send(fillTemplate(onAnswer.message, { answer: answerText, username: message.author.username }));
      break;
    case 'show_buttons': {
      const row = buildButtonRow(onAnswer.nextButtons || [], pending.menu.id);
      await message.channel.send({
        content: onAnswer.message || 'בחר אפשרות:',
        components: onAnswer.nextButtons?.length ? [row] : []
      });
      break;
    }
  }
}

function getClient() { return client; }
function isReady() { return !!client && client.isReady(); }

async function startBot() {
  if (client) return { alreadyRunning: true };

  const config = loadConfig();
  if (!config.discordToken) {
    throw new Error('לא הוגדר טוקן דיסקורד. הזן אותו בדשבורד תחת הגדרות.');
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,      // נדרש ל-mute/unmute
      GatewayIntentBits.GuildMessageReactions,  // נדרש ל-reaction roles
      GatewayIntentBits.GuildPresences,         // נדרש לנוכחות משתמשים
      GatewayIntentBits.GuildModeration,        // נדרש ל-ban/kick events
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember]
  });

  client.once('clientReady', async () => {
    console.log(`✅ הבוט מחובר בשם: ${client.user.tag}`);
    const cfg = loadConfig();
    if (cfg.guildId) {
      await voiceEngine.registerSlashCommands(client, cfg.guildId);
      await moderationEngine.registerModerationCommands(client, cfg.guildId);
      const guild = client.guilds.cache.get(cfg.guildId);
      if (guild) {
        for (const menu of cfg.menus || []) {
          if (menu.active) {
            try {
              await sendTriggerMessage(guild, menu);
            } catch (err) {
              console.error(`שגיאה בהפעלת תפריט "${menu.name}":`, err.message);
            }
          }
        }
      }
    }
  });

  client.on('error', (err) => console.error('❌ שגיאת חיבור בוט:', err.message));
  client.on('shardError', (err) => console.error('❌ שגיאת shard:', err.message));
  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`⚠️ הבוט התנתק (shard ${shardId}). קוד: ${event?.code || 'לא ידוע'}`);
  });
  client.on('invalidated', () => {
    console.error('❌ הסשן בוטל - ייתכן שהטוקן שונה/בוטל.');
    client = null;
  });

  // ---------- Interactions ----------
  client.on('interactionCreate', async (interaction) => {
    try {
      // 1. שער אימות
      if (verifyGateEngine.isVerifyButtonInteraction(interaction)) {
        return await verifyGateEngine.handleVerifyButtonClick(interaction);
      }

      // 2. Voice commands (/mute, /unmute)
      if (voiceEngine.isVoiceCommandInteraction(interaction)) {
        return await voiceEngine.handleVoiceCommand(interaction);
      }

      // 3. פקודות מודרציה
      if (moderationEngine.isModerationCommand(interaction)) {
        return await moderationEngine.handleModerationCommand(interaction);
      }

      // 4. Ticket system
      if (ticketEngine.isTicketInteraction(interaction)) {
        return await ticketEngine.handleTicketInteraction(interaction);
      }

      // 5. Reaction Roles
      if (reactionRoleEngine.isReactionRoleInteraction(interaction)) {
        return await reactionRoleEngine.handleReactionRoleClick(interaction);
      }

      // 6. סקרים
      if (pollEngine.isPollInteraction(interaction)) {
        return await pollEngine.handlePollVote(interaction);
      }

      // 7. כפתורי תפריטים שנבנו ע"י ה-AI
      if (interaction.isButton()) {
        const cfg = loadConfig();
        await handleButtonClick(interaction, cfg.menus || []);
      }

    } catch (err) {
      console.error('שגיאה בטיפול באינטראקציה:', err);
      if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'אירעה שגיאה בביצוע הפעולה.', ephemeral: true }).catch(() => {});
      }
    }
  });

  // ---------- Messages ----------
  client.on('messageCreate', async (message) => {
    try {
      await handleMessageForPendingAnswer(message);
    } catch (err) {
      console.error('שגיאה בטיפול בתשובת משתמש:', err);
    }
  });

  // ---------- Member Join ----------
  client.on('guildMemberAdd', async (member) => {
    try {
      await welcomeEngine.handleMemberJoin(member);
      await autoRoleEngine.handleAutoRole(member);
    } catch (err) {
      console.error('שגיאה בטיפול בחבר חדש:', err.message);
    }
  });

  // ---------- Member Leave ----------
  client.on('guildMemberRemove', async (member) => {
    try {
      await leaveEngine.handleMemberLeave(member);
    } catch (err) {
      console.error('שגיאה בטיפול בעזיבת חבר:', err.message);
    }
  });

  try {
    await client.login(config.discordToken);
  } catch (err) {
    console.error('❌ נכשל החיבור לדיסקורד:', err.message);
    client = null;
    throw new Error('נכשל החיבור לדיסקורד. בדוק שהטוקן נכון. שגיאה: ' + err.message);
  }
  return { alreadyRunning: false };
}

async function stopBot() {
  if (client) {
    await client.destroy();
    client = null;
  }
}

async function publishMenu(menu) {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  await sendTriggerMessage(guild, menu);
}

async function publishTicketPanel(ticketConfig) {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  return ticketEngine.publishTicketPanel(guild, config);
}

async function createVoiceChannel(voiceConfig) {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  return voiceEngine.createLockedVoiceChannel(guild, voiceConfig);
}

async function listGuildRoles() {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  await guild.roles.fetch();
  return guild.roles.cache
    .filter((r) => r.name !== '@everyone')
    .map((r) => ({ id: r.id, name: r.name }));
}

async function previewVerifyLockdown() {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  return verifyGateEngine.previewLockdown(guild, config.verifyGate);
}

async function executeVerifyLockdown() {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  return verifyGateEngine.executeLockdown(guild, config.verifyGate);
}

async function publishReactionRolePanel(panelConfig) {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  return reactionRoleEngine.publishReactionRolePanel(guild, panelConfig);
}

async function createPoll(pollConfig) {
  if (!client || !client.isReady()) throw new Error('הבוט לא מחובר.');
  const config = loadConfig();
  if (!config.guildId) throw new Error('לא הוגדר guildId.');
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) throw new Error('הבוט אינו חבר בשרת המוגדר.');
  return pollEngine.createPoll(guild, pollConfig);
}

module.exports = {
  startBot,
  stopBot,
  isReady,
  getClient,
  publishMenu,
  publishTicketPanel,
  createVoiceChannel,
  listGuildRoles,
  previewVerifyLockdown,
  executeVerifyLockdown,
  publishReactionRolePanel,
  createPoll
};
