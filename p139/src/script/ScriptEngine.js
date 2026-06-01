const { PythonShell } = require('python-shell');
const vm = require('vm');

const SCRIPT_TIMEOUT = 120000;
const OPERATION_TIMEOUT = 15000;

function withTimeout(promise, timeout, errorMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeout}ms`));
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timer));
}

class ScriptEngine {
  constructor({ instrumentManager, database }) {
    this.instrumentManager = instrumentManager;
    this.database = database;
    this.running = false;
    this.currentDeviceId = null;
    this.cancelRequested = false;
    this.activePromises = new Set();
    this.timeout = SCRIPT_TIMEOUT;
    this.testRun = null;
    this.testResults = [];
  }

  setDevice(deviceId) {
    this.currentDeviceId = deviceId;
  }

  setTimeout(ms) {
    this.timeout = ms;
  }

  async startTestRun(name, sequenceId = null) {
    const result = await this.database.createTestRun(
      sequenceId, 
      name, 
      this.currentDeviceId
    );
    this.testRun = { id: result.id, name };
    this.testResults = [];
    return result.id;
  }

  async finishTestRun(status = 'completed') {
    if (!this.testRun) return;
    
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    
    await this.database.finishTestRun(
      this.testRun.id, 
      status, 
      total, 
      passed, 
      failed
    );
    
    return { testRunId: this.testRun.id, total, passed, failed };
  }

  async recordMeasurement(command, value, unit = '') {
    if (this.currentDeviceId) {
      await this.database.addMeasurement(
        this.currentDeviceId, 
        command, 
        value, 
        unit
      );
    }
  }

  async addTestResult(result) {
    this.testResults.push(result);
    if (this.testRun) {
      await this.database.addTestResult(this.testRun.id, result);
    }
  }

  _getNumericValue(value) {
    if (typeof value === 'number') return value;
    if (value && value.type === 'numeric') return value.value;
    if (value && value.value !== undefined) return parseFloat(value.value);
    return parseFloat(value);
  }

  async run(code, language = 'javascript', testRunName = null) {
    if (this.running) {
      throw new Error('Script is already running');
    }

    this.running = true;
    this.cancelRequested = false;
    this.activePromises.clear();
    this.testResults = [];
    this.testRun = null;
    
    const output = [];

    try {
      let result;
      
      if (testRunName) {
        await this.startTestRun(testRunName);
      }
      
      if (language === 'javascript') {
        result = await withTimeout(
          this._runJavaScript(code, output),
          this.timeout,
          `Script execution timed out after ${this.timeout}ms`
        );
      } else if (language === 'python') {
        result = await withTimeout(
          this._runPython(code, output),
          this.timeout,
          `Script execution timed out after ${this.timeout}ms`
        );
      } else {
        throw new Error(`Unsupported language: ${language}`);
      }

      if (this.testRun) {
        const summary = await this.finishTestRun('completed');
        output.push(`\n=== Test Summary ===`);
        output.push(`Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}`);
      }

      return { 
        success: true, 
        output, 
        result, 
        testRunId: this.testRun?.id,
        testResults: this.testResults
      };
    } catch (error) {
      output.push(`Error: ${error.message}`);
      if (this.testRun) {
        await this.finishTestRun('error');
      }
      return { 
        success: false, 
        output, 
        error: error.message,
        testRunId: this.testRun?.id,
        testResults: this.testResults
      };
    } finally {
      this.running = false;
      this.cancelRequested = false;
      this.activePromises.clear();
    }
  }

  async _runJavaScript(code, output) {
    const self = this;
    
    const context = {
      device: this.currentDeviceId,
      output,
      cancelCheck: () => {
        if (self.cancelRequested) {
          throw new Error('Script cancelled by user');
        }
      },
      console: {
        log: (...args) => {
          if (!self.cancelRequested) {
            output.push(args.map(String).join(' '));
          }
        }
      },
      instrument: {
        connect: async (deviceId) => {
          self.cancelCheck();
          output.push(`Connecting to ${deviceId}...`);
          await self.instrumentManager.connect(deviceId);
          self.currentDeviceId = deviceId;
          output.push('Connected');
        },
        disconnect: async (deviceId) => {
          self.cancelCheck();
          const targetDevice = deviceId || self.currentDeviceId;
          output.push(`Disconnecting ${targetDevice}...`);
          await self.instrumentManager.disconnect(targetDevice);
          output.push('Disconnected');
        },
        send: async (command, timeout) => {
          self.cancelCheck();
          if (!self.currentDeviceId) {
            throw new Error('No device connected');
          }
          output.push(`SEND: ${command}`);
          await self.instrumentManager.sendCommand(self.currentDeviceId, command, timeout);
        },
        query: async (command, timeout) => {
          self.cancelCheck();
          if (!self.currentDeviceId) {
            throw new Error('No device connected');
          }
          output.push(`QUERY: ${command}`);
          const result = await self.instrumentManager.query(self.currentDeviceId, command, timeout);
          output.push(`RESPONSE: ${result.raw}`);
          return result.parsed;
        },
        queryRaw: async (command, timeout) => {
          self.cancelCheck();
          if (!self.currentDeviceId) {
            throw new Error('No device connected');
          }
          output.push(`QUERY: ${command}`);
          const result = await self.instrumentManager.query(self.currentDeviceId, command, timeout);
          output.push(`RESPONSE: ${result.raw}`);
          return result.raw;
        },
        measure: async (command, unit = '', timeout) => {
          self.cancelCheck();
          if (!self.currentDeviceId) {
            throw new Error('No device connected');
          }
          output.push(`MEASURE: ${command}`);
          const result = await self.instrumentManager.query(self.currentDeviceId, command, timeout);
          const value = self._getNumericValue(result.parsed);
          output.push(`VALUE: ${value} ${unit}`);
          await self.recordMeasurement(command, value, unit);
          return { value, raw: result.raw, unit };
        },
        batch: async (commands, options = {}) => {
          self.cancelCheck();
          if (!self.currentDeviceId) {
            throw new Error('No device connected');
          }
          output.push(`BATCH: ${commands.length} commands`);
          const result = await self.instrumentManager.batchCommands(self.currentDeviceId, commands, options);
          result.results.forEach(r => {
            if (r.success && r.raw !== undefined) {
              output.push(`  [${r.index}] ${r.command} => ${r.raw}`);
            } else if (r.success) {
              output.push(`  [${r.index}] ${r.command} => OK`);
            } else {
              output.push(`  [${r.index}] ${r.command} => ERROR: ${r.error}`);
            }
          });
          return result;
        },
        isBusy: () => {
          return self.instrumentManager.isBusy(self.currentDeviceId);
        },
        reset: async () => {
          self.cancelCheck();
          if (!self.currentDeviceId) {
            throw new Error('No device connected');
          }
          output.push('RESET device');
          await self.instrumentManager.resetConnection(self.currentDeviceId);
        }
      },
      assert: {
        withinRange: async (name, value, min, max, unit = '', command = '') => {
          self.cancelCheck();
          const numValue = self._getNumericValue(value);
          const pass = numValue >= min && numValue <= max;
          const result = {
            name,
            command,
            measuredValue: numValue,
            unit,
            minLimit: min,
            maxLimit: max,
            status: pass ? 'pass' : 'fail',
            errorMessage: pass ? '' : `Value ${numValue} out of range [${min}, ${max}]`
          };
          await self.addTestResult(result);
          output.push(`TEST [${result.status.toUpperCase()}] ${name}: ${numValue} ${unit} (limits: ${min}~${max})`);
          if (!pass) {
            throw new Error(`Assertion failed: ${name} = ${numValue} ${unit}, expected [${min}, ${max}]`);
          }
          return result;
        },
        lessThan: async (name, value, max, unit = '', command = '') => {
          self.cancelCheck();
          const numValue = self._getNumericValue(value);
          const pass = numValue < max;
          const result = {
            name,
            command,
            measuredValue: numValue,
            unit,
            maxLimit: max,
            status: pass ? 'pass' : 'fail',
            errorMessage: pass ? '' : `Value ${numValue} >= ${max}`
          };
          await self.addTestResult(result);
          output.push(`TEST [${result.status.toUpperCase()}] ${name}: ${numValue} ${unit} (limit: <${max})`);
          if (!pass) {
            throw new Error(`Assertion failed: ${name} = ${numValue} ${unit}, expected < ${max}`);
          }
          return result;
        },
        greaterThan: async (name, value, min, unit = '', command = '') => {
          self.cancelCheck();
          const numValue = self._getNumericValue(value);
          const pass = numValue > min;
          const result = {
            name,
            command,
            measuredValue: numValue,
            unit,
            minLimit: min,
            status: pass ? 'pass' : 'fail',
            errorMessage: pass ? '' : `Value ${numValue} <= ${min}`
          };
          await self.addTestResult(result);
          output.push(`TEST [${result.status.toUpperCase()}] ${name}: ${numValue} ${unit} (limit: >${min})`);
          if (!pass) {
            throw new Error(`Assertion failed: ${name} = ${numValue} ${unit}, expected > ${min}`);
          }
          return result;
        },
        equal: async (name, value, expected, unit = '', command = '') => {
          self.cancelCheck();
          const numValue = self._getNumericValue(value);
          const pass = Math.abs(numValue - expected) < 0.000001;
          const result = {
            name,
            command,
            measuredValue: numValue,
            unit,
            status: pass ? 'pass' : 'fail',
            errorMessage: pass ? '' : `Value ${numValue} != ${expected}`
          };
          await self.addTestResult(result);
          output.push(`TEST [${result.status.toUpperCase()}] ${name}: ${numValue} ${unit} (expected: ${expected})`);
          if (!pass) {
            throw new Error(`Assertion failed: ${name} = ${numValue} ${unit}, expected ${expected}`);
          }
          return result;
        },
        true: async (name, condition, errorMessage = '') => {
          self.cancelCheck();
          const pass = !!condition;
          const result = {
            name,
            status: pass ? 'pass' : 'fail',
            errorMessage: pass ? '' : errorMessage || 'Condition is false'
          };
          await self.addTestResult(result);
          output.push(`TEST [${result.status.toUpperCase()}] ${name}`);
          if (!pass) {
            throw new Error(`Assertion failed: ${name} - ${errorMessage}`);
          }
          return result;
        }
      },
      test: {
        start: async (name) => {
          return await self.startTestRun(name);
        },
        finish: async () => {
          return await self.finishTestRun();
        }
      },
      sleep: (ms) => {
        self.cancelCheck();
        let timer;
        let promiseRef;
        const promise = new Promise((resolve, reject) => {
          timer = setTimeout(() => {
            if (self.cancelRequested) {
              reject(new Error('Sleep cancelled'));
            } else {
              resolve();
            }
          }, ms);
          
          promiseRef = { timer, reject };
          self.activePromises.add(promiseRef);
        });
        
        return promise.finally(() => {
          clearTimeout(timer);
          if (promiseRef) {
            self.activePromises.delete(promiseRef);
          }
        });
      },
      parseFloat,
      parseInt,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      JSON,
      Date,
      Error,
      RegExp,
      Map,
      Set,
      Promise
    };

    const asyncCode = `
      (async () => {
        ${code}
      })()
    `;

    const script = new vm.Script(asyncCode, { timeout: OPERATION_TIMEOUT });
    const vmContext = vm.createContext(context);
    return await script.runInContext(vmContext);
  }

  async _runPython(code, output) {
    return new Promise((resolve, reject) => {
      const wrapper = `
