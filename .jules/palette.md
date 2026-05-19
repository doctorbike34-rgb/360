## 2024-05-24 - Missing ARIA Labels on Close Buttons
**Learning:** Found multiple instances of icon-only 'close' buttons (using the X icon) lacking 'aria-label' attributes in modal and settings views. This makes navigation difficult for screen reader users as they won't know the button's purpose.
**Action:** Add 'aria-label' to icon-only buttons to improve accessibility.
