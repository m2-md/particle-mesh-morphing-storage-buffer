/**
 * three'nin `exports` haritasında `./package.json` YOK; `require("three/package.json")`
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` fırlatır. Sürümü paketin çözülen dosya yolundan okuyoruz.
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
