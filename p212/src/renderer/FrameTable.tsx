import React, { useRef, useEffect } from 'react';

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

interface Props {
  frames: CapturedFrame[];
  selectedFrame: CapturedFrame | null;
  onSelectFrame: (frame: CapturedFrame) => void;
  autoScroll: boolean;
}

const FrameTable: React.FC<Props> = ({ frames, selectedFrame, onSelectFrame, autoScroll }) => {
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && tableRef.current) {
      tableRef.current.scrollTop = tableRef.current.scrollHeight;
    }
  }, [frames.length, autoScroll]);

  const getCrcClass = (valid: boolean) => (valid ? 'crc-ok' : 'crc-fail');

  const getServiceInfo = (frame: CapturedFrame): string => {
    if (!frame.apdu) return '—';
    return frame.apdu.serviceName ?? frame.apdu.type;
  };

  const getFrameRowClass = (frame: CapturedFrame): string => {
    const classes = ['frame-row'];
    if (selectedFrame?.id === frame.id) classes.push('selected');
    if (!frame.crcValid) classes.push('crc-invalid');
    return classes.join(' ');
  };

  return (
    <div className="frame-table-container" ref={tableRef}>
      <table className="frame-table">
        <thead>
          <tr>
            <th className="col-id">#</th>
            <th className="col-time">Time</th>
            <th className="col-src">Src</th>
            <th className="col-dst">Dst</th>
            <th className="col-type">Frame Type</th>
            <th className="col-crc">Hd</th>
            <th className="col-crc">Dt</th>
            <th className="col-len">Len</th>
            <th className="col-service">Service</th>
          </tr>
        </thead>
        <tbody>
          {frames.map(frame => (
            <tr
              key={frame.id}
              className={getFrameRowClass(frame)}
              onClick={() => onSelectFrame(frame)}
            >
              <td className="col-id">{frame.id}</td>
              <td className="col-time">
                {formatTime(frame.timestamp)}
              </td>
              <td className="col-src">{frame.sourceAddress}</td>
              <td className="col-dst">{frame.destinationAddress}</td>
              <td className="col-type">{frame.frameTypeName}</td>
              <td className={`col-crc ${getCrcClass(frame.headerCrcValid)}`}>
                {frame.headerCrcValid ? '✓' : '✗'}
              </td>
              <td className={`col-crc ${getCrcClass(frame.dataCrcValid)}`}>
                {frame.dataCrcValid ? '✓' : '✗'}
              </td>
              <td className="col-len">{frame.dataLength}</td>
              <td className="col-service">{getServiceInfo(frame)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FrameTable;
