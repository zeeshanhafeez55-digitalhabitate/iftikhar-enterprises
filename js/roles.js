import { db, doc, setDoc, getDoc } from "./firebase-init.js";

export const MODULES = [
  "users", "settings", "products", "customers", "suppliers",
  "sales", "purchases", "stock", "expenses", "reports"
];

export const ACTIONS = [
  "view", "create", "edit", "delete", "print", "export", "refund", "discount", "credit"
];

function fullAccess() {
  const p = {};
  MODULES.forEach(m => {
    p[m] = {};
    ACTIONS.forEach(a => (p[m][a] = true));
  });
  return p;
}

function blank() {
  const p = {};
  MODULES.forEach(m => {
    p[m] = {};
    ACTIONS.forEach(a => (p[m][a] = false));
  });
  return p;
}

function grant(perm, module, actions) {
  actions.forEach(a => (perm[module][a] = true));
}

export function buildDefaultRoles() {
  const roles = {};

  roles.SUPER_ADMIN = {
    label: "Super Admin",
    permissions: fullAccess()
  };

  const admin = blank();
  MODULES.forEach(m => grant(admin, m, ["view", "create", "edit", "delete", "print", "export", "refund", "discount", "credit"]));
  admin.users = { view: true, create: true, edit: true, delete: false, print: false, export: true, refund: false, discount: false, credit: false };
  roles.ADMIN = { label: "Admin", permissions: admin };

  const manager = blank();
  grant(manager, "products", ["view", "create", "edit", "print", "export"]);
  grant(manager, "customers", ["view", "create", "edit", "print", "export"]);
  grant(manager, "suppliers", ["view", "create", "edit", "print", "export"]);
  grant(manager, "sales", ["view", "create", "edit", "print", "export", "refund", "discount", "credit"]);
  grant(manager, "purchases", ["view", "create", "edit", "print", "export"]);
  grant(manager, "stock", ["view", "edit", "export"]);
  grant(manager, "expenses", ["view", "create", "edit", "export"]);
  grant(manager, "reports", ["view", "print", "export"]);
  roles.MANAGER = { label: "Manager", permissions: manager };

  const cashier = blank();
  grant(cashier, "products", ["view"]);
  grant(cashier, "customers", ["view", "create"]);
  grant(cashier, "sales", ["view", "create", "print"]);
  roles.CASHIER = { label: "Cashier", permissions: cashier };

  const stockManager = blank();
  grant(stockManager, "products", ["view", "create", "edit"]);
  grant(stockManager, "suppliers", ["view", "create", "edit"]);
  grant(stockManager, "purchases", ["view", "create", "edit", "print"]);
  grant(stockManager, "stock", ["view", "edit", "print", "export"]);
  roles.STOCK_MANAGER = { label: "Stock Manager", permissions: stockManager };

  const accountant = blank();
  grant(accountant, "customers", ["view"]);
  grant(accountant, "suppliers", ["view"]);
  grant(accountant, "sales", ["view", "export"]);
  grant(accountant, "purchases", ["view", "export"]);
  grant(accountant, "expenses", ["view", "create", "edit", "export"]);
  grant(accountant, "reports", ["view", "print", "export"]);
  roles.ACCOUNTANT = { label: "Accountant", permissions: accountant };

  return roles;
}

// Run once (e.g. from browser console: import and call) to seed /roles/{ROLE_ID}
export async function seedDefaultRoles() {
  const roles = buildDefaultRoles();
  for (const [id, data] of Object.entries(roles)) {
    await setDoc(doc(db, "roles", id), data, { merge: false });
  }
  return Object.keys(roles);
}

export async function getRole(roleId) {
  const snap = await getDoc(doc(db, "roles", roleId));
  return snap.exists() ? snap.data() : null;
}

export function hasPermission(roleDoc, module, action) {
  return !!(roleDoc && roleDoc.permissions && roleDoc.permissions[module] && roleDoc.permissions[module][action]);
}
