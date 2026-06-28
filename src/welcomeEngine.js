// src/welcomeEngine.js
// מאזין לאירוע הצטרפות חבר חדש ושולח הודעת ברוך הבא עם תיוג.
// דורש Server Members Intent מופעל (גם בקוד וגם בפורטל המפתחים).
//
// משתנים בתבנית ההודעה:
//   {user}     → תיוג ישיר של המשתמש (@mention)
//   {username} → שם המשתמש בלי תיוג
//   {server}   → שם השרת

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
  return (template || 'ברוך הבא לשרת, {user}! 🎉')
    .replace(/\{user\}/g, `<@${member.id}>`)         // תיוג ישיר
    .replace(/\{username\}/g, member.user.username)   // שם בלי תיוג
    .replace(/\{server\}/g, member.guild.name);       // שם השרת
}

async function handleMemberJoin(member) {
  const config = loadConfig();
  const welcomeConfig = config.welcomeSystem;

  if (!welcomeConfig?.enabled) return;

  const guild = member.guild;
  const channelName = sanitizeChannelName(welcomeConfig.channelName, 'ברוכים-הבאים');

  let channel = guild.channels.cache.find(
    (c) => c.name === channelName && c.type === ChannelType.GuildText
  );

  // אם הערוץ לא קיים - הבוט יוצר אותו בעצמו
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: 'ערוץ ברכות לחברים חדשים - נוצר אוטומטית'
      });
    } catch (err) {
      console.error(`שגיאה ביצירת ערוץ ברכות "${channelName}":`, err.message);
      return;
    }
  }

  const message = fillTemplate(welcomeConfig.messageTemplate, member);

  try {
    await channel.send({ content: message });
  } catch (err) {
    console.error('שגיאה בשליחת הודעת ברוך הבא:', err.message);
  }
}

module.exports = { handleMemberJoin };
