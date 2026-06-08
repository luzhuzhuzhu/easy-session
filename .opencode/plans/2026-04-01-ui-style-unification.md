# UI Style Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all page styles to match the SessionsView design system - square corners, SVG icon buttons, compact layout, flat borders.

**Architecture:** Apply the existing sessions.scss design patterns to all other pages, converting rounded corners to square, text buttons to SVG icon buttons, and standardizing toolbar layouts.

**Tech Stack:** Vue 3, SCSS, CSS Variables

---

## File Structure

### Files to Modify:
- `src/renderer/src/assets/styles/global.scss` - Global button/input/card styles
- `src/renderer/src/views/ProjectsView.vue` - Project management page
- `src/renderer/src/views/DashboardView.vue` - Dashboard page
- `src/renderer/src/views/SettingsView.vue` - Settings page
- `src/renderer/src/views/ProjectDetailView.vue` - Project detail page
- `src/renderer/src/views/ConfigView.vue` - Config editor page
- `src/renderer/src/views/SkillsView.vue` - Skills page
- `src/renderer/src/components/settings/*.vue` - Settings section components

### Design Reference:
- `src/renderer/src/assets/styles/sessions.scss` - Core design system (square corners, icon buttons)
- `src/renderer/src/components/SessionTopList.vue` - Icon button patterns
- `src/renderer/src/components/SessionSidebarControls.vue` - Toolbar patterns

---

## Task 1: Update Global Styles for Square Corners

**Files:**
- Modify: `src/renderer/src/assets/styles/global.scss`

- [ ] **Step 1: Modify button base styles to square corners**

Find the `.btn` class and change border-radius to 0:

```scss
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: 0;  // Changed from var(--radius-md)
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  user-select: none;

  &:hover { background: var(--bg-hover); }
  &:active { transform: scale(0.97); }
  &:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
}
```

- [ ] **Step 2: Modify btn-sm to match session styles**

```scss
.btn-sm {
  padding: 4px 12px;
  font-size: var(--font-size-xs);
  min-height: 24px;
}
```

- [ ] **Step 3: Modify dialog and context menu to square corners**

Find `.dialog` and `.context-menu` classes:

```scss
.dialog {
  width: min(92vw, 420px);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;  // Changed from var(--radius-lg)
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-lg);
  animation: dialogIn 0.15s ease;
  // ... rest unchanged
}

.context-menu {
  position: fixed;
  z-index: 200;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;  // Changed from var(--radius-md)
  box-shadow: var(--shadow-md);
  min-width: 120px;
  padding: var(--spacing-xs) 0;
  animation: menuIn 0.1s ease;
}
```

- [ ] **Step 4: Modify form input styles to square corners**

```scss
.form-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;  // Changed from var(--radius-sm)
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast);

  &:focus { border-color: var(--accent-primary); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
```

- [ ] **Step 5: Modify filter-select to square corners**

```scss
.filter-select {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;  // Changed from var(--radius-sm)
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  transition: border-color var(--transition-fast);

  &:focus { border-color: var(--accent-primary); }
}
```

- [ ] **Step 6: Modify type-badge to square corners**

```scss
.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 0;  // Changed from var(--radius-sm)
  font-size: var(--font-size-xs);
  font-weight: 700;
  flex-shrink: 0;

  &.claude { background: rgba(108, 158, 255, 0.15); color: var(--accent-primary); }
  &.codex { background: rgba(124, 77, 255, 0.15); color: var(--accent-secondary); }
  &.opencode { background: rgba(96, 165, 250, 0.18); color: var(--status-info); }
  &.lg { width: 32px; height: 32px; font-size: var(--font-size-md); }
  &.sm { width: auto; height: auto; padding: 2px 8px; font-weight: 500; }
}
```

- [ ] **Step 7: Commit global style changes**

```bash
git add src/renderer/src/assets/styles/global.scss
git commit -m "style: unify global styles to square corners matching sessions design"
```

---

## Task 2: Add Icon Button Component to Global Styles

**Files:**
- Modify: `src/renderer/src/assets/styles/global.scss`

- [ ] **Step 1: Add icon button styles to global.scss**

Append to the end of global.scss:

```scss
// ========== Icon Buttons (Sessions Style) ==========
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-light);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
}

.icon-btn-primary {
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-primary) 20%, var(--border-color));
}

.icon-btn-sm {
  width: 24px;
  height: 24px;

  svg {
    width: 12px;
    height: 12px;
  }
}

.icon-btn-lg {
  width: 32px;
  height: 32px;

  svg {
    width: 15px;
    height: 15px;
  }
}
```

