export function formatNumber(value) {
  return Number(value || 0).toLocaleString("he-IL", {
    maximumFractionDigits: 0,
  });
}

export function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

function parseStoredDateTime(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;

  const text = String(value).trim();
  const hasTime = /[T\s]\d{2}:\d{2}/.test(text);
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  const normalized = hasTime && !hasTimeZone
    ? `${text.replace(" ", "T")}Z`
    : text;

  return new Date(normalized);
}

export function formatDateTime(value) {
  const date = parseStoredDateTime(value);
  if (Number.isNaN(date.getTime())) {
    return value || "";
  }

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatIsraelDateKey(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = parseStoredDateTime(value);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatProductLabel(product) {
  return `${product.category} - ${product.product_name}`;
}
