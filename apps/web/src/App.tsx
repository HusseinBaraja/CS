import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TrieRouter } from 'hono/router/trie-router';

import { Layout } from './components/layout/Layout';
import { RouterProvider, RouteView, useLocation } from './components/router/HonoRouter';
import { TooltipProvider } from './components/ui/tooltip';
import { LandingPage } from './pages/LandingPage';
import { ContactPage } from './pages/ContactPage';
import { TrialPage } from './pages/TrialPage';
import { DashboardPage } from './pages/DashboardPage';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const router = new TrieRouter<React.FC<any>>();

// Define routes
router.add('GET', '/', LandingPage);
router.add('GET', '/contact', ContactPage);
router.add('GET', '/trial', TrialPage);
router.add('GET', '/dashboard', DashboardPage);

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

  if (path === '/dashboard') {
    return route;
  }

  return <Layout>{route}</Layout>;
}

export default App;
