// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditPackListScreen from './EditPackListScreen.js';

const {
  getAllPackListsMock,
  getPackListMock,
  savePackListMock,
  hasCircularReferenceMock,
} = vi.hoisted(() => ({
  getAllPackListsMock: vi.fn(),
  getPackListMock: vi.fn(),
  savePackListMock: vi.fn(),
  hasCircularReferenceMock: vi.fn(),
}));

vi.mock('../db/packLists.js', () => ({
  getAllPackLists: getAllPackListsMock,
  getPackList: getPackListMock,
  savePackList: savePackListMock,
  hasCircularReference: hasCircularReferenceMock,
}));

describe('EditPackListScreen back/save behavior', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getAllPackListsMock.mockResolvedValue([]);
    getPackListMock.mockResolvedValue(null);
    savePackListMock.mockResolvedValue({
      id: 'saved-id',
      name: 'Weekend trip',
      items: [],
      referencedListIds: [],
      createdAt: '',
      updatedAt: '',
    });
    hasCircularReferenceMock.mockReturnValue(false);
  });

  it('flushes save when navigating back with dirty named form', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onBack = vi.fn();
    render(<EditPackListScreen listId={null} onNavigate={onNavigate} onBack={onBack} />);

    await user.type(screen.getByLabelText('Name'), 'Weekend trip');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(savePackListMock).toHaveBeenCalledWith(
        { name: 'Weekend trip', items: [], referencedListIds: [] },
        undefined,
      );
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates back without saving when name is blank', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onBack = vi.fn();
    render(<EditPackListScreen listId={null} onNavigate={onNavigate} onBack={onBack} />);

    await user.type(screen.getByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(savePackListMock).not.toHaveBeenCalled();
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates exactly once when back is tapped once', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onBack = vi.fn();
    render(<EditPackListScreen listId={null} onNavigate={onNavigate} onBack={onBack} />);

    await user.type(screen.getByLabelText('Name'), 'Weekend trip');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
