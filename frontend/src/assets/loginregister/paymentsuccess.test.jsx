import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: vi.fn(), useLocation: vi.fn() };
});
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));
vi.mock('../../firebase', () => ({ auth: {} }));

import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import PaymentSuccess from './paymentsuccess';

describe('PaymentSuccess', () => {
    let originalEnv;
    let originalFetch;

    beforeEach(() => {
        vi.clearAllMocks();
        originalEnv = { ...import.meta.env };
        import.meta.env.VITE_FN_ACTIVATE = 'https://api.example.com/activate/';
        originalFetch = global.fetch;
        global.fetch = vi.fn();
        vi.mocked(useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useLocation).mockReturnValue({ search: '?session_id=sess_123' });
    });

    afterEach(() => {
        import.meta.env = originalEnv;
        global.fetch = originalFetch;
    });

    it('shows error when session_id missing', async () => {
        vi.mocked(useLocation).mockReturnValue({ search: '' });
        render(<PaymentSuccess />);
        expect(await screen.findByText(/missing session_id in url/i)).toBeInTheDocument();
        expect(onAuthStateChanged).not.toHaveBeenCalled();
    });

    it('shows error when user is not signed in', async () => {
        vi.mocked(useLocation).mockReturnValue({ search: '?session_id=sess_x' });
        vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
            cb(null);
            return () => { };
        });

        render(<PaymentSuccess />);

        expect(await screen.findByText(/please sign in again/i)).toBeInTheDocument();
    });

    it('activates successfully, shows success message, then redirects to /plans', async () => {
        const mockNav = vi.fn();
        vi.mocked(useNavigate).mockReturnValue(mockNav);
        const mockUser = { getIdToken: vi.fn().mockResolvedValue('TOKEN') };
        vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
            cb(mockUser);
            return () => { };
        });
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}),
        });
        render(<PaymentSuccess />);
        expect(await screen.findByText(/premium activated! redirecting…/i)).toBeInTheDocument();
        await new Promise((r) => setTimeout(r, 1100));
        expect(mockNav).toHaveBeenCalledWith('/plans', { replace: true });
        expect(mockUser.getIdToken).toHaveBeenCalledTimes(2);
    });

    it('shows error when server responds with !ok', async () => {
        const mockUser = { getIdToken: vi.fn().mockResolvedValue('TOKEN') };
        vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
            cb(mockUser);
            return () => { };
        });
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
        });
        render(<PaymentSuccess />);
        expect(await screen.findByText(/http 500/i)).toBeInTheDocument();
    });

    it('shows error when server returns JSON error string', async () => {
        const mockUser = { getIdToken: vi.fn().mockResolvedValue('TOKEN') };
        vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
            cb(mockUser);
            return () => { };
        });
        global.fetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: 'Bad session' }),
        });
        render(<PaymentSuccess />);
        expect(await screen.findByText(/bad session/i)).toBeInTheDocument();
    });
});
