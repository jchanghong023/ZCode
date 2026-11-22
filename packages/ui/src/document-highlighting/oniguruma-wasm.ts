import wasmUrl from "shiki/onig.wasm?url";

// Match Shiki's instantiator module so it still owns engine initialization.
export default function instantiateOniguruma(
  imports: WebAssembly.Imports | undefined,
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  return WebAssembly.instantiateStreaming(fetch(wasmUrl), imports);
}
