import {
  db, collection, addDoc, doc, getDocs, getDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "./firebase-init.js";
import { logAudit } from "./audit.js";
import { round2 } from "./pricing.js";

export const DELIVERY_STATUSES = ["Pending", "Scheduled", "Out for Delivery", "Delivered", "Cancelled"];
export const ORDER_STATUSES = ["New", "Confirmed", "In Production", "Ready", "Delivered", "Cancelled"];

// ---------- Deliveries ----------

export async function listDeliveries() {
  const snap = await getDocs(query(collection(db, "deliveries"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createDelivery(data, userId) {
  const ref = await addDoc(collection(db, "deliveries"), {
    ...data,
    status: data.status || "Pending",
    userId,
    createdAt: serverTimestamp()
  });
  await logAudit({ userId, action: "CREATE", module: "sales", record: ref.id, newValue: { delivery: data } });
  return ref.id;
}

export async function updateDeliveryStatus(id, status, userId) {
  await updateDoc(doc(db, "deliveries", id), { status, updatedAt: serverTimestamp() });
  await logAudit({ userId, action: "UPDATE", module: "sales", record: id, newValue: { deliveryStatus: status } });
}

export async function deleteDelivery(id, userId) {
  await deleteDoc(doc(db, "deliveries", id));
  await logAudit({ userId, action: "DELETE", module: "sales", record: id });
}

// ---------- Custom mattress orders ----------

export async function listCustomOrders() {
  const snap = await getDocs(query(collection(db, "customOrders"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCustomOrder(id) {
  const snap = await getDoc(doc(db, "customOrders", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCustomOrder(data, userId) {
  const rate = Number(data.rate) || 0;
  const qty = Number(data.quantity) || 1;
  const total = round2(rate * qty);
  const advance = round2(Number(data.advance) || 0);

  const ref = await addDoc(collection(db, "customOrders"), {
    customerId: data.customerId || null,
    customerName: data.customerName || "",
    customerPhone: data.customerPhone || "",
    productDescription: data.productDescription || "",
    length: Number(data.length) || 0,
    width: Number(data.width) || 0,
    thickness: Number(data.thickness) || 0,
    quality: data.quality || "",
    coverColor: data.coverColor || "",
    quantity: qty,
    rate,
    totalAmount: total,
    advance,
    remaining: round2(total - advance),
    expectedCompletion: data.expectedCompletion || "",
    deliveryDate: data.deliveryDate || "",
    notes: data.notes || "",
    status: "New",
    userId,
    createdAt: serverTimestamp()
  });

  if (advance > 0) {
    await addDoc(collection(db, "cashTransactions"), {
      direction: "IN", source: "CUSTOM_ORDER_ADVANCE", method: data.advanceMethod || "Cash",
      amount: advance, reference: ref.id, userId, at: serverTimestamp()
    });
  }

  await logAudit({ userId, action: "CREATE", module: "sales", record: ref.id, newValue: { customOrder: data.productDescription, total } });
  return ref.id;
}

export async function updateCustomOrder(id, patch, userId) {
  await updateDoc(doc(db, "customOrders", id), { ...patch, updatedAt: serverTimestamp() });
  await logAudit({ userId, action: "UPDATE", module: "sales", record: id, newValue: patch });
}

export async function deleteCustomOrder(id, userId) {
  await deleteDoc(doc(db, "customOrders", id));
  await logAudit({ userId, action: "DELETE", module: "sales", record: id });
}
