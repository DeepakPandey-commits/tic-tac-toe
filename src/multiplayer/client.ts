import type { ClientMessage, ServerMessage } from "../../shared/protocol";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000];
/** After this many consecutive failed attempts, stop silently retrying and
 * surface a "can't reach the server" state with a manual retry action —
 * otherwise a fully offline server leaves the user staring at "Reconnecting…"
 * forever with no feedback or way out. */
const MAX_SILENT_RECONNECT_ATTEMPTS = 4;

function resolveWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // Sensible dev default; production deployments must set VITE_WS_URL.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8080`;
}

/**
 * Thin WebSocket wrapper: JSON in/out, typed messages, automatic reconnect
 * with backoff, and a single place that owns connection status. Contains
 * zero game logic — the server is the only source of truth for game state.
 */
export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "connecting";
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private explicitlyClosed = false;
  private messageHandlers = new Set<(msg: ServerMessage) => void>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private url: string;

  constructor(url: string = resolveWsUrl()) {
    this.url = url;
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect() {
    this.explicitlyClosed = false;
    this.openSocket();
  }

  /** User-initiated retry after a "failed" state — resets backoff and tries immediately. */
  retry() {
    this.explicitlyClosed = false;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openSocket();
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private openSocket() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Once we've told the user we can't connect, a routine background retry
    // firing in the meantime shouldn't flicker the label back to
    // "Reconnecting…" — only a successful open (or an explicit retry()) ends
    // the "failed" state.
    if (this.status !== "failed") {
      this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected");
    };

    socket.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return; // ignore malformed server frames rather than crashing the UI
      }
      for (const handler of this.messageHandlers) handler(msg);
    };

    socket.onclose = () => {
      this.ws = null;
      if (this.explicitlyClosed) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // 'close' always follows 'error' for a WebSocket — reconnect happens there.
    };
  }

  private scheduleReconnect() {
    // Past the threshold we still keep retrying in the background — a
    // mid-match network blip must not give up before the server's 45s
    // disconnect grace period does — but the UI stops claiming "Reconnecting…"
    // forever and tells the user plainly that it can't reach the server.
    this.setStatus(this.reconnectAttempt >= MAX_SILENT_RECONNECT_ATTEMPTS ? "failed" : "reconnecting");
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
  }

  send(message: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close() {
    this.explicitlyClosed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }
}
