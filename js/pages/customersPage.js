import { listCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomer } from "../customers.js";
import { getLedger, buildStatement, receiveCustomerPayment } from "../ledger.js";
import { printStatement } from "../statement.js";
import { getSettings } from "../settings.js";
import { formatDate } from "../invoice.js";
import { state, can } from "../auth.js";

let SETTINGS = null;

export async function renderCustomers(container) {
  SETTINGS = await getSettings();
  const canEdit = can("customers", "edit");
  const canDelete = can("customers", "delete");
  const customers = await listCustomers();

  const totalReceivable = customers.reduce((s, c) => s + (Number(c.outstandingBalance) || 0), 0);

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="page-title mb-0">Customers</div>
      ${canEdit ? `<button class="btn btn-primary btn-sm" id="newCustBtn">+ Add Customer</button>` : ""}
    </div>

    <div class="row g-2 mb-3">
      ${stat("Total Customers", customers.length)}
      ${stat("Total Receivable", "Rs. " + num(totalReceivable))}
    </div>

    <input class="form-control form-control-sm mb-2" id="custSearch" placeholder="Search name or phone...">
    <div id="custFormHost"></div>

    <div class="card">
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr>
            <th>Name</th><th>Phone</th><th>City</th>
            <th class="text-end">Purchases</th><th class="text-end">Paid</th>
            <th class="text-end">Outstanding</th><th class="text-end">Limit</th><th></th>
          </tr></thead>
          <tbody id="custBody">
            ${customers.map(c => row(c, canEdit, canDelete)).join("") || `<tr><td colspan="8" class="p-3 text-muted">No customers yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div id="custModalHost"></div>
  `;

  document.getElementById("custSearch").addEventListener("input", (e) => {
    const t = e.target.value.toLowerCase();
    document.querySelectorAll("#custBody tr[data-name]").forEach(tr => {
      tr.style.display = tr.dataset.name.includes(t) || tr.dataset.phone.includes(t) ? "" : "none";
    });
  });

  document.getElementById("newCustBtn")?.addEventListener("click", () => openForm(container, null));
  container.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openForm(container, b.dataset.edit)));
  container.querySelectorAll("[data-ledger]").forEach(b => b.addEventListener("click", () => openLedger(container, b.dataset.ledger)));
  container.querySelectorAll("[data-pay]").forEach(b => b.addEventListener("click", () => openPayment(container, b.dataset.pay)));
  container.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Delete this customer?")) return;
    await deleteCustomer(b.dataset.del, state.user.uid);
    renderCustomers(container);
  }));
}

function row(c, canEdit, canDelete) {
  const over = c.creditLimit > 0 && c.outstandingBalance > c.creditLimit;
  return `<tr data-name="${escAttr(c.name)}" data-phone="${escAttr(c.phone || "")}">
    <td>${esc(c.name)}${c.fatherOrCompany ? `<div class="small text-muted">${esc(c.fatherOrCompany)}</div>` : ""}</td>
    <td>${esc(c.phone || "")}</td>
    <td>${esc(c.city || "")}</td>
    <td class="text-end">${num(c.totalPurchases)}</td>
    <td class="text-end">${num(c.totalPaid)}</td>
    <td class="text-end ${c.outstandingBalance > 0 ? "text-danger fw-semibold" : ""}">${num(c.outstandingBalance)}</td>
    <td class="text-end">${c.creditLimit ? num(c.creditLimit) : "—"} ${over ? '<span class="badge bg-danger">Over</span>' : ""}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-sm btn-outline-primary" data-ledger="${c.id}">Ledger</button>
      <button class="btn btn-sm btn-outline-success" data-pay="${c.id}">Payment</button>
      ${canEdit ? `<button class="btn btn-sm btn-outline-secondary" data-edit="${c.id}">Edit</button>` : ""}
      ${canDelete ? `<button class="btn btn-sm btn-outline-danger" data-del="${c.id}">Del</button>` : ""}
    </td>
  </tr>`;
}

