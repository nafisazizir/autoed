/** Builds universal-ready binaries: dist/autoed-darwin-arm64 and dist/autoed-darwin-x64. Run `bun run build:ui` first (the `build` script does). */
import { existsSync, mkdirSync } from "node:fs";
if (!existsSync("ui/dist/index.html")) { console.error("ui/dist/index.html missing: run `bun run build:ui`"); process.exit(1); }
mkdirSync("dist", { recursive: true });
const targets = (process.argv[2] ? [process.argv[2]] : ["bun-darwin-arm64", "bun-darwin-x64"]) as string[];
for (const t of targets) {
  const out = `dist/autoed-${t.replace("bun-", "")}`;
  const proc = Bun.spawn(["bun", "build", "--compile", "--minify", `--target=${t}`, "src/index.ts", "--outfile", out], { stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) process.exit(1);
  console.log(`built ${out}`);
}
