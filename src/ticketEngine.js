// src/ticketEngine.js
// מערכת טיקטים מלאה ותקנית, עם מבנה תיקיות (Category) נפרד לכל קטגוריה:
//
// 1. לכל קטגוריה (לדוגמה "שאלה", "תלונה") נוצרת תיקייה (Category) בשם "טיקטים - <קטגוריה>"
// 2. בתוך התיקייה נוצר ערוץ פתיחה קבוע אחד, עם כפתור "פתח טיקט"
// 3. לחיצה על הכפתור פותחת מודאל (חלון קופץ) שמבקש תיאור חופשי
// 4. בשליחה - נפתח חדר טיקט פרטי **בתוך אותה תיקייה**, עם כפתור "סגור טיקט"
// 5. בסגירה - נוצר תמליל (transcript), נשלח לערוץ לוג עם קובץ להורדה, והחדר נמחק

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const { loadConfig } = require('./configStore');

const OPEN_TICKET_BUTTON_PREFIX = 'ticket_open::';
const MODAL_PREFIX = 'ticket_modal::';
const MODAL_INPUT_ID = 'ticket_description';
const CLOSE_BUTTON_ID = 'ticket_close';

function sanitizeChannelName(rawName, fallback) {
  const safe = (rawName || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9\-_]/g, '')
    .slice(0, 90);
  return safe || fallback;
}

function sanitizeCategoryName(rawName) {
  return (rawName || 'טיקטים').trim().slice(0, 100);
}

// ---------- בניית מבנה התיקיות: תיקייה + ערוץ פתיחה לכל קטגוריה ----------

