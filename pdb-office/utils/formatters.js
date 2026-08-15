export const fmt = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString("de-DE") : "—";
export const today = () => new Date().toISOString().split("T")[0];

export const addDays = (d, n) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
};