- [ ] **Step 2: Commit icon button styles**

```bash
git add src/renderer/src/assets/styles/global.scss
git commit -m "style: add icon button component styles to global stylesheet"
```

---

## Task 3: Update ProjectsView Styles

**Files:**
- Modify: `src/renderer/src/views/ProjectsView.vue`

- [ ] **Step 1: Update page container to remove padding and use flex layout**

Find `.projects-page` and modify:

```scss
.projects-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 2: Update toolbar to compact icon style**

Find `.toolbar` and modify:

```scss
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
```

- [ ] **Step 3: Update search-input to square corners**

```scss
.search-input {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  font-size: var(--font-size-xs);
  outline: none;
  transition: border-color var(--transition-fast);
  min-width: 0;

  &:focus {
    border-color: var(--accent-primary);
  }
}
```

- [ ] **Step 4: Update sort-select to square compact style**

```scss
.sort-select {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  min-width: 100px;
}
```

- [ ] **Step 5: Update project-grid to remove padding**

```scss
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
```

- [ ] **Step 6: Update project-card to square flat style**

```scss
.project-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--border-light);

    .card-actions {
      opacity: 1;
    }
  }
}
```

- [ ] **Step 7: Update card-actions icon buttons**

```scss
.card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.danger:hover {
    background: rgba(248, 113, 113, 0.15);
    color: var(--status-error);
  }
}
```

- [ ] **Step 8: Update card-instance-badge to square**

```scss
.card-instance-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 0;
  background: rgba(96, 165, 250, 0.12);
  color: var(--accent-primary);
  font-size: var(--font-size-xs);

  &.local {
    background: rgba(148, 163, 184, 0.14);
    color: var(--text-secondary);
  }
}
```

- [ ] **Step 9: Update card-status-badge to square**

```scss
.card-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 0;
  font-size: var(--font-size-xs);
  background: var(--bg-tertiary);
  color: var(--text-muted);

  &.status-online {
    color: var(--status-success);
    background: rgba(52, 211, 153, 0.12);
  }

  &.status-offline,
  &.status-error {
    color: var(--status-error);
    background: rgba(248, 113, 113, 0.12);
  }
}
```

- [ ] **Step 10: Update empty-state styles**

```scss
.empty-state {
  text-align: center;
  padding: var(--spacing-xl) 0;
  color: var(--text-muted);
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 11: Commit ProjectsView changes**

```bash
git add src/renderer/src/views/ProjectsView.vue
git commit -m "style: unify ProjectsView to square corner design"
```

---

## Task 4: Update ProjectsView Template - Convert Text Buttons to Icons

**Files:**
- Modify: `src/renderer/src/views/ProjectsView.vue`

- [ ] **Step 1: Replace toolbar text button with SVG icon button**

Find the toolbar section in template and replace:

```vue
<div class="toolbar">
  <button class="icon-btn icon-btn-primary icon-btn-lg" :title="$t('project.add')" @click="handleAddProject">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  </button>
  <select v-model="createTargetInstanceId" class="sort-select" :title="$t('project.createTarget')">
    <option
      v-for="option in createTargetOptions"
      :key="option.value"
      :value="option.value"
    >
      {{ option.label }}
    </option>
  </select>
  <input
    v-model="searchQuery"
    class="search-input"
    type="text"
    :placeholder="$t('project.search')"
  />
  <select v-model="instanceFilter" class="sort-select">
    <option value="all">{{ $t('project.instanceAll') }}</option>
    <option
      v-for="option in instanceFilterOptions"
      :key="option.value"
      :value="option.value"
    >
      {{ option.label }}
    </option>
  </select>
  <select v-model="sortBy" class="sort-select">
    <option value="name">{{ $t('project.sortName') }}</option>
    <option value="recent">{{ $t('project.sortRecent') }}</option>
    <option value="created">{{ $t('project.sortCreated') }}</option>
  </select>
</div>
```

- [ ] **Step 2: Replace card action buttons with SVG icon buttons**

Find the `.card-actions` section and replace:

```vue
<div class="card-actions" @click.stop>
  <button class="icon-btn" :title="$t('project.settings')" @click="openProjectDetail(project)">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  </button>
  <button
    v-if="canCreateSession(project)"
    class="icon-btn icon-btn-primary"
    :title="$t('projectDetail.newSession')"
    @click="openCreateSessionDialog(project)"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  </button>
  <button
    v-if="canRenameProject(project)"
    class="icon-btn"
    :title="$t('project.rename')"
    @click="handleRename(project)"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.5 2.5l2 2M3 11v2h2l7-7-2-2-7 7z" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  </button>
  <button
    v-if="canOpenInExplorer(project)"
    class="icon-btn"
    :title="$t('project.openInExplorer')"
    @click="openInExplorer(project.path)"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4h5l1 1h6v8H2V4z" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  </button>
  <button
    v-if="canRemoveProject(project)"
    class="icon-btn danger"
    :title="$t('project.remove')"
    @click="handleRemove(project)"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  </button>
</div>
```

- [ ] **Step 3: Update empty state button**

```vue
<button class="icon-btn icon-btn-primary icon-btn-lg" :title="$t('project.add')" @click="handleAddProject">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </svg>
</button>
```

- [ ] **Step 4: Commit template changes**

```bash
git add src/renderer/src/views/ProjectsView.vue
git commit -m "style: convert ProjectsView buttons to SVG icons"
```

---

## Task 5: Update DashboardView Styles

**Files:**
- Modify: `src/renderer/src/views/DashboardView.vue`

- [ ] **Step 1: Update page container to flex layout**

```scss
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 2: Update welcome section**

```scss
.welcome {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
  
  h1 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--spacing-xs);
    letter-spacing: -0.3px;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
}
```

- [ ] **Step 3: Update cards container to flex**

```scss
.cards {
  display: flex;
  gap: 8px;
  padding: 8px;
  flex-shrink: 0;
  overflow-x: auto;
}
```

- [ ] **Step 4: Update card to square flat style**

```scss
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  transition: all var(--transition-fast);
  flex: 1;
  min-width: 200px;

  &:hover {
    border-color: var(--border-light);
  }

  h3 {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-bottom: var(--spacing-xs);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }
}
```

- [ ] **Step 5: Update cli-detail code blocks**

```scss
.cli-detail {
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);

  .label {
    color: var(--text-muted);
    margin-right: var(--spacing-xs);
  }

  code {
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--bg-tertiary);
    padding: 2px 4px;
    border-radius: 0;
  }

  div + div { margin-top: 4px; }
}
```

- [ ] **Step 6: Update stat card**

```scss
.stat {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--accent-primary);
}
```

- [ ] **Step 7: Update recent-projects to flex scrollable**

```scss
.recent-projects {
  padding: var(--spacing-sm);
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);

  h3 {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-xs);
  }
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

