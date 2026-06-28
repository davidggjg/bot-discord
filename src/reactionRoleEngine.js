// src/reactionRoleEngine.js
// מערכת Reaction Roles: משתמש מגיב לאמוג'י על הודעה מוגדרת -> מקבל/מאבד תפקיד.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { loadConfig, updateConfig } = require('./configStore');

const REACTION_ROLE_PREFIX = 'rr::';

// ---------- פרסום לוח Reaction Roles עם כפתורים ----------

async function publishReactionRolePanel(guild, panelConfig) {
  const { channelName, title, description, roles } = panelConfig;

  if (!roles || roles.length === 0) {
    throw new Error('יש להגדיר לפחות תפקיד אחד בלוח ה-Reaction Roles.');
  }

  let channel = guild.channels.cache.find(
    (c) => c.name === channelName && c.type === ChannelType.GuildText
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: 'לוח Reaction Roles - קבל תפקידים בלחיצה'
    });
  }

  // חלק הכפתורים ל-rows של 5 (הגבלת דיסקורד)
  const rows = [];
  for (let i = 0; i < roles.length; i += 5) {
    const row = new ActionRowBuilder();
    const chunk = roles.slice(i, i + 5);
    for (const role of chunk) {
      const btn = new ButtonBuilder()
        .setCustomId(`${REACTION_ROLE_PREFIX}${role.roleId}`)
        .setLabel(role.label || role.roleId)
        .setStyle(ButtonStyle.Secondary);
      if (role.emoji) btn.setEmoji(role.emoji);
      row.addComponents(btn);
    }
    rows.push(row);
  }

  const msg = await channel.send({
    content: `**${title || 'בחר תפקידים'}**\n${description || 'לחץ על כפתור כדי לקבל את התפקיד. לחץ שוב להסרה.'}`,
    components: rows
  });

  return { channelId: channel.id, messageId: msg.id };
}

// ---------- טיפול בלחיצת כפתור Reaction Role ----------

async function handleReactionRoleClick(interaction) {
  const roleId = interaction.customId.replace(REACTION_ROLE_PREFIX, '');
  const member = interaction.member;
  const guild = interaction.guild;

  try {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({ content: 'התפקיד הזה לא קיים יותר. פנה לאדמין.', ephemeral: true });
    }

    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Reaction Role - הוסר על ידי המשתמש');
      return interaction.reply({ content: `הוסר ממך התפקיד: **${role.name}**`, ephemeral: true });
    } else {
      await member.roles.add(roleId, 'Reaction Role - נוסף על ידי המשתמש');
      return interaction.reply({ content: `קיבלת את התפקיד: **${role.name}** 🎉`, ephemeral: true });
    }
  } catch (err) {
    console.error('שגיאה ב-Reaction Role:', err.message);
    return interaction.reply({
      content: 'אירעה שגיאה. ודא שלבוט יש הרשאת Manage Roles ושהתפקיד שלו גבוה מהתפקיד הנבחר.',
      ephemeral: true
    });
  }
}

function isReactionRoleInteraction(interaction) {
  return interaction.isButton?.() && interaction.customId.startsWith(REACTION_ROLE_PREFIX);
}

module.exports = {
  publishReactionRolePanel,
  handleReactionRoleClick,
  isReactionRoleInteraction
};
