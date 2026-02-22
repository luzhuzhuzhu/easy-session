import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listSkills as apiListSkills,
  createSkill as apiCreateSkill,
  deleteSkill as apiDeleteSkill,
  executeSkill as apiExecuteSkill,
  previewPrompt as apiPreviewPrompt,
  type Skill,
  type SkillFilter
} from '@/api/skill'

export type { Skill }

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  const loading = ref(false)

  const builtinSkills = computed(() => skills.value.filter((s) => s.isBuiltin))
  const customSkills = computed(() => skills.value.filter((s) => !s.isBuiltin))
  const categories = computed(() => [...new Set(skills.value.map((s) => s.category))])
  const skillsByCategory = computed(() => {
    const map: Record<string, Skill[]> = {}
    for (const s of skills.value) {
      if (!map[s.category]) map[s.category] = []
      map[s.category].push(s)
    }
    return map
  })

  async function fetchSkills(filter?: SkillFilter) {
    loading.value = true
    try {
      skills.value = await apiListSkills(filter)
    } finally {
      loading.value = false
    }
  }

  async function createSkill(skill: Omit<Skill, 'id' | 'isBuiltin' | 'sourceCli' | 'filePath'>) {
    const created = await apiCreateSkill(skill)
    skills.value.push(created)
    return created
  }

  async function deleteSkill(id: string) {
    const ok = await apiDeleteSkill(id)
    if (ok) skills.value = skills.value.filter((s) => s.id !== id)
    return ok
  }

  async function executeSkill(skillId: string, sessionId: string, inputs: Record<string, any>) {
    return apiExecuteSkill(skillId, sessionId, inputs)
  }

  async function previewPrompt(skillId: string, inputs: Record<string, any>) {
    return apiPreviewPrompt(skillId, inputs)
  }

  return {
    skills, loading, builtinSkills, customSkills, categories, skillsByCategory,
    fetchSkills, createSkill, deleteSkill, executeSkill, previewPrompt
  }
})
