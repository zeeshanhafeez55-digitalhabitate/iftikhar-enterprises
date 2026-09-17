import {
  db, collection, getDocs, doc, addDoc, updateDoc, deleteDoc, getDoc,
  query, where, serverTimestamp
} from "./firebase-init.js";
import { logAudit } from "./audit.js";

const CATEGORY_PREFIX = {
  foam_mattress: "FM",
  spring_mattress: "SM",
  pillow: "PL",
  healthcare: "HC",
  foldable_bed: "FB",
  covers_accessories: "CA",
  misc: "MS"
};

export async function listProducts({ categoryId } = {}) {
  const col = collection(db, "products");
  const q = categoryId ? query(col, where("categoryId", "==", categoryId)) : col;
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Generates a next-available SKU like FM-0001 for a category. */
export async function generateSKU(categoryId) {
  const prefix = CATEGORY_PREFIX[categoryId] || "GN";
  const snap = await getDocs(query(collection(db, "products"), where("categoryId", "==", categoryId)));
  let max = 0;
  snap.forEach(d => {
    const sku = d.data().sku || "";
    const m = sku.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

/** Simple internal numeric barcode (not a certified EAN checksum, but unique & scannable as Code128/Code39). */
export async function generateBarcode() {
  const snap = await getDocs(collection(db, "products"));
  let max = 200000;
  snap.forEach(d => {
    const bc = parseInt(d.data().barcode, 10);
    if (!isNaN(bc)) max = Math.max(max, bc);
  });
  return String(max + 1);
}

export async function isSkuTaken(sku, excludeId = null) {
  const snap = await getDocs(query(collection(db, "products"), where("sku", "==", sku)));
  return snap.docs.some(d => d.id !== excludeId);
}

export async function isBarcodeTaken(barcode, excludeId = null) {
  const snap = await getDocs(query(collection(db, "products"), where("barcode", "==", barcode)));
  return snap.docs.some(d => d.id !== excludeId);
}

export async function createProduct(data, userId) {
  if (await isSkuTaken(data.sku)) throw new Error(`SKU "${data.sku}" already exists.`);
  if (data.barcode && (await isBarcodeTaken(data.barcode))) throw new Error(`Barcode "${data.barcode}" already exists.`);
  if (Number(data.currentStock) < 0) throw new Error("Stock cannot be negative.");
  if (Number(data.salePrice) < 0 || Number(data.purchasePrice) < 0) throw new Error("Prices cannot be negative.");

  const ref = await addDoc(collection(db, "products"), {
    ...data,
    active: data.active !== false,
    createdAt: serverTimestamp()
  });
  await logAudit({ userId, action: "CREATE", module: "products", record: ref.id, newValue: data });
  return ref.id;
}

export async function updateProduct(id, patch, userId, oldValue) {
  if (patch.sku && (await isSkuTaken(patch.sku, id))) throw new Error(`SKU "${patch.sku}" already exists.`);
  if (patch.barcode && (await isBarcodeTaken(patch.barcode, id))) throw new Error(`Barcode "${patch.barcode}" already exists.`);

  await updateDoc(doc(db, "products", id), patch);
  await logAudit({ userId, action: "UPDATE", module: "products", record: id, oldValue, newValue: patch });
}

export async function deleteProduct(id, userId) {
  await deleteDoc(doc(db, "products", id));
  await logAudit({ userId, action: "DELETE", module: "products", record: id });
}

export function isLowStock(product) {
  return Number(product.currentStock) <= Number(product.minStockLevel ?? 0);
}
