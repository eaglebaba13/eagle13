import WebSocket from 'ws';

async function testStream() {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    console.error("ERROR: UPSTOX_ACCESS_TOKEN is not set in your environment.");
    process.exit(1);
  }

  console.log("Authorizing WebSocket connection...");
  const authRes = await fetch("https://api.upstox.com/v2/feed/market-data-feed/authorize", {
    headers: { 
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const authData = await authRes.json();
  if (!authData.data?.authorizedRedirectUri) {
    console.error("Auth failed:", authData);
    process.exit(1);
  }

  console.log("Auth Success. Connecting to WSS...");
  const ws = new WebSocket(authData.data.authorizedRedirectUri);
  ws.binaryType = 'arraybuffer';

  ws.on('open', () => {
    console.log("Connected to Upstox V3 Feed successfully!");
    const subPayload = {
      guid: "test-stream",
      method: "sub",
      data: {
        mode: "full",
        instrumentKeys: ["NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank"]
      }
    };
    ws.send(Buffer.from(JSON.stringify(subPayload)));
    console.log("Subscription payload sent for NIFTY 50 & NIFTY BANK.");
  });

  ws.on('message', (buffer: ArrayBuffer) => {
    console.log(`Received live binary frame: ${buffer.byteLength} bytes`);
  });

  ws.on('error', (err) => {
    console.error("WebSocket Error:", err);
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
  });
}

testStream();