async function openForm(container, id) {
  const c = id ? await getCustomer(id) : null;
  const host = document.getElementById("custFormHost");
  host.innerHTML = `
    <div class="card mb-3"><div class="card-header d-flex justify-content-between">
      ${id ? "Edit Customer" : "New Customer"}
      <button class="btn btn-sm btn-outline-secondary" id="closeCustForm">Close</button>
    </div><div class="card-body">
      <form id="custForm" class="row g-2">
        <div class="col-md-3"><label class="form-label small">Name</label><input class="form-control form-control-sm" name="name" value="${esc(c?.name)}" required></div>
        <div class="col-md-3"><label class="form-label small">Father / Company</label><input class="form-control form-control-sm" name="fatherOrCompany" value="${esc(c?.fatherOrCompany)}"></div>
        <div class="col-md-3"><label class="form-label small">Phone</label><input class="form-control form-control-sm" name="phone" value="${esc(c?.phone)}"></div>
        <div class="col-md-3"><label class="form-label small">WhatsApp</label><input class="form-control form-control-sm" name="whatsapp" value="${esc(c?.whatsapp)}"></div>
        <div class="col-md-6"><label class="form-label small">Address</label><input class="form-control form-control-sm" name="address" value="${esc(c?.address)}"></div>
        <div class="col-md-3"><label class="form-label small">City</label><input class="form-control form-control-sm" name="city" value="${esc(c?.city)}"></div>
        <div class="col-md-3"><label class="form-label small">Credit Limit</label><input type="number" step="0.01" class="form-control form-control-sm" name="creditLimit" value="${c?.creditLimit ?? 0}"></div>
        ${id ? "" : `<div class="col-md-3"><label class="form-label small">Opening Balance</label><input type="number" step="0.01" class="form-control form-control-sm" name="openingBalance" value="0"></div>`}
        <div class="col-md-6"><label class="form-label small">Notes</label><input class="form-control form-control-sm" name="notes" value="${esc(c?.notes)}"></div>
        <div class="col-12"><button class="btn btn-primary btn-sm" type="submit">${id ? "Save" : "Create"}</button></div>
      </form>
    </div></div>`;

  document.getElementById("closeCustForm").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("custForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    if (id) {
      await updateCustomer(id, {
        name: fd.name, fatherOrCompany: fd.fatherOrCompany, phone: fd.phone, whatsapp: fd.whatsapp,
        address: fd.address, city: fd.city, creditLimit: Number(fd.creditLimit) || 0, notes: fd.notes
      }, state.user.uid);
    } else {
      await createCustomer(fd, state.user.uid);
    }
    host.innerHTML = "";
    renderCustomers(container);
  });
}

async function openLedger(container, id) {
  const c = await getCustomer(id);
  const entries = await getLedger("customer", id);
  const st = buildStatement(entries, c.openingBalance || 0);
  const host = document.getElementById("custModalHost");

  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">Ledger — ${esc(c.name)}</h5></div>
          <div class="modal-body">
            <table class="table table-sm">
              <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th class="text-end">Debit</th><th class="text-end">Credit</th><th class="text-end">Balance</th></tr></thead>
              <tbody>
                <tr><td>—</td><td>Opening</td><td></td><td></td><td></td><td class="text-end">${num(st.openingBalance)}</td></tr>
                ${st.rows.map(r => `<tr>
                  <td class="small">${formatDate(r.at)}</td><td>${esc(r.type)}</td><td class="small">${esc(r.reference || "")}</td>
                  <td class="text-end">${r.debit ? num(r.debit) : ""}</td>
                  <td class="text-end">${r.credit ? num(r.credit) : ""}</td>
                  <td class="text-end">${num(r.balance)}</td></tr>`).join("")}
              </tbody>
              <tfoot><tr class="fw-bold"><td colspan="3">Closing Balance</td><td class="text-end">${num(st.totalDebit)}</td><td class="text-end">${num(st.totalCredit)}</td><td class="text-end">${num(st.closingBalance)}</td></tr></tfoot>
            </table>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-primary btn-sm" id="printStmt">Print Statement</button>
            <button class="btn btn-secondary btn-sm" id="closeLedger">Close</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("closeLedger").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("printStmt").addEventListener("click", () =>
    printStatement({ title: "Customer Statement", party: c, statement: st, settings: SETTINGS, balanceLabel: "Outstanding" })
  );
}

async function openPayment(container, id) {
  const c = await getCustomer(id);
  const host = document.getElementById("custModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Receive Payment — ${esc(c.name)}</h5></div>
        <div class="modal-body">
          <div class="mb-2">Outstanding: <strong>Rs. ${num(c.outstandingBalance)}</strong></div>
          <div id="payErr" class="alert alert-danger py-1 small d-none"></div>
          <div class="row g-2">
            <div class="col-6"><label class="form-label small mb-0">Amount</label><input type="number" step="0.01" class="form-control form-control-sm" id="payAmt"></div>
            <div class="col-6"><label class="form-label small mb-0">Method</label>
              <select class="form-select form-select-sm" id="payMethod">
                ${(SETTINGS.paymentMethods || ["Cash"]).filter(m => m !== "Credit").map(m => `<option>${m}</option>`).join("")}
              </select></div>
            <div class="col-12"><input class="form-control form-control-sm" id="payNote" placeholder="Note (optional)"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-sm" id="payCancel">Cancel</button>
          <button class="btn btn-success btn-sm" id="paySave">Record Payment</button>
        </div>
      </div></div>
    </div>`;

  document.getElementById("payCancel").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("paySave").addEventListener("click", async () => {
    const err = document.getElementById("payErr");
    err.classList.add("d-none");
    try {
      await receiveCustomerPayment({
        customerId: id,
        amount: Number(document.getElementById("payAmt").value),
        method: document.getElementById("payMethod").value,
        note: document.getElementById("payNote").value,
        userId: state.user.uid
      });
      host.innerHTML = "";
      renderCustomers(container);
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
function escAttr(v) { return esc(v).toLowerCase(); }
