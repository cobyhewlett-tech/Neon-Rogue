# Daily Challenge Security Specification

## 1. Data Invariants
1. Every document in `daily_scores/{entryId}` must use the deterministic document ID `{dateKey}_{uid}` matching `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-zA-Z0-9_\-]+$`.
2. `uid` must strictly match `request.auth.uid` and the user must have a verified email (`request.auth.token.email_verified == true`).
3. No PII (`email`, `phone`, `address`) is stored in `daily_scores`.
4. All required keys must be present and no extra shadow fields are allowed (`hasAll` + `hasOnly`).
5. `createdAt` and `updatedAt` must equal `request.time` on creation; `uid`, `dateKey`, and `createdAt` are immutable on updates.
6. Updates to a `daily_scores` entry are only allowed if the new `score` strictly exceeds the existing `score` (`incoming().score > existing().score`).
7. List queries on `daily_scores` must include a bounded limit (`request.query.limit <= 50`) and validate document schema fields on `resource.data`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. Unauthenticated write to `daily_scores/2026-11-24_attacker` -> DENIED (`isSignedIn()`).
2. Unverified email write (`email_verified == false`) -> DENIED (`isVerifiedUser()`).
3. Spoofed `uid` field in payload (`uid != request.auth.uid`) -> DENIED.
4. Mismatched document ID (`entryId != dateKey + '_' + request.auth.uid`) -> DENIED.
5. Shadow field injection (`isAdmin: true` or `verifiedScore: true`) -> DENIED (`hasOnly(...)`).
6. Invalid `dateKey` format (`"not-a-date"` or `"2026/11/24"`) -> DENIED (`matches`).
7. Oversized `pilotName` (> 32 chars) or empty `pilotName` -> DENIED (`.size()` bounds).
8. Negative or overflowed `score` (`-500` or `9999999999`) -> DENIED (range check).
9. Client-forged timestamp (`createdAt` != `request.time`) -> DENIED.
10. Downgrading/overwriting score with lower score (`incoming().score <= existing().score`) -> DENIED.
11. Mutating immutable `dateKey`, `uid`, or `createdAt` on update -> DENIED (`affectedKeys().hasOnly(...)` + equality checks).
12. Deleting another user's or own daily score record -> DENIED (`allow delete: if false`).
