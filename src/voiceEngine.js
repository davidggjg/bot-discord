// src/voiceEngine.js
// בונה חדרים קוליים נעולים לפי תפקיד (Role), עם השתקה כברירת מחדל למי שאינו בדרגה הגבוהה,
// ופקודות סלאש (/mute, /unmute) לאדמינים לאשר דיבור בפועל.

const { ChannelType, PermissionsBitField, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { loadConfig, updateConfig } = require('./configStore');

function sanitizeChannelName(rawName, fallback) {
  const safe = (rawName || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9\-_]/g, '')
    .slice(0, 90);
  return safe || fallback;
}

// ---------- בניית חדר קולי נעול ----------

async function createLockedVoiceChannel(guild, voiceConfig) {
  const { channelName, allowedRoleIds, muteByDefault, categoryFolderName } = voiceConfig;

  if (!allowedRoleIds?.length) {
    throw new Error('יש לבחור לפחות תפקיד אחד שמורשה להיכנס לחדר.');
  }

  let category = null;
  if (categoryFolderName) {
    category = guild.channels.cache.find(
      (c) => c.name === categoryFolderName && c.type === ChannelType.GuildCategory
    );
    if (!category) {
      category = await guild.channels.create({
        name: categoryFolderName,
        type: ChannelType.GuildCategory
      });
    }
  }

  const channelNameSafe = sanitizeChannelName(channelName, `voice-${Date.now()}`);

  // הרשאות: @everyone לא רואה את הערוץ בכלל. כל תפקיד מורשה מקבל Connect + View.
  // אם muteByDefault מסומן - גם Speak נדחה כברירת מחדל, ואדמין צריך לאשר דיבור בנפרד (/unmute).
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
    }
  ];

  for (const roleId of allowedRoleIds) {
    const allow = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect];
    const deny = [];
    if (muteByDefault) {
      deny.push(PermissionsBitField.Flags.Speak);
    } else {
      allow.push(PermissionsBitField.Flags.Speak);
    }
    overwrites.push({ id: roleId, allow, deny });
  }

  const channel = await guild.channels.create({
    name: channelNameSafe,
    type: ChannelType.GuildVoice,
    parent: category ? category.id : undefined,
    permissionOverwrites: overwrites
  });

  return channel;
}

// ---------- פקודות סלאש: /unmute /mute ----------

function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('מאשר למשתמש לדבר בחדר הקולי הנעול הנוכחי')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('המשתמש שיקבל אישור דיבור').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('משתיק משתמש בחדר הקולי הנעול הנוכחי')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('המשתמש שיושתק').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers)
  ].map((cmd) => cmd.toJSON());
}

async function registerSlashCommands(client, guildId) {
  if (!guildId) return;
  try {
    const rest = new REST().setToken(client.token);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: buildSlashCommands() }
    );
    console.log('✅ פקודות הסלאש /mute ו-/unmute נרשמו בהצלחה בשרת.');
  } catch (err) {
    console.error('❌ שגיאה ברישום פקודות הסלאש:', err.message);
  }
}

// ---------- טיפול בהפעלת /mute ו-/unmute ----------

async function handleVoiceCommand(interaction) {
  const targetUser = interaction.options.getUser('user');
  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    return interaction.reply({ content: 'לא מצאתי את המשתמש הזה בשרת.', ephemeral: true });
  }

  if (!member.voice?.channel) {
    return interaction.reply({ content: 'המשתמש הזה לא נמצא כרגע בחדר קולי.', ephemeral: true });
  }

  const shouldMute = interaction.commandName === 'mute';

  try {
    await member.voice.setMute(shouldMute, `הופעל ע"י ${interaction.user.tag} באמצעות /${interaction.commandName}`);
    await interaction.reply({
      content: shouldMute
        ? `🔇 ${member.user.tag} הושתק בחדר הקולי.`
        : `🔊 ${member.user.tag} קיבל אישור לדבר בחדר הקולי.`,
      ephemeral: false
    });
  } catch (err) {
    console.error('שגיאה בהשתקה/הסרת השתקה:', err.message);
    await interaction.reply({
      content: 'אירעה שגיאה. ודא שלבוט יש הרשאת Mute Members בשרת, ושהתפקיד שלו גבוה מהתפקיד של המשתמש.',
      ephemeral: true
    });
  }
}

function isVoiceCommandInteraction(interaction) {
  return interaction.isChatInputCommand?.() &&
    (interaction.commandName === 'mute' || interaction.commandName === 'unmute');
}

module.exports = {
  createLockedVoiceChannel,
  registerSlashCommands,
  handleVoiceCommand,
  isVoiceCommandInteraction
};
