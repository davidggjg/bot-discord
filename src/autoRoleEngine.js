// src/autoRoleEngine.js
// מחלק תפקיד אוטומטי לכל חבר חדש שנכנס לשרת (Auto Role).

const { loadConfig } = require('./configStore');

async function handleAutoRole(member) {
  const config = loadConfig();
  const autoRoleConfig = config.autoRole;

  if (!autoRoleConfig?.enabled || !autoRoleConfig?.roleId) return;

  try {
    await member.roles.add(autoRoleConfig.roleId, 'Auto Role - הוקצה אוטומטית לחבר חדש');
    console.log(`✅ Auto Role הוקצה ל-${member.user.tag}`);
  } catch (err) {
    console.error(`שגיאה בהקצאת Auto Role ל-${member.user.tag}:`, err.message);
  }
}

module.exports = { handleAutoRole };
