## 2024-05-19 - Ensure close buttons have aria-label
**Learning:** Found multiple instances where close icon buttons (`<X size={24} />`) lacked an `aria-label`, making them inaccessible to screen readers.
**Action:** Always wrap standard Close `X` icon-only buttons with an `aria-label` attribute using translated values (e.g. `t('common.close')`) to ensure proper accessibility.
