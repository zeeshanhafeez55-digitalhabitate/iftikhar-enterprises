import { formatDate } from "./invoice.js";

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function num(n) {
  return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function buildStatementHTML({ title, party, statement, settings, balanceLabel = "Balance" }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding:12mm; font-size:12px; color:#000; }
  h1 { font-size:20px; margin:0 0 2px; text-align:center; }
  .sub { text-align:center; font-size:12px; margin-bottom:10px; }
  h2 { font-size:14px; margin:14px 0 6px; }
  .party { display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:5px; text-align:left; }
  th { background:#f2f2f2; }
  .r { text-align:right; }
  tfoot td { font-weight:bold; background:#fafafa; }
  @media print { @page { size:A4; margin:12mm; } body { padding:0; } }
</style></head><body>
  <h1>${esc(settings.businessName || "IFTIKHAR ENTERPRISES")}</h1>
  <div class="sub">${settings.address ? esc(settings.address) + "<br>" : ""}Phone: ${esc(settings.phone || "0322-6529414")}</div>
  <h2 style="text-align:center">${esc(title)}</h2>

  <div class="party">
    <div>
      <div><strong>${esc(party.name)}</strong></div>
      ${party.phone ? `<div>Phone: ${esc(party.phone)}</div>` : ""}
      ${party.city ? `<div>${esc(party.city)}</div>` : ""}
    </div>
    <div>
      <div>Printed: ${formatDate(new Date())}</div>
      <div>${balanceLabel}: <strong>${num(statement.closingBalance)}</strong></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead>
    <tbody>
      <tr><td>—</td><td>Opening Balance</td><td></td><td class="r"></td><td class="r"></td><td class="r">${num(statement.openingBalance)}</td></tr>
      ${statement.rows.map(r => `<tr>
        <td>${formatDate(r.at)}</td>
        <td>${esc(r.type)}</td>
        <td>${esc(r.reference || "")}</td>
        <td class="r">${r.debit ? num(r.debit) : ""}</td>
        <td class="r">${r.credit ? num(r.credit) : ""}</td>
        <td class="r">${num(r.balance)}</td>
      </tr>`).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Totals</td>
        <td class="r">${num(statement.totalDebit)}</td>
        <td class="r">${num(statement.totalCredit)}</td>
        <td class="r">${num(statement.closingBalance)}</td>
      </tr>
    </tfoot>
  </table>
</body></html>`;
}

export function printStatement(opts) {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) { alert("Allow popups to print."); return; }
  w.document.write(buildStatementHTML(opts));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
