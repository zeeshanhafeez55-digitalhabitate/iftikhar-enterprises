import {
  listDeliveries, createDelivery, updateDeliveryStatus, deleteDelivery, DELIVERY_STATUSES,
  listCustomOrders, createCustomOrder, updateCustomOrder, deleteCustomOrder, ORDER_STATUSES
} from "../orders.js";
import { listCustomers } from "../customers.js";
import { calcCustomMattress } from "../pricing.js";
import { state, can } from "../auth.js";

let tab = "delivery";
let CUSTOMERS = [];

export async function renderOrders(container) {
  CUSTOMERS = await listCustomers();

  container.innerHTML = `
    <div class="page-title">Orders &amp; Delivery</div>
    <div class="btn-group btn-group-sm mb-3">
      <button class="btn ${tab === "delivery" ? "btn-dark" : "btn-outline-dark"}" data-tab="delivery">Deliveries</button>
      <button class="btn ${tab === "custom" ? "btn-dark" : "btn-outline-dark"}" data-tab="custom">Custom Mattress Orders</button>
    </div>
    <div id="ordersBody"></div>
  `;

  container.querySelectorAll("[data-tab]").forEach(b =>
    b.addEventListener("click", () => { tab = b.dataset.tab; renderOrders(container); })
  );

  if (tab === "delivery") await renderDeliveries(container);
  else await renderCustomOrders(container);
}

// ---------- Deliveries ----------

