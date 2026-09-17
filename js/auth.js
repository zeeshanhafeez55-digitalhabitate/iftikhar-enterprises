import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, doc, getDoc, setDoc, serverTimestamp
} from "./firebase-init.js";
import { getRole, hasPermission } from "./roles.js";

export const state = {
  user: null,       // Firebase auth user
  profile: null,    // /users/{uid} doc
  roleDoc: null,    // /roles/{roleId} doc
  ready: false
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

  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      state.profile = snap.data();
      if (state.profile.active === false) {
        await signOut(auth);
        state.user = null;
        state.profile = null;
        state.ready = true;
        notify();
        return;
      }
      state.roleDoc = await getRole(state.profile.role);
    }
  }
  state.ready = true;
  notify();
});

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
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
