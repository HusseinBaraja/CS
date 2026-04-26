import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'ghost' | 'soft';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  ghost: 'bg-transparent text-[#202825] hover:bg-[#ecf5ef]',
  soft: 'bg-[#edf7f1] text-[#087941] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-[#e2f1e8]',
};

export function Button({ className = '', variant = 'ghost', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-xl border border-transparent font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15864f] ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
