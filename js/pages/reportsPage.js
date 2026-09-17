import { loadReportData, REPORTS, rangePreset, profitAndLoss, toCSV, downloadFile, printTable } from "../reports.js";
import { getSettings } from "../settings.js";
import { can } from "../auth.js";

let DATA = null, SETTINGS = null;
let activeReport = "daily_sales";
let preset = "month";
let customFrom = "", customTo = "";

export async function renderReports(container) {
  container.innerHTML = `<div class="page-title">Reports</div><div class="text-muted">Loading data...</div>`;
  SETTINGS = await getSettings();
  DATA = await loadReportData();
  draw(container);
}

function draw(container) {
  const { from, to } = currentRange();
  const def = REPORTS[activeReport];
  const result = def.build(DATA, from, to);

  container.innerHTML = `
    <div class="page-title">Reports</div>

    <div class="card mb-3"><div class="card-body">
      <div class="row g-2 align-items-end">
        <div class="col-md-4">
          <label class="form-label small mb-0">Report</label>
          <select class="form-select form-select-sm" id="repSelect">
            ${Object.entries(REPORTS).map(([k, v]) => `<option value="${k}" ${k === activeReport ? "selected" : ""}>${v.label}</option>`).join("")}
            <option value="profit_loss" ${activeReport === "profit_loss" ? "selected" : ""}>Profit &amp; Loss</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-0">Period</label>
          <select class="form-select form-select-sm" id="repPreset">
            ${["today", "yesterday", "week", "month", "year", "all", "custom"].map(p =>
              `<option value="${p}" ${p === preset ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`).join("")}
          </select>
        </div>
        <div class="col-md-2 ${preset === "custom" ? "" : "d-none"}" id="fromWrap">
          <label class="form-label small mb-0">From</label><input type="date" class="form-control form-control-sm" id="repFrom" value="${customFrom}">
        </div>
        <div class="col-md-2 ${preset === "custom" ? "" : "d-none"}" id="toWrap">
          <label class="form-label small mb-0">To</label><input type="date" class="form-control form-control-sm" id="repTo" value="${customTo}">
        </div>
        <div class="col-md-3 d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" id="repPrint">Print</button>
          <button class="btn btn-sm btn-outline-secondary" id="repCSV">CSV</button>
          <button class="btn btn-sm btn-outline-secondary" id="repRefresh">Refresh</button>
        </div>
      </div>
      <div class="mt-2">
        <input class="form-control form-control-sm" id="repSearch" placeholder="Search within this report...">
      </div>
    </div></div>

    <div id="reportOutput"></div>
  `;

  const out = document.getElementById("reportOutput");
  if (activeReport === "profit_loss") {
    out.innerHTML = renderPL(profitAndLoss(DATA, from, to));
  } else {
    out.innerHTML = renderTable(def.label, result);
  }

  document.getElementById("repSelect").addEventListener("change", (e) => { activeReport = e.target.value; draw(container); });
  document.getElementById("repPreset").addEventListener("change", (e) => { preset = e.target.value; draw(container); });
  document.getElementById("repFrom")?.addEventListener("change", (e) => { customFrom = e.target.value; draw(container); });
  document.getElementById("repTo")?.addEventListener("change", (e) => { customTo = e.target.value; draw(container); });
  document.getElementById("repRefresh").addEventListener("click", () => renderReports(container));

  document.getElementById("repSearch").addEventListener("input", (e) => {
    const t = e.target.value.toLowerCase();
    out.querySelectorAll("tbody tr").forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(t) ? "" : "none";
    });
  });

  document.getElementById("repPrint").addEventListener("click", () => {
    if (activeReport === "profit_loss") {
      const pl = profitAndLoss(DATA, from, to);
      printTable("Profit & Loss", ["Item", "Amount"], plRows(pl), SETTINGS);
    } else {
      printTable(def.label, result.headers, result.rows, SETTINGS);
    }
  });

  document.getElementById("repCSV").addEventListener("click", () => {
    if (!can("reports", "export")) { alert("You do not have export permission."); return; }
    if (activeReport === "profit_loss") {
      const pl = profitAndLoss(DATA, from, to);
      downloadFile("profit-loss.csv", toCSV(["Item", "Amount"], plRows(pl)));
    } else {
      downloadFile(`${activeReport}.csv`, toCSV(result.headers, result.rows));
    }
  });
}

function currentRange() {
  if (preset === "custom") {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to: customTo ? new Date(new Date(customTo).getTime() + 86400000) : null
    };
  }
  return rangePreset(preset);
}

function renderTable(title, { headers, rows }) {
  return `<div class="card"><div class="card-header d-flex justify-content-between">
    <span>${title}</span><span class="text-muted small">${rows.length} rows</span>
  </div><div class="card-body p-0" style="max-height:60vh;overflow:auto">
    <table class="table table-sm table-striped mb-0">
      <thead class="table-light sticky-top"><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${fmt(c)}</td>`).join("")}</tr>`).join("") ||
        `<tr><td colspan="${headers.length}" class="p-3 text-muted">No data for this period.</td></tr>`}</tbody>
    </table>
  </div></div>`;
}

function plRows(pl) {
  return [
    ["Total Sales", pl.totalSales],
    ["Less: Sales Returns", pl.salesReturns],
    ["Net Sales", pl.netSales],
    ["Less: Cost of Goods Sold", pl.cogs],
    ["Gross Profit", pl.grossProfit],
    ["Less: Total Expenses", pl.totalExpenses],
    ["Net Profit", pl.netProfit],
    ["Gross Margin %", pl.marginPercent],
    ["Invoices", pl.invoiceCount]
  ];
}

function renderPL(pl) {
  const line = (label, value, cls = "") =>
    `<div class="d-flex justify-content-between py-1 ${cls}"><span>${label}</span><span>Rs. ${num(value)}</span></div>`;

  return `
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card"><div class="card-header">Profit &amp; Loss</div><div class="card-body">
          ${line("Total Sales", pl.totalSales)}
          ${line("Less: Sales Returns", pl.salesReturns, "text-danger")}
          <div class="border-top my-1"></div>
          ${line("Net Sales", pl.netSales, "fw-semibold")}
          ${line("Less: Cost of Goods Sold", pl.cogs, "text-danger")}
          <div class="border-top my-1"></div>
          ${line("Gross Profit", pl.grossProfit, "fw-semibold text-success")}
          ${line("Less: Total Expenses", pl.totalExpenses, "text-danger")}
          <div class="border-top my-1"></div>
          ${line("Net Profit", pl.netProfit, `fw-bold fs-5 ${pl.netProfit >= 0 ? "text-success" : "text-danger"}`)}
          <div class="small text-muted mt-2">Gross margin ${pl.marginPercent}% across ${pl.invoiceCount} invoices.</div>
        </div></div>
      </div>
      <div class="col-md-6">
        <div class="card"><div class="card-header">Expense Breakdown</div><div class="card-body p-0">
          <table class="table table-sm mb-0">
            <tbody>${pl.expenseBreakdown.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="text-end">${num(v)}</td></tr>`).join("") ||
              `<tr><td class="p-3 text-muted">No expenses in this period.</td></tr>`}</tbody>
          </table>
        </div></div>
      </div>
    </div>`;
}

function fmt(v) {
  return typeof v === "number" ? num(v) : esc(v);
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
