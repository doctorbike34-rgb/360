import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-grey/15 ${className}`} aria-hidden />;
}

export function ChatListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-busy aria-label="Caricamento chat">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-[2rem] border border-grey/5 bg-white">
          <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function JobCardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-4 px-6" aria-busy aria-label="Caricamento interventi">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5 rounded-[2.5rem] border border-grey/10 bg-white space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex gap-3 flex-1">
              <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-2.5 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-8 w-14 rounded-xl" />
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function MapLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-[500] pointer-events-none flex items-center justify-center bg-white/40 backdrop-blur-[2px]"
      aria-busy
      aria-label="Caricamento mappa"
    >
      <div className="bg-white/95 px-5 py-3 rounded-2xl shadow-lg border border-grey/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest text-grey">Caricamento mappa…</span>
      </div>
    </div>
  );
}
