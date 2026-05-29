## 2024-05-24 - React Leaflet Map Marker Performance
**Learning:** Passing inline arrow functions (e.g., `onClick={() => setSelectedObj(u)}`) to memoized React Leaflet marker components defeats `React.memo` and forces expensive re-renders of the map markers.
**Action:** Always pass stable references like state setters (`setSelectedObj`) directly as props and memoize the Leaflet `eventHandlers` object internally using `useMemo`.
