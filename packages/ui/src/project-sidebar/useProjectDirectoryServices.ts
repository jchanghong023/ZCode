import { useMemo } from "react";
import type { IProjectService } from "@/project-sidebar/contract.js";

/** 目录查询沿用项目服务路由，手机无需桌面专用 attachment，也不借当前 tab 的文件服务。 */
export function useProjectDirectoryServices(service: IProjectService) {
  return useMemo(
    () => ({
      services: {
        systemService: {
          info: async () => ({ homedir: (await service.readDirectory()).path }),
        },
        fileService: {
          readdir: async (params: { path: string; includeHidden?: boolean }) =>
            (await service.readDirectory(params)).entries,
        },
      },
    }),
    [service],
  );
}
