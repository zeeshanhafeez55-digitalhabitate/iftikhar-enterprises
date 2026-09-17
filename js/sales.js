import {
  db, doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where,
  orderBy, limit, runTransaction, serverTimestamp, increment
} from "./firebase-init.js";
import { applyStockMovement } from "./stock.js";
import { logAudit } from "./audit.js";
import { round2 } from "./pricing.js";

/** Atomically reserves the next invoice number from settings. */
export async function nextInvoiceNumber() {
  const ref = doc(db, "settings", "business");
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const s = snap.data();
    const n = Number(s.invoiceNextNumber) || 1;
    tx.update(ref, { invoiceNextNumber: n + 1 });
    return `${s.invoicePrefix || "INV-"}${String(n).padStart(5, "0")}`;
  });
}

/**
 * Computes invoice totals.
 * items: [{ qty, rate, discount (amount), ... }]
 */
export function computeTotals({ items, invoiceDiscount = 0, taxPercent = 0, additionalCharges = 0, deliveryCharges = 0, previousBalance = 0, paidAmount = 0 }) {
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) * Number(it.rate) - (Number(it.discount) || 0)), 0);
  const afterDiscount = subtotal - (Number(invoiceDiscount) || 0);
  const taxAmount = afterDiscount * ((Number(taxPercent) || 0) / 100);
  const grandTotal = afterDiscount + taxAmount + (Number(additionalCharges) || 0) + (Number(deliveryCharges) || 0);
  const payable = grandTotal + (Number(previousBalance) || 0);
  const remaining = payable - (Number(paidAmount) || 0);

  const totalCost = items.reduce((s, it) => s + Number(it.qty) * (Number(it.costPrice) || 0), 0);
  const grossProfit = afterDiscount - totalCost;

  return {
    subtotal: round2(subtotal),
    invoiceDiscount: round2(invoiceDiscount),
    taxPercent: Number(taxPercent) || 0,
    taxAmount: round2(taxAmount),
    additionalCharges: round2(additionalCharges),
    deliveryCharges: round2(deliveryCharges),
    grandTotal: round2(grandTotal),
    previousBalance: round2(previousBalance),
    payable: round2(payable),
    paidAmount: round2(paidAmount),
    remaining: round2(remaining),
    totalCost: round2(totalCost),
    grossProfit: round2(grossProfit)
  };
}

/**
 * Commits a sale: writes sale + saleItems, decrements stock, records
 * cash/customer-ledger entries. Returns { saleId, invoiceNo }.
 *
 * payments: [{ method, amount }]  (supports split payment)
 */
export async function createSale({
  items, totals, customerId, customerName, customerPhone,
  payments, notes, userId, branchId = null, warehouseId = null,
  delivery = null
}, { allowNegativeStock = false } = {}) {

  if (!items.length) throw new Error("Add at least one item to the invoice.");

  const invoiceNo = await nextInvoiceNumber();

  const saleRef = await addDoc(collection(db, "sales"), {
    invoiceNo,
    date: serverTimestamp(),
    customerId: customerId || null,
    customerName: customerName || "Walk-in Customer",
    customerPhone: customerPhone || "",
    ...totals,
    payments,
    paymentMethods: payments.map(p => p.method),
    status: totals.remaining > 0 ? "PARTIAL" : "PAID",
    notes: notes || "",
    branchId, warehouseId,
    userId,
    delivery: delivery || null,
    cancelled: false,
    createdAt: serverTimestamp()
  });

  // Line items + stock movements
  for (const it of items) {
    await addDoc(collection(db, "saleItems"), {
      saleId: saleRef.id,
      invoiceNo,
      productId: it.productId || null,
      productName: it.productName,
      sku: it.sku || "",
      dimensions: it.dimensions || null,
      qty: Number(it.qty),
      rate: Number(it.rate),
      discount: Number(it.discount) || 0,
      costPrice: Number(it.costPrice) || 0,
      amount: round2(Number(it.qty) * Number(it.rate) - (Number(it.discount) || 0)),
      profit: round2(Number(it.qty) * (Number(it.rate) - (Number(it.costPrice) || 0)) - (Number(it.discount) || 0)),
      at: serverTimestamp()
    });

    if (it.productId) {
      await applyStockMovement({
        productId: it.productId,
        type: "SALE",
        qty: Number(it.qty),
        reference: invoiceNo,
        cost: Number(it.costPrice) || 0,
        userId, branchId, warehouseId
      }, { allowNegativeStock });
    }
  }

  // Payment records + cash book entries
  for (const p of payments) {
    if (!Number(p.amount)) continue;
    await addDoc(collection(db, "payments"), {
      type: "SALE_PAYMENT",
      saleId: saleRef.id,
      invoiceNo,
      customerId: customerId || null,
      method: p.method,
      amount: round2(p.amount),
      userId,
      at: serverTimestamp()
    });
    await addDoc(collection(db, "cashTransactions"), {
      direction: "IN",
      source: "SALE",
      method: p.method,
      amount: round2(p.amount),
      reference: invoiceNo,
      userId,
      at: serverTimestamp()
    });
  }

  // Customer ledger + running balance
  if (customerId) {
    await addDoc(collection(db, "customerLedger"), {
      customerId,
      type: "SALE",
      reference: invoiceNo,
      debit: totals.grandTotal,
      credit: totals.paidAmount,
      balanceAfter: totals.remaining,
      at: serverTimestamp()
    });
    await updateDoc(doc(db, "customers", customerId), {
      outstandingBalance: round2(totals.remaining),
      totalPurchases: increment(totals.grandTotal),
      totalPaid: increment(totals.paidAmount)
    });
  }

  await logAudit({ userId, action: "CREATE", module: "sales", record: saleRef.id, newValue: { invoiceNo, grandTotal: totals.grandTotal } });

  return { saleId: saleRef.id, invoiceNo };
}

export async function getSale(saleId) {
  const snap = await getDoc(doc(db, "sales", saleId));
  if (!snap.exists()) return null;
  const itemsSnap = await getDocs(query(collection(db, "saleItems"), where("saleId", "==", saleId)));
  return { id: snap.id, ...snap.data(), items: itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

export async function recentSales(n = 25) {
  const snap = await getDocs(query(collection(db, "sales"), orderBy("createdAt", "desc"), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
