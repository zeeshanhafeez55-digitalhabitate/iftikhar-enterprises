import {
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "./firebase-init.js";

import { getRole, hasPermission } from "./roles.js";

export const state = {
  user: null,
  profile: null,
  roleDoc: null,
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
  state.ready = false;

  if (!user) {
    state.ready = true;
    notify();
    return;
  }

  console.log("Firebase Auth UID:", user.uid);
  console.log("Firebase Auth Email:", user.email);

  try {
    const userRef = doc(db, "users", user.uid);

    console.log("Reading Firestore document:");
    console.log("users/" + user.uid);

    const snap = await getDoc(userRef);

    console.log("Firestore document exists:", snap.exists());

    if (!snap.exists()) {
      throw new Error(
        "PROFILE_NOT_FOUND: Firestore document users/" +
        user.uid +
        " does not exist."
      );
    }

    state.profile = snap.data();

    console.log("User profile:", state.profile);

    if (state.profile.active === false) {
      await signOut(auth);
      state.user = null;
      state.profile = null;
      state.ready = true;
      notify();
      return;
    }

    if (!state.profile.role) {
      throw new Error("PROFILE_ROLE_MISSING");
    }

    state.roleDoc = await getRole(state.profile.role);

    if (!state.roleDoc) {
      throw new Error(
        "ROLE_NOT_FOUND: roles/" + state.profile.role
      );
    }

    state.ready = true;
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

    notify();

    const loginError = document.getElementById("loginError");

    if (loginError) {
      loginError.textContent =
        "Firebase error: " +
        (error.code || error.message);

      loginError.classList.remove("d-none");
    }
  }
});

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  console.log("LOGIN SUCCESS");
  console.log("UID:", cred.user.uid);
  console.log("Email:", cred.user.email);

  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export async function createStaffUser({
  email,
  password,
  name,
  role,
  phone
}) {
  const cred = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  await setDoc(doc(db, "users", cred.user.uid), {
    name,
    email,
    role,
    phone: phone || "",
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
