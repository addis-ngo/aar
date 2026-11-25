# AAR Firestore Security Specification

## 1. Data Invariants

1. **Owner-Only Mutations**: Only the verified owner account (`ngoaddis06@gmail.com` with `email_verified == true`) can create, update, or delete documents in `/albums/{albumId}`.
2. **Identity Binding**: Every `AlbumReview` document must set `ownerUid` to `request.auth.uid` on creation and keep `ownerUid`, `externalId`, `source`, and `createdAt` immutable on updates.
3. **Public Visibility Boundary**: Visitors can `get` or `list` `/albums/{albumId}` documents only when `resource.data.isPublic == true` (or when authenticated as the verified owner). Private or unflagged documents cannot be listed.
4. **Strict Shape & Size Limits**: Unknown shadow fields are rejected (`hasAll` + `hasOnly`), strings are length-bounded, `rating` is an integer between `0` and `100`, `coverUrl` must use `https://`, and array lengths are capped (`favoriteSongs <= 20`, `tracklist <= 100`, `genres <= 10`).
5. **Server Timestamp Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on updates.
6. **PII Isolation**: Zero personally identifiable fields (`email`, `phone`, `address`) are stored inside `/albums/{albumId}`.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Create**: Unauthenticated user tries to create `/albums/alb1` -> `PERMISSION_DENIED`.
2. **Non-Owner Create**: Authenticated user `other@example.com` tries to create `/albums/alb1` -> `PERMISSION_DENIED`.
3. **Unverified Email Spoof**: User with email `ngoaddis06@gmail.com` and `email_verified: false` tries to create `/albums/alb1` -> `PERMISSION_DENIED`.
4. **Owner UID Spoofing**: Verified owner creates `/albums/alb1` with `ownerUid: "someone-else"` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection**: Verified owner creates `/albums/alb1` with an extra field `{ isFeatured: true }` -> `PERMISSION_DENIED`.
6. **Rating Out of Bounds**: Verified owner writes `rating: 101` or `rating: -1` or `rating: "95"` -> `PERMISSION_DENIED`.
7. **XSS / Unsafe Cover URL**: Verified owner writes `coverUrl: "javascript:alert(1)"` or `"http://insecure.example/a.jpg"` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Verified owner creates `/albums/bad$id..` with invalid characters -> `PERMISSION_DENIED`.
9. **Array Exhaustion**: Verified owner writes 21 items in `favoriteSongs` -> `PERMISSION_DENIED`.
10. **Client Timestamp Forgery**: Verified owner creates `/albums/alb1` with a forged past `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
11. **Immutable Field Tampering**: Verified owner updates `/albums/alb1` attempting to mutate `createdAt` or `ownerUid` -> `PERMISSION_DENIED`.
12. **Unfiltered / Private List Query**: Unauthenticated visitor runs an unfiltered `collection('albums')` query without `where('isPublic', '==', true)` -> `PERMISSION_DENIED`.
