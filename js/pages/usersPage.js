import { db, collection, getDocs, doc, updateDoc } from "../firebase-init.js";
import { createStaffUser, state, can, isSuperAdmin } from "../auth.js";
import { seedDefaultRoles } from "../roles.js";
import { logAudit } from "../audit.js";

export async function renderUsers(container) {
  const canCreate = can("users", "create");
  const canEdit = can("users", "edit");

  const [usersSnap, rolesSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "roles"))
  ]);
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const roles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  container.innerHTML = `
    <div class="page-title">Users &amp; Roles</div>

    ${isSuperAdmin() && roles.length === 0 ? `
      <div class="alert alert-warning d-flex justify-content-between align-items-center">
        No roles found in Firestore yet.
        <button class="btn btn-sm btn-warning" id="seedRolesBtn">Seed Default Roles</button>
      </div>` : ""}

    <div class="card mb-4">
      <div class="card-header">Staff</div>
      <div class="card-body">
        <table class="table table-sm align-middle">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th>${canEdit ? "<th></th>" : ""}</tr></thead>
          <tbody>
            ${users.map(u => userRow(u, roles, canEdit)).join("") || `<tr><td class="text-muted">No staff users yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    ${canCreate ? `
    <div class="card">
      <div class="card-header">Add Staff User</div>
      <div class="card-body">
        <div id="createUserError" class="alert alert-danger d-none py-2"></div>
        <form id="createUserForm" class="row g-3">
          <div class="col-md-3">
            <label class="form-label">Name</label>
            <input class="form-control" name="name" required>
          </div>
          <div class="col-md-3">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" name="email" required>
          </div>
          <div class="col-md-3">
            <label class="form-label">Temp Password</label>
            <input type="text" class="form-control" name="password" minlength="6" required>
          </div>
          <div class="col-md-3">
            <label class="form-label">Role</label>
            <select class="form-select" name="role" required>
              ${roles.map(r => `<option value="${r.id}">${r.label || r.id}</option>`).join("")}
            </select>
          </div>
          <div class="col-12">
            <button class="btn btn-primary" type="submit">Create User</button>
          </div>
        </form>
      </div>
    </div>` : ""}
  `;

  const seedBtn = document.getElementById("seedRolesBtn");
  if (seedBtn) {
    seedBtn.addEventListener("click", async () => {
      seedBtn.disabled = true;
      await seedDefaultRoles();
      renderUsers(container);
    });
  }

  const form = document.getElementById("createUserForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("createUserError");
      errBox.classList.add("d-none");
      const fd = new FormData(e.target);
      try {
        await createStaffUser({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          role: fd.get("role")
        });
        await logAudit({ userId: state.user.uid, action: "CREATE", module: "users", newValue: { email: fd.get("email"), role: fd.get("role") } });
        renderUsers(container);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove("d-none");
      }
    });
  }

  container.querySelectorAll("[data-toggle-active]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggleActive;
      const nowActive = btn.dataset.active === "true";
      await updateDoc(doc(db, "users", id), { active: !nowActive });
      await logAudit({ userId: state.user.uid, action: "UPDATE", module: "users", record: id, newValue: { active: !nowActive } });
      renderUsers(container);
    });
  });
}

function userRow(u, roles, canEdit) {
  const roleLabel = roles.find(r => r.id === u.role)?.label || u.role;
  const active = u.active !== false;
  return `<tr>
    <td>${esc(u.name)}</td>
    <td>${esc(u.email)}</td>
    <td>${esc(roleLabel)}</td>
    <td><span class="badge ${active ? "bg-success" : "bg-secondary"}">${active ? "Active" : "Disabled"}</span></td>
    ${canEdit ? `<td class="text-end">
      <button class="btn btn-sm btn-outline-secondary" data-toggle-active="${u.id}" data-active="${active}">
        ${active ? "Disable" : "Enable"}
      </button>
    </td>` : ""}
  </tr>`;
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
