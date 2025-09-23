import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TutorialDetailPage from './TutorialDetailPage';

vi.mock('../../firebase', () => ({ db: {} }));

vi.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('rehype-highlight', () => ({
  __esModule: true,
  default: () => null,
}));

let mockUser = { uid: 'user123', getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) };
vi.mock('../loginregister/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const makeDocRef = (path) => ({ __type: 'doc', path });
const makeColRef = (path) => ({ __type: 'collection', path });
const makeQueryRef = (colRef) => ({ __type: 'query', path: colRef.path });

vi.mock('firebase/firestore', () => {
  return {
    __esModule: true,
    doc: vi.fn((db, ...parts) => makeDocRef(parts.join('/'))),
    collection: vi.fn((db, ...parts) => makeColRef(parts.join('/'))),
    query: vi.fn((colRef) => makeQueryRef(colRef)),
    orderBy: vi.fn(() => ({})),
    onSnapshot: vi.fn(), // will set per-test
    runTransaction: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    serverTimestamp: vi.fn(() => new Date()),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

import {
  onSnapshot,
  runTransaction,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithRoute(path = '/tutorials/123') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tutorials/:id" element={<TutorialDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TutorialDetailPage', () => {
  beforeEach(() => {
    mockUser = { uid: 'user123', getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) };
  });

  it('shows loading state initially', () => {
    onSnapshot.mockImplementation(() => () => {});
    renderWithRoute();
    expect(screen.getByText(/loading tutorial/i)).toBeInTheDocument();
  });

  it('renders "not found" if no docData', async () => {
    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({ docs: [] }); 
      } else {
        cb({ exists: () => false }); 
      }
      return () => {};
    });

    renderWithRoute();
    await waitFor(() =>
      expect(screen.getByText(/tutorial not found/i)).toBeInTheDocument()
    );
  });

  it('renders tutorial with title, description, tags, author', async () => {
    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({ docs: [] });
      } else {
        cb({
          exists: () => true,
          id: '123',
          data: () => ({
            title: 'My Tutorial',
            description: 'Great tutorial',
            authorDisplay: 'Imaan',
            tags: ['react', 'firebase'],
            rating: 4.2,
            ratingCount: 7,
            createdAt: { toDate: () => new Date('2023-01-01') },
          }),
        });
      }
      return () => {};
    });

    renderWithRoute();

    await waitFor(() => expect(screen.getByText(/my tutorial/i)).toBeInTheDocument());
    expect(screen.getByText(/great tutorial/i)).toBeInTheDocument();
    expect(screen.getByText(/imaan/i)).toBeInTheDocument();
    expect(screen.getByText(/react/i)).toBeInTheDocument();
    expect(screen.getByText(/firebase/i)).toBeInTheDocument();
  });

  it('shows rating stars and lets user rate', async () => {
    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({ docs: [] });
      } else {
        cb({
          exists: () => true,
          id: '123',
          data: () => ({
            title: 'Rating Test',
            rating: 3,
            ratingCount: 1,
          }),
        });
      }
      return () => {};
    });
    runTransaction.mockResolvedValue();

    renderWithRoute();

    const group = await screen.findByRole('group', { name: /rate this article/i });
    // click the 5th star (icons are <i> tags inside the group)
    const stars = group.querySelectorAll('i');
    expect(stars.length).toBeGreaterThanOrEqual(5);
    fireEvent.click(stars[4]);

    await waitFor(() => expect(runTransaction).toHaveBeenCalled());
  });

  it('shows admin rating controls when admin', async () => {
    mockUser.getIdTokenResult = vi.fn().mockResolvedValue({ claims: { admin: true } });

    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({ docs: [] });
      } else {
        cb({
          exists: () => true,
          id: '123',
          data: () => ({
            title: 'Admin Test',
            ratingSeedSum: 20,
            ratingSeedCount: 5,
            ratingUserSum: 0,
            ratingUserCount: 0,
            rating: 4,
          }),
        });
      }
      return () => {};
    });

    runTransaction.mockResolvedValue();

    renderWithRoute();

    await waitFor(() =>
      expect(screen.getByText(/admin: ratings controls/i)).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 4\.6/i), {
      target: { value: '4.8' },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), {
      target: { value: '10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /apply seed/i }));
    await waitFor(() => expect(runTransaction).toHaveBeenCalled());
  });

  it('renders comments section (empty)', async () => {
    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({ docs: [] });
      } else {
        cb({
          exists: () => true,
          id: '123',
          data: () => ({ title: 'Comments Test' }),
        });
      }
      return () => {};
    });

    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/no comments yet/i)).toBeInTheDocument());
  });

  it('lets user add a comment', async () => {
    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({ docs: [] });
      } else {
        cb({
          exists: () => true,
          id: '123',
          data: () => ({ title: 'Add Comment Test' }),
        });
      }
      return () => {};
    });
    addDoc.mockResolvedValue({});

    renderWithRoute();
    const input = await screen.findByPlaceholderText(/write a comment/i);
    fireEvent.change(input, { target: { value: 'Nice tutorial!' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() => expect(addDoc).toHaveBeenCalled());
  });

  it('shows admin comment controls and allows delete', async () => {
    mockUser.getIdTokenResult = vi.fn().mockResolvedValue({ claims: { admin: true } });

    onSnapshot.mockImplementation((ref, cb) => {
      if (ref.__type === 'query') {
        cb({
          docs: [
            {
              id: 'c1',
              data: () => ({
                authorDisplay: 'Anon',
                text: 'Test comment',
                seed: 2,
                upvotes: 2,
                voters: {},
              }),
            },
          ],
        });
      } else {
        cb({
          exists: () => true,
          id: '123',
          data: () => ({ title: 'Admin Comments Test' }),
        });
      }
      return () => {};
    });

    deleteDoc.mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/test comment/i)).toBeInTheDocument());
    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(deleteDoc).toHaveBeenCalled());
  });
});
