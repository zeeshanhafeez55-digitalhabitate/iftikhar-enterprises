import { db, collection, getDocs, query, where, limit } from "../firebase-init.js";
import { getSale } from "../sales.js";
import { getPurchase, recentPurchases } from "../purchases.js";
import { createSaleReturn, createPurchaseReturn, listSaleReturns, listPurchaseReturns } from "../returns.js";
import { getSettings } from "../settings.js";
import { formatDate } from "../invoice.js";
import { state, can } from "../auth.js";

let SETTINGS = null;
let tab = "sale";

export async function renderReturns(container) {
  SETTINGS = await getSettings();

  container.innerHTML = `
    <div class="page-title">Returns</div>
    <div class="btn-group btn-group-sm mb-3">
      <button class="btn ${tab === "sale" ? "btn-dark" : "btn-outline-dark"}" data-tab="sale">Sale Return</button>
      <button class="btn ${tab === "purchase" ? "btn-dark" : "btn-outline-dark"}" data-tab="purchase">Purchase Return</button>
    </div>
    <div id="returnBody"></div>
  `;

  container.querySelectorAll("[data-tab]").forEach(b =>
    b.addEventListener("click", () => { tab = b.dataset.tab; renderReturns(container); })
  );

  if (tab === "sale") await renderSaleReturnTab(container);
  else await renderPurchaseReturnTab(container);
}

// ---------- SALE RETURNS ----------

async function renderSaleReturnTab(container) {
  const history = await listSaleReturns();
  const body = document.getElementById("returnBody");

  body.innerHTML = `
    <div class="card mb-3">
      <div class="card-header">Find Invoice</div>
      <div class="card-body">
        <div class="input-group input-group-sm mb-2" style="max-width:400px">
          <input class="form-control" id="retInvoice" placeholder="Invoice number (e.g. INV-00001)">
          <button class="btn btn-primary" id="retSearch">Load Invoice</button>
        </div>
        <div id="retInvoiceBox"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Sale Return History</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Reason</th><th class="text-end">Amount</th><th class="text-end">Refunded</th></tr></thead>
          <tbody>
            ${history.map(r => `<tr>
              <td class="small">${formatDate(r.at)}</td><td>${esc(r.invoiceNo)}</td>
              <td>${esc(r.customerName)}</td><td class="small">${esc(r.reason)}</td>
              <td class="text-end">${num(r.totalAmount)}</td><td class="text-end">${num(r.refundAmount)}</td>
            </tr>`).join("") || `<tr><td colspan="6" class="p-3 text-muted">No sale returns yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("retSearch").addEventListener("click", async () => {
    const no = document.getElementById("retInvoice").value.trim();
    const box = document.getElementById("retInvoiceBox");
    if (!no) return;

    const snap = await getDocs(query(collection(db, "sales"), where("invoiceNo", "==", no), limit(1)));
    if (snap.empty) { box.innerHTML = `<div class="alert alert-warning py-2 small">No invoice found with that number.</div>`; return; }

    const sale = await getSale(snap.docs[0].id);
    renderReturnForm(container, sale, box);
  });
}

function renderReturnForm(container, sale, box) {
  box.innerHTML = `
    <div class="border rounded p-2">
      <div class="mb-2 small">
        <strong>${esc(sale.invoiceNo)}</strong> · ${esc(sale.customerName)} ·
        ${formatDate(sale.createdAt)} · Total Rs. ${num(sale.grandTotal)}
        ${sale.cancelled ? '<span class="badge bg-danger">Cancelled</span>' : ""}
      </div>
      <table class="table table-sm">
        <thead><tr><th></th><th>Item</th><th class="text-end">Sold</th><th class="text-end">Return Qty</th><th class="text-end">Rate</th><th>Restock</th></tr></thead>
        <tbody>
          ${sale.items.map((it, i) => `<tr>
            <td><input type="checkbox" class="form-check-input ret-pick" data-i="${i}"></td>
            <td class="small">${esc(it.productName)}</td>
            <td class="text-end">${it.qty}</td>
            <td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end ret-qty" data-i="${i}" value="${it.qty}" max="${it.qty}" style="width:80px"></td>
            <td class="text-end">${num(it.rate)}</td>
            <td><input type="checkbox" class="form-check-input ret-restock" data-i="${i}" checked ${it.productId ? "" : "disabled"}></td>
          </tr>`).join("")}
        </tbody>
      </table>

      <div class="row g-2">
        <div class="col-md-4"><input class="form-control form-control-sm" id="retReason" placeholder="Return reason"></div>
        <div class="col-md-2"><input type="number" step="0.01" class="form-control form-control-sm" id="retRefund" placeholder="Refund amount"></div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" id="retMethod">
            ${(SETTINGS.paymentMethods || ["Cash"]).filter(m => m !== "Credit").map(m => `<option>${m}</option>`).join("")}
          </select>
        </div>
        <div class="col-md-2 d-flex align-items-center">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="retCredit" ${sale.customerId ? "checked" : "disabled"}>
            <label class="form-check-label small">Credit customer</label>
          </div>
        </div>
        <div class="col-md-2"><button class="btn btn-sm btn-success w-100" id="retSave" ${can("sales", "refund") ? "" : "disabled"}>Process Return</button></div>
      </div>
      <div id="retError" class="alert alert-danger py-1 small d-none mt-2"></div>
      <div class="small text-muted mt-1">Selected total: <strong id="retTotal">0</strong></div>
    </div>`;

  function selected() {
    return [...box.querySelectorAll(".ret-pick")].filter(c => c.checked).map(c => {
      const i = Number(c.dataset.i);
      const it = sale.items[i];
      return {
        productId: it.productId,
        productName: it.productName,
        qty: Number(box.querySelector(`.ret-qty[data-i="${i}"]`).value) || 0,
        rate: Number(it.rate),
        costPrice: Number(it.costPrice) || 0,
        restock: box.querySelector(`.ret-restock[data-i="${i}"]`).checked
      };
    }).filter(x => x.qty > 0);
  }

  function refreshTotal() {
    const t = selected().reduce((s, i) => s + i.qty * i.rate, 0);
    box.querySelector("#retTotal").textContent = num(t);
    if (!box.querySelector("#retRefund").value) box.querySelector("#retRefund").value = t;
  }

  box.querySelectorAll(".ret-pick, .ret-qty").forEach(el => el.addEventListener("input", refreshTotal));
  box.querySelectorAll(".ret-pick").forEach(el => el.addEventListener("change", refreshTotal));

  box.querySelector("#retSave").addEventListener("click", async () => {
    const err = box.querySelector("#retError");
    err.classList.add("d-none");
    const items = selected();
    try {
      if (!items.length) throw new Error("Select at least one item.");
      for (const [idx, it] of items.entries()) {
        const orig = sale.items.find(x => x.productName === it.productName);
        if (orig && it.qty > Number(orig.qty)) throw new Error(`Return qty for ${it.productName} exceeds sold qty.`);
      }
      await createSaleReturn({
        saleId: sale.id, invoiceNo: sale.invoiceNo,
        customerId: sale.customerId, customerName: sale.customerName,
        items,
        reason: box.querySelector("#retReason").value,
        refundAmount: Number(box.querySelector("#retRefund").value) || 0,
        refundMethod: box.querySelector("#retMethod").value,
        creditCustomer: box.querySelector("#retCredit").checked,
        userId: state.user.uid
      });
      renderReturns(container);
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove("d-none");
    }
  });
}

