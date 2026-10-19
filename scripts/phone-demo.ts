import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { spawn } from "node:child_process";
import { attachPhoneRelay } from "./phone/relay";

const root = resolve("dist"),
  port = Number(process.env.PHONE_PORT || 4173);
const wireless = process.argv.includes("--wireless");
let publicOrigin = "";
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};
try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error("Build the app first: npm run build");
  process.exit(1);
}
const server = createServer((req, res) => {
  relay.middleware(req, res, () => {
    void (async () => {
      const path = decodeURIComponent(
        new URL(req.url || "/", "http://localhost").pathname,
      );
      let file = resolve(root, `.${path}`);
      if (!file.startsWith(`${root}/`) && file !== root) {
        res.writeHead(403).end();
        return;
      }
      if (path === "/" || path === "/phone") file = resolve(root, "index.html");
      try {
        const body = await readFile(file);
        res.setHeader(
          "Content-Type",
          types[extname(file)] || "application/octet-stream",
        );
        res.setHeader("Referrer-Policy", "no-referrer");
        res.end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    })().catch(() => res.writeHead(400).end("Invalid request"));
  });
});
const relay = attachPhoneRelay(server, () => publicOrigin);
server.on("error", (error) => {
  console.error(error.message);
  tunnel?.kill();
  relay.close();
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Trinetra phone demo: http://localhost:${port}`);
  console.log(
    `USB fallback: adb reverse tcp:${port} tcp:${port} — open http://localhost:${port} on phone.`,
  );
});
let tunnel: ReturnType<typeof spawn> | undefined;
if (wireless) {
  tunnel = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  tunnel.on("error", () =>
    console.error(
      "Wireless needs cloudflared. On Mac: brew install cloudflared. USB mode remains available.",
    ),
  );
  const output = (data: Buffer) => {
    const match = data
      .toString()
      .match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      publicOrigin = match[0];
      console.log(
        `Wireless ready: ${publicOrigin} — open Phone view on your laptop to scan the QR.`,
      );
    }
  };
  tunnel.stdout?.on("data", output);
  tunnel.stderr?.on("data", output);
  tunnel.on("exit", () => {
    publicOrigin = "";
    console.log("Wireless tunnel stopped. USB mode remains available.");
  });
}
function stop() {
  tunnel?.kill();
  relay.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
