import {
  db, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "./firebase-init.js";
import { logAudit } from "./audit.js";

export async function listCustomers() {
  const snap = await getDocs(collection(db, "customers"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCustomer(id) {
  const snap = await getDoc(doc(db, "customers", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCustomer(data, userId) {
  const ref = await addDoc(collection(db, "customers"), {
    name: data.name,
    fatherOrCompany: data.fatherOrCompany || "",
    phone: data.phone || "",
    whatsapp: data.whatsapp || "",
    address: data.address || "",
    city: data.city || "",
    openingBalance: Number(data.openingBalance) || 0,
    outstandingBalance: Number(data.openingBalance) || 0,
    creditLimit: Number(data.creditLimit) || 0,
    totalPurchases: 0,
    totalPaid: 0,
    notes: data.notes || "",
    createdAt: serverTimestamp()
  });
  await logAudit({ userId, action: "CREATE", module: "customers", record: ref.id, newValue: data });
  return ref.id;
}

export async function updateCustomer(id, patch, userId) {
  await updateDoc(doc(db, "customers", id), patch);
  await logAudit({ userId, action: "UPDATE", module: "customers", record: id, newValue: patch });
}

export async function deleteCustomer(id, userId) {
  await deleteDoc(doc(db, "customers", id));
  await logAudit({ userId, action: "DELETE", module: "customers", record: id });
}

/** Credit check: returns { allowed, available, message } */
export function checkCreditLimit(customer, newCreditAmount) {
  const limit = Number(customer.creditLimit) || 0;
  const balance = Number(customer.outstandingBalance) || 0;
  const available = limit - balance;
  if (limit <= 0) {
    return { allowed: true, available: Infinity, message: "No credit limit set." };
  }
  if (newCreditAmount > available) {
    return {
      allowed: false,
      available,
      message: `Credit limit exceeded. Limit ${limit}, existing balance ${balance}, available ${available}, this invoice needs ${newCreditAmount}.`
    };
  }
  return { allowed: true, available, message: "" };
}
