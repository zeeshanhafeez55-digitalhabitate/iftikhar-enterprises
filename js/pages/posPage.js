import { listProducts } from "../products.js";
import { listCategories } from "../categories.js";
import { listCustomers, createCustomer, getCustomer, checkCreditLimit } from "../customers.js";
import { computeTotals, createSale, getSale } from "../sales.js";
import { calcCustomMattress, round2 } from "../pricing.js";
import { getSettings } from "../settings.js";
import { printInvoice, shareInvoiceWhatsApp } from "../invoice.js";
import { state, can } from "../auth.js";

let PRODUCTS = [], CATEGORIES = [], CUSTOMERS = [], SETTINGS = null;
let cart = [];
let selectedCustomer = null;
let activeCat = "all";

export async function renderPOS(container) {
  SETTINGS = await getSettings();
  [PRODUCTS, CATEGORIES, CUSTOMERS] = await Promise.all([listProducts(), listCategories(), listCustomers()]);

  container.innerHTML = `
    <div class="row g-3">
      <!-- LEFT: product picker -->
      <div class="col-lg-7">
        <div class="card">
          <div class="card-body">
            <div class="input-group mb-2">
              <input class="form-control form-control-lg" id="posSearch" placeholder="Scan barcode or search name / SKU..." autofocus>
              <button class="btn btn-outline-secondary" id="customItemBtn">Custom Size</button>
            </div>
            <div class="btn-group btn-group-sm flex-wrap mb-2">
              <button class="btn ${activeCat === "all" ? "btn-dark" : "btn-outline-dark"}" data-cat="all">All</button>
              ${CATEGORIES.map(c => `<button class="btn ${activeCat === c.id ? "btn-dark" : "btn-outline-dark"}" data-cat="${c.id}">${esc(c.name)}</button>`).join("")}
            </div>
            <div id="productGrid" class="row g-2" style="max-height:52vh; overflow-y:auto;"></div>
          </div>
        </div>
      </div>

      <!-- RIGHT: cart + checkout -->
      <div class="col-lg-5">
        <div class="card mb-2">
          <div class="card-body py-2">
            <div class="input-group input-group-sm">
              <select class="form-select" id="customerSelect">
                <option value="">Walk-in Customer</option>
                ${CUSTOMERS.map(c => `<option value="${c.id}">${esc(c.name)}${c.phone ? " — " + esc(c.phone) : ""}</option>`).join("")}
              </select>
              <button class="btn btn-outline-secondary" id="newCustomerBtn">+ New</button>
            </div>
            <div id="customerInfo" class="small text-muted mt-1"></div>
          </div>
        </div>

        <div class="card mb-2">
          <div class="card-body p-0">
            <table class="table table-sm mb-0" id="cartTable">
              <thead><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Disc</th><th class="text-end">Amount</th><th></th></tr></thead>
              <tbody id="cartBody"></tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <div class="row g-2">
              <div class="col-6"><label class="form-label small mb-0">Invoice Discount</label><input type="number" step="0.01" class="form-control form-control-sm tot" id="invoiceDiscount" value="0"></div>
              <div class="col-6"><label class="form-label small mb-0">Tax %</label><input type="number" step="0.01" class="form-control form-control-sm tot" id="taxPercent" value="${SETTINGS.taxPercent || 0}"></div>
              <div class="col-6"><label class="form-label small mb-0">Additional Charges</label><input type="number" step="0.01" class="form-control form-control-sm tot" id="additionalCharges" value="0"></div>
              <div class="col-6"><label class="form-label small mb-0">Delivery Charges</label><input type="number" step="0.01" class="form-control form-control-sm tot" id="deliveryCharges" value="0"></div>
              <div class="col-6"><label class="form-label small mb-0">Previous Balance</label><input type="number" step="0.01" class="form-control form-control-sm tot" id="previousBalance" value="0" readonly></div>
              <div class="col-6"><label class="form-label small mb-0">Paid Amount</label><input type="number" step="0.01" class="form-control form-control-sm tot" id="paidAmount" value="0"></div>
            </div>

            <div class="mt-2">
              <label class="form-label small mb-1">Payment (split supported)</label>
              <div id="paymentRows"></div>
              <button class="btn btn-sm btn-outline-secondary mt-1" id="addPaymentBtn">+ Payment Method</button>
            </div>

            <div class="mt-2">
              <input class="form-control form-control-sm" id="saleNotes" placeholder="Notes (optional)">
            </div>

            <div class="mt-2 form-check">
              <input class="form-check-input" type="checkbox" id="deliveryRequired">
              <label class="form-check-label small">Delivery required</label>
            </div>
            <div id="deliveryFields" class="row g-2 mt-1 d-none">
              <div class="col-6"><input class="form-control form-control-sm" id="delAddress" placeholder="Delivery address"></div>
              <div class="col-6"><input type="date" class="form-control form-control-sm" id="delDate"></div>
              <div class="col-6"><input class="form-control form-control-sm" id="delDriver" placeholder="Driver"></div>
              <div class="col-6"><input class="form-control form-control-sm" id="delVehicle" placeholder="Vehicle"></div>
            </div>

            <hr class="my-2">
            <div id="totalsBox" class="small"></div>
            <div id="posError" class="alert alert-danger py-1 small d-none mt-2"></div>
            <div class="d-grid gap-2 mt-2">
              <button class="btn btn-success btn-lg" id="checkoutBtn" ${can("sales", "create") ? "" : "disabled"}>Complete Sale (F9)</button>
              <button class="btn btn-outline-secondary btn-sm" id="clearCartBtn">Clear</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="posModalHost"></div>
  `;

  renderProductGrid();
  renderCart();
  addPaymentRow();
  recalc();

  container.querySelectorAll("[data-cat]").forEach(b =>
    b.addEventListener("click", () => { activeCat = b.dataset.cat; renderPOS(container); })
  );

  const search = document.getElementById("posSearch");
  search.addEventListener("input", renderProductGrid);
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = search.value.trim();
    const exact = PRODUCTS.find(p => p.barcode === term || p.sku === term);
    if (exact) { addToCart(exact); search.value = ""; renderProductGrid(); }
  });

  document.getElementById("customItemBtn").addEventListener("click", openCustomItemModal);
  document.getElementById("addPaymentBtn").addEventListener("click", () => addPaymentRow());
  document.getElementById("clearCartBtn").addEventListener("click", () => { cart = []; renderCart(); recalc(); });
  document.getElementById("newCustomerBtn").addEventListener("click", openNewCustomerModal);

  document.getElementById("customerSelect").addEventListener("change", async (e) => {
    const id = e.target.value;
    selectedCustomer = id ? await getCustomer(id) : null;
    const info = document.getElementById("customerInfo");
    const prevInput = document.getElementById("previousBalance");
    if (selectedCustomer) {
      prevInput.value = selectedCustomer.outstandingBalance || 0;
      info.textContent = `Balance: ${selectedCustomer.outstandingBalance || 0} · Credit limit: ${selectedCustomer.creditLimit || "none"}`;
    } else {
      prevInput.value = 0;
      info.textContent = "";
    }
    recalc();
  });

  container.querySelectorAll(".tot").forEach(el => el.addEventListener("input", recalc));

  document.getElementById("deliveryRequired").addEventListener("change", (e) => {
    document.getElementById("deliveryFields").classList.toggle("d-none", !e.target.checked);
  });

  document.getElementById("checkoutBtn").addEventListener("click", () => checkout(container));

  document.addEventListener("keydown", posHotkeys);
}

