import {
  listExpenses, createExpense, deleteExpense, EXPENSE_CATEGORIES,
  listCashTransactions, buildCashBook
} from "../expenses.js";
import { getSettings } from "../settings.js";
import { formatDate } from "../invoice.js";
import { state, can } from "../auth.js";

let SETTINGS = null;
let tab = "expenses";

export async function renderExpenses(container) {
  SETTINGS = await getSettings();

  container.innerHTML = `
    <div class="page-title">Expenses &amp; Cash</div>
    <div class="btn-group btn-group-sm mb-3">
      <button class="btn ${tab === "expenses" ? "btn-dark" : "btn-outline-dark"}" data-tab="expenses">Expenses</button>
      <button class="btn ${tab === "cash" ? "btn-dark" : "btn-outline-dark"}" data-tab="cash">Cash Book</button>
    </div>
    <div id="expBody"></div>`;

  container.querySelectorAll("[data-tab]").forEach(b =>
    b.addEventListener("click", () => { tab = b.dataset.tab; renderExpenses(container); })
  );

  if (tab === "expenses") await renderExpenseTab(container);
  else await renderCashTab(container);
}

async function renderExpenseTab(container) {
  const expenses = await listExpenses();
  const canEdit = can("expenses", "edit");
  const canDelete = can("expenses", "delete");
  const body = document.getElementById("expBody");

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCat = {};
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });

  body.innerHTML = `
    ${canEdit ? `
    <div class="card mb-3">
      <div class="card-header">Record Expense</div>
      <div class="card-body row g-2">
        <div class="col-md-2"><input type="date" class="form-control form-control-sm" id="exDate" value="${today()}"></div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" id="exCategory">
            ${EXPENSE_CATEGORIES.map(c => `<option>${c}</option>`).join("")}
          </select>
        </div>
        <div class="col-md-3"><input class="form-control form-control-sm" id="exDesc" placeholder="Description"></div>
        <div class="col-md-2"><input type="number" step="0.01" class="form-control form-control-sm" id="exAmount" placeholder="Amount"></div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" id="exMethod">
            ${(SETTINGS.paymentMethods || ["Cash"]).filter(m => m !== "Credit").map(m => `<option>${m}</option>`).join("")}
          </select>
        </div>
        <div class="col-md-1"><button class="btn btn-sm btn-primary w-100" id="exSave">Add</button></div>
        <div class="col-12"><div id="exError" class="alert alert-danger py-1 small d-none mb-0"></div></div>
      </div>
    </div>` : ""}

    <div class="row g-2 mb-3">
      ${stat("Total Expenses", "Rs. " + num(total))}
      ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => stat(k, "Rs. " + num(v))).join("")}
    </div>

    <div class="card"><div class="card-body p-0">
      <table class="table table-sm mb-0">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th class="text-end">Amount</th><th></th></tr></thead>
        <tbody>
          ${expenses.map(e => `<tr>
            <td class="small">${formatDate(e.date)}</td>
            <td>${esc(e.category)}</td>
            <td class="small">${esc(e.description)}</td>
            <td class="small">${esc(e.method)}</td>
            <td class="text-end">${num(e.amount)}</td>
            <td class="text-end">${canDelete ? `<button class="btn btn-sm btn-outline-danger" data-ex-del="${e.id}">Del</button>` : ""}</td>
          </tr>`).join("") || `<tr><td colspan="6" class="p-3 text-muted">No expenses recorded.</td></tr>`}
        </tbody>
      </table>
    </div></div>`;

  if (canEdit) {
    document.getElementById("exSave").addEventListener("click", async () => {
      const err = document.getElementById("exError");
      err.classList.add("d-none");
      try {
        await createExpense({
          date: document.getElementById("exDate").value,
          category: document.getElementById("exCategory").value,
          description: document.getElementById("exDesc").value,
          amount: Number(document.getElementById("exAmount").value),
          method: document.getElementById("exMethod").value
        }, state.user.uid);
        renderExpenses(container);
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove("d-none");
      }
    });
  }

  body.querySelectorAll("[data-ex-del]").forEach(b =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this expense? The cash entry is kept for audit.")) return;
      await deleteExpense(b.dataset.exDel, state.user.uid);
      renderExpenses(container);
    })
  );
}

async function renderCashTab(container) {
  const txns = await listCashTransactions();
  const body = document.getElementById("expBody");
  const dateStr = body.dataset.date || today();
  const cb = buildCashBook(txns, dateStr);

  body.innerHTML = `
    <div class="card mb-3">
      <div class="card-body">
        <div class="d-flex gap-2 align-items-end mb-3">
          <div><label class="form-label small mb-0">Date</label><input type="date" class="form-control form-control-sm" id="cbDate" value="${dateStr}"></div>
          <button class="btn btn-sm btn-outline-primary" id="cbLoad">Show</button>
        </div>
        <div class="row g-2">
          ${stat("Opening Cash", "Rs. " + num(cb.openingCash))}
          ${stat("Cash Sales", "Rs. " + num(cb.cashSales))}
          ${stat("Customer Payments", "Rs. " + num(cb.customerPayments))}
          ${stat("Other Income", "Rs. " + num(cb.otherIn))}
          ${stat("Expenses", "Rs. " + num(cb.expenses))}
          ${stat("Supplier Payments", "Rs. " + num(cb.supplierPayments))}
          ${stat("Purchases", "Rs. " + num(cb.purchases))}
          ${stat("Refunds", "Rs. " + num(cb.refunds))}
          ${stat("Total In", "Rs. " + num(cb.totalIn), "text-success")}
          ${stat("Total Out", "Rs. " + num(cb.totalOut), "text-danger")}
          ${stat("Closing Cash", "Rs. " + num(cb.closingCash), "fw-bold")}
        </div>
      </div>
    </div>

    <div class="card"><div class="card-header">Transactions on ${dateStr}</div><div class="card-body p-0">
      <table class="table table-sm mb-0">
        <thead><tr><th>Time</th><th>Direction</th><th>Source</th><th>Method</th><th>Reference</th><th class="text-end">Amount</th></tr></thead>
        <tbody>
          ${cb.transactions.map(t => `<tr>
            <td class="small">${formatDate(t.at)}</td>
            <td><span class="badge ${t.direction === "IN" ? "bg-success" : "bg-danger"}">${t.direction}</span></td>
            <td class="small">${esc(t.source)}</td>
            <td class="small">${esc(t.method)}</td>
            <td class="small">${esc(t.reference || "")}</td>
            <td class="text-end">${num(t.amount)}</td>
          </tr>`).join("") || `<tr><td colspan="6" class="p-3 text-muted">No transactions on this date.</td></tr>`}
        </tbody>
      </table>
    </div></div>`;

  document.getElementById("cbLoad").addEventListener("click", () => {
    body.dataset.date = document.getElementById("cbDate").value;
    renderCashTab(container);
  });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function stat(label, value, cls = "") {
  return `<div class="col-6 col-md-2"><div class="card"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold ${cls}">${value}</div></div></div></div>`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
