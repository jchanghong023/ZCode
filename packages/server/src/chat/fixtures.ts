export const starterChatSessions = [
  {
    workspacePath: "docs",
    title: "整理接口文档",
    prompt: "帮我梳理接口文档应该包含哪些内容。",
    reply:
      "可以按 **用途、请求、响应、错误与示例** 五部分组织。先写最常见的调用，再补参数边界和失败场景。",
  },
  {
    workspacePath: "docs",
    title: "起草发布说明",
    prompt: "为本次更新拟一份发布说明提纲。",
    reply: "按三块整理发布说明：\n\n- 新增能力及使用入口\n- 对现有用户的影响\n- 已知限制和反馈方式",
  },
  {
    workspacePath: "docs",
    title: "检查入门指引",
    prompt: "从首次使用的角度检查入门指引。",
    reply:
      "优先检查用户能否找到入口、理解所需输入，并完成第一项任务。每一步都应给出可观察的完成状态。",
  },
  {
    workspacePath: "packages",
    title: "检查聊天组件",
    prompt: "列出聊天组件需要覆盖的主要交互。",
    reply:
      "先覆盖 **新建、发送、查看历史、继续会话**。再验证发送过程中切换会话，以及重连后是否恢复到同一份历史。",
  },
  {
    workspacePath: "packages",
    title: "验证会话恢复",
    prompt: "怎么验证刷新页面后还能继续同一条会话？",
    reply:
      "记下会话和最后一条消息，刷新后从列表打开该会话，再发送新消息。确认旧消息仍可见，新回复追加在同一个会话中。",
  },
  {
    workspacePath: "packages",
    title: "梳理模型切换",
    prompt: "列一下模型切换的三个验收场景。",
    reply:
      "1. 首发前选择模型。\n2. 已有会话切换后继续发送。\n3. 重新打开会话，确认当前模型和已有历史均可读取。",
  },
] as const;
