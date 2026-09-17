import {
  db, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, increment
} from "./firebase-init.js";
import { logAudit } from "./audit.js";

export async function listSuppliers() {
  const snap = await getDocs(collection(db, "suppliers"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSupplier(id) {
  const snap = await getDoc(doc(db, "suppliers", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createSupplier(data, userId) {
  const opening = Number(data.openingBalance) || 0;
  const ref = await addDoc(collection(db, "suppliers"), {
    name: data.name,
    contactPerson: data.contactPerson || "",
    phone: data.phone || "",
    whatsapp: data.whatsapp || "",
    address: data.address || "",
    city: data.city || "",
    openingBalance: opening,
    payableBalance: opening,
    creditLimit: Number(data.creditLimit) || 0,
    totalPurchases: 0,
    totalPaid: 0,
    notes: data.notes || "",
    createdAt: serverTimestamp()
  });
  await logAudit({ userId, action: "CREATE", module: "suppliers", record: ref.id, newValue: data });
  return ref.id;
}

export async function updateSupplier(id, patch, userId) {
  await updateDoc(doc(db, "suppliers", id), patch);
  await logAudit({ userId, action: "UPDATE", module: "suppliers", record: id, newValue: patch });
}

export async function deleteSupplier(id, userId) {
  await deleteDoc(doc(db, "suppliers", id));
  await logAudit({ userId, action: "DELETE", module: "suppliers", record: id });
}

export async function adjustSupplierBalance(id, delta) {
  await updateDoc(doc(db, "suppliers", id), { payableBalance: increment(delta) });
}
