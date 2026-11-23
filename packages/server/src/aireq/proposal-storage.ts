/** Stable business IDs own their material directories. */
export function prototypeChangeRoot(srId: string): string {
  return `openspec/changes/${srId}`;
}
export function prototypeIrRoot(irId: string): string {
  return `docs/requirements/${irId}`;
}
export function prototypeSpecPath(srId: string): string {
  return `${prototypeChangeRoot(srId)}/specs/${srId}/spec.md`;
}
