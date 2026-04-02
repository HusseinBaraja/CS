import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TrieRouter } from 'hono/router/trie-router';

import { Layout } from './components/layout/Layout';
import { HonoRouter } from './components/router/HonoRouter';
import { LandingPage } from './pages/LandingPage';
import { ContactPage } from './pages/ContactPage';
import { TrialPage } from './pages/TrialPage';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const router = new TrieRouter<React.FC<any>>();

// Define routes
router.add('GET', '/', LandingPage);
router.add('GET', '/contact', ContactPage);
router.add('GET', '/trial', TrialPage);

function App() {
  return (
    <Layout>
      <HonoRouter router={router} />
    </Layout>
  );
}

export default App;
