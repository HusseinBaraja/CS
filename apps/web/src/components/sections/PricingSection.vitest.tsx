import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingSection } from './PricingSection';

vi.mock('gsap', () => ({
  default: {
    registerPlugin: vi.fn(),
    timeline: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn((callback: () => void) => callback()),
}));

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {},
}));

vi.mock('../router/HonoRouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('PricingSection', () => {
  it('renders the starter CTA as a block-level link', () => {
    render(<PricingSection />);

    const link = screen.getByRole('link', { name: 'ابدأ التجربة' });

    expect(link.getAttribute('class')).toContain('block');
  });
});
