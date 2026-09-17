import { db, collection, getDocs, query, orderBy, limit, doc, setDoc, getDoc } from "../firebase-init.js";
import { loadReportData, profitAndLoss, toCSV, downloadFile } from "../reports.js";
import { formatDate } from "../invoice.js";
import { state, isSuperAdmin } from "../auth.js";
import { logAudit } from "../audit.js";
import { round2 } from "../pricing.js";

let tab = "audit";

export async function renderAdmin(container) {
  container.innerHTML = `
    <div class="page-title">Admin</div>
    <div class="btn-group btn-group-sm mb-3">
      <button class="btn ${tab === "audit" ? "btn-dark" : "btn-outline-dark"}" data-tab="audit">Audit Log</button>
      <button class="btn ${tab === "closing" ? "btn-dark" : "btn-outline-dark"}" data-tab="closing">Monthly Closing</button>
      <button class="btn ${tab === "backup" ? "btn-dark" : "btn-outline-dark"}" data-tab="backup">Backup &amp; Export</button>
    </div>
    <div id="adminBody"><div class="text-muted">Loading...</div></div>`;

  container.querySelectorAll("[data-tab]").forEach(b =>
    b.addEventListener("click", () => { tab = b.dataset.tab; renderAdmin(container); })
  );

  if (tab === "audit") await renderAudit();
  else if (tab === "closing") await renderClosing(container);
  else await renderBackup();
}

// ---------- Audit log ----------

async function renderAudit() {
  const snap = await getDocs(query(collection(db, "auditLogs"), orderBy("at", "desc"), limit(500)));
  const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const usersSnap = await getDocs(collection(db, "users"));
  const userNames = Object.fromEntries(usersSnap.docs.map(d => [d.id, d.data().name]));

  document.getElementById("adminBody").innerHTML = `
    <input class="form-control form-control-sm mb-2" id="auditSearch" placeholder="Filter by user, module or action...">
    <div class="card"><div class="card-body p-0" style="max-height:65vh;overflow:auto">
      <table class="table table-sm table-striped mb-0">
        <thead class="table-light sticky-top"><tr><th>Date</th><th>User</th><th>Action</th><th>Module</th><th>Record</th><th>Change</th></tr></thead>
        <tbody id="auditBody">
          ${logs.map(l => `<tr>
            <td class="small text-nowrap">${formatDate(l.at)}</td>
            <td class="small">${esc(userNames[l.userId] || l.userId || "—")}</td>
            <td><span class="badge ${badge(l.action)}">${esc(l.action)}</span></td>
            <td class="small">${esc(l.module)}</td>
            <td class="small text-muted">${esc(l.record || "")}</td>
            <td class="small" style="max-width:340px;word-break:break-word">
              ${l.oldValue ? `<div class="text-danger">− ${esc(JSON.stringify(l.oldValue).slice(0, 160))}</div>` : ""}
              ${l.newValue ? `<div class="text-success">+ ${esc(JSON.stringify(l.newValue).slice(0, 160))}</div>` : ""}
            </td>
          </tr>`).join("") || `<tr><td colspan="6" class="p-3 text-muted">No audit entries yet.</td></tr>`}
        </tbody>
      </table>
    </div></div>`;

  document.getElementById("auditSearch").addEventListener("input", (e) => {
    const t = e.target.value.toLowerCase();
    document.querySelectorAll("#auditBody tr").forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(t) ? "" : "none";
    });
  });
}

function badge(action) {
  return action === "CREATE" ? "bg-success" : action === "DELETE" ? "bg-danger" : "bg-primary";
}

// ---------- Monthly closing ----------