function posHotkeys(e) {
  if (e.key === "F9") {
    e.preventDefault();
    const btn = document.getElementById("checkoutBtn");
    if (btn && !btn.disabled) btn.click();
  }
  if (e.key === "F2") {
    e.preventDefault();
    document.getElementById("posSearch")?.focus();
  }
}

// ---------- product grid ----------

function renderProductGrid() {
  const term = (document.getElementById("posSearch")?.value || "").toLowerCase();
  const grid = document.getElementById("productGrid");
  const list = PRODUCTS.filter(p =>
    p.active !== false &&
    (activeCat === "all" || p.categoryId === activeCat) &&
    (!term || p.name.toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term) || (p.barcode || "").includes(term))
  );

  grid.innerHTML = list.map(p => `
    <div class="col-6 col-md-4">
      <button class="btn btn-outline-primary w-100 h-100 text-start p-2" data-add="${p.id}">
        <div class="small fw-semibold text-truncate">${esc(p.name)}</div>
        <div class="small text-muted">${esc(p.sku)}</div>
        <div class="small">Rs. ${num(p.salePrice)} · Stock ${p.currentStock}</div>
      </button>
    </div>`).join("") || `<div class="text-muted p-2">No products match.</div>`;

  grid.querySelectorAll("[data-add]").forEach(b =>
    b.addEventListener("click", () => addToCart(PRODUCTS.find(p => p.id === b.dataset.add)))
  );
}

