// src/aiMenuBuilder.js
// אחראי על תרגום תיאור חופשי בעברית למבנה JSON מדויק שהבוט יודע לבצע

const Groq = require('groq-sdk');

const SYSTEM_PROMPT = `אתה מנוע שמתרגם תיאור חופשי בעברית של "זרימת תפריטים" בבוט דיסקורד, למבנה JSON מדויק שניתן להפעלה ישירה.

המבנה חייב להיות אובייקט JSON יחיד בלבד, בלי שום טקסט נוסף, בלי הסברים, בלי גדרות קוד (\`\`\`), רק ה-JSON עצמו.

סכמת המבנה:
{
  "name": "שם קצר למבנה",
  "trigger": {
    "type": "channel_message" | "command" | "button",
    "channelName": "שם הערוץ שבו מופיע ההודעה הראשונית (אם type=channel_message)",
    "messageText": "טקסט ההודעה שהבוט שולח עם הכפתורים",
    "buttons": [ { "id": "btn_1", "label": "טקסט הכפתור", "style": "Primary|Secondary|Success|Danger" } ]
  },
  "nodes": {
    "btn_1": {
      "action": "ask_question" | "open_room" | "send_message" | "show_buttons",
      "question": "טקסט השאלה שהבוט שואל את המשתמש (אם action=ask_question)",
      "expectsImage": true | false,
      "onAnswer": {
        "action": "open_room" | "send_message" | "show_buttons",
        "roomNameTemplate": "תבנית שם החדר, אפשר להשתמש ב-{answer} או {username}",
        "roomTopic": "תיאור החדר",
        "categoryName": "שם הקטגוריה שבה ייפתח החדר (אופציונלי)",
        "messageInRoom": "ההודעה שתישלח בחדר שנפתח",
        "nextButtons": [ { "id": "btn_2", "label": "...", "style": "Primary" } ]
      }
    }
  }
}

חוקים:
1. כל כפתור שמוזכר בתיאור צריך node תואם.
2. אם המשתמש מתאר "שואל X ואז פותח חדר" - זה ask_question שמוביל ל-onAnswer עם open_room.
3. אם נדרשת אפשרות להעלות תמונה - expectsImage: true.
4. שמור על שמות ID פשוטים באנגלית (btn_1, btn_2...) אך כל הטקסטים שמוצגים למשתמש יהיו בעברית כפי שדוד כתב.
5. אם תיאור מעורפל בנקודה מסוימת, השלם בצורה הגיונית והכי קרובה לכוונה.
6. אסור להחזיר שום דבר מעבר ל-JSON עצמו.`;

async function buildMenuFromDescription({ apiKey, description, existingMenu = null }) {
  if (!apiKey) {
    throw new Error('חסר מפתח Groq API. יש להזין אותו בדשבורד תחת הגדרות.');
  }

  const groq = new Groq({ apiKey });

  const userContent = existingMenu
    ? `זה המבנה הקיים שכבר נבנה:\n${JSON.stringify(existingMenu, null, 2)}\n\nהמשתמש מבקש להוסיף/לשנות:\n${description}\n\nהחזר את המבנה המעודכן המלא (כולל החלקים שלא השתנו).`
    : `התיאור של דוד:\n${description}`;

  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    max_tokens: 4096
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || '';

  let cleaned = raw;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('ה-AI החזיר תשובה שלא ניתנת לפענוח כ-JSON תקין. שגיאה: ' + err.message);
  }

  return parsed;
}

