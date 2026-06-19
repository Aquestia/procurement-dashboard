# 📦 Procurement Dashboard — Aquestia Group

> דאשבורד ניהול חוסרי רכש פנים-ארגוני לקבוצת Aquestia  
> פותח על ידי שי שמאי | מנוהל על ידי Claude (Anthropic)

---

## 🌐 URLs חשובים

| שירות | URL |
|--------|-----|
| **דאשבורד (Production)** | https://procurement.aquestia-inventory.com |
| **GitHub Repo** | https://github.com/Aquestia/procurement-dashboard |
| **Supabase Project** | https://supabase.com/dashboard/project/iqcqlkpjketbogusgtns |
| **Vercel Project** | https://vercel.com (Aquestia org) |

> מפתחות API ו-Tokens שמורים בנפרד (לא ב-GitHub מטעמי אבטחה)

---

## 🗄️ מסד נתונים — Supabase

### טבלאות קיימות

#### procurement_files
קבצי Excel שהועלו למערכת.
עמודות: id, filename, uploaded_at, is_active

#### procurement_data
נתוני החוסרים המעובדים מהאקסל (JSON chunks).
עמודות: id, file_id, data (jsonb array)

#### procurement_notes
הערות רכש ותפ"י לפי מק"ט.
עמודות: id, item_number, sales_order, line_number, note_procurement, note_tapi, treatment_status, updated_at
- saveNote: אם יש id -> UPDATE, אחרת INSERT
- ייבוא הערות: מקבץ לפי item_number, משרשר עם "הערה 1: ...\nהערה 2: ..."

#### admin_pin
PIN מוגן לאזור הניהול.
עמודות: id, pin_hash (SHA-256 hex), admin_email, reset_token, reset_token_expires_at, updated_at

---

## 📁 מבנה הפרויקט

```
public/excelWorker.js           Web Worker לעיבוד Excel
src/App.jsx                     Root component, routing, data loading
src/lib/supabase.js             Supabase client
src/components/Sidebar.jsx      תפריט צד
src/components/AdminPinGate.jsx PIN gate לניהול + שחזור
src/components/shared.jsx       Badge, PageWrapper, fmtDate, EmptyState, LoadingState
src/pages/Overview.jsx          סקירה כללית + גרפים אינטראקטיביים
src/pages/ProcurementView.jsx   מבט רכש
src/pages/TapiView.jsx          מבט תפ"י
src/pages/BackOrders.jsx        Back Orders
src/pages/Recommendations.jsx   המלצות לטיפול — 6 KPI cards
src/pages/FileManager.jsx       ניהול קבצים (מוגן PIN)
src/pages/ImportNotes.jsx       ייבוא הערות מאקסל (מוגן PIN)
```

---

## 🖥️ מסכים

### 1. סקירה כללית (Overview)
- KPI cards: סה"כ מק"טים, BO, בסכנת BO, ללא רכש, ללא תאריך קבלה
- גרף חוסרים לפי חודש — אינטראקטיבי: לחיצה פותחת TOP 8 BO לפי לקוח + טבלה מלאה
- גרף שלבי טיפול, גרף מצב PO

### 2. מבט רכש (ProcurementView)
- פילטרים: סטטוס, טיפול, קניין (Buyer Group), חיפוש
- עמודות: מק"ט, תיאור, סטטוס, הז. מכירה, שורה, BO, כמויות, הז. רכש, שורת רכש, מסלול (Voyage), ספק, צפי קבלה, הערות
- לחיצה על שורה: פאנל מורחב עם כל PO
- ייצוא Excel

### 3. מבט תפ"י (TapiView)
- פילטרים: BO, טיפול, קניין (Buyer Group), חודש אספקה, חיפוש
- פאנל מורחב + ייצוא Excel

### 4. Back Orders (BackOrders)
- רשימת כל ה-BO + ייצוא Excel

### 5. המלצות לטיפול (Recommendations)
6 ריבועי KPI — לחיצה פותחת טבלה + ייצוא Excel:

| ריבוע | לוגיקה |
|-------|--------|
| ללא תאריך קבלה | יש PO אבל אין confirmed receipt date |
| ללא הזמנת רכש | אין PO בכלל |
| רכש מאחר | הפרש < 7 ימים בין קבלה לאספקה (לא BO) |
| רכש מאחר BO | אותו תנאי, רק BO |
| בסיכון PRD | prd מתחיל ב-PRD, הפרש <= 10 ימים (לא BO) |
| בסיכון PRD BO | אותו תנאי, רק BO |

### 6. ניהול קבצים (FileManager) — מוגן PIN
- העלאת Excel, עיבוד Web Worker, שמירה Supabase

### 7. ייבוא הערות (ImportNotes) — מוגן PIN
- Excel עם: Item number, הערת רכש, הערת תפ"י
- קיבוץ לפי מק"ט + שרשור -> עדכון procurement_notes

---

## ⚙️ Web Worker — excelWorker.js

לשוניות: Calculated Allocation, Open Purchase Orders, Sales Orders, PRD

שדות מרכזיים לכל מק"ט:
- itemNumber, productName, procurementStatus, stage, prd
- isBO, hasPO, shortage, totalQtyRequired, qtyOnHand, qtyOnOrder, qtyAllocated
- purchaseOrders: [{ purchaseOrder, lineNumber, voyage, vendorName, buyerGroup, quantity, deliverRemainder, confirmedReceiptDate, requestedReceiptDate, status }]
- orders: [{ salesOrder, lineNumber, customerName, confirmedShipDate, requestedShipDate, qtyOrdered }]

---

## 🔐 PIN Gate

- עמודי ניהול מוגנים PIN (SHA-256)
- שינוי PIN: כפתור בתפריט
- נעילה: כפתור בתפריט
- שחזור מייל: TODO (Supabase Edge Function)

---

## 📅 שינויים עיקריים

| תאריך | שינוי |
|-------|-------|
| 2026-06 | בניית פרויקט: 7 מסכים, Web Worker, Supabase |
| 2026-06 | ImportNotes: ייבוא הערות מאקסל |
| 2026-06 | Voyage (מסלול): עמודה בכל הטבלאות |
| 2026-06 | Buyer Group: פילטר קניין ב-ProcurementView ו-TapiView |
| 2026-06 | Overview: גרף חודשי אינטראקטיבי + drill-down |
| 2026-06 | Recommendations: בנייה מחדש — 6 KPI cards |
| 2026-06 | מחיקת מסך סיכומים |
| 2026-06 | PIN Gate לאזור ניהול |
| 2026-06 | README נוצר |
