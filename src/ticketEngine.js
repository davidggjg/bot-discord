// src/ticketEngine.js - מערכת טיקטים קבועה ומוגדרת מראש
// זרימה: כפתור "פתח טיקט" → בחירת סוג (5 כפתורים) → מודאל סיבה → חדר פרטי בקטגוריה

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionsBitField, ModalBuilder,
  TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require('discord.js');

const { loadConfig, updateConfig } = require('./configStore');

// ---------- הגדרות קבועות ----------

const TICKET_CATEGORIES = [
  { id: 'admin',   label: 'דיווח על אדמין',   emoji: '🛡️', color: ButtonStyle.Danger },
  { id: 'player',  label: 'דיווח על שחקן',    emoji: '⚔️', color: ButtonStyle.Danger },
  { id: 'general', label: 'שאלה כללית',        emoji: '❓', color: ButtonStyle.Primary },
  { id: 'bug',     label: 'תלונה על באג',      emoji: '🐛', color: ButtonStyle.Secondary },
  { id: 'help',    label: 'עזרה',              emoji: '🆘', color: ButtonStyle.Success },
];

const STAFF_ROLE_NAMES = ['צוות תמיכה', 'מנהל', 'אדמין', 'Admin', 'Moderator', 'Mod'];

const OPEN_BTN_ID    = 'ticket_open_main';
const CAT_PREFIX     = 'ticket_cat::';
const MODAL_PREFIX   = 'ticket_modal::';
const MODAL_INPUT_ID = 'ticket_reason';
const CLOSE_BTN_ID   = 'ticket_close';

// ---------- עזרים ----------

function safeName(str) {
  return (str || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9\-_]/g, '')
    .slice(0, 90) || 'ticket';
}

function getStaffRoles(guild) {
  return guild.roles.cache.filter(r =>
    STAFF_ROLE_NAMES.some(name => r.name === name)
  );
}

// ---------- פרסום פאנל טיקטים ----------

async function publishTicketPanel(guild) {
  let channel = guild.channels.cache.find(
    c => c.name === 'פתיחת-טיקט' && c.type === ChannelType.GuildText
  );
  if (!channel) {
    channel = await guild.channels.create({
      name: 'פתיחת-טיקט',
      type: ChannelType.GuildText,
      topic: 'לחץ על הכפתור למטה לפתיחת טיקט תמיכה'
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPEN_BTN_ID)
      .setLabel('פתח טיקט 🎫')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: '**מערכת תמיכה**\nלחץ על הכפתור למטה כדי לפתוח טיקט. צוות התמיכה יענה בהקדם.',
    components: [row]
  });

  for (const cat of TICKET_CATEGORIES) {
    const catName = `טיקטים - ${cat.label}`;
    let category = guild.channels.cache.find(
      c => c.name === catName && c.type === ChannelType.GuildCategory
    );
    if (!category) {
      category = await guild.channels.create({
        name: catName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });
    }
  }

  return { channelId: channel.id };
}

// ---------- שלב 1: כפתור "פתח טיקט" → 5 כפתורי בחירה ----------

async function handleOpenMainButton(interaction) {
  const row1 = new ActionRowBuilder().addComponents(
    ...TICKET_CATEGORIES.slice(0, 3).map(cat =>
      new ButtonBuilder()
        .setCustomId(CAT_PREFIX + cat.id)
        .setLabel(`${cat.emoji} ${cat.label}`)
        .setStyle(cat.color)
    )
  );
  const row2 = new ActionRowBuilder().addComponents(
    ...TICKET_CATEGORIES.slice(3).map(cat =>
      new ButtonBuilder()
        .setCustomId(CAT_PREFIX + cat.id)
        .setLabel(`${cat.emoji} ${cat.label}`)
        .setStyle(cat.color)
    )
  );

  await interaction.reply({
    content: '**בחר את סוג הטיקט:**',
    components: [row1, row2],
    ephemeral: true
  });
}

// ---------- שלב 2: בחירת קטגוריה → מודאל עם שדה סיבה ----------

