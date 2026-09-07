export class RealtimeHub {
  constructor({ heartbeatMs = 15000 } = {}) {
    this.clients = new Set();
    this.heartbeatMs = heartbeatMs;
  }

  attach(response) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    response.write('retry: 1500\n');
    response.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    this.clients.add(response);

    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': heartbeat\n\n');
    }, this.heartbeatMs);

    const cleanup = () => {
      clearInterval(heartbeat);
      this.clients.delete(response);
    };
    response.on('close', cleanup);
    response.on('error', cleanup);
    return cleanup;
  }

  broadcast(payload = { type: 'state_changed' }) {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const response of [...this.clients]) {
      if (response.writableEnded || response.destroyed) {
        this.clients.delete(response);
        continue;
      }
      try { response.write(message); } catch { this.clients.delete(response); }
    }
  }

  get connectionCount() { return this.clients.size; }
}
