/**
 * three's `exports` map lacks `./package.json`; `require("three/package.json")`
 * throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. We read version from resolved file path.
 */
export async function readThreeVersion(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const require = createRequire(import.meta.url);
  const entry = pathToFileURL(require.resolve("three")); // .../three/build/three.module.js
  const pkgUrl = new URL("../package.json", entry);
  const raw = await readFile(pkgUrl, "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}
