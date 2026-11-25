# AIReq — AI 需求协作

供芯片团队在黄区澄清需求、在红区结合代码做方案的桌面 Web 应用。[需求共创规格](docs/specs/aireq/proposals.md)定义产品规则。当前原型使用 React／Vite 和 Bun／Hono，通过同源 WebSocket 二进制 Channel RPC 通信，业务会话使用 ZCode Protocol v4。

项目配置指定服务器工作目录和 Git 仓库。开发可在「需求共创」复制项目文档目录的软链接命令，并在自己的仓库中查看最新文档。[查看最新文档](docs/specs/aireq/proposals.md#在开发仓库中查看最新文档)

原型保留内存业务和模拟 Agent。正式服务使用 SQLite 和 OMP SDK。团队入口输入工号即可进入，个人 Chat 单独使用当前机器上的 OMP 配置。[系统范围](docs/README.md#系统范围)

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

| 实例 | 仓库根目录启动命令 | Web | 后端 |
| --- | --- | --- | --- |
| 原型 | `bun run dev` | 5174 | 3031 |
| 正式黄区，家庭云龙样例 | `bun run start:prod` | 5175 | 3032 |
| 正式黄区，公司云龙 | `bun run start:prod --zone yellow --use-clouddragon` | 5175 | 3032 |
| 正式红区 | `bun run start:prod --zone red` | 5176 | 3033 |

三个实例各自从同源 `/` 进入 AIReq，从 `/chat` 进入个人聊天。正式服务使用对应平台的 **OMP SDK ZIP**。本地开发默认读取 `.zcode-runtime/sdk/omp-sdk-win32-x64.zip` 或 `.zcode-runtime/sdk/omp-sdk-linux-x64.zip`，也可通过 `OMP_SDK_ZIP` 指定归档路径、`OMP_SDK_SHA256` 指定校验值。发布版使用由同一类 SDK ZIP 编入的运行时，解压应用包即可启动。模型和凭据沿用本机 OMP TUI 配置。

开发启动首次遇到新的 ZIP 时，会按归档内的锁文件准备依赖并生成 SDK 资源，需要本机已有依赖缓存或可访问包源。相同 SHA-256 的后续启动复用已准备的缓存；发布包启动无需这一步。

家庭联调时，原型和正式黄区各有自己的模拟云龙库。单独运行 CLI 要操作正式黄区数据时，设置 `ZCODE_CLOUDDRAGON_MOCK_DB` 为黄区数据目录里的 `clouddragon.sqlite`。

两套正式服务的数据库默认分别在 `.zcode-runtime/yellow/aireq.sqlite` 和 `.zcode-runtime/red/aireq.sqlite`。部署时用 `ZCODE_DATA_DIR` 单独设置本区持久目录。黄区写入 `outbox/aireq-transfer.json`，红区读取 `inbox/aireq-transfer.json`，可分别用 `ZCODE_EXCHANGE_DIR` 指定公司工具的交接目录。本机联调将黄区完成的文件复制到红区收件目录，或将两边的交接目录指向同一测试目录。正式红区使用回滚日志模式，实际 NFS 挂载需支持 SQLite 文件锁与持久写入。

业务会话和评审的原生日志保存在本区数据目录的 `omp-sessions/aireq/`；不与 TUI 共用的个人 Chat 日志在 `omp-sessions/chat/`。备份时停服并同时保存 SQLite 和这些日志目录。

仅在本机回环黄区且未配置对外来源或受信反代时，Web Chat 与同一用户的 OMP TUI 共用个人会话日志。启动黄区时和 TUI 使用同一个 `OMP_CONFIG_ROOT`（未设置时默认 `~/.omp`）。任一端可新建会话，另一端可恢复并继续；要先结束另一端对该会话的占用。同一会话不会为续聊创建副本。共用会话的备份另包含 OMP 的会话目录。

### 原型开发

```bash
bun run dev
```

浏览器打开 <http://localhost:5174>。Vite 监听 `5174`，模拟后端监听 `3031`，开发代理转发 `/api` 和 `/ws`。

默认使用独立的离线云龙 CLI，无需内网或凭据。输入示例工号 `a00000001` 进入「所有项目」。可在仓库根目录运行 `bun run clouddragon project list` 查项目，或用 `bun run clouddragon --project gmockdev01 ir list --all` 查全部需求域。命令行和开发服务共用本地云龙数据，详见[云龙 CLI 实现参考](docs/architecture/clouddragon-cli.md#家庭开发机)。

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

### 正式服务离线 ZIP

在目标平台的 x64 构建机上，使用该平台的 OMP SDK ZIP 及其 SHA-256 构建。Windows 使用系统自带的 `tar.exe`，Linux 使用 `zip` 和 `unzip`。SDK 方的构建脚本需要能够获取其锁定的依赖。Windows 和 Linux 发布同一应用版本时，应选用同一 OMP 版本。

```sh
bun run build:prod <omp-sdk.zip> <sha256> [output.zip] [--web-dist <前端构建目录>]
```

默认生成 `dist/zcode-<版本>-win32-x64.zip` 或 `dist/zcode-<版本>-linux-x64.zip`。发布两种平台时可先执行一次 `bun run build:web`，将同一份 `packages/web/dist` 作为两次打包的 `--web-dist` 输入。解压得到 `zcode.exe` 或 `zcode`、`web/` 与 `LICENSES.txt`。程序使用自带的 Bun 与 OMP SDK，从同级的 `web/` 提供两个页面入口。设置 `ZCODE_DATA_DIR` 指向本区独立的持久目录后，在 Windows 运行 `.\zcode.exe --zone yellow`，在 Linux 运行 `./zcode --zone red`。黄区默认使用离线云龙，可追加 `--use-clouddragon` 切换为已安装的公司 CLI。红区从文件接收数据。

使用 `zcode.exe clouddragon project list` 或 `./zcode clouddragon project list` 可直接操作包内的离线云龙。与黄区服务采用相同的工作目录、`ZCODE_DATA_DIR` 和可选的 `ZCODE_CLOUDDRAGON_MOCK_DB`，即可读写同一模拟库。实际 Agent 会话使用运行账号的 OMP 配置与可访问的模型，红区代码和知识库取自现场配置的 Git 和 MCP 服务。`--version` 显示应用与 SDK 版本。

### 原型 Windows x64 单文件

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
