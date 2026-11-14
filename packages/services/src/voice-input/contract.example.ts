import type { IVoiceInputService, VoiceInputErrorCode } from "./contract.js";

/**
 * Composer 语音输入的真实调用：开始一次 attempt，按顺序送 16kHz PCM16 音频，再等 completed；
 * 每个 attempt 只有一个终态事件，日志与结果都不回传音频、ticket 或 JWT。
 */
export async function exampleVoiceInputDictation(
  service: IVoiceInputService,
  audioChunks: readonly Uint8Array[],
): Promise<{ text: string | null; error: VoiceInputErrorCode | null }> {
  let text: string | null = null;
  let error: VoiceInputErrorCode | null = null;
  const subscription = service.onEvent((event) => {
    if (event.type === "result" || event.type === "completed") text = event.text;
    else if (event.type === "error") error = event.code;
  });
  try {
    await service.start({ attemptId: "attempt-1", language: "zh-CN" });
    for (const chunk of audioChunks) {
      await service.sendAudio({ attemptId: "attempt-1", chunk });
    }
    await service.finish({ attemptId: "attempt-1" });
    return { text, error };
  } finally {
    subscription.dispose();
  }
}
