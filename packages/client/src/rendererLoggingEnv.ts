type RendererImportMetaEnv = {
  readonly PROD?: boolean;
};

export function isRendererProductionBuild(): boolean {
  return ((import.meta as ImportMeta & { env?: RendererImportMetaEnv }).env ?? {}).PROD === true;
}
