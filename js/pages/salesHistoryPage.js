import { db, collection, getDocs, query, orderBy, limit } from "../firebase-init.js";
import { getSale } from "../sales.js";
import { getSettings } from "../settings.js";
import { printInvoice, shareInvoiceWhatsApp, formatDate } from "../invoice.js";

let SETTINGS = null;
let filter = "today";

export async function renderSalesHistory(container) {
  SETTINGS = await getSettings();
  const snap = await getDocs(query(collection(db, "sales"), orderBy("createdAt", "desc"), limit(300)));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sales = all.filter(s => inRange(s, filter));

  const totalSales = sales.reduce((s, x) => s + (Number(x.grandTotal) || 0), 0);
  const totalPaid = sales.reduce((s, x) => s + (Number(x.paidAmount) || 0), 0);
  const totalDue = sales.reduce((s, x) => s + (Number(x.remaining) || 0), 0);

  container.innerHTML = `
    <div class="page-title">Sales History</div>

    <div class="btn-group btn-group-sm mb-3">
      ${["today", "yesterday", "week", "month", "all"].map(f =>
        `<button class="btn ${filter === f ? "btn-dark" : "btn-outline-dark"}" data-f="${f}">${label(f)}</button>`).join("")}
    </div>

    <div class="row g-2 mb-3">
      ${stat("Invoices", sales.length)}
      ${stat("Total Sales", "Rs. " + num(totalSales))}
      ${stat("Received", "Rs. " + num(totalPaid))}
      ${stat("Outstanding", "Rs. " + num(totalDue))}
    </div>

    <div class="card">
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr>
            <th>Invoice</th><th>Date</th><th>Customer</th><th>Payment</th>
            <th class="text-end">Total</th><th class="text-end">Paid</th><th class="text-end">Due</th><th></th>
          </tr></thead>
          <tbody>
            ${sales.map(s => `
              <tr class="${s.cancelled ? "text-decoration-line-through text-muted" : ""}">
                <td>${esc(s.invoiceNo)}</td>
                <td class="small">${formatDate(s.createdAt)}</td>
                <td>${esc(s.customerName)}</td>
                <td class="small">${esc((s.paymentMethods || []).join(", "))}</td>
                <td class="text-end">${num(s.grandTotal)}</td>
                <td class="text-end">${num(s.paidAmount)}</td>
                <td class="text-end ${s.remaining > 0 ? "text-danger fw-semibold" : ""}">${num(s.remaining)}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary" data-print="${s.id}">Print</button>
                  <button class="btn btn-sm btn-outline-success" data-share="${s.id}">Share</button>
                </td>
              </tr>`).join("") || `<tr><td colspan="8" class="p-3 text-muted">No sales in this period.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-f]").forEach(b =>
    b.addEventListener("click", () => { filter = b.dataset.f; renderSalesHistory(container); })
  );
  container.querySelectorAll("[data-print]").forEach(b =>
    b.addEventListener("click", async () => printInvoice(await getSale(b.dataset.print), SETTINGS, SETTINGS.receiptSize))
  );
  container.querySelectorAll("[data-share]").forEach(b =>
    b.addEventListener("click", async () => shareInvoiceWhatsApp(await getSale(b.dataset.share), SETTINGS))
  );
}

function inRange(sale, f) {
  if (f === "all") return true;
  const d = sale.createdAt?.toDate ? sale.createdAt.toDate() : null;
  if (!d) return f === "all";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (f === "today") return d >= startOfToday;
  if (f === "yesterday") {
    const y = new Date(startOfToday); y.setDate(y.getDate() - 1);
    return d >= y && d < startOfToday;
  }
  if (f === "week") {
    const w = new Date(startOfToday); w.setDate(w.getDate() - 7);
    return d >= w;
  }
  if (f === "month") return d >= new Date(now.getFullYear(), now.getMonth(), 1);
  return true;
}

function label(f) {
  return { today: "Today", yesterday: "Yesterday", week: "This Week", month: "This Month", all: "All" }[f];
}
function stat(label, value) {
  return `<div class="col-6 col-md-3"><div class="card"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold">${value}</div>
  </div></div></div>`;
}
function num(n) {
  return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
