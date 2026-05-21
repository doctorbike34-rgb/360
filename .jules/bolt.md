## 2025-05-21 - Memoized ChatListView and ChatListItem
**Learning:** `ChatListView` and `ChatListItem` were re-rendering frequently because they receive function references (`onSelectChat`) and complex object references (`chat` objects, lists of chats).
**Action:** Used `React.memo` for both `ChatListView` and `ChatListItem`, and ensured that parent components (`MechanicHome`, `PeerMechanicHome`, `CyclistHome`) passed memoized callbacks (`useCallback`) to `onSelectChat` to take full advantage of the list optimization.
