## 2024-05-19 - React Leaflet Event Handlers and Props Memoization
**Learning:** Leaflet components like `<Marker>` in `react-leaflet` accept an `eventHandlers` prop. This prop is an object. If constructed inline (e.g., `eventHandlers={{ click: () => {} }}`), it causes the underlying Leaflet marker to re-render / re-bind events continually, completely defeating `React.memo` for large maps and leading to sluggish UI frame rates during updates. Passing inline functions as root props (e.g. `onClick={() => setSelectedObj(u)}`) also breaks memoization.
**Action:** Always wrap the `eventHandlers` object using `useMemo` in child components and pass stable references (like `setSelectedObj` instead of `() => setSelectedObj(...)`) down through the React tree.

## 2024-05-19 - Leaflet SVG Icon Caching
**Learning:** Instantiating `L.icon()` with a large raw SVG data URI string directly inside render helpers or hooks forces the browser to continually parse identical SVG strings and Leaflet to create duplicate icon objects, causing memory churn and performance drops on densely populated maps.
**Action:** Always cache generated `L.Icon` objects (e.g. via a simple `Map`) using a composite string key representing the SVG layout and sizing.