// ---------- PURCHASE RETURNS ----------

async function renderPurchaseReturnTab(container) {
  const purchases = await recentPurchases(100);
  const history = await listPurchaseReturns();
  const body = document.getElementById("returnBody");

  body.innerHTML = `
    <div class="card mb-3">
      <div class="card-header">Select Purchase Invoice</div>
      <div class="card-body">
        <div class="input-group input-group-sm mb-2" style="max-width:500px">
          <select class="form-select" id="pretSelect">
            <option value="">Choose a purchase...</option>
            ${purchases.map(p => `<option value="${p.id}">${esc(p.purchaseNo)} — ${esc(p.supplierName)} — Rs. ${num(p.grandTotal)}</option>`).join("")}
          </select>
          <button class="btn btn-primary" id="pretLoad">Load</button>
        </div>
        <div id="pretBox"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Purchase Return History</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr><th>Date</th><th>Purchase</th><th>Supplier</th><th>Reason</th><th class="text-end">Amount</th></tr></thead>
          <tbody>
            ${history.map(r => `<tr>
              <td class="small">${formatDate(r.at)}</td><td>${esc(r.purchaseNo)}</td>
              <td>${esc(r.supplierName)}</td><td class="small">${esc(r.reason)}</td>
              <td class="text-end">${num(r.totalAmount)}</td>
            </tr>`).join("") || `<tr><td colspan="5" class="p-3 text-muted">No purchase returns yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById("pretLoad").addEventListener("click", async () => {
    const id = document.getElementById("pretSelect").value;
    const box = document.getElementById("pretBox");
    if (!id) return;
    const p = await getPurchase(id);

    box.innerHTML = `
      <div class="border rounded p-2">
        <table class="table table-sm">
          <thead><tr><th></th><th>Item</th><th class="text-end">Bought</th><th class="text-end">Return Qty</th><th class="text-end">Rate</th></tr></thead>
          <tbody>
            ${p.items.map((it, i) => `<tr>
              <td><input type="checkbox" class="form-check-input pret-pick" data-i="${i}"></td>
              <td class="small">${esc(it.productName)}</td>
              <td class="text-end">${it.qty}</td>
              <td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end pret-qty" data-i="${i}" value="${it.qty}" style="width:80px"></td>
              <td class="text-end">${num(it.rate)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div class="row g-2">
          <div class="col-md-6"><input class="form-control form-control-sm" id="pretReason" placeholder="Return reason"></div>
          <div class="col-md-3"><button class="btn btn-sm btn-success w-100" id="pretSave">Process Return</button></div>
        </div>
        <div id="pretError" class="alert alert-danger py-1 small d-none mt-2"></div>
      </div>`;

    box.querySelector("#pretSave").addEventListener("click", async () => {
      const err = box.querySelector("#pretError");
      err.classList.add("d-none");
      const items = [...box.querySelectorAll(".pret-pick")].filter(c => c.checked).map(c => {
        const i = Number(c.dataset.i);
        const it = p.items[i];
        return {
          productId: it.productId, productName: it.productName,
          qty: Number(box.querySelector(`.pret-qty[data-i="${i}"]`).value) || 0,
          rate: Number(it.rate)
        };
      }).filter(x => x.qty > 0);

      try {
        if (!items.length) throw new Error("Select at least one item.");
        await createPurchaseReturn({
          purchaseId: p.id, purchaseNo: p.purchaseNo,
          supplierId: p.supplierId, supplierName: p.supplierName,
          items, reason: box.querySelector("#pretReason").value,
          userId: state.user.uid
        });
        renderReturns(container);
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove("d-none");
      }
    });
  });
}

function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
