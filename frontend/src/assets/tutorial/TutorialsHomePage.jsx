import { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';
import TutorialCard from './TutorialCard'; 

const PLACEHOLDER_IMG = '/testinggg.jpg'; // fallback if no image saved

const Tutorials = () => {
  const [hovered, setHovered] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    // Top 3 by average rating; public only
    const qRef = query(
      collection(db, 'tutorials'),
      where('visibility', '==', 'public'),
      orderBy('rating', 'desc'),
      orderBy('ratingCount', 'desc'),
      limit(3)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data() || {};
          return {
            id: d.id,
            title: x.title || 'Untitled',
            description: x.description || '',
            rating: typeof x.rating === 'number' ? x.rating : 0,
            ratingCount: typeof x.ratingCount === 'number' ? x.ratingCount : 0,
            author: x.authorDisplay || 'Anonymous',
            image: x.display?.croppedURL || x.imageURL || PLACEHOLDER_IMG,
          };
        });
        setItems(rows);
        setLoading(false);
        setErr('');
      },
      (e) => {
        setErr(e?.message || 'Failed to load tutorials');
        setItems([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return (
    <div className="lobster-regular mb-5">
      <h2 className="text-center mb-4 color-deep-mint">Tutorials</h2>

      {err && <div className="alert alert-warning">{err}</div>}

      <div className="row">
        {loading && (
          <div className="col-12 text-center text-muted mb-3">
            Loading top tutorials…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="alert alert-info">
            No published tutorials yet.... Sorry.
          </div>
        )}

        {items.map((tutorial) => (
          <div className="col-md-4 mb-4" key={tutorial.id}>
            <TutorialCard data={tutorial} />
          </div>
        ))}
      </div>

      <div className="text-center">
        <Link
          to="/tutorials/all"
          className={`btn btn-custom ${hovered ? 'shadow bg-lavender bigbig-text' : 'bg-milktea text-white'
            }`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          See all tutorials
        </Link>
      </div>
    </div>
  );
};

export default Tutorials;