function addToCart(product) {
  if (!product) return;
  const existing = cart.find(i => i.productId === product.id && !i.dimensions);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      qty: 1,
      rate: Number(product.salePrice) || 0,
      minSalePrice: Number(product.minSalePrice) || 0,
      costPrice: Number(product.costPrice || product.purchasePrice) || 0,
      discount: 0,
      dimensions: null,
      availableStock: Number(product.currentStock) || 0
    });
  }
  renderCart();
  recalc();
}

function renderCart() {
  const body = document.getElementById("cartBody");
  body.innerHTML = cart.map((it, idx) => `
    <tr>
      <td class="small">
        ${esc(it.productName)}
        ${it.dimensions ? `<div class="text-muted">${it.dimensions.length}" × ${it.dimensions.width}"${it.dimensions.thickness ? ` × ${it.dimensions.thickness}"` : ""}</div>` : ""}
      </td>
      <td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end" style="width:70px" value="${it.qty}" data-qty="${idx}"></td>
      <td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end" style="width:85px" value="${it.rate}" data-rate="${idx}"></td>
      <td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end" style="width:75px" value="${it.discount}" data-disc="${idx}"></td>
      <td class="text-end small">${num(it.qty * it.rate - it.discount)}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-rm="${idx}">×</button></td>
    </tr>`).join("") || `<tr><td colspan="6" class="text-muted p-2 small">Cart is empty. Scan or click a product.</td></tr>`;

  body.querySelectorAll("[data-qty]").forEach(el => el.addEventListener("input", () => { cart[el.dataset.qty].qty = Number(el.value) || 0; renderCart(); recalc(); }));
  body.querySelectorAll("[data-rate]").forEach(el => el.addEventListener("input", () => { cart[el.dataset.rate].rate = Number(el.value) || 0; renderCart(); recalc(); }));
  body.querySelectorAll("[data-disc]").forEach(el => el.addEventListener("input", () => { cart[el.dataset.disc].discount = Number(el.value) || 0; renderCart(); recalc(); }));
  body.querySelectorAll("[data-rm]").forEach(el => el.addEventListener("click", () => { cart.splice(Number(el.dataset.rm), 1); renderCart(); recalc(); }));
}

// ---------- payments ----------

function addPaymentRow(method = "Cash", amount = "") {
  const host = document.getElementById("paymentRows");
  const idx = host.children.length;
  const div = document.createElement("div");
  div.className = "input-group input-group-sm mb-1";
  div.innerHTML = `
    <select class="form-select pay-method">
      ${(SETTINGS.paymentMethods || ["Cash"]).map(m => `<option value="${m}" ${m === method ? "selected" : ""}>${m}</option>`).join("")}
    </select>
    <input type="number" step="0.01" class="form-control pay-amount" placeholder="Amount" value="${amount}">
    ${idx > 0 ? `<button class="btn btn-outline-danger" type="button">×</button>` : ""}
  `;
  host.appendChild(div);
  div.querySelector(".pay-amount").addEventListener("input", syncPaidFromPayments);
  div.querySelector("button")?.addEventListener("click", () => { div.remove(); syncPaidFromPayments(); });
}

function readPayments() {
  return [...document.querySelectorAll("#paymentRows .input-group")].map(row => ({
    method: row.querySelector(".pay-method").value,
    amount: Number(row.querySelector(".pay-amount").value) || 0
  })).filter(p => p.amount > 0);
}

function syncPaidFromPayments() {
  const total = readPayments().reduce((s, p) => s + p.amount, 0);
  document.getElementById("paidAmount").value = round2(total);
  recalc();
}

// ---------- totals ----------

function currentTotals() {
  return computeTotals({
    items: cart,
    invoiceDiscount: Number(document.getElementById("invoiceDiscount").value) || 0,
    taxPercent: Number(document.getElementById("taxPercent").value) || 0,
    additionalCharges: Number(document.getElementById("additionalCharges").value) || 0,
    deliveryCharges: Number(document.getElementById("deliveryCharges").value) || 0,
    previousBalance: Number(document.getElementById("previousBalance").value) || 0,
    paidAmount: Number(document.getElementById("paidAmount").value) || 0
  });
}

