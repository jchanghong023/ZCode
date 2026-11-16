/// <reference types="node" />

// Bugfix：正式 UI 的 Vite 环境类型由本包持有，不能依赖已删除测试桥的全局声明。
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
