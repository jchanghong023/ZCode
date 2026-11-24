export function documentLinkCommand(workDirectory: string | undefined): string | undefined {
  if (!workDirectory) return;
  if (/^[A-Za-z]:[\\/]/.test(workDirectory)) {
    const source = workDirectory.replaceAll("/", "\\").replace(/\\+$/, "") + "\\docs\\areq";
    const argument = "'" + source.replaceAll("'", "''") + "'";
    return (
      "New-Item -ItemType Junction -Path '.\\docs\\areq' -Target " + argument + " -ErrorAction Stop"
    );
  }
  if (!workDirectory.startsWith("/")) return;
  const source = workDirectory.replace(/\/+$/, "") + "/docs/areq";
  const argument = /^[A-Za-z0-9_./-]+$/.test(source)
    ? source
    : "'" + source.replaceAll("'", "'\\''") + "'";
  return `ln -s ${argument} ./docs/areq`;
}
