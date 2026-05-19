import React from 'react';
import { createPortal } from 'react-dom';

/** Render above app bottom nav (z-40) — escapes parent stacking contexts. */
export function FullScreenPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[250] flex flex-col bg-white">{children}</div>,
    document.body
  );
}
