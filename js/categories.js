import { db, collection, getDocs, doc, setDoc, addDoc } from "./firebase-init.js";

export const DEFAULT_CATEGORIES = [
  { id: "foam_mattress", name: "Foam Mattress" },
  { id: "spring_mattress", name: "Spring Mattress" },
  { id: "pillow", name: "Pillows" },
  { id: "healthcare", name: "Healthcare Products" },
  { id: "foldable_bed", name: "Foldable Beds" },
  { id: "covers_accessories", name: "Uncover / Cover / Accessories" },
  { id: "misc", name: "Miscellaneous" }
];

export async function seedDefaultCategories() {
  for (const c of DEFAULT_CATEGORIES) {
    await setDoc(doc(db, "categories", c.id), { name: c.name }, { merge: true });
  }
}

export async function listCategories() {
  const snap = await getDocs(collection(db, "categories"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listBrands() {
  const snap = await getDocs(collection(db, "brands"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addBrand(name) {
  return (await addDoc(collection(db, "brands"), { name })).id;
}