async function analyzeExampleImage({ apiKey, base64Image, mimeType, description }) {
  if (!apiKey) {
    throw new Error('חסר מפתח Groq API. יש להזין אותו בדשבורד תחת הגדרות.');
  }

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `זוהי דוגמה לתפריט/חדר שדוד רוצה שהבוט ייצור בדיסקורד. תאר בעברית ובפירוט מקסימלי: אילו כפתורים מופיעים, איזה טקסט כתוב, מה צבע הכפתורים, ואיזה מבנה שאלות/תגובות משתמע מהתמונה. ${description ? 'הקשר נוסף מדוד: ' + description : ''}`
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` }
          }
        ]
      }
    ],
    temperature: 0.3,
    max_tokens: 1024
  });

  return completion.choices?.[0]?.message?.content?.trim() || '';
}

const TICKET_SYSTEM_PROMPT = `אתה מנוע שמתרגם תיאור חופשי בעברית של "מערכת טיקטים" בדיסקורד, למבנה JSON מדויק.

המבנה חייב להיות אובייקט JSON יחיד בלבד, בלי שום טקסט נוסף, בלי הסברים, בלי גדרות קוד, רק ה-JSON עצמו.

הערה חשובה על המבנה הסופי: לכל קטגוריה שתחלץ, הבוט ייצור באופן אוטומטי תיקייה (Category) נפרדת בשם "טיקטים - <קטגוריה>", ובתוכה ערוץ פתיחה קבוע עם כפתור. לחיצה על הכפתור פותחת טופס, ולאחר מילויו נפתח חדר הטיקט עצמו **בתוך אותה תיקייה**. אין צורך בתפריט בחירה משותף - כל קטגוריה היא תיקייה עצמאית משלה.

סכמת המבנה:
{
  "logChannelName": "שם ערוץ הלוג שבו יישלחו תמלילי טיקטים שנסגרו (לדוגמה: ticket-logs)",
  "categories": [
    { "label": "שם הקטגוריה כפי שיוצג למשתמש", "description": "תיאור קצר אופציונלי שיוצג בערוץ הפתיחה, אחרת מחרוזת ריקה", "emoji": "אימוג'י מתאים אם מתאים, אחרת מחרוזת ריקה" }
  ]
}

חוקים:
1. חלץ מהתיאור את כל הקטגוריות שדוד מזכיר (כל "סוג טיקט" או "נושא" הוא קטגוריה נפרדת שתקבל תיקייה משלה).
2. אם דוד לא ציין שם ערוץ לוג - השתמש בברירת מחדל "ticket-logs".
3. הוסף אימוג'י מתאים לכל קטגוריה אם זה הגיוני, אחרת השאר ריק.
4. מקסימום 25 קטגוריות.
5. אסור להחזיר שום דבר מעבר ל-JSON עצמו.`;

async function buildTicketSystemFromDescription({ apiKey, description }) {
  if (!apiKey) {
    throw new Error('חסר מפתח Groq API. יש להזין אותו בדשבורד תחת הגדרות.');
  }

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: TICKET_SYSTEM_PROMPT },
      { role: 'user', content: `התיאור של דוד:\n${description}` }
    ],
    temperature: 0.3,
    max_tokens: 2048
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || '';
  let cleaned = raw;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('ה-AI החזיר תשובה שלא ניתנת לפענוח כ-JSON תקין. שגיאה: ' + err.message);
  }

  parsed.categories = (parsed.categories || []).slice(0, 25).map((cat, idx) => ({
    id: 'cat_' + Date.now() + '_' + idx,
    label: (cat.label || `קטגוריה ${idx + 1}`).slice(0, 100),
    description: (cat.description || '').slice(0, 300),
    emoji: cat.emoji || undefined
  }));

  return parsed;
}

const VOICE_SYSTEM_PROMPT = `אתה מנוע שמתרגם תיאור חופשי בעברית של "חדר קולי נעול" בדיסקורד, למבנה JSON מדויק.

תקבל גם רשימה של התפקידים (Roles) הקיימים בפועל בשרת. עליך להתאים מהתיאור החופשי לאיזה תפקידים מתכוון דוד.

המבנה חייב להיות אובייקט JSON יחיד בלבד, בלי שום טקסט נוסף, בלי הסברים, בלי גדרות קוד, רק ה-JSON עצמו.

סכמת המבנה:
{
  "channelName": "שם הערוץ הקולי",
  "categoryFolderName": "שם תיקיית קטגוריה להצבת הערוץ (אופציונלי, השאר ריק אם לא צוין)",
  "allowedRoleNames": ["שם תפקיד מדויק כפי שמופיע ברשימה שסיפקתי", "..."],
  "muteByDefault": true
}

חוקים:
1. "allowedRoleNames" חייב להכיל שמות תפקידים מדויקים מהרשימה שסיפקתי - אל תמציא שמות שלא קיימים.
2. אם דוד מתאר היררכיה - כלול את כל התפקידים שהוא מזכיר כרלוונטיים מהרשימה.
3. muteByDefault צריך להיות true אם דוד תיאר שמשתמשים נכנסים מושתקים וצריכים אישור לדבר. אחרת false.
4. אם דוד לא ציין שם לתיקיית קטגוריה - השתמש במחרוזת ריקה.
5. אסור להחזיר שום דבר מעבר ל-JSON עצמו.`;

async function buildVoiceChannelFromDescription({ apiKey, description, availableRoles }) {
  if (!apiKey) {
    throw new Error('חסר מפתח Groq API. יש להזין אותו בדשבורד תחת הגדרות.');
  }

  const groq = new Groq({ apiKey });

  const rolesListText = availableRoles.map((r) => `- ${r.name} (id: ${r.id})`).join('\n');

  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: VOICE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `התפקידים הקיימים בשרת:\n${rolesListText}\n\nהתיאור של דוד:\n${description}`
      }
    ],
    temperature: 0.2,
    max_tokens: 1024
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || '';
  let cleaned = raw;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('ה-AI החזיר תשובה שלא ניתנת לפענוח כ-JSON תקין. שגיאה: ' + err.message);
  }

  const matchedRoleIds = [];
  for (const roleName of parsed.allowedRoleNames || []) {
    const match = availableRoles.find((r) => r.name === roleName);
    if (match) matchedRoleIds.push(match.id);
  }

  if (!matchedRoleIds.length) {
    throw new Error('לא הצלחתי להתאים שום תפקיד מהתיאור לתפקידים הקיימים בשרת.');
  }

  return {
    channelName: parsed.channelName || 'חדר-קולי',
    categoryFolderName: parsed.categoryFolderName || '',
    allowedRoleIds: matchedRoleIds,
    muteByDefault: !!parsed.muteByDefault
  };
}

module.exports = { buildMenuFromDescription, analyzeExampleImage, buildTicketSystemFromDescription, buildVoiceChannelFromDescription };
