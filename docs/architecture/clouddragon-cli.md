# 云龙 CLI 实现参考

用于实现黄区的云龙接入和家庭开发机上的模拟。命令、分页、输出和门户字段目录来自仓库已记录的 CLI 资料。AIReq 如何同步、回写和定版见[需求共创规格](../specs/aireq/proposals.md)。

## 安装与登录

### 家庭开发机

在仓库根目录运行 `bun run clouddragon --help` 查看离线 CLI。后续示例中的 `clouddragon` 可替换为 `bun run clouddragon`。离线端覆盖本参考的九个子命令、全局选项和成功／失败输出。它持有本地模拟项目、需求域、IR 和评论，写入跨进程保存至仓库的 `.zcode-runtime/clouddragon.sqlite`。可用 `ZCODE_CLOUDDRAGON_MOCK_DB` 指定独立的数据库文件。默认开发服务和独立命令行共享该目录数据，AIReq 自身的讨论与文档仍由工作流持有。

验收时在同一项目按域、PI 和进展读取多条 IR，分页与全量结果应一致。在独立进程创建和更新 IR、添加和删除评论，再从另一进程回读。未知参数返回退出码 2，找不到项目、需求或评论返回退出码 1。离线操作只使用本地模拟数据。

### 公司云龙

`clouddragon-cli` 需要 Python 3.10 或更高版本，以及可访问云龙门户和企业 SSO 的内网环境。安装会自动获取运行时依赖 `httpx`。在 CLI 源码目录运行以下命令。

```bash
pip install .
clouddragon --help
```

也可在 CLI 源码目录的上一级运行 `python -m clouddragon_cli --help`。

| 必填环境变量 | 含义         |
| ------------ | ------------ |
| `w3Account`  | 云龙登录账号 |
| `password`   | 云龙登录密码 |

CLI 从环境变量读取凭据。启动 AIReq 服务时设置这两个变量，CLI 子进程会继承它们。手工运行时可交互输入，避免将密码写入命令历史。

```bash
read -r -p '云龙账号：' w3Account
read -r -s -p '云龙密码：' password
printf '\n'
export w3Account password
clouddragon project list --name 开发
```

```powershell
$env:w3Account = Read-Host '云龙账号'
$env:password = [System.Net.NetworkCredential]::new('', (Read-Host '云龙密码' -AsSecureString)).Password
clouddragon project list --name 开发
```

CLI 使用内置默认项目和 API 入口，HTTP 请求默认超时 20 秒。登录成功后，门户下发的 `prod_cftk` 会话 cookie 按账号缓存在 `~/.clouddragon/session.json`。后续命令复用缓存，会话失效时自动重新登录一次。CLI 当前使用 `verify=False` 关闭 TLS 证书校验，真实凭据应在可信内网使用。门户改版或企业 SSO 策略变化时，可能需要调整 CLI 的 `client.py`。

## 查项目和需求域

命令格式为 `clouddragon <资源> <动作>`。运行 `clouddragon --help` 查看资源，或用 `clouddragon ir list --help` 查看参数及输出。以下命令使用示例项目组 ID、需求域和 IR 业务号。

```bash
clouddragon project list --name 开发
clouddragon domain list --project gexample0001
```

- `project list` 在 `data.items` 返回当前账号可访问的项目。`--name` 按项目名做大小写不敏感的包含匹配。项目项的 `id` 是 `--project` 所需的项目组 ID，`current` 表示本次选中的项目。
- `domain list` 在 `data.items` 返回所选项目的需求域。`--domain` 接受需求域的 `id` 或名称。
- 项目或需求域缺少可用标识时，该项的 `id` 为 `null`。

## 全局选项

| 选项 | 含义 |
| ---- | ---- |
| `--project VALUE` | 选择项目，省略时使用内置默认项目。接受项目组 ID 或 URL，显式传入空值会报错。URL 路径须包含完整的字母数字项目 ID，例如 `/project/g123`。 |
| `--timeout SECONDS` | 覆盖本次 HTTP 请求超时，默认 20 秒。 |
| `--compact` | 输出单行 JSON。 |
| `--debug` | 执行失败时向 stderr 额外输出 Python traceback。 |
| `--version` | 使用 `clouddragon --version` 查看版本。 |