- [ ] **Step 8: Update recent-item to square**

```scss
.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
  }
}
```

- [ ] **Step 9: Update quick-actions to icon buttons**

```scss
.quick-actions {
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;

  h3 {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-xs);
  }
}

.actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  &:active { transform: scale(0.97); }
}

.action-btn-small {
  padding: 4px 8px;
}
```

- [ ] **Step 10: Update config-merged section**

```scss
.config-merged {
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.config-merged-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-xs);

  h3 {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }
}
```

- [ ] **Step 11: Commit DashboardView changes**

```bash
git add src/renderer/src/views/DashboardView.vue
git commit -m "style: unify DashboardView to square corner design"
```

---

## Task 6: Update DashboardView Template - Convert Buttons

**Files:**
- Modify: `src/renderer/src/views/DashboardView.vue`

- [ ] **Step 1: Update quick actions buttons**

Find `.quick-actions` section and replace:

```vue
<div class="quick-actions">
  <h3>{{ $t('dashboard.quickActions') }}</h3>
  <div class="actions">
    <button class="action-btn" @click="handleNewProject">
      <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
        <path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
      </svg>
      {{ $t('dashboard.newProject') }}
    </button>
    <button class="action-btn" @click="$router.push('/sessions')">
      <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
        <rect x="4" y="4" width="8" height="8" rx="0" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
      {{ $t('dashboard.newSession') }}
    </button>
    <button class="action-btn" @click="openConfigPanel">
      <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
        <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
      {{ $t('dashboard.openConfig') }}
    </button>
  </div>
</div>
```

- [ ] **Step 2: Update config toggle button**

```vue
<button class="action-btn action-btn-small" @click="toggleConfigPanel">
  <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
    <path v-if="configPanelOpen" d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
    <path v-else d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
  </svg>
  {{ $t(configPanelOpen ? 'dashboard.hideConfig' : 'dashboard.showConfig') }}
</button>
```

- [ ] **Step 3: Commit template changes**

