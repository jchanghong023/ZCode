import { ArrowUp, Folder } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ConversationCommandCatalogEntry } from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@zcode/ui/button";
import { LexicalChatInput, type LexicalChatInputHandle } from "@zcode/ui/web-chat-view";

import type { ChatDraft } from "./useChatInput.js";

// 宿主提供目录和发送提交，编辑与键盘行为由原生输入器处理。
export function ChatComposer({
  directory,
  workspacePath,
  workspaceIdentity,
  sessionId,
  setDirectory,
  draft,
  setText,
  disabled,
  modelPicker,
  send,
  conversationCommands,
  stopButton,
}: {
  directory?: string;
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId?: string;
  setDirectory: (path: string) => void;
  draft: ChatDraft;
  setText: (text: string) => void;
  disabled: boolean;
  modelPicker?: ReactNode;
  send: (text: string) => void;
  conversationCommands: readonly ConversationCommandCatalogEntry[];
  stopButton?: ReactNode;
}) {
  const editor = useRef<LexicalChatInputHandle>(null);
  const editorText = useRef("");
  const [triggerPanelContainer, setTriggerPanelContainer] = useState<HTMLDivElement | null>(null);
  const canSend =
    !disabled &&
    !draft.receipt &&
    Boolean(draft.text.trim()) &&
    (directory === undefined || Boolean(directory.trim()));

  const onChange = useCallback(
    (text: string) => {
      editorText.current = text;
      setText(text);
    },
    [setText],
  );
  useEffect(() => {
    const api = editor.current;
    if (!api || editorText.current === draft.text) return;
    editorText.current = draft.text;
    if (draft.text) api.setText(draft.text);
    else api.clear();
  }, [draft.text]);

  function submit(text: string) {
    if (!canSend || !text.trim()) return;
    send(text);
  }

  return (
    <form
      className="composer relative"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submit(editor.current?.getMarkdown() ?? draft.text);
      }}
    >
      {/* 原生斜杠菜单通过 portal 挂载；独立聊天使用自己的输入区锚点。 */}
      <div ref={setTriggerPanelContainer} className="absolute inset-x-0 bottom-full z-20" />
      {directory !== undefined && (
        <label className="directory-field">
          <Folder size={16} aria-hidden="true" />
          <span>工作目录</span>
          <input
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
            placeholder="输入服务端目录"
            spellCheck={false}
          />
        </label>
      )}
      <div className="composer-box">
        <LexicalChatInput
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          taskId={sessionId ?? null}
          placeholder="给 Agent 发消息…"
          inputTestId="web-chat-input"
          editorApiRef={editor}
          enableMentionPanel={false}
          conversationCommands={conversationCommands}
          triggerPanelContainer={triggerPanelContainer}
          submitDisabled={!canSend}
          onChange={onChange}
          onSubmit={(text) => {
            submit(text);
            return false;
          }}
        />
        <div className="composer-actions">
          <span>Enter 发送 · Shift + Enter 换行</span>
          <div className="flex min-w-0 items-center gap-2">
            {modelPicker && <fieldset>{modelPicker}</fieldset>}
            {stopButton}
            <Button size="icon" type="submit" aria-label="发送消息" disabled={!canSend}>
              <ArrowUp size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