`--project`、`--timeout`、`--compact` 和 `--debug` 可放在资源前、资源和动作之间，或动作之后。同一选项重复传入时，最后一次生效。

## 查 IR

```bash
# 取项目内全部 IR
clouddragon --project gexample0001 ir list --all

# 只取指定需求域中处于测试阶段的 IR 的第 2 页
clouddragon ir list --project gexample0001 --domain 900001 --process 测试 --page 2 --page-size 50

# 从列表的 data.domains[].items[].businessNo 取业务号，再查详情
clouddragon ir show IR20990101000001 --project gexample0001 --domain 900001
```

`ir list` 默认取每个选中需求域的第一页，每页 200 条。`--domain` 可重复，省略时查询项目内所有需求域。`--page` 和 `--page-size` 接受从 1 开始的整数。`--all` 自动翻页并按各域内的 IR `id` 去重，与 `--page` 互斥。

每个 `data.domains[]` 条目包含 `id`、`name`、`items`、`count`、`page`、`page_size`、`total` 和 `next_page`。`page_size` 是请求的页大小，`count` 是实际返回条数，`total` 是服务端报告的跨页总数。按域把 `next_page` 传给 `--page`，直到它为 `null`。最后一次请求可能返回空页。使用 `--all` 时，`page`、`total` 和 `next_page` 均为 `null`。

以下是 `--page-size 1` 的响应示例，IR 对象节选了用于定位需求和统计 Release 的字段。

```json
{
  "ok": true,
  "data": {
    "project": "gexample0001",
    "domains": [
      {
        "id": "900001",
        "name": "示例需求域",
        "items": [
          {
            "id": "9000000101",
            "businessNo": "IR20990101000001",
            "domain": "900001",
            "name": "示例需求标题",
            "process": "完成",
            "pi": "10001",
            "piName": "示例 Release"
          }
        ],
        "count": 1,
        "page": 1,
        "page_size": 1,
        "total": 2,
        "next_page": 2
      }
    ]
  }
}
```

`--process` 在服务端按进展筛选，可选 `初始`、`分析`、`开发`、`测试`、`完成`。只需统计各域的完成数时，可用每页 1 条的请求读取 `total`。

```bash
clouddragon ir list --project gexample0001 --process 完成 --page-size 1 |
  jq -c '.data.domains[] | {name, count: .total}'
```

按 Release 统计时，先用 `--all` 取得全量数据，再按 `pi` 归组，以 `piName` 显示名称。以下命令只统计已分配 Release 的 IR，项目总数仍包含未分配 `pi` 的 IR。

```bash
clouddragon ir list --project gexample0001 --all --compact |
  jq -c '[.data.domains[].items[] | select((.pi // "") != "")]
    | group_by(.pi)[]
    | {id: .[0].pi, release: .[0].piName, total: length,
       done: (map(select(.process == "完成")) | length)}'
```

`ir show` 接收门户业务号，在 `data.ir` 返回门户原始字段。查看、更新和评论命令均接受 `--domain`，省略时按业务号逐域查找。AIReq 从列表快照取原始描述和详情字段，通过评论命令单独读取评论。

## CLI 输出契约

| 结果 | 输出流 | 退出码 | 内容 |
| ---- | ------ | ------ | ---- |
| 成功 | stdout | `0` | `{"ok": true, "data": …}` |
| 执行失败 | stderr | `1` | `{"ok": false, "error": {"type": "AuthenticationError", "message": "示例错误信息"}}` |
| 参数错误 | stderr | `2` | 同样的失败结构，`error.type` 为 `ArgumentError`。 |

`--help` 和 `--version` 输出纯文本。启用 `--debug` 后，执行失败时 stderr 还会包含 Python traceback。

## AIReq 读取时的字段类型

