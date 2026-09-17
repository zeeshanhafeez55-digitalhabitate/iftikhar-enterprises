import {
  db, doc, collection, addDoc, runTransaction, serverTimestamp,
  getDocs, query, where, orderBy
} from "./firebase-init.js";

export const MOVEMENT_TYPES = [
  "PURCHASE", "SALE", "SALE_RETURN", "PURCHASE_RETURN",
  "ADJUSTMENT", "DAMAGE", "EXPIRED", "MANUAL"
];

const OUTBOUND = ["SALE", "PURCHASE_RETURN", "DAMAGE", "EXPIRED"];

/**
 * Atomically applies a stock movement and updates product.currentStock.
 * qty is always positive; direction is derived from type.
 */
export async function applyStockMovement({
  productId, type, qty, reference, cost = 0, userId, branchId = null, warehouseId = null, note = ""
}, { allowNegativeStock = false } = {}) {
  const productRef = doc(db, "products", productId);
  const signed = OUTBOUND.includes(type) ? -Math.abs(qty) : Math.abs(qty);

  const balance = await runTransaction(db, async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists()) throw new Error("Product not found.");
    const current = Number(snap.data().currentStock) || 0;
    const next = current + signed;
    if (next < 0 && !allowNegativeStock) {
      throw new Error(`Insufficient stock for "${snap.data().name}". Available: ${current}, required: ${Math.abs(signed)}.`);
    }
    tx.update(productRef, { currentStock: next });
    return next;
  });

  await addDoc(collection(db, "stockMovements"), {
    productId,
    type,
    qtyIn: signed > 0 ? Math.abs(signed) : 0,
    qtyOut: signed < 0 ? Math.abs(signed) : 0,
    balance,
    cost: Number(cost) || 0,
    reference: reference || null,
    branchId, warehouseId,
    userId: userId || null,
    note,
    at: serverTimestamp()
  });

  return balance;
}

export async function getProductLedger(productId) {
  const snap = await getDocs(
    query(collection(db, "stockMovements"), where("productId", "==", productId), orderBy("at", "asc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