```bash
git add src/renderer/src/views/DashboardView.vue
git commit -m "style: convert DashboardView buttons to icon style"
```

---

## Task 7: Update SettingsView Styles

**Files:**
- Modify: `src/renderer/src/views/SettingsView.vue`

- [ ] **Step 1: Update page container to flex layout**

```scss
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  h1 {
    font-size: var(--font-size-lg);
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    margin: 0;
    flex-shrink: 0;
  }
}
```

- [ ] **Step 2: Add scrollable content wrapper**

Add after h1 in styles:

```scss
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}
```

- [ ] **Step 3: Update settings-section to square**

```scss
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);

  h2 {
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-xs);
    color: var(--text-secondary);
  }
}
```

- [ ] **Step 4: Update setting-row to compact**

```scss
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 8px 0;

  & + .setting-row {
    border-top: 1px solid rgba(45, 53, 72, 0.5);
  }

  label {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }

  select,
  input {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 0;
    padding: 4px 8px;
    font-size: var(--font-size-xs);
    min-width: 160px;

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  input[type='checkbox'] {
    width: 16px;
    min-width: auto;
    height: 16px;
    padding: 0;
    accent-color: var(--accent-primary);
  }
}
```

- [ ] **Step 5: Update toggle-btn to square icon style**

```scss
.toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
}
```

- [ ] **Step 6: Update section-head to compact**

```scss
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}
```

- [ ] **Step 7: Update remote-form-panel to square**

```scss
.remote-form-panel {
  background: linear-gradient(180deg, rgba(108, 158, 255, 0.06), rgba(108, 158, 255, 0.02));
  border: 1px solid rgba(108, 158, 255, 0.18);
  border-radius: 0;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}
```

- [ ] **Step 8: Update field-block to square inputs**

```scss
.field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  input,
  select {
    width: 100%;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 0;
    padding: 6px 8px;
    font-size: var(--font-size-xs);

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }
  }
}
```

- [ ] **Step 9: Update remote-instance-card to square**

```scss
.remote-instance-card {
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-primary);
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
```

- [ ] **Step 10: Update status-badge to square**

```scss
.status-badge,
.mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 0;
  font-size: 10px;
  border: 1px solid transparent;
}
```

- [ ] **Step 11: Update meta-item to square**

```scss
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: 0;
}
```

- [ ] **Step 12: Update about-grid items to square**

```scss
.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-xs);
  background: var(--bg-primary);
  border-radius: 0;
}
```

- [ ] **Step 13: Commit SettingsView changes**

```bash
git add src/renderer/src/views/SettingsView.vue
git commit -m "style: unify SettingsView to square corner design"
```

---

## Task 8: Update Settings Section Components

**Files:**
- Modify: `src/renderer/src/components/settings/GeneralPreferencesSettingsSection.vue`
- Modify: `src/renderer/src/components/settings/AboutSettingsSection.vue`

- [ ] **Step 1: Update GeneralPreferencesSettingsSection styles**

Replace the entire `<style>` section:

```scss
<style scoped lang="scss">
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);

  h2 {
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-xs);
    color: var(--text-secondary);
  }
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 8px 0;

  & + .setting-row {
    border-top: 1px solid rgba(45, 53, 72, 0.5);
  }

  label {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }

  select,
  input {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 0;
    padding: 4px 8px;
    font-size: var(--font-size-xs);
    min-width: 160px;

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  input[type='checkbox'] {
    width: 16px;
    min-width: auto;
    height: 16px;
    padding: 0;
    accent-color: var(--accent-primary);
  }
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
}

@media (max-width: 960px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
```

- [ ] **Step 2: Update AboutSettingsSection styles**

Replace the entire `<style>` section:

```scss
<style scoped lang="scss">
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);

  h2 {
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-xs);
    color: var(--text-secondary);
  }
}

.about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-xs);
}

.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-xs);
  background: var(--bg-primary);
  border-radius: 0;
}

.about-label {
  font-size: 10px;
  color: var(--text-muted);
}

.about-value {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  word-break: break-word;
}

@media (max-width: 960px) {
  .about-grid {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 3: Commit settings components changes**

```bash
git add src/renderer/src/components/settings/GeneralPreferencesSettingsSection.vue
git add src/renderer/src/components/settings/AboutSettingsSection.vue
git commit -m "style: unify settings section components to square corner design"
```

---

## Task 9: Update ProjectDetailView Styles

**Files:**
- Modify: `src/renderer/src/views/ProjectDetailView.vue`

- [ ] **Step 1: Update page container to flex layout**

```scss
.project-detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 2: Add scrollable content wrapper**

