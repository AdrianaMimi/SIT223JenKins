import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

let mockAuthState = {
  user: null,
  loading: false,
  authBusy: false,
  logout: vi.fn().mockResolvedValue(),
};

vi.mock('./assets/loginregister/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));


vi.mock('./NavbarSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="nav-search">Search</div>,
}));


const originalLocation = window.location;
beforeAll(() => {
  delete window.location;
  window.location = { ...originalLocation, replace: vi.fn() };
});
afterAll(() => {
  window.location = originalLocation;
});

afterEach(() => {
  vi.clearAllMocks();
  mockAuthState = { user: null, loading: false, authBusy: false, logout: vi.fn().mockResolvedValue() };
});


const renderWithRoute = (ui, route = '/') =>
  render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);

describe('Navbar', () => {
  it('renders logo and search', () => {
    renderWithRoute(<Navbar />, '/');
    expect(screen.getByText(/DEV/i)).toBeInTheDocument(); 
    expect(screen.getByTestId('nav-search')).toBeInTheDocument();
  });

  it('shows Login when user is not authenticated and not on auth routes', () => {
    mockAuthState.user = null;
    renderWithRoute(<Navbar />, '/');
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /post/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
  });

  it('hides auth controls on /login route (isAuthRoute)', () => {
    mockAuthState.user = null;
    renderWithRoute(<Navbar />, '/login');
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /post/i })).not.toBeInTheDocument();
  });

  it('shows Post, Username, and Logout when user is authenticated', () => {
    mockAuthState.user = { email: 'user@example.com', displayName: 'Imaan' };
    renderWithRoute(<Navbar />, '/');
    expect(screen.getByRole('link', { name: /post/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Imaan/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /login/i })).not.toBeInTheDocument();
  });

  it('applies "active" class to the current route tab (Home)', () => {
    renderWithRoute(<Navbar />, '/');
    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveClass('active');
  });

  it('applies "active" class to Post when on /post and authenticated', () => {
    mockAuthState.user = { email: 'user@example.com' };
    renderWithRoute(<Navbar />, '/post');
    const postLink = screen.getByRole('link', { name: /post/i });
    expect(postLink).toHaveClass('active');
  });

  it('logout calls logout() and redirects to "/"', async () => {
    mockAuthState.user = { email: 'user@example.com' };
    renderWithRoute(<Navbar />, '/');
    const btn = screen.getByRole('button', { name: /logout/i });
    await fireEvent.click(btn);
    expect(mockAuthState.logout).toHaveBeenCalledTimes(1);
    expect(window.location.replace).toHaveBeenCalledWith('/');
  });
});
