<template>
  <div class="skills-page">
    <div class="skills-layout">
      <!-- 左侧列表：基于文件路径的动态目录树 -->
      <div class="skills-list">
        <div
          v-for="item in flatItems"
          :key="item.key"
          class="tree-item"
          :class="[item.type, item.cli, { active: item.type === 'skill' && selectedSkill?.id === item.skill?.id }]"
          :style="{ paddingLeft: (item.depth * 14 + 10) + 'px' }"
          @click="item.type === 'skill' ? (selectedSkill = item.skill) : toggleNode(item.key)"
        >
          <span v-if="item.type !== 'skill'" class="tree-caret">{{ collapsed[item.key] ? '▸' : '▾' }}</span>
          <span class="tree-item-name">{{ item.name }}</span>
          <span v-if="item.count != null" class="tree-count">{{ item.count }}</span>
          <span v-if="item.type === 'skill' && item.skill" class="skill-tag" :class="item.skill.isBuiltin ? 'builtin' : 'custom'">
            {{ item.skill.isBuiltin ? $t('skill.builtin') : $t('skill.custom') }}
          </span>
        </div>
        <div v-if="!skillsStore.skills.length" class="empty-list">{{ $t('skill.noSkills') }}</div>
      </div>

      <!-- 右侧详情 -->
      <div class="skill-detail" v-if="selectedSkill">
        <div class="detail-header">
          <h3>{{ selectedSkill.name }}</h3>
          <div class="detail-actions">
            <button v-if="!selectedSkill.isBuiltin" class="btn btn-sm btn-danger" @click="handleDelete">{{ $t('skill.delete') }}</button>
          </div>
        </div>

        <div class="detail-section">
          <label>{{ $t('skill.slug') }}</label>
          <span>{{ selectedSkill.slug }}</span>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.sourceCli') }}</label>
          <span>{{ selectedSkill.sourceCli }}</span>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.skillFile') }}</label>
          <span class="path-text">{{ selectedSkill.filePath }}</span>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.description') }}</label>
          <span>{{ selectedSkill.description }}</span>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.compatibleCli') }}</label>
          <span>{{ selectedSkill.compatibleCli.join(', ') }}</span>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.category') }}</label>
          <span>{{ selectedSkill.category }}</span>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.input') }}</label>
          <div class="fields-table">
            <div v-for="f in selectedSkill.inputSchema.fields" :key="f.name" class="field-row">
              <span class="field-name">{{ f.name }}</span>
              <span class="field-type">{{ f.type }}</span>
              <span class="field-badge" :class="f.required ? 'required' : 'optional'">
                {{ f.required ? $t('skill.required') : $t('skill.optional') }}
              </span>
              <span class="field-desc-text">{{ f.description }}</span>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.prompt') }}</label>
          <pre class="prompt-block">{{ selectedSkill.prompt }}</pre>
        </div>
        <div class="detail-section">
          <label>{{ $t('skill.output') }}</label>
          <span>{{ selectedSkill.outputSchema.format }}</span>
        </div>

      </div>
      <div v-else class="skill-detail empty-detail">
        <span>{{ $t('skill.noSkills') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillsStore } from '@/stores/skills'
import { useToast } from '@/composables/useToast'
import type { Skill } from '@/api/skill'

const { t } = useI18n()
const skillsStore = useSkillsStore()
const toast = useToast()

const selectedSkill = ref<Skill | undefined>()
const collapsed = reactive<Record<string, boolean>>({})

// 从 filePath 提取 skills/ 之后的目录段（去掉 SKILL.md）
function getPathSegments(filePath: string): string[] {
  const p = filePath.replace(/\\/g, '/')
  const idx = p.lastIndexOf('/skills/')
  if (idx === -1) return []
  return p.substring(idx + 8).split('/').filter(Boolean).slice(0, -1)
}

// 判断目录名和技能名是否相似（用于折叠单技能目录）
function isSimilar(dirName: string, skillName: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[-_\s.]/g, '')
  const a = norm(dirName), b = norm(skillName)
  return a === b || b.includes(a) || a.includes(b)
}

interface DirNode {
  children: Map<string, DirNode>
  skills: Skill[]
}

function countAll(node: DirNode): number {
  let n = node.skills.length
  for (const c of node.children.values()) n += countAll(c)
  return n
}

interface FlatItem {
  depth: number
  type: 'cli' | 'dir' | 'skill'
  name: string
  key: string
  skill?: Skill
  count?: number
  cli?: string
}

