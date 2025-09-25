import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('firebase/auth', () => ({
  getIdTokenResult: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useNavigate } from 'react-router-dom';
import { getIdTokenResult } from 'firebase/auth';
import { useAuth } from './AuthContext';
import ProfilePage from './profile';

describe('ProfilePage', () => {
  let originalFetch;
  let originalEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn();
    originalEnv = { ...import.meta.env };
    import.meta.env.VITE_API_BASE = 'https://api.example.com';
    vi.mocked(useNavigate).mockReturnValue(vi.fn());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    import.meta.env = originalEnv;
  });

  const makeUser = (overrides = {}) => ({
    email: 'user@example.com',
    displayName: 'Test User',
    photoURL: '',
    getIdToken: vi.fn().mockResolvedValue('CACHED_TOKEN'),
    getIdTokenResult: undefined, 
    ...overrides,
  });

  it('shows name/email and Standard badge when no user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, logout: vi.fn() });
    vi.mocked(getIdTokenResult).mockResolvedValue({ claims: {} });
    render(<ProfilePage />);
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/standard user/i)).toBeInTheDocument();
  });

  it('derives premium badge from ID token claims', async () => {
    const user = makeUser();
    vi.mocked(useAuth).mockReturnValue({ user, logout: vi.fn() });
    vi.mocked(getIdTokenResult).mockResolvedValue({ claims: { premium: true } });
    render(<ProfilePage />);
    expect(await screen.findByText(/premium user/i)).toBeInTheDocument();
  });

  it('navigates to Settings and Plans from list rows', () => {
    const user = makeUser();
    const nav = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user, logout: vi.fn() });
    vi.mocked(getIdTokenResult).mockResolvedValue({ claims: {} });
    vi.mocked(useNavigate).mockReturnValue(nav);
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(nav).toHaveBeenCalledWith('/settings');
    fireEvent.click(screen.getByRole('button', { name: /status:/i }));
    expect(nav).toHaveBeenCalledWith('/plans');
  });

  it('Refresh from Server uses a fresh ID token and calls API', async () => {
    const user = makeUser({
      getIdToken: vi
        .fn()
        .mockResolvedValueOnce('CACHED_TOKEN') 
        .mockResolvedValueOnce('FRESH_TOKEN'), 
    });
    vi.mocked(useAuth).mockReturnValue({ user, logout: vi.fn() });
    vi.mocked(getIdTokenResult).mockResolvedValue({ claims: {} });
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, me: { email: user.email } }),
    });
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('button', { name: /refresh from server/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer FRESH_TOKEN' },
        })
      );
    });
    expect(user.getIdToken).toHaveBeenCalledTimes(2);
    expect(user.getIdToken).toHaveBeenNthCalledWith(1); 
    expect(user.getIdToken).toHaveBeenNthCalledWith(2, true); 
  });

  it('logout triggers navigate to "/" with replace: true', async () => {
    const nav = vi.fn();
    const logout = vi.fn().mockResolvedValue();
    vi.mocked(useNavigate).mockReturnValue(nav);

    const user = makeUser();
    vi.mocked(useAuth).mockReturnValue({ user, logout });
    vi.mocked(getIdTokenResult).mockResolvedValue({ claims: {} });

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(nav).toHaveBeenCalledWith('/', { replace: true });
  });
});
