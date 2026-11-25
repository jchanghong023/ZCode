# AIReq — AI 需求协作

供芯片团队在黄区澄清需求、在红区结合代码做方案的桌面 Web 应用。[需求共创规格](docs/specs/aireq/proposals.md)定义产品规则。当前原型使用 React／Vite 和 Bun／Hono，通过同源 WebSocket 二进制 Channel RPC 通信，业务会话使用 ZCode Protocol v4。

项目配置指定服务器工作目录和 Git 仓库。开发可在「需求共创」复制项目文档目录的软链接命令，并在自己的仓库中查看最新文档。[查看最新文档](docs/specs/aireq/proposals.md#在开发仓库中查看最新文档)

业务讨论仍使用模拟 Agent。工号沿用原型身份机制。原型保存仓库地址和分支作为配置，准备项目共享目录并发布当前文档。服务重启会重新初始化内存业务数据。完整能力边界见[系统范围](docs/README.md#系统范围)与[服务端说明](docs/architecture/mock-backend.md)。

## 环境与安装

- Bun **1.4.4**，由 `mise.toml` 固定；JavaScript／TypeScript 工具统一由 Bun 执行。
- pnpm **10.33.2**，由 `package.json` 固定，用于 workspace 依赖管理，不要求安装 Node.js 或全局 pnpm。

```bash
mise install
bun run bootstrap
```

不使用 mise 时，先安装固定版本 Bun，再执行 `bun run bootstrap`。初始化会校验工具链、刷新被补丁修改的依赖、安装 workspace 依赖并构建前后端。

独立管理依赖：

```bash
bun x --bun --package pnpm@10.33.2 pnpm install
```

不要使用 `bun install` 或系统 pnpm／Corepack shim 替代上述安装入口。首次获取包管理器和依赖需要 registry 或预先准备的缓存。

## 开发与产品入口

```bash
bun run dev
```

浏览器打开 <http://localhost:5174>。Vite 监听 `5174`，模拟后端监听 `3031`，开发代理转发 `/api` 和 `/ws`。

默认使用本地云龙样例，无需内网、CLI 或凭据。输入示例工号 `a00000001` 进入「所有项目」，从 Release 卡片打开对应版本工作区。产品范围与各功能规格见[文档索引](docs/README.md)。

在可访问云龙门户和企业 SSO 的黄区，在 CLI 源码目录使用 Python 3.10 或更高版本运行 `pip install .`，确保服务端账号的 `PATH` 可找到 `clouddragon`。为服务进程设置 `w3Account` 和 `password` 后可启用真实 CLI。直接启动服务端也默认使用真实 CLI。

```bash
bun run dev --use-clouddragon
```

打开 <http://localhost:5174/chat> 进入独立的 Web Agent 聊天，浏览器无需登录。聊天使用服务端内存模拟，工作目录根沿用 `ZCODE_SERVER_WORKSPACE` 或服务工作目录。聊天的会话范围见 [Web Agent 聊天](docs/specs/web-agent-chat.md)。

## 构建与部署

```bash
bun run build
ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun packages/server/dist/entry-http.js
```

构建产物为 `packages/server/dist/entry-http.js` 和 `packages/web/dist/`。后端 bundle 由固定版本 Bun 执行，可同时托管 HTTP、WebSocket 和前端静态资源，不依赖部署目录的 `node_modules`。

Web 生产构建按依赖和页面模块分包，保持 Vite 默认的 500 kB JavaScript 分包告警阈值。代码高亮首次使用时从同源加载带内容哈希的 Oniguruma `.wasm`，与其他 `dist/assets/` 资源一同部署。验收以实际构建输出无分包体积告警、两个浏览器入口均可用且代码预览能加载高亮为准。

PowerShell 先设置 `$env:ZCODE_WEB_STATIC_ROOT = (Resolve-Path packages/web/dist).Path`，再运行后端产物。`PORT` 控制后端端口，`ZCODE_SERVER_HOST` 控制监听地址；部署访问控制、HTTP 资源和 WebSocket 必须保持同源契约，详见[服务端部署说明](docs/architecture/mock-backend.md)。

### Windows x64 单文件

从 OMP fork 的 `bun run pack:sdk` 取得 SDK ZIP 和 SHA-256。安装本仓库依赖后执行：

```powershell
bun run build:standalone <omp-sdk.zip> <sha256>
.\dist\zcode.exe --version
.\dist\zcode.exe
```

可通过第三个参数指定 `.exe` 输出。构建使用 Windows 自带 `tar.exe`，需要能获取 SDK 锁定的构建依赖，不需要 OMP 源码工作区或 Rust 工具链。输出内嵌 Bun、OMP SDK、原生模块和完整 Web 构建；运行不需要另装 Bun、OMP 或提供 `web/dist`。可执行文件将 Web 资源释放到临时目录，许可证可用 `--licenses` 查看。当前仍使用原型后端：打包不会启用真实模型或改变公开接口。

## 依赖与清理

Bun 和 Vite 直接消费 workspace 源码。跨包导入使用包 manifest 的公开 `exports`，类型检查使用 `tsc -b`。升级补丁依赖时，同时核对根 manifest 的 `pnpm.patchedDependencies`、[补丁](patches)和[锁文件](pnpm-lock.yaml)。更换开发后端端口时同步调整 [Vite 代理](packages/web/vite.config.ts)。

`bun run knip` 扫描所有工作区的 JS／TS 和应用静态资源（CSS、HTML、PNG、SVG、MP3、SQL），默认包含测试，不含 Git 忽略的构建产物和依赖。`bun run knip --files` 只看整文件候选。[Knip 配置](knip.ts)按实际启动、构建、公开包入口和工具调用确定入口；保留组件仍可出现在报告中，但不得据此删除。删除前还须核对动态路径、构建扫描、测试和公开契约。Markdown 文档和其他不参与模块引用图的文件不由 Knip 判定。包入口与浏览器边界由 `bun run architecture:check` 校验。

`bun run clean` 清理根目录与各包的 `dist`、`*.tsbuildinfo`；`bun run clean:deps` 额外清除对应的 `node_modules`。

## 测试

前端 UT 运行 `bun run test:ut`；启动服务后，后端 ST 运行 `bun run test:st`。配置与用例范围见[测试说明](docs/testing/unit-test-quality.md)。其他工程命令见[根工程配置](package.json)。

## License

Apache-2.0，见 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
