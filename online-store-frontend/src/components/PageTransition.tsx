import type { ReactNode } from 'react';

export const PageTransition = ({ children }: { children: ReactNode }) => (
  <div className="animate-in fade-in slide-in-from-bottom-5 duration-300 motion-reduce:animate-none">
    {children}
  </div>
);
