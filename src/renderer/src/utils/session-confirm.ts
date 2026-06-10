import { LOCAL_INSTANCE_ID, type UnifiedSession } from '@/models/unified-resource'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

function sessionTypeLabel(session: UnifiedSession, t: TranslateFn): string {
  const knownTypes = new Set(['claude', 'codex', 'opencode', 'terminal'])
  return knownTypes.has(session.type) ? t(`session.${session.type}`) : session.type
}

function sessionStatusLabel(session: UnifiedSession, t: TranslateFn): string {
  return t(`session.status.${session.status}`)
}

function sessionSourceLabel(session: UnifiedSession, t: TranslateFn): string {
  if (session.instanceId === LOCAL_INSTANCE_ID || session.source === 'local') {
    return t('session.instanceLocal')
  }
  return `${t('session.instanceRemote')} · ${session.instanceId}`
}

function buildSessionTargetDetails(session: UnifiedSession, t: TranslateFn): string {
  const name = session.name?.trim() || session.sessionId
  return t('session.confirmSessionTargetDetails', {
    name,
    type: sessionTypeLabel(session, t),
    source: sessionSourceLabel(session, t),
    status: sessionStatusLabel(session, t),
    project: session.projectPath || '-'
  })
}

export function buildSessionDestroyConfirmCopy(session: UnifiedSession | null | undefined, t: TranslateFn) {
  if (!session) {
    return {
      title: t('session.confirmDestroyTitle'),
      message: t('session.confirmDestroyMessage'),
      details: t('session.confirmDestroyDetails')
    }
  }

  const name = session.name?.trim() || session.sessionId

  return {
    title: t('session.confirmDestroyTargetTitle', { name }),
    message: t('session.confirmDestroyMessage'),
    details: [
      buildSessionTargetDetails(session, t),
      t('session.confirmDestroyDetails')
    ].join('\n\n')
  }
}

export function buildSessionRestartConfirmCopy(session: UnifiedSession, t: TranslateFn) {
  const name = session.name?.trim() || session.sessionId

  return {
    title: t('session.confirmRestartTargetTitle', { name }),
    message: t('session.confirmRestartMessage'),
    details: [
      buildSessionTargetDetails(session, t),
      t('session.confirmRestartDetails')
    ].join('\n\n')
  }
}
