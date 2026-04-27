import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Separator } from './separator';

describe('Separator', () => {
  afterEach(() => {
    cleanup();
  });

  it('forwards orientation to the DOM', () => {
    render(<Separator data-testid="separator" orientation="vertical" />);
    const separator = screen.getByTestId('separator');

    expect(separator.getAttribute('data-orientation')).toBe('vertical');
    expect(separator.getAttribute('data-slot')).toBe('separator');
  });

  it('defaults to horizontal orientation', () => {
    render(<Separator data-testid="separator" />);
    const separator = screen.getByTestId('separator');

    expect(separator.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('merges custom class names', () => {
    render(<Separator data-testid="separator" className="my-4" />);
    const className = screen.getByTestId('separator').getAttribute('class') ?? '';

    expect(className).toContain('my-4');
  });

  it('does not emit legacy data-horizontal/data-vertical class prefixes', () => {
    render(<Separator data-testid="separator" />);
    const className = screen.getByTestId('separator').getAttribute('class') ?? '';

    expect(className).not.toContain('data-horizontal:');
    expect(className).not.toContain('data-vertical:');
  });
});
