import { LuaFactory, LuaEngine } from 'wasmoon';

const EXECUTION_TIMEOUT_MS = 5000;
const MAX_INSTRUCTION_COUNT = 50000000;

export interface ExecutionResult {
  success: boolean;
  output: string;
  stats: Record<string, number>;
  errors: string[];
  extractedData: Array<Record<string, string>>;
}

export class LuaSandbox {
  private factory: LuaFactory;

  constructor() {
    this.factory = new LuaFactory();
  }

  private createTimeoutPromise(): { promise: Promise<never>; timer: NodeJS.Timeout } {
    let timer: NodeJS.Timeout;
    const promise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Script execution timed out after ${EXECUTION_TIMEOUT_MS / 1000} seconds`));
      }, EXECUTION_TIMEOUT_MS);
    });
    return { promise, timer: timer! };
  }

  private injectSandboxGlobals(
    engine: LuaEngine,
    output: string[],
    errors: string[],
    stats: Record<string, number>,
    extractedData: Array<Record<string, string>>
  ): void {
    engine.global.set('__sandbox_print', (...args: any[]) => {
      output.push(args.map(arg => String(arg)).join('\t'));
    });

    engine.global.set('__sandbox_error', (msg: string) => {
      errors.push(msg);
    });

    engine.global.set('stats', {
      increment: (key: string, value: number = 1) => {
        stats[key] = (stats[key] || 0) + value;
      },
      get: (key: string) => stats[key] || 0,
      getAll: () => ({ ...stats }),
    });

    engine.global.set('extractor', {
      add: (data: Record<string, string>) => {
        extractedData.push({ ...data });
      },
    });

    engine.global.set('ngx', {
      var: {} as Record<string, string>,
      req: {
        get_uri_args: () => ({}),
        get_headers: () => ({}),
      },
      log: {
        ERR: 'ERR',
        WARN: 'WARN',
        INFO: 'INFO',
        DEBUG: 'DEBUG',
      },
      say: (...args: any[]) => {
        output.push(args.map(arg => String(arg)).join('\t'));
      },
      exit: (_code: number) => {},
      redirect: (_uri: string) => {},
    });

    engine.global.set('regex', {
      match: (str: string, pattern: string): string[] | null => {
        try {
          const jsPattern = this.luaPatternToJs(pattern);
          const match = str.match(jsPattern);
          return match ? match.slice(1) : null;
        } catch (e) {
          errors.push(`Regex error: ${(e as Error).message}`);
          return null;
        }
      },
    });
  }

  private async disableDangerousLibs(engine: LuaEngine): Promise<void> {
    await engine.doString(`
      local __sandbox_sethook = debug.sethook

      local blocked = {
        "socket", "socket.core", "socket.http", "socket.smtp",
        "socket.url", "socket.ftp", "socket.tp",
        "luasocket", "ssl", "ssl.https",
        "lfs", "lpeg",
      }
      for _, lib in ipairs(blocked) do
        if package then
          package.loaded[lib] = nil
          package.preload[lib] = nil
        end
      end

      _G.io = nil

      if _G.os then
        _G.os.execute = nil
        _G.os.getenv = nil
        _G.os.rename = nil
        _G.os.remove = nil
        _G.os.tmpname = nil
        _G.os.exit = nil
      end

      if _G.debug then
        _G.debug.debug = nil
        _G.debug.sethook = nil
        _G.debug.gethook = nil
        _G.debug.getregistry = nil
      end

      _G.dofile = nil
      _G.loadfile = nil
      _G.require = nil
      _G.package = nil
      _G.socket = nil
      _G.load = nil

      _G.print = function(...)
        __sandbox_print(...)
      end

      _G.__sandbox_sethook = __sandbox_sethook
    `);
  }

  async executeScript(
    luaCode: string,
    accessLogs: string[]
  ): Promise<ExecutionResult> {
    const output: string[] = [];
    const errors: string[] = [];
    const stats: Record<string, number> = {};
    const extractedData: Array<Record<string, string>> = [];

    let engine: LuaEngine | null = null;

    try {
      engine = await this.factory.createEngine();

      this.injectSandboxGlobals(engine, output, errors, stats, extractedData);

      await this.disableDangerousLibs(engine);

      const escapedLogs = accessLogs
        .map(line => {
          const safe = line.replace(/\]==\]/g, '] == ]');
          return `[==[${safe}]==]`;
        })
        .join(',\n  ');

      const fullCode = `
        local __sandbox_instruction_count = 0
        local __sandbox_max_instructions = ${MAX_INSTRUCTION_COUNT}
        __sandbox_sethook(function(event)
          if event == "count" then
            __sandbox_instruction_count = __sandbox_instruction_count + 1000
            if __sandbox_instruction_count >= __sandbox_max_instructions then
              error("Script execution timed out: instruction limit exceeded")
            end
          end
        end, "", 1000)

        ${luaCode}

        local logs = {
          ${escapedLogs}
        }

        if _G.process_log and type(_G.process_log) == 'function' then
          for _, line in ipairs(logs) do
            if _G.ngx then
              _G.ngx.var = _G.ngx.var or {}
              _G.ngx.var.log_line = line
            end
            _G.process_log(line)
          end
        end

        __sandbox_sethook()
      `;

      const { promise: timeoutPromise, timer } = this.createTimeoutPromise();

      try {
        await Promise.race([
          engine.doString(fullCode),
          timeoutPromise,
        ]);
        clearTimeout(timer);
      } catch (e: any) {
        clearTimeout(timer);
        const msg = e.message || '';
        if (msg.includes('timed out') || msg.includes('instruction limit')) {
          errors.push(`Script execution timed out after ${EXECUTION_TIMEOUT_MS / 1000} seconds`);
        } else {
          errors.push(`Execution error: ${msg}`);
        }
      }

      engine.global.close();

      return {
        success: errors.length === 0,
        output: output.join('\n'),
        stats,
        errors,
        extractedData,
      };
    } catch (e: any) {
      if (engine) {
        try { engine.global.close(); } catch {}
      }
      errors.push(`Sandbox error: ${e.message}`);
      return {
        success: false,
        output: output.join('\n'),
        stats,
        errors,
        extractedData,
      };
    }
  }

  private luaPatternToJs(pattern: string, flags: string = ''): RegExp {
    const replacements: Record<string, string> = {
      '%d': '\\d',
      '%D': '\\D',
      '%w': '\\w',
      '%W': '\\W',
      '%s': '\\s',
      '%S': '\\S',
      '%a': 'a-zA-Z',
      '%A': '^a-zA-Z',
      '%l': 'a-z',
      '%u': 'A-Z',
      '%x': '0-9a-fA-F',
      '%.': '\\.',
      '%+': '\\+',
      '%*': '\\*',
      '%?': '\\?',
      '%^': '\\^',
      '%$': '\\$',
      '%(': '(',
      '%)': ')',
      '%[': '[',
      '%]': ']',
      '%|': '|',
      '%%': '%',
    };

    let jsPattern = '';
    let i = 0;
    while (i < pattern.length) {
      if (pattern[i] === '%' && i + 1 < pattern.length) {
        const key = pattern.substring(i, i + 2);
        if (replacements[key] !== undefined) {
          jsPattern += replacements[key];
          i += 2;
          continue;
        }
        jsPattern += pattern[i + 1];
        i += 2;
      } else {
        jsPattern += pattern[i];
        i += 1;
      }
    }

    return new RegExp(jsPattern, flags);
  }
}

export const luaSandbox = new LuaSandbox();
