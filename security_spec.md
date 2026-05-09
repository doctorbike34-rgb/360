# Security Specification - DoctorBike Italia

## Data Invariants
1. A user cannot modify another user's profile balance or role.
2. An SOS request can only be accepted by a user with a non-BASE plan (enforced via rules and app logic).
3. Funds in ESCROW for an SOS request can only be RELEASED when both parties confirm or a timeout is reached (simulated via state transitions).
4. Users cannot delete logs or interventions.
5. PII (email) is only readable by the owner or an admin.

## The Dirty Dozen Payloads (Target: DENIED)

1. **Identity Spoofing**: Create a user profile with a UID that isn't yours.
2. **Privilege Escalation**: Update your own user profile to `role: 'ADMIN'`.
3. **Wallet Theft**: Update another user's `balance` document directly.
4. **Shadow SOS**: Create an SOS request with `paymentStatus: 'RELEASED'` immediately.
5. **Double Accept**: Update an already `ACCEPTED` SOS request to change the `mechanicId`.
6. **Price Tampering**: Update an `ACCEPTED` SOS request to lower the `estimatedPrice`.
7. **Chat Hijack**: Add a message to a chat you are not a participant in.
8. **PII Leak**: Read all documents in `users` collection as a standard user.
9. **Log Deletion**: Attempt to delete a document in `interventions` or `transactions`.
10. **State Shortcut**: Transition an SOS status from `PENDING` directly to `COMPLETED` without a `mechanicId`.
11. **Ghost Update**: Update a document with extra hidden fields like `isVerified: true`.
12. **Junk ID**: Attempt to create a document with a 2KB string as the ID.

## Test Runner Logic
The `firestore.rules` will be evaluated against these scenarios. Any `allow` that would permit these without strict validation is a failure.
