## 2025-02-26 - [Search Accessibility and Keyboard Navigation]
**Learning:** Standard search components often lack native keyboard support, making them inaccessible to power users and those relying on screen readers. Implementing the WAI-ARIA "combobox" pattern with `role="combobox"`, `role="listbox"`, and `aria-activedescendant` significantly improves the UX without adding heavy dependencies.
**Action:** Always include ArrowUp/Down and Enter key listeners in search-like components to ensure keyboard parity with mouse interactions.
