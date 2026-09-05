import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import i18n from './i18n'
import { setupGlobalErrorHandler } from './composables/useErrorHandler'
import './assets/styles/index.scss'

const app = createApp(App)

app.use(router)
app.use(pinia)
app.use(i18n)

setupGlobalErrorHandler(app)

// UX-7：挂载前先按已保存设置校正语言，避免中文用户首帧闪英文。
// settings:read 失败（老版本/测试环境）保持默认 en，与原行为一致。
try {
  void window.electronAPI
    .invoke('settings:read')
    .then((data) => {
      const lang = (data as { language?: string } | null)?.language
      if (lang === 'zh-CN' || lang === 'en') {
        i18n.global.locale.value = lang
      }
    })
    .catch(() => undefined)
} catch {
  // electronAPI 不存在（测试注入环境）：跳过
}

app.mount('#app')

// Expose for e2e tests
;(window as any).__vue_app__ = app
;(window as any).__pinia__ = pinia
;(window as any).__e2e_ipc_log__ = [] as string[]

// contextBridge 暴露的 electronAPI 是只读且不可配置的，
// 不能直接赋值或用 Proxy 替换，因此 IPC 日志通过 ipc 层的包装实现
;(window as any).__e2e_inject__ = (storeName: string, key: string, jsonStr: string) => {
  const store = (pinia as any)._s?.get(storeName)
  if (!store) return -2
  const data = JSON.parse(jsonStr)
  const fetchMap: Record<string, string> = {
    projects: 'fetchProjects',
    skills: 'fetchSkills',
    sessions: 'fetchSessions',
    teams: 'fetchTeams'
  }
  const fetchFn = fetchMap[storeName]
  if (fetchFn && store[fetchFn]) store[fetchFn] = async () => {}
  store[key] = data
  return store[key]?.length ?? -1
}