// 基于文件路径动态构建扁平化树列表
const flatItems = computed<FlatItem[]>(() => {
  const items: FlatItem[] = []
  const byCli = new Map<string, Skill[]>()
  for (const s of skillsStore.skills) {
    const cli = s.sourceCli || 'claude'
    if (!byCli.has(cli)) byCli.set(cli, [])
    byCli.get(cli)!.push(s)
  }

  for (const cli of ['claude', 'codex']) {
    const skills = byCli.get(cli)
    if (!skills?.length) continue
    items.push({ depth: 0, type: 'cli', name: cli === 'claude' ? 'Claude' : 'Codex', key: cli, count: skills.length, cli })
    if (collapsed[cli]) continue

    // 构建目录树
    const root: DirNode = { children: new Map(), skills: [] }
    for (const s of skills) {
      const segs = getPathSegments(s.filePath)
      // 最后一段是技能自身目录，前面的是分组目录
      const groupSegs = segs.length > 1 ? segs.slice(0, -1) : []
      let node = root
      for (const seg of groupSegs) {
        if (!node.children.has(seg)) node.children.set(seg, { children: new Map(), skills: [] })
        node = node.children.get(seg)!
      }
      node.skills.push(s)
    }

    // 递归扁平化
    const walk = (node: DirNode, depth: number, parentKey: string) => {
      const dirs = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      for (const [name, child] of dirs) {
        const key = parentKey + '/' + name
        // 单技能目录且名称相似 → 直接显示为技能叶子
        if (child.children.size === 0 && child.skills.length === 1 && isSimilar(name, child.skills[0].name)) {
          items.push({ depth, type: 'skill', name: child.skills[0].name, key: 'sk:' + child.skills[0].id, skill: child.skills[0] })
          continue
        }
        items.push({ depth, type: 'dir', name, key, count: countAll(child) })
        if (!collapsed[key]) walk(child, depth + 1, key)
      }
      for (const s of node.skills) {
        items.push({ depth, type: 'skill', name: s.name, key: 'sk:' + s.id, skill: s })
      }
    }
    walk(root, 1, cli)
  }
  return items
})

function toggleNode(key: string) {
  collapsed[key] = !collapsed[key]
}

async function handleDelete() {
  if (!selectedSkill.value) return
  if (!confirm(t('skill.confirmDelete'))) return
  try {
    await skillsStore.deleteSkill(selectedSkill.value.id)
    selectedSkill.value = undefined
    toast.success(t('toast.skillDeleted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

onMounted(async () => {
  await skillsStore.fetchSkills()
  if (skillsStore.skills.length) selectedSkill.value = skillsStore.skills[0]
})
</script>

<style scoped lang="scss">
.skills-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.skills-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.skills-list {
  width: 260px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: var(--font-size-xs);
  user-select: none;
  transition: background var(--transition-fast);
  &:hover { background: var(--bg-hover); }

  &.cli {
    font-weight: 700;
    font-size: var(--font-size-sm);
    padding: 8px 10px;
    margin-top: 2px;
    background: rgba(108, 158, 255, 0.03);
    border-bottom: 1px solid var(--border-color);
    border-left: 3px solid transparent;
    &.claude { border-left-color: var(--accent-primary); }
    &.codex { border-left-color: var(--accent-secondary); }
    &:first-child { margin-top: 0; }
  }

  &.dir {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 11px;
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

.tree-caret {
  width: 14px;
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color var(--transition-fast);
  .tree-item:hover > & { color: var(--text-primary); }
}

.tree-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  font-size: 9px;
  color: var(--text-muted);
  font-weight: 500;
  background: var(--bg-tertiary);
  min-width: 18px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.skill-tag {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 6px;
  flex-shrink: 0;
  line-height: 14px;
  &.builtin { color: var(--accent-primary); background: rgba(108, 158, 255, 0.1); }
  &.custom { color: var(--accent-secondary); background: rgba(124, 77, 255, 0.1); }
}

.skill-detail {
  flex: 1;
  padding: var(--spacing-lg);
  overflow-y: auto;
  &.empty-detail {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  h3 { margin: 0; }
}

.detail-actions { display: flex; gap: var(--spacing-sm); }

.detail-section {
  margin-bottom: var(--spacing-md);
  label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  span { font-size: var(--font-size-sm); }
}

.path-text {
  word-break: break-all;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.fields-table { display: flex; flex-direction: column; gap: 4px; }

.field-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-xs);
  padding: 4px 0;
}

.field-name { font-weight: 600; min-width: 80px; }
.field-type { color: var(--text-muted); min-width: 50px; }

.field-badge {
  font-size: var(--font-size-xs);
  padding: 0 4px;
  border-radius: var(--radius-sm);
  &.required { color: var(--status-error); }
  &.optional { color: var(--text-muted); }
}

.field-desc-text { color: var(--text-muted); }

.prompt-block {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-sm);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.divider {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: var(--spacing-lg) 0;
}

h4 { margin: 0 0 var(--spacing-md) 0; font-size: var(--font-size-sm); color: var(--text-secondary); }

.empty-list {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-xl);
}

// btn, btn-sm, btn-primary, btn-danger 已在 global.scss 中定义
</style>
