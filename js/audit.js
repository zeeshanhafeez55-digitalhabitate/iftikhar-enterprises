import { db, addDoc, collection, serverTimestamp } from "./firebase-init.js";

/**
 * Records an audit trail entry. Call after any create/update/delete
 * on sales, purchases, stock, prices, expenses, users, or settings.
 */
export async function logAudit({ userId, action, module, record, oldValue, newValue }) {
  await addDoc(collection(db, "auditLogs"), {
    userId: userId || null,
    action,        // CREATE | UPDATE | DELETE
    module,        // e.g. "products", "sales", "settings"
    record: record || null,
    oldValue: oldValue || null,
    newValue: newValue || null,
    at: serverTimestamp()
  });
}
