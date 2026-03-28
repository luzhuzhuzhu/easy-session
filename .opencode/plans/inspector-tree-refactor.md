# Inspector Tree Components Refactor Plan

> Created: 2026-03-28
> Status: Pending Implementation

## Problem Summary

The tree components in InspectorPanel have significant issues with layout, display logic, and styling that affect readability and usability.

### Identified Issues

#### 1. Layout Problems
| Issue | File | Details |
|-------|------|---------|
| Grid column misalignment | GitChangesTree | Directory: `16px 16px 1fr` vs File: `16px 16px 1fr auto` causes content shift |
| Inconsistent indentation | Multiple | GitChangesTree uses `12+depth*14`, SkillsView uses `10+depth*14` |
| Status code oversized | GitChangesTree | 16px fixed width + 8px gap visually bloated |
| Action buttons abrupt | GitChangesTree | opacity 0→1 no transition, sudden appearance on hover |

#### 2. Display Logic Problems
| Issue | File | Details |
|-------|------|---------|
| No virtualization | All | Performance issues with large datasets |
| Inconsistent collapse state | Various | GitChangesTree internal reactive, ProjectFilesTree from props |
| Deep recursion risk | GitChangesTree | `flattenTree` uses spread recursion without depth limit |
| No search/filter | All | Cannot quickly locate files in large projects |

#### 3. Styling Problems
| Issue | File | Details |
|-------|------|---------|
| Text characters as icons | All | `>` `v` `.` instead of SVG icons, visually crude |
| No file type icons | ProjectFilesTree | All files display identically |
| Directory/file confusion | All | Only fontWeight distinguishes, insufficient |
| Inconsistent hover/active | All | Color/background mix ratios vary |
| Duplicate `.tree-message` | 3 files | Same style written 3 times |
| No ARIA attributes | All | Missing `role="tree"`, `aria-expanded` etc |

---

## Implementation Plan

### Strategy
Create shared base components, unify styles and logic, then refactor three tree components with virtualization support.

---

## Phase 1: Create Shared Infrastructure

### 1.1 Create `TreeIcon.vue` - SVG Icon Component
```
src/renderer/src/components/tree/TreeIcon.vue
```
Features:
- Provide `caret-expanded`, `caret-collapsed`, `directory`, `file`, `file-*` (by extension) icons
- Support size and color props

### 1.2 Create `tree-styles.scss` - Shared Styles Module
```
src/renderer/src/styles/tree-styles.scss
```
Unified indent constants and base tree styles.

### 1.3 Create `useTreeCollapse.ts` - Collapse State Composable
```
src/renderer/src/composables/useTreeCollapse.ts
```
Unified collapse state management with optional localStorage persistence.

---

## Phase 2: Create Virtualization Base Component

### 2.1 Create `VirtualTree.vue` - Virtualized Tree Container
```
src/renderer/src/components/tree/VirtualTree.vue
```
Use `vue-virtual-scroller` or custom implementation.

---

## Phase 3: Refactor GitChangesTree
- Unify Grid template
- Replace text caret with SVG
- Use shared composable
- Add virtualization (threshold: 50)
- Smooth action button transitions

## Phase 4: Refactor ProjectFilesTree
- Unify Grid template
- Replace text caret with SVG
- Add file type icons
- Use shared composable
- Add virtualization (threshold: 100)

## Phase 5: Refactor GitHistoryTree
- Optimize graph width calculation
- Improve ref badge display
- Add virtualization (threshold: 50)

## Phase 6: Update InspectorPanel
- Integrate new components
- Ensure compact mode compatibility

---

## File Change List

| Action | File Path |
|--------|-----------|
| Create | `src/renderer/src/components/tree/TreeIcon.vue` |
| Create | `src/renderer/src/composables/useTreeCollapse.ts` |
| Create | `src/renderer/src/styles/tree-styles.scss` |
| Create | `src/renderer/src/components/tree/VirtualTree.vue` |
| Refactor | `src/renderer/src/components/GitChangesTree.vue` |
| Refactor | `src/renderer/src/components/ProjectFilesTree.vue` |
| Refactor | `src/renderer/src/components/GitHistoryTree.vue` |
| Update | `src/renderer/src/components/InspectorPanel.vue` |

---

## Dependency Addition

```bash
npm install vue-virtual-scroller
```

---

## Estimated Effort
- Phase 1-2: Shared infrastructure (~1 hour)
- Phase 3-5: Refactor components (~2-3 hours)
- Phase 6: Integration (~30 minutes)

---

## Acceptance Criteria

1. All tree items align properly with consistent indentation
2. Caret indicators use SVG icons instead of text characters
3. Directory and file items visually distinct
4. Virtualization activates for large datasets (>50 items)
5. No duplicate style definitions
6. Collapse state management unified
7. Smooth transitions for hover/active states
8. TypeScript compiles without errors