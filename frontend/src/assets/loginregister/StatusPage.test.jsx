import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act } from 'react';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../../firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

import { MemoryRouter, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import StatusPage from './StatusPage';

function renderWithAuth({ user = null, claims = {}, navMock = vi.fn() } = {}) {
  vi.mocked(useNavigate).mockReturnValue(navMock);
  vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
    const run = () => {
      if (!user) {
        cb(null);
      } else {
        cb({
          ...user,
          getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
        });
      }
    };
    act(run);
    return () => {};
  });

  render(
    <MemoryRouter>
      <StatusPage />
    </MemoryRouter>
  );

  return { navMock };
}

describe('StatusPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plan cards and Upgrade button when logged out (default)', async () => {
    renderWithAuth();
    expect(await screen.findByText(/choose your plan/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^free$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^premium$/i })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /upgrade to premium/i })[0]
    ).toBeInTheDocument();
  });

  it('clicking "Upgrade to Premium" navigates to /payment', async () => {
    const { navMock } = renderWithAuth();
    await screen.findByRole('button', { name: /upgrade to premium/i }); 
    fireEvent.click(screen.getAllByRole('button', { name: /upgrade to premium/i })[0]);
    expect(navMock).toHaveBeenCalledWith('/payment');
  });

  it('clicking "Continue Free" navigates to /post', async () => {
    const { navMock } = renderWithAuth();
    await screen.findByRole('button', { name: /continue free/i });
    fireEvent.click(screen.getByRole('button', { name: /continue free/i }));
    expect(navMock).toHaveBeenCalledWith('/post');
  });

  it('signed-in non-premium user sees Upgrade button', async () => {
    renderWithAuth({ user: { uid: 'u1' }, claims: { premium: false } });
    await screen.findByText(/choose your plan/i);
    expect(
      screen.getAllByRole('button', { name: /upgrade to premium/i })[0]
    ).toBeInTheDocument();
    expect(screen.queryByText(/you.?re premium/i)).not.toBeInTheDocument();
  });

  it('premium user sees disabled "You’re Premium ✔" and a Manage Billing link', async () => {
    renderWithAuth({ user: { uid: 'u1' }, claims: { premium: true } });
    const premiumBtn = await screen.findByRole('button', { name: /you.?re premium/i });
    expect(premiumBtn).toBeDisabled();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /manage billing/i })).toHaveAttribute(
        'href',
        '/account/billing'
      )
    );
  });
});
