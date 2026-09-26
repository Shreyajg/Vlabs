import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

export async function getSubjects() {
  const snapshot = await getDocs(collection(db, "subjects"));

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}
