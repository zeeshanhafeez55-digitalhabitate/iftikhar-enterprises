import { listSuppliers, createSupplier, updateSupplier, deleteSupplier, getSupplier } from "../suppliers.js";
import { getLedger, buildStatement, paySupplier } from "../ledger.js";
import { printStatement } from "../statement.js";
import { getSettings } from "../settings.js";
import { formatDate } from "../invoice.js";
import { state, can } from "../auth.js";

let SETTINGS = null;

export async function renderSuppliers(container) {
  SETTINGS = await getSettings();
  const canEdit = can("suppliers", "edit");
  const canDelete = can("suppliers", "delete");
  const suppliers = await listSuppliers();
  const totalPayable = suppliers.reduce((s, x) => s + (Number(x.payableBalance) || 0), 0);

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="page-title mb-0">Suppliers</div>
      ${canEdit ? `<button class="btn btn-primary btn-sm" id="newSupBtn">+ Add Supplier</button>` : ""}
    </div>

    <div class="row g-2 mb-3">
      ${stat("Total Suppliers", suppliers.length)}
      ${stat("Total Payable", "Rs. " + num(totalPayable))}
    </div>

    <div id="supFormHost"></div>

    <div class="card"><div class="card-body p-0">
      <table class="table table-sm mb-0">
        <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>City</th>
          <th class="text-end">Purchases</th><th class="text-end">Paid</th><th class="text-end">Payable</th><th></th></tr></thead>
        <tbody>
          ${suppliers.map(s => row(s, canEdit, canDelete)).join("") || `<tr><td colspan="8" class="p-3 text-muted">No suppliers yet.</td></tr>`}
        </tbody>
      </table>
    </div></div>

    <div id="supModalHost"></div>
  `;

  document.getElementById("newSupBtn")?.addEventListener("click", () => openForm(container, null));
  container.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openForm(container, b.dataset.edit)));
  container.querySelectorAll("[data-ledger]").forEach(b => b.addEventListener("click", () => openLedger(container, b.dataset.ledger)));
  container.querySelectorAll("[data-pay]").forEach(b => b.addEventListener("click", () => openPayment(container, b.dataset.pay)));
  container.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Delete this supplier?")) return;
    await deleteSupplier(b.dataset.del, state.user.uid);
    renderSuppliers(container);
  }));
}

function row(s, canEdit, canDelete) {
  return `<tr>
    <td>${esc(s.name)}</td>
    <td>${esc(s.contactPerson || "")}</td>
    <td>${esc(s.phone || "")}</td>
    <td>${esc(s.city || "")}</td>
    <td class="text-end">${num(s.totalPurchases)}</td>
    <td class="text-end">${num(s.totalPaid)}</td>
    <td class="text-end ${s.payableBalance > 0 ? "text-danger fw-semibold" : ""}">${num(s.payableBalance)}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-sm btn-outline-primary" data-ledger="${s.id}">Ledger</button>
      <button class="btn btn-sm btn-outline-success" data-pay="${s.id}">Pay</button>
      ${canEdit ? `<button class="btn btn-sm btn-outline-secondary" data-edit="${s.id}">Edit</button>` : ""}
      ${canDelete ? `<button class="btn btn-sm btn-outline-danger" data-del="${s.id}">Del</button>` : ""}
    </td>
  </tr>`;
}

async function openForm(container, id) {
  const s = id ? await getSupplier(id) : null;
  const host = document.getElementById("supFormHost");
  host.innerHTML = `
    <div class="card mb-3"><div class="card-header d-flex justify-content-between">
      ${id ? "Edit Supplier" : "New Supplier"}
      <button class="btn btn-sm btn-outline-secondary" id="closeSupForm">Close</button>
    </div><div class="card-body">
      <form id="supForm" class="row g-2">
        <div class="col-md-3"><label class="form-label small">Name</label><input class="form-control form-control-sm" name="name" value="${esc(s?.name)}" required></div>
        <div class="col-md-3"><label class="form-label small">Contact Person</label><input class="form-control form-control-sm" name="contactPerson" value="${esc(s?.contactPerson)}"></div>
        <div class="col-md-3"><label class="form-label small">Phone</label><input class="form-control form-control-sm" name="phone" value="${esc(s?.phone)}"></div>
        <div class="col-md-3"><label class="form-label small">WhatsApp</label><input class="form-control form-control-sm" name="whatsapp" value="${esc(s?.whatsapp)}"></div>
        <div class="col-md-6"><label class="form-label small">Address</label><input class="form-control form-control-sm" name="address" value="${esc(s?.address)}"></div>
        <div class="col-md-3"><label class="form-label small">City</label><input class="form-control form-control-sm" name="city" value="${esc(s?.city)}"></div>
        <div class="col-md-3"><label class="form-label small">Credit Limit</label><input type="number" step="0.01" class="form-control form-control-sm" name="creditLimit" value="${s?.creditLimit ?? 0}"></div>
        ${id ? "" : `<div class="col-md-3"><label class="form-label small">Opening Balance</label><input type="number" step="0.01" class="form-control form-control-sm" name="openingBalance" value="0"></div>`}
        <div class="col-md-6"><label class="form-label small">Notes</label><input class="form-control form-control-sm" name="notes" value="${esc(s?.notes)}"></div>
        <div class="col-12"><button class="btn btn-primary btn-sm" type="submit">${id ? "Save" : "Create"}</button></div>
      </form>
    </div></div>`;

  document.getElementById("closeSupForm").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("supForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    if (id) {
      await updateSupplier(id, {
        name: fd.name, contactPerson: fd.contactPerson, phone: fd.phone, whatsapp: fd.whatsapp,
        address: fd.address, city: fd.city, creditLimit: Number(fd.creditLimit) || 0, notes: fd.notes
      }, state.user.uid);
    } else {
      await createSupplier(fd, state.user.uid);
    }
    host.innerHTML = "";
    renderSuppliers(container);
  });
}

async function openLedger(container, id) {
  const s = await getSupplier(id);
  const entries = await getLedger("supplier", id);
  // For suppliers, purchases are credits (payable up), payments are debits (payable down).
  const st = buildStatement(entries.map(e => ({ ...e, debit: e.credit, credit: e.debit })), s.openingBalance || 0);
  const host = document.getElementById("supModalHost");

  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Ledger — ${esc(s.name)}</h5></div>
        <div class="modal-body">
          <table class="table table-sm">
            <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th class="text-end">Purchase</th><th class="text-end">Paid</th><th class="text-end">Payable</th></tr></thead>
            <tbody>
              <tr><td>—</td><td>Opening</td><td></td><td></td><td></td><td class="text-end">${num(st.openingBalance)}</td></tr>
              ${st.rows.map(r => `<tr>
                <td class="small">${formatDate(r.at)}</td><td>${esc(r.type)}</td><td class="small">${esc(r.reference || "")}</td>
                <td class="text-end">${r.debit ? num(r.debit) : ""}</td>
                <td class="text-end">${r.credit ? num(r.credit) : ""}</td>
                <td class="text-end">${num(r.balance)}</td></tr>`).join("")}
            </tbody>
            <tfoot><tr class="fw-bold"><td colspan="3">Closing Payable</td><td class="text-end">${num(st.totalDebit)}</td><td class="text-end">${num(st.totalCredit)}</td><td class="text-end">${num(st.closingBalance)}</td></tr></tfoot>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-primary btn-sm" id="printSupStmt">Print Statement</button>
          <button class="btn btn-secondary btn-sm" id="closeSupLedger">Close</button>
        </div>
      </div></div>
    </div>`;

  document.getElementById("closeSupLedger").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("printSupStmt").addEventListener("click", () =>
    printStatement({ title: "Supplier Statement", party: s, statement: st, settings: SETTINGS, balanceLabel: "Payable" })
  );
}

