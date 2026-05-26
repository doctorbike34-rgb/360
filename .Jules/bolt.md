
## $(date +%Y-%m-%d) - Prevent React.memo Defeat in React Leaflet Markers
**Learning:** Passing inline objects to the `eventHandlers` prop of `react-leaflet` components (like `<Marker>`) creates a new reference on every render, defeating `React.memo` and causing expensive map re-renders. Similarly, passing inline functions from parent components creates new references.
**Action:** When working with `react-leaflet` components, especially within loops, always pass stable function references (like state setters e.g. `setSelectedObj`) as props to the memoized marker components. Inside the marker component, always memoize the `eventHandlers` object using `useMemo`.
