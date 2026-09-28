// The built single-file UI is embedded at bundle time (works with `bun build --compile`).
import html from "../../ui/dist/index.html" with { type: "text" };
export const UI_HTML: string = html as unknown as string;
