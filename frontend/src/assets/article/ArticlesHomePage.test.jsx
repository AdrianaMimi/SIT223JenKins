import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('./ArticleCard', () => ({
  default: (props) => (
    <div data-testid="article-card">{props.data?.title ?? 'Untitled'}</div>
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
  Object.defineProperty(window, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  });
});

describe('ArticlesHomePage', () => {
  it('shows loading initially', async () => {
    onSnapshotMock.mockImplementation(() => () => { });

    const { default: ArticlesHomePage } = await import('./ArticlesHomePage');
    render(
      <MemoryRouter>
        <ArticlesHomePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/loading top articles/i)).toBeInTheDocument();
  });

  it('renders articles from snapshot', async () => {
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext(
        makeSnapshot([
          {
            id: 'a1',
            title: 'Rated article',
            description: 'desc one',
            visibility: 'public',
            rating: 5,
            ratingCount: 10,
            authorDisplay: 'Alice',
            display: { croppedURL: 'http://img/1.jpg' },
          },
        ])
      );
      return () => { };
    });

    const { default: ArticlesHomePage } = await import('./ArticlesHomePage');
    render(
      <MemoryRouter>
        <ArticlesHomePage />
      </MemoryRouter>
    );

    await screen.findByTestId('article-card');
    expect(screen.getByText(/rated article/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /see all articles/i })
    ).toBeInTheDocument();
  });

  it('renders error state if snapshot fails', async () => {
    onSnapshotMock.mockImplementation((_q, _onNext, onError) => {
      onError({ message: 'boom' });
      return () => { };
    });

    const { default: ArticlesHomePage } = await import('./ArticlesHomePage');
    render(
      <MemoryRouter>
        <ArticlesHomePage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('renders empty state if no articles', async () => {
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext(makeSnapshot([]));
      return () => { };
    });

    const { default: ArticlesHomePage } = await import('./ArticlesHomePage');
    render(
      <MemoryRouter>
        <ArticlesHomePage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/no published articles yet/i)
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId('article-card').length).toBe(0);
    expect(screen.getByRole('link', { name: /here/i })).toHaveAttribute(
      'href',
      '/post'
    );
  });
});
