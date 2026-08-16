import { jsPDF } from "jspdf";

function cleanCell(value = "") {
  return String(value ?? "").replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

function csvCell(value) {
  const text = cleanCell(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatMoney(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? cleanCell(value) : date.toLocaleDateString("de-DE");
}

export function createMembershipExportRows(memberships, memberById, getDisplayName) {
  return (memberships || []).map((membership, index) => {
    const customer = memberById.get(membership.memberId) || {};
    return {
      number: index + 1,
      name: getDisplayName(membership),
      plan: membership.plan || "—",
      status: membership.status || "aktiv",
      monthlyAmount: Number(membership.monthlyAmount) || 0,
      contractSignedAt: membership.contractSignedAt || "",
      startDate: membership.startDate || "",
      endDate: membership.endDate || "",
      debitDay: membership.debitDay || "",
      mandateReference: membership.mandateReference || "",
      email: customer.email || membership.memberEmail || "",
      phone: customer.phone || membership.memberPhone || "",
      notes: membership.notes || "",
    };
  });
}

export function membershipRowsToCsv(rows) {
  const header = ["Nr.", "Name", "Paket", "Status", "Monatsbeitrag", "Unterschrift", "Eintritt", "Vertragsende", "Abbuchungstag", "Mandatsreferenz", "E-Mail", "Telefon", "Notiz"];
  const values = rows.map(row => [
    row.number,
    row.name,
    row.plan,
    row.status,
    Number(row.monthlyAmount).toFixed(2).replace(".", ","),
    row.contractSignedAt,
    row.startDate,
    row.endDate,
    row.debitDay,
    row.mandateReference,
    row.email,
    row.phone,
    row.notes,
  ]);
  return `\ufeff${[header, ...values].map(line => line.map(csvCell).join(";")).join("\n")}`;
}

export function downloadMembershipCsv(rows, fileName = "PDB-Member.csv") {
  const blob = new Blob([membershipRowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadMembershipPdf(rows, filterLabel, fileName = "PDB-Member.pdf") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const margin = 12;
  const pageWidth = 297;
  const columns = [
    { key: "number", label: "Nr.", width: 10 },
    { key: "name", label: "Name", width: 62 },
    { key: "plan", label: "Paket", width: 29 },
    { key: "status", label: "Status", width: 30 },
    { key: "monthlyAmount", label: "Beitrag", width: 27 },
    { key: "startDate", label: "Eintritt", width: 29 },
    { key: "endDate", label: "Vertragsende", width: 29 },
    { key: "email", label: "E-Mail", width: 39 },
  ];

  const writeHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("PDB Memberliste", margin, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${cleanCell(filterLabel)} · ${rows.length} Einträge · erstellt am ${new Date().toLocaleDateString("de-DE")}`, margin, 22);
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, 28, pageWidth - margin * 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let x = margin + 1.5;
    columns.forEach(column => {
      doc.text(column.label, x, 33.2);
      x += column.width;
    });
    return 36;
  };

  let y = writeHeader();
  rows.forEach((row, rowIndex) => {
    if (y + 8 > 198) {
      doc.addPage();
      y = writeHeader();
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.setTextColor(30, 41, 59);
    let x = margin + 1.5;
    columns.forEach(column => {
      let value = row[column.key];
      if (column.key === "monthlyAmount") value = formatMoney(value);
      if (["startDate", "endDate"].includes(column.key)) value = formatDate(value);
      const maxWidth = column.width - 3;
      const text = cleanCell(value || "—");
      doc.text(doc.splitTextToSize(text, maxWidth)[0] || "—", x, y + 5.2);
      x += column.width;
    });
    y += 8;
  });

  doc.setProperties({ title: `PDB Memberliste – ${cleanCell(filterLabel)}`, creator: "PDB Office" });
  doc.save(fileName);
}
