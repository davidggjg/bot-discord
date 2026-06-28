// src/leaveEngine.js
// מאזין לאירוע עזיבת חבר מהשרת (GuildMemberRemove) ושולח הודעת פרידה.

const { ChannelType } = require('discord.js');
const { loadConfig } = require('./configStore');

function sanitizeChannelName(rawName, fallback) {
  const safe = (rawName || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9\-_]/g, '')
    .slice(0, 90);
  return safe || fallback;
}

function fillTemplate(template, member) {
  return (template || 'להתראות, {username}!')
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name);
}

async function handleMemberLeave(member) {
  const config = loadConfig();
  const leaveConfig = config.leaveSystem;

  if (!leaveConfig?.enabled) return;

  const guild = member.guild;
  const channelName = sanitizeChannelName(leaveConfig.channelName, 'ברוכים-הבאים');

  let channel = guild.channels.cache.find(
    (c) => c.name === channelName && c.type === ChannelType.GuildText
  );

  if (!channel) return; // לא יוצרים ערוץ לעזיבה - אם לא קיים, פשוט מדלגים

  const message = fillTemplate(leaveConfig.messageTemplate, member);

  try {
    await channel.send({ content: message });
  } catch (err) {
    console.error('שגיאה בשליחת הודעת עזיבה:', err.message);
  }
}

module.exports = { handleMemberLeave };
