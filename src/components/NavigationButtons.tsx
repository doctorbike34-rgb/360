import React from 'react';
import { Navigation2 } from 'lucide-react';
import { openNavigationApp, isAppleMobile } from '../lib/openNavigation';

type Props = {
  lat: number;
  lng: number;
  className?: string;
  compact?: boolean;
};

/** Google Maps, Apple Maps (iOS), Waze — directions to event / POI */
export function NavigationButtons({ lat, lng, className = '', compact = false }: Props) {
  const btnClass = compact
    ? 'flex-1 min-w-0 py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-center active:scale-95 transition-all'
    : 'flex-1 py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-center active:scale-95 transition-all';

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => openNavigationApp('google', lat, lng)}
        className={`${btnClass} bg-[#4285F4]/10 text-[#4285F4] border border-[#4285F4]/20`}
      >
        Google Maps
      </button>
      {isAppleMobile() && (
        <button
          type="button"
          onClick={() => openNavigationApp('apple', lat, lng)}
          className={`${btnClass} bg-black/5 text-black border border-grey/15`}
        >
          Apple Maps
        </button>
      )}
      <button
        type="button"
        onClick={() => openNavigationApp('waze', lat, lng)}
        className={`${btnClass} bg-[#33CCFF]/10 text-[#0099CC] border border-[#33CCFF]/25`}
      >
        Waze
      </button>
    </div>
  );
}

export function NavigateToEventButton({
  lat,
  lng,
  className = '',
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[9px] font-black text-grey uppercase tracking-widest mb-2 flex items-center gap-1">
        <Navigation2 size={12} className="text-primary" />
        Portami all&apos;evento
      </p>
      <NavigationButtons lat={lat} lng={lng} compact />
    </div>
  );
}
