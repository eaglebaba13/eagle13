import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import { generateKeyPairSync, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer as createViteServer, isRunnableDevEnvironment } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";

vi.setConfig({ testTimeout: 30_000 });

const secretCanary = "diagnostics-secret-canary";
const signingKeyId = "diagnostics-integration-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: signingKeyId,
  alg: "RS256",
  use: "sig",
};

type DiagnosticsFunction = {
  url?: string;
};

let authServer: Server;
let viteServer: Awaited<ReturnType<typeof createViteServer>>;
let serverFunctionUrl: string;
let appOrigin: string;
let supabaseUrl: string;
let roleResponse: unknown = true;
let roleResponseStatus = 200;
let rpcCalls = 0;
let rpcPayload: Record<string, unknown> | null = null;
let diagnosticsRegistry: {
  clearDiagnostics: () => void;
  recordApiRequest: (record: {
    ts: number;
    host: string;
    url: string;
    method: string;
    status: number;
    durationMs: number;
    retries: number;
    ok: boolean;
    error: string;
  }) => void;
  recordError: (record: {
    severity: "error";
    message: string;
    source: string;
    stack: string;
  }) => void;
};

function createToken(sub: string): string {
  const encode = (value: object | Buffer) =>
    Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: signingKeyId });
  const payload = encode({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    iss: `${supabaseUrl}/auth/v1`,
    role: "authenticated",
    sub,
  });
  const content = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url");
  return `${content}.${signature}`;
}

function tamperTokenSignature(token: string): string {
  const [header, payload, encodedSignature] = token.split(".");
  if (!header || !payload || !encodedSignature) {
    throw new Error("Cannot tamper a malformed JWT");
  }
  const signature = Buffer.from(encodedSignature, "base64url");
  if (signature.length === 0) {
    throw new Error("Cannot tamper an empty JWT signature");
  }
  signature[0] ^= 0x01;
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

async function requestDiagnostics(token?: string): Promise<Response> {
  const headers = new Headers({ "x-tsr-serverFn": "true" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${appOrigin}${serverFunctionUrl}`, { method: "GET", headers });
}

async function responseText(response: Response): Promise<string> {
  return response.clone().text();
}

function expectGenericFailure(response: Response, body: string): void {
  expect(response.status).toBe(200);
  expect(response.headers.get("x-tss-serialized")).toBe("true");
  expect(body).toContain("Diagnostics unavailable");
  expect(body).not.toContain("Unauthorized");
  expect(body).not.toContain(secretCanary);
}

beforeAll(async () => {
  authServer = createHttpServer((request, response) => {
    if (request.url === "/auth/v1/.well-known/jwks.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }

    if (request.url === "/rest/v1/rpc/has_role") {
      rpcCalls += 1;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        rpcPayload = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
        response.writeHead(roleResponseStatus, { "content-type": "application/json" });
        response.end(JSON.stringify(roleResponse));
      });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Not found" }));
  });
  authServer.listen(0, "127.0.0.1");
  await once(authServer, "listening");
  const address = authServer.address();
  if (!address || typeof address === "string")
    throw new Error("Local auth test server did not bind");
  supabaseUrl = `http://127.0.0.1:${address.port}`;
  vi.stubEnv("SUPABASE_URL", supabaseUrl);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_diagnostics_test");

  viteServer = await createViteServer({
    configFile: false,
    logLevel: "silent",
    plugins: [tsConfigPaths(), tanstackStart(), react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
    },
    server: { host: "127.0.0.1", port: 0, strictPort: true },
    appType: "custom",
  });
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/lib/diagnostics.functions.ts");
  serverFunctionUrl = (diagnosticsModule.getServerDiagnostics as DiagnosticsFunction).url ?? "";
  if (!serverFunctionUrl.startsWith("/_serverFn/")) {
    throw new Error("Diagnostics server function URL was not generated by TanStack Start");
  }
  await viteServer.listen();
  const appAddress = viteServer.httpServer?.address();
  if (!appAddress || typeof appAddress === "string") {
    throw new Error("Local Vite application did not bind an HTTP port");
  }
  appOrigin = `http://127.0.0.1:${appAddress.port}`;
  await fetch(`${appOrigin}/@vite/client`);
  const ssrEnvironment = viteServer.environments.ssr;
  if (!isRunnableDevEnvironment(ssrEnvironment)) {
    throw new Error("Vite SSR environment does not provide a runnable module context");
  }
  diagnosticsRegistry = await ssrEnvironment.runner.import("/src/lib/diagnostics.ts");
  const warmup = await requestDiagnostics(createToken("warmup-user"));
  const warmupBody = await warmup.text();
  if (warmup.status !== 200 || !warmupBody.includes("formulaVersion")) {
    throw new Error("Diagnostics HTTP server did not complete its authorized warm-up request");
  }
  rpcCalls = 0;
  rpcPayload = null;
}, 120_000);

afterAll(async () => {
  await viteServer?.close();
  if (authServer?.listening) {
    authServer.close();
    await once(authServer, "close");
  }
  vi.unstubAllEnvs();
});

describe("diagnostics HTTP integration", () => {
  beforeEach(() => {
    roleResponse = true;
    roleResponseStatus = 200;
    rpcCalls = 0;
    rpcPayload = null;
    diagnosticsRegistry.clearDiagnostics();
  });

  it("serves an authorized administrator response with sanitized diagnostics", async () => {
    diagnosticsRegistry.recordApiRequest({
      ts: Date.now(),
      host: "internal.example",
      url: `https://internal.example/path?token=${secretCanary}`,
      method: "GET",
      status: 500,
      durationMs: 8,
      retries: 0,
      ok: false,
      error: secretCanary,
    });
    diagnosticsRegistry.recordError({
      severity: "error",
      message: secretCanary,
      source: "internal-source",
      stack: `Error: ${secretCanary}`,
    });

    const response = await requestDiagnostics(createToken("admin-user"));
    const body = await responseText(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-tss-serialized")).toBe("true");
    expect(body).toContain("formulaVersion");
    expect(body).toContain("[REDACTED]");
    expect(body).not.toContain(secretCanary);
    expect(body).not.toContain("internal.example");
    expect(body).not.toContain("internal-source");
    expect(rpcCalls).toBe(1);
    expect(rpcPayload).toEqual({ _user_id: "admin-user", _role: "admin" });
  });

  it("sanitizes unauthenticated requests without role lookup", async () => {
    const response = await requestDiagnostics();
    const body = await responseText(response);

    expectGenericFailure(response, body);
    expect(rpcCalls).toBe(0);
  });

  it("sanitizes invalid token verification errors", async () => {
    const token = createToken("user");
    const tamperedToken = tamperTokenSignature(token);
    expect(Buffer.from(tamperedToken.split(".")[2], "base64url")).not.toEqual(
      Buffer.from(token.split(".")[2], "base64url"),
    );
    const response = await requestDiagnostics(tamperedToken);
    const body = await responseText(response);

    expectGenericFailure(response, body);
    expect(rpcCalls).toBe(0);
  });

  it.each([false, null, "true", []])("fails closed for role result %j", async (role) => {
    roleResponse = role;
    const response = await requestDiagnostics(createToken("user"));
    const body = await responseText(response);

    expectGenericFailure(response, body);
    expect(rpcCalls).toBe(1);
  });

  it("fails closed and sanitizes internal role-service errors", async () => {
    roleResponse = { message: secretCanary };
    roleResponseStatus = 500;
    const response = await requestDiagnostics(createToken("user"));
    const body = await responseText(response);

    expectGenericFailure(response, body);
    expect(rpcCalls).toBe(1);
  });
});
