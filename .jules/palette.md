## 2024-05-24 - Missing ARIA Labels on Close Buttons
**Learning:** Found multiple close buttons (`<X />` icons) in modal headers missing `aria-label` attributes, affecting screen reader accessibility.
**Action:** Add localized `aria-label` attributes (using `t('common.close')`) to all icon-only buttons in `ProfileView.tsx` and other relevant components.
