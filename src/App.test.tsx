// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./components/UpdatePrompt.js', () => ({
  default: () => null,
}));

vi.mock('./components/SyncButton.js', () => ({
  default: () => null,
}));

vi.mock('./components/WhatsNewDialog.js', () => ({
  default: () => null,
  shouldShowWhatsNew: () => false,
}));

vi.mock('./screens/pair/PairScreen.js', () => ({
  default: () => <h1>Pair mock</h1>,
}));

vi.mock('./screens/home/HomeScreen.js', () => ({
  default: ({ onNavigate }: { onNavigate: (screen: { id: string; listId?: string | null }) => void }) => (
    <div>
      <h1>Home mock</h1>
      <button onClick={() => onNavigate({ id: 'lists' })}>Go to lists</button>
    </div>
  ),
}));

vi.mock('./screens/lists/ListsScreen.js', () => ({
  default: ({ onNavigate }: { onNavigate: (screen: { id: string; listId?: string | null }) => void }) => (
    <div>
      <h1>Lists mock</h1>
      <button onClick={() => onNavigate({ id: 'edit-pack-list', listId: null })}>New list</button>
      <button onClick={() => onNavigate({ id: 'home' })}>Back home</button>
    </div>
  ),
}));

vi.mock('./screens/edit-pack-list/EditPackListScreen.js', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>Edit list mock</h1>
      <button onClick={onBack}>Back to lists</button>
    </div>
  ),
}));

vi.mock('./screens/new-packing/NewPackingScreen.js', () => ({
  default: () => <h1>New packing mock</h1>,
}));

vi.mock('./screens/packing/PackingScreen.js', () => ({
  default: () => <h1>Packing mock</h1>,
}));

describe('App navigation', () => {
  it('switches screens through in-app callbacks', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Home mock')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Go to lists' }));
    expect(screen.getByText('Lists mock')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'New list' }));
    expect(screen.getByText('Edit list mock')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Back to lists' }));
    expect(screen.getByText('Lists mock')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Back home' }));
    expect(screen.getByText('Home mock')).toBeDefined();
  });
});
