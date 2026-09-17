import { listProducts } from "../products.js";
import { listSuppliers } from "../suppliers.js";
import { computePurchaseTotals, createPurchase, recentPurchases, getPurchase } from "../purchases.js";
import { getSettings } from "../settings.js";
import { formatDate } from "../invoice.js";
import { state, can } from "../auth.js";

let PRODUCTS = [], SUPPLIERS = [], SETTINGS = null;
let lines = [];

export async function renderPurchases(container) {
  SETTINGS = await getSettings();
  [PRODUCTS, SUPPLIERS] = await Promise.all([listProducts(), listSuppliers()]);
  const history = await recentPurchases();
  const canEdit = can("purchases", "edit");

  container.innerHTML = `
    <div class="page-title">Purchases</div>

    ${canEdit ? `
    <div class="card mb-3">
      <div class="card-header">New Purchase</div>
      <div class="card-body">
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Supplier</label>
            <select class="form-select form-select-sm" id="purSupplier">
              <option value="">Cash Supplier</option>
              ${SUPPLIERS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-3"><label class="form-label small mb-0">Date</label><input type="date" class="form-control form-control-sm" id="purDate" value="${today()}"></div>
          <div class="col-md-3">
            <label class="form-label small mb-0">Payment Method</label>
            <select class="form-select form-select-sm" id="purMethod">
              ${(SETTINGS.paymentMethods || ["Cash"]).map(m => `<option>${m}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="row g-2 align-items-end border-top pt-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Product</label>
            <select class="form-select form-select-sm" id="purProduct">
              ${PRODUCTS.map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(p.sku)}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-2"><label class="form-label small mb-0">Qty</label><input type="number" step="0.01" class="form-control form-control-sm" id="purQty" value="1"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Rate</label><input type="number" step="0.01" class="form-control form-control-sm" id="purRate"></div>
          <div class="col-md-2"><button class="btn btn-sm btn-outline-primary w-100" id="purAddLine">Add Line</button></div>
        </div>

        <table class="table table-sm mt-3 mb-2">
          <thead><tr><th>Product</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Amount</th><th></th></tr></thead>
          <tbody id="purLines"></tbody>
        </table>

        <div class="row g-2">
          <div class="col-md-2"><label class="form-label small mb-0">Discount</label><input type="number" step="0.01" class="form-control form-control-sm ptot" id="purDiscount" value="0"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Additional Expenses</label><input type="number" step="0.01" class="form-control form-control-sm ptot" id="purExpenses" value="0"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Paid Amount</label><input type="number" step="0.01" class="form-control form-control-sm ptot" id="purPaid" value="0"></div>
          <div class="col-md-4"><label class="form-label small mb-0">Notes</label><input class="form-control form-control-sm" id="purNotes"></div>
        </div>

        <div id="purTotals" class="small mt-2"></div>
        <div id="purError" class="alert alert-danger py-1 small d-none mt-2"></div>
        <button class="btn btn-success btn-sm mt-2" id="purSave">Confirm Purchase (adds stock)</button>
      </div>
    </div>` : ""}

    <div class="card">
      <div class="card-header">Purchase History</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr><th>Purchase #</th><th>Date</th><th>Supplier</th><th>Method</th>
            <th class="text-end">Total</th><th class="text-end">Paid</th><th class="text-end">Payable</th><th></th></tr></thead>
          <tbody>
            ${history.map(p => `<tr>
              <td>${esc(p.purchaseNo)}</td>
              <td class="small">${formatDate(p.createdAt)}</td>
              <td>${esc(p.supplierName)}</td>
              <td class="small">${esc(p.paymentMethod || "")}</td>
              <td class="text-end">${num(p.grandTotal)}</td>
              <td class="text-end">${num(p.paidAmount)}</td>
              <td class="text-end ${p.remaining > 0 ? "text-danger fw-semibold" : ""}">${num(p.remaining)}</td>
              <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-view="${p.id}">View</button></td>
            </tr>`).join("") || `<tr><td colspan="8" class="p-3 text-muted">No purchases yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div id="purModalHost"></div>
  `;

  if (canEdit) {
    renderLines();
    recalcPurchase();
    document.getElementById("purProduct").addEventListener("change", (e) => {
      const p = PRODUCTS.find(x => x.id === e.target.value);
      if (p) document.getElementById("purRate").value = p.purchasePrice || p.costPrice || "";
    });
    document.getElementById("purProduct").dispatchEvent(new Event("change"));
    document.getElementById("purAddLine").addEventListener("click", addLine);
    container.querySelectorAll(".ptot").forEach(el => el.addEventListener("input", recalcPurchase));
    document.getElementById("purSave").addEventListener("click", () => savePurchase(container));
  }

  container.querySelectorAll("[data-view]").forEach(b =>
    b.addEventListener("click", async () => showPurchase(await getPurchase(b.dataset.view)))
  );
}

function addLine() {
  const pid = document.getElementById("purProduct").value;
  const p = PRODUCTS.find(x => x.id === pid);
  const qty = Number(document.getElementById("purQty").value) || 0;
  const rate = Number(document.getElementById("purRate").value) || 0;
  if (!p || qty <= 0 || rate < 0) return;

  lines.push({ productId: p.id, productName: p.name, sku: p.sku, qty, rate });
  document.getElementById("purQty").value = 1;
  renderLines();
  recalcPurchase();
}

function renderLines() {
  const body = document.getElementById("purLines");
  if (!body) return;
  body.innerHTML = lines.map((l, i) => `<tr>
    <td class="small">${esc(l.productName)}</td>
    <td class="text-end">${l.qty}</td>
    <td class="text-end">${num(l.rate)}</td>
    <td class="text-end">${num(l.qty * l.rate)}</td>
    <td><button class="btn btn-sm btn-outline-danger" data-rm="${i}">×</button></td>
  </tr>`).join("") || `<tr><td colspan="5" class="text-muted small p-2">No lines added.</td></tr>`;

  body.querySelectorAll("[data-rm]").forEach(b =>
    b.addEventListener("click", () => { lines.splice(Number(b.dataset.rm), 1); renderLines(); recalcPurchase(); })
  );
}

function purchaseTotals() {
  return computePurchaseTotals({
    items: lines,
    discount: Number(document.getElementById("purDiscount").value) || 0,
    additionalExpenses: Number(document.getElementById("purExpenses").value) || 0,
    paidAmount: Number(document.getElementById("purPaid").value) || 0
  });
}

function recalcPurchase() {
  const t = purchaseTotals();
  document.getElementById("purTotals").innerHTML = `
    Subtotal <strong>${num(t.subtotal)}</strong> ·
    Discount <strong>${num(t.discount)}</strong> ·
    Expenses <strong>${num(t.additionalExpenses)}</strong> ·
    Grand Total <strong>Rs. ${num(t.grandTotal)}</strong> ·
    Paid <strong>${num(t.paidAmount)}</strong> ·
    Payable <strong class="text-danger">Rs. ${num(t.remaining)}</strong>`;
}

async function savePurchase(container) {
  const err = document.getElementById("purError");
  err.classList.add("d-none");
  const btn = document.getElementById("purSave");

  const totals = purchaseTotals();
  if (!lines.length) { err.textContent = "Add at least one line."; err.classList.remove("d-none"); return; }
  if (totals.paidAmount < 0) { err.textContent = "Paid amount cannot be negative."; err.classList.remove("d-none"); return; }

  const supId = document.getElementById("purSupplier").value;
  if (totals.remaining > 0 && !supId) {
    err.textContent = "Credit purchase needs a registered supplier.";
    err.classList.remove("d-none");
    return;
  }

  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await createPurchase({
      items: lines,
      totals,
      supplierId: supId || null,
      supplierName: SUPPLIERS.find(s => s.id === supId)?.name || "Cash Supplier",
      paymentMethod: document.getElementById("purMethod").value,
      notes: document.getElementById("purNotes").value,
      date: document.getElementById("purDate").value,
      userId: state.user.uid
    });
    lines = [];
    renderPurchases(container);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove("d-none");
  } finally {
    btn.disabled = false; btn.textContent = "Confirm Purchase (adds stock)";
  }
}

function showPurchase(p) {
  const host = document.getElementById("purModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">${esc(p.purchaseNo)} — ${esc(p.supplierName)}</h5></div>
        <div class="modal-body">
          <table class="table table-sm">
            <thead><tr><th>Product</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Amount</th></tr></thead>
            <tbody>${p.items.map(i => `<tr><td>${esc(i.productName)}</td><td class="text-end">${i.qty}</td><td class="text-end">${num(i.rate)}</td><td class="text-end">${num(i.amount)}</td></tr>`).join("")}</tbody>
          </table>
          <div>Grand Total: <strong>Rs. ${num(p.grandTotal)}</strong> · Paid: ${num(p.paidAmount)} · Payable: <strong class="text-danger">${num(p.remaining)}</strong></div>
          ${p.notes ? `<div class="small text-muted mt-1">${esc(p.notes)}</div>` : ""}
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-primary btn-sm" id="printPur">Print</button>
          <button class="btn btn-secondary btn-sm" id="closePur">Close</button>
        </div>
      </div></div>
    </div>`;
  document.getElementById("closePur").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("printPur").addEventListener("click", () => window.print());
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
