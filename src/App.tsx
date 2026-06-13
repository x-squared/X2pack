import { useCallback, useMemo, useState } from 'react';
import type { Screen } from './types/index.js';
import HomeScreen from './screens/HomeScreen.js';
import ListsScreen from './screens/ListsScreen.js';
import EditPackListScreen from './screens/EditPackListScreen.js';
import NewPackingScreen from './screens/NewPackingScreen.js';
import PackingScreen from './screens/PackingScreen.js';
import UpdatePrompt from './components/UpdatePrompt.js';
import WhatsNewDialog, { shouldShowWhatsNew } from './components/WhatsNewDialog.js';
import './App.css';

export default function App(): React.ReactElement {
  const [history, setHistory] = useState<Screen[]>([{ id: 'home' }]);
  const screen = useMemo(() => history.at(-1) ?? ({ id: 'home' } as Screen), [history]);
  const [showWhatsNew, setShowWhatsNew] = useState(() => shouldShowWhatsNew());

  const navigate = useCallback((next: Screen): void => {
    setHistory((prev) => [...prev, next]);
  }, []);

  const goBack = useCallback((): void => {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <>
      <UpdatePrompt />
      {showWhatsNew && <WhatsNewDialog onDismiss={() => setShowWhatsNew(false)} />}
      {screen.id === 'home' && <HomeScreen onNavigate={navigate} />}
      {screen.id === 'lists' && <ListsScreen onNavigate={navigate} onBack={goBack} />}
      {screen.id === 'edit-pack-list' && (
        <EditPackListScreen listId={screen.listId} onNavigate={navigate} onBack={goBack} />
      )}
      {screen.id === 'new-packing' && <NewPackingScreen onNavigate={navigate} />}
      {screen.id === 'packing' && (
        <PackingScreen packingId={screen.packingId} onNavigate={navigate} />
      )}
    </>
  );
}
