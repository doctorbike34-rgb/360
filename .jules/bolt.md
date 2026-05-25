## 2024-05-25 - React Leaflet Marker Memoization
**Learning:** In React Leaflet, using `React.memo` on marker components is easily defeated if the parent passes inline arrow functions (like `onClick={() => setObj(u)}`). Furthermore, constructing `eventHandlers={{ click: ... }}` inline inside the `<Marker>` prevents Leaflet's internal optimizations and triggers map layer re-renders.
**Action:** Always pass stable state setter references (like `setSelectedObj`) as props and use `useMemo` to build the `eventHandlers` object inside custom memoized marker components.
