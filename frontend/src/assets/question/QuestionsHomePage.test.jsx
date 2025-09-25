import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('./QuestionCard', () => ({
    default: (props) => (
        <div data-testid="question-card">{props.data?.title ?? 'Untitled'}</div>
    ),
}));

const onSnapshotMock = vi.fn();
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: onSnapshotMock,
}));

const makeSnapshot = (docsArray) => ({
    docs: docsArray.map((doc, i) => ({
        id: doc.id ?? String(i),
        data: () => doc,
    })),
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

beforeAll(() => {
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
});

describe('Questions (home preview)', () => {
    it('shows loading initially', async () => {
        onSnapshotMock.mockImplementation(() => () => { });
        const { default: Questions } = await import('./QuestionsHomePage');
        render(
            <MemoryRouter>
                <Questions />
            </MemoryRouter>
        );
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('renders questions from snapshot', async () => {
        onSnapshotMock.mockImplementation((_q, onNext) => {
            onNext(
                makeSnapshot([
                    {
                        id: 'q1',
                        title: 'First Question',
                        description: 'desc one',
                        visibility: 'public',
                        votes: 5,
                        answersCount: 2,
                        authorDisplay: 'Bob',
                    },
                ])
            );
            return () => { };
        });
        const { default: Questions } = await import('./QuestionsHomePage');
        render(
            <MemoryRouter>
                <Questions />
            </MemoryRouter>
        );
        await screen.findByTestId('question-card');
        expect(screen.getByText(/first question/i)).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /see all questions/i })
        ).toBeInTheDocument();
    });
    it('renders empty state if snapshot fails', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        onSnapshotMock.mockImplementation((_q, _onNext, onError) => {
            onError(new Error('boom'));
            return () => { };
        });
        const { default: Questions } = await import('./QuestionsHomePage');
        render(
            <MemoryRouter>
                <Questions />
            </MemoryRouter>
        );
        expect(
            await screen.findByText(/no published questions yet/i)
        ).toBeInTheDocument();
        errSpy.mockRestore();
    });

    it('renders empty state if no questions', async () => {
        onSnapshotMock.mockImplementation((_q, onNext) => {
            onNext(makeSnapshot([]));
            return () => { };
        });
        const { default: Questions } = await import('./QuestionsHomePage');
        render(
            <MemoryRouter>
                <Questions />
            </MemoryRouter>
        );
        expect(
            await screen.findByText(/no published questions yet/i)
        ).toBeInTheDocument();
        expect(screen.queryAllByTestId('question-card').length).toBe(0);
    });
});
