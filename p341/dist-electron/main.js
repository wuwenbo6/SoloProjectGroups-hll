var G = Object.defineProperty;
var v = (e, t, r) => t in e ? G(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var h = (e, t, r) => v(e, typeof t != "symbol" ? t + "" : t, r);
import { app as g, BrowserWindow as D, ipcMain as O } from "electron";
import f from "path";
import { fileURLToPath as k } from "url";
const M = {
  1: "GOODCRC",
  2: "GOTOMIN",
  3: "ACCEPT",
  4: "REJECT",
  5: "PING",
  6: "PS_RDY",
  10: "NOT_SUPPORTED",
  11: "WAIT",
  12: "SOFT_RESET",
  13: "HARDRST"
}, V = {
  1: "SOURCE_CAPABILITIES",
  2: "REQUEST",
  3: "BIST",
  4: "SINK_CAPABILITIES",
  5: "BATTERY_STATUS",
  6: "ALERT",
  7: "GET_SOURCE_CAP",
  8: "GET_SINK_CAP",
  9: "DR_SWAP",
  10: "PR_SWAP",
  11: "VCONN_SWAP",
  12: "WAIT",
  13: "NOT_SUPPORTED",
  14: "GOTOMIN",
  15: "ACCEPT",
  16: "REJECT",
  17: "PS_RDY",
  18: "SOFT_RESET",
  20: "VENDOR_DEFINED"
}, w = {
  1: "SOURCE_CAPABILITIES_EXTENDED",
  2: "SINK_CAPABILITIES_EXTENDED",
  3: "BATTERY_CAPABILITIES",
  4: "GET_BATTERY_CAP",
  5: "GET_COUNTRY_INFO",
  6: "COUNTRY_INFO",
  7: "FW_UPDATE_REQUEST",
  8: "FW_UPDATE_RESPONSE",
  9: "SECURITY_REQUEST",
  10: "SECURITY_RESPONSE",
  15: "PPS_STATUS"
};
function U(e) {
  const t = (e >> 15 & 1) === 1, r = e >> 12 & 7, i = e >> 9 & 7, s = (e >> 8 & 1) === 1, o = e >> 6 & 3, l = e & 63;
  let p = "UNKNOWN";
  return t ? p = w[l] || "UNKNOWN" : r === 0 ? p = M[l] || "UNKNOWN" : p = V[l] || "UNKNOWN", {
    extended: t,
    numDataObjects: r,
    messageId: i,
    portPowerRole: s,
    specRevision: o,
    messageType: l,
    messageTypeName: p
  };
}
function q(e) {
  return {
    chunked: (e >> 15 & 1) === 1,
    chunkNumber: e >> 8 & 7,
    requestChunk: e >> 9 & 7,
    dataSize: e & 511
  };
}
function Y(e) {
  return {
    outputVoltageMV: 0,
    outputCurrentMA: 0,
    flags: {
      overCurrent: (e & 1) === 1,
      overVoltage: (e >> 1 & 1) === 1,
      inputOverCurrent: (e >> 2 & 1) === 1,
      inputOverVoltage: (e >> 3 & 1) === 1,
      powerLimited: (e >> 4 & 1) === 1,
      sourcePpsCapable: (e >> 5 & 1) === 1,
      sinkPpsCapable: (e >> 6 & 1) === 1
    },
    rawByte: e
  };
}
function H(e, t) {
  const r = e >> 30 & 3;
  let i;
  switch (r) {
    case 0:
      i = "fixed";
      break;
    case 1:
      i = "battery";
      break;
    case 2:
      i = "variable";
      break;
    case 3:
      i = "apdo";
      break;
    default:
      i = "fixed";
  }
  const s = {
    position: t,
    type: i,
    raw: e
  };
  return i === "fixed" ? (s.voltage = (e >> 10 & 1023) * 0.05, s.current = (e & 1023) * 0.01, s.dualRolePower = (e >> 29 & 1) === 1, s.usbCommunicationsCapable = (e >> 28 & 1) === 1, s.unconstrainedPower = (e >> 27 & 1) === 1) : i === "battery" ? (s.minVoltage = (e >> 10 & 1023) * 0.05, s.maxPower = (e & 1023) * 0.25) : i === "variable" ? (s.maxVoltage = (e >> 20 & 1023) * 0.05, s.minVoltage = (e >> 10 & 1023) * 0.05, s.maxCurrent = (e & 1023) * 0.01) : i === "apdo" && (s.maxVoltage = (e >> 17 & 255) * 0.1, s.minVoltage = (e >> 8 & 255) * 0.1, s.maxCurrent = (e & 127) * 0.05, s.ppsPowerLimited = (e >> 27 & 1) === 1), s;
}
function L(e, t = "SOP") {
  const r = e[1] << 8 | e[0], i = U(r), s = [];
  let o;
  if (i.extended && e.length > 2) {
    const l = e[3] << 8 | e[2], p = q(l);
    i.chunked = p.chunked, i.chunkNumber = p.chunkNumber, i.requestChunk = p.requestChunk, i.dataSize = p.dataSize;
    const d = e.slice(4, 4 + p.dataSize);
    if (i.messageTypeName === "PPS_STATUS" && d.length >= 1) {
      const P = Y(d[0]);
      o = {
        messageType: "PPS_STATUS",
        rawData: d,
        ppsStatus: P
      };
    } else if (i.messageTypeName === "SOURCE_CAPABILITIES_EXTENDED" && d.length >= 16) {
      const P = d[1] | d[0] << 8, R = d[3] | d[2] << 8, N = d[7] | d[6] << 8 | d[5] << 16 | d[4] << 24, x = d[9] | d[8] << 8, A = d[10] & 7;
      o = {
        messageType: "SOURCE_CAPABILITIES_EXTENDED",
        rawData: d,
        sourceCapExtended: { vid: P, pid: R, xid: N, fwVersion: x, numPDOs: A }
      };
    } else
      o = {
        messageType: i.messageTypeName,
        rawData: d
      };
  } else
    for (let l = 0; l < i.numDataObjects; l++) {
      const p = 2 + l * 4;
      if (p + 3 < e.length) {
        const d = e[p + 3] << 24 | e[p + 2] << 16 | e[p + 1] << 8 | e[p];
        s.push(H(d, l + 1));
      }
    }
  return {
    header: i,
    dataObjects: s,
    rawBytes: e,
    direction: t,
    timestamp: Date.now(),
    extendedData: o
  };
}
function j(e, t) {
  const r = e.rawBytes.map((s) => s.toString(16).padStart(2, "0").toUpperCase()).join(" "), i = e.dataObjects.map((s) => {
    const o = {
      position: s.position,
      type: s.type === "apdo" ? "apsdo" : s.type,
      voltageMV: Math.round((s.voltage || s.maxVoltage || 0) * 1e3),
      currentMA: Math.round((s.current || s.maxCurrent || 0) * 1e3),
      maxPowerMW: Math.round((s.maxPower || 0) * 1e3),
      rawValue: s.raw
    };
    return s.type === "apdo" && (o.minVoltageMV = Math.round((s.minVoltage || 0) * 1e3), o.maxVoltageMV = Math.round((s.maxVoltage || 0) * 1e3), o.ppsPowerLimited = s.ppsPowerLimited), s.type === "fixed" && (o.dualRolePower = s.dualRolePower, o.usbCommunicationsCapable = s.usbCommunicationsCapable, o.unconstrainedPower = s.unconstrainedPower), o;
  });
  return {
    id: `msg-${Date.now()}-${t}`,
    timestamp: e.timestamp,
    rawHex: r,
    header: {
      messageType: e.header.messageTypeName,
      messageId: e.header.messageId,
      portDataRole: e.header.portPowerRole ? "Source" : "Sink",
      portPowerRole: e.header.portPowerRole ? "Source" : "Sink",
      specificationRevision: e.header.specRevision,
      numDataObjects: e.header.numDataObjects,
      extended: e.header.extended,
      chunked: e.header.chunked,
      chunkNumber: e.header.chunkNumber,
      dataSize: e.header.dataSize
    },
    dataObjects: i.length > 0 ? i : void 0,
    direction: e.direction,
    extendedData: e.extendedData
  };
}
function n(e, t) {
  const r = Math.round(e / 0.05) & 1023, i = Math.round(t / 0.01) & 1023;
  return r << 10 | i;
}
function T(e, t, r) {
  const i = Math.round(t / 0.1) & 255, s = Math.round(e / 0.1) & 255, o = Math.round(r / 0.05) & 127;
  return 3221225472 | i << 17 | s << 8 | o;
}
function c(e, t, r = 0) {
  return t << 12 | r << 9 | 256 | 64 | e;
}
function u(e, t = []) {
  const r = [];
  r.push(e & 255), r.push(e >> 8 & 255);
  for (const i of t)
    r.push(i & 255), r.push(i >> 8 & 255), r.push(i >> 16 & 255), r.push(i >> 24 & 255);
  return r;
}
function a(e = 0) {
  const t = c(1, 0, e);
  return [t & 255, t >> 8 & 255];
}
function W(e = 0) {
  const t = c(12, 0, e);
  return [t & 255, t >> 8 & 255];
}
function m(e, t, r) {
  const i = Math.round(t / 0.01) & 1023, s = Math.round(t / 0.01) & 1023, o = e << 28 | s << 10 | i | 1 << 24, l = c(2, 1);
  return u(l, [o]);
}
function F() {
  return [13, 0];
}
function C(e, t, r, i, s, o, l) {
  return [
    { bytes: u(c(1, e.length), e), direction: "SOP", current: 0, label: "Source_Capabilities" },
    { bytes: a(0), direction: "SOP", label: "GoodCRC" },
    { bytes: m(t, r), direction: "SOP", label: "Request" },
    { bytes: a(1), direction: "SOP", label: "GoodCRC" },
    { bytes: u(c(15, 0, 1)), direction: "SOP", label: "Accept" },
    { bytes: a(1), direction: "SOP", label: "GoodCRC" },
    { bytes: u(c(17, 0, 1)), direction: "SOP", powerCurve: { from: s, to: o, duration: l }, current: r, label: "PS_RDY" },
    { bytes: a(1), direction: "SOP", label: "GoodCRC" }
  ];
}
function y(e, t, r) {
  const i = 32768 | t << 9 | 256 | 64 | e, s = r.length & 511, o = [];
  o.push(i & 255), o.push(i >> 8 & 255), o.push(s & 255), o.push(s >> 8 & 255);
  for (const l of r)
    o.push(l & 255);
  return o;
}
const I = {
  "standard-5v": {
    name: "Standard 5V",
    description: "Simple 5V/3A negotiation",
    steps: C([n(5, 3)], 1, 3, 5, 5, 5, 500)
  },
  "standard-9v": {
    name: "Standard 9V",
    description: "9V/3A QC negotiation",
    steps: C([n(5, 3), n(9, 3), n(20, 5)], 2, 3, 9, 5, 9, 800)
  },
  "standard-20v": {
    name: "Standard 20V",
    description: "20V/5A PD negotiation",
    steps: C([n(5, 3), n(9, 3), n(15, 3), n(20, 5)], 4, 5, 20, 5, 20, 1200)
  },
  "pps-negotiation": {
    name: "PPS Negotiation",
    description: "Programmable Power Supply negotiation",
    steps: C([n(5, 3), n(9, 3), T(3.3, 11, 3)], 3, 2.5, 8.4, 5, 8.4, 1e3)
  },
  "rejected-request": {
    name: "Rejected Request",
    description: "Request for unsupported voltage gets rejected",
    steps: [
      { bytes: u(c(1, 1), [n(5, 3)]), direction: "SOP", current: 0, label: "Source_Capabilities" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: m(2, 3), direction: "SOP", label: "Request" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(16, 0, 1)), direction: "SOP", label: "Reject" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" }
    ]
  },
  renegotiation: {
    name: "Renegotiation",
    description: "Power contract renegotiation",
    steps: [
      ...C([n(5, 3), n(9, 3)], 1, 3, 5, 5, 5, 500),
      { bytes: u(c(1, 2), [n(5, 3), n(9, 3)]), direction: "SOP", delay: 2e3, label: "Source_Capabilities(更新)" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: m(2, 3), direction: "SOP", label: "Request(9V)" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(15, 0, 1)), direction: "SOP", label: "Accept" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(17, 0, 1)), direction: "SOP", powerCurve: { from: 5, to: 9, duration: 800 }, current: 3, label: "PS_RDY" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" }
    ]
  },
  "msgid-gap-retransmit": {
    name: "MessageID Gap + Retransmit",
    description: "MessageID gap detected, soft reset & retransmit",
    steps: [
      { bytes: u(c(1, 3), [n(5, 3), n(9, 3), n(20, 5)]), direction: "SOP", current: 0, label: "Source_Capabilities" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(2, 1, 3), [m(2, 3)[2] | 2 << 28 | 307200 | 300 | 1 << 24]), direction: "SOP", skipMessageId: !0, label: "Request(MSG_ID=3, GAP!)" },
      { bytes: a(3), direction: "SOP", label: "GoodCRC" },
      { bytes: W(1), direction: "SOP", delay: 300, label: "Soft_Reset(MSG_ID不连续)" },
      { bytes: a(2), direction: "SOP", label: "GoodCRC" },
      { bytes: a(0), direction: "SOP", label: "Accept(Soft_Reset)" },
      { bytes: a(0), direction: "SOP", delay: 500, label: "GoodCRC" },
      { bytes: u(c(1, 3), [n(5, 3), n(9, 3), n(20, 5)]), direction: "SOP", label: "Source_Capabilities(重传)" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: m(2, 3), direction: "SOP", label: "Request(9V, 重传)" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(15, 0, 1)), direction: "SOP", label: "Accept" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(17, 0, 1)), direction: "SOP", powerCurve: { from: 5, to: 9, duration: 800 }, current: 3, label: "PS_RDY" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" }
    ]
  },
  "hard-reset-renegotiate": {
    name: "Hard Reset + Renegotiate",
    description: "Hard reset after error, then re-negotiate from scratch",
    steps: [
      { bytes: u(c(1, 3), [n(5, 3), n(9, 3), n(20, 5)]), direction: "SOP", current: 0, label: "Source_Capabilities" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: m(2, 3), direction: "SOP", label: "Request" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(15, 0, 1)), direction: "SOP", label: "Accept" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(17, 0, 1)), direction: "SOP", powerCurve: { from: 5, to: 9, duration: 800 }, current: 3, label: "PS_RDY" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: F(), direction: "SOP", delay: 3e3, isHardReset: !0, label: "Hard_Reset(异常触发)" },
      { bytes: u(c(1, 2), [n(5, 3), n(9, 3)]), direction: "SOP", delay: 1500, current: 0, label: "Source_Capabilities(硬复位后重新协商)" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: m(1, 3), direction: "SOP", label: "Request(5V安全电压)" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(15, 0, 1)), direction: "SOP", label: "Accept" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(17, 0, 1)), direction: "SOP", powerCurve: { from: 9, to: 5, duration: 500 }, current: 3, label: "PS_RDY" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" }
    ]
  },
  "pps-extended-status": {
    name: "PPS Extended + Status",
    description: "PPS negotiation with extended messages and PPS_Status monitoring",
    steps: [
      { bytes: u(c(1, 3), [n(5, 3), n(9, 3), T(3.3, 11, 3)]), direction: "SOP", current: 0, label: "Source_Capabilities(含APDO)" },
      { bytes: a(0), direction: "SOP", label: "GoodCRC" },
      { bytes: m(3, 2.5), direction: "SOP", label: "Request(PPS 8.4V)" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(15, 0, 1)), direction: "SOP", label: "Accept" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: u(c(17, 0, 1)), direction: "SOP", powerCurve: { from: 5, to: 8.4, duration: 1e3 }, current: 2.5, label: "PS_RDY" },
      { bytes: a(1), direction: "SOP", label: "GoodCRC" },
      { bytes: y(15, 0, [48]), direction: "SOP", delay: 500, label: "PPS_Status(功率受限=1, SourcePPS=1)" },
      { bytes: a(2), direction: "SOP", label: "GoodCRC" },
      { bytes: y(1, 0, [88, 2, 52, 18, 1, 0, 0, 0, 120, 86, 3, 0, 0, 0, 0, 0]), direction: "SOP", delay: 800, label: "Source_Capabilities_Extended(VID=0x0258, PID=0x1234)" },
      { bytes: a(2), direction: "SOP", label: "GoodCRC" }
    ]
  }
};
class K {
  constructor() {
    h(this, "running", !1);
    h(this, "currentStep", 0);
    h(this, "speed", 1);
    h(this, "scenario", null);
    h(this, "listeners", {});
    h(this, "timeouts", []);
    h(this, "messageIdCounter", 0);
    h(this, "msgIdTracker");
    h(this, "hardResetOccurred", !1);
    this.msgIdTracker = {
      lastMessageId: -1,
      expectedNextId: 0,
      gapDetected: !1,
      retransmitRequested: !1
    };
  }
  on(t, r) {
    this.listeners[t] || (this.listeners[t] = []), this.listeners[t].push(r);
  }
  removeAllListeners() {
    this.listeners = {};
  }
  emit(t, r) {
    this.listeners[t] && this.listeners[t].forEach((i) => i(r));
  }
  clearAllTimeouts() {
    this.timeouts.forEach((t) => clearTimeout(t)), this.timeouts = [];
  }
  resetMessageIdTracker() {
    this.msgIdTracker = {
      lastMessageId: -1,
      expectedNextId: 0,
      gapDetected: !1,
      retransmitRequested: !1
    };
  }
  checkMessageIdContinuity(t, r = !1) {
    if (r)
      return { isGap: !1, expectedId: this.msgIdTracker.expectedNextId };
    const i = this.msgIdTracker.expectedNextId;
    return this.msgIdTracker.lastMessageId === -1 ? (this.msgIdTracker.lastMessageId = t, this.msgIdTracker.expectedNextId = (t + 1) % 8, { isGap: !1, expectedId: i }) : t !== i ? (this.msgIdTracker.gapDetected = !0, this.emit("message-id-gap", {
      expectedId: i,
      receivedId: t,
      lastId: this.msgIdTracker.lastMessageId,
      timestamp: Date.now()
    }), { isGap: !0, expectedId: i }) : (this.msgIdTracker.lastMessageId = t, this.msgIdTracker.expectedNextId = (t + 1) % 8, { isGap: !1, expectedId: i });
  }
  schedulePowerCurve(t, r, i, s) {
    const l = i / 20 / this.speed, p = (r - t) / 20;
    for (let d = 0; d <= 20; d++) {
      const P = setTimeout(() => {
        if (this.running) {
          const R = t + p * d;
          this.emit("power-curve-point", {
            timestamp: Date.now(),
            voltage: Math.round(R * 100) / 100,
            current: s,
            power: Math.round(R * s * 100) / 100
          });
        }
      }, d * l);
      this.timeouts.push(P);
    }
  }
  scheduleNegotiationUpdate() {
    const t = setTimeout(() => {
      if (this.running && this.scenario) {
        const r = this.getNegotiationPhase();
        this.emit("negotiation-update", {
          phase: r,
          sourceCapabilities: [],
          selectedCapability: 0,
          requestedVoltage: 0,
          requestedCurrent: 0,
          activeVoltage: (this.hardResetOccurred, 5),
          activeCurrent: 0,
          hardResetOccurred: this.hardResetOccurred,
          messageIdGap: this.msgIdTracker.gapDetected,
          history: []
        });
      }
    }, 0);
    this.timeouts.push(t);
  }
  getNegotiationPhase() {
    if (!this.scenario) return "idle";
    if (this.hardResetOccurred) return "hard_reset";
    if (this.msgIdTracker.gapDetected && !this.msgIdTracker.retransmitRequested) return "msgid_gap";
    const t = this.currentStep, r = this.scenario.steps.length;
    return t === 0 ? "idle" : t <= 1 ? "capabilities_sent" : t <= 3 ? "request_sent" : t <= 5 ? "accepted" : t < r - 1 ? "power_transition" : "ready";
  }
  start(t, r = 1) {
    this.stop(), this.running = !0, this.speed = r, this.scenario = I[t] || I["standard-5v"], this.currentStep = 0, this.messageIdCounter = 0, this.hardResetOccurred = !1, this.resetMessageIdTracker(), this.emit("device-status", {
      connected: !0,
      deviceName: "PD Simulator",
      firmwareVersion: "v1.0.0",
      captureCount: 0
    }), this.scheduleNegotiationUpdate(), this.runNextStep();
  }
  runNextStep() {
    if (!this.running || !this.scenario) return;
    if (this.currentStep >= this.scenario.steps.length) {
      this.emit("device-status", {
        connected: !0,
        deviceName: "PD Simulator",
        firmwareVersion: "v1.0.0",
        captureCount: this.currentStep
      }), this.running = !1;
      return;
    }
    const t = this.scenario.steps[this.currentStep], i = (t.delay || 150) / this.speed, s = setTimeout(() => {
      if (!this.running) return;
      t.isHardReset && (this.hardResetOccurred = !0, this.resetMessageIdTracker(), this.emit("hard-reset", {
        timestamp: Date.now(),
        message: t.label || "Hard Reset"
      }));
      const o = L(t.bytes, t.direction), l = j(o, this.messageIdCounter++), { isGap: p } = this.checkMessageIdContinuity(o.header.messageId, t.skipMessageId);
      p && !this.msgIdTracker.retransmitRequested && (this.msgIdTracker.retransmitRequested = !0, l._meta = {
        messageIdGap: !0,
        expectedId: this.msgIdTracker.expectedNextId,
        receivedId: o.header.messageId
      }), t.label && (l._label = t.label), t.isHardReset && (l._isHardReset = !0), this.emit("message", l), t.powerCurve && this.schedulePowerCurve(t.powerCurve.from, t.powerCurve.to, t.powerCurve.duration, t.current || 2), this.currentStep++, this.scheduleNegotiationUpdate(), this.runNextStep();
    }, i);
    this.timeouts.push(s);
  }
  stop() {
    this.running = !1, this.clearAllTimeouts(), this.emit("device-status", {
      connected: !1,
      deviceName: "",
      firmwareVersion: "",
      captureCount: 0
    });
  }
}
const z = k(import.meta.url), _ = f.dirname(z);
let b = null, S = null;
function E() {
  b = new D({
    width: 1400,
    height: 900,
    backgroundColor: "#0F1923",
    webPreferences: {
      preload: f.join(_, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), !g.isPackaged ? (b.loadURL("http://localhost:5173"), b.webContents.openDevTools()) : b.loadFile(f.join(_, "../dist/index.html")), b.on("closed", () => {
    S && (S.stop(), S.removeAllListeners(), S = null), b = null;
  });
}
function B() {
  S = new K(), S.on("message", (e) => {
    b && b.webContents.send("pd:message", e);
  }), S.on("negotiation-update", (e) => {
    b && b.webContents.send("pd:negotiation-update", e);
  }), S.on("power-curve-point", (e) => {
    b && b.webContents.send("pd:power-curve-point", e);
  }), S.on("device-status", (e) => {
    b && b.webContents.send("pd:device-status", e);
  }), S.on("message-id-gap", (e) => {
    b && b.webContents.send("pd:message-id-gap", e);
  }), S.on("hard-reset", (e) => {
    b && b.webContents.send("pd:hard-reset", e);
  });
}
function X() {
  O.on("pd:start-simulation", (e, t, r) => {
    S && S.start(t, r);
  }), O.on("pd:stop-simulation", () => {
    S && S.stop();
  });
}
g.whenReady().then(() => {
  B(), X(), E(), g.on("activate", () => {
    D.getAllWindows().length === 0 && E();
  });
});
g.on("window-all-closed", () => {
  process.platform !== "darwin" && g.quit();
});
