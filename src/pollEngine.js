// src/pollEngine.js
// מערכת סקרים (Polls) עם כפתורים - הצגה, הצבעה, תוצאות.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { loadConfig, updateConfig } = require('./configStore');

const POLL_VOTE_PREFIX = 'poll_vote::';

async function createPoll(guild, pollConfig) {
  const { channelName, question, options, allowMultiple } = pollConfig;

  if (!options || options.length < 2 || options.length > 10) {
    throw new Error('סקר חייב לכלול 2-10 אפשרויות.');
  }

  let channel = guild.channels.cache.find(
    (c) => c.name === channelName && c.type === ChannelType.GuildText
  );

  if (!channel) {
    throw new Error(`הערוץ "${channelName}" לא נמצא. יש ליצור אותו תחילה.`);
  }

  const pollId = `poll_${Date.now()}`;

  // שמירת הסקר ב-config
  const config = loadConfig();
  const polls = config.polls || {};
  polls[pollId] = {
    question,
    options: options.map((opt, i) => ({ id: String(i), label: opt, votes: [] })),
    allowMultiple: !!allowMultiple,
    createdAt: new Date().toISOString()
  };
  updateConfig({ polls });

  // בניית כפתורים
  const rows = [];
  for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder();
    const chunk = options.slice(i, i + 5);
    chunk.forEach((opt, j) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${POLL_VOTE_PREFIX}${pollId}::${i + j}`)
          .setLabel(opt)
          .setStyle(ButtonStyle.Primary)
      );
    });
    rows.push(row);
  }

  // כפתור תוצאות
  const resultsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${POLL_VOTE_PREFIX}${pollId}::results`)
      .setLabel('📊 הצג תוצאות')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(resultsRow);

  await channel.send({
    content: `📊 **סקר:** ${question}\n${allowMultiple ? '*(ניתן להצביע למספר אפשרויות)*' : '*(ניתן להצביע לאפשרות אחת בלבד)*'}`,
    components: rows
  });

  return pollId;
}

async function handlePollVote(interaction) {
  const parts = interaction.customId.replace(POLL_VOTE_PREFIX, '').split('::');
  const pollId = parts[0];
  const optionId = parts[1];
  const userId = interaction.user.id;

  const config = loadConfig();
  const polls = config.polls || {};
  const poll = polls[pollId];

  if (!poll) {
    return interaction.reply({ content: 'הסקר הזה כבר לא פעיל.', ephemeral: true });
  }

  // הצגת תוצאות
  if (optionId === 'results') {
    const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
    const results = poll.options.map(o => {
      const pct = totalVotes ? Math.round((o.votes.length / totalVotes) * 100) : 0;
      const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
      return `**${o.label}**: ${bar} ${pct}% (${o.votes.length} הצבעות)`;
    }).join('\n');

    return interaction.reply({
      content: `📊 **תוצאות: ${poll.question}**\n\n${results}\n\nסה"כ הצבעות: ${totalVotes}`,
      ephemeral: true
    });
  }

  const option = poll.options.find(o => o.id === optionId);
  if (!option) {
    return interaction.reply({ content: 'אפשרות לא תקינה.', ephemeral: true });
  }

  if (!poll.allowMultiple) {
    // הסר הצבעה קודמת מכל האפשרויות
    poll.options.forEach(o => {
      o.votes = o.votes.filter(v => v !== userId);
    });
  }

  // Toggle הצבעה
  if (option.votes.includes(userId)) {
    option.votes = option.votes.filter(v => v !== userId);
    updateConfig({ polls });
    return interaction.reply({ content: `הסרת את הצבעתך מ-**${option.label}**`, ephemeral: true });
  } else {
    option.votes.push(userId);
    updateConfig({ polls });
    return interaction.reply({ content: `הצבעת עבור **${option.label}** ✅`, ephemeral: true });
  }
}

function isPollInteraction(interaction) {
  return interaction.isButton?.() && interaction.customId.startsWith(POLL_VOTE_PREFIX);
}

module.exports = { createPoll, handlePollVote, isPollInteraction };