async function openPayment(container, id) {
  const s = await getSupplier(id);
  const host = document.getElementById("supModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Pay Supplier — ${esc(s.name)}</h5></div>
        <div class="modal-body">
          <div class="mb-2">Payable: <strong>Rs. ${num(s.payableBalance)}</strong></div>
          <div id="supPayErr" class="alert alert-danger py-1 small d-none"></div>
          <div class="row g-2">
            <div class="col-6"><label class="form-label small mb-0">Amount</label><input type="number" step="0.01" class="form-control form-control-sm" id="supPayAmt"></div>
            <div class="col-6"><label class="form-label small mb-0">Method</label>
              <select class="form-select form-select-sm" id="supPayMethod">
                ${(SETTINGS.paymentMethods || ["Cash"]).filter(m => m !== "Credit").map(m => `<option>${m}</option>`).join("")}
              </select></div>
            <div class="col-12"><input class="form-control form-control-sm" id="supPayNote" placeholder="Note (optional)"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-sm" id="supPayCancel">Cancel</button>
          <button class="btn btn-success btn-sm" id="supPaySave">Record Payment</button>
        </div>
      </div></div>
    </div>`;

  document.getElementById("supPayCancel").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("supPaySave").addEventListener("click", async () => {
    const err = document.getElementById("supPayErr");
    err.classList.add("d-none");
    try {
      await paySupplier({
        supplierId: id,
        amount: Number(document.getElementById("supPayAmt").value),
        method: document.getElementById("supPayMethod").value,
        note: document.getElementById("supPayNote").value,
        userId: state.user.uid
      });
      host.innerHTML = "";
      renderSuppliers(container);
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove("d-none");
    }
  });
}

function stat(label, value) {
  return `<div class="col-6 col-md-3"><div class="card"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold">${value}</div></div></div></div>`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
