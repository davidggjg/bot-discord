// src/verifyGateEngine.js
// נועל את כל הערוצים הקיימים בשרת מ-@everyone, יוצר/משתמש בתפקיד "מאומת",
// ומציב ערוץ אימות יחיד עם כפתור - לחיצה עליו נותנת את התפקיד ופותחת את שאר השרת.

const { ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadConfig, updateConfig } = require('./configStore');

const VERIFY_BUTTON_ID = 'verify_gate_confirm';

function sanitizeChannelName(rawName, fallback) {
  const safe = (rawName || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9\-_]/g, '')
    .slice(0, 90);
  return safe || fallback;
}

// ---------- שלב תצוגה מקדימה: מה ייקרה, בלי לבצע שינוי אמיתי ----------

async function previewLockdown(guild, verifyConfig) {
  const verifyChannelName = sanitizeChannelName(verifyConfig.verifyChannelName, 'verify');

  const allChannels = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice
  );

  const channelsToLock = allChannels.filter((c) => c.name !== verifyChannelName);

  return {
    totalChannels: allChannels.size,
    channelsToLockCount: channelsToLock.size,
    channelNames: channelsToLock.map((c) => c.name),
    verifyChannelName,
    roleName: verifyConfig.verifiedRoleName || 'מאומת'
  };
}

// ---------- ביצוע בפועל: נעילה + יצירת ערוץ אימות ----------

async function executeLockdown(guild, verifyConfig) {
  // שלב 1: מצא או צור את תפקיד "מאומת"
  const roleName = verifyConfig.verifiedRoleName || 'מאומת';
  let verifiedRole = guild.roles.cache.find((r) => r.name === roleName);

  if (!verifiedRole) {
    verifiedRole = await guild.roles.create({
      name: roleName,
      reason: 'תפקיד אימות - נוצר אוטומטית ע"י מערכת שער האימות',
      mentionable: false
    });
  }

  // שלב 2: וודא שהתפקיד קיים ב-cache לאחר היצירה
  await guild.roles.fetch();

  // שלב 3: נעל כל ערוץ קיים (טקסט, קולי, קטגוריה) מלבד ערוץ האימות
  const verifyChannelName = sanitizeChannelName(verifyConfig.verifyChannelName, 'verify');
  const allChannels = Array.from(
    guild.channels.cache
      .filter((c) =>
        c.type === ChannelType.GuildText ||
        c.type === ChannelType.GuildVoice ||
        c.type === ChannelType.GuildCategory ||
        c.type === ChannelType.GuildForum ||
        c.type === ChannelType.GuildAnnouncement
      )
      .values()
  );

  let lockedCount = 0;
  const errors = [];

  for (const channel of allChannels) {
    if (channel.name === verifyChannelName) continue;
    try {
      // @everyone לא רואה את הערוץ
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false
      });
      // תפקיד "מאומת" רואה את הערוץ
      await channel.permissionOverwrites.edit(verifiedRole, {
        ViewChannel: true
      });
      lockedCount++;
    } catch (err) {
      errors.push(`${channel.name}: ${err.message}`);
    }
  }

  // שלב 4: צור (או מצא ועדכן) את ערוץ האימות - חייב להיות גלוי ל-@everyone בלבד
  let verifyChannel = guild.channels.cache.find(
    (c) => c.name === verifyChannelName && c.type === ChannelType.GuildText
  );

  if (!verifyChannel) {
    verifyChannel = await guild.channels.create({
      name: verifyChannelName,
      type: ChannelType.GuildText,
      topic: 'ערוץ אימות - נוצר אוטומטית ע"י מערכת שער האימות',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
          deny: [PermissionsBitField.Flags.SendMessages]
        },
        {
          id: verifiedRole.id,
          // תפקיד "מאומת" לא צריך לראות את ערוץ האימות לאחר שאומת
          deny: [PermissionsBitField.Flags.ViewChannel]
        }
      ]
    });
  } else {
    // ערוץ האימות קיים - עדכן הרשאות
    await verifyChannel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: true,
      SendMessages: false
    });
    await verifyChannel.permissionOverwrites.edit(verifiedRole, {
      ViewChannel: false
    });
  }

  // שלב 5: שלח את הודעת/כפתור האימות
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel(verifyConfig.buttonLabel || 'אישור / Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );

  await verifyChannel.send({
    content: verifyConfig.verifyMessage || 'לחץ על הכפתור כדי לאשר שאתה אנושי ולקבל גישה לכל ערוצי השרת.',
    components: [row]
  });

  return {
    verifiedRoleId: verifiedRole.id,
    lockedCount,
    totalAttempted: allChannels.length - 1,
    errors
  };
}

// ---------- טיפול בלחיצת כפתור האימות ----------

async function handleVerifyButtonClick(interaction) {
  const config = loadConfig();
  const verifyConfig = config.verifyGate;

  if (!verifyConfig?.verifiedRoleId) {
    return interaction.reply({ content: 'מערכת האימות לא הופעלה כראוי. פנה לאדמין.', ephemeral: true });
  }

  const member = interaction.member;

  if (member.roles.cache.has(verifyConfig.verifiedRoleId)) {
    return interaction.reply({ content: 'אתה כבר מאומת! 😊', ephemeral: true });
  }

  try {
    await member.roles.add(verifyConfig.verifiedRoleId, 'אימות אוטומטי באמצעות כפתור');
    await interaction.reply({ content: verifyConfig.successMessage || 'אומתת בהצלחה! כל הערוצים בשרת נפתחו לך. 🎉', ephemeral: true });
  } catch (err) {
    console.error('שגיאה בהענקת תפקיד אימות:', err.message);
    await interaction.reply({
      content: 'אירעה שגיאה באימות. ודא שתפקיד הבוט נמצא גבוה יותר בהיררכיה מתפקיד "מאומת".',
      ephemeral: true
    });
  }
}

function isVerifyButtonInteraction(interaction) {
  return interaction.isButton?.() && interaction.customId === VERIFY_BUTTON_ID;
}

module.exports = {
  previewLockdown,
  executeLockdown,
  handleVerifyButtonClick,
  isVerifyButtonInteraction
};
