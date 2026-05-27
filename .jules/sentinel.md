## 2026-05-27 - Shadow SOS Vulnerability
**Vulnerability:** A malicious user could create an SOS request with `paymentStatus: 'RELEASED'` immediately, bypassing the escrow mechanism.
**Learning:** Initial state values must be strictly validated during document creation in Firestore rules to prevent state-bypassing payloads.
**Prevention:** Always validate initial state properties like `paymentStatus` in creation rules, defaulting to safe values (e.g., `data.get('paymentStatus', 'ESCROW') == 'ESCROW'`).
