// EasySession ESLint 扁平配置（ESLint 10 flat config）。
//
// 策略：54k 行存量代码，过去无任何 lint。门禁以"立即可用、不阻塞迭代"为目标——
// 真正能抓 bug 的规则保持 error，风格类/存量噪音类降为 warn。
// CI 只在 error 为 0 时通过（warning 允许存在，后续逐步收敛）。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'release/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  // 所有 .ts/.vue 源码：Vue 单文件用 ts 解析 <script>，同时挂上 node + browser 全局。
  {
    files: ['**/*.{ts,mts,cts,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  // 单测：vitest globals:true，补齐其全局以免 no-undef 误报。
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        suite: 'readonly',
        expect: 'readonly',
        expectTypeOf: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },

  // 务实规则收敛：针对存量项目的现实降噪。
  {
    rules: {
      // 组件名如 App / Button / Index 是有意为之。
      'vue/multi-word-component-names': 'off',
      // 存量 16 处 as any，多为合理逃逸；标记但不阻塞。
      '@typescript-eslint/no-explicit-any': 'warn',
      // tsconfig 已开 noUnusedLocals/Parameters；eslint 侧设 warn 并放行下划线前缀与 catch。
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // PTY / ANSI 解析需要控制字符与转义。
      'no-control-regex': 'off',
      'no-useless-escape': 'warn',
      // 允许空 catch（多处有意吞错，已在审查中单独跟踪真正有问题的几处）。
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],

      // —— 以下为存量降级：当前代码中存在、属于历史债务，先降为 warn 让门禁立即可用。
      //    清理完成后应逐条提回 error 以恢复门禁强度。
      // 事件总线/IPC 中裸 Function 类型（应改为具体函数签名）。
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      // Vue 直接修改 props（反模式，建议改 emit/本地副本）。
      'vue/no-mutating-props': 'warn',
      'no-useless-assignment': 'warn',
      'no-empty-pattern': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
)
