import { HeroSection } from '../components/sections/HeroSection';
import { ProblemSection } from '../components/sections/ProblemSection';
import { SolutionSection } from '../components/sections/SolutionSection';
import { FlowSection } from '../components/sections/FlowSection';
import { TrustSection } from '../components/sections/TrustSection';
import { PricingSection } from '../components/sections/PricingSection';
import { CTASection } from '../components/sections/CTASection';

/**
 * LandingPage renders the full marketing homepage section stack.
 */
export function LandingPage() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <FlowSection />
      <TrustSection />
      <PricingSection />
      <CTASection />
    </>
  );
}
