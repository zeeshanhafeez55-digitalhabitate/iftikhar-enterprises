import { db, collection, getDocs } from "./firebase-init.js";
import { toDate } from "./expenses.js";
import { round2 } from "./pricing.js";

/** Loads everything the reports and dashboard need, in one pass. */
export async function loadReportData() {
  const cols = ["sales", "saleItems", "purchases", "purchaseItems", "expenses",
    "products", "customers", "suppliers", "saleReturns", "purchaseReturns",
    "cashTransactions", "payments"];

  const results = await Promise.all(cols.map(c => getDocs(collection(db, c))));
  const data = {};
  cols.forEach((c, i) => { data[c] = results[i].docs.map(d => ({ id: d.id, ...d.data() })); });
  return data;
}

export function inDateRange(item, from, to, field = "createdAt") {
  const d = toDate(item[field] || item.date || item.at);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function rangePreset(preset) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);

  switch (preset) {
    case "today": return { from: startOfToday, to: endOfToday };
    case "yesterday": {
      const y = new Date(startOfToday); y.setDate(y.getDate() - 1);
      return { from: y, to: startOfToday };
    }
    case "week": {
      const w = new Date(startOfToday); w.setDate(w.getDate() - 7);
      return { from: w, to: endOfToday };
    }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfToday };
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: endOfToday };
    default: return { from: null, to: null };
  }
}

/** Profit & Loss per spec §25. */
export function profitAndLoss(data, from, to) {
  const sales = data.sales.filter(s => !s.cancelled && inDateRange(s, from, to));
  const saleIds = new Set(sales.map(s => s.id));
  const items = data.saleItems.filter(i => saleIds.has(i.saleId));
  const returns = data.saleReturns.filter(r => inDateRange(r, from, to, "at"));
  const expenses = data.expenses.filter(e => inDateRange(e, from, to, "date"));

  const totalSales = round2(sales.reduce((s, x) => s + (Number(x.grandTotal) || 0), 0));
  const salesReturns = round2(returns.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0));
  const netSales = round2(totalSales - salesReturns);
  const cogs = round2(items.reduce((s, i) => s + Number(i.qty) * (Number(i.costPrice) || 0), 0));
  const grossProfit = round2(netSales - cogs);
  const totalExpenses = round2(expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const netProfit = round2(grossProfit - totalExpenses);

  return {
    totalSales, salesReturns, netSales, cogs, grossProfit,
    totalExpenses, netProfit,
    marginPercent: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
    invoiceCount: sales.length,
    expenseBreakdown: groupSum(expenses, "category", "amount")
  };
}