下表记录服务端适配器实际校验的 JSON 形状，供接入真实 CLI 和编写本地模拟时对照。门户字段目录另行保留 `fieldKey` 和 `useType`。该次门户响应中的 75 个 `fieldType` 均为空，未声明类型的字段应以对应命令的实际返回为准。[服务端解析定义](../../packages/server/src/aireq/clouddragon.ts)

| 命令与位置 | 适配器读取的类型及空值 |
| --- | --- |
| `project list` 的 `data` | `project` 为项目组 ID 字符串，`items` 为数组。每项的 `name` 为字符串，`id` 为项目组 ID 字符串或 `null`。 |
| `ir list` 的 `data` | `project` 为项目组 ID 字符串，`domains` 为数组。每个域的 `id` 是数字组成的字符串，`name` 可为字符串、`null` 或省略，`count` 是非负整数，`items` 是 IR 对象数组。 |
| IR 必填字段 | `businessNo` 是以 `IR` 开头、后接数字的字符串。`domain` 是数字组成的字符串。`description`、`creator`、`submitter`、`createDate` 均为字符串。 |
| IR 可空字段 | `name`、`process`、`pi`、`piName`、`delivererOwner`、`owner`、`seId`、`de`、`te` 均接受字符串、`null` 或省略。其余门户字段可为任意 JSON 值。 |
| 评论返回 | `comment list` 的 `data.items` 是 JSON 对象数组，`comment add` 的 `data.comment` 是 JSON 对象。`comment delete` 的成功响应校验 `data` 对象。三者的 `data.project` 可省略，返回时须匹配请求的项目组 ID。 |

项目组 ID 以 ASCII 字母或数字开头，后续可含字母、数字、下划线或连字符。IR 归属校验要求域 ID 唯一、域内 `count` 等于返回条数、每条 IR 的 `domain` 等于外层域 ID，且同一项目内 `businessNo` 唯一。

## 云龙字段与页面列

以下是云龙门户 `field/getAllFields` 响应中的 75 条字段定义，按适用对象分组。名称取自 `fieldName`，键取自 `fieldKey`。本次元数据中的 `fieldType` 均为空。字段定义说明门户的列配置，实际取值时以对应对象 API 的响应为准。

### 需求、子需求和任务

