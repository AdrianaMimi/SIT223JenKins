import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import Footer from './Footer';

const muteConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Footer component', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the subscribe form', () => {
    render(<Footer />);
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
  });

  it('shows error when submitting empty email', async () => {
    render(<Footer />);
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));
    expect(await screen.findByText(/please fill out the subscribe field\./i)).toBeInTheDocument();
  });

  it('shows error when submitting invalid email', async () => {
    render(<Footer />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));
    expect(await screen.findByText(/please enter a valid email address\./i)).toBeInTheDocument();
  });

  it('submits valid email and shows success toast', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Email sent!' }),
      text: async () => 'Email sent!',
    });

    render(<Footer />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => expect(screen.getByText(/email sent!/i)).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/email/i)).toHaveValue('');
  });

  it('handles fetch failure (JSON message) and shows error toast', async () => {
    const spy = muteConsoleError();
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Failed to send.' }),
      text: async () => 'Failed to send.',
      status: 400,
    });

    render(<Footer />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => expect(screen.getByText(/failed to send\./i)).toBeInTheDocument());
    spy.mockRestore();
  });

  it('handles fetch failure (non-JSON) and shows status-based message', async () => {
    const spy = muteConsoleError();
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new Error('not json'); },
      text: async () => 'Nope',
      status: 503,
    });

    render(<Footer />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() =>
      expect(screen.getByText(/request failed \(503\)/i)).toBeInTheDocument()
    );
    spy.mockRestore();
  });

  it('shows network error toast on fetch rejection', async () => {
    const spy = muteConsoleError();
    fetch.mockRejectedValueOnce(new Error('kaboom'));

    render(<Footer />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => expect(screen.getByText(/kaboom/i)).toBeInTheDocument());
    spy.mockRestore();
  });

it('aborts after timeout and shows timeout message', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  let triggerAbort;
  fetch.mockImplementationOnce((_url, opts = {}) => {
    const { signal } = opts;
    return new Promise((_resolve, reject) => {
      triggerAbort = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      signal?.addEventListener?.('abort', triggerAbort, { once: true });
    });
  });

  render(<Footer />);
  fireEvent.change(screen.getByPlaceholderText(/email/i), {
    target: { value: 'test@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));
  triggerAbort();
  await waitFor(() =>
    expect(
      screen.getByText(/request timed out\. try again\./i)
    ).toBeInTheDocument()
  );
  spy.mockRestore();
});

  it('does not submit when honeypot is filled', async () => {
    const { container } = render(<Footer />);
    const honeypot = container.querySelector('input[aria-hidden="true"]');
    expect(honeypot).toBeTruthy();
    fireEvent.change(honeypot, { target: { value: 'bot-content' } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
    const fetchSpy = vi.spyOn(global, 'fetch');
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/email sent!/i)).not.toBeInTheDocument();
  });
});