function recalc() {
  const t = currentTotals();
  document.getElementById("totalsBox").innerHTML = `
    <div class="d-flex justify-content-between"><span>Subtotal</span><span>${num(t.subtotal)}</span></div>
    ${t.invoiceDiscount ? `<div class="d-flex justify-content-between"><span>Discount</span><span>-${num(t.invoiceDiscount)}</span></div>` : ""}
    ${t.taxAmount ? `<div class="d-flex justify-content-between"><span>Tax</span><span>${num(t.taxAmount)}</span></div>` : ""}
    ${t.additionalCharges ? `<div class="d-flex justify-content-between"><span>Additional</span><span>${num(t.additionalCharges)}</span></div>` : ""}
    ${t.deliveryCharges ? `<div class="d-flex justify-content-between"><span>Delivery</span><span>${num(t.deliveryCharges)}</span></div>` : ""}
    <div class="d-flex justify-content-between fw-bold border-top pt-1"><span>Grand Total</span><span>Rs. ${num(t.grandTotal)}</span></div>
    ${t.previousBalance ? `<div class="d-flex justify-content-between"><span>Previous Balance</span><span>${num(t.previousBalance)}</span></div><div class="d-flex justify-content-between fw-bold"><span>Payable</span><span>Rs. ${num(t.payable)}</span></div>` : ""}
    <div class="d-flex justify-content-between"><span>Paid</span><span>${num(t.paidAmount)}</span></div>
    <div class="d-flex justify-content-between fw-bold text-danger"><span>Remaining</span><span>Rs. ${num(t.remaining)}</span></div>
    <div class="d-flex justify-content-between text-success small"><span>Est. Profit</span><span>${num(t.grossProfit)}</span></div>
  `;
}

// ---------- validation + checkout ----------

function validate(totals, payments) {
  if (!cart.length) return "Cart is empty.";
  for (const it of cart) {
    if (it.qty <= 0) return `Invalid quantity for ${it.productName}.`;
    if (it.rate < 0) return `Invalid rate for ${it.productName}.`;
    if (it.minSalePrice && it.rate < it.minSalePrice) {
      return `${it.productName}: rate ${it.rate} is below minimum sale price ${it.minSalePrice}.`;
    }
    if (it.productId && !SETTINGS.allowNegativeStock && it.qty > it.availableStock) {
      return `${it.productName}: only ${it.availableStock} in stock.`;
    }
  }

  const discTotal = totals.invoiceDiscount + cart.reduce((s, i) => s + i.discount, 0);
  const discPct = totals.subtotal > 0 ? (discTotal / (totals.subtotal + totals.invoiceDiscount)) * 100 : 0;
  if (SETTINGS.maxDiscountPercent && discPct > SETTINGS.maxDiscountPercent && !can("sales", "discount")) {
    return `Discount ${discPct.toFixed(1)}% exceeds the ${SETTINGS.maxDiscountPercent}% limit. Manager authorization required.`;
  }
  if (SETTINGS.maxDiscountAmount && discTotal > SETTINGS.maxDiscountAmount && !can("sales", "discount")) {
    return `Discount amount ${discTotal} exceeds the ${SETTINGS.maxDiscountAmount} limit. Manager authorization required.`;
  }

  if (totals.remaining > 0) {
    if (!selectedCustomer) return "Credit sale needs a registered customer. Select or create one.";
    if (!can("sales", "credit")) return "You do not have permission to make credit sales.";
    const check = checkCreditLimit(selectedCustomer, totals.remaining);
    if (!check.allowed) return check.message;
  }
  if (totals.paidAmount < 0) return "Paid amount cannot be negative.";
  return null;
}

