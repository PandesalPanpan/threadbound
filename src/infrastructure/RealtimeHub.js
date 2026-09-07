import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

export class RealtimeHub {
  constructor({ heartbeatMs = 15000, tokenTtlMs = 60000 } = {}) {
    this.sseClients = new Map();
    this.webSocketClients = new Set();
    this.heartbeatMs = heartbeatMs;
    this.tokenTtlMs = tokenTtlMs;
    this.tokens = new Map();
    this.webSocketServer = null;
  }

  attach(response, { playerId = null } = {}) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    response.write('retry: 1500\n');
    response.write(`data: ${JSON.stringify({ type: 'connected', transport: 'sse' })}\n\n`);
    this.sseClients.set(response, playerId);

    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': heartbeat\n\n');
    }, this.heartbeatMs);

    const cleanup = () => {
      clearInterval(heartbeat);
      this.sseClients.delete(response);
    };
    response.on('close', cleanup);
    response.on('error', cleanup);
    return cleanup;
  }

  issueWebSocketToken(playerId) {
    const token = randomUUID();
    this.tokens.set(token, { playerId, expiresAt: Date.now() + this.tokenTtlMs });
    this.#pruneTokens();
    return { token, expiresInMs: this.tokenTtlMs };
  }

  attachWebSocketServer(server, { path = '/ws' } = {}) {
    if (this.webSocketServer) return this.webSocketServer;
    const socketServer = new WebSocketServer({ noServer: true });
    this.webSocketServer = socketServer;

    server.on('upgrade', (request, socket, head) => {
      let url;
      try { url = new URL(request.url || '/', 'http://threadbound.local'); }
      catch { socket.destroy(); return; }
      if (url.pathname !== path) return;

      const token = url.searchParams.get('token');
      const claim = token ? this.#consumeToken(token) : null;
      if (!claim) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      socketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocket.threadboundPlayerId = claim.playerId;
        socketServer.emit('connection', webSocket, request);
      });
    });

    socketServer.on('connection', (webSocket) => {
      this.webSocketClients.add(webSocket);
      webSocket.send(JSON.stringify({ type: 'connected', transport: 'websocket' }));
      webSocket.on('close', () => this.webSocketClients.delete(webSocket));
      webSocket.on('error', () => this.webSocketClients.delete(webSocket));
    });

    return socketServer;
  }

  broadcast(payload = { type: 'state_changed' }, { playerIds = null } = {}) {
    const serialized = JSON.stringify(payload);
    const sseMessage = `data: ${serialized}\n\n`;
    const audience = Array.isArray(playerIds) ? new Set(playerIds.filter(Boolean)) : null;

    for (const [response, playerId] of [...this.sseClients.entries()]) {
      if (response.writableEnded || response.destroyed) {
        this.sseClients.delete(response);
        continue;
      }
      if (audience && !audience.has(playerId)) continue;
      try { response.write(sseMessage); } catch { this.sseClients.delete(response); }
    }

    for (const webSocket of [...this.webSocketClients]) {
      if (webSocket.readyState !== WebSocket.OPEN) {
        this.webSocketClients.delete(webSocket);
        continue;
      }
      if (audience && !audience.has(webSocket.threadboundPlayerId)) continue;
      try { webSocket.send(serialized); } catch { this.webSocketClients.delete(webSocket); }
    }
  }

  close() {
    for (const response of [...this.sseClients.keys()]) {
      try { response.end(); } catch {}
    }
    this.sseClients.clear();
    for (const webSocket of [...this.webSocketClients]) {
      try { webSocket.close(1001, 'Server shutting down'); } catch {}
    }
    this.webSocketClients.clear();
    this.webSocketServer?.close();
  }

  get connectionCount() { return this.sseClients.size + this.webSocketClients.size; }
  get sseConnectionCount() { return this.sseClients.size; }
  get webSocketConnectionCount() { return this.webSocketClients.size; }

  #consumeToken(token) {
    const claim = this.tokens.get(token);
    this.tokens.delete(token);
    if (!claim || claim.expiresAt < Date.now()) return null;
    return claim;
  }

  #pruneTokens() {
    const now = Date.now();
    for (const [token, claim] of this.tokens) {
      if (claim.expiresAt < now) this.tokens.delete(token);
    }
  }
}
