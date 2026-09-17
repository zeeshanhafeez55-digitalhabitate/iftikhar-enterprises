import {
  db, collection, addDoc, doc, getDoc, getDocs, query, where, orderBy, limit,
  updateDoc, runTransaction, serverTimestamp, increment
} from "./firebase-init.js";
import { applyStockMovement } from "./stock.js";
import { addLedgerEntry } from "./ledger.js";
import { logAudit } from "./audit.js";
import { round2 } from "./pricing.js";

export async function nextPurchaseNumber() {
  const ref = doc(db, "settings", "business");
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const s = snap.data();
    const n = Number(s.purchaseInvoiceNextNumber) || 1;
    tx.update(ref, { purchaseInvoiceNextNumber: n + 1 });
    return `${s.purchaseInvoicePrefix || "PUR-"}${String(n).padStart(5, "0")}`;
  });
}

export function computePurchaseTotals({ items, discount = 0, additionalExpenses = 0, paidAmount = 0 }) {
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.rate), 0);
  const grandTotal = subtotal - (Number(discount) || 0) + (Number(additionalExpenses) || 0);
  const remaining = grandTotal - (Number(paidAmount) || 0);
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    additionalExpenses: round2(additionalExpenses),
    grandTotal: round2(grandTotal),
    paidAmount: round2(paidAmount),
    remaining: round2(remaining)
  };
}

/**
 * Commits a purchase: writes purchase + purchaseItems, increases stock,
 * updates weighted-average cost, records supplier ledger + cash out.
 */
export async function createPurchase({
  items, totals, supplierId, supplierName, paymentMethod, notes, userId,
  branchId = null, warehouseId = null, date = null
}) {
  if (!items.length) throw new Error("Add at least one item to the purchase.");

  const purchaseNo = await nextPurchaseNumber();

  const ref = await addDoc(collection(db, "purchases"), {
    purchaseNo,
    date: date ? new Date(date) : serverTimestamp(),
    supplierId: supplierId || null,
    supplierName: supplierName || "Cash Supplier",
    ...totals,
    paymentMethod,
    status: totals.remaining > 0 ? "PARTIAL" : "PAID",
    notes: notes || "",
    branchId, warehouseId, userId,
    cancelled: false,
    createdAt: serverTimestamp()
  });

  for (const it of items) {
    await addDoc(collection(db, "purchaseItems"), {
      purchaseId: ref.id,
      purchaseNo,
      productId: it.productId,
      productName: it.productName,
      sku: it.sku || "",
      dimensions: it.dimensions || null,
      qty: Number(it.qty),
      rate: Number(it.rate),
      amount: round2(Number(it.qty) * Number(it.rate)),
      at: serverTimestamp()
    });

    if (it.productId) {
      await applyStockMovement({
        productId: it.productId,
        type: "PURCHASE",
        qty: Number(it.qty),
        reference: purchaseNo,
        cost: Number(it.rate),
        userId, branchId, warehouseId
      });
      await updateWeightedAverageCost(it.productId, Number(it.qty), Number(it.rate));
    }
  }

  if (totals.paidAmount > 0) {
    await addDoc(collection(db, "payments"), {
      type: "PURCHASE_PAYMENT", purchaseId: ref.id, purchaseNo, supplierId: supplierId || null,
      method: paymentMethod, amount: totals.paidAmount, userId, at: serverTimestamp()
    });
    await addDoc(collection(db, "cashTransactions"), {
      direction: "OUT", source: "PURCHASE", method: paymentMethod,
      amount: totals.paidAmount, reference: purchaseNo, userId, at: serverTimestamp()
    });
  }

  if (supplierId) {
    await addLedgerEntry("supplier", supplierId, {
      type: "PURCHASE", reference: purchaseNo,
      credit: totals.grandTotal, debit: totals.paidAmount
    });
    await updateDoc(doc(db, "suppliers", supplierId), {
      payableBalance: increment(totals.remaining),
      totalPurchases: increment(totals.grandTotal),
      totalPaid: increment(totals.paidAmount)
    });
  }

  await logAudit({ userId, action: "CREATE", module: "purchases", record: ref.id, newValue: { purchaseNo, grandTotal: totals.grandTotal } });
  return { purchaseId: ref.id, purchaseNo };
}

/** Weighted average cost: newCost = (oldQty*oldCost + inQty*inRate) / (oldQty + inQty) */
async function updateWeightedAverageCost(productId, inQty, inRate) {
  const ref = doc(db, "products", productId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const p = snap.data();
    const oldQty = Math.max(0, (Number(p.currentStock) || 0) - inQty);
    const oldCost = Number(p.costPrice) || 0;
    const totalQty = oldQty + inQty;
    const newCost = totalQty > 0 ? (oldQty * oldCost + inQty * inRate) / totalQty : inRate;
    tx.update(ref, { costPrice: round2(newCost), purchasePrice: round2(inRate) });
  });
}

export async function getPurchase(id) {
  const snap = await getDoc(doc(db, "purchases", id));
  if (!snap.exists()) return null;
  const itemsSnap = await getDocs(query(collection(db, "purchaseItems"), where("purchaseId", "==", id)));
  return { id: snap.id, ...snap.data(), items: itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

export async function recentPurchases(n = 200) {
  const snap = await getDocs(query(collection(db, "purchases"), orderBy("createdAt", "desc"), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