import sys
import json
import time
import signal

class TimeoutError(Exception):
    pass

def timeout_handler(signum, frame):
    raise TimeoutError("Python script timeout")

def send(command):
    print(f"SEND: {command}")
    sys.stdout.flush()

def query(command):
    print(f"QUERY: {command}")
    sys.stdout.flush()
    return "0"

def sleep(ms):
    time.sleep(ms / 1000)

${code}
`;

      const options = {
        mode: 'text',
        pythonOptions: ['-u'],
        scriptPath: './',
      };

      const pyshell = PythonShell.runString(wrapper, options, (err, results) => {
        if (err) {
          reject(err);
        } else {
          if (results) {
            output.push(...results);
          }
          resolve(results);
        }
      });

      this.activePromises.add({ pyshell, reject });
    });
  }

  async runSequence(sequenceId) {
    const sequence = await this.database.getSequenceById(sequenceId);
    if (!sequence) {
      throw new Error(`Sequence not found: ${sequenceId}`);
    }

    return this.run(sequence.code, sequence.language);
  }

  stop() {
    this.cancelRequested = true;
    this.running = false;
    
    this.activePromises.forEach(({ timer, pyshell, reject }) => {
      if (timer) {
        clearTimeout(timer);
        if (reject) reject(new Error('Script stopped by user'));
      }
      if (pyshell) {
        try {
          pyshell.kill();
        } catch (e) {
          console.warn('Failed to kill Python shell:', e.message);
        }
      }
    });
    
    this.activePromises.clear();
  }

  isRunning() {
    return this.running;
  }

  isCancelled() {
    return this.cancelRequested;
  }
}

ScriptEngine.SCRIPT_TIMEOUT = SCRIPT_TIMEOUT;
ScriptEngine.OPERATION_TIMEOUT = OPERATION_TIMEOUT;

module.exports = ScriptEngine;
