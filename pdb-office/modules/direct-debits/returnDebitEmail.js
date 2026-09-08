const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatBillingMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return "deine Membership";
  return new Date(`${value}-01T12:00:00`).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

export function addCalendarDays(date, days) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + Number(days || 0));
  return result.toISOString().slice(0, 10);
}

export function buildReturnDebitReminder({
  memberName,
  billingMonth,
  principalAmount,
  bankFee,
  returnedAt,
  dueDate,
  companyName = "PDB Aesthetic Room",
  iban,
  bic,
}) {
  const cleanName = String(memberName || "").trim();
  const period = formatBillingMonth(billingMonth);
  const principal = Math.max(0, Number(principalAmount) || 0);
  const fee = Math.max(0, Number(bankFee) || 0);
  const total = principal + fee;
  const paymentReference = `Membership ${period} – ${cleanName || "Kundin/Kunde"}`;
  const amountDetails = fee > 0
    ? `Darin enthalten: ${formatCurrency(principal)} Membership-Beitrag und ${formatCurrency(fee)} von der Bank berechnete Rücklastschriftkosten.`
    : `Der Betrag betrifft den offenen Membership-Beitrag von ${formatCurrency(principal)}.`;
  const bankDetails = [
    `Empfänger: ${companyName}`,
    iban ? `IBAN: ${String(iban).trim()}` : "IBAN: Bitte in den Rechnungseinstellungen ergänzen",
    bic ? `BIC: ${String(bic).trim()}` : "",
    `Verwendungszweck: ${paymentReference}`,
  ].filter(Boolean);

  return {
    subject: `Zahlungserinnerung zur PDB Membership – ${period}`,
    body: [
      cleanName ? `Hallo ${cleanName},` : "Hallo,",
      "",
      `die Lastschrift für deine PDB Membership im ${period} wurde${returnedAt ? ` am ${formatDate(returnedAt)}` : ""} zurückgegeben. Bis heute konnten wir keinen entsprechenden Zahlungseingang feststellen.`,
      "",
      `Offener Betrag: ${formatCurrency(total)}`,
      amountDetails,
      "",
      `Bitte überweise den offenen Betrag bis zum ${formatDate(dueDate)} auf folgendes Konto:`,
      ...bankDetails,
      "",
      "Falls du bereits überwiesen hast, antworte bitte kurz mit dem Zahlungsdatum und dem Namen des verwendeten Kontos. Dann können wir die Zahlung schneller zuordnen.",
      "",
      "Liebe Grüße",
      "PDB Aesthetic Room",
    ].join("\n"),
    totalAmount: Math.round(total * 100) / 100,
    paymentReference,
  };
}
