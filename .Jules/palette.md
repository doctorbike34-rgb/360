## 2024-05-24 - Screen Reader Support for Internationalized Apps
**Learning:** Icon-only close buttons were missing translated `aria-label`s, which makes them completely inaccessible for users relying on screen readers. Simply providing a generic 'Close' label is insufficient when the app supports multiple languages.
**Action:** When adding `aria-label` to icon-only interactive elements in an app that uses i18next or similar, always utilize the `t()` function (e.g., `t('common.close')`) to ensure the accessible label matches the user's active locale.
