import React, { useState, useEffect } from 'react';
import DeviceTree from './DeviceTree';
import FrameTable from './FrameTable';
import './styles.css';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

interface CapturedFrame {
  id: number;
  timestamp: number;
  sourceAddress: number;
  destinationAddress: number;
  frameType: number;
  frameTypeName: string;
  headerCrcValid: boolean;
  dataCrcValid: boolean;
  crcValid: boolean;
  dataLength: number;
  apdu?: {
    type: string;
    serviceChoice?: number;
    serviceName?: string;
    readProperty?: any;
    writeProperty?: any;
    iAm?: any;
    whoIs?: any;
    readPropertyAck?: any;
  };
  rawHex: string;
}

interface DeviceInfo {
  address: number;
  objectId: { objectType: number; instance: number };
  vendorId: number;
  maxApduLength: number;
  segmentationSupported: number;
  objects: any[];
  lastSeen: number;
}

const App: React.FC = () => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [baudRate, setBaudRate] = useState(38400);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<CapturedFrame | null>(null);
  const [activeTab, setActiveTab] = useState<'frames' | 'devices'>('frames');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const [sourceAddress, setSourceAddress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanLowLimit, setScanLowLimit] = useState(0);
  const [scanHighLimit, setScanHighLimit] = useState(4194303);

  useEffect(() => {
    loadPorts();

    window.bacnetAPI.onFrame((frame: CapturedFrame) => {
      setFrames(prev => {
        const next = [...prev, frame];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });

    window.bacnetAPI.onDeviceUpdate((updatedDevices: DeviceInfo[]) => {
      setDevices(updatedDevices);
    });

    window.bacnetAPI.onError((err: string) => {
      setError(err);
    });

    return () => {
      window.bacnetAPI.removeFrameListener();
      window.bacnetAPI.removeDeviceListener();
      window.bacnetAPI.removeErrorListener();
    };
  }, []);

  const loadPorts = async () => {
    try {
      const portList = await window.bacnetAPI.listPorts();
      setPorts(portList);
      if (portList.length > 0 && !selectedPort) {
        setSelectedPort(portList[0]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleConnect = async () => {
    if (connected) {
      await window.bacnetAPI.disconnect();
      setConnected(false);
    } else {
      setConnecting(true);
      setError('');
      try {
        const result = await window.bacnetAPI.connect(selectedPort, baudRate);
        if (result.success) {
          setConnected(true);
        } else {
          setError(result.error || 'Connection failed');
        }
      } catch (err: any) {
        setError(err.message);
      }
      setConnecting(false);
    }
  };

  const handleClear = async () => {
    await window.bacnetAPI.clearFrames();
    setFrames([]);
    setDevices([]);
  };

  const handleRefreshPorts = () => {
    loadPorts();
  };

  const handleSourceAddressChange = async (addr: number) => {
    setSourceAddress(addr);
    await window.bacnetAPI.setSourceAddress(addr);
  };

  const handleScan = async () => {
    if (!connected) return;
    setScanning(true);
    setError('');
    try {
      const result = await window.bacnetAPI.sendWhoIs(scanLowLimit, scanHighLimit);
      if (!result.success) {
        setError(result.error || 'Scan failed');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setScanning(false);
    setShowScanDialog(false);
  };

  const handleExportPcap = async () => {
    setError('');
    try {
      const result = await window.bacnetAPI.exportPcap();
      if (!result.success && result.error !== 'Cancelled') {
        setError(result.error || 'Export failed');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredFrames = filter
    ? frames.filter(f => {
        const lf = filter.toLowerCase();
        return (
          f.frameTypeName.toLowerCase().includes(lf) ||
          f.apdu?.serviceName?.toLowerCase().includes(lf) ||
          f.rawHex.toLowerCase().includes(lf) ||
          String(f.sourceAddress).includes(lf) ||
          String(f.destinationAddress).includes(lf)
        );
      })
    : frames;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">BACnet MS/TP Monitor</h1>
        <div className="connection-bar">
          <select
            value={selectedPort}
            onChange={e => setSelectedPort(e.target.value)}
            className="port-select"
          >
            {ports.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="btn btn-small" onClick={handleRefreshPorts} title="Refresh ports">
            ⟳
          </button>
          <select
            value={baudRate}
            onChange={e => setBaudRate(Number(e.target.value))}
            className="baud-select"
          >
            <option value={9600}>9600</option>
            <option value={19200}>19200</option>
            <option value={38400}>38400</option>
            <option value={57600}>57600</option>
            <option value={76800}>76800</option>
            <option value={115200}>115200</option>
          </select>
          <button
            className={`btn ${connected ? 'btn-disconnect' : 'btn-connect'}`}
            onClick={handleConnect}
            disabled={connecting || (!selectedPort && !connected)}
          >
            {connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect'}
          </button>
          {connected && <span className="status-dot connected" />}
          {!connected && <span className="status-dot disconnected" />}
          <span className="separator" />
          <label className="addr-label">
            MAC:
            <input
              type="number"
              min={0}
              max={127}
              value={sourceAddress}
              onChange={e => handleSourceAddressChange(Number(e.target.value))}
              className="addr-input"
              disabled={!connected}
            />
          </label>
          <button
            className="btn btn-scan"
            onClick={() => setShowScanDialog(true)}
            disabled={!connected || scanning}
            title="Send Who-Is to discover devices"
          >
            {scanning ? 'Scanning...' : '🔍 Scan'}
          </button>
          <button
            className="btn btn-export"
            onClick={handleExportPcap}
            disabled={frames.length === 0}
            title="Export captured frames as PCAP"
          >
            💾 PCAP
          </button>
          <button className="btn btn-small" onClick={handleClear} title="Clear frames">
            Clear
          </button>
        </div>
      </header>

      {showScanDialog && (
        <div className="dialog-overlay" onClick={() => setShowScanDialog(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Who-Is Scan</h3>
            <p className="dialog-desc">Send a BACnet Who-Is request to discover devices on the MS/TP bus.</p>
            <div className="dialog-fields">
              <label className="dialog-label">
                Device Instance Low Limit:
                <input
                  type="number"
                  min={0}
                  max={4194303}
                  value={scanLowLimit}
                  onChange={e => setScanLowLimit(Number(e.target.value))}
                  className="dialog-input"
                />
              </label>
              <label className="dialog-label">
                Device Instance High Limit:
                <input
                  type="number"
                  min={0}
                  max={4194303}
                  value={scanHighLimit}
                  onChange={e => setScanHighLimit(Number(e.target.value))}
                  className="dialog-input"
                />
              </label>
            </div>
            <div className="dialog-hint">
              Leave range as 0–4194303 to discover all devices.
            </div>
            <div className="dialog-actions">
              <button className="btn btn-cancel" onClick={() => setShowScanDialog(false)}>Cancel</button>
              <button className="btn btn-scan-confirm" onClick={handleScan} disabled={scanning}>
                {scanning ? 'Sending...' : 'Send Who-Is'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-bar" onClick={() => setError('')}>{error} ✕</div>}

      <div className="main-content">
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>Devices ({devices.length})</h2>
          </div>
          <DeviceTree devices={devices} />
        </div>

        <div className="content-area">
          <div className="toolbar">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'frames' ? 'active' : ''}`}
                onClick={() => setActiveTab('frames')}
              >
                Frames ({filteredFrames.length})
              </button>
              <button
                className={`tab ${activeTab === 'devices' ? 'active' : ''}`}
                onClick={() => setActiveTab('devices')}
              >
                Device Tree
              </button>
            </div>
            <div className="filter-bar">
              <input
                type="text"
                placeholder="Filter frames..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="filter-input"
              />
              <label className="auto-scroll-label">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={e => setAutoScroll(e.target.checked)}
                />
                Auto-scroll
              </label>
            </div>
          </div>

          {activeTab === 'frames' ? (
            <div className="frames-container">
              <FrameTable
                frames={filteredFrames}
                selectedFrame={selectedFrame}
                onSelectFrame={setSelectedFrame}
                autoScroll={autoScroll}
              />
              {selectedFrame && (
                <div className="frame-detail">
                  <h3>Frame Detail #{selectedFrame.id}</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Time:</span>
                      <span className="detail-value">
                        {formatTime(selectedFrame.timestamp)}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Source:</span>
                      <span className="detail-value">{selectedFrame.sourceAddress}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Destination:</span>
                      <span className="detail-value">{selectedFrame.destinationAddress}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Frame Type:</span>
                      <span className="detail-value">{selectedFrame.frameTypeName}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Header CRC:</span>
                      <span className={`detail-value ${selectedFrame.headerCrcValid ? 'crc-ok' : 'crc-fail'}`}>
                        {selectedFrame.headerCrcValid ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Data CRC:</span>
                      <span className={`detail-value ${selectedFrame.dataCrcValid ? 'crc-ok' : 'crc-fail'}`}>
                        {selectedFrame.dataCrcValid ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Data Length:</span>
                      <span className="detail-value">{selectedFrame.dataLength} bytes</span>
                    </div>
                  </div>

                  {selectedFrame.apdu && (
                    <div className="apdu-detail">
                      <h4>APDU</h4>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="detail-label">Type:</span>
                          <span className="detail-value">{selectedFrame.apdu.type}</span>
                        </div>
                        {selectedFrame.apdu.serviceName && (
                          <div className="detail-item">
                            <span className="detail-label">Service:</span>
                            <span className="detail-value highlight">{selectedFrame.apdu.serviceName}</span>
                          </div>
                        )}
                        {selectedFrame.apdu.readProperty && (
                          <div className="service-detail">
                            <span className="detail-label">Object:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.readProperty.objectType} #{selectedFrame.apdu.readProperty.objectInstance}
                            </span>
                            <span className="detail-label">Property:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.readProperty.propertyIdentifier}
                              {selectedFrame.apdu.readProperty.propertyArrayIndex != null &&
                                `[${selectedFrame.apdu.readProperty.propertyArrayIndex}]`}
                            </span>
                          </div>
                        )}
                        {selectedFrame.apdu.writeProperty && (
                          <div className="service-detail">
                            <span className="detail-label">Object:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.writeProperty.objectType} #{selectedFrame.apdu.writeProperty.objectInstance}
                            </span>
                            <span className="detail-label">Property:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.writeProperty.propertyIdentifier}
                            </span>
                            <span className="detail-label">Value:</span>
                            <span className="detail-value">
                              {JSON.stringify(selectedFrame.apdu.writeProperty.value)}
                            </span>
                            {selectedFrame.apdu.writeProperty.priority && (
                              <>
                                <span className="detail-label">Priority:</span>
                                <span className="detail-value">{selectedFrame.apdu.writeProperty.priority}</span>
                              </>
                            )}
                          </div>
                        )}
                        {selectedFrame.apdu.iAm && (
                          <div className="service-detail">
                            <span className="detail-label">Device:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.iAm.objectType} #{selectedFrame.apdu.iAm.objectInstance}
                            </span>
                            <span className="detail-label">Vendor:</span>
                            <span className="detail-value">{selectedFrame.apdu.iAm.vendorId}</span>
                            <span className="detail-label">Max APDU:</span>
                            <span className="detail-value">{selectedFrame.apdu.iAm.maxApduLength}</span>
                          </div>
                        )}
                        {selectedFrame.apdu.readPropertyAck && (
                          <div className="service-detail">
                            <span className="detail-label">Object:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.readPropertyAck.objectType} #{selectedFrame.apdu.readPropertyAck.objectInstance}
                            </span>
                            <span className="detail-label">Property:</span>
                            <span className="detail-value">
                              {selectedFrame.apdu.readPropertyAck.propertyIdentifier}
                            </span>
                            <span className="detail-label">Value:</span>
                            <span className="detail-value">
                              {typeof selectedFrame.apdu.readPropertyAck.value === 'object'
                                ? JSON.stringify(selectedFrame.apdu.readPropertyAck.value)
                                : String(selectedFrame.apdu.readPropertyAck.value)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="raw-hex">
                    <h4>Raw Hex</h4>
                    <pre>{selectedFrame.rawHex}</pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="device-tree-panel">
              <DeviceTree devices={devices} expanded />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
