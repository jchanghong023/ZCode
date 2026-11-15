import { collectGenUiSourcePaths, matchesGenUiSourcePath } from "@/gen-ui/contract.js";
export const sourceFileExample = matchesGenUiSourcePath(
  "/work/demo.html",
  collectGenUiSourcePaths('::visualize{"path":"/work/demo.html"}'),
);
