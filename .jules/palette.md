## 2024-05-21 - Icon-Only Button Accessibility
**Learning:** Found several icon-only buttons (like Close `<X/>` and Back `<ArrowLeft/>`) missing `aria-label`s or with hardcoded English strings ("Close history"). This prevents screen readers from announcing their purpose and breaks internationalization.
**Action:** Always add `aria-label={t('common.<action>')}` to all interactive icon-only elements across the application to ensure localized screen reader accessibility.