| 页面名称 | `fieldKey` | `useType` |
| --- | --- | --- |
| 标题 | `title` | `IR,SR,US,Task` |
| 详情 | `deil` | `IR,SR,US,Task` |
| 需求空间 | `domain` | `IR,SR,US,Task` |
| PI | `pi` | `IR,SR,US,Task` |
| 迭代 | `iterateId` | `IR,SR,US,Task` |
| 预估\|卷积工作量 | `estimatedWorkloadManday` | `IR,SR,US,Task` |
| 预估代码行(KLOC) | `pmsWorkloadKloc` | `IR,SR,US,Task` |
| 进展 | `process` | `IR,SR,US,Task` |
| 优先级 | `priorityLevel` | `IR,SR,US,Task` |
| 健康状态 | `health_degree` | `IR,SR,US,Task` |
| 微服务 | `serviceName` | `IR,SR,US,Task` |
| 业务编码 | `businessCode` | `IR,SR,US,Task` |
| 无需分解原因 | `noBreakReason` | `IR,SR,US,Task` |
| 是否涉及网络安全 | `industry` | `IR,SR,US,Task` |
| 是否需要分解 | `needBreak` | `IR,SR,US,Task` |
| 目标用户 | `targetCustomer` | `IR,SR,US,Task` |
| 无需代码开发原因 | `noDevelopReason` | `IR,SR,US,Task` |
| 是否需要代码开发 | `needDevelop` | `IR,SR,US,Task` |
| 需求提出人 | `owner` | `IR,SR,US,Task` |
| 设计责任人 | `seId` | `IR,SR,US,Task` |
| 开发责任人 | `de` | `IR,SR,US,Task` |
| 关联责任人 | `relatedOwner` | `IR,SR,US,Task` |
| 测试责任人 | `te` | `IR,SR,US,Task` |
| 当前责任人 | `delivererOwner` | `IR,SR,US,Task` |
| 计划开发结束时间 | `developEndTime` | `IR,SR,US,Task` |
| 需求更新人 | `modifiedBy` | `IR,SR,US,Task` |
| 计划测试结束时间 | `testingEndTime` | `IR,SR,US,Task` |
| 用户期望交付时间 | `expectedImplementationDate` | `IR,SR,US,Task` |
| 需求来源 | `demandSource` | `IR,SR,US,Task` |
| 关联RR | `rrBusinessNo` | `IR,SR,US,Task` |
| 架构元素 | `netype` | `IR,SR,US,Task` |
| 创建人 | `creator` | `IR,SR,US,Task` |
| 创建时间 | `createDate` | `IR,SR,US,Task` |
| 转分析时间 | `turnAnalysisTime` | `IR,SR,US,Task` |
| 转开发时间 | `completedAnalysisTime` | `IR,SR,US,Task` |
| 转测试时间 | `turnTestTime` | `IR,SR,US,Task` |
| 完成时间 | `completedDate` | `IR,SR,US,Task` |
| 分解状态 | `isDecompose` | `IR,SR,US,Task` |
| 需求类型 | `subType` | `IR,SR,US,Task` |
| 标签 | `labels` | `IR,SR,US,Task` |
| 评论 | `comments` | `IR,SR,US,Task` |
| 下游RR编号 | `pmsRRNumber` | `IR,SR,US,Task` |
| 所属领域 | `correspondingCategory` | `IR,SR,US,Task` |
| 是否需要关联微服务 | `isRelatedMicroService` | `IR,SR,US,Task` |
| 是否需要关联文档 | `isRelatedDoc` | `IR,SR,US,Task` |
| 是否需要关联架构元素 | `isRelatedArc` | `IR,SR,US,Task` |
| 硬件单板信息 | `board` | `IR,SR,US,Task` |
| 需求分类 | `trustCategory` | `IR,SR,US,Task` |
| 验证策略 | `verificationPolicy` | `IR,SR,US,Task` |
| 验证策略描述 | `verificationPolicyDesc` | `IR,SR,US,Task` |
| PMS(PI) | `pmsPI` | `IR,SR,US,Task` |
| 实际工作量（KLOC） | `realWorkloadKloc` | `US` |
| 实际工作量（人天） | `realWorkloadManday` | `US` |
| 附件 | `attachment` | `IR,SR,US,Task` |
| 系统ID | `systemid` | `IR,SR,US,Task` |
| 基线状态 | `baseline` | `IR,SR,US,Task` |
| PMS状态 | `pmsStatus` | `IR,SR,US,Task` |
| 网络安全标识 | `pmsNetworkSecurityIdentity` | `IR,SR,US,Task` |
| 需求开发跟踪状态 | `implTracingState` | `IR,SR,US` |

### 缺陷（BUG）

| 页面名称 | `fieldKey` |
| --- | --- |
| 标题 | `title` |
| 描述 | `description` |
| 需求空间 | `defect2domain` |
| 提出人 | `defectCreatedBy` |
| 严重程度 | `severity` |
| 问题领域 | `problemDomain` |
| 微服务 | `serviceId` |
| 发现环境 | `foundEnvironment` |
| 发现PI | `foundPi` |
| 发现迭代 | `foundDefect2Plan` |
| 期望修复时间 | `expectedRepairDate` |
| 修复PI | `pi` |
| 修复迭代 | `defect2Plan` |
| 计划修复时间 | `dueDate` |
| 预估工作量 | `devWorkload` |
| 健康状态 | `healthDegree` |

### IR 业务数据的取值

`ir list` 的 `data.domains[].items[]` 和 `ir show` 的 `data.ir` 返回 IR 记录。下面这些记录字段与门户元数据需要一起对照。

| 含义 | IR 记录字段 | 说明 |
| --- | --- | --- |
| 需求编号 | `businessNo` | 门户业务号，用于 `ir show`、`ir update` 和评论命令。内部 `id` 用于门户详情查询。 |
| 标题 | `name` | IR 记录使用 `name`，列配置元数据使用 `title`。 |
| 描述 | `description` | IR 记录使用 `description`，需求类元数据的「详情」使用 `deil`。 |
| 预估／卷积工作量 | `estimatedWorkloadManday`、`sumWorkloadManday` | 元数据用同一列名登记 `estimatedWorkloadManday`，IR 记录另有 `sumWorkloadManday` 表示卷积工作量。 |
| Release 名称 | `piName` | 以 `pi` 分组，使用 `piName` 展示名称。 |
| 提交人 | `submitter` | AIReq 在缺失时显示 `creator`。 |