export function groupSum(rows, keyField, valueField) {
  const map = {};
  rows.forEach(r => {
    const k = r[keyField] || "Other";
    map[k] = round2((map[k] || 0) + (Number(r[valueField]) || 0));
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function groupCount(rows, keyField) {
  const map = {};
  rows.forEach(r => { const k = r[keyField] || "Other"; map[k] = (map[k] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** Daily series for trend charts. */
export function dailySeries(rows, valueField, from, to, dateField = "createdAt") {
  const map = {};
  rows.forEach(r => {
    const d = toDate(r[dateField] || r.date || r.at);
    if (!d) return;
    if (from && d < from) return;
    if (to && d > to) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    map[key] = round2((map[key] || 0) + (Number(r[valueField]) || 0));
  });
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------- individual report builders ----------

export const REPORTS = {
  daily_sales: { label: "Daily Sales", build: (d, f, t) => tableFrom(
    d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)),
    ["invoiceNo", "customerName", "grandTotal", "paidAmount", "remaining"],
    ["Invoice", "Customer", "Total", "Paid", "Remaining"]) },

  sales_by_product: { label: "Sales by Product", build: (d, f, t) => {
    const ids = new Set(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)).map(s => s.id));
    const items = d.saleItems.filter(i => ids.has(i.saleId));
    const map = {};
    items.forEach(i => {
      const k = i.productName;
      map[k] = map[k] || { name: k, qty: 0, amount: 0, profit: 0 };
      map[k].qty += Number(i.qty) || 0;
      map[k].amount = round2(map[k].amount + (Number(i.amount) || 0));
      map[k].profit = round2(map[k].profit + (Number(i.profit) || 0));
    });
    return { headers: ["Product", "Qty Sold", "Amount", "Profit"],
      rows: Object.values(map).sort((a, b) => b.amount - a.amount).map(r => [r.name, r.qty, r.amount, r.profit]) };
  }},

  sales_by_category: { label: "Sales by Category", build: (d, f, t) => {
    const ids = new Set(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)).map(s => s.id));
    const prodCat = Object.fromEntries(d.products.map(p => [p.id, p.categoryId]));
    const map = {};
    d.saleItems.filter(i => ids.has(i.saleId)).forEach(i => {
      const k = prodCat[i.productId] || "uncategorized";
      map[k] = round2((map[k] || 0) + (Number(i.amount) || 0));
    });
    return { headers: ["Category", "Amount"], rows: Object.entries(map).sort((a, b) => b[1] - a[1]) };
  }},

  sales_by_customer: { label: "Sales by Customer", build: (d, f, t) => ({
    headers: ["Customer", "Amount"],
    rows: groupSum(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)), "customerName", "grandTotal")
  })},

  sales_by_employee: { label: "Sales by Employee", build: (d, f, t) => ({
    headers: ["User ID", "Amount"],
    rows: groupSum(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)), "userId", "grandTotal")
  })},

  purchase_report: { label: "Purchase Report", build: (d, f, t) => tableFrom(
    d.purchases.filter(p => inDateRange(p, f, t)),
    ["purchaseNo", "supplierName", "grandTotal", "paidAmount", "remaining"],
    ["Purchase #", "Supplier", "Total", "Paid", "Payable"]) },

  purchase_by_supplier: { label: "Purchase by Supplier", build: (d, f, t) => ({
    headers: ["Supplier", "Amount"],
    rows: groupSum(d.purchases.filter(p => inDateRange(p, f, t)), "supplierName", "grandTotal")
  })},

  stock_report: { label: "Stock Report", build: (d) => tableFrom(
    d.products, ["name", "sku", "currentStock", "minStockLevel", "costPrice", "salePrice"],
    ["Product", "SKU", "Stock", "Min", "Cost", "Sale"]) },

  stock_valuation: { label: "Stock Valuation", build: (d) => ({
    headers: ["Product", "Stock", "Cost", "Stock Value", "Sale Value"],
    rows: d.products.map(p => [
      p.name, p.currentStock,
      round2(p.costPrice),
      round2((Number(p.currentStock) || 0) * (Number(p.costPrice) || 0)),
      round2((Number(p.currentStock) || 0) * (Number(p.salePrice) || 0))
    ])
  })},

  low_stock: { label: "Low Stock", build: (d) => ({
    headers: ["Product", "SKU", "Stock", "Minimum"],
    rows: d.products.filter(p => Number(p.currentStock) > 0 && Number(p.currentStock) <= Number(p.minStockLevel ?? 0))
      .map(p => [p.name, p.sku, p.currentStock, p.minStockLevel ?? 0])
  })},

  out_of_stock: { label: "Out of Stock", build: (d) => ({
    headers: ["Product", "SKU", "Stock"],
    rows: d.products.filter(p => Number(p.currentStock) <= 0).map(p => [p.name, p.sku, p.currentStock])
  })},

  customer_receivable: { label: "Customer Receivable", build: (d) => ({
    headers: ["Customer", "Phone", "Total Purchases", "Paid", "Outstanding"],
    rows: d.customers.filter(c => Number(c.outstandingBalance) !== 0)
      .sort((a, b) => (b.outstandingBalance || 0) - (a.outstandingBalance || 0))
      .map(c => [c.name, c.phone || "", round2(c.totalPurchases), round2(c.totalPaid), round2(c.outstandingBalance)])
  })},

  supplier_payable: { label: "Supplier Payable", build: (d) => ({
    headers: ["Supplier", "Phone", "Total Purchases", "Paid", "Payable"],
    rows: d.suppliers.filter(s => Number(s.payableBalance) !== 0)
      .sort((a, b) => (b.payableBalance || 0) - (a.payableBalance || 0))
      .map(s => [s.name, s.phone || "", round2(s.totalPurchases), round2(s.totalPaid), round2(s.payableBalance)])
  })},

  expense_report: { label: "Expense Report", build: (d, f, t) => tableFrom(
    d.expenses.filter(e => inDateRange(e, f, t, "date")),
    ["category", "description", "amount", "method"],
    ["Category", "Description", "Amount", "Method"]) },

  cash_book: { label: "Cash Book", build: (d, f, t) => ({
    headers: ["Direction", "Source", "Method", "Amount", "Reference"],
    rows: d.cashTransactions.filter(c => inDateRange(c, f, t, "at"))
      .map(c => [c.direction, c.source, c.method, round2(c.amount), c.reference || ""])
  })},

  sale_returns: { label: "Sale Returns", build: (d, f, t) => tableFrom(
    d.saleReturns.filter(r => inDateRange(r, f, t, "at")),
    ["invoiceNo", "customerName", "reason", "totalAmount", "refundAmount"],
    ["Invoice", "Customer", "Reason", "Amount", "Refunded"]) },

  purchase_returns: { label: "Purchase Returns", build: (d, f, t) => tableFrom(
    d.purchaseReturns.filter(r => inDateRange(r, f, t, "at")),
    ["purchaseNo", "supplierName", "reason", "totalAmount"],
    ["Purchase #", "Supplier", "Reason", "Amount"]) },

  product_profitability: { label: "Product Profitability", build: (d, f, t) => {
    const ids = new Set(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)).map(s => s.id));
    const map = {};
    d.saleItems.filter(i => ids.has(i.saleId)).forEach(i => {
      const k = i.productName;
      map[k] = map[k] || { name: k, revenue: 0, cost: 0, profit: 0 };
      map[k].revenue = round2(map[k].revenue + (Number(i.amount) || 0));
      map[k].cost = round2(map[k].cost + Number(i.qty) * (Number(i.costPrice) || 0));
      map[k].profit = round2(map[k].profit + (Number(i.profit) || 0));
    });
    return { headers: ["Product", "Revenue", "Cost", "Profit", "Margin %"],
      rows: Object.values(map).sort((a, b) => b.profit - a.profit)
        .map(r => [r.name, r.revenue, r.cost, r.profit, r.revenue > 0 ? round2((r.profit / r.revenue) * 100) : 0]) };
  }},

  best_selling: { label: "Best Selling Products", build: (d, f, t) => {
    const ids = new Set(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)).map(s => s.id));
    const map = {};
    d.saleItems.filter(i => ids.has(i.saleId)).forEach(i => {
      map[i.productName] = (map[i.productName] || 0) + (Number(i.qty) || 0);
    });
    return { headers: ["Product", "Units Sold"], rows: Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 50) };
  }},

  slow_moving: { label: "Slow Moving Products", build: (d, f, t) => {
    const ids = new Set(d.sales.filter(s => !s.cancelled && inDateRange(s, f, t)).map(s => s.id));
    const sold = {};
    d.saleItems.filter(i => ids.has(i.saleId)).forEach(i => {
      sold[i.productId] = (sold[i.productId] || 0) + (Number(i.qty) || 0);
    });
    return { headers: ["Product", "SKU", "Units Sold", "Current Stock"],
      rows: d.products.map(p => [p.name, p.sku, sold[p.id] || 0, p.currentStock])
        .sort((a, b) => a[2] - b[2]).slice(0, 50) };
  }},

  payment_method: { label: "Payment Method Report", build: (d, f, t) => ({
    headers: ["Method", "Amount"],
    rows: groupSum(d.payments.filter(p => inDateRange(p, f, t, "at")), "method", "amount")
  })}
};

function tableFrom(rows, fields, headers) {
  return { headers, rows: rows.map(r => fields.map(f => {
    const v = r[f];
    return typeof v === "number" ? round2(v) : (v ?? "");
  })) };
}

// ---------- export helpers ----------

export function toCSV(headers, rows) {
  const escCell = v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escCell).join(","), ...rows.map(r => r.map(escCell).join(","))].join("\n");
}

export function downloadFile(filename, content, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printTable(title, headers, rows, settings) {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) { alert("Allow popups to print."); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:12mm;font-size:12px}
    h1{font-size:18px;text-align:center;margin:0 0 2px}
    .sub{text-align:center;font-size:12px;margin-bottom:10px}
    h2{font-size:14px;text-align:center;margin:10px 0}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:5px;text-align:left}
    th{background:#f2f2f2}
    @media print{@page{size:A4;margin:12mm}body{padding:0}}
  </style></head><body>
  <h1>${settings?.businessName || "IFTIKHAR ENTERPRISES"}</h1>
  <div class="sub">Phone: ${settings?.phone || "0322-6529414"}</div>
  <h2>${title}</h2>
  <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
  </body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 350);
}
