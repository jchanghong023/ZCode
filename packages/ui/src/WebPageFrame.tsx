import type { ReactNode } from "react";

export function WebPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden border-border text-foreground bg-background-win-alt">
      <div className="relative flex-1 min-h-0 w-full">{children}</div>
    </div>
  );
}
