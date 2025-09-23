import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import AllTutorialsPage from './TutorialSeachPage'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(null)
    return () => { }
  },
}))

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore')
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    doc: vi.fn(),
    deleteDoc: vi.fn(),
    getDocs: vi.fn(async () => ({ docs: [] })),
    onSnapshot: (_q, onNext) => {
      onNext({
        docs: [
          {
            id: 't1',
            data: () => ({
              title: 'First tutorial',
              description: 'desc one',
              tags: ['react'],
              createdAt: { toDate: () => new Date('2024-01-01') },
              rating: 4,
              ratingCount: 2,
              authorDisplay: 'Alice',
            }),
          },
          {
            id: 't2',
            data: () => ({
              title: 'Second tutorial',
              description: 'desc two',
              tags: ['firebase'],
              createdAt: { toDate: () => new Date('2024-02-02') },
              rating: 5,
              ratingCount: 1,
              authorDisplay: 'Bob',
            }),
          },
        ],
      })
      return () => { }
    },
  }
})

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  listAll: vi.fn(async () => ({ items: [], prefixes: [] })),
  deleteObject: vi.fn(),
}))

vi.mock('../../firebase', () => ({ auth: {}, db: {}, storage: {} }))

vi.mock('./sortablecard', () => ({
  default: ({ item, render }) => (
    <div data-testid={`sortable-${item.id}`}>
      {render({ handleApi: { ref: null, props: {} } })}
    </div>
  ),
}))
vi.mock('./TutorialCard', () => ({
  default: ({ data, onDelete }) => (
    <div>
      <h4>{data.title}</h4>
      <button onClick={onDelete}>Delete</button>
    </div>
  ),
}))

beforeEach(() => {
  localStorage.clear()
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

describe('AllTutorialsPage', () => {
  it('renders tutorials from Firestore snapshot', async () => {
    render(<AllTutorialsPage />)
    expect(await screen.findByText(/First tutorial/)).toBeInTheDocument()
    expect(await screen.findByText(/Second tutorial/)).toBeInTheDocument()
  })

  it('filters tutorials by keyword', async () => {
    render(<AllTutorialsPage />)
    expect(await screen.findByText(/First tutorial/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Search by title/i), {
      target: { value: 'second' },
    })
    await waitFor(() => {
      expect(screen.queryByText(/First tutorial/)).not.toBeInTheDocument()
      expect(screen.getByText(/Second tutorial/)).toBeInTheDocument()
    })
  })

  it('opens and confirms delete dialog', async () => {
    render(<AllTutorialsPage />)
    const deleteBtn = await screen.findAllByText('Delete')
    fireEvent.click(deleteBtn[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
