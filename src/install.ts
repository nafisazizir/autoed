import { chmodSync, copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { loginUser } from "./backends/discover.ts";
import { join, resolve } from "node:path";
import { APP_ID, type Paths } from "./config.ts";
import { runCapture } from "./backends/discover.ts";

function plistPath() { return join(homedir(), "Library", "LaunchAgents", `${APP_ID}.plist`); }

function escapeXml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/** Copies the running binary (or a bun launcher for source checkouts) into ~/.autoed/bin and loads a KeepAlive LaunchAgent. */
export async function install(paths: Paths, opts: { source?: string } = {}): Promise<string> {
  mkdirSync(paths.bin, { recursive: true, mode: 0o700 });
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  let program: string[];
  const isCompiled = !process.execPath.endsWith("/bun") && !process.argv[1]?.endsWith(".ts");
  if (isCompiled || opts.source) {
    const src = resolve(opts.source ?? process.execPath);
    const dest = join(paths.bin, "autoed");
    if (src !== dest) copyFileSync(src, dest);
    chmodSync(dest, 0o755);
    program = [dest, "serve"];
  } else {
    // Source checkout: run through bun. Keeps `bun run src/index.ts install` working during development.
    const entry = resolve(process.argv[1]!);
    program = [process.execPath, entry, "serve"];
  }
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${APP_ID}</string>
  <key>ProgramArguments</key>
  <array>
${program.map((p) => `    <string>${escapeXml(p)}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AUTOED_HOME</key><string>${escapeXml(paths.home)}</string>
    <key>HOME</key><string>${escapeXml(homedir())}</string>
    <key>USER</key><string>${escapeXml(loginUser() ?? "")}</string>
    <key>LOGNAME</key><string>${escapeXml(loginUser() ?? "")}</string>
    <key>PATH</key><string>${escapeXml(join(homedir(), ".local/bin") + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin")}</string>
  </dict>
  <key>WorkingDirectory</key><string>${escapeXml(paths.home)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${escapeXml(join(paths.logs, "engine.log"))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(join(paths.logs, "engine.err.log"))}</string>
</dict>
</plist>
`;
  const pp = plistPath();
  await runCapture(["launchctl", "bootout", `gui/${process.getuid?.() ?? 501}`, pp], { timeoutMs: 10000 }).catch(() => null);
  writeFileSync(pp, plist);
  const r = await runCapture(["launchctl", "bootstrap", `gui/${process.getuid?.() ?? 501}`, pp], { timeoutMs: 10000 });
  if (r.code !== 0) {
    const legacy = await runCapture(["launchctl", "load", "-w", pp], { timeoutMs: 10000 });
    if (legacy.code !== 0) throw new Error(`launchctl failed: ${r.stderr.trim() || legacy.stderr.trim()}`);
  }
  return pp;
}

export async function uninstall(): Promise<void> {
  const pp = plistPath();
  await runCapture(["launchctl", "bootout", `gui/${process.getuid?.() ?? 501}`, pp], { timeoutMs: 10000 }).catch(() => null);
  await runCapture(["launchctl", "unload", pp], { timeoutMs: 10000 }).catch(() => null);
  if (existsSync(pp)) unlinkSync(pp);
}
