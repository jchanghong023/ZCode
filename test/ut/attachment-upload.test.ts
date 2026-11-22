import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATTACHMENT_UPLOAD_CHUNK_BYTES,
  uploadAttachmentTransaction,
  type AttachmentUploadAgent,
  type AttachmentUploadProgress,
} from "../../packages/ui/src/v4/attachmentUploadTransaction.js";

const workspace = { workspacePath: "/project", workspaceIdentity: "project:one" };
const receipt = { ref: "attachment:committed" };

function input(bytes: Uint8Array = new TextEncoder().encode("需求附件\nhello")) {
  return {
    sessionId: "session-one",
    fileName: "需求.txt",
    mime: "text/plain",
    dataBase64: Buffer.from(bytes).toString("base64"),
  };
}

function agent() {
  return {
    attachmentBeginV4: vi
      .fn<AttachmentUploadAgent["attachmentBeginV4"]>()
      .mockResolvedValue({ state: "staging", nextChunkIndex: 0 }),
    attachmentChunkV4: vi
      .fn<AttachmentUploadAgent["attachmentChunkV4"]>()
      .mockImplementation(async ({ chunkIndex, uploadId }) => ({
        uploadId,
        nextChunkIndex: chunkIndex + 1,
      })),
    attachmentCommitV4: vi
      .fn<AttachmentUploadAgent["attachmentCommitV4"]>()
      .mockResolvedValue(receipt),
    attachmentAbortV4: vi
      .fn<AttachmentUploadAgent["attachmentAbortV4"]>()
      .mockResolvedValue(undefined),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("frontend attachment upload transaction", () => {
  it("uploads exact binary bytes across chunk boundaries and commits the same transaction", async () => {
    const bytes = Uint8Array.from(
      { length: ATTACHMENT_UPLOAD_CHUNK_BYTES + 7 },
      (_, index) => index % 256,
    );
    const service = agent();
    const progress: AttachmentUploadProgress[] = [];

    expect(
      await uploadAttachmentTransaction(service, workspace, input(bytes), {
        onProgress: (value) => progress.push(value),
      }),
    ).toEqual(receipt);

    const begin = service.attachmentBeginV4.mock.calls[0]![0];
    expect(begin).toMatchObject({
      ...workspace,
      sessionId: "session-one",
      fileName: "需求.txt",
      mime: "text/plain",
      totalBytes: bytes.length,
      totalChunks: 2,
      checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
    const chunks = service.attachmentChunkV4.mock.calls.map(([chunk]) => chunk);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
    expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.dataBase64, "base64")))).toEqual(
      Buffer.from(bytes),
    );
    for (const chunk of chunks) {
      expect(chunk).toMatchObject({
        ...workspace,
        sessionId: begin.sessionId,
        uploadId: begin.uploadId,
      });
    }
    expect(service.attachmentCommitV4).toHaveBeenCalledWith({
      ...workspace,
      sessionId: begin.sessionId,
      uploadId: begin.uploadId,
    });
    expect(progress).toEqual([
      { phase: "uploading", uploadedBytes: 0, totalBytes: bytes.length },
      {
        phase: "uploading",
        uploadedBytes: ATTACHMENT_UPLOAD_CHUNK_BYTES,
        totalBytes: bytes.length,
      },
      { phase: "uploading", uploadedBytes: bytes.length, totalBytes: bytes.length },
      { phase: "committing", uploadedBytes: bytes.length, totalBytes: bytes.length },
    ]);
    expect(service.attachmentAbortV4).not.toHaveBeenCalled();
  });

  it("resumes at the acknowledged chunk without resending the stored prefix", async () => {
    const bytes = new Uint8Array(ATTACHMENT_UPLOAD_CHUNK_BYTES + 3);
    bytes.set([5, 9, 255], ATTACHMENT_UPLOAD_CHUNK_BYTES);
    const service = agent();
    service.attachmentBeginV4.mockResolvedValue({ state: "staging", nextChunkIndex: 1 });

    expect(await uploadAttachmentTransaction(service, workspace, input(bytes))).toEqual(receipt);

    const chunks = service.attachmentChunkV4.mock.calls.map(([chunk]) => chunk);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([1]);
    expect(Buffer.from(chunks[0]!.dataBase64, "base64")).toEqual(Buffer.from([5, 9, 255]));
  });

  it("returns an already committed receipt without sending chunks or committing again", async () => {
    const service = agent();
    service.attachmentBeginV4.mockResolvedValue({
      state: "committed",
      ref: "attachment:existing",
    });

    expect(await uploadAttachmentTransaction(service, workspace, input())).toEqual({
      ref: "attachment:existing",
    });
    expect(service.attachmentChunkV4).not.toHaveBeenCalled();
    expect(service.attachmentCommitV4).not.toHaveBeenCalled();
    expect(service.attachmentAbortV4).not.toHaveBeenCalled();
  });

  it("commits an empty file with its actual empty-content checksum and no chunks", async () => {
    const service = agent();
    expect(await uploadAttachmentTransaction(service, workspace, input(new Uint8Array()))).toEqual(
      receipt,
    );
    expect(service.attachmentBeginV4.mock.calls[0]![0]).toMatchObject({
      totalBytes: 0,
      totalChunks: 0,
      checksum: `sha256:${createHash("sha256").update("").digest("hex")}`,
    });
    expect(service.attachmentChunkV4).not.toHaveBeenCalled();
  });

  it("calculates the same real checksum when WebCrypto subtle is unavailable", async () => {
    const nativeCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      randomUUID: nativeCrypto.randomUUID.bind(nativeCrypto),
      getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
    });
    const service = agent();
    const bytes = new TextEncoder().encode("非安全上下文中的附件");
    await uploadAttachmentTransaction(service, workspace, input(bytes));
    expect(service.attachmentBeginV4.mock.calls[0]![0].checksum).toBe(
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
  });

  it.each(["A", "a===", "AA A", "AA=A"])(
    "rejects malformed base64 %j before opening an upload",
    async (dataBase64) => {
      const service = agent();
      await expect(
        uploadAttachmentTransaction(service, workspace, { ...input(), dataBase64 }),
      ).rejects.toThrow("proto.invalidBase64");
      expect(service.attachmentBeginV4).not.toHaveBeenCalled();
      expect(service.attachmentAbortV4).not.toHaveBeenCalled();
    },
  );

  it("rejects content above the documented 20 MiB upload limit before opening an upload", async () => {
    const service = agent();
    const dataBase64 = "AAAA".repeat(Math.ceil((20 * 1024 * 1024 + 1) / 3));
    await expect(
      uploadAttachmentTransaction(service, workspace, { ...input(), dataBase64 }),
    ).rejects.toThrow("proto.payloadTooLarge");
    expect(service.attachmentBeginV4).not.toHaveBeenCalled();
    expect(service.attachmentChunkV4).not.toHaveBeenCalled();
    expect(service.attachmentAbortV4).not.toHaveBeenCalled();
  });

  it("rejects an oversized physical begin request before opening an upload", async () => {
    const service = agent();
    await expect(
      uploadAttachmentTransaction(service, workspace, {
        ...input(),
        fileName: "a".repeat(1024 * 1024),
      }),
    ).rejects.toThrow("proto.frameTooLarge");
    expect(service.attachmentBeginV4).not.toHaveBeenCalled();
  });

  it("does not start or abort a transaction when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const service = agent();
    await expect(
      uploadAttachmentTransaction(service, workspace, input(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(service.attachmentBeginV4).not.toHaveBeenCalled();
    expect(service.attachmentAbortV4).not.toHaveBeenCalled();
  });

  it("aborts the opened upload if cancelled while a chunk is in flight", async () => {
    const controller = new AbortController();
    const service = agent();
    let release!: () => void;
    let entered!: () => void;
    const chunkEntered = new Promise<void>((resolve) => (entered = resolve));
    service.attachmentChunkV4.mockImplementation(async ({ uploadId }) => {
      entered();
      await new Promise<void>((resolve) => (release = resolve));
      return { uploadId, nextChunkIndex: 1 };
    });
    const uploading = uploadAttachmentTransaction(service, workspace, input(), {
      signal: controller.signal,
    });
    const rejection = expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    await chunkEntered;
    controller.abort();
    release();
    await rejection;
    expect(service.attachmentAbortV4).toHaveBeenCalledWith({
      ...workspace,
      sessionId: "session-one",
      uploadId: service.attachmentBeginV4.mock.calls[0]![0].uploadId,
    });
    expect(service.attachmentCommitV4).not.toHaveBeenCalled();
  });

  it.each(["begin", "chunk", "commit"] as const)(
    "preserves the %s failure and only aborts an opened transaction",
    async (phase) => {
      const service = agent();
      const failure = new Error(`${phase} failed`);
      const methods = {
        begin: service.attachmentBeginV4,
        chunk: service.attachmentChunkV4,
        commit: service.attachmentCommitV4,
      };
      methods[phase].mockRejectedValue(failure);
      service.attachmentAbortV4.mockRejectedValue(new Error("cleanup failed"));

      await expect(uploadAttachmentTransaction(service, workspace, input())).rejects.toBe(failure);
      if (phase === "begin") expect(service.attachmentAbortV4).not.toHaveBeenCalled();
      else expect(service.attachmentAbortV4).toHaveBeenCalledOnce();
      if (phase !== "commit") expect(service.attachmentCommitV4).not.toHaveBeenCalled();
    },
  );

  it.each(["begin", "chunk"] as const)(
    "rejects invalid %s progress, aborts the upload and does not commit partial data",
    async (phase) => {
      const service = agent();
      if (phase === "begin")
        service.attachmentBeginV4.mockResolvedValue({ state: "staging", nextChunkIndex: 2 });
      else
        service.attachmentChunkV4.mockImplementation(async ({ uploadId }) => ({
          uploadId,
          nextChunkIndex: 0,
        }));

      await expect(uploadAttachmentTransaction(service, workspace, input())).rejects.toThrow(
        "fault.attachment.invalidServerProgress",
      );
      expect(service.attachmentAbortV4).toHaveBeenCalledOnce();
      expect(service.attachmentCommitV4).not.toHaveBeenCalled();
    },
  );
});
