## 2024-05-24 - React Leaflet Marker Memoization
**Learning:** Passing inline event handlers to React Leaflet's `Marker` component breaks `React.memo` and causes expensive map re-renders on every parent state change.
**Action:** Always pass stable function references (like state setters e.g. `setSelectedObj`) as props to map marker components, and construct the `eventHandlers` object internally using `useMemo`.
