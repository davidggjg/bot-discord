// public/app.js
// לוגיקת הדשבורד: תקשורת עם השרת, ניהול הגדרות, בניית תפריטים, רשימת תפריטים

const API = {
  async getConfig() {
    const r = await fetch('/api/config');
    return r.json();
  },
  async saveConfig(data) {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async startBot() {
    const r = await fetch('/api/bot/start', { method: 'POST' });
    return r.json();
  },
  async stopBot() {
    const r = await fetch('/api/bot/stop', { method: 'POST' });
    return r.json();
  },
  async botStatus() {
    const r = await fetch('/api/bot/status');
    return r.json();
  },
  async buildMenu(description, existingMenuId) {
    const r = await fetch('/api/menu/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, existingMenuId })
    });
    return r.json();
  },
  async listMenus() {
    const r = await fetch('/api/menu/list');
    return r.json();
  },
  async deleteMenu(id) {
    const r = await fetch('/api/menu/' + id, { method: 'DELETE' });
    return r.json();
  },
  async publishMenu(id) {
    const r = await fetch('/api/menu/' + id + '/publish', { method: 'POST' });
    return r.json();
  },
  async analyzeImage(file, context) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('context', context || '');
    const r = await fetch('/api/menu/analyze-image', { method: 'POST', body: formData });
    return r.json();
  },
  async buildTicketSystem(description) {
    const r = await fetch('/api/tickets/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    return r.json();
  },
  async deleteCategory(id) {
    const r = await fetch('/api/tickets/categories/' + id, { method: 'DELETE' });
    return r.json();
  },
  async publishTicketPanel() {
    const r = await fetch('/api/tickets/publish', { method: 'POST' });
    return r.json();
  },
  async getTicketConfig() {
    const r = await fetch('/api/tickets/config');
    return r.json();
  },
  async buildVoiceChannel(description) {
    const r = await fetch('/api/voice/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    return r.json();
  },
  async createVoiceChannel(voiceConfig) {
    const r = await fetch('/api/voice/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceConfig })
    });
    return r.json();
  },
  async getWelcomeConfig() {
    const r = await fetch('/api/welcome/config');
    return r.json();
  },
  async saveWelcomeConfig(data) {
    const r = await fetch('/api/welcome/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async getVerifyConfig() {
    const r = await fetch('/api/verify/config');
    return r.json();
  },
  async saveVerifyConfig(data) {
    const r = await fetch('/api/verify/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async previewVerifyLockdown() {
    const r = await fetch('/api/verify/preview');
    return r.json();
  },
  async executeVerifyLockdown() {
    const r = await fetch('/api/verify/execute', { method: 'POST' });
    return r.json();
  }
};

// ---------- Toast ----------
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast ' + type; }, 3500);
}

// ---------- סטטוס בוט ----------
async function refreshStatus() {
  try {
    const status = await API.botStatus();
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (status.ready) {
      dot.className = 'status-dot on';
      text.textContent = 'הבוט מחובר';
    } else {
      dot.className = 'status-dot off';
      text.textContent = 'הבוט מנותק';
    }
  } catch (e) {
    document.getElementById('statusText').textContent = 'שגיאת תקשורת';
  }
}

// ---------- הגדרות ----------
const settingsModal = document.getElementById('settingsModal');

document.getElementById('settingsBtn').addEventListener('click', async () => {
  const cfg = await API.getConfig();
  document.getElementById('discordTokenInput').placeholder = cfg.hasDiscordToken
    ? 'טוקן קיים מוגדר (השאר ריק כדי לא לשנות)' : 'הדבק כאן את הטוקן מ-Discord Developer Portal';
  document.getElementById('groqKeyInput').placeholder = cfg.hasGroqKey
    ? 'מפתח קיים מוגדר (השאר ריק כדי לא לשנות)' : 'הדבק כאן את מפתח ה-API מ-console.groq.com';
  document.getElementById('guildIdInput').value = cfg.guildId || '';
  settingsModal.classList.add('show');
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  settingsModal.classList.remove('show');
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const discordToken = document.getElementById('discordTokenInput').value.trim();
  const groqApiKey = document.getElementById('groqKeyInput').value.trim();
  const guildId = document.getElementById('guildIdInput').value.trim();

  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  try {
    await API.saveConfig({ discordToken, groqApiKey, guildId });
    showToast('ההגדרות נשמרו בהצלחה', 'success');
    settingsModal.classList.remove('show');
    document.getElementById('discordTokenInput').value = '';
    document.getElementById('groqKeyInput').value = '';
  } catch (e) {
    showToast('שגיאה בשמירת ההגדרות', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- שליטה בבוט ----------
document.getElementById('startBotBtn').addEventListener('click', async () => {
  const btn = document.getElementById('startBotBtn');
  btn.disabled = true;
  document.getElementById('botHint').textContent = 'מתחבר...';
  try {
    const result = await API.startBot();
    if (result.success) {
      showToast('הבוט הופעל בהצלחה', 'success');
      document.getElementById('botHint').textContent = '';
    } else {
      showToast(result.error || 'שגיאה בהפעלת הבוט', 'error');
      document.getElementById('botHint').textContent = result.error || '';
    }
  } catch (e) {
    showToast('שגיאת תקשורת עם השרת', 'error');
  } finally {
    btn.disabled = false;
    refreshStatus();
  }
});

document.getElementById('stopBotBtn').addEventListener('click', async () => {
  await API.stopBot();
  showToast('הבוט כובה', '');
  refreshStatus();
});

// ---------- העלאת תמונה לדוגמה ----------
let pendingImageFile = null;

const uploadZone = document.getElementById('uploadZone');
const imageInput = document.getElementById('imageInput');

uploadZone.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;
  pendingImageFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('uploadZoneContent').innerHTML =
      `<img src="${e.target.result}" alt="דוגמה">`;
    uploadZone.classList.add('has-image');
  };
  reader.readAsDataURL(file);
});

// ---------- בניית תפריט ----------
document.getElementById('buildMenuBtn').addEventListener('click', async () => {
  const description = document.getElementById('menuDescription').value.trim();
  if (!description) {
    showToast('יש לכתוב תיאור של התהליך המבוקש', 'error');
    return;
  }

  const btn = document.getElementById('buildMenuBtn');
  const btnText = document.getElementById('buildBtnText');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> בונה תפריט...';

  try {
    let finalDescription = description;

    if (pendingImageFile) {
      btnText.textContent = 'מנתח תמונה...';
      const imgResult = await API.analyzeImage(pendingImageFile, description);
      if (imgResult.success) {
        finalDescription = description + '\n\nתיאור התמונה לדוגמה:\n' + imgResult.description;
      } else {
        showToast('שגיאה בניתוח התמונה: ' + imgResult.error, 'error');
      }
      btnText.innerHTML = '<span class="spinner"></span> בונה תפריט...';
    }

    const result = await API.buildMenu(finalDescription, null);
    if (result.success) {
      showToast('התפריט נבנה בהצלחה! אפשר לפרסם אותו לשרת', 'success');
      document.getElementById('clearFormBtn').click();
      loadMenus();
    } else {
      showToast(result.error || 'שגיאה בבניית התפריט', 'error');
    }
  } catch (e) {
    showToast('שגיאת תקשורת עם השרת', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'בנה תפריט';
  }
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  document.getElementById('menuDescription').value = '';
  pendingImageFile = null;
  imageInput.value = '';
  document.getElementById('uploadZoneContent').textContent =
    '📷 לחץ כאן להעלות תמונה לדוגמה (אופציונלי) — הבוט ינתח אותה ויבין את המבנה המבוקש';
  uploadZone.classList.remove('has-image');
});

// ---------- רשימת תפריטים ----------
async function loadMenus() {
  const { menus } = await API.listMenus();
  const list = document.getElementById('menusList');

  if (!menus || menus.length === 0) {
    list.innerHTML = '<div class="empty-state">עדיין לא נבנו תפריטים. תאר תהליך למעלה כדי להתחיל.</div>';
    return;
  }

  list.innerHTML = '';
  for (const menu of menus) {
    const card = document.createElement('div');
    card.className = 'menu-card';

    const buttonCount = menu.trigger?.buttons?.length || 0;
    card.innerHTML = `
      <div class="info">
        <div class="name">${escapeHtml(menu.name || 'תפריט ללא שם')}</div>
        <div class="desc">${buttonCount} כפתורים · ערוץ: ${escapeHtml(menu.trigger?.channelName || '—')}</div>
      </div>
      <span class="badge ${menu.active ? 'active' : 'inactive'}">${menu.active ? 'פורסם' : 'טיוטה'}</span>
      <div class="menu-actions">
        <button class="icon-btn-sm" data-action="publish" data-id="${menu.id}" title="פרסם לשרת">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
        <button class="icon-btn-sm" data-action="delete" data-id="${menu.id}" title="מחק">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
        </button>
      </div>
    `;
    list.appendChild(card);
  }

  list.querySelectorAll('[data-action="publish"]').forEach((b) => {
    b.addEventListener('click', async () => {
      const result = await API.publishMenu(b.dataset.id);
      if (result.success) {
        showToast('התפריט פורסם לשרת בהצלחה', 'success');
        loadMenus();
      } else {
        showToast(result.error || 'שגיאה בפרסום התפריט', 'error');
      }
    });
  });

  list.querySelectorAll('[data-action="delete"]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('למחוק את התפריט?')) return;
      await API.deleteMenu(b.dataset.id);
      showToast('התפריט נמחק', '');
      loadMenus();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- מערכת טיקטים ----------

async function loadTicketPreview() {
  try {
    const { ticketSystem } = await API.getTicketConfig();
    if (ticketSystem?.categories?.length) {
      showTicketPreview(ticketSystem);
    }
  } catch (e) {}
}

function showTicketPreview(ts) {
  const preview = document.getElementById('ticketPreview');
  const content = document.getElementById('ticketPreviewContent');
  preview.style.display = 'block';

  const cats = (ts.categories || []).map((c) =>
    `<div class="menu-card" style="margin-bottom:6px;">
      <div class="info">
        <div class="name">${c.emoji ? c.emoji + ' ' : ''}${escapeHtml(c.label)}</div>
        <div class="desc">תיקייה: טיקטים - ${escapeHtml(c.label)}${c.description ? ' · ' + escapeHtml(c.description) : ''}</div>
      </div>
      <button class="icon-btn-sm" data-action="delete-cat" data-id="${c.id}" title="מחק">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
      </button>
    </div>`
  ).join('');

  content.innerHTML = `
    <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
      ערוץ לוג תמלילים: <b>${escapeHtml(ts.logChannelName || '')}</b>
    </div>
    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">קטגוריות (${(ts.categories || []).length}) - לכל אחת תיקייה נפרדת:</div>
    ${cats}
  `;

  content.querySelectorAll('[data-action="delete-cat"]').forEach((b) => {
    b.addEventListener('click', async () => {
      await API.deleteCategory(b.dataset.id);
      showToast('קטגוריה נמחקה', '');
      loadTicketPreview();
    });
  });
}

document.getElementById('buildTicketBtn').addEventListener('click', async () => {
  const description = document.getElementById('ticketDescription').value.trim();
  if (!description) {
    showToast('יש לכתוב תיאור של מערכת הטיקטים', 'error');
    return;
  }

  const btn = document.getElementById('buildTicketBtn');
  const btnText = document.getElementById('buildTicketBtnText');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> בונה...';

  try {
    const result = await API.buildTicketSystem(description);
    if (result.success) {
      showToast('מערכת הטיקטים נבנתה בהצלחה', 'success');
      showTicketPreview(result.ticketSystem);
    } else {
      showToast(result.error || 'שגיאה בבנייה', 'error');
    }
  } catch (e) {
    showToast('שגיאת תקשורת', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'בנה מערכת טיקטים';
  }
});

document.getElementById('publishTicketBtn').addEventListener('click', async () => {
  const btn = document.getElementById('publishTicketBtn');
  btn.disabled = true;
  try {
    const result = await API.publishTicketPanel();
    if (result.success) {
      showToast('פאנל הטיקטים פורסם לשרת בהצלחה', 'success');
    } else {
      showToast(result.error || 'שגיאה בפרסום', 'error');
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('clearTicketBtn').addEventListener('click', () => {
  document.getElementById('ticketDescription').value = '';
  document.getElementById('ticketPreview').style.display = 'none';
});

// ---------- חדרים קוליים נעולים ----------

let lastVoiceBuild = null;

document.getElementById('buildVoiceBtn').addEventListener('click', async () => {
  const description = document.getElementById('voiceDescription').value.trim();
  if (!description) {
    showToast('יש לכתוב תיאור של החדר הקולי', 'error');
    return;
  }

  const btn = document.getElementById('buildVoiceBtn');
  const btnText = document.getElementById('buildVoiceBtnText');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> בונה...';

  try {
    const result = await API.buildVoiceChannel(description);
    if (result.success) {
      lastVoiceBuild = result.voiceConfig;
      showVoicePreview(result.voiceConfig, result.availableRoles);
      showToast('הגדרות החדר נבנו - בדוק שהתפקידים נכונים ולחץ "צור את החדר בשרת"', 'success');
    } else {
      showToast(result.error || 'שגיאה בבנייה', 'error');
    }
  } catch (e) {
    showToast('שגיאת תקשורת', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'בנה הגדרות חדר';
  }
});

function showVoicePreview(voiceConfig, availableRoles) {
  const preview = document.getElementById('voicePreview');
  const content = document.getElementById('voicePreviewContent');
  preview.style.display = 'block';

  const roleNames = voiceConfig.allowedRoleIds
    .map((id) => availableRoles.find((r) => r.id === id)?.name || id)
    .join(', ');

  content.innerHTML = `
    <div style="margin-bottom:6px;">שם הערוץ: <b>${escapeHtml(voiceConfig.channelName)}</b></div>
    ${voiceConfig.categoryFolderName ? `<div style="margin-bottom:6px;">תיקייה: <b>${escapeHtml(voiceConfig.categoryFolderName)}</b></div>` : ''}
    <div style="margin-bottom:6px;">תפקידים מורשים: <b>${escapeHtml(roleNames)}</b></div>
    <div>השתקה כברירת מחדל: <b>${voiceConfig.muteByDefault ? 'כן' : 'לא'}</b></div>
  `;
}

document.getElementById('createVoiceBtn').addEventListener('click', async () => {
  if (!lastVoiceBuild) return;
  const btn = document.getElementById('createVoiceBtn');
  btn.disabled = true;
  try {
    const result = await API.createVoiceChannel(lastVoiceBuild);
    if (result.success) {
      showToast(`החדר הקולי "${result.channelName}" נוצר בהצלחה בשרת`, 'success');
    } else {
      showToast(result.error || 'שגיאה ביצירת החדר', 'error');
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('clearVoiceBtn').addEventListener('click', () => {
  document.getElementById('voiceDescription').value = '';
  document.getElementById('voicePreview').style.display = 'none';
  lastVoiceBuild = null;
});

// ---------- ברכת חבר חדש ----------

async function loadWelcomeConfig() {
  try {
    const { welcomeSystem } = await API.getWelcomeConfig();
    if (!welcomeSystem) return;
    document.getElementById('welcomeEnabled').checked = !!welcomeSystem.enabled;
    document.getElementById('welcomeChannelInput').value = welcomeSystem.channelName || '';
    document.getElementById('welcomeMessageInput').value = welcomeSystem.messageTemplate || '';
  } catch (e) {}
}

document.getElementById('saveWelcomeBtn').addEventListener('click', async () => {
  const data = {
    enabled: document.getElementById('welcomeEnabled').checked,
    channelName: document.getElementById('welcomeChannelInput').value.trim(),
    messageTemplate: document.getElementById('welcomeMessageInput').value.trim()
  };
  const result = await API.saveWelcomeConfig(data);
  if (result.success) {
    showToast('הגדרות הברכה נשמרו', 'success');
  } else {
    showToast(result.error || 'שגיאה בשמירה', 'error');
  }
});

// ---------- שער אימות ----------

async function loadVerifyConfig() {
  try {
    const { verifyGate } = await API.getVerifyConfig();
    if (!verifyGate) return;
    document.getElementById('verifyChannelInput').value = verifyGate.verifyChannelName || '';
    document.getElementById('verifiedRoleInput').value = verifyGate.verifiedRoleName || '';
    document.getElementById('verifyMessageInput').value = verifyGate.verifyMessage || '';
  } catch (e) {}
}

document.getElementById('saveVerifyConfigBtn').addEventListener('click', async () => {
  const data = {
    verifyChannelName: document.getElementById('verifyChannelInput').value.trim(),
    verifiedRoleName: document.getElementById('verifiedRoleInput').value.trim(),
    verifyMessage: document.getElementById('verifyMessageInput').value.trim()
  };
  const result = await API.saveVerifyConfig(data);
  if (result.success) {
    showToast('הגדרות האימות נשמרו', 'success');
  } else {
    showToast(result.error || 'שגיאה בשמירה', 'error');
  }
});

document.getElementById('previewVerifyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('previewVerifyBtn');
  btn.disabled = true;
  try {
    const result = await API.previewVerifyLockdown();
    if (result.success) {
      const p = result.preview;
      const box = document.getElementById('verifyPreviewBox');
      const content = document.getElementById('verifyPreviewContent');
      box.style.display = 'block';
      content.innerHTML = `
        <div style="margin-bottom:8px;">ייווצר/יישתמש בתפקיד: <b>${escapeHtml(p.roleName)}</b></div>
        <div style="margin-bottom:8px;">ערוץ האימות שיישאר גלוי: <b>${escapeHtml(p.verifyChannelName)}</b></div>
        <div style="margin-bottom:8px;">סך הערוצים בשרת: <b>${p.totalChannels}</b></div>
        <div style="margin-bottom:10px; color:#946b00; font-weight:600;">ייעלמו לחברים לא מאומתים (${p.channelsToLockCount} ערוצים):</div>
        <div style="max-height:160px; overflow-y:auto; font-size:12px; color:var(--text-muted); line-height:1.6;">
          ${p.channelNames.map((n) => '#' + escapeHtml(n)).join('<br>')}
        </div>
      `;
      showToast('זו תצוגה מקדימה בלבד - שום דבר עדיין לא השתנה בשרת', '');
    } else {
      showToast(result.error || 'שגיאה בהפקת תצוגה מקדימה', 'error');
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('executeVerifyBtn').addEventListener('click', async () => {
  if (!confirm('פעולה זו תנעל את כל הערוצים שהוצגו בתצוגה המקדימה. להמשיך?')) return;

  const btn = document.getElementById('executeVerifyBtn');
  btn.disabled = true;
  btn.textContent = 'מבצע נעילה...';
  try {
    const result = await API.executeVerifyLockdown();
    if (result.success) {
      const r = result.result;
      showToast(`הושלם: ${r.lockedCount} ערוצים נעלו בהצלחה${r.errors.length ? ', ' + r.errors.length + ' שגיאות' : ''}`, r.errors.length ? '' : 'success');
      if (r.errors.length) {
        console.warn('שגיאות בנעילה:', r.errors);
      }
      document.getElementById('verifyPreviewBox').style.display = 'none';
    } else {
      showToast(result.error || 'שגיאה בביצוע הנעילה', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'בצע נעילה בפועל';
  }
});

// ---------- אתחול ----------
refreshStatus();
loadMenus();
loadTicketPreview();
loadWelcomeConfig();
loadVerifyConfig();
setInterval(refreshStatus, 8000);
