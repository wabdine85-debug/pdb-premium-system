import fs from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { classifyStorageWrite, getStorageRevision } from "./services/storageRevision.js";
import { createPremiumAdminProxy } from "./server/premium-admin-proxy.mjs";

const dataDir = path.resolve("data");
const dataFile = path.join(dataDir, "crm-data-v1.json");
const recoveredFile = path.resolve("public", "recovered-crm-data-v1.json");
let crmWriteQueue = Promise.resolve();

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonSafely(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const existing = await readJsonIfExists(file);
  if (existing) {
    const backupDir = path.join(path.dirname(file), "backups");
    const stamp = new Date().toISOString().slice(0, 10);
    const backupFile = path.join(backupDir, `crm-data-v1-${stamp}.json`);
    try {
      await fs.mkdir(backupDir, { recursive: true });
      await fs.access(backupFile);
    } catch {
      await fs.writeFile(backupFile, JSON.stringify(existing, null, 2));
    }
  }
  const tmpFile = `${file}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, file);
}

function crmPersistencePlugin() {
  return {
    name: "crm-persistence",
    configureServer(server) {
      server.middlewares.use("/api/crm-data", async (req, res) => {
        if (req.method === "GET") {
          const data = await readJsonIfExists(dataFile) || await readJsonIfExists(recoveredFile);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(data || {}));
          return;
        }

        if (req.method === "POST") {
          let body = "";
          req.setEncoding("utf8");
          req.on("data", chunk => { body += chunk; });
          req.on("end", async () => {
            crmWriteQueue = crmWriteQueue.then(async () => {
              try {
                const data = JSON.parse(body || "{}");
                const current = await readJsonIfExists(dataFile);
                const writeStatus = current ? classifyStorageWrite(data, current) : "newer";
                if (writeStatus === "duplicate") {
                  res.setHeader("Content-Type", "application/json; charset=utf-8");
                  res.end(JSON.stringify({ ok: true, duplicate: true }));
                  return;
                }
                if (["stale", "conflict"].includes(writeStatus)) {
                  res.statusCode = 409;
                  res.setHeader("Content-Type", "application/json; charset=utf-8");
                  res.end(JSON.stringify({ ok: false, error: writeStatus === "stale" ? "STALE_DATA" : "REVISION_CONFLICT", currentRevision: getStorageRevision(current) }));
                  return;
                }
                await writeJsonSafely(dataFile, data);
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ ok: true }));
              } catch (error) {
                res.statusCode = 500;
                res.end(JSON.stringify({ ok: false, error: error.message }));
              }
            });
            await crmWriteQueue;
          });
          return;
        }

        res.statusCode = 405;
        res.end("Method Not Allowed");
      });
    },
  };
}

function invoicePdfDownloadPlugin() {
  return {
    name: "invoice-pdf-download",
    configureServer(server) {
      server.middlewares.use("/api/invoice-pdf", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        let body = "";
        let rejected = false;
        req.setEncoding("utf8");
        req.on("data", chunk => {
          if (rejected) return;
          body += chunk;
          if (body.length > 12_000_000) {
            rejected = true;
            res.statusCode = 413;
            res.end("PDF too large");
            req.destroy();
          }
        });
        req.on("end", () => {
          if (rejected) return;
          try {
            const params = new URLSearchParams(body);
            const requestedName = String(params.get("filename") || "Rechnung.pdf");
            const fileName = requestedName
              .normalize("NFKD")
              .replace(/[^a-zA-Z0-9._-]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 120) || "Rechnung.pdf";
            const encodedPdf = String(params.get("pdf") || "");
            if (!encodedPdf || !/^[A-Za-z0-9+/=]+$/.test(encodedPdf)) throw new Error("Invalid PDF data");
            const pdf = Buffer.from(encodedPdf, "base64");
            if (pdf.length < 4 || pdf.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("Invalid PDF file");

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}"`);
            res.setHeader("Content-Length", pdf.length);
            res.setHeader("Cache-Control", "no-store");
            res.end(pdf);
          } catch (error) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(error.message);
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const runtimeEnv = { ...fileEnv, ...process.env };
  const premiumAdminProxy = createPremiumAdminProxy({
    baseUrl: runtimeEnv.PREMIUM_API_BASE_URL,
    adminToken: runtimeEnv.PREMIUM_ADMIN_API_TOKEN,
  });

  return {
    plugins: [
      react(),
      crmPersistencePlugin(),
      invoicePdfDownloadPlugin(),
      {
        name: "premium-admin-proxy",
        configureServer(server) {
          server.middlewares.use("/api/premium-admin", premiumAdminProxy);
        },
      },
    ],
  };
});
