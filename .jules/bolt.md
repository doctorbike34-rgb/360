## 2024-05-29 - React Leaflet Re-render Optimization
**Learning:** React Leaflet markers are wrapped in `React.memo`, but inline object creation for `eventHandlers` or passing inline functions inside memoized components breaks the memoization, causing expensive map re-renders.
**Action:** When working with React Leaflet (e.g., in `Map.tsx`), pass stable references as props, and always memoize the `eventHandlers` object using `useMemo` to prevent defeating `React.memo` and causing expensive map re-renders.
