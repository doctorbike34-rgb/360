import React, { lazy, Suspense } from 'react';

export const RoadReportDetailModalLazy = lazy(() =>
  import('./RoadReportDetailModal').then((m) => ({ default: m.RoadReportDetailModal }))
);

export function ModalSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
