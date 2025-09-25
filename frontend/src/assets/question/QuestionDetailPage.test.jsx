import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QuestionDetailPage from './QuestionDetailPage';

beforeAll(() => {
    window.scrollTo = vi.fn();
});

vi.mock('../../firebase', () => {
    let _currentUser = null;
    const auth = {
        get currentUser() { return _currentUser; },
        set currentUser(u) { _currentUser = u; },
    };
    return { __esModule: true, auth, db: {} };
});

vi.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ __esModule: true, default: () => null }));
vi.mock('rehype-highlight', () => ({ __esModule: true, default: () => null }));

vi.mock('firebase/firestore', () => {
    const makeDocRef = (path) => ({ __type: 'doc', path });
    const makeColRef = (path) => ({ __type: 'collection', path });
    const makeQueryRef = (colRef) => ({ __type: 'query', path: colRef.path });
    const onSnapshot = vi.fn();
    const runTransaction = vi.fn().mockResolvedValue(undefined);
    const addDoc = vi.fn().mockResolvedValue({});
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const deleteDoc = vi.fn().mockResolvedValue(undefined);
    const getDocs = vi.fn().mockResolvedValue({ docs: [] });
    const serverTimestamp = vi.fn(() => new Date());
    const doc = vi.fn((dbOrRef, ...parts) => {
        if (typeof dbOrRef === 'string') return makeDocRef([dbOrRef, ...parts].join('/'));
        const base = dbOrRef?.path ?? '';
        const rest = parts.join('/');
        return makeDocRef([base, rest].filter(Boolean).join('/'));
    });
    const collection = vi.fn((dbOrRef, ...parts) => {
        if (typeof dbOrRef === 'string') return makeColRef([dbOrRef, ...parts].join('/'));
        const base = dbOrRef?.path ?? '';
        const rest = parts.join('/');
        return makeColRef([base, rest].filter(Boolean).join('/'));
    });
    const query = vi.fn((colRef) => makeQueryRef(colRef));
    const orderBy = vi.fn(() => ({}));
    const increment = (n) => ({ __type: 'increment', by: n });
    return {
        __esModule: true,
        doc, collection, query, orderBy,
        onSnapshot, runTransaction, addDoc, updateDoc, deleteDoc,
        increment, serverTimestamp, getDocs,
    };
});


import {
    onSnapshot, runTransaction, addDoc, updateDoc,
} from 'firebase/firestore';
import { auth } from '../../firebase';

if (!global.scrollTo) {
    global.scrollTo = () => { };
}

const makeUser = (claims = {}) => ({
    uid: 'user123',
    displayName: 'Imaan',
    email: 'user@example.com',
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.currentUser = null;
});

function renderWithRoute(path = '/questions/123') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/questions/:id" element={<QuestionDetailPage />} />
            </Routes>
        </MemoryRouter>
    );
}


