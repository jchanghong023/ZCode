import { createWebPlatform } from "#src/platform/index.js";

export async function saveBrowserFileExample(data: ArrayBuffer) {
  // 此处 success 表示下载已发起，浏览器不提供实际落盘结果。
  return createWebPlatform().saveFile({ data, suggestedName: "report.pdf" });
}

export async function reportSessionCreateTelemetryExample() {
  // resolve 只证明同源接收端已接纳；失败会 reject，不承诺第三方上传或持久化。
  await createWebPlatform().reportTelemetryEvent({
    elementName: "session_create",
    eventRegion: "app",
    eventType: "result",
    // 同源遥测 schema 要求详情对象；本事件没有额外字段。
    eventExtraDetail: {},
    context: { clientTimezone: "UTC", clientLanguage: "zh-CN", screenResolution: "1440x1000" },
  });
}