async function publishTicketPanel(guild, config) {
  const ticketConfig = config.ticketSystem;
  if (!ticketConfig || !ticketConfig.categories?.length) {
    throw new Error('יש להגדיר לפחות קטגוריה אחת למערכת הטיקטים.');
  }

  const createdCategories = [];

  for (const cat of ticketConfig.categories) {
    const categoryFolderName = sanitizeCategoryName(`טיקטים - ${cat.label}`);

    let categoryChannel = guild.channels.cache.find(
      (c) => c.name === categoryFolderName && c.type === ChannelType.GuildCategory
    );

    if (!categoryChannel) {
      categoryChannel = await guild.channels.create({
        name: categoryFolderName,
        type: ChannelType.GuildCategory
      });
    }

    const intakeChannelName = sanitizeChannelName(`פתיחת-${cat.label}`, `פתיחת-${cat.id}`);

    let intakeChannel = guild.channels.cache.find(
      (c) => c.name === intakeChannelName && c.parentId === categoryChannel.id
    );

    if (!intakeChannel) {
      intakeChannel = await guild.channels.create({
        name: intakeChannelName,
        type: ChannelType.GuildText,
        parent: categoryChannel.id,
        topic: `ערוץ פתיחת טיקט לקטגוריית "${cat.label}" - נוצר אוטומטית`
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(OPEN_TICKET_BUTTON_PREFIX + cat.id)
          .setLabel(`פתח טיקט - ${cat.label}`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(cat.emoji || '🎫')
      );

      await intakeChannel.send({
        content: cat.description
          ? `${cat.description}\n\nלחץ על הכפתור למטה כדי לפתוח טיקט בקטגוריה זו:`
          : `לחץ על הכפתור למטה כדי לפתוח טיקט בקטגוריה "${cat.label}":`,
        components: [row]
      });
    }

    createdCategories.push({ categoryName: categoryFolderName, intakeChannelName });
  }

  return createdCategories;
}

// ---------- טיפול בלחיצת כפתור "פתח טיקט" -> פתיחת מודאל ----------

async function handleOpenTicketButton(interaction) {
  const categoryId = interaction.customId.replace(OPEN_TICKET_BUTTON_PREFIX, '');
  const config = loadConfig();
  const category = config.ticketSystem?.categories?.find((c) => c.id === categoryId);

  if (!category) {
    return interaction.reply({ content: 'קטגוריה זו אינה קיימת יותר.', ephemeral: true });
  }

  // תיקון: LabelBuilder לא קיים ב-discord.js 14 - משתמשים ב-TextInputBuilder ישירות
  const modal = new ModalBuilder()
    .setCustomId(MODAL_PREFIX + categoryId)
    .setTitle(category.label.slice(0, 45));

  const descInput = new TextInputBuilder()
    .setCustomId(MODAL_INPUT_ID)
    .setLabel('מה תרצה להגיד?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('תאר בקצרה את הבעיה / הפנייה שלך...')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(descInput)
  );

  await interaction.showModal(modal);
}

// ---------- טיפול בשליחת המודאל -> פתיחת חדר הטיקט ----------

async function handleModalSubmit(interaction) {
  const categoryId = interaction.customId.replace(MODAL_PREFIX, '');
  const config = loadConfig();
  const category = config.ticketSystem?.categories?.find((c) => c.id === categoryId);

  if (!category) {
    return interaction.reply({ content: 'קטגוריה זו אינה קיימת יותר.', ephemeral: true });
  }

  const description = interaction.fields.getTextInputValue(MODAL_INPUT_ID);
  const guild = interaction.guild;
  const user = interaction.user;

  await interaction.deferReply({ ephemeral: true });

  const categoryFolderName = sanitizeCategoryName(`טיקטים - ${category.label}`);
  let categoryChannel = guild.channels.cache.find(
    (c) => c.name === categoryFolderName && c.type === ChannelType.GuildCategory
  );
  if (!categoryChannel) {
    categoryChannel = await guild.channels.create({
      name: categoryFolderName,
      type: ChannelType.GuildCategory
    });
  }

  const channelName = sanitizeChannelName(`טיקט-${user.username}`, `ticket-${Date.now()}`);

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryChannel.id,
    topic: `טיקט מאת ${user.tag} | קטגוריה: ${category.label}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  });

  if (config.ticketSystem.staffRoleIds?.length) {
    for (const roleId of config.ticketSystem.staffRoleIds) {
      try {
        await ticketChannel.permissionOverwrites.create(roleId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
      } catch (err) {
        console.warn(`לא ניתן להוסיף הרשאה לתפקיד ${roleId}:`, err.message);
      }
    }
  }

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_BUTTON_ID)
      .setLabel('סגור טיקט')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );

  await ticketChannel.send({
    content: `שלום <@${user.id}>! פתחת טיקט בנושא **${category.label}**.\n\nתיאור הפנייה:\n${description}\n\nצוות התמיכה יענה כאן בהקדם.`,
    components: [closeRow]
  });

  await interaction.editReply({ content: `הטיקט שלך נפתח: <#${ticketChannel.id}>` });
}

// ---------- סגירת טיקט: יצירת תמליל ושליחתו ללוג, ומחיקת החדר ----------

async function buildTranscript(channel) {
  let allMessages = [];
  let lastId = null;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;
    allMessages = allMessages.concat(Array.from(batch.values()));
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  allMessages.reverse();

  const lines = allMessages.map((m) => {
    const time = m.createdAt.toLocaleString('he-IL');
    const author = m.author?.tag || 'לא ידוע';
    const content = m.content || '(הודעה ריקה / קובץ מצורף)';
    const attachments = m.attachments?.size
      ? '\n  קבצים מצורפים: ' + Array.from(m.attachments.values()).map((a) => a.url).join(', ')
      : '';
    return `[${time}] ${author}: ${content}${attachments}`;
  });

  const header = `תמליל טיקט: ${channel.name}\nנוצר בתאריך: ${new Date().toLocaleString('he-IL')}\nסך הודעות: ${allMessages.length}\n${'='.repeat(50)}\n\n`;

  return header + lines.join('\n');
}

async function handleCloseTicket(interaction) {
  const config = loadConfig();
  const channel = interaction.channel;
  const guild = interaction.guild;

  await interaction.reply({ content: 'סוגר את הטיקט ומכין תמליל... החדר יימחק בעוד מספר שניות.' });

  const transcriptText = await buildTranscript(channel);
  const buffer = Buffer.from(transcriptText, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

  const logChannelName = config.ticketSystem?.logChannelName;
  if (logChannelName) {
    const safeLogName = sanitizeChannelName(logChannelName, 'ticket-logs');
    let logChannel = guild.channels.cache.find(
      (c) => c.name === safeLogName && c.type === ChannelType.GuildText
    );
    if (!logChannel) {
      logChannel = await guild.channels.create({
        name: safeLogName,
        type: ChannelType.GuildText,
        topic: 'לוג טיקטים שנסגרו - נוצר אוטומטית'
      });
    }

    await logChannel.send({
      content: `טיקט נסגר: **${channel.name}**\nנסגר על ידי: <@${interaction.user.id}>\nתאריך: ${new Date().toLocaleString('he-IL')}`,
      files: [attachment]
    });
  }

  setTimeout(async () => {
    try {
      await channel.delete('טיקט נסגר');
    } catch (err) {
      console.error('שגיאה במחיקת ערוץ הטיקט:', err.message);
    }
  }, 4000);
}

// ---------- נקודת כניסה ראשית לכל interaction שקשור לטיקטים ----------

async function handleTicketInteraction(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith(OPEN_TICKET_BUTTON_PREFIX)) {
    return handleOpenTicketButton(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX)) {
    return handleModalSubmit(interaction);
  }
  if (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID) {
    return handleCloseTicket(interaction);
  }
  return false;
}

function isTicketInteraction(interaction) {
  return (
    (interaction.isButton() && interaction.customId.startsWith(OPEN_TICKET_BUTTON_PREFIX)) ||
    (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX)) ||
    (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID)
  );
}

module.exports = {
  publishTicketPanel,
  handleTicketInteraction,
  isTicketInteraction
};