```scss
.project-detail-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}
```

- [ ] **Step 3: Update breadcrumb to compact**

```scss
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}
```

- [ ] **Step 4: Update overview-section to compact**

```scss
.overview-section {
  margin-bottom: var(--spacing-sm);
}

.overview-header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}
```

- [ ] **Step 5: Update name-input to square**

```scss
.name-input {
  font-size: var(--font-size-md);
  font-weight: 600;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0;
  color: var(--text-primary);
  padding: 2px 6px;
  transition: border-color var(--transition-fast);

  &:hover { border-color: var(--border-color); }
  &:focus { border-color: var(--accent-primary); outline: none; }
}
```

- [ ] **Step 6: Update panel to square**

```scss
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  margin-bottom: var(--spacing-sm);
}
```

- [ ] **Step 7: Update panel-header to compact**

```scss
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  cursor: pointer;
  user-select: none;
  &:hover { background: var(--bg-hover); }
}

.panel-title { font-weight: 600; font-size: var(--font-size-sm); }

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}
```

- [ ] **Step 8: Update panel-toggle**

```scss
.panel-toggle {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
  font-size: 10px;
  &.open { transform: rotate(90deg); }
}
```

- [ ] **Step 9: Update session-card to square**

```scss
.session-card {
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-secondary);
}

.session-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs);
}
```

- [ ] **Step 10: Update session-actions buttons**

```scss
.session-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.session-actions .btn-sm {
  padding: 3px 8px;
  font-size: 10px;
  min-height: 20px;
}
```

- [ ] **Step 11: Update tabs to square**

```scss
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: var(--spacing-xs);
  border-bottom: 1px solid var(--border-color);
}

.tab {
  padding: 4px 10px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  bottom: -1px;

  &:hover { color: var(--text-primary); }
  &.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }
}
```

- [ ] **Step 12: Update setting-textarea to square**

```scss
.setting-textarea {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  resize: vertical;
  &:focus { border-color: var(--accent-primary); outline: none; }
}
```

- [ ] **Step 13: Update skill-card to square**

```scss
.skill-card {
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-secondary);
}
```

- [ ] **Step 14: Commit ProjectDetailView changes**

```bash
git add src/renderer/src/views/ProjectDetailView.vue
git commit -m "style: unify ProjectDetailView to square corner design"
```

---

## Task 10: Update ConfigView Styles

**Files:**
- Modify: `src/renderer/src/views/ConfigView.vue`

- [ ] **Step 1: Update page container to flex layout**

```scss
.config-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  h1 {
    font-size: var(--font-size-lg);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    margin: 0;
    flex-shrink: 0;
  }
}
```

- [ ] **Step 2: Update tabs to square compact**

```scss
.tabs {
  display: flex;
  gap: 0;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.tab {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover { 
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }
  &.active {
    color: var(--accent-primary);
    background: var(--bg-card);
    border-color: var(--border-color);
    border-bottom-color: var(--bg-card);
  }
}
```

- [ ] **Step 3: Update config-panel to square**

```scss
.config-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  margin: var(--spacing-sm);
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 4: Update file-path code to square**

```scss
.file-path {
  margin-bottom: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);

  .label { color: var(--text-muted); margin-right: var(--spacing-xs); }
  code {
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--bg-tertiary);
    padding: 2px 4px;
    border-radius: 0;
  }
}
```

- [ ] **Step 5: Update json-editor to square**

```scss
.json-editor {
  width: 100%;
  flex: 1;
  min-height: 200px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-xs);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  line-height: 1.5;
  resize: none;
  tab-size: 2;
  transition: border-color var(--transition-fast);

  &:focus { outline: none; border-color: var(--accent-primary); }
  &.modified { border-color: var(--status-warning); }
}
```

- [ ] **Step 6: Update actions to compact**

```scss
.actions {
  display: flex;
  gap: 6px;
  margin-top: var(--spacing-xs);
  flex-shrink: 0;
}
```

- [ ] **Step 7: Update message to square**

```scss
.message {
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: 0;

  &.success { color: var(--status-success); background: rgba(52, 211, 153, 0.1); }
  &.error { color: var(--status-error); background: rgba(248, 113, 113, 0.1); }
}
```

- [ ] **Step 8: Update status-bar**

```scss
.status-bar {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 10px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}
```

- [ ] **Step 9: Commit ConfigView changes**

```bash
git add src/renderer/src/views/ConfigView.vue
git commit -m "style: unify ConfigView to square corner design"
```

---

## Task 11: Update SkillsView Styles

**Files:**
- Modify: `src/renderer/src/views/SkillsView.vue`

- [ ] **Step 1: Update skills-page**

```scss
.skills-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 2: Update skills-layout**

