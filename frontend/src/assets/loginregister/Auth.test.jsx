import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

import AuthPage from './Auth';
vi.mock('./Auth.module.css', () => ({
  default: new Proxy({}, { get: () => 'mocked-class' }),
}));

vi.mock('react-transition-group', () => ({
  CSSTransition: ({ children }) => <>{children}</>,
  SwitchTransition: ({ children }) => <>{children}</>,
}));

vi.mock('./LoginForm', () => ({
  default: ({ onSuccess, onError }) => (
    <div>
      <div>LoginForm</div>
      <button onClick={() => onSuccess?.()} aria-label="login-success">
        trigger login success
      </button>
      <button onClick={() => onError?.('Login error!')} aria-label="login-error">
        trigger login error
      </button>
    </div>
  ),
}));

vi.mock('./RegisterForm', () => ({
  default: ({ onSuccess, onError }) => (
    <div>
      <div>RegisterForm</div>
      <button onClick={() => onSuccess?.()} aria-label="register-success">
        trigger register success
      </button>
      <button onClick={() => onError?.('Register error!')} aria-label="register-error">
        trigger register error
      </button>
    </div>
  ),
}));

const renderAt = (initialPath = '/login') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthPage />
    </MemoryRouter>
  );

describe('AuthPage', () => {
  let originalLocation;

  beforeAll(() => {
    originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, replace: vi.fn() };
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders LoginForm on /login', () => {
    renderAt('/login');
    expect(screen.getByText('LoginForm')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /don't have an account\? register/i })
    ).toBeInTheDocument();
  });

  it('renders RegisterForm on /register', () => {
    renderAt('/register');
    expect(screen.getByText('RegisterForm')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /already have an account\? login/i })
    ).toBeInTheDocument();
  });

  it('switch button toggles between login and register', () => {
    renderAt('/login');
    expect(screen.getByText('LoginForm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /don't have an account\? register/i }));
    expect(screen.getByText('RegisterForm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /already have an account\? login/i }));
    expect(screen.getByText('LoginForm')).toBeInTheDocument();
  });

  it('shows success toast on login success and redirects to "/" after 3000ms', () => {
    renderAt('/login');
    fireEvent.click(screen.getByLabelText('login-success'));
    expect(screen.getByRole('status')).toHaveTextContent('🎉 Success! Login successful!');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(window.location.replace).toHaveBeenCalledWith('/');
  });

  it('shows success toast on register success and redirects to "/login" after 3000ms', () => {
    renderAt('/register');
    fireEvent.click(screen.getByLabelText('register-success'));
    expect(screen.getByRole('status')).toHaveTextContent(
      '📩 Verification sent. Check inbox/spam, then log in.'
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });
});

