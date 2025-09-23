import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './articles.module.css';

const STAR_YELLOW = '#f5c518';
const STAR_GREY = '#d0d0d0';

export default function ArticleCard({
  data,
  dragHandleRef,
  dragHandleProps,
  isAdmin = false,      
  onDelete = null,      
}) {
  const {
    id,
    title = '',
    description = '',
    authorDisplay,
    author,
    rating = 0,
    ratingCount = 0,
    image,
  } = data || {};

  const [hovered, setHovered] = useState(false);

  const img =
    data?.display?.croppedURL ||
    data?.imageURL ||
    image ||
    'https://via.placeholder.com/800x300?text=No+Image';

  const { pathname } = useLocation();
  const onAllArticles = /^\/articles\/all(?:\/|$)/.test(pathname);
  const onAllSearch = /^\/search(?:\/|$)/.test(pathname);

  return (
    <div
      className={`card h-100 ${hovered ? 'shadow' : 'shadow-sm'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ transition: 'box-shadow .2s', maxHeight: 510, position: 'relative', overflow: 'hidden' }}
    >
      {/* Admin-only delete button (only on /articles/all) */}
      {isAdmin && (onAllArticles || onAllSearch) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onDelete === 'function') {
              onDelete(data);
            }
          }}
          className={styles.deleteButton}
          title="Delete this article"
        >
          Delete
        </button>
      )}

      <div
        className="card-header bg-mint position-relative"
        style={{ minHeight: 56, ...(onAllArticles ? { paddingLeft: 44 } : null) }}
      >
        {/* drag handle for sorting */}
        {onAllArticles && dragHandleRef && dragHandleProps && (
          <button
            type="button"
            ref={dragHandleRef}
            {...dragHandleProps}
            className={styles.dragHandle}
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮
          </button>
        )}

        <h5 className="card-title text-center bigbig-text m-0">{title}</h5>
      </div>

      <Link to={`/articles/${encodeURIComponent(String(id))}`} className="text-decoration-none">
        <img
          src={img}
          alt={title || 'article image'}
          className="img bg-mint"
          style={{ height: 300, width: '100%', objectFit: 'cover' }}
        />
      </Link>

      <div className="card-body bg-mint">
        <p className="card-text text-center bigbig-text">{description}</p>
      </div>

      <div className="card-footer d-flex justify-content-between align-items-center smallsmall-text">
        <div className="d-flex align-items-center">
          <i
            className={`${rating > 0 ? 'fas' : 'far'} fa-star`}
            style={{ color: rating > 0 ? STAR_YELLOW : STAR_GREY, fontSize: 18, marginRight: 6 }}
            aria-hidden="true"
          />
          <span>{Number(rating || 0).toFixed(1)}</span>
          {Number(ratingCount || 0) > 0 && (
            <span className="ms-1 text-muted">({ratingCount})</span>
          )}
        </div>

        <small>{authorDisplay || author || 'Anonymous'}</small>
      </div>
    </div>
  );
}
