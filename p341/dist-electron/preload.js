import { contextBridge as s, ipcRenderer as e } from "electron";
s.exposeInMainWorld("electronAPI", {
  onMessage: (t) => {
    e.on("pd:message", (o, n) => t(n));
  },
  onNegotiationUpdate: (t) => {
    e.on("pd:negotiation-update", (o, n) => t(n));
  },
  onPowerCurvePoint: (t) => {
    e.on("pd:power-curve-point", (o, n) => t(n));
  },
  onDeviceStatus: (t) => {
    e.on("pd:device-status", (o, n) => t(n));
  },
  onMessageIdGap: (t) => {
    e.on("pd:message-id-gap", (o, n) => t(n));
  },
  onHardReset: (t) => {
    e.on("pd:hard-reset", (o, n) => t(n));
  },
  startSimulation: (t, o) => {
    e.send("pd:start-simulation", t, o);
  },
  stopSimulation: () => {
    e.send("pd:stop-simulation");
  },
  removeAllListeners: () => {
    e.removeAllListeners("pd:message"), e.removeAllListeners("pd:negotiation-update"), e.removeAllListeners("pd:power-curve-point"), e.removeAllListeners("pd:device-status"), e.removeAllListeners("pd:message-id-gap"), e.removeAllListeners("pd:hard-reset");
  }
});
