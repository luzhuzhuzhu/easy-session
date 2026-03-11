#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""移动端重构脚本：将抽屉式布局改为视图切换"""

import re

# 读取备份文件
with open('src/main/remote/web.ts.backup', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 替换移动端CSS（抽屉部分改为视图切换）
old_css = r'''  /\* 移动端抽屉式布局 \*/
  \.drawer-overlay \{[^}]+\}
  \.drawer-overlay\.active \{[^}]+\}
  #drawerBtn \{[^}]+\}
  \.mobile-toolbar \{[^}]+\}

  /\* 移动端（手机竖屏）\*/
  @media \(max-width: 480px\) \{
    \.shell \{
      width: 100%;
      padding: 0;
      margin: 0;
    \}
    \.card \{
      border-radius: 0;
      border-left: none;
      border-right: none;
    \}
    \.workspace \{
      grid-template-columns: 1fr;
      gap: 0;
      min-height: 100vh;
    \}
    \.panel\.sessions-panel \{[^}]+\}
    \.panel\.sessions-panel\.open \{[^}]+\}
    #terminalHost \{
      height: calc\(100vh - 280px\);
      min-height: 200px;
    \}
    body\.keyboard-open #terminalHost \{
      height: calc\(100vh - 380px\);
    \}'''

new_css = '''  /* 移动端视图 */
  .mobile-view {
    display: none;
  }
  #backBtn {
    display: none;
  }

  /* 移动端（手机竖屏）*/
  @media (max-width: 480px) {
    body {
      overflow: hidden;
    }
    .shell {
      width: 100%;
      height: 100vh;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
    }
    .card.header {
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-top: none;
      flex-shrink: 0;
      padding: 16px;
    }
    .title {
      font-size: 20px;
    }
    .workspace {
      display: none;
    }

    .mobile-view {
      display: none;
      flex: 1;
      overflow: hidden;
      flex-direction: column;
    }
    body.view-sessions .mobile-view.sessions-view {
      display: flex;
    }
    body.view-terminal .mobile-view.terminal-view {
      display: flex;
    }

    .sessions-view {
      padding: 16px;
      overflow-y: auto;
    }
    .session-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .session-card:active {
      transform: scale(0.98);
      opacity: 0.9;
    }
    .session-card-name {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .session-card-meta {
      font-size: 14px;
      color: var(--muted);
    }

    .terminal-view {
      background: #040d1f;
    }
    .terminal-view-header {
      padding: 16px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #backBtn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: var(--touch-target);
      min-height: var(--touch-target);
      padding: 0;
      font-size: 24px;
      border-radius: 12px;
    }
    .terminal-view-title {
      flex: 1;
      font-size: 16px;
      font-weight: 700;
    }
    .terminal-view-body {
      flex: 1;
      overflow: hidden;
      padding: 8px;
    }
    #terminalHost {
      height: 100%;
      max-height: none;
    }
    .terminal-view-input {
      flex-shrink: 0;
      background: var(--panel);
      border-top: 1px solid var(--line);
      padding: 12px;
      display: flex;
      gap: 8px;
    }
    .terminal-view-input input {
      flex: 1;
      min-height: var(--touch-target);
      font-size: 16px;
      padding: 12px 16px;
      border-radius: 12px;
    }
    .terminal-view-input button {
      min-width: var(--touch-target);
      min-height: var(--touch-target);
      padding: 12px 20px;
      font-size: 16px;
      border-radius: 12px;
    }'''

# 使用简单的字符串替换
content = content.replace(
    '''  /* 移动端抽屉式布局 */
  .drawer-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }
  .drawer-overlay.active {
    display: block;
  }
  #drawerBtn {
    display: none;
  }
  .mobile-toolbar {
    display: none;
  }

  /* 移动端（手机竖屏）*/
  @media (max-width: 480px) {
    .shell {
      width: 100%;
      padding: 0;
      margin: 0;
    }
    .card {
      border-radius: 0;
      border-left: none;
      border-right: none;
    }
    .workspace {
      grid-template-columns: 1fr;
      gap: 0;
      min-height: 100vh;
    }
    .panel.sessions-panel {
      position: fixed;
      top: 0;
      left: 0;
      width: 85vw;
      max-width: 320px;
      height: 100vh;
      z-index: 1000;
      transform: translateX(-100%);
      transition: transform 0.3s ease;
      box-shadow: 2px 0 8px rgba(0,0,0,0.2);
      border-radius: 0;
    }
    .panel.sessions-panel.open {
      transform: translateX(0);
    }
    #terminalHost {
      height: calc(100vh - 280px);
      min-height: 200px;
    }
    body.keyboard-open #terminalHost {
      height: calc(100vh - 380px);
    }''',
    new_css
)

print("第1步：CSS已替换")
print(f"当前文件长度：{len(content)} 字符")

# 保存到临时文件
with open('src/main/remote/web.ts.tmp', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ 临时文件已创建")
