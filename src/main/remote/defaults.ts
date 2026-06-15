export const DEFAULT_REMOTE_HOST = '127.0.0.1'
export const DEFAULT_REMOTE_PORT = 18765
// 注意「passthroughOnly」语义：它仅关闭项目/会话的「生命周期管理」（创建/启动/暂停/重启/销毁等），
// 并不是只读 —— 远程仍可向运行中的会话写入 PTY 输入（即仍具备完整的远程命令执行能力）。
// 命名易误解为「仅透传/只读」，使用与展示时务必按「关闭生命周期管理、保留交互输入」理解。
export const DEFAULT_REMOTE_PASSTHROUGH_ONLY = true
export const DEFAULT_REMOTE_IDLE_TIMEOUT_MS = 30 * 60 * 1000
// 空闲断连超时上限：经 env 设值时封顶，避免被设成极大值而弱化空闲断连防线。
export const MAX_REMOTE_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000
export const DEFAULT_REMOTE_RATE_LIMIT_WINDOW_MS = 60 * 1000
export const DEFAULT_REMOTE_RATE_LIMIT_MAX = 240
export const DEFAULT_REMOTE_TOKEN_FILE = 'remote-token.txt'
export const REMOTE_SERVICE_CONFIG_FILE = 'remote-service-config.json'
export const REMOTE_SERVICE_SECRETS_FILE = 'remote-service-secrets.json'
export const CLOUDFLARE_TUNNEL_CONFIG_FILE = 'cloudflare-tunnel-config.json'
export const REMOTE_NETWORK_SETTINGS_FILE = 'remote-network-settings.json'
export const REMOTE_NETWORK_RUNTIME_FILE = 'remote-network-runtime.json'
