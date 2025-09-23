import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TutorialForm from './TutorialForm';

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(null);
    return () => { };
  },
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: () => new Date(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  deleteField: () => null,
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn() }),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytesResumable: () => ({ on: (_e, _p, _r, done) => done() }),
  getDownloadURL: vi.fn(async () => 'https://example.com/x'),
  deleteObject: vi.fn(),
}));
vi.mock('../../firebase', () => ({ auth: {}, db: {}, storage: {} }));
vi.mock('react-konva', () => {
  const Stub = ({ children, ...props }) => <div {...props}>{children}</div>;
  return { Stage: Stub, Layer: Stub, Image: Stub, Rect: Stub, Circle: Stub, Line: Stub, Text: Stub, Group: Stub, Transformer: Stub };
});
vi.mock('../imageresize/imageprocessing', () => {
  const Comp = React.forwardRef(({ label, inputId }, ref) => (
    <div>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input id={inputId} ref={ref} />
    </div>
  ));
  return { default: Comp };
});
vi.mock('../question/PostQuestionEditor', () => ({
  default: ({ id, value, onChange }) => (
    <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

describe('TutorialForm', () => {
  it('renders core fields', () => {
    render(<TutorialForm />);
    expect(screen.getByRole('textbox', { name: /Title/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Summary/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Tags/i })).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Save Tutorial/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });
});