async function renderClosing(container) {
  const d = await loadReportData();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const pl = profitAndLoss(d, from, to);

  const receivables = round2(d.customers.reduce((s, c) => s + (Number(c.outstandingBalance) || 0), 0));
  const payables = round2(d.suppliers.reduce((s, x) => s + (Number(x.payableBalance) || 0), 0));
  const stockValue = round2(d.products.reduce((s, p) => s + (Number(p.currentStock) || 0) * (Number(p.costPrice) || 0), 0));
  const cashIn = round2(d.cashTransactions.filter(c => c.direction === "IN").reduce((s, c) => s + Number(c.amount || 0), 0));
  const cashOut = round2(d.cashTransactions.filter(c => c.direction === "OUT").reduce((s, c) => s + Number(c.amount || 0), 0));
  const closingCash = round2(cashIn - cashOut);

  const totalPurchases = round2(d.purchases
    .filter(p => { const dt = p.createdAt?.toDate?.(); return dt && dt >= from && dt < to; })
    .reduce((s, p) => s + (Number(p.grandTotal) || 0), 0));

  const closedSnap = await getDoc(doc(db, "settings", `closing_${monthKey}`));
  const alreadyClosed = closedSnap.exists();

  document.getElementById("adminBody").innerHTML = `
    <div class="card"><div class="card-header">Closing for ${monthKey}</div><div class="card-body">
      ${alreadyClosed ? `<div class="alert alert-success py-2 small">This month was closed on ${formatDate(closedSnap.data().closedAt)} by ${esc(closedSnap.data().closedByName || "")}. Historical transactions are locked.</div>` : ""}
      <div class="row g-2">
        ${stat("Total Sales", pl.totalSales)}
        ${stat("Total Purchases", totalPurchases)}
        ${stat("Total Expenses", pl.totalExpenses)}
        ${stat("Gross Profit", pl.grossProfit)}
        ${stat("Net Profit", pl.netProfit)}
        ${stat("Receivables", receivables)}
        ${stat("Payables", payables)}
        ${stat("Closing Cash", closingCash)}
        ${stat("Stock Value", stockValue)}
      </div>
      ${isSuperAdmin() && !alreadyClosed ? `
        <button class="btn btn-warning btn-sm mt-3" id="closeMonthBtn">Close ${monthKey}</button>
        <div class="form-text">Once closed, edits to this month's transactions are blocked for non-Super-Admin users.</div>` : ""}
    </div></div>`;

  document.getElementById("closeMonthBtn")?.addEventListener("click", async () => {
    if (!confirm(`Close ${monthKey}? This locks the month's historical transactions.`)) return;
    await setDoc(doc(db, "settings", `closing_${monthKey}`), {
      month: monthKey,
      totalSales: pl.totalSales, totalPurchases, totalExpenses: pl.totalExpenses,
      grossProfit: pl.grossProfit, netProfit: pl.netProfit,
      receivables, payables, closingCash, stockValue,
      closedBy: state.user.uid, closedByName: state.profile?.name || "",
      closedAt: new Date()
    });
    await logAudit({ userId: state.user.uid, action: "UPDATE", module: "settings", record: `closing_${monthKey}`, newValue: { closed: true } });
    renderAdmin(container);
  });
}

// ---------- Backup & export ----------

async function renderBackup() {
  document.getElementById("adminBody").innerHTML = `
    <div class="card"><div class="card-header">Backup &amp; Export</div><div class="card-body">
      <p class="small text-muted">Exports run in your browser against live Firestore data. Keep backups somewhere safe — they contain full business records.</p>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-sm btn-primary" id="jsonBackup">Full JSON Backup</button>
        <button class="btn btn-sm btn-outline-primary" id="csvSales">Sales CSV</button>
        <button class="btn btn-sm btn-outline-primary" id="csvProducts">Products CSV</button>
        <button class="btn btn-sm btn-outline-primary" id="csvCustomers">Customers CSV</button>
        <button class="btn btn-sm btn-outline-primary" id="csvSuppliers">Suppliers CSV</button>
        <button class="btn btn-sm btn-outline-primary" id="csvPurchases">Purchases CSV</button>
        <button class="btn btn-sm btn-outline-primary" id="csvExpenses">Expenses CSV</button>
      </div>
      <div id="backupStatus" class="small text-muted mt-2"></div>
    </div></div>`;

  const status = document.getElementById("backupStatus");
  const withStatus = async (msg, fn) => {
    status.textContent = msg;
    try { await fn(); status.textContent = "Done."; }
    catch (e) { status.textContent = "Failed: " + e.message; }
  };

  document.getElementById("jsonBackup").addEventListener("click", () => withStatus("Building backup...", async () => {
    const d = await loadReportData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`iftikhar-backup-${stamp}.json`, JSON.stringify(d, null, 2), "application/json");
  }));

  const csvJobs = {
    csvSales: ["sales", ["invoiceNo", "customerName", "grandTotal", "paidAmount", "remaining", "status"]],
    csvProducts: ["products", ["name", "sku", "barcode", "categoryId", "currentStock", "costPrice", "salePrice"]],
    csvCustomers: ["customers", ["name", "phone", "city", "totalPurchases", "totalPaid", "outstandingBalance", "creditLimit"]],
    csvSuppliers: ["suppliers", ["name", "phone", "city", "totalPurchases", "totalPaid", "payableBalance"]],
    csvPurchases: ["purchases", ["purchaseNo", "supplierName", "grandTotal", "paidAmount", "remaining"]],
    csvExpenses: ["expenses", ["category", "description", "amount", "method"]]
  };

  Object.entries(csvJobs).forEach(([btnId, [col, fields]]) => {
    document.getElementById(btnId).addEventListener("click", () => withStatus("Exporting...", async () => {
      const snap = await getDocs(collection(db, col));
      const rows = snap.docs.map(doc => fields.map(f => doc.data()[f] ?? ""));
      downloadFile(`${col}.csv`, toCSV(fields, rows));
    }));
  });
}

function stat(label, value) {
  return `<div class="col-6 col-md-4 col-lg-3"><div class="card"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold">Rs. ${num(value)}</div></div></div></div>`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
