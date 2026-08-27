import {
  BarChart3,
  ClipboardList,
  CircleDollarSign,
  KeyRound,
  PackagePlus,
  ShoppingCart,
  Shirt,
  TableProperties,
  WalletCards,
} from "lucide-react";

export const agentActions = [
  {
    id: "salesHistory",
    title: "לוח מכירות",
    hint: "טבלת מכירות מלאה עם סינון.",
    icon: ClipboardList,
  },
  {
    id: "salesAnalysis",
    title: "ניתוח מכירות",
    hint: "סיכומים לפי מוצר, מידה ויום.",
    icon: BarChart3,
  },
  {
    id: "newSale",
    title: "הוספת מכירה חדשה",
    hint: "מילוי פרטי המכירה ושליחה.",
    icon: PackagePlus,
  },
  {
    id: "accountStatus",
    title: "מצב חשבון",
    hint: "סיכום בינך לבין הבעלים.",
    icon: WalletCards,
  },
  {
    id: "inventory",
    title: "צפייה במלאי",
    hint: "רשימת הפריטים, המידות והמחירים הקיימים במערכת.",
    icon: Shirt,
  },
  {
    id: "prices",
    title: "מחירים",
    hint: "מחירי בעלים וצרכן ורווח הסוכן לכל מוצר.",
    icon: CircleDollarSign,
  },
  {
    id: "supplyOrder",
    title: "הזמנת סחורה",
    hint: "בחירת פריטים וכמויות להכנת מסמך הזמנה לסוכן.",
    icon: ShoppingCart,
  },
  {
    id: "changePassword",
    title: "עדכון סיסמה",
    hint: "הזן סיסמה נוכחית וסיסמה חדשה.",
    icon: KeyRound,
  },
];

export const adminActions = [
  {
    id: "adminSalesBoard",
    title: "לוח מכירות",
    hint: "כל המכירות מכל הסוכנים עם סינון לפי סוכן.",
    icon: ClipboardList,
  },
  {
    id: "adminSalesAnalysis",
    title: "ניתוח מכירות",
    hint: "סיכומי מכירות מכל הסוכנים ללא גרפים.",
    icon: BarChart3,
  },
  {
    id: "adminAccountOverview",
    title: "מצב חשבון",
    hint: "יתרות וסיכומים כספיים לכל הסוכנים.",
    icon: WalletCards,
  },
  {
    id: "stockTransfer",
    title: "עדכון סחורה לסוכן",
    hint: "בחירת סוכן, מוצר, מידה וכמות להוספה למלאי.",
    icon: PackagePlus,
  },
  {
    id: "inventoryOverview",
    title: "צפיה במלאי",
    hint: "מלאי נוכחי לפי סוכן, מוצר ומידה.",
    icon: Shirt,
  },
  {
    id: "prices",
    title: "מחירים",
    hint: "צפייה ועריכת מחירי בעלים וצרכן לכל מוצר.",
    icon: CircleDollarSign,
  },
  {
    id: "allocationsOverview",
    title: "צפייה בהקצאות",
    hint: "רק הסחורה שהבעלים העביר לסוכן.",
    icon: TableProperties,
  },
  {
    id: "adminSupplyOrders",
    title: "צפייה בהזמנות",
    hint: "כל הזמנות הסחורה ועדכון סטטוס מול הסוכנים.",
    icon: ClipboardList,
  },
  {
    id: "changePassword",
    title: "עדכון סיסמה",
    hint: "הזן סיסמה נוכחית וסיסמה חדשה.",
    icon: KeyRound,
  },
];

export function getActionsForMode(mode) {
  return mode === "admin" ? adminActions : agentActions;
}

export function getActionById(mode, id) {
  return getActionsForMode(mode).find((action) => action.id === id);
}
