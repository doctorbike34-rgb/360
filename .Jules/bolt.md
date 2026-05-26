## 2024-05-23 - Map Marker Re-renders
**Learning:** `React.memo` for map markers (e.g. `UserMarker`, `EventMarker`) in `react-leaflet` is easily defeated when their `eventHandlers` object or inline functions (`onClick={() => ...}`) are passed as props. This causes expensive map re-renders.
**Action:** Pass stable references like `setSelectedObj` directly to the markers and wrap the `eventHandlers` map object with `useMemo` so that `React.memo` correctly caches the component.
