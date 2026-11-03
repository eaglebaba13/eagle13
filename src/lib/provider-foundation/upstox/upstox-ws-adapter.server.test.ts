import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstoxWsAdapter } from "./upstox-ws-adapter.server";

class MockWebSocket {
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readonly readyState = MockWebSocket.OPEN;
  binaryType: BinaryType = "blob";
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {}
}

const TOKEN = "test-upstox-authorization-token";
const AUTH_URL = "https://api.upstox.com/v3/feed/market-data-feed/authorize";
const REDIRECT_URL = "wss://feed.upstox.test/market-data";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubEnv("UPSTOX_MARKET_DATA_MODE", "live");
  vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", TOKEN);
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Upstox V3 WebSocket authorization", () => {
  it("uses the V3 GET contract and connects to the snake_case redirect URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: { authorized_redirect_uri: REDIRECT_URL },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new UpstoxWsAdapter();
    expect(adapter.subscribe("NIFTY50")).toBe(true);

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(AUTH_URL);
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
      },
    });
    expect(MockWebSocket.instances[0]?.url).toBe(REDIRECT_URL);
    expect(adapter.connectionSnapshot().lastError).toBeNull();
    adapter.close();
  });

  it.each([
    ["missing URL", { status: "success", data: {} }],
    ["null URL", { status: "success", data: { authorized_redirect_uri: null } }],
    ["invalid URL", { status: "success", data: { authorized_redirect_uri: "not-a-url" } }],
    [
      "non-WebSocket URL",
      { status: "success", data: { authorized_redirect_uri: "https://feed.test" } },
    ],
    ["unsuccessful response", { status: "error", data: { authorized_redirect_uri: REDIRECT_URL } }],
  ])("fails closed for %s", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body)));

    const adapter = new UpstoxWsAdapter();
    adapter.subscribe("NIFTY50");

    await vi.waitFor(() => {
      expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
      expect(adapter.connectionSnapshot().lastError).toBe("PROVIDER_ERROR");
    });
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(JSON.stringify(adapter.connectionSnapshot())).not.toContain(TOKEN);
    adapter.close();
  });

  it("does not connect or expose response content when authorization is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "secret response body" }, 401)),
    );

    const adapter = new UpstoxWsAdapter();
    adapter.subscribe("NIFTY50");

    await vi.waitFor(() => {
      expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
      expect(adapter.connectionSnapshot().lastError).toBe("PROVIDER_ERROR");
    });
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(JSON.stringify(adapter.connectionSnapshot())).not.toContain(TOKEN);
    expect(JSON.stringify(adapter.connectionSnapshot())).not.toContain("secret response body");
    adapter.close();
  });
});
