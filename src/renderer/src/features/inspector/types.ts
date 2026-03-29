export type InspectorTab = 'changes' | 'files' | 'history'
export type InspectorViewerMode = 'empty' | 'diff' | 'markdown' | 'text' | 'binary' | 'too_large'

export interface InspectorProjectOption {
  key: string
  projectPath: string
  projectName: string
  source: 'active' | 'running'
}
