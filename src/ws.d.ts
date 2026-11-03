declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';
  import { Duplex } from 'stream';

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly readyState: number;
    send(data: string | Buffer | ArrayBuffer | Buffer[], cb?: (err?: Error) => void): void;
    close(code?: number, data?: string | Buffer): void;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: {
      noServer?: boolean;
      port?: number;
      path?: string;
      handleProtocols?: (protocols: Set<string>, request: IncomingMessage) => string | false;
    });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      upgradeHead: Buffer,
      callback: (client: WebSocket, request: IncomingMessage) => void
    ): void;
    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  export default WebSocket;
}
