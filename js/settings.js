import { db, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc } from "./firebase-init.js";
import { logAudit } from "./audit.js";

const SETTINGS_DOC = "business";

export const DEFAULT_SETTINGS = {
  businessName: "Iftikhar Enterprises",
  logoUrl: "",
  phone: "0322-6529414",
  whatsapp: "0322-6529414",
  address: "",
  currency: "PKR",
  currencySymbol: "Rs.",
  taxPercent: 0,
  invoicePrefix: "INV-",
  invoiceNextNumber: 1,
  purchaseInvoicePrefix: "PUR-",
  purchaseInvoiceNextNumber: 1,
  receiptSize: "A4", // A4 | 80mm | 58mm
  dateFormat: "DD-MM-YYYY",
  lowStockThreshold: 5,
  maxDiscountPercent: 10,
  maxDiscountAmount: 5000,
  allowNegativeStock: false,
  paymentMethods: ["Cash", "Bank Transfer", "JazzCash", "Easypaisa", "Card", "Credit"]
};

export async function getSettings() {
  const snap = await getDoc(doc(db, "settings", SETTINGS_DOC));
  if (!snap.exists()) {
    await setDoc(doc(db, "settings", SETTINGS_DOC), DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
  return snap.data();
}

export async function updateSettings(patch, userId) {
  await updateDoc(doc(db, "settings", SETTINGS_DOC), patch);
  await logAudit({ userId, action: "UPDATE", module: "settings", record: SETTINGS_DOC, newValue: patch });
}

// ---- Branches ----
export async function listBranches() {
  const snap = await getDocs(collection(db, "branches"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addBranch(data) {
  return (await addDoc(collection(db, "branches"), data)).id;
}
export async function updateBranch(id, data) {
  await updateDoc(doc(db, "branches", id), data);
}
export async function deleteBranch(id) {
  await deleteDoc(doc(db, "branches", id));
}

// ---- Warehouses ----
export async function listWarehouses() {
  const snap = await getDocs(collection(db, "warehouses"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addWarehouse(data) {
  return (await addDoc(collection(db, "warehouses"), data)).id;
}
export async function updateWarehouse(id, data) {
  await updateDoc(doc(db, "warehouses", id), data);
}
export async function deleteWarehouse(id) {
  await deleteDoc(doc(db, "warehouses", id));
}
