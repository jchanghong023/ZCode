export function documentLinkCommand(workDirectory: string | undefined): string | undefined {
  if (!workDirectory?.startsWith("/")) return;
  const source = workDirectory.replace(/\/+$/, "") + "/docs/areq";
  const argument = /^[A-Za-z0-9_./-]+$/.test(source)
    ? source
    : "'" + source.replaceAll("'", "'\\''") + "'";
  return `ln -s ${argument} ./docs/areq`;
}