async function checkout(container) {
  const errBox = document.getElementById("posError");
  errBox.classList.add("d-none");
  const btn = document.getElementById("checkoutBtn");

  const totals = currentTotals();
  const payments = readPayments();
  const err = validate(totals, payments);
  if (err) { errBox.textContent = err; errBox.classList.remove("d-none"); return; }

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const deliveryOn = document.getElementById("deliveryRequired").checked;
    const delivery = deliveryOn ? {
      required: true,
      address: document.getElementById("delAddress").value,
      date: document.getElementById("delDate").value,
      driver: document.getElementById("delDriver").value,
      vehicle: document.getElementById("delVehicle").value,
      status: "Pending"
    } : null;

    const { saleId } = await createSale({
      items: cart,
      totals,
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || "Walk-in Customer",
      customerPhone: selectedCustomer?.phone || "",
      payments: payments.length ? payments : [{ method: "Cash", amount: 0 }],
      notes: document.getElementById("saleNotes").value,
      userId: state.user.uid,
      delivery
    }, { allowNegativeStock: !!SETTINGS.allowNegativeStock });

    const sale = await getSale(saleId);
    showInvoiceModal(sale, container);

    cart = [];
    selectedCustomer = null;
  } catch (e) {
    errBox.textContent = e.message;
    errBox.classList.remove("d-none");
  } finally {
    btn.disabled = false;
    btn.textContent = "Complete Sale (F9)";
  }
}

// ---------- modals ----------

