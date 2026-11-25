import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { takeRequirement } from "./business.js";
import { connectST, unique, waitUntil } from "./client.js";
import { config, requireConfig } from "./config.js";
import { openNative } from "./native.js";

type Client = Awaited<ReturnType<typeof connectST>>;
type Native = Awaited<ReturnType<typeof openNative>>;
const cleanup: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  const failures: unknown[] = [];
  while (cleanup.length) {
    try {
      await cleanup.pop()!();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Attachment ST connection cleanup failed");
});

async function connect(employeeId = config.employeeId) {
  const client = await connectST(employeeId);
  cleanup.push(async () => client.close());
  return client;
}

async function open(client: Client, remote: Parameters<typeof openNative>[1]) {
  const native = await openNative(client, remote);
  cleanup.push(async () => native.close());
  return native;
}

async function context() {
  const client = await connect();
  // 附件一经会话采用就会留下历史；每个写入用例各占一个预置 IR。
  const requirement = await takeRequirement(client);
  const native = await open(client, requirement.remote);
  return { client, requirement, native };
}

function target(native: Native, uploadId: string) {
  return { ...native.workspace, sessionId: native.sessionId, uploadId };
}

function checksum(bytes: Uint8Array) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function begin(
  client: Client,
  native: Native,
  bytes: Uint8Array,
  options: { checksum?: string; totalChunks?: number } = {},
) {
  const uploadId = unique("upload");
  const params = target(native, uploadId);
  const receipt = await client.services.zcodeAgentService.attachmentBeginV4({
    ...params,
    fileName: "需求说明.txt",
    mime: "text/plain",
    totalBytes: bytes.byteLength,
    totalChunks: options.totalChunks ?? (bytes.byteLength ? 1 : 0),
    checksum: options.checksum ?? checksum(bytes),
  });
  expect(receipt).toEqual({ state: "staging", nextChunkIndex: 0 });
  return params;
}

async function upload(client: Client, native: Native, bytes: Uint8Array) {
  const params = await begin(client, native, bytes);
  if (bytes.byteLength) {
    const chunk = await client.services.zcodeAgentService.attachmentChunkV4({
      ...params,
      chunkIndex: 0,
      dataBase64: Buffer.from(bytes).toString("base64"),
    });
    expect(chunk).toEqual({ nextChunkIndex: 1 });
  }
  const receipt = await client.services.zcodeAgentService.attachmentCommitV4(params);
  expect(receipt.ref).toEqual(expect.any(String));
  expect(receipt.ref.length).toBeGreaterThan(0);
  return { params, ref: receipt.ref };
}

async function adopt(native: Native, ref: string, bytes: number) {
  const text = unique("请阅读附件中的需求说明并指出需要澄清的业务边界");
  const ack = await native.send("sendText", {
    text,
    attachments: [{ ref, fileName: "需求说明.txt", mime: "text/plain", bytes }],
  });
  expect(["accepted", "duplicate"]).toContain(ack.status);
  const snapshot = await waitUntil(
    "canonical user input has adopted the committed attachment",
    () => native.snapshot(),
    (value) =>
      value.rows.window.some(
        (row) =>
          row.kind === "userInput" &&
          row.text === text &&
          row.attachments?.some((attachment) => attachment.ref === ref),
      ),
  );
  const row = snapshot.rows.window.find(
    (value) => value.kind === "userInput" && value.text === text,
  );
  if (!row || row.kind !== "userInput" || !row.entityId)
    throw new Error("Canonical adopted attachment row must have a stable entityId");
  const attachmentIndex = row.attachments!.findIndex((attachment) => attachment.ref === ref);
  return { target: { rowId: row.rowId, entityId: row.entityId }, attachmentIndex };
}

function readParams(native: Native, ref: string) {
  return { ...native.workspace, sessionId: native.sessionId, ref, offset: 0, limit: 512 * 1024 };
}

