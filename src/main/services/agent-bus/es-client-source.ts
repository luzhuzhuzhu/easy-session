// es CLI 客户端源码：作为字符串常量在运行时落盘，由 shim 经 ELECTRON_RUN_AS_NODE 执行。
// 设计：客户端是「哑」转发器——只把 argv 原样发给主进程 bus，由 bus 解析全部命令语义并回传结果。
// 这样新增/改命令无需重新分发 shim，且客户端零第三方依赖（仅用 node 内建 net）。

export const ES_CLIENT_SOURCE = String.raw`#!/usr/bin/env node
'use strict'
// EasySession agent bus 客户端。请勿手改——由主进程在启动时生成。
const net = require('net')

const pipe = process.env.EASYSESSION_BUS_PIPE
const token = process.env.EASYSESSION_BUS_TOKEN || ''
const agent = process.env.EASYSESSION_BUS_AGENT || ''
const argv = process.argv.slice(2)

if (!pipe) {
  process.stderr.write('EasySession bus 未启用（缺少 EASYSESSION_BUS_PIPE）。\n')
  process.exit(1)
}

const payload = JSON.stringify({ token: token, agent: agent, argv: argv }) + '\n'
const sock = net.connect(pipe)
let buf = ''

sock.setEncoding('utf8')
// 兜底超时（> 服务端 recv --wait 最大 600s）：防止服务端异常时客户端永久挂起。
sock.setTimeout(615000, function () {
  process.stderr.write('EasySession bus 响应超时。\n')
  process.exit(1)
})
sock.on('connect', function () {
  sock.write(payload)
})
sock.on('data', function (chunk) {
  buf += chunk
})
sock.on('end', function () {
  let res = null
  try {
    res = JSON.parse(buf)
  } catch (e) {
    if (buf) process.stderr.write(buf)
    process.exit(1)
    return
  }
  if (res && typeof res.stdout === 'string' && res.stdout.length) {
    process.stdout.write(res.stdout.charAt(res.stdout.length - 1) === '\n' ? res.stdout : res.stdout + '\n')
  }
  if (res && typeof res.stderr === 'string' && res.stderr.length) {
    process.stderr.write(res.stderr.charAt(res.stderr.length - 1) === '\n' ? res.stderr : res.stderr + '\n')
  }
  const code = res && typeof res.exitCode === 'number' ? res.exitCode : (res && res.ok ? 0 : 1)
  process.exit(code)
})
sock.on('error', function (err) {
  process.stderr.write('连接 EasySession bus 失败: ' + (err && err.message ? err.message : String(err)) + '\n')
  process.exit(1)
})
`

// Windows 批处理 shim：设置运行时变量并以 node 模式调用 electron。
export function buildWindowsShim(): string {
  return [
    '@echo off',
    'setlocal',
    'set "ELECTRON_RUN_AS_NODE=1"',
    '"%EASYSESSION_BUS_ELECTRON%" "%EASYSESSION_BUS_ENTRY%" %*',
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n')
}

// POSIX shell shim。
export function buildPosixShim(): string {
  return [
    '#!/bin/sh',
    'ELECTRON_RUN_AS_NODE=1 exec "$EASYSESSION_BUS_ELECTRON" "$EASYSESSION_BUS_ENTRY" "$@"',
    ''
  ].join('\n')
}
