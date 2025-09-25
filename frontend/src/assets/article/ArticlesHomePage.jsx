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
import ArticleCard from './ArticleCard';

const PLACEHOLDER_IMG = '/testinggg.jpg'; // fallback if no image saved

const ArticlesHomePage = () => {
  const [hovered, setHovered] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    // Top 3 by average rating; public only
    // NOTE: If Firestore asks for an index, create the composite 
    const q = query(
      collection(db, 'articles'),
      where('visibility', '==', 'public'),
      orderBy('rating', 'desc'),       // average = ratingSum / ratingCount (stored on doc)
      orderBy('ratingCount', 'desc'),  // tie-breaker so well-rated & popular wins
      limit(3)
    );

    const unsub = onSnapshot(
      q,
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
            image:
              x.display?.croppedURL ||
              x.imageURL ||
              PLACEHOLDER_IMG,
          };
        });
        setItems(rows);
        setLoading(false);
      },
      (e) => {
        setErr(e?.message || 'Failed to load articles');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return (
    <div className="lobster-regular mb-5">
      <h2 className="text-center mb-4 bigbig-text">Articles</h2>

      {err && <div className="alert alert-warning">{err}</div>}

      <div className="row">
        {loading && (
          <div className="col-12 text-center text-muted mb-3">Loading top articles…</div>
        )}

        {!loading && items.length === 0 && (
          <div className="alert alert-info">No published articles yet. Click <Link style={{ textDecoration: 'none' }} to='/post'>here</Link> to post an article</div>
        )}

        {items.map((article) => (
          <div className="col-md-4 mb-4" key={article.id}>
            {/* ArticleCard can read article.ratingCount if it wants to show “(N)” */}
            <ArticleCard data={article} />
          </div>
        ))}
      </div>

      <div className="text-center">
        <Link
          to="/articles/all"
          className={`btn btn-custom ${hovered ? 'shadow bg-milktea text-white' : ' bg-lavender bigbig-text'}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          See all articles
        </Link>
      </div>
    </div>
  );
};

export default ArticlesHomePage;