async function handleCategoryButton(interaction) {
  const catId = interaction.customId.replace(CAT_PREFIX, '');
  const cat = TICKET_CATEGORIES.find(c => c.id === catId);
  if (!cat) return interaction.reply({ content: 'קטגוריה לא קיימת.', ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(MODAL_PREFIX + catId)
    .setTitle(`${cat.emoji} ${cat.label}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId(MODAL_INPUT_ID)
    .setLabel('תאר את הסיבה לפתיחת הטיקט')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('כתוב כאן בפירוט...')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

// ---------- שלב 3: שליחת מודאל → חדר פרטי בקטגוריה ----------

async function handleModalSubmit(interaction) {
  const catId = interaction.customId.replace(MODAL_PREFIX, '');
  const cat = TICKET_CATEGORIES.find(c => c.id === catId);
  if (!cat) return interaction.reply({ content: 'קטגוריה לא קיימת.', ephemeral: true });

  const reason = interaction.fields.getTextInputValue(MODAL_INPUT_ID);
  const guild = interaction.guild;
  const user = interaction.user;

  await interaction.deferReply({ ephemeral: true });

  const catName = `טיקטים - ${cat.label}`;
  let category = guild.channels.cache.find(
    c => c.name === catName && c.type === ChannelType.GuildCategory
  );
  if (!category) {
    category = await guild.channels.create({
      name: catName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] }
      ]
    });
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  const staffRoles = getStaffRoles(guild);
  staffRoles.forEach(role => {
    overwrites.push({
      id: role.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  });

  const channelName = safeName(`טיקט-${user.username}-${catId}`);
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `טיקט של ${user.tag} | ${cat.label}`,
    permissionOverwrites: overwrites
  });

  const staffMention = staffRoles.size > 0
    ? staffRoles.map(r => `<@&${r.id}>`).join(' ')
    : '';

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_BTN_ID)
      .setLabel('סגור טיקט 🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: [
      `${cat.emoji} **טיקט חדש — ${cat.label}**`,
      `👤 פתוח על ידי: <@${user.id}>`,
      `📝 סיבה: ${reason}`,
      staffMention ? `\n📢 ${staffMention} יש טיקט חדש הממתין לטיפול.` : ''
    ].filter(Boolean).join('\n'),
    components: [closeRow]
  });

  await interaction.editReply({
    content: `✅ הטיקט שלך נפתח! <#${ticketChannel.id}>\nצוות התמיכה יענה בהקדם.`
  });
}

// ---------- סגירת טיקט ----------

async function handleCloseTicket(interaction) {
  const channel = interaction.channel;
  await interaction.reply({ content: '🔒 הטיקט נסגר. החדר יימחק בעוד 5 שניות.' });

  try {
    let messages = [];
    let lastId = null;
    while (true) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;
      const batch = await channel.messages.fetch(opts);
      if (!batch.size) break;
      messages = messages.concat(Array.from(batch.values()));
      lastId = batch.last().id;
      if (batch.size < 100) break;
    }
    messages.reverse();

    const transcript = messages.map(m =>
      `[${m.createdAt.toLocaleString('he-IL')}] ${m.author?.tag}: ${m.content || '(קובץ)'}`
    ).join('\n');

    const buffer = Buffer.from(`תמליל: ${channel.name}\n${'='.repeat(40)}\n\n${transcript}`, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}.txt` });

    const guild = interaction.guild;
    let logChannel = guild.channels.cache.find(
      c => c.name === 'ticket-logs' && c.type === ChannelType.GuildText
    );
    if (!logChannel) {
      logChannel = await guild.channels.create({ name: 'ticket-logs', type: ChannelType.GuildText });
    }
    await logChannel.send({
      content: `📁 טיקט נסגר: **${channel.name}** | נסגר ע"י <@${interaction.user.id}>`,
      files: [attachment]
    });
  } catch (err) {
    console.error('שגיאה ביצירת תמליל:', err.message);
  }

  setTimeout(async () => {
    try { await channel.delete(); } catch (_) {}
  }, 5000);
}

// ---------- ניתוב ----------

function isTicketInteraction(interaction) {
  return (
    (interaction.isButton() && interaction.customId === OPEN_BTN_ID) ||
    (interaction.isButton() && interaction.customId.startsWith(CAT_PREFIX)) ||
    (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX)) ||
    (interaction.isButton() && interaction.customId === CLOSE_BTN_ID)
  );
}

async function handleTicketInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === OPEN_BTN_ID)
    return handleOpenMainButton(interaction);
  if (interaction.isButton() && interaction.customId.startsWith(CAT_PREFIX))
    return handleCategoryButton(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX))
    return handleModalSubmit(interaction);
  if (interaction.isButton() && interaction.customId === CLOSE_BTN_ID)
    return handleCloseTicket(interaction);
}

module.exports = { publishTicketPanel, handleTicketInteraction, isTicketInteraction };
