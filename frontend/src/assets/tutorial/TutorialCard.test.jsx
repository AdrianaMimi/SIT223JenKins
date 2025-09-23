import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TutorialCard from './TutorialCard';

function renderWithRoute(ui, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

const baseData = {
  id: 'abc 123',
  title: 'How to Test',
  description: 'Testing 101',
  authorDisplay: 'Imaan',
  rating: 4.2,
  ratingCount: 7,
  image: 'https://example.com/image.jpg',
};

describe('<TutorialCard />', () => {
  it('renders title, description, author and rating', () => {
    renderWithRoute(<TutorialCard data={baseData} />);
    expect(screen.getByText(/how to test/i)).toBeInTheDocument();
    expect(screen.getByText(/testing 101/i)).toBeInTheDocument();
    expect(screen.getByText('Imaan')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('(7)')).toBeInTheDocument();
  });

  it('uses provided image and links to encoded id', () => {
    renderWithRoute(<TutorialCard data={baseData} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tutorials/abc%20123');
  });

  it('falls back to placeholder when no image exists', () => {
    const noImg = { ...baseData, image: undefined, display: undefined, imageURL: undefined };
    renderWithRoute(<TutorialCard data={noImg} />);
    expect(screen.getByRole('img').getAttribute('src')).toMatch(/placeholder/);
  });

  it('shows "Anonymous" when author missing', () => {
    const { authorDisplay, author, ...rest } = baseData;
    renderWithRoute(<TutorialCard data={rest} />);
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
  });

  it('shows Delete button for admin on /tutorials/all', () => {
    const onDelete = vi.fn();
    renderWithRoute(
      <TutorialCard data={baseData} isAdmin onDelete={onDelete} />,
      '/tutorials/all'
    );
    expect(screen.getByRole('button', { name: /delete this tutorial/i })).toBeInTheDocument();
  });

  it('clicking Delete calls onDelete with full data', () => {
    const onDelete = vi.fn();
    renderWithRoute(
      <TutorialCard data={baseData} isAdmin onDelete={onDelete} />,
      '/tutorials/all'
    );
    fireEvent.click(screen.getByRole('button', { name: /delete this tutorial/i }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining(baseData));
  });
});
