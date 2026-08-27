# Sales Outfit

מערכת מכירות ומלאי עם backend ב-FastAPI ו-frontend ב-React.

## מבנה פרויקט

- `backend/app/main.py` - נקודת הכניסה של FastAPI.
- `backend/app/api/routes/` - routes לפי תחום: auth, sales, account, inventory.
- `backend/app/services/` - לוגיקה עסקית וחישובים.
- `backend/app/schemas/` - מודלי בקשות של Pydantic.
- `backend/app/core/` - הגדרות וסביבה.
- `backend/app/db/` - חיבורי database.
- `backend/db/` - SQL וסקריפטי migration.
- `backend/scripts/` - סקריפטים ידניים.
- `frontend/src/` - אפליקציית React מחולקת לרכיבים ו-features.
- `frontend/public/assets/` - קבצי תמונה ו-assets סטטיים.

## הרצה מקומית

1. התקנת תלויות backend:

```bash
pip install -r requirements.txt
```

2. הרצת API:

```bash
uvicorn backend.app.main:app --reload
```

3. התקנת תלויות frontend:

```bash
cd frontend
npm install
```

4. הרצת React:

```bash
npm run dev
```

כברירת מחדל ה-frontend מדבר עם אותו origin. אם React רץ בפורט אחר, אפשר להגדיר:

```bash
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

## Build להגשה מתוך FastAPI

```bash
cd frontend
npm run build
cd ..
uvicorn backend.app.main:app --reload
```

לאחר build, FastAPI יגיש את האפליקציה מתוך `/ui/`.