async function renderDeliveries(container) {
  const deliveries = await listDeliveries();
  const body = document.getElementById("ordersBody");
  const canEdit = can("sales", "edit");

  const counts = DELIVERY_STATUSES.reduce((a, s) => ({ ...a, [s]: deliveries.filter(d => d.status === s).length }), {});

  body.innerHTML = `
    <div class="row g-2 mb-3">
      ${DELIVERY_STATUSES.map(s => stat(s, counts[s] || 0)).join("")}
    </div>

    ${canEdit ? `
    <div class="card mb-3">
      <div class="card-header">New Delivery</div>
      <div class="card-body row g-2">
        <div class="col-md-3"><input class="form-control form-control-sm" id="dlCustomer" placeholder="Customer name"></div>
        <div class="col-md-2"><input class="form-control form-control-sm" id="dlPhone" placeholder="Phone"></div>
        <div class="col-md-3"><input class="form-control form-control-sm" id="dlAddress" placeholder="Delivery address"></div>
        <div class="col-md-2"><input type="date" class="form-control form-control-sm" id="dlDate"></div>
        <div class="col-md-2"><input class="form-control form-control-sm" id="dlInvoice" placeholder="Invoice # (optional)"></div>
        <div class="col-md-2"><input class="form-control form-control-sm" id="dlDriver" placeholder="Driver"></div>
        <div class="col-md-2"><input class="form-control form-control-sm" id="dlVehicle" placeholder="Vehicle"></div>
        <div class="col-md-2"><input type="number" step="0.01" class="form-control form-control-sm" id="dlCharges" placeholder="Charges"></div>
        <div class="col-md-4"><input class="form-control form-control-sm" id="dlNotes" placeholder="Notes"></div>
        <div class="col-md-2"><button class="btn btn-sm btn-primary w-100" id="dlSave">Add Delivery</button></div>
      </div>
    </div>` : ""}

    <div class="card"><div class="card-body p-0">
      <table class="table table-sm mb-0">
        <thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th>Date</th><th>Driver</th><th>Vehicle</th><th class="text-end">Charges</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${deliveries.map(d => `<tr>
            <td>${esc(d.customerName)}${d.invoiceNo ? `<div class="small text-muted">${esc(d.invoiceNo)}</div>` : ""}</td>
            <td class="small">${esc(d.phone || "")}</td>
            <td class="small">${esc(d.address || "")}</td>
            <td class="small">${esc(d.date || "")}</td>
            <td class="small">${esc(d.driver || "")}</td>
            <td class="small">${esc(d.vehicle || "")}</td>
            <td class="text-end">${num(d.charges)}</td>
            <td>
              <select class="form-select form-select-sm dl-status" data-id="${d.id}" ${canEdit ? "" : "disabled"}>
                ${DELIVERY_STATUSES.map(s => `<option ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
            <td class="text-end">${canEdit ? `<button class="btn btn-sm btn-outline-danger" data-dl-del="${d.id}">Del</button>` : ""}</td>
          </tr>`).join("") || `<tr><td colspan="9" class="p-3 text-muted">No deliveries scheduled.</td></tr>`}
        </tbody>
      </table>
    </div></div>`;

  if (canEdit) {
    document.getElementById("dlSave").addEventListener("click", async () => {
      const name = document.getElementById("dlCustomer").value.trim();
      if (!name) return;
      await createDelivery({
        customerName: name,
        phone: document.getElementById("dlPhone").value,
        address: document.getElementById("dlAddress").value,
        date: document.getElementById("dlDate").value,
        invoiceNo: document.getElementById("dlInvoice").value,
        driver: document.getElementById("dlDriver").value,
        vehicle: document.getElementById("dlVehicle").value,
        charges: Number(document.getElementById("dlCharges").value) || 0,
        notes: document.getElementById("dlNotes").value
      }, state.user.uid);
      renderOrders(container);
    });

    body.querySelectorAll(".dl-status").forEach(sel =>
      sel.addEventListener("change", async () => {
        await updateDeliveryStatus(sel.dataset.id, sel.value, state.user.uid);
      })
    );
    body.querySelectorAll("[data-dl-del]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Delete this delivery?")) return;
        await deleteDelivery(b.dataset.dlDel, state.user.uid);
        renderOrders(container);
      })
    );
  }
}

// ---------- Custom orders ----------

async function renderCustomOrders(container) {
  const orders = await listCustomOrders();
  const body = document.getElementById("ordersBody");
  const canEdit = can("sales", "create");

  body.innerHTML = `
    ${canEdit ? `
    <div class="card mb-3">
      <div class="card-header">New Custom Mattress Order</div>
      <div class="card-body">
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label small mb-0">Customer</label>
            <select class="form-select form-select-sm" id="coCustomer">
              <option value="">Walk-in</option>
              ${CUSTOMERS.map(c => `<option value="${c.id}" data-phone="${esc(c.phone || "")}">${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-3"><label class="form-label small mb-0">Product / Description</label><input class="form-control form-control-sm" id="coDesc"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Quality</label><input class="form-control form-control-sm" id="coQuality"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Cover / Color</label><input class="form-control form-control-sm" id="coColor"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Quantity</label><input type="number" class="form-control form-control-sm co-calc" id="coQty" value="1"></div>

          <div class="col-md-2"><label class="form-label small mb-0">Length (in)</label><input type="number" class="form-control form-control-sm co-calc" id="coL"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Width (in)</label><input type="number" class="form-control form-control-sm co-calc" id="coW"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Thickness (in)</label><input type="number" class="form-control form-control-sm co-calc" id="coT"></div>
          <div class="col-md-2">
            <label class="form-label small mb-0">Price By</label>
            <select class="form-select form-select-sm co-calc" id="coMethod">
              <option value="sqft">Sq. Ft.</option><option value="cuft">Cu. Ft.</option><option value="piece">Piece</option>
            </select>
          </div>
          <div class="col-md-2"><label class="form-label small mb-0">Rate</label><input type="number" step="0.01" class="form-control form-control-sm co-calc" id="coRate"></div>
          <div class="col-md-2"><label class="form-label small mb-0">Advance</label><input type="number" step="0.01" class="form-control form-control-sm co-calc" id="coAdvance" value="0"></div>

          <div class="col-md-3"><label class="form-label small mb-0">Expected Completion</label><input type="date" class="form-control form-control-sm" id="coExpected"></div>
          <div class="col-md-3"><label class="form-label small mb-0">Delivery Date</label><input type="date" class="form-control form-control-sm" id="coDelivery"></div>
          <div class="col-md-4"><label class="form-label small mb-0">Notes</label><input class="form-control form-control-sm" id="coNotes"></div>
        </div>
        <div id="coCalc" class="small mt-2 text-muted"></div>
        <button class="btn btn-sm btn-primary mt-2" id="coSave">Create Order</button>
      </div>
    </div>` : ""}

    <div class="card"><div class="card-body p-0">
      <table class="table table-sm mb-0">
        <thead><tr><th>Customer</th><th>Description</th><th>Size</th><th class="text-end">Qty</th>
          <th class="text-end">Total</th><th class="text-end">Advance</th><th class="text-end">Remaining</th>
          <th>Expected</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${orders.map(o => `<tr>
            <td>${esc(o.customerName || "Walk-in")}<div class="small text-muted">${esc(o.customerPhone || "")}</div></td>
            <td class="small">${esc(o.productDescription)}</td>
            <td class="small">${o.length}" × ${o.width}"${o.thickness ? ` × ${o.thickness}"` : ""}</td>
            <td class="text-end">${o.quantity}</td>
            <td class="text-end">${num(o.totalAmount)}</td>
            <td class="text-end">${num(o.advance)}</td>
            <td class="text-end ${o.remaining > 0 ? "text-danger fw-semibold" : ""}">${num(o.remaining)}</td>
            <td class="small">${esc(o.expectedCompletion || "")}</td>
            <td>
              <select class="form-select form-select-sm co-status" data-id="${o.id}" ${canEdit ? "" : "disabled"}>
                ${ORDER_STATUSES.map(s => `<option ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
            <td class="text-end">${canEdit ? `<button class="btn btn-sm btn-outline-danger" data-co-del="${o.id}">Del</button>` : ""}</td>
          </tr>`).join("") || `<tr><td colspan="10" class="p-3 text-muted">No custom orders yet.</td></tr>`}
        </tbody>
      </table>
    </div></div>`;

  if (!canEdit) return;

  function refreshCalc() {
    const r = calcCustomMattress({
      lengthIn: Number(document.getElementById("coL").value) || 0,
      widthIn: Number(document.getElementById("coW").value) || 0,
      thicknessIn: Number(document.getElementById("coT").value) || 0,
      quantity: Number(document.getElementById("coQty").value) || 1,
      pricingMethod: document.getElementById("coMethod").value,
      costRate: 0,
      saleRate: Number(document.getElementById("coRate").value) || 0
    });
    const advance = Number(document.getElementById("coAdvance").value) || 0;
    document.getElementById("coCalc").innerHTML =
      `Area <strong>${r.areaSqFt}</strong> sqft · Volume <strong>${r.volumeCuFt}</strong> cuft ·
       Unit price <strong>${num(r.unitPrice)}</strong> · Total <strong>Rs. ${num(r.totalPrice)}</strong> ·
       Remaining <strong>Rs. ${num(r.totalPrice - advance)}</strong>`;
    return r;
  }

  body.querySelectorAll(".co-calc").forEach(el => el.addEventListener("input", refreshCalc));
  refreshCalc();

  document.getElementById("coSave").addEventListener("click", async () => {
    const r = refreshCalc();
    const sel = document.getElementById("coCustomer");
    await createCustomOrder({
      customerId: sel.value || null,
      customerName: sel.selectedOptions[0]?.textContent.trim() || "Walk-in",
      customerPhone: sel.selectedOptions[0]?.dataset.phone || "",
      productDescription: document.getElementById("coDesc").value,
      length: document.getElementById("coL").value,
      width: document.getElementById("coW").value,
      thickness: document.getElementById("coT").value,
      quality: document.getElementById("coQuality").value,
      coverColor: document.getElementById("coColor").value,
      quantity: document.getElementById("coQty").value,
      rate: r.unitPrice,
      advance: document.getElementById("coAdvance").value,
      expectedCompletion: document.getElementById("coExpected").value,
      deliveryDate: document.getElementById("coDelivery").value,
      notes: document.getElementById("coNotes").value
    }, state.user.uid);
    renderOrders(container);
  });

  body.querySelectorAll(".co-status").forEach(sel =>
    sel.addEventListener("change", async () => {
      await updateCustomOrder(sel.dataset.id, { status: sel.value }, state.user.uid);
    })
  );
  body.querySelectorAll("[data-co-del]").forEach(b =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this order?")) return;
      await deleteCustomOrder(b.dataset.coDel, state.user.uid);
      renderOrders(container);
    })
  );
}

function stat(label, value) {
  return `<div class="col-6 col-md-2"><div class="card"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold">${value}</div></div></div></div>`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
