import { useState } from 'react';
import type { Screen } from './types/index.js';
import HomeScreen from './screens/HomeScreen.js';
import ListsScreen from './screens/ListsScreen.js';
import EditPackListScreen from './screens/EditPackListScreen.js';
import NewPackingScreen from './screens/NewPackingScreen.js';
import PackingScreen from './screens/PackingScreen.js';
import UpdatePrompt from './components/UpdatePrompt.js';
import './App.css';

export default function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>({ id: 'home' });

  return (
    <>
      <UpdatePrompt />
      {screen.id === 'home' && <HomeScreen onNavigate={setScreen} />}
      {screen.id === 'lists' && <ListsScreen onNavigate={setScreen} />}
      {screen.id === 'edit-pack-list' && (
        <EditPackListScreen listId={screen.listId} onNavigate={setScreen} />
      )}
      {screen.id === 'new-packing' && <NewPackingScreen onNavigate={setScreen} />}
      {screen.id === 'packing' && (
        <PackingScreen packingId={screen.packingId} onNavigate={setScreen} />
      )}
    </>
  );
}
