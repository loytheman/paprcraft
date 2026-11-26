// yarn run-webhook
// 1. Starts an ngrok tunnel → https://localhost:3006
// 2. Prints the public URL to paste into YCloud webhook settings
// 3. Fires test webhook payloads against localhost
// 4. Keeps the tunnel alive until Ctrl+C (so YCloud can send real events)

import { spawn } from "child_process";
import https from "https";
import http from "http";

const LOCAL_URL = "https://localhost:3004";
const WEBHOOK_PATH_HITPAY = "/v1/ext/hitpay/webhook";


// ── ngrok ────────────────────────────────────────────────────────────────────

const getNgrokApi = () =>
  new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:4040/api/tunnels", (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const tunnels = JSON.parse(data).tunnels ?? [];
          const tunnel = tunnels.find((t) => t.proto === "https");
          resolve(tunnel?.public_url ?? null);
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });

const startNgrok = () =>
  new Promise((resolve, reject) => {
    const proc = spawn("ngrok", ["http", LOCAL_URL, "--log=stdout"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stderr.on("data", (d) => process.stderr.write(d));
    proc.on("error", () => reject(new Error("ngrok not found — run: brew install ngrok")));
    proc.on("exit", (code) => { if (code !== 0 && code !== null) reject(new Error(`ngrok exited with code ${code}`)); });

    let attempts = 0;
    const poll = () => {
      attempts++;
      if (attempts > 30) return reject(new Error("ngrok tunnel didn't start in time"));
      http.get("http://127.0.0.1:4040/api/tunnels", (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const tunnels = JSON.parse(data).tunnels ?? [];
            const tunnel = tunnels.find((t) => t.proto === "https");
            if (tunnel) resolve({ proc, url: tunnel.public_url });
            else setTimeout(poll, 500);
          } catch { setTimeout(poll, 500); }
        });
      }).on("error", () => setTimeout(poll, 1000));
    };
    setTimeout(poll, 1500);
  });

// ── HTTP helper ───────────────────────────────────────────────────────────────

const post = (baseUrl, path, body) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const isHttps = url.protocol === "https:";
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      rejectUnauthorized: false, // allow self-signed local cert
      timeout: 10000,
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

const check = (label, res, expected = 200) => {
  const ok = res.status === expected;
  console.log(`  ${ok ? "✓" : "✗"} [${res.status}] ${label}`);
  if (!ok) console.log(`    body: ${res.body}`);
};

const ts = (offsetMinutes = 0) =>
  new Date(Date.now() + offsetMinutes * 60_000).toISOString();

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("\nStarting ngrok tunnel...");
let ngrokProc;
try {
  // reuse an already-running ngrok instance if one exists
  const existing = await getNgrokApi();
  let publicUrl;
  if (existing) {
    console.log("  (reusing existing ngrok session)");
    publicUrl = existing;
  } else {
    const { proc, url } = await startNgrok();
    ngrokProc = proc;
    publicUrl = url;
  }

  console.log(`\n  Tunnel ready: ${publicUrl}`);
  console.log(`\n  ┌─────────────────────────────────────────────────────────────────────┐`);
  console.log(`  │  Set Hitpay webhook URL to:                                         │`);
  console.log(`  │  ${(publicUrl + WEBHOOK_PATH_HITPAY).padEnd(67)}│`);
  console.log(`  └─────────────────────────────────────────────────────────────────────┘`);
  console.log(`\n  ngrok dashboard → http://localhost:4040\n`);

  // ── fire test payloads against localhost (fast, no tunnel latency) ──────────
  const wh = (body) => post(LOCAL_URL, WEBHOOK_PATH_HITPAY, body);

  // pre-flight: verify dev server is up before running payloads
  try {
    await wh({ id: "evt_ping", type: "__ping__" });
  } catch (e) {
    const msg = e.errors?.map((x) => x.message).join(", ") || e.message;
    if (msg.includes("ECONNREFUSED")) throw Object.assign(new Error(), { code: "ECONNREFUSED" });
    throw e;
  }



  // console.log(`\nAll done. Tunnel is live — real YCloud events will hit your local server.`);
  console.log(`Press Ctrl+C to stop.\n`);
  console.log(`Tip: run "yarn clear-chat" afterward to clear test records.\n`);

  // Keep alive until Ctrl+C
  await new Promise(() => {});

} catch (err) {
  const detail = err.errors?.map((e) => e.message).join(", ") || err.message || String(err);
  if (err.code === "ECONNREFUSED" || detail.includes("ECONNREFUSED")) {
    console.error(`\n✗ Could not reach ${LOCAL_URL} — is "yarn dev" running?\n`);
  } else {
    console.error(`\nError: ${detail}\n`);
  }
  ngrokProc?.kill();
  process.exit(1);
}
