import { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

export function useCatalogCache() {
  const [arts, setArts] = useState([]);
  const [tuts, setTuts] = useState([]);
  const [qs, setQs]   = useState([]);

  useEffect(() => {
    const toRow = (d) => ({ id: d.id, ...d.data() });

    const qA = query(collection(db, "articles"),  where("visibility","==","public"));
    const qT = query(collection(db, "tutorials"), where("visibility","==","public"));
    const qQ = query(collection(db, "questions"), where("visibility","==","public"));

    const ua = onSnapshot(qA, s => setArts(s.docs.map(toRow)));
    const ut = onSnapshot(qT, s => setTuts(s.docs.map(toRow)));
    const uq = onSnapshot(qQ, s => setQs(s.docs.map(toRow)));

    return () => { ua(); ut(); uq(); };
  }, []);

  // lightweight lowercase haystacks for fast substring checks
  const indexed = useMemo(() => ({
    articles: arts.map(x => ({
      ...x,
      _hay: `${x.title||""} ${x.description||""} ${x.body||""}`.toLowerCase()
    })),
    tutorials: tuts.map(x => ({
      ...x,
      _hay: `${x.title||""} ${x.description||""} ${x.body||""}`.toLowerCase()
    })),
    questions: qs.map(x => ({
      ...x,
      _hay: `${x.title||""} ${x.description||""}`.toLowerCase()
    })),
  }), [arts, tuts, qs]);

  return indexed; // { articles, tutorials, questions }
}
