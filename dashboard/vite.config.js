import { spawnSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const bridgeScript = new URL("../scripts/dashboard_bridge.py", import.meta.url);

function runBridge(command, payload) {
  const result = spawnSync(
    "python3",
    [bridgeScript.pathname, command],
    {
      input: payload ? JSON.stringify(payload) : "",
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `bridge failed for ${command}`);
  }

  return JSON.parse(result.stdout || "{}");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function patchApiPlugin() {
  return {
    name: "patch-dashboard-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url === "/api/dashboard-state" && req.method === "GET") {
            sendJson(res, 200, runBridge("state"));
            return;
          }

          if (req.url === "/api/run-scan" && req.method === "POST") {
            sendJson(res, 200, runBridge("scan"));
            return;
          }

          if (req.url === "/api/commit-fix" && req.method === "POST") {
            const payload = await readJsonBody(req);
            sendJson(res, 200, runBridge("commit-fix", payload));
            return;
          }

          if (req.url === "/api/commit-fix-approved" && req.method === "POST") {
            const payload = await readJsonBody(req);
            sendJson(res, 200, runBridge("commit-fix-approved", payload));
            return;
          }
        } catch (error) {
          sendJson(res, 500, {
            status: "error",
            reason: error instanceof Error ? error.message : "unknown api error",
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), patchApiPlugin()],
});
