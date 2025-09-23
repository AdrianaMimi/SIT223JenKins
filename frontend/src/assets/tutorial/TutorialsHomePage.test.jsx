import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll} from 'vitest'
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('./TutorialCard', () => ({
  default: (props) => (
    <div data-testid="tutorial-card">{props.data?.title ?? 'Untitled'}</div>
  ),
}))

const onSnapshotMock = vi.fn()
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: onSnapshotMock,
}))

const makeSnapshot = (docsArray) => ({
  docs: docsArray.map((doc, i) => ({
    id: doc.id ?? String(i),
    data: () => doc,
  })),
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  });
});

describe('TutorialsHomePage', () => {
  it('shows loading initially', async () => {
    onSnapshotMock.mockImplementation(() => () => { })

    const { default: TutorialsHomePage } = await import('./TutorialsHomePage')
    render(
      <MemoryRouter>
        <TutorialsHomePage />
      </MemoryRouter>
    )

    expect(screen.getByText(/loading top tutorials/i)).toBeInTheDocument()
  })

  it('renders tutorials from snapshot', async () => {
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext(
        makeSnapshot([
          {
            id: 't1',
            title: 'Rated tutorial',
            description: 'desc one',
            visibility: 'public',
            rating: 5,
            ratingCount: 10,
            authorDisplay: 'Alice',
          },
        ])
      )
      return () => { }
    })

    const { default: TutorialsHomePage } = await import('./TutorialsHomePage')
    render(
      <MemoryRouter>
        <TutorialsHomePage />
      </MemoryRouter>
    )

    await screen.findByTestId('tutorial-card')
    expect(screen.getByText(/rated tutorial/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /see all tutorials/i })
    ).toBeInTheDocument()
  })

  it('renders error state if snapshot fails', async () => {
    onSnapshotMock.mockImplementation((_q, _onNext, onError) => {
      onError({ message: 'fail msg' })
      return () => { }
    })

    const { default: TutorialsHomePage } = await import('./TutorialsHomePage')
    render(
      <MemoryRouter>
        <TutorialsHomePage />
      </MemoryRouter>
    )

    expect(await screen.findByText(/fail msg/i)).toBeInTheDocument()
  })

  it('renders empty state if no tutorials', async () => {
    onSnapshotMock.mockImplementation((_q, onNext) => {
      onNext(makeSnapshot([]))
      return () => { }
    })

    const { default: TutorialsHomePage } = await import('./TutorialsHomePage')
    render(
      <MemoryRouter>
        <TutorialsHomePage />
      </MemoryRouter>
    )

    expect(
      await screen.findByText(/no published tutorials/i)
    ).toBeInTheDocument()
    expect(screen.queryAllByTestId('tutorial-card').length).toBe(0)
  })
})
