import { ipcMain } from 'electron'
import { WorkspaceLayoutManager, type WorkspaceLayoutState } from '../services/workspace-layout-manager'

export function registerWorkspaceHandlers(workspaceLayoutManager: WorkspaceLayoutManager): void {
  ipcMain.handle('workspace:getLayout', () => {
    return workspaceLayoutManager.getLayout()
  })

  ipcMain.handle('workspace:updateLayout', (_event, nextLayout: WorkspaceLayoutState) => {
    return workspaceLayoutManager.updateLayout(nextLayout)
  })

  ipcMain.handle('workspace:resetLayout', () => {
    return workspaceLayoutManager.resetLayout()
  })
}
