## 2024-05-23 - Map Marker Memoization
**Learning:** In React Leaflet, passing inline functions to event handlers on markers (e.g. `eventHandlers={{ click: () => ... }}`) or passing inline functions as props to `React.memo` wrapped Marker components defeats memoization and causes expensive map re-renders on every state change.
**Action:** Always use `useMemo` for `eventHandlers` and pass stable references (like state setters) as props to Marker components instead of inline closures.