```scss
.skills-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
```

- [ ] **Step 3: Update skills-list**

```scss
.skills-list {
  width: 240px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--bg-secondary);
}
```

- [ ] **Step 4: Update tree-item to square active state**

```scss
.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 10px;
  user-select: none;
  transition: background var(--transition-fast);
  &:hover { background: var(--bg-hover); }

  &.cli {
    font-weight: 700;
    font-size: var(--font-size-xs);
    padding: 6px 8px;
    margin-top: 2px;
    background: rgba(108, 158, 255, 0.03);
    border-bottom: 1px solid var(--border-color);
    border-left: 3px solid transparent;
    &.claude { border-left-color: var(--accent-primary); }
    &.codex { border-left-color: var(--accent-secondary); }
    &.opencode { border-left-color: var(--status-info); }
    &:first-child { margin-top: 0; }
  }

  &.dir {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 10px;
    letter-spacing: 0.02em;
  }

  &.skill {
    border-left: 2px solid transparent;
    &:hover { border-left-color: var(--border-color); }
    &.active {
      background: var(--bg-tertiary);
      border-left-color: var(--accent-primary);
      .tree-item-name { color: var(--accent-primary); }
    }
  }
}
```

- [ ] **Step 5: Update skill-tag to square**

```scss
.skill-tag {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 0;
  flex-shrink: 0;
  line-height: 12px;
  &.builtin { color: var(--accent-primary); background: rgba(108, 158, 255, 0.1); }
  &.custom { color: var(--accent-secondary); background: rgba(124, 77, 255, 0.1); }
}
```

- [ ] **Step 6: Update skill-detail to square**

```scss
.skill-detail {
  flex: 1;
  padding: var(--spacing-sm);
  overflow-y: auto;
  &.empty-detail {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
}
```

- [ ] **Step 7: Update detail-header to compact**

```scss
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
  h3 { margin: 0; font-size: var(--font-size-md); }
}
```

- [ ] **Step 8: Update detail-section to compact**

```scss
.detail-section {
  margin-bottom: var(--spacing-xs);
  label {
    display: block;
    font-size: 10px;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  span { font-size: var(--font-size-xs); }
}
```

- [ ] **Step 9: Update prompt-block to square**

```scss
.prompt-block {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-xs);
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
```

- [ ] **Step 10: Update field-badge to square**

```scss
.field-badge {
  font-size: 9px;
  padding: 0 4px;
  border-radius: 0;
  &.required { color: var(--status-error); }
  &.optional { color: var(--text-muted); }
}
```

- [ ] **Step 11: Commit SkillsView changes**

```bash
git add src/renderer/src/views/SkillsView.vue
git commit -m "style: unify SkillsView to square corner design"
```

---

## Task 12: Final Verification and Testing

- [ ] **Step 1: Run development server**

```bash
npm run dev
```

Verify visually:
- All buttons have square corners
- All inputs/selects have square corners
- All cards/panels have square corners
- Icon buttons display correctly
- Layouts are compact and consistent

- [ ] **Step 2: Check all pages**

Navigate to each page and verify:
- `/sessions` - Reference page (no changes needed)
- `/projects` - Square corners, icon buttons
- `/dashboard` - Square corners, icon buttons
- `/settings` - Square corners, compact layout
- `/projects/:id` - Square corners, icon buttons
- `/config` - Square corners, compact layout
- `/skills` - Square corners, consistent style

- [ ] **Step 3: Run linting**

```bash
npm run lint
```

Fix any linting errors if present.

- [ ] **Step 4: Create final commit**

```bash
git add -A
git commit -m "style: complete UI style unification across all pages"
```

---

## Summary

This plan transforms all pages to match the SessionsView design system:

1. **Global Styles** - Square corners for all buttons, inputs, cards, dialogs
2. **ProjectsView** - Icon buttons in toolbar, square cards
3. **DashboardView** - Compact layout, icon buttons
4. **SettingsView** - Square sections, compact form elements
5. **ProjectDetailView** - Square panels, icon buttons
6. **ConfigView** - Square editor, compact tabs
7. **SkillsView** - Consistent square styling