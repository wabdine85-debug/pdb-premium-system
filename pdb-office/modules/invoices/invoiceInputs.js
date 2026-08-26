export function parseLocalizedNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const compact = String(value ?? "").trim().replace(/[\s€]/g, "");
  if (!compact) return 0;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = compact.replace(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = compact.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePriceInput(value) {
  const cleaned = String(value ?? "")
    .replace(/\./g, ",")
    .replace(/[^\d,]/g, "");
  const [integer = "", ...decimalParts] = cleaned.split(",");
  const decimal = decimalParts.join("").slice(0, 2);

  if (!cleaned) return "";
  if (!decimalParts.length) return integer;
  return `${integer || "0"},${decimal}`;
}

export function toPriceInput(value) {
  if (value === "" || value == null) return "";
  const parsed = parseLocalizedNumber(value);
  return parsed === 0 ? "" : String(parsed).replace(".", ",");
}
