## 2024-05-21 - [Shadow SOS Prevention]
**Vulnerability:** SOS requests could be created with a `paymentStatus: 'RELEASED'` or pre-filled `mechanicId`, allowing an attacker to bypass payment and mechanic assignment logic (Target Payload: "Shadow SOS").
**Learning:** `firestore.rules` validation for `isValidSOS` only checked for the presence of required fields (`hasAll`) and their basic types, but didn't restrict optional fields that shouldn't be present at creation time (like `paymentStatus` and `mechanicId`).
**Prevention:** In `firestore.rules`, explicitly validate that optional, critical fields are either omitted or have their default state during document creation using `(!data.keys().hasAny(['field']) || data.field == expected)`.
