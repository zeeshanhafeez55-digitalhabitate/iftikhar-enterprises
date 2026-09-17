import { loadReportData, profitAndLoss, rangePreset, dailySeries, groupSum, inDateRange } from "../reports.js";
import { isLowStock } from "../products.js";
import { state } from "../auth.js";
import { round2 } from "../pricing.js";

export async function renderDashboard(container) {
  container.innerHTML = `<div class="page-title">Dashboard</div><div class="text-muted">Loading...</div>`;

  let d;
  try {
    d = await loadReportData();
  } catch (err) {
    container.innerHTML = `<div class="page-title">Dashboard</div><div class="alert alert-danger">Failed to load data: ${err.message}</div>`;
    console.error("Dashboard load error:", err);
    return;
  }
  const today = rangePreset("today");
  const month = rangePreset("month");

  const todaySales = d.sales.filter(s => !s.cancelled && inDateRange(s, today.from, today.to));
  const todayPurchases = d.purchases.filter(p => inDateRange(p, today.from, today.to));
  const todayExpenses = d.expenses.filter(e => inDateRange(e, today.from, today.to, "date"));
  const todayCash = d.cashTransactions.filter(c => inDateRange(c, today.from, today.to, "at"));
  const todayPL = profitAndLoss(d, today.from, today.to);

  const sum = (rows, f) => round2(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0));
  const cashIn = round2(todayCash.filter(c => c.direction === "IN").reduce((s, c) => s + Number(c.amount || 0), 0));
  const creditSales = round2(todaySales.reduce((s, x) => s + (Number(x.remaining) || 0), 0));
  const custPayments = round2(todayCash.filter(c => c.source === "CUSTOMER_PAYMENT").reduce((s, c) => s + Number(c.amount || 0), 0));
  const supPayments = round2(todayCash.filter(c => c.source === "SUPPLIER_PAYMENT").reduce((s, c) => s + Number(c.amount || 0), 0));

  const lowStock = d.products.filter(p => isLowStock(p) && Number(p.currentStock) > 0);
  const outStock = d.products.filter(p => Number(p.currentStock) <= 0);
  const stockValue = round2(d.products.reduce((s, p) => s + (Number(p.currentStock) || 0) * (Number(p.costPrice) || 0), 0));
  const receivables = round2(d.customers.reduce((s, c) => s + (Number(c.outstandingBalance) || 0), 0));
  const payables = round2(d.suppliers.reduce((s, x) => s + (Number(x.payableBalance) || 0), 0));

  // Month trends
  const salesSeries = dailySeries(d.sales.filter(s => !s.cancelled), "grandTotal", month.from, month.to);
  const purchaseSeries = dailySeries(d.purchases, "grandTotal", month.from, month.to);
  const monthPL = profitAndLoss(d, month.from, month.to);

  // Top products this month
  const monthSaleIds = new Set(d.sales.filter(s => !s.cancelled && inDateRange(s, month.from, month.to)).map(s => s.id));
  const prodMap = {};
  d.saleItems.filter(i => monthSaleIds.has(i.saleId)).forEach(i => {
    prodMap[i.productName] = round2((prodMap[i.productName] || 0) + (Number(i.amount) || 0));
  });
  const topProducts = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const catMap = {};
  const prodCat = Object.fromEntries(d.products.map(p => [p.id, p.categoryId]));
  d.saleItems.filter(i => monthSaleIds.has(i.saleId)).forEach(i => {
    const k = prodCat[i.productId] || "other";
    catMap[k] = round2((catMap[k] || 0) + (Number(i.amount) || 0));
  });
  const byCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  const payMap = groupSum(d.payments.filter(p => inDateRange(p, month.from, month.to, "at")), "method", "amount");

  const notifications = buildNotifications({ lowStock, outStock, d, receivables, payables });

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="page-title mb-0">Dashboard</div>
      <div class="text-muted small">${state.profile?.name || ""} · ${new Date().toLocaleDateString("en-GB")}</div>
    </div>

    ${notifications.length ? `
    <div class="alert alert-warning py-2">
      <div class="fw-semibold small mb-1">Notifications</div>
      <ul class="mb-0 small">${notifications.map(n => `<li>${n}</li>`).join("")}</ul>
    </div>` : ""}

    <div class="fw-semibold mb-2">Today</div>
    <div class="row g-2 mb-3">
      ${stat("Sales", "Rs. " + num(sum(todaySales, "grandTotal")))}
      ${stat("Purchases", "Rs. " + num(sum(todayPurchases, "grandTotal")))}
      ${stat("Expenses", "Rs. " + num(sum(todayExpenses, "amount")))}
      ${stat("Gross Profit", "Rs. " + num(todayPL.grossProfit), todayPL.grossProfit >= 0 ? "text-success" : "text-danger")}
      ${stat("Cash Received", "Rs. " + num(cashIn))}
      ${stat("Credit Sales", "Rs. " + num(creditSales))}
      ${stat("Customer Payments", "Rs. " + num(custPayments))}
      ${stat("Supplier Payments", "Rs. " + num(supPayments))}
    </div>

    <div class="row g-3 mb-3">
      <div class="col-md-4">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Inventory</div><div class="card-body py-2">
          ${line("Total Products", d.products.length)}
          ${line("Stock Value", "Rs. " + num(stockValue))}
          ${line("Low Stock", lowStock.length, lowStock.length ? "text-warning fw-semibold" : "")}
          ${line("Out of Stock", outStock.length, outStock.length ? "text-danger fw-semibold" : "")}
        </div></div>
      </div>
      <div class="col-md-4">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Customers</div><div class="card-body py-2">
          ${line("Total Customers", d.customers.length)}
          ${line("Receivables", "Rs. " + num(receivables), receivables > 0 ? "text-danger fw-semibold" : "")}
        </div></div>
      </div>
      <div class="col-md-4">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Suppliers</div><div class="card-body py-2">
          ${line("Total Suppliers", d.suppliers.length)}
          ${line("Payables", "Rs. " + num(payables), payables > 0 ? "text-danger fw-semibold" : "")}
        </div></div>
      </div>
    </div>

    <div class="fw-semibold mb-2">This Month</div>
    <div class="row g-2 mb-3">
      ${stat("Net Sales", "Rs. " + num(monthPL.netSales))}
      ${stat("COGS", "Rs. " + num(monthPL.cogs))}
      ${stat("Gross Profit", "Rs. " + num(monthPL.grossProfit), "text-success")}
      ${stat("Expenses", "Rs. " + num(monthPL.totalExpenses))}
      ${stat("Net Profit", "Rs. " + num(monthPL.netProfit), monthPL.netProfit >= 0 ? "text-success fw-bold" : "text-danger fw-bold")}
      ${stat("Margin", monthPL.marginPercent + "%")}
    </div>

    <div class="row g-3">
      <div class="col-md-6">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Sales Trend (this month)</div>
        <div class="card-body">${lineChart(salesSeries, "#0d6efd")}</div></div>
      </div>
      <div class="col-md-6">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Purchase Trend (this month)</div>
        <div class="card-body">${lineChart(purchaseSeries, "#6f42c1")}</div></div>
      </div>
      <div class="col-md-6">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Top Selling Products</div>
        <div class="card-body">${barList(topProducts)}</div></div>
      </div>
      <div class="col-md-6">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Category-wise Sales</div>
        <div class="card-body">${barList(byCategory)}</div></div>
      </div>
      <div class="col-md-6">
        <div class="card h-100"><div class="card-header py-2 small fw-semibold">Payment Method Breakdown</div>
        <div class="card-body">${barList(payMap)}</div></div>
      </div>
    </div>
  `;
}

function buildNotifications({ lowStock, outStock, d, receivables, payables }) {
  const n = [];
  if (outStock.length) n.push(`<strong>${outStock.length}</strong> product(s) out of stock: ${outStock.slice(0, 5).map(p => esc(p.name)).join(", ")}${outStock.length > 5 ? "..." : ""}`);
  if (lowStock.length) n.push(`<strong>${lowStock.length}</strong> product(s) at or below minimum stock.`);

  const overLimit = d.customers.filter(c => Number(c.creditLimit) > 0 && Number(c.outstandingBalance) > Number(c.creditLimit));
  if (overLimit.length) n.push(`<strong>${overLimit.length}</strong> customer(s) over credit limit: ${overLimit.slice(0, 3).map(c => esc(c.name)).join(", ")}`);

  if (receivables > 0) n.push(`Rs. ${num(receivables)} pending from customers.`);
  if (payables > 0) n.push(`Rs. ${num(payables)} payable to suppliers.`);

  const pendingDeliveries = (d.sales || []).filter(s => s.delivery && s.delivery.required && s.delivery.status !== "Delivered");
  if (pendingDeliveries.length) n.push(`<strong>${pendingDeliveries.length}</strong> delivery(ies) not yet marked delivered.`);

  return n;
}

// ---------- lightweight inline SVG charts (no external library) ----------

function lineChart(series, color) {
  if (!series.length) return `<div class="text-muted small">No data yet.</div>`;
  const w = 480, h = 140, pad = 24;
  const values = series.map(s => s[1]);
  const max = Math.max(...values, 1);
  const stepX = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;

  const pts = series.map((s, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (s[1] / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const area = `${pad},${h - pad} ${pts.join(" ")} ${pad + (series.length - 1) * stepX},${h - pad}`;

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img">
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#dee2e6"/>
      <polygon points="${area}" fill="${color}" opacity="0.12"/>
      <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>
      ${series.map((s, i) => {
        const x = pad + i * stepX;
        const y = h - pad - (s[1] / max) * (h - pad * 2);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"><title>${s[0]}: ${num(s[1])}</title></circle>`;
      }).join("")}
      <text x="${pad}" y="14" font-size="10" fill="#6c757d">Peak: ${num(max)}</text>
    </svg>
    <div class="d-flex justify-content-between small text-muted">
      <span>${series[0][0]}</span><span>${series[series.length - 1][0]}</span>
    </div>`;
}

function barList(entries) {
  if (!entries.length) return `<div class="text-muted small">No data yet.</div>`;
  const max = Math.max(...entries.map(e => e[1]), 1);
  return entries.map(([k, v]) => `
    <div class="mb-2">
      <div class="d-flex justify-content-between small"><span>${esc(k)}</span><span>Rs. ${num(v)}</span></div>
      <div class="progress" style="height:6px">
        <div class="progress-bar" style="width:${((v / max) * 100).toFixed(1)}%"></div>
      </div>
    </div>`).join("");
}

function stat(label, value, cls = "") {
  return `<div class="col-6 col-md-3 col-lg-2"><div class="card h-100"><div class="card-body py-2">
    <div class="text-muted small">${label}</div><div class="fw-bold ${cls}">${value}</div></div></div></div>`;
}
function line(label, value, cls = "") {
  return `<div class="d-flex justify-content-between small py-1"><span class="text-muted">${label}</span><span class="${cls}">${value}</span></div>`;
}
function num(n) { return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
