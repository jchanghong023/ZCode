import { ArrowUp, Folder } from "lucide-react";
import { useCallback, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "@zcode/ui/button";
import { LexicalChatInput, type LexicalChatInputHandle } from "@zcode/ui/web-chat-view";

export interface ChatDraft {
  text: string;
  sending: boolean;
  error: string;
}

export type UpdateChatDraft = (update: (current: ChatDraft) => ChatDraft) => void;

// 宿主提供目录和发送提交，编辑与键盘行为由原生输入器处理。
export function ChatComposer({
  directory,
  workspacePath,
  workspaceIdentity,
  sessionId,
  setDirectory,
  draft,
  updateDraft,
  disabled,
  modelPicker,
  send,
}: {
  directory?: string;
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId?: string;
  setDirectory: (path: string) => void;
  draft: ChatDraft;
  updateDraft: UpdateChatDraft;
  disabled: boolean;
  modelPicker?: ReactNode;
  send: (text: string) => Promise<boolean>;
}) {
  const editor = useRef<LexicalChatInputHandle>(null);
  const editorText = useRef("");
  const creating = directory !== undefined && draft.sending;
  const canSend =
    !disabled &&
    !draft.sending &&
    Boolean(draft.text.trim()) &&
    (directory === undefined || Boolean(directory.trim()));

  const onChange = useCallback(
    (text: string) => {
      editorText.current = text;
      updateDraft((current) => (current.text === text ? current : { ...current, text }));
    },
    [updateDraft],
  );
  useEffect(() => {
    const api = editor.current;
    if (!api || editorText.current === draft.text) return;
    editorText.current = draft.text;
    if (draft.text) api.setText(draft.text);
    else api.clear();
  }, [draft.text]);

  async function submit(text: string) {
    if (!canSend || !text.trim()) return;
    // 结果回调使用同一草稿键；切到历史再回来也只清除本次已确认的正文。
    updateDraft((current) => ({ ...current, text, sending: true }));
    let accepted = false;
    try {
      accepted = await send(text.trim());
    } finally {
      updateDraft((current) => ({
        ...current,
        text: accepted && current.text === text ? "" : current.text,
        sending: false,
      }));
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submit(editor.current?.getMarkdown() ?? draft.text);
      }}
    >
      {directory !== undefined && (
        <label className="directory-field">
          <Folder size={16} aria-hidden="true" />
          <span>工作目录</span>
          <input
            value={directory}
            readOnly={creating}
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
          disabled={creating}
          submitDisabled={!canSend}
          onChange={onChange}
          onSubmit={(text) => {
            void submit(text);
            return false;
          }}
        />
        <div className="composer-actions">
          <span>Enter 发送 · Shift + Enter 换行</span>
          <div className="flex min-w-0 items-center gap-2">
            {modelPicker && <fieldset disabled={draft.sending}>{modelPicker}</fieldset>}
            <Button size="icon" type="submit" aria-label="发送消息" disabled={!canSend}>
              <ArrowUp size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
