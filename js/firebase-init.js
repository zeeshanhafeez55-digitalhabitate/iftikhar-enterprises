import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, increment, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, increment, writeBatch, runTransaction
};
