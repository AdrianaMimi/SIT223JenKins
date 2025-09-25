import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(), 
  };
});

import { useNavigate } from 'react-router-dom';
import PaymentCancel from './paymentcancel';

describe('PaymentCancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the cancel message and button', () => {
    vi.mocked(useNavigate).mockReturnValue(vi.fn());

    render(<PaymentCancel />);
    expect(screen.getByText(/checkout canceled/i)).toBeInTheDocument();
    expect(screen.getByText(/no charge was made/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to plans/i })).toBeInTheDocument();
  });

  it('navigates to /plans when button is clicked', () => {
    const mockNav = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(mockNav);

    render(<PaymentCancel />);
    fireEvent.click(screen.getByRole('button', { name: /back to plans/i }));

    expect(mockNav).toHaveBeenCalledWith('/plans');
  });
});
