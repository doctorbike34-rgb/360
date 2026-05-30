## 2026-05-30 - React Leaflet Marker Memoization
**Learning:** Passing inline event handlers (like onClick) to Leaflet components (like Marker) inside a render loop defeats React.memo and causes Leaflet to recreate event listeners constantly.
**Action:** Always use stable function references and memoize the eventHandlers object using useMemo when building custom React Leaflet markers.
