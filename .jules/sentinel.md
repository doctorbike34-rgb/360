## 2024-05-23 - Privilege Escalation via User Profile Creation
**Vulnerability:** A critical vulnerability allowed any authenticated user to escalate their privileges to ADMIN by specifying `role: 'ADMIN'` during their initial profile creation. This bypassed the protections that existed only on profile updates.
**Learning:** Firebase Security Rules must validate incoming data during document `create` operations, not just `update` operations. Attackers can provide arbitrary fields when creating their own documents.
**Prevention:** Always restrict sensitive fields (like roles, balances) in both `allow create` and `allow update` rules. Using `incoming().get('role', '') != 'ADMIN'` prevents setting the role to ADMIN on creation.
