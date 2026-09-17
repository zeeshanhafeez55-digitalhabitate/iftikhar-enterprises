import {
  db, collection, addDoc, doc, getDoc, getDocs, query, where, orderBy,
  updateDoc, serverTimestamp, increment
} from "./firebase-init.js";
import { applyStockMovement } from "./stock.js";
import { addLedgerEntry } from "./ledger.js";
import { logAudit } from "./audit.js";
import { round2 } from "./pricing.js";

/**
 * Sale return: restocks items (when restock=true), refunds cash or credits the customer.
 * items: [{ productId, productName, qty, rate, restock }]
 */
export async function createSaleReturn({
  saleId, invoiceNo, customerId, customerName, items, reason,
  refundAmount, refundMethod, creditCustomer, userId
}) {
  if (!items.length) throw new Error("Select at least one item to return.");

  const total = round2(items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0));
  const refund = round2(refundAmount || 0);

  const ref = await addDoc(collection(db, "saleReturns"), {
    saleId, invoiceNo, customerId: customerId || null, customerName: customerName || "Walk-in Customer",
    items, reason: reason || "", totalAmount: total,
    refundAmount: refund, refundMethod: refundMethod || null,
    creditCustomer: !!creditCustomer,
    userId, at: serverTimestamp()
  });

  for (const it of items) {
    if (it.productId && it.restock) {
      await applyStockMovement({
        productId: it.productId, type: "SALE_RETURN", qty: Number(it.qty),
        reference: `RET-${invoiceNo}`, cost: Number(it.costPrice) || 0, userId
      });
    }
  }

  if (refund > 0) {
    await addDoc(collection(db, "cashTransactions"), {
      direction: "OUT", source: "SALE_RETURN", method: refundMethod || "Cash",
      amount: refund, reference: `RET-${invoiceNo}`, userId, at: serverTimestamp()
    });
  }

  if (customerId) {
    // Return reduces what the customer owes.
    await addLedgerEntry("customer", customerId, {
      type: "SALE_RETURN", reference: `RET-${invoiceNo}`, credit: total, note: reason
    });
    if (creditCustomer) {
      await updateDoc(doc(db, "customers", customerId), { outstandingBalance: increment(-total) });
    }
  }

  await logAudit({ userId, action: "CREATE", module: "sales", record: ref.id, newValue: { type: "SALE_RETURN", invoiceNo, total } });
  return ref.id;
}

/** Purchase return: removes stock and reduces supplier payable. */
export async function createPurchaseReturn({
  purchaseId, purchaseNo, supplierId, supplierName, items, reason, userId
}) {
  if (!items.length) throw new Error("Select at least one item to return.");
  const total = round2(items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0));

  const ref = await addDoc(collection(db, "purchaseReturns"), {
    purchaseId, purchaseNo, supplierId: supplierId || null, supplierName: supplierName || "",
    items, reason: reason || "", totalAmount: total, userId, at: serverTimestamp()
  });

  for (const it of items) {
    if (it.productId) {
      await applyStockMovement({
        productId: it.productId, type: "PURCHASE_RETURN", qty: Number(it.qty),
        reference: `PRET-${purchaseNo}`, cost: Number(it.rate), userId
      });
    }
  }

  if (supplierId) {
    await addLedgerEntry("supplier", supplierId, {
      type: "PURCHASE_RETURN", reference: `PRET-${purchaseNo}`, debit: total, note: reason
    });
    await updateDoc(doc(db, "suppliers", supplierId), { payableBalance: increment(-total) });
  }

  await logAudit({ userId, action: "CREATE", module: "purchases", record: ref.id, newValue: { type: "PURCHASE_RETURN", purchaseNo, total } });
  return ref.id;
}

export async function listSaleReturns() {
  const snap = await getDocs(query(collection(db, "saleReturns"), orderBy("at", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listPurchaseReturns() {
  const snap = await getDocs(query(collection(db, "purchaseReturns"), orderBy("at", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Cancels a sale: reverses stock, marks cancelled. Requires sales:delete. */
export async function cancelSale(saleId, userId, reason = "") {
  const saleSnap = await getDoc(doc(db, "sales", saleId));
  if (!saleSnap.exists()) throw new Error("Sale not found.");
  const sale = saleSnap.data();
  if (sale.cancelled) throw new Error("This sale is already cancelled.");

  const itemsSnap = await getDocs(query(collection(db, "saleItems"), where("saleId", "==", saleId)));
  for (const d of itemsSnap.docs) {
    const it = d.data();
    if (it.productId) {
      await applyStockMovement({
        productId: it.productId, type: "SALE_RETURN", qty: Number(it.qty),
        reference: `CANCEL-${sale.invoiceNo}`, cost: it.costPrice || 0, userId
      });
    }
  }

  if (sale.customerId) {
    await addLedgerEntry("customer", sale.customerId, {
      type: "SALE_CANCELLED", reference: sale.invoiceNo, credit: sale.grandTotal, note: reason
    });
    await updateDoc(doc(db, "customers", sale.customerId), { outstandingBalance: increment(-(sale.remaining || 0)) });
  }

  if (sale.paidAmount > 0) {
    await addDoc(collection(db, "cashTransactions"), {
      direction: "OUT", source: "SALE_CANCELLED", method: "Cash",
      amount: sale.paidAmount, reference: sale.invoiceNo, userId, at: serverTimestamp()
    });
  }

  await updateDoc(doc(db, "sales", saleId), { cancelled: true, cancelReason: reason, cancelledAt: serverTimestamp() });
  await logAudit({ userId, action: "DELETE", module: "sales", record: saleId, oldValue: { invoiceNo: sale.invoiceNo }, newValue: { cancelled: true, reason } });
}
