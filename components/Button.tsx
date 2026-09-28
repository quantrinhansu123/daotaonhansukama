import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-[#1B7A1E] hover:bg-[#156318] text-white shadow-lg shadow-[#1B7A1E]/30 border border-transparent focus:ring-[#1B7A1E]",
    secondary: "bg-white/10 text-white hover:bg-white/20 border border-transparent shadow-md focus:ring-white/50 backdrop-blur-sm",
    outline: "bg-transparent border-2 border-[#1B7A1E] text-[#1B7A1E] hover:bg-[#1B7A1E]/10 focus:ring-[#1B7A1E]",
    ghost: "bg-transparent text-slate-300 hover:text-white hover:bg-white/10 focus:ring-slate-400"
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};