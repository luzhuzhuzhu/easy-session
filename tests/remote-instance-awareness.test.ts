import { describe, expect, it } from 'vitest'
import { renderSessionsPage } from '../src/main/remote/web'

// FEAT-4：Web 端 instance 感知——实例摘要条 + /api/instances 端点契约（静态校验）。

describe('remote web instance awareness (FEAT-4)', () => {
  it('sessions page renders instance bar container', () => {
    const html = renderSessionsPage('http://localhost:4260', false)
    expect(html).toContain('id="instanceBar"')
    expect(html).toContain('instance-bar')
  })

  it('sessions script wires /api/instances into refreshData', () => {
    const html = renderSessionsPage('http://localhost:4260', false)
    expect(html).toContain('/api/instances')
    expect(html).toContain('renderInstanceBar')
  })
})
