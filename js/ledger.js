import {
  db, collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc,
  serverTimestamp, increment
} from "./firebase-init.js";
import { round2 } from "./pricing.js";
import { logAudit } from "./audit.js";

/** Appends an entry to a party ledger. kind: "customer" | "supplier" */
export async function addLedgerEntry(kind, partyId, { type, reference, debit = 0, credit = 0, note = "" }) {
  const col = kind === "customer" ? "customerLedger" : "supplierLedger";
  await addDoc(collection(db, col), {
    [kind === "customer" ? "customerId" : "supplierId"]: partyId,
    type, reference: reference || null,
    debit: round2(debit), credit: round2(credit),
    note,
    at: serverTimestamp()
  });
}

export async function getLedger(kind, partyId) {
  const col = kind === "customer" ? "customerLedger" : "supplierLedger";
  const field = kind === "customer" ? "customerId" : "supplierId";
  const snap = await getDocs(query(collection(db, col), where(field, "==", partyId), orderBy("at", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Builds a running-balance statement from ledger rows. */
export function buildStatement(entries, openingBalance = 0) {
  let balance = Number(openingBalance) || 0;
  const rows = entries.map(e => {
    balance += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    return { ...e, balance: round2(balance) };
  });
  return {
    rows,
    openingBalance: round2(openingBalance),
    totalDebit: round2(entries.reduce((s, e) => s + (Number(e.debit) || 0), 0)),
    totalCredit: round2(entries.reduce((s, e) => s + (Number(e.credit) || 0), 0)),
    closingBalance: round2(balance)
  };
}

/** Records a payment received from a customer. */
export async function receiveCustomerPayment({ customerId, amount, method, note, userId }) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Payment amount must be greater than zero.");

  const ref = await addDoc(collection(db, "payments"), {
    type: "CUSTOMER_PAYMENT", customerId, method, amount: amt, note: note || "", userId, at: serverTimestamp()
  });
  await addLedgerEntry("customer", customerId, { type: "PAYMENT", reference: ref.id, credit: amt, note });
  await addDoc(collection(db, "cashTransactions"), {
    direction: "IN", source: "CUSTOMER_PAYMENT", method, amount: amt, reference: ref.id, userId, at: serverTimestamp()
  });
  await updateDoc(doc(db, "customers", customerId), {
    outstandingBalance: increment(-amt),
    totalPaid: increment(amt)
  });
  await logAudit({ userId, action: "CREATE", module: "customers", record: customerId, newValue: { payment: amt, method } });
  return ref.id;
}

/** Records a payment made to a supplier. */
export async function paySupplier({ supplierId, amount, method, note, userId }) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Payment amount must be greater than zero.");

  const ref = await addDoc(collection(db, "payments"), {
    type: "SUPPLIER_PAYMENT", supplierId, method, amount: amt, note: note || "", userId, at: serverTimestamp()
  });
  await addLedgerEntry("supplier", supplierId, { type: "PAYMENT", reference: ref.id, debit: amt, note });
  await addDoc(collection(db, "cashTransactions"), {
    direction: "OUT", source: "SUPPLIER_PAYMENT", method, amount: amt, reference: ref.id, userId, at: serverTimestamp()
  });
  await updateDoc(doc(db, "suppliers", supplierId), {
    payableBalance: increment(-amt),
    totalPaid: increment(amt)
  });
  await logAudit({ userId, action: "CREATE", module: "suppliers", record: supplierId, newValue: { payment: amt, method } });
  return ref.id;
}
