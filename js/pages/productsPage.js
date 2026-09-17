import {
  listProducts, createProduct, updateProduct, deleteProduct,
  generateSKU, generateBarcode, getProduct, isLowStock
} from "../products.js";
import { listCategories, listBrands, addBrand, seedDefaultCategories } from "../categories.js";
import { calcCustomMattress } from "../pricing.js";
import { state, can } from "../auth.js";

let CATEGORIES = [];
let BRANDS = [];
let activeCategory = "all";
let editingId = null;

export async function renderProducts(container) {
  const canEdit = can("products", "edit");
  const canDelete = can("products", "delete");

  CATEGORIES = await listCategories();
  if (CATEGORIES.length === 0 && canEdit) {
    await seedDefaultCategories();
    CATEGORIES = await listCategories();
  }
  BRANDS = await listBrands();

  const products = await listProducts(activeCategory === "all" ? {} : { categoryId: activeCategory });

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="page-title mb-0">Products</div>
      ${canEdit ? `<button class="btn btn-primary btn-sm" id="newProductBtn">+ Add Product</button>` : ""}
    </div>

    <div class="btn-group mb-3 flex-wrap" role="group">
      <button class="btn btn-sm ${activeCategory === "all" ? "btn-dark" : "btn-outline-dark"}" data-cat="all">All</button>
      ${CATEGORIES.map(c => `<button class="btn btn-sm ${activeCategory === c.id ? "btn-dark" : "btn-outline-dark"}" data-cat="${c.id}">${esc(c.name)}</button>`).join("")}
    </div>

    <div id="formHost"></div>

    <div class="card">
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th>Name</th><th>SKU</th><th>Barcode</th><th>Category</th>
              <th class="text-end">Cost</th><th class="text-end">Sale</th>
              <th class="text-end">Stock</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => productRow(p, canEdit, canDelete)).join("") || `<tr><td colspan="8" class="text-muted p-3">No products in this category yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-cat]").forEach(btn =>
    btn.addEventListener("click", () => { activeCategory = btn.dataset.cat; renderProducts(container); })
  );

  const newBtn = document.getElementById("newProductBtn");
  if (newBtn) newBtn.addEventListener("click", () => openForm(container, null));

  if (canEdit || canDelete) {
    container.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => openForm(container, btn.dataset.edit))
    );
    container.querySelectorAll("[data-del]").forEach(btn =>
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this product?")) return;
        await deleteProduct(btn.dataset.del, state.user.uid);
        renderProducts(container);
      })
    );
  }
}

function productRow(p, canEdit, canDelete) {
  const catName = CATEGORIES.find(c => c.id === p.categoryId)?.name || p.categoryId;
  const low = isLowStock(p);
  return `<tr class="${low ? "table-warning" : ""}">
    <td>${esc(p.name)} ${p.active === false ? '<span class="badge bg-secondary">Inactive</span>' : ""}</td>
    <td>${esc(p.sku)}</td>
    <td>${esc(p.barcode || "")}</td>
    <td>${esc(catName)}</td>
    <td class="text-end">${num(p.costPrice ?? p.purchasePrice)}</td>
    <td class="text-end">${num(p.salePrice)}</td>
    <td class="text-end">${p.currentStock} ${low ? '<span class="badge bg-warning text-dark">Low</span>' : ""}</td>
    <td class="text-end">
      ${canEdit ? `<button class="btn btn-sm btn-outline-secondary" data-edit="${p.id}">Edit</button>` : ""}
      ${canDelete ? `<button class="btn btn-sm btn-outline-danger" data-del="${p.id}">Del</button>` : ""}
    </td>
  </tr>`;
}

async function openForm(container, id) {
  editingId = id;
  const product = id ? await getProduct(id) : null;
  const host = document.getElementById("formHost");

  host.innerHTML = `
    <div class="card mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        ${id ? "Edit Product" : "New Product"}
        <button class="btn btn-sm btn-outline-secondary" id="closeFormBtn">Close</button>
      </div>
      <div class="card-body">
        <div id="formError" class="alert alert-danger d-none py-2"></div>
        <form id="productForm">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Category</label>
              <select class="form-select" name="categoryId" id="categorySelect" required>
                ${CATEGORIES.map(c => `<option value="${c.id}" ${product?.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Brand</label>
              <div class="input-group">
                <select class="form-select" name="brandId" id="brandSelect">
                  <option value="">—</option>
                  ${BRANDS.map(b => `<option value="${b.id}" ${product?.brandId === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
                </select>
                <button class="btn btn-outline-secondary" type="button" id="addBrandBtn">+</button>
              </div>
            </div>
            <div class="col-md-4">
              <label class="form-label">Product Name</label>
              <input class="form-control" name="name" value="${esc(product?.name)}" required>
            </div>

            <div class="col-md-3">
              <label class="form-label">SKU</label>
              <div class="input-group">
                <input class="form-control" name="sku" id="skuInput" value="${esc(product?.sku)}" required>
                <button class="btn btn-outline-secondary" type="button" id="genSkuBtn">Gen</button>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">Barcode</label>
              <div class="input-group">
                <input class="form-control" name="barcode" id="barcodeInput" value="${esc(product?.barcode)}">
                <button class="btn btn-outline-secondary" type="button" id="genBarcodeBtn">Gen</button>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">Unit</label>
              <select class="form-select" name="unit">
                ${["piece", "inch", "sqft", "sqin", "custom"].map(u => `<option value="${u}" ${product?.unit === u ? "selected" : ""}>${u}</option>`).join("")}
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Supplier (name)</label>
              <input class="form-control" name="supplierName" value="${esc(product?.supplierName)}">
            </div>

            <div class="col-md-2">
              <label class="form-label">Cost Price</label>
              <input type="number" step="0.01" class="form-control" name="costPrice" value="${product?.costPrice ?? ""}">
            </div>
            <div class="col-md-2">
              <label class="form-label">Purchase Price</label>
              <input type="number" step="0.01" class="form-control" name="purchasePrice" value="${product?.purchasePrice ?? ""}">
            </div>
            <div class="col-md-2">
              <label class="form-label">Sale Price</label>
              <input type="number" step="0.01" class="form-control" name="salePrice" id="salePriceInput" value="${product?.salePrice ?? ""}" required>
            </div>
            <div class="col-md-2">
              <label class="form-label">Wholesale Price</label>
              <input type="number" step="0.01" class="form-control" name="wholesalePrice" value="${product?.wholesalePrice ?? ""}">
            </div>
            <div class="col-md-2">
              <label class="form-label">Min Sale Price</label>
              <input type="number" step="0.01" class="form-control" name="minSalePrice" value="${product?.minSalePrice ?? ""}">
            </div>
            <div class="col-md-2">
              <label class="form-label">Current Stock</label>
              <input type="number" step="0.01" class="form-control" name="currentStock" value="${product?.currentStock ?? 0}" required>
            </div>
            <div class="col-md-2">
              <label class="form-label">Min Stock Level</label>
              <input type="number" step="0.01" class="form-control" name="minStockLevel" value="${product?.minStockLevel ?? 0}">
            </div>

            <div class="col-md-6">
              <label class="form-label">Image URL</label>
              <input class="form-control" name="imageUrl" value="${esc(product?.imageUrl)}">
            </div>
            <div class="col-md-4">
              <label class="form-label">Description</label>
              <input class="form-control" name="description" value="${esc(product?.description)}">
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="active" ${product?.active !== false ? "checked" : ""}>
                <label class="form-check-label">Active</label>
              </div>
            </div>
          </div>

          <hr>
          <div id="categoryFields"></div>

          <div class="mt-3">
            <button class="btn btn-primary" type="submit">${id ? "Save Changes" : "Create Product"}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("closeFormBtn").addEventListener("click", () => { host.innerHTML = ""; });

  document.getElementById("genSkuBtn").addEventListener("click", async () => {
    document.getElementById("skuInput").value = await generateSKU(document.getElementById("categorySelect").value);
  });
  document.getElementById("genBarcodeBtn").addEventListener("click", async () => {
    document.getElementById("barcodeInput").value = await generateBarcode();
  });
  document.getElementById("addBrandBtn").addEventListener("click", async () => {
    const name = prompt("New brand name:");
    if (!name) return;
    const id = await addBrand(name);
    BRANDS.push({ id, name });
    const sel = document.getElementById("brandSelect");
    sel.insertAdjacentHTML("beforeend", `<option value="${id}" selected>${esc(name)}</option>`);
  });

  const catFieldsHost = document.getElementById("categoryFields");
  function renderCatFields() {
    catFieldsHost.innerHTML = renderCategoryFields(document.getElementById("categorySelect").value, product?.attrs || {});
    wireCategoryFieldEvents(catFieldsHost);
  }
  document.getElementById("categorySelect").addEventListener("change", renderCatFields);
  renderCatFields();

  document.getElementById("productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = document.getElementById("formError");
    errBox.classList.add("d-none");
    const fd = new FormData(e.target);
    const data = {
      categoryId: fd.get("categoryId"),
      brandId: fd.get("brandId") || null,
      name: fd.get("name"),
      sku: fd.get("sku"),
      barcode: fd.get("barcode") || "",
      unit: fd.get("unit"),
      supplierName: fd.get("supplierName") || "",
      costPrice: Number(fd.get("costPrice")) || 0,
      purchasePrice: Number(fd.get("purchasePrice")) || 0,
      salePrice: Number(fd.get("salePrice")) || 0,
      wholesalePrice: Number(fd.get("wholesalePrice")) || 0,
      minSalePrice: Number(fd.get("minSalePrice")) || 0,
      currentStock: Number(fd.get("currentStock")) || 0,
      minStockLevel: Number(fd.get("minStockLevel")) || 0,
      imageUrl: fd.get("imageUrl") || "",
      description: fd.get("description") || "",
      active: fd.get("active") === "on",
      attrs: collectCategoryFieldValues(catFieldsHost, fd.get("categoryId"))
    };

    try {
      if (id) {
        await updateProduct(id, data, state.user.uid, product);
      } else {
        await createProduct(data, state.user.uid);
      }
      host.innerHTML = "";
      renderProducts(container);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("d-none");
    }
  });
}

// ---- Category-specific field templates ----

function renderCategoryFields(categoryId, attrs) {
  switch (categoryId) {
    case "foam_mattress":
      return `
        <div class="row g-3">
          <div class="col-md-3"><label class="form-label">Foam Type</label><input class="form-control" data-attr="foamType" value="${esc(attrs.foamType)}"></div>
          <div class="col-md-2"><label class="form-label">Density</label><input class="form-control" data-attr="density" value="${esc(attrs.density)}"></div>
          <div class="col-md-2"><label class="form-label">Quality</label><input class="form-control" data-attr="quality" value="${esc(attrs.quality)}"></div>
          <div class="col-md-1"><label class="form-label">L (in)</label><input type="number" class="form-control calc-dim" data-attr="length" value="${attrs.length ?? ""}"></div>
          <div class="col-md-1"><label class="form-label">W (in)</label><input type="number" class="form-control calc-dim" data-attr="width" value="${attrs.width ?? ""}"></div>
          <div class="col-md-1"><label class="form-label">T (in)</label><input type="number" class="form-control calc-dim" data-attr="thickness" value="${attrs.thickness ?? ""}"></div>
        </div>
        ${customSizeCalculator(attrs)}
      `;
    case "spring_mattress":
      return `
        <div class="row g-3">
          <div class="col-md-3"><label class="form-label">Model</label><input class="form-control" data-attr="model" value="${esc(attrs.model)}"></div>
          <div class="col-md-2"><label class="form-label">Size</label><input class="form-control" data-attr="size" value="${esc(attrs.size)}"></div>
          <div class="col-md-1"><label class="form-label">L (in)</label><input type="number" class="form-control calc-dim" data-attr="length" value="${attrs.length ?? ""}"></div>
          <div class="col-md-1"><label class="form-label">W (in)</label><input type="number" class="form-control calc-dim" data-attr="width" value="${attrs.width ?? ""}"></div>
          <div class="col-md-1"><label class="form-label">H (in)</label><input type="number" class="form-control calc-dim" data-attr="height" value="${attrs.height ?? ""}"></div>
          <div class="col-md-2"><label class="form-label">Spring Type</label><input class="form-control" data-attr="springType" value="${esc(attrs.springType)}"></div>
          <div class="col-md-2"><label class="form-label">Fabric Type</label><input class="form-control" data-attr="fabricType" value="${esc(attrs.fabricType)}"></div>
          <div class="col-md-3"><label class="form-label">Foam Layer</label><input class="form-control" data-attr="foamLayer" value="${esc(attrs.foamLayer)}"></div>
          <div class="col-md-3"><label class="form-label">Warranty</label><input class="form-control" data-attr="warranty" value="${esc(attrs.warranty)}"></div>
        </div>
        ${customSizeCalculator(attrs)}
      `;
    case "pillow":
      return `
        <div class="row g-3">
          <div class="col-md-3"><label class="form-label">Type</label><input class="form-control" data-attr="type" value="${esc(attrs.type)}" placeholder="Memory foam, contour..."></div>
          <div class="col-md-3"><label class="form-label">Material</label><input class="form-control" data-attr="material" value="${esc(attrs.material)}"></div>
          <div class="col-md-3"><label class="form-label">Size</label><input class="form-control" data-attr="size" value="${esc(attrs.size)}"></div>
          <div class="col-md-3"><label class="form-label">Quality</label><input class="form-control" data-attr="quality" value="${esc(attrs.quality)}"></div>
        </div>`;
    case "healthcare":
      return `
        <div class="row g-3">
          <div class="col-md-3"><label class="form-label">Product Type</label><input class="form-control" data-attr="productType" value="${esc(attrs.productType)}"></div>
          <div class="col-md-3"><label class="form-label">Material</label><input class="form-control" data-attr="material" value="${esc(attrs.material)}"></div>
          <div class="col-md-3"><label class="form-label">Size</label><input class="form-control" data-attr="size" value="${esc(attrs.size)}"></div>
          <div class="col-md-3"><label class="form-label">Warranty</label><input class="form-control" data-attr="warranty" value="${esc(attrs.warranty)}"></div>
        </div>`;
    case "foldable_bed":
      return `
        <div class="row g-3">
          <div class="col-md-3"><label class="form-label">Size</label><input class="form-control" data-attr="size" value="${esc(attrs.size)}"></div>
          <div class="col-md-3"><label class="form-label">Frame Material</label><input class="form-control" data-attr="frameMaterial" value="${esc(attrs.frameMaterial)}"></div>
          <div class="col-md-3"><label class="form-label">Color</label><input class="form-control" data-attr="color" value="${esc(attrs.color)}"></div>
          <div class="col-md-3">
            <label class="form-label">Mattress Included</label>
            <select class="form-select" data-attr="mattressIncluded">
              <option value="false" ${attrs.mattressIncluded === false ? "selected" : ""}>No</option>
              <option value="true" ${attrs.mattressIncluded === true ? "selected" : ""}>Yes</option>
            </select>
          </div>
          <div class="col-md-6"><label class="form-label">Dimensions (free text)</label><input class="form-control" data-attr="dimensions" value="${esc(attrs.dimensions)}"></div>
        </div>`;
    case "covers_accessories":
      return `
        <div class="row g-3">
          <div class="col-md-4"><label class="form-label">Cover/Accessory Type</label><input class="form-control" data-attr="coverType" value="${esc(attrs.coverType)}" placeholder="Mattress cover, bedsheet, protector..."></div>
          <div class="col-md-4">
            <label class="form-label">Sold By</label>
            <select class="form-select" data-attr="unitType">
              ${["piece", "pair", "set", "meter", "custom"].map(u => `<option value="${u}" ${attrs.unitType === u ? "selected" : ""}>${u}</option>`).join("")}
            </select>
          </div>
        </div>`;
    default:
      return `<div class="text-muted">No extra fields for this category.</div>`;
  }
}

function collectCategoryFieldValues(host, categoryId) {
  const attrs = {};
  host.querySelectorAll("[data-attr]").forEach(el => {
    let v = el.value;
    if (el.tagName === "SELECT" && (v === "true" || v === "false")) v = v === "true";
    else if (el.type === "number") v = v === "" ? null : Number(v);
    attrs[el.dataset.attr] = v;
  });
  return attrs;
}

function customSizeCalculator() {
  return `
    <div class="card bg-light mt-3">
      <div class="card-body">
        <div class="fw-semibold mb-2">Custom Size Calculator</div>
        <div class="row g-2 align-items-end">
          <div class="col-md-2"><label class="form-label small">Length (in)</label><input type="number" class="form-control form-control-sm" id="calcLength"></div>
          <div class="col-md-2"><label class="form-label small">Width (in)</label><input type="number" class="form-control form-control-sm" id="calcWidth"></div>
          <div class="col-md-2"><label class="form-label small">Thickness (in)</label><input type="number" class="form-control form-control-sm" id="calcThickness"></div>
          <div class="col-md-2">
            <label class="form-label small">Price By</label>
            <select class="form-select form-select-sm" id="calcMethod">
              <option value="sqft">Sq. Ft.</option>
              <option value="cuft">Cu. Ft.</option>
              <option value="piece">Piece</option>
            </select>
          </div>
          <div class="col-md-2"><label class="form-label small">Cost Rate</label><input type="number" class="form-control form-control-sm" id="calcCostRate"></div>
          <div class="col-md-2"><label class="form-label small">Sale Rate</label><input type="number" class="form-control form-control-sm" id="calcSaleRate"></div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="runCalcBtn">Calculate</button>
        <button type="button" class="btn btn-sm btn-outline-success mt-2" id="applyCalcBtn">Apply to Sale/Cost Price</button>
        <div id="calcResult" class="small mt-2"></div>
      </div>
    </div>
  `;
}

function wireCategoryFieldEvents(host) {
  const runBtn = host.querySelector("#runCalcBtn");
  const applyBtn = host.querySelector("#applyCalcBtn");
  if (!runBtn) return;

  let lastResult = null;

  function readCalcInputs() {
    return {
      lengthIn: Number(host.querySelector("#calcLength").value) || 0,
      widthIn: Number(host.querySelector("#calcWidth").value) || 0,
      thicknessIn: Number(host.querySelector("#calcThickness").value) || 0,
      pricingMethod: host.querySelector("#calcMethod").value,
      costRate: Number(host.querySelector("#calcCostRate").value) || 0,
      saleRate: Number(host.querySelector("#calcSaleRate").value) || 0,
      quantity: 1
    };
  }

  runBtn.addEventListener("click", () => {
    lastResult = calcCustomMattress(readCalcInputs());
    host.querySelector("#calcResult").innerHTML = `
      Area: <strong>${lastResult.areaSqFt} sqft</strong> &nbsp;
      Volume: <strong>${lastResult.volumeCuFt} cuft</strong> &nbsp;
      Cost: <strong>${lastResult.unitCost}</strong> &nbsp;
      Sale: <strong>${lastResult.unitPrice}</strong> &nbsp;
      Profit: <strong>${lastResult.profit} (${lastResult.marginPercent}%)</strong>
    `;
  });

  applyBtn.addEventListener("click", () => {
    if (!lastResult) return;
    document.querySelector('[name="costPrice"]').value = lastResult.unitCost;
    document.querySelector('[name="salePrice"]').value = lastResult.unitPrice;
  });
}

function num(n) {
  return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
