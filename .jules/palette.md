## 2024-05-20 - Missing ARIA Labels on Dismiss Buttons
**Learning:** Icon-only dismiss buttons (`<X size={...} />`) across custom overlays and modals in this app consistently lack `aria-label`s, rendering them unannounced to screen reader users.
**Action:** When adding new dismiss/close buttons or reviewing existing overlays, always explicitly define `aria-label={t('common.close')}`.
