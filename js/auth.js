import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, doc, getDoc, setDoc, serverTimestamp
} from "./firebase-init.js";
import { getRole, hasPermission, seedDefaultRoles } from "./roles.js";

export const state = {
  user: null,       // Firebase auth user
  profile: null,    // /users/{uid} doc
  roleDoc: null,    // /roles/{roleId} doc
  ready: false,
  error: null       // Login errors like missing profile
};

const listeners = [];
export function onStateChange(cb) {
  listeners.push(cb);
  if (state.ready) cb(state);
}
function notify() {
  listeners.forEach(cb => cb(state));
}

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  state.profile = null;
  state.roleDoc = null;
  state.ready = false;

  if (!user) {
    state.ready = true;
    state.error = null;
    notify();
    return;
  }

  console.log("Firebase Auth UID:", user.uid);
  console.log("Firebase Auth Email:", user.email);

  try {
    const userRef = doc(db, "users", user.uid);
    console.log("Reading Firestore document: users/" + user.uid);

    const snap = await getDoc(userRef);
    console.log("Firestore document exists:", snap.exists());

    if (!snap.exists()) {
      await signOut(auth);
      state.user = null;
      state.profile = null;
      state.ready = true;
      state.error = "User profile not found in database (users/" + user.uid + "). Please contact an administrator.";
      notify();

      const loginError = document.getElementById("loginError");
      if (loginError) {
        loginError.textContent = state.error;
        loginError.classList.remove("d-none");
      }
      return;
    }

    state.profile = snap.data();
    console.log("User profile:", state.profile);

    if (state.profile.active === false) {
      await signOut(auth);
      state.user = null;
      state.profile = null;
      state.ready = true;
      state.error = "Account is disabled.";
      notify();
      return;
    }

    if (!state.profile.role) {
      throw new Error("PROFILE_ROLE_MISSING: User document has no 'role' field.");
    }

    state.roleDoc = await getRole(state.profile.role);

    // Auto-seed default roles if this is a SUPER_ADMIN and the role doc is missing
    if (!state.roleDoc && state.profile.role === "SUPER_ADMIN") {
      console.log("Seeding default roles into Firestore...");
      await seedDefaultRoles();
      state.roleDoc = await getRole(state.profile.role);
    }

    if (!state.roleDoc) {
      throw new Error("ROLE_NOT_FOUND: roles/" + state.profile.role + " does not exist in Firestore.");
    }

    state.ready = true;
    state.error = null;
    notify();

  } catch (error) {
    console.error("========== FIREBASE PROFILE ERROR ==========");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
    console.error("UID:", user.uid);
    console.error("Email:", user.email);
    console.error("============================================");

    state.profile = null;
    state.roleDoc = null;
    state.ready = true;
    state.error = "Firebase error: " + (error.code || error.message);
    notify();

    const loginError = document.getElementById("loginError");
    if (loginError) {
      loginError.textContent = state.error;
      loginError.classList.remove("d-none");
    }
  }
});

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  console.log("LOGIN SUCCESS");
  console.log("UID:", cred.user.uid);
  console.log("Email:", cred.user.email);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

/**
 * Creates a login (Firebase Auth) + /users profile doc for a new staff member.
 * Should only be called from UI gated by users:create permission.
 */
export async function createStaffUser({ email, password, name, role, phone }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    name, email, role, phone: phone || "",
    active: true,
    createdAt: serverTimestamp()
  });
  return cred.user.uid;
}

export function can(module, action) {
  return hasPermission(state.roleDoc, module, action);
}

export function isSuperAdmin() {
  return state.profile?.role === "SUPER_ADMIN";
}
