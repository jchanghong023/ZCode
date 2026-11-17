# 会话行悬停卡片

`TaskRowIdentityHoverCard` 是通用只读展示控件，输入为调用方提供的任务、workspace 标签、remoteSessionId 和分支标签。当前 AIReq 不挂载旧项目／任务侧栏；保留控件不恢复导航或 Git 服务。

路径取任务的 cwd，否则取 workspacePath；worktree 标签来自 worktreeRoot。分支只消费传入投影，不查询 Git、不维护跨行缓存，不改变会话、workspace 或 store。

卡片持有本行打开状态与 300ms 打开计时器；鼠标／触控板进入或键盘可见焦点可打开，触屏合成 pointerenter 不打开。禁用、目标替换和卸载清理旧计时器与浮层。焦点和指针均离开时关闭；浮层内选择复制不触发行菜单。

本地展示固定使用 base services，远程输入才使用对应 workspace 解析；路径相同不能继承另一连接。远程未就绪时不请求 system.info，使用原始路径。控件没有业务状态或写命令。
