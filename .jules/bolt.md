## 2024-05-18 - Memoize React Leaflet Event Handlers
**Learning:** In react-leaflet, passing inline objects to the `eventHandlers` prop of components like `<Marker>` defeats `React.memo` and causes expensive map re-renders on every state change because the object reference changes on every render.
**Action:** Always memoize `eventHandlers` using `useMemo` when rendering mapped or highly re-rendered components, and avoid passing inline arrow functions as callbacks; instead, pass stable function references directly (e.g. `onClick={setSelectedObj}`).
