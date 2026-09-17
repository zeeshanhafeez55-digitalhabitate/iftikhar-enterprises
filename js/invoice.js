function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n, sym = "Rs.") {
  return `${sym} ${(Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
export function formatDate(d) {
  const dt = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date());
  const p = n => String(n).padStart(2, "0");
  return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function dimText(d) {
  if (!d) return "";
  const parts = [];
  if (d.length) parts.push(`${d.length}"`);
  if (d.width) parts.push(`${d.width}"`);
  if (d.thickness) parts.push(`${d.thickness}"`);
  return parts.join(" × ");
}

export function buildInvoiceHTML(sale, settings, size = "A4") {
  const sym = settings.currencySymbol || "Rs.";
  const thermal = size === "80mm" || size === "58mm";
  const width = size === "58mm" ? "58mm" : size === "80mm" ? "80mm" : "210mm";

  const itemRows = sale.items.map((it, i) => thermal ? `
    <tr>
      <td colspan="3" class="nm">${i + 1}. ${esc(it.productName)}${it.dimensions ? ` <span class="dim">(${dimText(it.dimensions)})</span>` : ""}</td>
    </tr>
    <tr>
      <td>${it.qty} × ${money(it.rate, sym)}</td>
      <td class="r">${it.discount ? `-${money(it.discount, sym)}` : ""}</td>
      <td class="r">${money(it.amount, sym)}</td>
    </tr>` : `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.productName)}<br><small>${esc(it.sku || "")}</small></td>
      <td>${dimText(it.dimensions)}</td>
      <td class="r">${it.qty}</td>
      <td class="r">${money(it.rate, sym)}</td>
      <td class="r">${it.discount ? money(it.discount, sym) : "—"}</td>
      <td class="r">${money(it.amount, sym)}</td>
    </tr>`).join("");

  const totalsRows = `
    ${row("Subtotal", money(sale.subtotal, sym))}
    ${sale.invoiceDiscount ? row("Discount", `- ${money(sale.invoiceDiscount, sym)}`) : ""}
    ${sale.taxAmount ? row(`Tax (${sale.taxPercent}%)`, money(sale.taxAmount, sym)) : ""}
    ${sale.additionalCharges ? row("Additional Charges", money(sale.additionalCharges, sym)) : ""}
    ${sale.deliveryCharges ? row("Delivery Charges", money(sale.deliveryCharges, sym)) : ""}
    ${row("Grand Total", money(sale.grandTotal, sym), true)}
    ${sale.previousBalance ? row("Previous Balance", money(sale.previousBalance, sym)) : ""}
    ${sale.previousBalance ? row("Total Payable", money(sale.payable, sym), true) : ""}
    ${row("Paid", money(sale.paidAmount, sym))}
    ${row("Remaining", money(sale.remaining, sym), true)}
  `;

  function row(label, value, bold) {
    return `<tr class="${bold ? "b" : ""}"><td>${label}</td><td class="r">${value}</td></tr>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(sale.invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ${thermal ? '"Courier New", monospace' : 'Arial, Helvetica, sans-serif'}; margin:0; padding:${thermal ? "4mm" : "12mm"}; width:${width}; color:#000; font-size:${size === "58mm" ? "10px" : thermal ? "11px" : "13px"}; }
  h1 { font-size:${thermal ? "14px" : "22px"}; margin:0 0 2px; text-align:center; letter-spacing:.5px; }
  .sub { text-align:center; font-size:${thermal ? "10px" : "12px"}; margin-bottom:8px; }
  .meta { display:${thermal ? "block" : "flex"}; justify-content:space-between; margin:10px 0; font-size:${thermal ? "10px" : "12px"}; }
  .meta div { margin-bottom:2px; }
  table { width:100%; border-collapse:collapse; }
  .items th, .items td { padding:${thermal ? "2px 1px" : "6px 5px"}; ${thermal ? "" : "border-bottom:1px solid #ddd;"} font-size:${thermal ? "10px" : "12px"}; text-align:left; vertical-align:top; }
  .items thead th { border-bottom:1px solid #000; font-weight:bold; }
  .items .nm { font-weight:bold; padding-top:4px; }
  .dim { font-weight:normal; }
  .r { text-align:right; }
  .totals { margin-top:8px; ${thermal ? "border-top:1px dashed #000; padding-top:4px;" : ""} }
  .totals td { padding:${thermal ? "1px" : "4px 5px"}; font-size:${thermal ? "10px" : "12px"}; }
  .totals tr.b td { font-weight:bold; border-top:1px solid #000; }
  .pay { margin-top:8px; font-size:${thermal ? "10px" : "12px"}; }
  .sign { display:flex; justify-content:space-between; margin-top:${thermal ? "18px" : "50px"}; font-size:${thermal ? "10px" : "12px"}; }
  .sign div { border-top:1px solid #000; padding-top:4px; width:45%; text-align:center; }
  .foot { text-align:center; margin-top:10px; font-size:${thermal ? "9px" : "11px"}; }
  hr { border:none; border-top:1px dashed #000; margin:6px 0; }
  @media print { body { padding:${thermal ? "0" : "10mm"}; } @page { size:${size === "A4" ? "A4" : width + " auto"}; margin:${thermal ? "0" : "10mm"}; } }
</style></head>
<body>
  <h1>${esc(settings.businessName || "IFTIKHAR ENTERPRISES")}</h1>
  <div class="sub">
    ${settings.address ? esc(settings.address) + "<br>" : ""}
    Phone: ${esc(settings.phone || "0322-6529414")}
  </div>
  <hr>
  <div class="meta">
    <div>
      <div><strong>Invoice:</strong> ${esc(sale.invoiceNo)}</div>
      <div><strong>Date:</strong> ${formatDate(sale.date || sale.createdAt)}</div>
    </div>
    <div>
      <div><strong>Customer:</strong> ${esc(sale.customerName)}</div>
      ${sale.customerPhone ? `<div><strong>Phone:</strong> ${esc(sale.customerPhone)}</div>` : ""}
    </div>
  </div>

  <table class="items">
    <thead>
      ${thermal
        ? `<tr><th colspan="3">Item / Qty × Rate</th></tr>`
        : `<tr><th>#</th><th>Item</th><th>Dimensions</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc</th><th class="r">Amount</th></tr>`}
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals">${totalsRows}</table>

  <div class="pay">
    <strong>Payment:</strong>
    ${(sale.payments || []).map(p => `${esc(p.method)} ${money(p.amount, sym)}`).join(" + ") || "—"}
  </div>
  ${sale.notes ? `<div class="pay"><strong>Notes:</strong> ${esc(sale.notes)}</div>` : ""}

  <div class="sign">
    <div>Authorized Signature</div>
    <div>Customer Signature</div>
  </div>

  <div class="foot">Thank you for your business.</div>
</body></html>`;
}

export function printInvoice(sale, settings, size) {
  const html = buildInvoiceHTML(sale, settings, size || settings.receiptSize || "A4");
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { alert("Allow popups to print the invoice."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/** Uses the browser's print-to-PDF; simplest reliable path with no extra library. */
export function downloadInvoicePDF(sale, settings, size) {
  printInvoice(sale, settings, size);
}

export function shareInvoiceWhatsApp(sale, settings) {
  const sym = settings.currencySymbol || "Rs.";
  const lines = [
    `*${settings.businessName || "Iftikhar Enterprises"}*`,
    `Invoice: ${sale.invoiceNo}`,
    `Date: ${formatDate(sale.date || sale.createdAt)}`,
    `Customer: ${sale.customerName}`,
    "",
    ...sale.items.map(it => `${it.productName} — ${it.qty} × ${money(it.rate, sym)} = ${money(it.amount, sym)}`),
    "",
    `Grand Total: ${money(sale.grandTotal, sym)}`,
    `Paid: ${money(sale.paidAmount, sym)}`,
    `Remaining: ${money(sale.remaining, sym)}`,
    "",
    `Phone: ${settings.phone || "0322-6529414"}`
  ];
  const text = encodeURIComponent(lines.join("\n"));
  const phone = (sale.customerPhone || "").replace(/\D/g, "");
  const wa = phone ? `https://wa.me/92${phone.replace(/^0/, "")}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(wa, "_blank");
}
