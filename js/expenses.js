import {
  db, collection, addDoc, doc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "./firebase-init.js";
import { logAudit } from "./audit.js";
import { round2 } from "./pricing.js";

export const EXPENSE_CATEGORIES = [
  "Rent", "Electricity", "Salary", "Transport", "Loading/Unloading",
  "Delivery", "Fuel", "Repair", "Tea/Food", "Marketing", "Miscellaneous"
];

export async function listExpenses() {
  const snap = await getDocs(query(collection(db, "expenses"), orderBy("date", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createExpense(data, userId) {
  const amount = round2(data.amount);
  if (amount <= 0) throw new Error("Expense amount must be greater than zero.");

  const ref = await addDoc(collection(db, "expenses"), {
    date: data.date ? new Date(data.date) : serverTimestamp(),
    category: data.category,
    description: data.description || "",
    amount,
    method: data.method || "Cash",
    employee: data.employee || "",
    notes: data.notes || "",
    userId,
    createdAt: serverTimestamp()
  });

  await addDoc(collection(db, "cashTransactions"), {
    direction: "OUT", source: "EXPENSE", method: data.method || "Cash",
    amount, reference: ref.id, note: data.category, userId, at: serverTimestamp()
  });

  await logAudit({ userId, action: "CREATE", module: "expenses", record: ref.id, newValue: { category: data.category, amount } });
  return ref.id;
}

export async function updateExpense(id, patch, userId) {
  await updateDoc(doc(db, "expenses", id), patch);
  await logAudit({ userId, action: "UPDATE", module: "expenses", record: id, newValue: patch });
}

export async function deleteExpense(id, userId) {
  await deleteDoc(doc(db, "expenses", id));
  await logAudit({ userId, action: "DELETE", module: "expenses", record: id });
}

export async function listCashTransactions() {
  const snap = await getDocs(query(collection(db, "cashTransactions"), orderBy("at", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Builds a daily cash reconciliation for a given date. */
export function buildCashBook(transactions, dateStr) {
  const target = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const before = transactions.filter(t => toDate(t.at) && toDate(t.at) < start);
  const today = transactions.filter(t => {
    const d = toDate(t.at);
    return d && d >= start && d < end;
  });

  const sum = (list, dir, source) => round2(list
    .filter(t => t.direction === dir && (!source || t.source === source))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0));

  const openingCash = round2(
    before.filter(t => t.direction === "IN").reduce((s, t) => s + Number(t.amount || 0), 0) -
    before.filter(t => t.direction === "OUT").reduce((s, t) => s + Number(t.amount || 0), 0)
  );

  const totalIn = sum(today, "IN");
  const totalOut = sum(today, "OUT");

  return {
    date: start,
    openingCash,
    cashSales: sum(today, "IN", "SALE"),
    customerPayments: sum(today, "IN", "CUSTOMER_PAYMENT"),
    otherIn: round2(totalIn - sum(today, "IN", "SALE") - sum(today, "IN", "CUSTOMER_PAYMENT")),
    expenses: sum(today, "OUT", "EXPENSE"),
    supplierPayments: sum(today, "OUT", "SUPPLIER_PAYMENT"),
    purchases: sum(today, "OUT", "PURCHASE"),
    refunds: sum(today, "OUT", "SALE_RETURN"),
    totalIn, totalOut,
    closingCash: round2(openingCash + totalIn - totalOut),
    transactions: today
  };
}

export function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}
