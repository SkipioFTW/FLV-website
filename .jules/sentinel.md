## 2025-05-15 - Auth Consolidation & Timing-Safe Comparison
**Vulnerability:** Duplicated authentication logic and non-constant-time comparisons for sensitive credentials/tokens.
**Learning:** Blanket replacement of API routes can introduce regressions in unrelated logic (e.g. database table names, data validation). Surgical patching is required when refactoring cross-cutting concerns.
**Prevention:** Use targeted merge diffs and verify all changes against the original source to ensure functional parity.