describe("attachment transactions through the deployed backend", () => {
  it("adopts exact UTF-8 bytes, reads byte ranges and EOF, and retains adopted bytes after abort", async () => {
    const { client, native } = await context();
    const bytes = Buffer.from("需求说明：中文、emoji 🌏、换行\n第二行。", "utf8");
    const { params, ref } = await upload(client, native, bytes);
    const adopted = await adopt(native, ref, bytes.length);
    const read = { ...readParams(native, ref), ...adopted };

    const whole = await client.services.zcodeAgentService.attachmentReadV4(read);
    expect(Buffer.from(whole.dataBase64, "base64")).toEqual(bytes);
    expect(whole).toEqual({
      dataBase64: expect.any(String),
      mediaType: "text/plain",
      totalBytes: bytes.length,
    });

    const first = await client.services.zcodeAgentService.attachmentReadV4({ ...read, limit: 5 });
    expect(Buffer.from(first.dataBase64, "base64")).toEqual(bytes.subarray(0, 5));
    expect(first.totalBytes).toBe(bytes.length);
    const rest = await client.services.zcodeAgentService.attachmentReadV4({ ...read, offset: 5 });
    expect(
      Buffer.concat([
        Buffer.from(first.dataBase64, "base64"),
        Buffer.from(rest.dataBase64, "base64"),
      ]),
    ).toEqual(bytes);
    const eof = await client.services.zcodeAgentService.attachmentReadV4({
      ...read,
      offset: bytes.length,
    });
    expect(eof).toMatchObject({ dataBase64: "", totalBytes: bytes.length });

    await client.services.zcodeAgentService.attachmentAbortV4(params);
    const retained = await client.services.zcodeAgentService.attachmentReadV4(read);
    expect(Buffer.from(retained.dataBase64, "base64")).toEqual(bytes);
  });

  it("requires ordered chunks, permits identical chunk retries and rejects changed accepted chunks", async () => {
    const { client, native } = await context();
    const bytes = Buffer.from("第一部分\n第二部分", "utf8");
    const split = 7;
    const params = await begin(client, native, bytes, { totalChunks: 2 });
    const first = {
      ...params,
      chunkIndex: 0,
      dataBase64: bytes.subarray(0, split).toString("base64"),
    };
    const second = {
      ...params,
      chunkIndex: 1,
      dataBase64: bytes.subarray(split).toString("base64"),
    };

    await expect(client.services.zcodeAgentService.attachmentChunkV4(second)).rejects.toThrow();
    expect(await client.services.zcodeAgentService.attachmentChunkV4(first)).toMatchObject({
      nextChunkIndex: 1,
    });
    expect(await client.services.zcodeAgentService.attachmentChunkV4(first)).toMatchObject({
      nextChunkIndex: 1,
    });
    await expect(
      client.services.zcodeAgentService.attachmentChunkV4({
        ...first,
        dataBase64: Buffer.from("改写").toString("base64"),
      }),
    ).rejects.toThrow();
    expect(await client.services.zcodeAgentService.attachmentChunkV4(second)).toMatchObject({
      nextChunkIndex: 2,
    });
    const { ref } = await client.services.zcodeAgentService.attachmentCommitV4(params);
    const adopted = await adopt(native, ref, bytes.length);
    const result = await client.services.zcodeAgentService.attachmentReadV4({
      ...readParams(native, ref),
      ...adopted,
    });
    expect(Buffer.from(result.dataBase64, "base64")).toEqual(bytes);
  });

  it("cancels staging without adopting content or damaging another adopted attachment", async () => {
    const { client, native } = await context();
    const bytes = Buffer.from("应保留的附件", "utf8");
    const good = await upload(client, native, bytes);
    const adopted = await adopt(native, good.ref, bytes.length);
    const before = (await native.snapshot()).rows.window.filter((row) => row.kind === "userInput");
    const cancelledBytes = Buffer.from("取消的上传");
    const cancelled = await begin(client, native, cancelledBytes);
    await client.services.zcodeAgentService.attachmentChunkV4({
      ...cancelled,
      chunkIndex: 0,
      dataBase64: cancelledBytes.toString("base64"),
    });
    await client.services.zcodeAgentService.attachmentAbortV4(cancelled);
    await expect(client.services.zcodeAgentService.attachmentCommitV4(cancelled)).rejects.toThrow();
    expect((await native.snapshot()).rows.window.filter((row) => row.kind === "userInput")).toEqual(
      before,
    );
    const result = await client.services.zcodeAgentService.attachmentReadV4({
      ...readParams(native, good.ref),
      ...adopted,
    });
    expect(Buffer.from(result.dataBase64, "base64")).toEqual(bytes);
  });

  it("rejects malformed chunks, wrong digests and invalid ranges without corrupting adopted bytes", async () => {
    const { client, native } = await context();
    const bytes = Buffer.from("不能被错误请求覆盖的正文", "utf8");
    const good = await upload(client, native, bytes);
    const adopted = await adopt(native, good.ref, bytes.length);
    const bad = await begin(client, native, bytes, { checksum: `sha256:${"0".repeat(64)}` });
    await expect(
      client.services.zcodeAgentService.attachmentChunkV4({
        ...bad,
        chunkIndex: 0,
        dataBase64: "%%%=",
      }),
    ).rejects.toThrow();
    await client.services.zcodeAgentService.attachmentChunkV4({
      ...bad,
      chunkIndex: 0,
      dataBase64: bytes.toString("base64"),
    });
    await expect(client.services.zcodeAgentService.attachmentCommitV4(bad)).rejects.toThrow();
    await client.services.zcodeAgentService.attachmentAbortV4(bad);
    const read = { ...readParams(native, good.ref), ...adopted };
    for (const invalid of [{ offset: -1 }, { limit: 0 }, { limit: 512 * 1024 + 1 }]) {
      await expect(
        client.services.zcodeAgentService.attachmentReadV4({ ...read, ...invalid }),
      ).rejects.toThrow();
    }
    expect(
      Buffer.from(
        (await client.services.zcodeAgentService.attachmentReadV4(read)).dataBase64,
        "base64",
      ),
    ).toEqual(bytes);
  });

  it("shares adopted canonical attachments with another employee while keeping private staging unreadable", async () => {
    const otherEmployeeId = requireConfig(config.otherEmployeeId, "otherEmployeeId");
    if (otherEmployeeId === config.employeeId)
      throw new Error("Attachment cross-employee ST requires two distinct employee identities");
    const { client, native, requirement } = await context();
    const other = await connect(otherEmployeeId);
    const otherNative = await open(other, requirement.remote);
    const bytes = Buffer.from("可共享的是已采用附件，不是私人暂存", "utf8");
    const shared = await upload(client, native, bytes);
    const privateBytes = Buffer.from("不得泄露的私人草稿", "utf8");
    const privateUpload = await upload(client, native, privateBytes);
    await expect(
      other.services.zcodeAgentService.attachmentReadV4(readParams(otherNative, shared.ref)),
    ).rejects.toThrow();
    await expect(
      other.services.zcodeAgentService.attachmentReadV4(readParams(otherNative, privateUpload.ref)),
    ).rejects.toThrow();
    const adopted = await adopt(native, shared.ref, bytes.length);
    const read = { ...readParams(otherNative, shared.ref), ...adopted };
    expect(
      Buffer.from(
        (await other.services.zcodeAgentService.attachmentReadV4(read)).dataBase64,
        "base64",
      ),
    ).toEqual(bytes);
    await expect(
      other.services.zcodeAgentService.attachmentReadV4({
        ...read,
        attachmentIndex: adopted.attachmentIndex + 1,
      }),
    ).rejects.toThrow();
    await expect(
      other.services.zcodeAgentService.attachmentReadV4({
        ...read,
        workspaceIdentity: unique("wrong-workspace"),
      }),
    ).rejects.toThrow();
    await expect(
      other.services.zcodeAgentService.attachmentReadV4(readParams(otherNative, privateUpload.ref)),
    ).rejects.toThrow();
    await client.services.zcodeAgentService.attachmentAbortV4(privateUpload.params);
  });
});
