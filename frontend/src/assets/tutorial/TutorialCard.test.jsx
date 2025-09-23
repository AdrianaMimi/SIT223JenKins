import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createRef } from 'react';
import TutorialCard from './TutorialCard';

const baseData = {
  id: 'abc 123',
  title: 'How to Test',
  description: 'Testing 101',
  authorDisplay: 'Imaan',
  rating: 4.2,
  ratingCount: 7,
  image: 'https://example.com/image.jpg',
};

function renderWithRoute(ui, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('TutorialCard', () => {
  afterEach(() => cleanup());

  it('renders title, description, author and rating', () => {
    renderWithRoute(<TutorialCard data={baseData} />);
    const card = screen.getByText(/how to test/i).closest('.card');
    expect(within(card).getByText(/testing 101/i)).toBeInTheDocument();
    expect(within(card).getByText('Imaan')).toBeInTheDocument();
    expect(within(card).getByText('4.2')).toBeInTheDocument();
    expect(within(card).getByText('(7)')).toBeInTheDocument();
  });

  it('uses provided image and correct link', () => {
    renderWithRoute(<TutorialCard data={baseData} />);
    const card = screen.getByText(/how to test/i).closest('.card');
    const img = within(card).getByRole('img');
    const link = within(card).getByRole('link');
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(link).toHaveAttribute('href', '/tutorials/abc%20123');
  });

  it('falls back to placeholder when no image exists', () => {
    const noImg = { ...baseData, image: undefined, display: undefined, imageURL: undefined };
    renderWithRoute(<TutorialCard data={noImg} />);
    const card = screen.getByText(/how to test/i).closest('.card');
    const img = within(card).getByRole('img');
    expect(img.src).toMatch(/placeholder/);
  });

  it('shows Anonymous when no author provided', () => {
    const { authorDisplay, author, ...rest } = baseData;
    renderWithRoute(<TutorialCard data={rest} />);
    const card = screen.getByText(/how to test/i).closest('.card');
    expect(within(card).getByText('Anonymous')).toBeInTheDocument();
  });

  it('shows Delete button for admin on /tutorials/all', () => {
    const onDelete = vi.fn();
    renderWithRoute(<TutorialCard data={baseData} isAdmin onDelete={onDelete} />, '/tutorials/all');
    const card = screen.getByText(/how to test/i).closest('.card');
    expect(within(card).getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('calls onDelete when Delete button clicked', () => {
    const onDelete = vi.fn();
    renderWithRoute(<TutorialCard data={baseData} isAdmin onDelete={onDelete} />, '/tutorials/all');
    const card = screen.getByText(/how to test/i).closest('.card');
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining(baseData));
  });

  it('shows drag handle only on /tutorials/all when drag props provided', () => {
    const dragHandleRef = createRef();
    const dragHandleProps = { onKeyDown: vi.fn() };

    renderWithRoute(
      <TutorialCard data={baseData} dragHandleRef={dragHandleRef} dragHandleProps={dragHandleProps} />,
      '/tutorials/all'
    );

    const card = screen.getByText(/how to test/i).closest('.card');
    expect(within(card).getByRole('button', { name: /drag to reorder/i })).toBeInTheDocument();
  });
});
