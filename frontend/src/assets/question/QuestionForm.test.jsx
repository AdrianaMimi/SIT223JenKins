import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QuestionForm from './QuestionForm';
if (!global.scrollTo) global.scrollTo = () => { };

vi.mock('../../firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
    __esModule: true,
    onAuthStateChanged: vi.fn(),
}));
vi.mock('firebase/firestore', () => {
    const makeDocRef = (path) => ({ __type: 'doc', path });
    const collection = vi.fn((db, ...parts) => ({ __type: 'collection', path: parts.join('/') }));
    const doc = vi.fn((dbOrRef, ...parts) => {
        if (typeof dbOrRef === 'string') return makeDocRef([dbOrRef, ...parts].join('/'));
        const base = dbOrRef?.path ?? '';
        const rest = parts.join('/');
        return makeDocRef([base, rest].filter(Boolean).join('/'));
    });
    const addDoc = vi.fn().mockResolvedValue({ id: 'newQ' });
    const serverTimestamp = vi.fn(() => new Date());
    const writeBatch = vi.fn().mockReturnValue({
        set: vi.fn(),
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
    });
    const increment = (n) => ({ __type: 'increment', by: n });
    return {
        __esModule: true,
        collection, addDoc, serverTimestamp, writeBatch, doc, increment,
    };
});
vi.mock('../question/PostQuestionEditor', () => ({
    default: ({ value, onChange }) => (
        <textarea aria-label="Details" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, writeBatch } from 'firebase/firestore';
const asUser = (claims = {}) => ({
    uid: 'u1',
    displayName: 'Imaan',
    email: 'imaan@example.com',
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
});
beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChanged.mockImplementation((_auth, cb) => {
        cb(null);
        return () => { };
    });
});
afterEach(() => vi.clearAllMocks());
describe('QuestionForm', () => {
    it('renders core fields and is disabled when logged out', () => {
        render(<QuestionForm />);
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/what's your question\?/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/details/i)).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText(/up to 3 comma-separated tags/i)
        ).toBeInTheDocument();
        const btn = screen.getByRole('button', { name: /save question/i });
        expect(btn).toBeDisabled();
        expect(screen.getByText(/sign in to post/i)).toBeInTheDocument();
    });

    it('enables save when logged in and validates fields', async () => {
        onAuthStateChanged.mockImplementation((_auth, cb) => {
            cb(asUser({})); 
            return () => { };
        });
        render(<QuestionForm />);
        const btn = screen.getByRole('button', { name: /save question/i });
        expect(btn).not.toBeDisabled();
        fireEvent.click(btn);
        await screen.findByText(/title must be ≥ 8 characters/i);
        await screen.findByText(/details must be ≥ 20 characters/i);
        await screen.findByText(/add at least one tag/i);
        fireEvent.change(screen.getByPlaceholderText(/what's your question\?/i), {
            target: { value: 'How do I seed votes?' },
        });
        fireEvent.change(screen.getByLabelText(/details/i), {
            target: { value: 'I want to know how to set baseline votes for a question.' },
        });
        fireEvent.change(screen.getByPlaceholderText(/up to 3 comma-separated tags/i), {
            target: { value: 'firebase, firestore' },
        });
        fireEvent.click(btn);
        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
        const [, payload] = addDoc.mock.calls[0];
        expect(payload.title).toMatch(/seed votes/i);
        expect(payload.visibility).toBe('draft');
        expect(payload.voters).toEqual({});
        expect(payload.votes).toBeGreaterThanOrEqual(0);
    });

    it('shows admin options when admin and seeds baseline + answers', async () => {
        onAuthStateChanged.mockImplementation((_auth, cb) => {
            cb(asUser({ admin: true }));
            return () => { };
        });
        render(<QuestionForm />);
        await screen.findByText(/you are an admin/i);
        fireEvent.change(screen.getByPlaceholderText(/what's your question\?/i), {
            target: { value: 'Best analytics integration approach?' },
        });
        fireEvent.change(screen.getByLabelText(/details/i), {
            target: { value: 'Considering GA4 vs GTM; want versioning and preview.' },
        });
        fireEvent.change(screen.getByPlaceholderText(/up to 3 comma-separated tags/i), {
            target: { value: 'analytics, ga4, gtm' },
        });
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. tech owl/i), {
            target: { value: 'Tech Owl' },
        });
        const adminHeader = screen.getByText(/admin options/i);
        const adminBox =
            adminHeader.parentElement?.parentElement|| adminHeader;
        const statusSelect =
            within(adminBox).getByDisplayValue('Open');
        fireEvent.change(statusSelect, { target: { value: 'open' } });
        const [viewsInput, baselineInput] = within(adminBox).getAllByRole('spinbutton');
        fireEvent.change(viewsInput, { target: { value: '10' } });
        fireEvent.change(baselineInput, { target: { value: '3' } });
        const seedTa = screen.getByPlaceholderText(/use google tag manager/i);
        fireEvent.change(seedTa, {
            target: {
                value:
                    `Use Google Tag Manager to avoid code edits later. || author=seo_guru || votes=3
If the site is tiny, pasting GA4 is fine. || author=frontend_dev || votes=1
GTM gives you versioning and preview; recommended. || author=analytics_nerd || votes=5 || accepted`,
            },
        });
        fireEvent.click(screen.getByRole('button', { name: /save question/i }));
        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
        const [, qPayload] = addDoc.mock.calls[0];
        expect(qPayload.seed).toBe(3);
        expect(qPayload.votes).toBe(3);
        expect(writeBatch).toHaveBeenCalledTimes(1);
        const batch = writeBatch.mock.results[0].value;
        expect(batch.set).toHaveBeenCalled();
        expect(batch.update).toHaveBeenCalled();
        expect(batch.commit).toHaveBeenCalledTimes(1);
    });

    it('admin Validate surfaces formatting issues', async () => {
        onAuthStateChanged.mockImplementation((_auth, cb) => {
            cb(asUser({ admin: true }));
            return () => { };
        });
        render(<QuestionForm />);
        await screen.findByText(/you are an admin/i);
        const seedTa = screen.getByPlaceholderText(/use google tag manager/i);
        fireEvent.change(seedTa, { target: { value: ' |||| ' } });
        fireEvent.click(screen.getByRole('button', { name: /validate/i }));
        await screen.findByText(/issue\(s\) found/i);
    });
});
