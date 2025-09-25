import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

vi.mock('./questions.module.css', () => ({
  default: {
    modalOverlay: 'modalOverlay',
    modalCard: 'modalCard',
    modalHeader: 'modalHeader',
    modalTitle: 'modalTitle',
    closeBtn: 'closeBtn',
    modalBody: 'modalBody',
    deleteBtn: 'deleteBtn',
    dismissBtn: 'dismissBtn',
    dragHandle: 'dragHandle',
    toastMessage: 'toastMessage',
    toastSuccess: 'toastSuccess',
    toastError: 'toastError',
    show: 'show',
  },
}));

vi.mock('react-markdown', () => ({
  default: ({ children }) => <div data-testid="md">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: () => null }), { virtual: true });
vi.mock('rehype-highlight', () => ({ default: () => null }), { virtual: true });
vi.mock('highlight.js/styles/github.css', () => ({}), { virtual: true });

import QuestionsCard from './QuestionCard';

function renderWithRoute(ui, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

const baseData = {
  id: 'q 42',
  title: 'Why is my code slow?',
  description:
    'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo',
  authorDisplay: 'Imaan',
  tags: ['react', 'js', 'firebase', 'css', 'testing', 'extra'],
  views: 10,
  votes: 3,
  answersCount: 2,
  timeAgo: '1h',
};

describe('QuestionsCard', () => {
  afterEach(() => cleanup());

  it('renders title and meta; click opens modal with excerpt & link', async () => {
    renderWithRoute(<QuestionsCard data={baseData} />, '/questions');
    const card = screen.getByText(/why is my code slow\?/i).closest('.card');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText(/Imaan/i)).toBeInTheDocument();
    expect(within(card).getByText(/10\s*views/i)).toBeInTheDocument();
    expect(within(card).getByText('3')).toBeInTheDocument();
    expect(within(card).getByText('2')).toBeInTheDocument();
    fireEvent.click(card);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('md')).toHaveTextContent(/ …$/);
    const link = screen.getByRole('link', { name: /view & answer/i });
    expect(link).toHaveAttribute('href', '/questions/q%2042');
  });

  it('shows Hide button when on non-search routes and calls onDismiss(id)', () => {
    const onDismiss = vi.fn();
    renderWithRoute(<QuestionsCard data={baseData} onDismiss={onDismiss} />, '/questions');
    const card = screen.getByText(/why is my code slow\?/i).closest('.card');
    const hideBtn = within(card).getByRole('button', { name: /hide/i });
    fireEvent.click(hideBtn);
    expect(onDismiss).toHaveBeenCalledWith('q 42');
  });

  it('does NOT show Hide on /search', () => {
    const onDismiss = vi.fn();
    renderWithRoute(<QuestionsCard data={baseData} onDismiss={onDismiss} />, '/search');
    const card = screen.getByText(/why is my code slow\?/i).closest('.card');
    expect(within(card).queryByRole('button', { name: /hide/i })).not.toBeInTheDocument();
  });

  it('admin sees Delete on /questions/all and /search', () => {
    const onDelete = vi.fn();
    renderWithRoute(<QuestionsCard data={baseData} isAdmin onDelete={onDelete} />, '/questions/all');
    let card = screen.getByText(/why is my code slow\?/i).closest('.card');
    expect(within(card).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    cleanup();
    renderWithRoute(<QuestionsCard data={baseData} isAdmin onDelete={onDelete} />, '/search');
    card = screen.getByText(/why is my code slow\?/i).closest('.card');
    expect(within(card).getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('Delete opens confirm; confirming calls onDelete(id) and shows toast', async () => {
    const onDelete = vi.fn().mockResolvedValue();
    renderWithRoute(<QuestionsCard data={baseData} isAdmin onDelete={onDelete} />, '/questions/all');
    const card = screen.getByText(/why is my code slow\?/i).closest('.card');
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/delete question\?/i)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('q 42'));
    await waitFor(() => {
      expect(screen.getByText(/deleted question\./i)).toBeInTheDocument();
    });
  });

  it('shows drag handle when drag props provided (uses aria-label from props)', () => {
    const dragHandleRef = createRef();
    const dragHandleProps = { 'aria-label': 'Drag to reorder', onKeyDown: vi.fn() };
    renderWithRoute(
      <QuestionsCard
        data={baseData}
        dragHandleRef={dragHandleRef}
        dragHandleProps={dragHandleProps}
      />,
      '/questions/all'
    );
    const card = screen.getByText(/why is my code slow\?/i).closest('.card');
    expect(within(card).getByRole('button', { name: /drag to reorder/i })).toBeInTheDocument();
  });

  it('renders up to 5 tag pills and "+N more" for the rest', () => {
    renderWithRoute(<QuestionsCard data={baseData} />, '/questions');
    fireEvent.click(screen.getByText(/why is my code slow\?/i)); 
    const dlg = screen.getByRole('dialog');
    ['react', 'js', 'firebase', 'css', 'testing'].forEach((t) => {
      expect(within(dlg).getByText(new RegExp(`^${t}$`, 'i'))).toBeInTheDocument();
    });
    expect(within(dlg).getByText(/\+1 more/i)).toBeInTheDocument();
  });

  it('shows "Anonymous" when no author provided', () => {
    const { authorDisplay, author, ...rest } = baseData;
    renderWithRoute(<QuestionsCard data={rest} />, '/questions');
    const card = screen.getByText(/why is my code slow\?/i).closest('.card');
    expect(within(card).getByText(/anonymous/i)).toBeInTheDocument();
  });
});