function showInvoiceModal(sale, container) {
  const host = document.getElementById("posModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">Sale Completed — ${esc(sale.invoiceNo)}</h5></div>
          <div class="modal-body">
            <div class="d-flex justify-content-between"><span>Grand Total</span><strong>Rs. ${num(sale.grandTotal)}</strong></div>
            <div class="d-flex justify-content-between"><span>Paid</span><span>Rs. ${num(sale.paidAmount)}</span></div>
            <div class="d-flex justify-content-between"><span>Remaining</span><strong class="text-danger">Rs. ${num(sale.remaining)}</strong></div>
            <hr>
            <div class="d-grid gap-2">
              <button class="btn btn-primary" id="printA4">Print A4 Invoice</button>
              <button class="btn btn-outline-primary" id="print80">Print 80mm Receipt</button>
              <button class="btn btn-outline-primary" id="print58">Print 58mm Receipt</button>
              <button class="btn btn-outline-success" id="shareWa">Share on WhatsApp</button>
            </div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" id="closeInvoiceModal">New Sale</button></div>
        </div>
      </div>
    </div>`;

  document.getElementById("printA4").addEventListener("click", () => printInvoice(sale, SETTINGS, "A4"));
  document.getElementById("print80").addEventListener("click", () => printInvoice(sale, SETTINGS, "80mm"));
  document.getElementById("print58").addEventListener("click", () => printInvoice(sale, SETTINGS, "58mm"));
  document.getElementById("shareWa").addEventListener("click", () => shareInvoiceWhatsApp(sale, SETTINGS));
  document.getElementById("closeInvoiceModal").addEventListener("click", () => {
    host.innerHTML = "";
    document.removeEventListener("keydown", posHotkeys);
    renderPOS(container);
  });
}

function openCustomItemModal() {
  const host = document.getElementById("posModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">Custom Size Item</h5></div>
          <div class="modal-body">
            <div class="mb-2">
              <label class="form-label small">Base product (optional — links stock &amp; cost)</label>
              <select class="form-select form-select-sm" id="ciProduct">
                <option value="">None (free item)</option>
                ${PRODUCTS.filter(p => p.active !== false).map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(p.sku)}</option>`).join("")}
              </select>
            </div>
            <div class="mb-2"><input class="form-control form-control-sm" id="ciName" placeholder="Item description (e.g. Custom foam 72x48x4)"></div>
            <div class="row g-2">
              <div class="col-4"><label class="form-label small mb-0">Length (in)</label><input type="number" class="form-control form-control-sm" id="ciL"></div>
              <div class="col-4"><label class="form-label small mb-0">Width (in)</label><input type="number" class="form-control form-control-sm" id="ciW"></div>
              <div class="col-4"><label class="form-label small mb-0">Thickness (in)</label><input type="number" class="form-control form-control-sm" id="ciT"></div>
              <div class="col-4">
                <label class="form-label small mb-0">Price By</label>
                <select class="form-select form-select-sm" id="ciMethod">
                  <option value="sqft">Sq. Ft.</option><option value="cuft">Cu. Ft.</option><option value="piece">Piece</option>
                </select>
              </div>
              <div class="col-4"><label class="form-label small mb-0">Cost Rate</label><input type="number" class="form-control form-control-sm" id="ciCost"></div>
              <div class="col-4"><label class="form-label small mb-0">Sale Rate</label><input type="number" class="form-control form-control-sm" id="ciSale"></div>
              <div class="col-4"><label class="form-label small mb-0">Quantity</label><input type="number" class="form-control form-control-sm" id="ciQty" value="1"></div>
            </div>
            <button class="btn btn-sm btn-outline-primary mt-2" id="ciCalc">Calculate</button>
            <div id="ciResult" class="small mt-2"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" id="ciCancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="ciAdd">Add to Cart</button>
          </div>
        </div>
      </div>
    </div>`;

  let result = null;
  const read = () => ({
    lengthIn: Number(document.getElementById("ciL").value) || 0,
    widthIn: Number(document.getElementById("ciW").value) || 0,
    thicknessIn: Number(document.getElementById("ciT").value) || 0,
    pricingMethod: document.getElementById("ciMethod").value,
    costRate: Number(document.getElementById("ciCost").value) || 0,
    saleRate: Number(document.getElementById("ciSale").value) || 0,
    quantity: Number(document.getElementById("ciQty").value) || 1
  });

  document.getElementById("ciCalc").addEventListener("click", () => {
    result = calcCustomMattress(read());
    document.getElementById("ciResult").innerHTML =
      `Area <strong>${result.areaSqFt}</strong> sqft · Volume <strong>${result.volumeCuFt}</strong> cuft ·
       Unit cost <strong>${result.unitCost}</strong> · Unit price <strong>${result.unitPrice}</strong> ·
       Total <strong>Rs. ${result.totalPrice}</strong> · Profit <strong>${result.profit}</strong>`;
  });

  document.getElementById("ciCancel").addEventListener("click", () => { host.innerHTML = ""; });

  document.getElementById("ciAdd").addEventListener("click", () => {
    const input = read();
    if (!result) result = calcCustomMattress(input);
    const pid = document.getElementById("ciProduct").value;
    const base = PRODUCTS.find(p => p.id === pid);
    const name = document.getElementById("ciName").value ||
      (base ? `${base.name} (custom)` : `Custom item ${input.lengthIn}"×${input.widthIn}"`);

    cart.push({
      productId: pid || null,
      productName: name,
      sku: base?.sku || "",
      qty: input.quantity,
      rate: result.unitPrice,
      costPrice: result.unitCost,
      minSalePrice: 0,
      discount: 0,
      dimensions: { length: input.lengthIn, width: input.widthIn, thickness: input.thicknessIn, method: input.pricingMethod },
      availableStock: base ? Number(base.currentStock) || 0 : Infinity
    });
    host.innerHTML = "";
    renderCart();
    recalc();
  });
}

function openNewCustomerModal() {
  const host = document.getElementById("posModalHost");
  host.innerHTML = `
    <div class="modal d-block" style="background:rgba(0,0,0,.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">New Customer</h5></div>
          <div class="modal-body row g-2">
            <div class="col-6"><input class="form-control form-control-sm" id="ncName" placeholder="Name" required></div>
            <div class="col-6"><input class="form-control form-control-sm" id="ncPhone" placeholder="Phone"></div>
            <div class="col-6"><input class="form-control form-control-sm" id="ncCity" placeholder="City"></div>
            <div class="col-6"><input type="number" class="form-control form-control-sm" id="ncLimit" placeholder="Credit limit"></div>
            <div class="col-12"><input class="form-control form-control-sm" id="ncAddress" placeholder="Address"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" id="ncCancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="ncSave">Save</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("ncCancel").addEventListener("click", () => { host.innerHTML = ""; });
  document.getElementById("ncSave").addEventListener("click", async () => {
    const name = document.getElementById("ncName").value.trim();
    if (!name) return;
    const id = await createCustomer({
      name,
      phone: document.getElementById("ncPhone").value,
      city: document.getElementById("ncCity").value,
      address: document.getElementById("ncAddress").value,
      creditLimit: document.getElementById("ncLimit").value
    }, state.user.uid);

    CUSTOMERS = await listCustomers();
    const sel = document.getElementById("customerSelect");
    sel.innerHTML = `<option value="">Walk-in Customer</option>` +
      CUSTOMERS.map(c => `<option value="${c.id}" ${c.id === id ? "selected" : ""}>${esc(c.name)}${c.phone ? " — " + esc(c.phone) : ""}</option>`).join("");
    sel.dispatchEvent(new Event("change"));
    host.innerHTML = "";
  });
}

function num(n) {
  return (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
