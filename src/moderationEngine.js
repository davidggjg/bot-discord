// src/moderationEngine.js
// פקודות מודרציה: /ban, /kick, /warn, /timeout, /unwarn, /warnings
// כולל מערכת אזהרות עם שמירה לקובץ ההגדרות.

const { SlashCommandBuilder, REST, Routes, PermissionsBitField } = require('discord.js');
const { loadConfig, updateConfig } = require('./configStore');

// ---------- בניית פקודות הסלאש למודרציה ----------

function buildModerationCommands() {
  return [
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('מרחיק משתמש מהשרת לצמיתות')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('סיבה').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('מסלק משתמש מהשרת')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('סיבה').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),

    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('משתק משתמש לפרק זמן (דקות)')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .addIntegerOption(opt => opt.setName('minutes').setDescription('כמה דקות (1-40320)').setMinValue(1).setMaxValue(40320).setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('סיבה').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('untimeout')
      .setDescription('מסיר timeout ממשתמש')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('מזהיר משתמש ושומר אזהרה')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('סיבה').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('מציג את כל האזהרות של משתמש')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription('מנקה את כל האזהרות של משתמש')
      .addUserOption(opt => opt.setName('user').setDescription('המשתמש').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('מוחק X הודעות אחרונות בערוץ')
      .addIntegerOption(opt => opt.setName('amount').setDescription('כמות הודעות (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
      .addUserOption(opt => opt.setName('user').setDescription('סינון לפי משתמש מסוים (אופציונלי)').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

  ].map(cmd => cmd.toJSON());
}

async function registerModerationCommands(client, guildId) {
  if (!guildId) return;
  try {
    const rest = new REST().setToken(client.token);
    const existing = await rest.get(Routes.applicationGuildCommands(client.user.id, guildId));
    const modCmds = buildModerationCommands();
    const merged = [...existing, ...modCmds];
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: merged });
    console.log('✅ פקודות מודרציה נרשמו בהצלחה.');
  } catch (err) {
    console.error('❌ שגיאה ברישום פקודות מודרציה:', err.message);
  }
}

// ---------- שמירת אזהרות ----------

function getWarnings(userId, guildId) {
  const config = loadConfig();
  return (config.warnings || {})[`${guildId}_${userId}`] || [];
}

function addWarning(userId, guildId, reason, moderatorTag) {
  const config = loadConfig();
  const key = `${guildId}_${userId}`;
  const warnings = config.warnings || {};
  if (!warnings[key]) warnings[key] = [];
  warnings[key].push({
    reason,
    moderatorTag,
    timestamp: new Date().toISOString()
  });
  updateConfig({ warnings });
  return warnings[key];
}

function clearWarnings(userId, guildId) {
  const config = loadConfig();
  const warnings = config.warnings || {};
  delete warnings[`${guildId}_${userId}`];
  updateConfig({ warnings });
}

// ---------- טיפול בפקודות ----------

async function handleModerationCommand(interaction) {
  const cmd = interaction.commandName;
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'לא צוינה סיבה';
  const guild = interaction.guild;

  switch (cmd) {
    case 'ban': {
      try {
        await guild.members.ban(targetUser.id, { reason, deleteMessageSeconds: 86400 });
        await interaction.reply({ content: `🔨 **${targetUser.tag}** הורחק לצמיתות מהשרת.\nסיבה: ${reason}` });
      } catch (err) {
        await interaction.reply({ content: `שגיאה: ${err.message}`, ephemeral: true });
      }
      break;
    }

    case 'kick': {
      try {
        const member = await guild.members.fetch(targetUser.id);
        await member.kick(reason);
        await interaction.reply({ content: `👢 **${targetUser.tag}** סולק מהשרת.\nסיבה: ${reason}` });
      } catch (err) {
        await interaction.reply({ content: `שגיאה: ${err.message}`, ephemeral: true });
      }
      break;
    }

    case 'timeout': {
      try {
        const minutes = interaction.options.getInteger('minutes');
        const member = await guild.members.fetch(targetUser.id);
        await member.timeout(minutes * 60 * 1000, reason);
        await interaction.reply({ content: `⏰ **${targetUser.tag}** הושתק למשך ${minutes} דקות.\nסיבה: ${reason}` });
      } catch (err) {
        await interaction.reply({ content: `שגיאה: ${err.message}`, ephemeral: true });
      }
      break;
    }

    case 'untimeout': {
      try {
        const member = await guild.members.fetch(targetUser.id);
        await member.timeout(null);
        await interaction.reply({ content: `✅ ה-Timeout של **${targetUser.tag}** הוסר.` });
      } catch (err) {
        await interaction.reply({ content: `שגיאה: ${err.message}`, ephemeral: true });
      }
      break;
    }

    case 'warn': {
      const allWarnings = addWarning(targetUser.id, guild.id, reason, interaction.user.tag);
      await interaction.reply({
        content: `⚠️ **${targetUser.tag}** קיבל אזהרה (${allWarnings.length} סה"כ).\nסיבה: ${reason}`
      });
      // ניסיון לשלוח DM למשתמש
      try {
        await targetUser.send(`⚠️ קיבלת אזהרה בשרת **${guild.name}**.\nסיבה: ${reason}`);
      } catch (_) { /* DMs סגורים */ }
      break;
    }

    case 'warnings': {
      const warns = getWarnings(targetUser.id, guild.id);
      if (!warns.length) {
        return interaction.reply({ content: `✅ ל-**${targetUser.tag}** אין אזהרות.`, ephemeral: true });
      }
      const list = warns.map((w, i) =>
        `${i + 1}. ${w.reason} (ע"י ${w.moderatorTag} - ${new Date(w.timestamp).toLocaleDateString('he-IL')})`
      ).join('\n');
      await interaction.reply({ content: `⚠️ אזהרות של **${targetUser.tag}** (${warns.length}):\n${list}`, ephemeral: true });
      break;
    }

    case 'clearwarnings': {
      clearWarnings(targetUser.id, guild.id);
      await interaction.reply({ content: `✅ האזהרות של **${targetUser.tag}** נוקו.` });
      break;
    }

    case 'purge': {
      const amount = interaction.options.getInteger('amount');
      const filterUser = interaction.options.getUser('user');
      try {
        let messages = await interaction.channel.messages.fetch({ limit: 100 });
        if (filterUser) {
          messages = messages.filter(m => m.author.id === filterUser.id);
        }
        const toDelete = [...messages.values()].slice(0, amount);
        await interaction.channel.bulkDelete(toDelete, true);
        await interaction.reply({ content: `🗑️ נמחקו ${toDelete.length} הודעות.`, ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `שגיאה: ${err.message}`, ephemeral: true });
      }
      break;
    }
  }
}

const MODERATION_COMMANDS = ['ban', 'kick', 'timeout', 'untimeout', 'warn', 'warnings', 'clearwarnings', 'purge'];

function isModerationCommand(interaction) {
  return interaction.isChatInputCommand?.() && MODERATION_COMMANDS.includes(interaction.commandName);
}

module.exports = {
  buildModerationCommands,
  registerModerationCommands,
  handleModerationCommand,
  isModerationCommand
};
