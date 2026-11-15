declare module "*.css";
declare module "@zcode/ui/styles.css";
// core-js 不带类型声明，polyfills.ts 只做副作用导入。
declare module "core-js/stable/*";

interface ImportMetaEnv {
  // 本文件手写声明了 Vite env 形状，内置 BASE_URL 也需要显式补上。
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_ZCODE_BASE_URL?: string;
  readonly VITE_ZCODE_ENDPOINT_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
