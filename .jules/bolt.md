## 2024-05-15 - [Initial]
**Learning:** Initializing journal.
**Action:** Ready for future learnings.
## 2024-05-15 - [Map Marker Memoization]
**Learning:** Passing inline functions to `eventHandlers` prop of react-leaflet markers defeats `React.memo()` and causes expensive map re-renders.
**Action:** Always memoize the `eventHandlers` object using `useMemo` when wrapping map markers in `React.memo()`.
