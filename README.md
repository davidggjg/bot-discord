# 🤖 Discord Bot Dashboard

דשבורד ניהול בוט דיסקורד עם AI — כל הפונקציות מצ'אט אחד.

## 🚀 Deploy ל-Render.com

### שלב 1 — העלה לגיטהאב
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### שלב 2 — חבר ל-Render
1. כנס ל-[render.com](https://render.com) ולחץ **New → Web Service**
2. חבר את ה-GitHub repo שלך
3. Render יזהה את `render.yaml` אוטומטית

### שלב 3 — הוסף Environment Variables ב-Render Dashboard
| שם משתנה | מאיפה לקחת |
|---|---|
| `DISCORD_TOKEN` | [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `GUILD_ID` | דיסקורד → קליק ימני על השרת → Copy Server ID (צריך Developer Mode) |

### שלב 4 — הפעל
לאחר ה-deploy, פתח את ה-URL שרנדר נותן לך, הכנס להגדרות ולחץ **הפעל בוט**.

---

## 🏠 הרצה מקומית
```bash
npm install
# צור קובץ .env:
echo "DISCORD_TOKEN=your_token_here" > .env
echo "GROQ_API_KEY=your_key_here" >> .env
echo "GUILD_ID=your_guild_id" >> .env
npm start
```
פתח http://localhost:3000

---

## ✨ פיצ'רים
- **Verify Gate** — נועל כל הערוצים, חבר חדש רואה רק verify
- **ברכת חבר חדש** — תיוג אוטומטי עם הגעה לשרת
- **מערכת טיקטים** — קטגוריות, מודאל, תמליל אוטומטי
- **Reaction Roles** — כפתורים שמחלקים/מסירים תפקידים
- **Auto Role** — תפקיד אוטומטי לחבר חדש
- **סקרים** — עם כפתורים ותוצאות בזמן אמת
- **מודרציה** — ban, kick, timeout, warn, purge
- **תפריטים AI** — כותב בעברית חופשית, הבוט בונה הכל
