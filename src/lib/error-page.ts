export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}

export function renderRateLimitPage(retryAfter: number = 60): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>429 Too Many Requests — EagleBABA</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #09090b; color: #f4f4f5; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 30rem; width: 100%; text-align: center; padding: 2.5rem; background: #18181b; border: 1px solid #27272a; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
      .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); margin-bottom: 1.25rem; }
      h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.75rem; color: #fafafa; }
      p { color: #a1a1aa; font-size: 0.875rem; margin: 0 0 1.5rem; }
      .cooldown { font-family: monospace; font-size: 1.125rem; font-weight: 700; color: #fbbf24; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 1.5rem; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; transition: all 0.15s ease; }
      .primary { background: #fbbf24; color: #09090b; }
      .primary:hover { background: #f59e0b; }
      .secondary { background: #27272a; color: #f4f4f5; border-color: #3f3f46; }
      .secondary:hover { background: #3f3f46; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">SECURITY RATE LIMIT ACTIVE</div>
      <h1>Too Many Requests</h1>
      <p>Institutional security safeguards triggered. Excessive request frequency was detected from your IP address to protect platform integrity.</p>
      <div class="cooldown">Cooldown Active: Retry in ${retryAfter}s</div>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Retry Now</button>
        <a class="secondary" href="/">Return to Dashboard</a>
      </div>
    </div>
  </body>
</html>`;
}
