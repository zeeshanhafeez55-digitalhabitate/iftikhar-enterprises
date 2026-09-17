import {
  getSettings, updateSettings, listBranches, addBranch, deleteBranch,
  listWarehouses, addWarehouse, deleteWarehouse
} from "../settings.js";
import { state, can } from "../auth.js";

export async function renderSettings(container) {
  const canEdit = can("settings", "edit");
  const settings = await getSettings();
  const branches = await listBranches();
  const warehouses = await listWarehouses();

  container.innerHTML = `
    <div class="page-title">Settings</div>

    <div class="card mb-4">
      <div class="card-header">Business Info</div>
      <div class="card-body">
        <form id="settingsForm" class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Business Name</label>
            <input class="form-control" name="businessName" value="${esc(settings.businessName)}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Phone</label>
            <input class="form-control" name="phone" value="${esc(settings.phone)}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">WhatsApp</label>
            <input class="form-control" name="whatsapp" value="${esc(settings.whatsapp)}" ${dis(canEdit)}>
          </div>
          <div class="col-md-6">
            <label class="form-label">Address</label>
            <input class="form-control" name="address" value="${esc(settings.address)}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Currency Symbol</label>
            <input class="form-control" name="currencySymbol" value="${esc(settings.currencySymbol)}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Tax %</label>
            <input type="number" step="0.01" class="form-control" name="taxPercent" value="${settings.taxPercent}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Invoice Prefix</label>
            <input class="form-control" name="invoicePrefix" value="${esc(settings.invoicePrefix)}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Next Invoice #</label>
            <input type="number" class="form-control" name="invoiceNextNumber" value="${settings.invoiceNextNumber}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Receipt Size</label>
            <select class="form-select" name="receiptSize" ${dis(canEdit)}>
              ${["A4", "80mm", "58mm"].map(s => `<option value="${s}" ${settings.receiptSize === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Low Stock Threshold</label>
            <input type="number" class="form-control" name="lowStockThreshold" value="${settings.lowStockThreshold}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Max Discount %</label>
            <input type="number" step="0.01" class="form-control" name="maxDiscountPercent" value="${settings.maxDiscountPercent}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3">
            <label class="form-label">Max Discount Amount</label>
            <input type="number" step="0.01" class="form-control" name="maxDiscountAmount" value="${settings.maxDiscountAmount}" ${dis(canEdit)}>
          </div>
          <div class="col-md-3 d-flex align-items-end">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" name="allowNegativeStock" ${settings.allowNegativeStock ? "checked" : ""} ${dis(canEdit)}>
              <label class="form-check-label">Allow Negative Stock</label>
            </div>
          </div>
          ${canEdit ? `<div class="col-12"><button class="btn btn-primary" type="submit">Save Settings</button></div>` : ""}
        </form>
      </div>
    </div>

    <div class="row">
      <div class="col-md-6">
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center">
            Branches
          </div>
          <div class="card-body">
            ${canEdit ? `
            <form id="branchForm" class="d-flex gap-2 mb-3">
              <input class="form-control" name="name" placeholder="Branch name" required>
              <input class="form-control" name="city" placeholder="City">
              <button class="btn btn-outline-primary" type="submit">Add</button>
            </form>` : ""}
            <table class="table table-sm">
              <tbody id="branchList">
                ${branches.map(b => branchRow(b, canEdit)).join("") || `<tr><td class="text-muted">No branches yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card mb-4">
          <div class="card-header">Warehouses</div>
          <div class="card-body">
            ${canEdit ? `
            <form id="warehouseForm" class="d-flex gap-2 mb-3">
              <input class="form-control" name="name" placeholder="Warehouse name" required>
              <input class="form-control" name="branchId" placeholder="Branch ID (optional)">
              <button class="btn btn-outline-primary" type="submit">Add</button>
            </form>` : ""}
            <table class="table table-sm">
              <tbody id="warehouseList">
                ${warehouses.map(w => warehouseRow(w, canEdit)).join("") || `<tr><td class="text-muted">No warehouses yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  if (canEdit) {
    document.getElementById("settingsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const patch = {
        businessName: fd.get("businessName"),
        phone: fd.get("phone"),
        whatsapp: fd.get("whatsapp"),
        address: fd.get("address"),
        currencySymbol: fd.get("currencySymbol"),
        taxPercent: Number(fd.get("taxPercent")) || 0,
        invoicePrefix: fd.get("invoicePrefix"),
        invoiceNextNumber: Number(fd.get("invoiceNextNumber")) || 1,
        receiptSize: fd.get("receiptSize"),
        lowStockThreshold: Number(fd.get("lowStockThreshold")) || 0,
        maxDiscountPercent: Number(fd.get("maxDiscountPercent")) || 0,
        maxDiscountAmount: Number(fd.get("maxDiscountAmount")) || 0,
        allowNegativeStock: fd.get("allowNegativeStock") === "on"
      };
      await updateSettings(patch, state.user.uid);
      alert("Settings saved.");
    });

    document.getElementById("branchForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await addBranch({ name: fd.get("name"), city: fd.get("city") || "" });
      renderSettings(container);
    });

    document.getElementById("warehouseForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await addWarehouse({ name: fd.get("name"), branchId: fd.get("branchId") || null });
      renderSettings(container);
    });

    container.querySelectorAll("[data-del-branch]").forEach(btn =>
      btn.addEventListener("click", async () => {
        await deleteBranch(btn.dataset.delBranch);
        renderSettings(container);
      })
    );
    container.querySelectorAll("[data-del-warehouse]").forEach(btn =>
      btn.addEventListener("click", async () => {
        await deleteWarehouse(btn.dataset.delWarehouse);
        renderSettings(container);
      })
    );
  }
}

function branchRow(b, canEdit) {
  return `<tr>
    <td>${esc(b.name)}</td>
    <td class="text-muted">${esc(b.city || "")}</td>
    ${canEdit ? `<td class="text-end"><button class="btn btn-sm btn-outline-danger" data-del-branch="${b.id}">Delete</button></td>` : ""}
  </tr>`;
}
function warehouseRow(w, canEdit) {
  return `<tr>
    <td>${esc(w.name)}</td>
    <td class="text-muted">${esc(w.branchId || "")}</td>
    ${canEdit ? `<td class="text-end"><button class="btn btn-sm btn-outline-danger" data-del-warehouse="${w.id}">Delete</button></td>` : ""}
  </tr>`;
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function dis(canEdit) {
  return canEdit ? "" : "disabled";
}
