import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';

/**
 * Props:
 *  - item: the question item (must have id)
 *  - isModalOpen: boolean to disable drag while a modal is open
 *  - onDismiss: (id) => void
 *  - render: ({ handleApi, onDismiss }) => ReactNode
 */
export default function SortableCard({ item, isModalOpen, onDismiss, render }) {
  const {
    setNodeRef,
    setActivatorNodeRef, // handle ref
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isModalOpen });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    willChange: 'transform',
  };

  const handleApi = {
    ref: setActivatorNodeRef,
    props: { ...attributes, ...listeners, tabIndex: 0, role: 'button', 'aria-label': 'Drag to reorder' },
  };

  return (
    <div ref={setNodeRef} style={style}>
      {render({ handleApi, onDismiss })}
    </div>
  );
}
