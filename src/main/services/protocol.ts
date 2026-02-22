import type { CliType } from './types'
import type { Skill } from './skill-types'

export type ProtocolMessageType = 'skill-request' | 'skill-result' | 'notification' | 'command' | 'result'

export interface ProtocolMessage {
  from: { role: string; cliType: CliType }
  to: { role: string; cliType: CliType }
  type: ProtocolMessageType
  skill?: string
  content: string
}

const PROTOCOL_REGEX = /\[CCM-PROTOCOL v1\]\r?\nFROM: (.+?) \((.+?)\)\r?\nTO: (.+?) \((.+?)\)\r?\nTYPE: (.+?)\r?\n(?:SKILL: (.+?)\r?\n)?---\r?\n([\s\S]*?)\r?\n---\r?\n\[\/CCM-PROTOCOL\]/

export class Protocol {
  static formatMessage(
    from: { role: string; cliType: CliType },
    to: { role: string; cliType: CliType },
    type: ProtocolMessageType,
    content: string,
    skill?: string
  ): string {
    const lines = [
      '[CCM-PROTOCOL v1]',
      `FROM: ${from.role} (${from.cliType})`,
      `TO: ${to.role} (${to.cliType})`,
      `TYPE: ${type}`
    ]
    if (skill) lines.push(`SKILL: ${skill}`)
    lines.push('---', content, '---', '[/CCM-PROTOCOL]')
    return lines.join('\n')
  }

  static parseMessage(raw: string): ProtocolMessage | null {
    const match = PROTOCOL_REGEX.exec(raw)
    if (!match) return null
    return {
      from: { role: match[1], cliType: match[2] as CliType },
      to: { role: match[3], cliType: match[4] as CliType },
      type: match[5] as ProtocolMessageType,
      skill: match[6] || undefined,
      content: match[7]
    }
  }

  static isProtocolMessage(text: string): boolean {
    return text.includes('[CCM-PROTOCOL v1]') && text.includes('[/CCM-PROTOCOL]')
  }

  static formatSkillRequest(skill: Skill, inputs: Record<string, any>): string {
    const inputSummary = Object.entries(inputs)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')
    return `[Skill Request: ${skill.name} (${skill.slug})]\n${inputSummary}`
  }

  static formatSkillResult(skill: Skill, output: string): string {
    return `[Skill Result: ${skill.name} (${skill.slug})]\nFormat: ${skill.outputSchema.format}\n---\n${output}`
  }
}
