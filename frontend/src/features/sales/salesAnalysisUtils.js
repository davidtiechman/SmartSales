import { formatIsraelDateKey, formatNumber } from "../../utils/format.js";

export const summaryModes = {
  product: {
    title: "סיכום לפי מוצר",
    headers: ["מוצר", "קטגוריה", "כמות כוללת", "מספר מכירות"],
  },
  size: {
    title: "סיכום לפי מוצר ומידה",
    headers: ["מוצר", "מידה", "קטגוריה", "כמות כוללת", "מספר מכירות"],
  },
  day: {
    title: "סיכום לפי יום",
    headers: ["תאריך", "כמות כוללת", "מספר מכירות"],
  },
};

function getSaleDate(item) {
  return formatIsraelDateKey(item.sale_date);
}

export function buildSummary(items, mode) {
  const summary = items.reduce((groups, item) => {
    const quantity = Number(item.quantity || 0);
    const productName = item.product_name || "ללא שם מוצר";
    const category = item.category || "";
    const size = item.size || "ללא מידה";
    const date = getSaleDate(item) || "ללא תאריך";
    const key = mode === "day"
      ? date
      : mode === "size"
        ? `${category}-${productName}-${size}`
        : `${category}-${productName}`;
    const current = groups.get(key) || {
      category,
      product_name: productName,
      size,
      date,
      quantity: 0,
      sales_count: 0,
    };

    current.quantity += quantity;
    current.sales_count += 1;
    groups.set(key, current);
    return groups;
  }, new Map());

  return Array.from(summary.values()).sort((first, second) => {
    if (mode === "day") return String(second.date).localeCompare(String(first.date), "he");
    return (
      second.quantity - first.quantity ||
      first.product_name.localeCompare(second.product_name, "he") ||
      String(first.size).localeCompare(String(second.size), "he")
    );
  });
}

export function buildRows(summary, mode) {
  if (mode === "day") {
    return summary.map((item) => [
      item.date,
      formatNumber(item.quantity),
      formatNumber(item.sales_count),
    ]);
  }

  if (mode === "size") {
    return summary.map((item) => [
      item.product_name,
      item.size,
      item.category,
      formatNumber(item.quantity),
      formatNumber(item.sales_count),
    ]);
  }

  return summary.map((item) => [
    item.product_name,
    item.category,
    formatNumber(item.quantity),
    formatNumber(item.sales_count),
  ]);
}
