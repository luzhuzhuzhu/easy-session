import type { Session } from '@/api/session'
import type { Project } from '@/api/project'

export type SmartPriorityMode = 'recent' | 'balanced'

const HOUR_MS = 60 * 60 * 1000

function hoursSince(ts: number | undefined, now: number): number {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return 9999
  return Math.max(0, (now - ts) / HOUR_MS)
}

function decay(hours: number, halfLifeHours: number): number {
  return Math.exp(-hours / halfLifeHours)
}

export function sessionPriorityScore(
  session: Pick<Session, 'status' | 'lastActiveAt' | 'lastStartAt' | 'totalRunMs'>,
  mode: SmartPriorityMode,
  now = Date.now()
): number {
  const runningBoost = session.status === 'running' ? 1000 : 0
  const activeHours = hoursSince(session.lastActiveAt, now)
  const startHours = hoursSince(session.lastStartAt, now)
  const activeScore = 320 * decay(activeHours, mode === 'recent' ? 12 : 24)
  const startScore = 200 * decay(startHours, mode === 'recent' ? 24 : 36)
  const runtime = Math.max(0, session.totalRunMs ?? 0) / 60000
  const runtimeWeight = mode === 'recent' ? 15 : 45
  const runtimeScore = runtimeWeight * Math.log1p(runtime)

  return runningBoost + activeScore + startScore + runtimeScore
}

export function projectPriorityScore(
  project: Pick<Project, 'lastOpenedAt'>,
  sessions: Session[],
  mode: SmartPriorityMode,
  now = Date.now()
): number {
  const sessionScores = sessions.map((session) => sessionPriorityScore(session, mode, now))
  const maxSession = sessionScores.length > 0 ? Math.max(...sessionScores) : 0
  const top3 = [...sessionScores].sort((a, b) => b - a).slice(0, 3)
  const avgTop = top3.length ? top3.reduce((sum, value) => sum + value, 0) / top3.length : 0
  const openHours = hoursSince(project.lastOpenedAt, now)
  const openScore = 180 * decay(openHours, mode === 'recent' ? 24 : 48)

  return maxSession * 0.7 + avgTop * 0.3 + openScore
}
