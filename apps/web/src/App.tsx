import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TrieRouter } from 'hono/router/trie-router';
import type { FC } from 'react';

import { Layout } from './components/layout/Layout';
import { RouterProvider, RouteView, useLocation } from './components/router/HonoRouter';
import { DirectionProvider } from './components/ui/direction';
import { TooltipProvider } from './components/ui/tooltip';
import { LandingPage } from './pages/LandingPage';
import { ContactPage } from './pages/ContactPage';
import { TrialPage } from './pages/TrialPage';
import { DashboardPage } from './pages/DashboardPage';
import { UploadDataPage } from './pages/UploadDataPage';
import { SettingsPage } from './pages/SettingsPage';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const router = new TrieRouter<FC<any>>();

// Define routes
router.add('GET', '/', LandingPage);
router.add('GET', '/contact', ContactPage);
router.add('GET', '/trial', TrialPage);
router.add('GET', '/dashboard', DashboardPage);
router.add('GET', '/dashboard/upload', UploadDataPage);
router.add('GET', '/dashboard/settings', SettingsPage);

/**
 * App wires the marketing-site layout to the lightweight client router.
 */
function App() {
  return (
    <TooltipProvider>
      <RouterProvider>
        <AppShell />
      </RouterProvider>
    </TooltipProvider>
  );
}

function AppShell() {
  const { path } = useLocation();
  const route = <RouteView router={router} />;

  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return (
      <DirectionProvider dir="rtl" direction="rtl">
        {route}
      </DirectionProvider>
    );
  }

  return <Layout>{route}</Layout>;
}

export default App;
