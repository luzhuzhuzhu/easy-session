# ChatGPT 风格网页 Demo

一个纯前端的 ChatGPT 风格聊天界面 demo，**单文件**，双击 `index.html` 就能跑（需要联网加载 marked / highlight.js / DOMPurify 等 CDN）。

## 特性

- 🎨 类 ChatGPT 布局：侧栏（历史 + 新对话）+ 主聊天区 + 浮动输入框
- 🌗 暗 / 亮主题切换，右上角一键切换
- ✍️ 流式打字机效果 + "正在思考" 动画
- 📝 Markdown 渲染（标题、列表、引用、表格、链接）
- 💻 代码高亮（JS / TS / Python / Rust / Bash / JSON / CSS / HTML）+ 一键复制
- 📱 响应式：移动端侧栏抽屉式
- 🧪 6 个 mock 关键词分支：快速排序 / 二分查找 / Transformer / Rust / 诗词 / 默认兜底

## 使用

```bash
# 直接打开（需要联网加载 CDN 依赖）
open docs/chatgpt-demo/index.html
# 或者
start docs/chatgpt-demo/index.html
```

或者用任何静态服务器：

```bash
npx serve docs/chatgpt-demo
```

## 文件

```
docs/chatgpt-demo/
├── index.html   # 全部代码 / 样式 / 逻辑都在这一个文件
└── README.md    # 本说明
```

## 备注

- 没有任何后端，所有回复都是本地 mock —— 输入关键词即可触发不同分支
- 主题选择保存在 `localStorage`
- 代码块复制通过 `navigator.clipboard`（现代浏览器均可）