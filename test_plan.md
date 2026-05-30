1. **Understand Issue**: The `Map` component passes inline functions (like `onClick={() => setSelectedObj(u)}`) to memoized marker components (`UserMarker`, `ReportMarker`, `EventMarker`), which completely defeats `React.memo`. This causes all markers to re-render, and their underlying Leaflet `Marker` instances to recreate event handlers, every time `Map` re-renders (e.g., when the user's GPS position updates, which happens frequently).
2. **Modify Marker Components**:
   - Update `UserMarker`, `ReportMarker`, and `EventMarker` to accept the stable `setSelectedObj` setter directly (or assume `onViewDetails` is stable), along with the relevant object.
   - Inside each marker component, memoize the Leaflet `eventHandlers` object using `useMemo` with proper dependencies.
3. **Update Map Render Loop**:
   - In `Map.tsx`, update the render loops for users, reports, and events to pass `setSelectedObj` directly, rather than passing an inline anonymous function.
4. **Testing**: Run `pnpm lint` and `pnpm test` to ensure there are no regressions, and run `pnpm build` to verify compilation.