当前责任人取 `delivererOwner`，需求提出人取 `owner`，设计、开发、测试责任人分别取 `seId`、`de`、`te`。这些人员字段为空时保留空值。CLI 的 `--owner` 写入 `owner`。

本次门户元数据未提供「停留时间」和「关联任务」的字段。AIReq 列表中的取值规则见[云龙字段与页面列](../specs/aireq/proposals.md#云龙字段与页面列)。

## 创建和更新 IR

以下命令供直接使用云龙 CLI 时参考。AIReq 一期的写入范围见[黄区需求澄清与云龙对接](../specs/aireq/proposals.md#黄区需求澄清与云龙对接)。

```bash
clouddragon ir create --project gexample0001 --domain "示例需求域" --name "新需求" --priority 高
clouddragon ir update IR20990101000001 --project gexample0001 --process 完成
clouddragon ir update IR20990101000001 --project gexample0001 --description "<p>更新后的示例描述</p>"
```

| 选项 | 说明 |
| ---- | ---- |
| `--domain VALUE` | 需求域 ID 或名称。创建时必填，更新时可用于缩小查找范围。 |
| `--name TEXT` | IR 名称，创建时必填。 |
| `--description HTML` | 富文本描述，创建时默认使用需求模板。 |
| `--priority VALUE` | 可选 `高`、`中`、`低`，创建时默认 `中`。 |
| `--owner USER` | 需求提出人账号（`owner`），创建时默认当前账号。 |
| `--expected-date YYYY-MM-DD` | 期望实现日期，更新时可传空字符串清除。 |
| `--process STATE` | 更新时设置目标进展，取值与 `ir list --process` 相同。 |

`ir create` 返回 `domain`、`id`、`business_no` 和 `ir`。创建已返回内部 ID，但回查失败或暂时找不到 IR 时，命令仍成功退出，`business_no` 为 `null`，原因见 `data.ir.warning`。保留内部 `id`，稍后用 `ir list` 获取对应的 `businessNo`。

`ir update` 至少需要一个更新字段。进展和详情字段需分开提交。结果包含 `business_no`、`item_id`、`changed`、`before` 和服务端回读的 `ir`。`changed` 和 `before` 分别给出变化字段的新值和原值。详情字段使用门户字段名，例如 `priorityLevel` 和 `expectedImplementationDate`。

收到 `UpdateUnconfirmedError` 表示门户已接受更新，但回读失败或回读值与请求不同。先用 `ir show` 查询当前状态，再决定是否重试。

## CLI 评论操作

```bash
clouddragon comment list IR20990101000001 --project gexample0001
clouddragon comment add IR20990101000001 "看起来不错" --project gexample0001
clouddragon comment delete IR20990101000001 00000000-0000-4000-8000-000000000001 --project gexample0001
```

AIReq 会显式传入 IR 所属的 `--domain`。服务端新增评论使用 `comment add --domain <域ID> -- <IR业务号> <正文>`，将多行或以短横线开头的正文作为单个参数传入。

`comment list` 在 `data.items` 返回评论，`comment add` 在 `data.comment` 返回新增评论。删除命令接收对应的 `data.items[].id` 或 `data.comment.id` 作为评论 UUID。列表中缺少 UUID 的条目返回 `id: null`。省略 `--type` 时，CLI 从评论列表查询类型，找不到该 ID 时返回 `NotFoundError`。删除不可撤销，执行前先用 `comment list` 核对评论 ID。

## CLI 开发与离线测试

在 `clouddragon-cli` 源码目录运行以下命令。测试使用模拟客户端或 `httpx.MockTransport`，无需访问内网或提供真实凭据。

```bash
pip install -e . pytest
pytest
```
