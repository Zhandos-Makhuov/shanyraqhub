import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startAutoUpdate } from './utils/autoUpdate';
import { captureDeepLink } from './utils/deepLink';

// Phase 6 (C-16): read ?event= / ?topic= / ?n= before anything else looks at the URL.
captureDeepLink();

createRoot(document.getElementById('root')!).render(<App />);
startAutoUpdate();
