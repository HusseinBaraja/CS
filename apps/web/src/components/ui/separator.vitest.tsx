import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from './separator';

describe('Separator', () => {
  it('uses Radix data-orientation selectors for sizing classes', () => {
    render(<Separator data-testid="separator" orientation="vertical" />);

    const className = screen.getByTestId('separator').getAttribute('class') ?? '';

    expect(className).toContain('data-[orientation=horizontal]:h-px');
    expect(className).toContain('data-[orientation=horizontal]:w-full');
    expect(className).toContain('data-[orientation=vertical]:w-px');
    expect(className).toContain('data-[orientation=vertical]:h-full');
    expect(className).not.toContain('data-horizontal:');
    expect(className).not.toContain('data-vertical:');
  });
});
