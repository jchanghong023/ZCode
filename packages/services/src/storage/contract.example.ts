import type { IStorageService } from "./contract.js";

/**
 * 资源管理器「数据与统计 → 存储」tab 的真实调用序列：开始扫描 → 读进度快照 → 按类别清理。
 * 快照与清理结果都由服务给出，UI 不自行读文件系统；扫到终态之前取消只影响当前 job。
 */
export async function exampleStorageScanAndClean(service: IStorageService) {
  let progressSnapshots = 0;
  const progress = service.onScanProgress(() => {
    progressSnapshots += 1;
  });
  try {
    const { jobId } = await service.startScan();
    const snapshot = await service.getSnapshot();
    if (snapshot?.jobId !== jobId || snapshot.status !== "complete") {
      await service.cancelScan(jobId);
      return { freedBytes: 0, progressSnapshots };
    }
    const result = await service.clean({ rootId: "home", categoryId: "logs" });
    return { freedBytes: result.freedBytes, progressSnapshots };
  } finally {
    progress.dispose();
    service.dispose();
  }
}
