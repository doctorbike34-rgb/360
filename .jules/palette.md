## 2024-05-24 - Missing ARIA Labels on Modal Close Buttons
**Learning:** Found a pattern where icon-only modal close buttons (`<X size={...} />`) were frequently missing `aria-label` attributes across different sub-views and modals within a single complex component (`ProfileView.tsx`).
**Action:** When creating new modals or bottom sheets, ensure that the close button always has an `aria-label` using localized text (e.g., `aria-label={t('common.close')}`).
