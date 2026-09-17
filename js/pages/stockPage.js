import { listProducts, isLowStock } from "../products.js";
import { applyStockMovement, getProductLedger } from "../stock.js";
import { getSettings } from "../settings.js";
import { formatDate } from "../invoice.js";
import { state, can } from "../auth.js";

let SETTINGS = null;
let view = "overview";

export async function renderStock(container) {
  SETTINGS = await getSettings();
  const products = await listProducts();
  const canEdit = can("stock", "edit");

  const low = products.filter(p => isLowStock(p) && Number(p.currentStock) > 0);
  const out = products.filter(p => Number(p.currentStock) <= 0);
  const stockValue = products.reduce((s, p) => s + (Number(p.currentStock) || 0) * (Number(p.costPrice) || 0), 0);
  const saleValue = products.reduce((s, p) => s + (Number(p.currentStock) || 0) * (Number(p.salePrice) || 0), 0);
  const totalUnits = products.reduce((s, p) => s + (Number(p.currentStock) || 0), 0);

  container.innerHTML = `
    <div class="page-title">Stock</div>

    <div class="row g-2 mb-3">
      ${stat("Total Products", products.length)}
      ${stat("Total Units", num(totalUnits))}
      ${stat("Stock Value (cost)", "Rs. " + num(stockValue))}
      ${stat("Stock Value (sale)", "Rs. " + num(saleValue))}
      ${stat("Low Stock", low.length, low.length ? "text-warning" : "")}
      ${stat("Out of Stock", out.length, out.length ? "text-danger" : "")}
    </div>

    ${(low.length || out.length) ? `
    <div class="alert alert-warning">
      <strong>Stock alerts:</strong>
      ${out.length ? `<div class="small mt-1"><span class="badge bg-danger">Out</span> ${out.map(p => esc(p.name)).join(", ")}</div>` : ""}
      ${low.length ? `<div class="small mt-1"><span class="badge bg-warning text-dark">Low</span> ${low.map(p => `${esc(p.name)} (${p.currentStock})`).join(", ")}</div>` : ""}
    </div>` : ""}

    ${canEdit ? `
    <div class="card mb-3">
      <div class="card-header">Manual Stock Entry / Adjustment</div>
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label small mb-0">Product</label>
            <select class="form-select form-select-sm" id="adjProduct">
              ${products.map(p => `<option value="${p.id}">${esc(p.name)} — stock ${p.currentStock}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-0">Type</label>
            <select class="form-select form-select-sm" id="adjType">
              ${["MANUAL", "ADJUSTMENT", "DAMAGE", "EXPIRED"].map(t => `<option value="${t}">${t}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-2"><label class="form-label small mb-0">Quantity</label><input type="number" step="0.01" class="form-control form-control-sm" id="adjQty"></div>
          <div class="col-md-2"><input class="form-control form-control-sm" id="adjNote" placeholder="Reason / note"></div>
          <div class="col-md-2"><button class="btn btn-sm btn-primary w-100" id="adjSave">Apply</button></div>
        </div>
        <div class="form-text">MANUAL and ADJUSTMENT add stock; DAMAGE and EXPIRED remove it.</div>
        <div id="adjError" class="alert alert-danger py-1 small d-none mt-2"></div>
      </div>
    </div>` : ""}

    <div class="card">
      <div class="card-header">Stock by Product</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr><th>Product</th><th>SKU</th><th class="text-end">Stock</th><th class="text-end">Min</th>
            <th class="text-end">Cost</th><th class="text-end">Value</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${products.map(p => {
              const val = (Number(p.currentStock) || 0) * (Number(p.costPrice) || 0);
              const outOf = Number(p.currentStock) <= 0;
              const lowP = isLowStock(p) && !outOf;
              return `<tr class="${outOf ? "table-danger" : lowP ? "table-warning" : ""}">
                <td>${esc(p.name)}</td><td class="small">${esc(p.sku)}</td>
                <td class="text-end">${p.currentStock}</td>
                <td class="text-end">${p.minStockLevel ?? 0}</td>
                <td class="text-end">${num(p.costPrice)}</td>
                <td class="text-end">${num(val)}</td>
                <td>${outOf ? '<span class="badge bg-danger">Out</span>' : lowP ? '<span class="badge bg-warning text-dark">Low</span>' : '<span class="badge bg-success">OK</span>'}</td>
                <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-ledger="${p.id}" data-name="${escAttr(p.name)}">Ledger</button></td>
              </tr>`;
            }).join("") || `<tr><td colspan="8" class="p-3 text-muted">No products yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div id="stockModalHost"></div>
  `;

  if (canEdit) {
    document.getElementById("adjSave").addEventListener("click", async () => {
      const err = document.getElementById("adjError");
      err.classList.add("d-none");
      try {
        const qty = Number(document.getElementById("adjQty").value);
        if (!qty || qty <= 0) throw new Error("Enter a quantity greater than zero.");
        await applyStockMovement({
          productId: document.getElementById("adjProduct").value,
          type: document.getElementById("adjType").value,
          qty,
          reference: "MANUAL",
          note: document.getElementById("adjNote").value,
          userId: state.user.uid
        }, { allowNegativeStock: !!SETTINGS.allowNegativeStock });
        renderStock(container);
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove("d-none");
      }
    });
  }

  container.querySelectorAll("[data-ledger]").forEach(b =>
    b.addEventListener("click", () => openLedger(b.dataset.ledger, b.dataset.name))
  );
}

async function openLedger(productId, name) {
  const entries = await getProductLedger(productId);
  const host = document.getElementById("stockModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Stock Ledger — ${esc(name)}</h5></div>
        <div class="modal-body">
          <table class="table table-sm">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="text-end">In</th><th class="text-end">Out</th><th class="text-end">Balance</th><th class="text-end">Cost</th></tr></thead>
            <tbody>
              ${entries.map(e => `<tr>
                <td class="small">${formatDate(e.at)}</td>
                <td>${esc(e.type)}</td>
                <td class="small">${esc(e.reference || "")}${e.note ? ` — ${esc(e.note)}` : ""}</td>
                <td class="text-end text-success">${e.qtyIn || ""}</td>
                <td class="text-end text-danger">${e.qtyOut || ""}</td>
                <td class="text-end fw-semibold">${e.balance}</td>
                <td class="text-end">${e.cost ? num(e.cost) : ""}</td>
              </tr>`).join("") || `<tr><td colspan="7" class="p-3 text-muted">No movements recorded.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary btn-sm" id="closeStockLedger">Close</button></div>
      </div></div>
    </div>`;
  document.getElementById("closeStockLedger").addEventListener("click", () => { host.innerHTML = ""; });
}

function stat(label, value, cls = "") {
  return `<div class="col-6 col-md-2"><div class="card"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold ${cls}">${value}</div></div></div></div>`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escAttr(v) { return esc(v); }
