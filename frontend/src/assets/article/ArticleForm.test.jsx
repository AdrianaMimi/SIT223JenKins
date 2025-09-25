import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ArticleForm from './ArticleForm';
let mockUser = null;

vi.mock('../../firebase', () => ({ auth: {}, db: {}, storage: {} }));

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: (_auth, cb) => {
        cb(mockUser);
        return () => { };
    },
}));

const addDoc = vi.fn(async () => ({ id: 'doc123' }));
const updateDoc = vi.fn(async () => { });
const deleteField = vi.fn(() => null);
const collection = vi.fn();
const doc = vi.fn();
const serverTimestamp = vi.fn(() => new Date());
const writeBatch = vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => { }) }));

vi.mock('firebase/firestore', () => ({
    collection: (...args) => collection(...args),
    addDoc: (...args) => addDoc(...args),
    serverTimestamp: () => serverTimestamp(),
    updateDoc: (...args) => updateDoc(...args),
    doc: (...args) => doc(...args),
    deleteField: () => deleteField(),
    writeBatch: () => writeBatch(),
}));

const ref = vi.fn();
const getDownloadURL = vi.fn(async () => 'https://example.com/display.jpg');
const uploadBytesResumable = vi.fn(() => ({
    on: (_event, _progress, _error, done) => done(),
}));
const deleteObject = vi.fn(async () => { });

vi.mock('firebase/storage', () => ({
    ref: (...args) => ref(...args),
    uploadBytesResumable: (...args) => uploadBytesResumable(...args),
    getDownloadURL: (...args) => getDownloadURL(...args),
    deleteObject: (...args) => deleteObject(...args),
}));

vi.mock('react-konva', () => {
    const Stub = ({ children, ...props }) => <div {...props}>{children}</div>;
    return {
        Stage: Stub, Layer: Stub, Image: Stub, Rect: Stub, Circle: Stub,
        Line: Stub, Text: Stub, Group: Stub, Transformer: Stub
    };
});

vi.mock('../imageresize/imageprocessing', () => {
    const React = require('react');
    const { useEffect, useImperativeHandle } = React;
    const Comp = React.forwardRef(({ label, inputId, onFileSelected }, ref) => {
        useImperativeHandle(ref, () => ({ reset: vi.fn() }), []);
        useEffect(() => {
            const blob = new Blob(['fake'], { type: 'image/png' });
            const file = new File([blob], 'test.png', { type: 'image/png' });
            onFileSelected?.({ edited: file });
        }, [onFileSelected]);

        return (
            <div>
                {label && <label htmlFor={inputId}>{label}</label>}
                <input id={inputId} />
            </div>
        );
    });

    return { default: Comp };
});

vi.mock('../imageresize/imageresizedisplay', () => ({ default: () => null }));
vi.mock('../imageresize/imageresizebanner', () => ({ default: () => null }));

vi.mock('../question/PostQuestionEditor', () => ({
    default: ({ id = 'article-text', value, onChange }) => (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

describe('ArticleForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUser = null; 
    });

    it('renders core fields and shows disabled Save when signed out', () => {
        render(<ArticleForm />);
        expect(screen.getByLabelText(/Visibility/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Body/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Tags/i)).toBeInTheDocument();

        const saveBtn = screen.getByRole('button', { name: /Save Article/i });
        expect(saveBtn).toBeDisabled();
    });

    it('submits successfully when signed in, required fields filled, and display image provided', async () => {
        mockUser = {
            uid: 'u1',
            email: 'user@example.com',
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
            displayName: 'UserOne',
        };
        const onSuccess = vi.fn();
        const onError = vi.fn();
        render(<ArticleForm onSuccess={onSuccess} onError={onError} />);
        fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'My Article' } });
        fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: 'Short summary' } });
        fireEvent.change(screen.getByLabelText(/Tags/i), { target: { value: 'react, testing' } });
        const body = screen.getByRole('textbox', { name: /Body/i }) || screen.getByDisplayValue('');
        fireEvent.change(body, { target: { value: 'Hello **world**' } });

        const saveBtn = screen.getByRole('button', { name: /Save Article/i });
        expect(saveBtn).toBeEnabled();

        fireEvent.click(saveBtn);

        await waitFor(() => expect(addDoc).toHaveBeenCalled());
        await waitFor(() => expect(updateDoc).toHaveBeenCalled());
        expect(uploadBytesResumable).toHaveBeenCalled();
        expect(getDownloadURL).toHaveBeenCalled();

        expect(onError).not.toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalledWith(expect.stringMatching(/Article saved/));
    });

    it('shows admin fields when user has admin claim', async () => {
        mockUser = {
            uid: 'admin1',
            email: 'admin@example.com',
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } }),
        };
        render(<ArticleForm />);
        expect(await screen.findByText(/Admin options/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Author display name \(override\)/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Seed rating avg/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Seed rating count/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Seed comments/i)).toBeInTheDocument();
    });
});
