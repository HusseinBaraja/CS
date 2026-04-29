import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DirectionProvider } from './components/ui/direction.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DirectionProvider dir="rtl" direction="rtl">
      <App />
    </DirectionProvider>
  </StrictMode>,
)
