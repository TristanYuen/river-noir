import type {
  ClientCommand,
  GameTransport,
  ServerMessage,
  TransportStatus,
} from "@river-noir/protocol";

export class WebSocketGameTransport implements GameTransport {
  private socket: WebSocket | null = null;
  private readonly messageListeners = new Set<(message: ServerMessage) => void>();
  private readonly statusListeners = new Set<(status: TransportStatus) => void>();
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private shouldResume = false;
  private resumeCommandFactory: (() => ClientCommand | null) | null = null;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    this.intentionalClose = false;
    this.emitStatus({ status: "connecting" });
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.shouldResume = this.reconnectAttempt > 0;
        this.reconnectAttempt = 0;
        this.emitStatus({ status: "connected" });
        resolve();
      }, { once: true });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage;
          for (const listener of this.messageListeners) listener(message);
          if (message.type === "session.ready" && this.shouldResume) {
            this.shouldResume = false;
            const resumeCommand = this.resumeCommandFactory?.();
            if (resumeCommand && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(resumeCommand));
          }
        } catch {
          this.emitStatus({ status: "connected", message: "invalid-message" });
        }
      });
      socket.addEventListener("error", () => reject(new Error("WebSocket connection failed.")), { once: true });
      socket.addEventListener("close", () => {
        this.socket = null;
        if (!this.intentionalClose) this.scheduleReconnect();
      });
    });
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.socket?.close(1000, "Client left the table");
    this.socket = null;
    this.emitStatus({ status: "offline" });
  }

  async send(command: ClientCommand): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not connected.");
    this.socket.send(JSON.stringify(command));
  }

  subscribe(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  subscribeStatus(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  setResumeCommandFactory(factory: () => ClientCommand | null): void {
    this.resumeCommandFactory = factory;
  }

  private emitStatus(status: TransportStatus): void {
    for (const listener of this.statusListeners) listener(status);
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1;
    this.emitStatus({ status: "reconnecting" });
    const wait = Math.min(10_000, 500 * 2 ** Math.min(this.reconnectAttempt, 5));
    globalThis.setTimeout(() => void this.connect().catch(() => undefined), wait);
  }
}
