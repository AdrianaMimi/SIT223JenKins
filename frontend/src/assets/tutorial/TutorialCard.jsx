import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './tutorials.module.css';

const STAR_YELLOW = '#f5c518';
const STAR_GREY = '#d0d0d0';

export default function TutorialCard({
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

  // only show admin tools on /tutorials/all
  const { pathname } = useLocation();
  const onAllTutorials = /^\/tutorials\/all(?:\/|$)/.test(pathname);
  const onAllSearch = /^\/search(?:\/|$)/.test(pathname);

  return (
    <div
      className={`card h-100 ${hovered ? 'shadow' : 'shadow-sm'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      /* match ArticleCard sizing/feel */
      style={{ transition: 'box-shadow .2s', maxHeight: 510, position: 'relative', overflow: 'hidden', }}
    >
      {/* Admin delete -> delegate to page (modal + toast live there) */}
      {isAdmin && (onAllTutorials || onAllSearch) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onDelete === 'function') onDelete(data); // pass full object
          }}
          className={styles.deleteButton}
          title="Delete this tutorial"
        >
          Delete
        </button>
      )}


      <div
        className="card-header bg-milktea position-relative"
        style={{ minHeight: 56, ...(onAllTutorials ? { paddingLeft: 44 } : null) }}
      >
        {/* drag handle (only on /tutorials/all) */}
        {onAllTutorials && dragHandleRef && dragHandleProps && (
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

        <h5 className="card-title text-center color-mint m-0">{title}</h5>
      </div>

      {/* Thumb */}
      <Link to={`/tutorials/${encodeURIComponent(String(id))}`} className="text-decoration-none">
        <img
          src={img}
          alt={title || 'tutorial image'}
          className="img"
          style={{ height: 300, width: '100%', objectFit: 'cover' }}
        />
      </Link>

      {/* Description — tutorial colors */}
      <div className="card-body bg-milktea">
        <p className="card-text text-center color-mint">{description}</p>
      </div>

      {/* Footer — same layout as article card */}
      <div className="card-footer d-flex justify-content-between align-items-center smallsmall-text">
        <div className="d-flex align-items-center">
          <i
            className={`${rating > 0 ? 'fas' : 'far'} fa-star`}
            style={{ color: rating > 0 ? STAR_YELLOW : STAR_GREY, fontSize: 18, marginRight: 6 }}
            aria-hidden="true"
          />
          <span>{Number(rating || 0).toFixed(1)}</span>
          {Number(ratingCount || 0) > 0 && <span className="ms-1 text-muted">({ratingCount})</span>}
        </div>

        <small>{authorDisplay || author || 'Anonymous'}</small>
      </div>
    </div>
  );
}
