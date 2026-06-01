declare module 'coap' {
  import { EventEmitter } from 'events'

  interface CoapRequest extends EventEmitter {
    url: string
    method: string
    headers: Record<string, number>
    payload: Buffer
    rsinfo: { address: string; port: number }
  }

  interface CoapResponse extends EventEmitter {
    code: string
    setOption(name: string, value: string | number | Buffer): void
    setHeader(name: string, value: string | number | Buffer): void
    end(data?: string | Buffer): void
    write(data: string | Buffer): void
    reset(code?: string): void
  }

  interface CoapServer extends EventEmitter {
    listen(port?: number, callback?: () => void): CoapServer
    close(callback?: () => void): CoapServer
  }

  interface CoapRequestOptions {
    host?: string
    hostname?: string
    port?: number
    pathname?: string
    method?: string
    observe?: boolean
    confirmable?: boolean
  }

  function createServer(callback?: (req: CoapRequest, res: CoapResponse) => void): CoapServer
  function request(options: CoapRequestOptions): EventEmitter & { end(): void }

  const globalAgent: unknown
}
