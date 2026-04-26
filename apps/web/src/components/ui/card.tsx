import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={`rounded-lg border border-[#dfe6e2] bg-white shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)] ${className}`}
      {...props}
    />
  );
}
