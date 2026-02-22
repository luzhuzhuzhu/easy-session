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
