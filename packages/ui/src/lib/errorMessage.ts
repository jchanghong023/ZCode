export function getErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);

  // 远程连接链路里有的错误已经带了 "Error: ..." 前缀，
  // 上层再包装成 Error 或直接 String(error) 展示时，会叠成 "Error: Error: ..."。
  // 这里统一剥掉重复前缀，只保留真正有意义的错误内容。
  return rawMessage.replace(/^(Error:\s*)+/i, "").trim();
}

const PUBLIC_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  UNSUPPORTED_OPERATION: "当前服务暂不支持此操作。",
  SERVICE_UNAVAILABLE: "此功能暂不可用，请刷新后重试。",
  UNKNOWN_PATH: "此操作不可用，请刷新页面后重试。",
  INVALID_ARGUMENT: "请求参数无效，请检查输入后重试。",
  "fault.command.sessionNotFound": "会话暂不可用，请重新连接。",
  "proto.sessionNotResident": "会话暂不可用，请重新连接。",
  "fault.subscription.unknownSubscription": "会话连接已失效，请重新连接。",
  "fault.command.capabilityUnsupported": "当前服务暂不支持此操作。",
  "fault.sessionLifecycle.unsupported": "当前服务不支持重启会话，请重新连接。",
  "fault.command.invalidEnvelope": "请求无效，请刷新页面后重试。",
  "fault.attachment.invalidServerProgress": "附件上传状态异常，请重新上传。",
  "fault.attachment.checksumUnavailable": "无法校验附件，请重新添加文件。",
  "proto.invalidBase64": "附件内容无效，请重新添加文件。",
  remoteAttachmentNotStaged: "附件尚未就绪，请重新添加文件。",
  SEND_FAILED: "发送失败，请稍后重试。",
  WORKSPACE_PREPARE_FAILED: "会话暂不可用，请重新连接。",
  "proto.invalidAttachment": "附件内容无效，请重新添加文件。",
  ECONNREFUSED: "连接暂不可用，请稍后重试。",
  ECONNRESET: "连接已中断，请重新连接。",
  ETIMEDOUT: "请求超时，请稍后重试。",
};

// 既有原生服务中明确的业务门禁；不把任意服务端异常当成可公开文案。
const PUBLIC_NATIVE_BUSINESS_MESSAGES: Readonly<Record<string, string>> = {
  "会话已切换，请在当前会话中重试。": "会话已切换，请在当前会话中重试。",
  "相同消息编号不能用于不同正文。": "消息内容与此前的提交不一致，请重新发送。",
  "消息编号冲突。": "消息内容与此前的提交不一致，请重新发送。",
  "历史评审仅供只读查看。": "历史评审仅供只读查看。",
  "当前或历史会话只读，请回到有效讨论阶段。": "此会话只读，请回到当前讨论阶段。",
  "当前材料已变化，拒绝迟到的原生业务完成结果。": "材料已更新，请重新读取后继续操作。",
  "消息未接纳。": "消息尚未发送成功，请重试。",
  "最多接纳八个附件。": "最多添加八个附件。",
  "此 Agent 会话保留创建时模型和思考强度，请修改平台配置后用于新会话。":
    "此会话保留创建时的模型配置。配置修改后会用于新会话。",
  "附件不存在。": "附件已不可用，请重新添加文件。",
  附件缺少可读取内容: "无法读取附件内容，请重新添加文件。",
  "附件元数据无效。": "附件信息无效，请重新添加文件。",
  "附件块不是有效 base64。": "附件内容无效，请重新添加文件。",
  "附件块无效或过大。": "附件内容无效，请重新添加文件。",
  "附件块顺序或大小不符。": "附件上传不完整，请重新上传。",
  "附件块尚未上传完整。": "附件上传不完整，请重新上传。",
  "附件大小或 SHA-256 校验失败。": "附件校验失败，请重新添加文件。",
  "附件上传不存在或归属不符。": "附件上传已失效，请重新上传。",
  "附件不属于当前会话投影。": "此附件无法在当前会话中读取。",
};

// 格式化后的稳定文案可穿过 pane-local 包装，不能在下一层又变成笼统失败。
const PUBLIC_PRESENTATION_MESSAGES = new Set([
  ...Object.values(PUBLIC_ERROR_MESSAGES),
  ...Object.values(PUBLIC_NATIVE_BUSINESS_MESSAGES),
]);

/** 用户界面只接收已知错误或服务端明确标记的安全业务错误；原始异常留给诊断。 */
export function formatUserFacingError(error: unknown, fallback: string): string {
  const record =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; reasonCode?: unknown; message?: unknown })
      : undefined;
  const message =
    typeof record?.message === "string"
      ? record.message.trim()
      : typeof error === "string"
        ? getErrorMessage(error)
        : "";
  const code =
    typeof record?.code === "string"
      ? record.code
      : typeof record?.reasonCode === "string"
        ? record.reasonCode
        : "";
  if (code === "BUSINESS_RULE_VIOLATION" && message) return message;
  if (PUBLIC_PRESENTATION_MESSAGES.has(message)) return message;
  const known = PUBLIC_ERROR_MESSAGES[code];
  if (known) return known;
  // 兼容只传递 fault 字符串的原生订阅，不展示其后的会话编号或堆栈。
  const messageCode = message.match(/^([A-Za-z][A-Za-z0-9_.]*)(?=:|\s|$)/)?.[1];
  if (messageCode && PUBLIC_ERROR_MESSAGES[messageCode]) return PUBLIC_ERROR_MESSAGES[messageCode]!;
  const businessMessage = PUBLIC_NATIVE_BUSINESS_MESSAGES[message];
  if (businessMessage) return businessMessage;
  return fallback;
}
