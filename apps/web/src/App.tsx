import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { Layout } from './components/layout/Layout';
import { HeroSection } from './components/sections/HeroSection';
import { ProblemSection } from './components/sections/ProblemSection';
import { SolutionSection } from './components/sections/SolutionSection';
import { FlowSection } from './components/sections/FlowSection';
import { TrustSection } from './components/sections/TrustSection';
import { PricingSection } from './components/sections/PricingSection';
import { CTASection } from './components/sections/CTASection';

gsap.registerPlugin(useGSAP, ScrollTrigger);

function App() {
  return (
    <Layout>
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <FlowSection />
      <TrustSection />
      <PricingSection />
      <CTASection />
    </Layout>
  );
}

export default App;