describe('QuestionDetailPage', () => {
    beforeEach(() => {
        onSnapshot.mockImplementation(() => () => { });
    });

    it('shows loading state initially', () => {
        renderWithRoute();
        expect(screen.getByText(/loading…/i)).toBeInTheDocument();
    });

    it('renders "Question not found" if no docData', async () => {
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') cb({ exists: () => false });
            else cb({ docs: [] });
            return () => { };
        });
        renderWithRoute();
        await waitFor(() => expect(screen.getByText(/question not found/i)).toBeInTheDocument());
    });

    it('renders question with title, description, tags, author, meta', async () => {
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'How to do X?',
                        description: 'Use **markdown** please.',
                        authorDisplay: 'Imaan',
                        tags: ['react', 'firebase'],
                        views: 10,
                        votes: 3,
                        status: 'open',
                        visibility: 'public',
                        createdAt: { toDate: () => new Date('2023-01-01T00:00:00Z') },
                        voters: {},
                        seed: 1,
                    }),
                });
            } else {
                cb({ docs: [] });
            }
            return () => { };
        });
        renderWithRoute();
        await waitFor(() => expect(screen.getByText(/how to do x\?/i)).toBeInTheDocument());
        expect(screen.getByTestId('markdown')).toHaveTextContent(/use \*\*markdown\*\* please\./i);
        expect(screen.getByText(/react/i)).toBeInTheDocument();
        expect(screen.getByText(/firebase/i)).toBeInTheDocument();
        expect(screen.getByText(/asked by/i)).toHaveTextContent(/imaan/i);
        expect(screen.getByText(/views/i)).toHaveTextContent(/10/);
        expect(screen.getByText(/votes/i)).toHaveTextContent(/3/);
        expect(screen.getByText(/open/i)).toBeInTheDocument();
        expect(screen.getByText(/public/i)).toBeInTheDocument();
    });

    it('upvotes the question (transaction called)', async () => {
        auth.currentUser = makeUser({});
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Vote Q',
                        description: 'desc',
                        voters: {},
                        seed: 0,
                        votes: 0,
                    }),
                });
            } else {
                cb({ docs: [] });
            }
            return () => { };
        });
        runTransaction.mockResolvedValue();
        renderWithRoute();
        const btn = await screen.findByRole('button', { name: /upvote question/i });
        fireEvent.click(btn);
        await waitFor(() => expect(runTransaction).toHaveBeenCalled());
    });

    it('shows admin baseline controls for the QUESTION and applies seed', async () => {
        auth.currentUser = makeUser({ admin: true });
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Admin Q',
                        description: 'desc',
                        voters: { a: true, b: true },
                        seed: 3,
                        votes: 5,
                    }),
                });
            } else {
                cb({ docs: [] });
            }
            return () => { };
        });
        runTransaction.mockResolvedValue();
        renderWithRoute();
        await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument());
        const seedInput = screen.getByRole('spinbutton');
        fireEvent.change(seedInput, { target: { value: '10' } });
        const setBtn = screen.getByRole('button', { name: /^set baseline$/i });
        fireEvent.click(setBtn);
        await waitFor(() => expect(runTransaction).toHaveBeenCalled());
    });

    it('renders answers section (empty) when no answers', async () => {
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Answers Test',
                        description: 'd',
                        voters: {},
                        seed: 0,
                        votes: 0,
                    }),
                });
            } else {
                cb({ docs: [] });
            }
            return () => { };
        });

        renderWithRoute();
        await waitFor(() => expect(screen.getByText(/no answers yet/i)).toBeInTheDocument());
    });

    it('posts an answer (calls addDoc and updateDoc)', async () => {
        auth.currentUser = makeUser({});
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Post Answer',
                        description: 'd',
                        voters: {},
                        seed: 0,
                        votes: 0,
                    }),
                });
            } else {
                cb({ docs: [] });
            }
            return () => { };
        });
        addDoc.mockResolvedValue({});
        updateDoc.mockResolvedValue();
        renderWithRoute();
        const ta = await screen.findByPlaceholderText(/write your answer here/i);
        fireEvent.change(ta, { target: { value: 'This is my answer' } });
        const postBtn =
            screen.queryByRole('button', { name: /post answer/i }) ||
            screen.getByRole('button', { name: /post/i });
        fireEvent.click(postBtn);
        await waitFor(() => expect(addDoc).toHaveBeenCalled());
        await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    });

    it('upvotes an answer (transaction called)', async () => {
        auth.currentUser = makeUser({});
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Answers Voting',
                        description: 'd',
                        voters: {},
                        seed: 0,
                        votes: 0,
                    }),
                });
            } else {
                cb({
                    docs: [
                        {
                            id: 'a1',
                            data: () => ({
                                content: 'First answer',
                                authorDisplay: 'Anon',
                                voters: {}, 
                                seed: 2,
                                votes: 2,
                                createdAt: new Date('2024-01-01T00:00:00Z'),
                                isAccepted: false,
                            }),
                        },
                    ],
                });
            }
            return () => { };
        });
        runTransaction.mockResolvedValue();
        renderWithRoute();
        await waitFor(() => screen.getByText(/first answer/i));
        const btn = screen.getByRole('button', { name: /upvote answer by anon/i });
        fireEvent.click(btn);
        await waitFor(() => expect(runTransaction).toHaveBeenCalled());
    });

    it('shows admin per-answer seed controls and applies seed', async () => {
        auth.currentUser = makeUser({ admin: true });
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Admin Answers',
                        description: 'd',
                        voters: {},
                        seed: 0,
                        votes: 0,
                    }),
                });
            } else {
                cb({
                    docs: [
                        {
                            id: 'a1',
                            data: () => ({
                                content: 'Seed me',
                                authorDisplay: 'Anon',
                                voters: { x: true }, 
                                seed: 1,
                                votes: 2,
                                isAccepted: false,
                            }),
                        },
                    ],
                });
            }
            return () => { };
        });
        runTransaction.mockResolvedValue();
        renderWithRoute();
        await waitFor(() => screen.getByText(/seed me/i));
        const spinboxes = screen.getAllByRole('spinbutton');
        const answerSeedInput = spinboxes[spinboxes.length - 1];
        fireEvent.change(answerSeedInput, { target: { value: '5' } });
        const setButtons = screen.getAllByRole('button', { name: /set baseline/i });
        const lastSet = setButtons[setButtons.length - 1];
        fireEvent.click(lastSet);
        await waitFor(() => expect(runTransaction).toHaveBeenCalled());
    });

    it('orders accepted answer first (when present)', async () => {
        onSnapshot.mockImplementation((ref, cb) => {
            if (ref.__type === 'doc') {
                cb({
                    exists: () => true,
                    id: '123',
                    data: () => ({
                        title: 'Has Accepted',
                        description: 'd',
                        voters: {},
                        seed: 0,
                        votes: 0,
                    }),
                });
            } else {
                cb({
                    docs: [
                        {
                            id: 'a2',
                            data: () => ({
                                content: 'Later but accepted',
                                authorDisplay: 'UserB',
                                voters: {},
                                seed: 1,
                                votes: 3,
                                isAccepted: true,
                            }),
                        },
                        {
                            id: 'a1',
                            data: () => ({
                                content: 'Earlier but more votes',
                                authorDisplay: 'UserA',
                                voters: {},
                                seed: 2,
                                votes: 5,
                                isAccepted: false,
                            }),
                        },
                    ],
                });
            }
            return () => { };
        });
        renderWithRoute();
        const items = await screen.findAllByRole('listitem');
        expect(items[0]).toHaveTextContent(/accepted/i);
        expect(items[0]).toHaveTextContent(/later but accepted/i);
    });
});
