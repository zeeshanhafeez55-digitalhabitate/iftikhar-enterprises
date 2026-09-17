import { state, onStateChange, login, logout, can } from "./auth.js";
import { db, collection, getDocs } from "./firebase-init.js";

import { renderDashboard } from "./pages/dashboardPage.js";
import { renderPOS } from "./pages/posPage.js";
import { renderSalesHistory } from "./pages/salesHistoryPage.js";
import { renderProducts } from "./pages/productsPage.js";
import { renderCustomers } from "./pages/customersPage.js";
import { renderSuppliers } from "./pages/suppliersPage.js";
import { renderPurchases } from "./pages/purchasesPage.js";
import { renderStock } from "./pages/stockPage.js";
import { renderReturns } from "./pages/returnsPage.js";
import { renderOrders } from "./pages/ordersPage.js";
import { renderExpenses } from "./pages/expensesPage.js";
import { renderReports } from "./pages/reportsPage.js";
import { renderAdmin } from "./pages/adminPage.js";
import { renderSettings } from "./pages/settingsPage.js";
import { renderUsers } from "./pages/usersPage.js";

const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const pageContent = document.getElementById("pageContent");
const userLabel = document.getElementById("userLabel");
const navMenu = document.getElementById("navMenu");
const globalSearch = document.getElementById("globalSearch");
const searchResults = document.getElementById("searchResults");

const PAGES = {
  dashboard: renderDashboard,
  pos: renderPOS,
  sales: renderSalesHistory,
  returns: renderReturns,
  orders: renderOrders,
  products: renderProducts,
  stock: renderStock,
  purchases: renderPurchases,
  customers: renderCustomers,
  suppliers: renderSuppliers,
  expenses: renderExpenses,
  reports: renderReports,
  admin: renderAdmin,
  settings: renderSettings,
  users: renderUsers
};

let currentPage = "dashboard";
let searchIndex = null;

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("d-none");
  try {
    await login(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value);
  } catch {
    loginError.textContent = "Invalid email or password.";
    loginError.classList.remove("d-none");
  }
});

document.getElementById("logoutBtn").addEventListener("click", logout);

navMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn || btn.dataset.hidden === "true") return;
  navigate(btn.dataset.page);
  if (window.innerWidth < 992) document.getElementById("sidebar").classList.add("d-none");
});

document.getElementById("menuToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("d-none");
});

export function navigate(page) {
  currentPage = page;
  [...navMenu.children].forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const render = PAGES[page];
  if (render) render(pageContent);
}

function applyMenuPermissions() {
  [...navMenu.children].forEach(btn => {
    const perm = btn.dataset.perm;
    if (!perm) return;
    const [module, action] = perm.split(":");
    btn.dataset.hidden = (can(module, action) || state.profile?.role === "SUPER_ADMIN") ? "false" : "true";
  });
}

// ---------- global search ----------

async function buildSearchIndex() {
  const cols = [
    ["products", p => ({ label: p.name, sub: `${p.sku || ""} ${p.barcode || ""}`.trim(), page: "products" })],
    ["customers", c => ({ label: c.name, sub: c.phone || "", page: "customers" })],
    ["suppliers", s => ({ label: s.name, sub: s.phone || "", page: "suppliers" })],
    ["sales", s => ({ label: s.invoiceNo, sub: s.customerName || "", page: "sales" })],
    ["purchases", p => ({ label: p.purchaseNo, sub: p.supplierName || "", page: "purchases" })],
    ["customOrders", o => ({ label: o.productDescription || "Custom order", sub: o.customerName || "", page: "orders" })]
  ];

  const index = [];
  for (const [col, mapper] of cols) {
    try {
      const snap = await getDocs(collection(db, col));
      snap.docs.forEach(d => {
        const entry = mapper({ id: d.id, ...d.data() });
        index.push({ ...entry, type: col, key: `${entry.label} ${entry.sub}`.toLowerCase() });
      });
    } catch { /* no read permission for this collection — skip it */ }
  }
  return index;
}

globalSearch?.addEventListener("focus", async () => {
  if (!searchIndex) searchIndex = await buildSearchIndex();
});

globalSearch?.addEventListener("input", () => {
  const t = globalSearch.value.trim().toLowerCase();
  if (!t || !searchIndex) { searchResults.classList.add("d-none"); return; }

  const hits = searchIndex.filter(x => x.key.includes(t)).slice(0, 12);
  searchResults.innerHTML = hits.length
    ? hits.map(h => `<button class="list-group-item list-group-item-action py-1" data-goto="${h.page}">
        <span class="small fw-semibold">${escHtml(h.label)}</span>
        <span class="small text-muted ms-2">${escHtml(h.sub)}</span>
        <span class="badge bg-light text-dark float-end">${h.type}</span>
      </button>`).join("")
    : `<div class="list-group-item small text-muted">No matches.</div>`;

  searchResults.classList.remove("d-none");
  searchResults.querySelectorAll("[data-goto]").forEach(b =>
    b.addEventListener("click", () => {
      searchResults.classList.add("d-none");
      globalSearch.value = "";
      navigate(b.dataset.goto);
    })
  );
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#globalSearchWrap")) searchResults?.classList.add("d-none");
});

// ---------- session ----------

onStateChange(({ user, profile, ready }) => {
  if (!ready) return;

  if (user && profile) {
    loginScreen.classList.add("d-none");
    appShell.classList.remove("d-none");
    userLabel.textContent = `${profile.name} (${profile.role})`;
    applyMenuPermissions();
    searchIndex = null;
    navigate(currentPage);
  } else {
    appShell.classList.add("d-none");
    loginScreen.classList.remove("d-none");
    loginForm.reset();
  }
});

function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
