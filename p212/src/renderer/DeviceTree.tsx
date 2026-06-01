import React, { useState } from 'react';

interface ObjectInfo {
  objectType: number;
  objectTypeName: string;
  instance: number;
  properties: {
    identifier: number;
    identifierName: string;
    value: any;
    lastUpdated: number;
  }[];
}

interface DeviceInfo {
  address: number;
  objectId: { objectType: number; instance: number };
  vendorId: number;
  maxApduLength: number;
  segmentationSupported: number;
  objects: ObjectInfo[];
  lastSeen: number;
}

interface Props {
  devices: DeviceInfo[];
  expanded?: boolean;
}

const ObjectTreeNode: React.FC<{ obj: ObjectInfo; defaultExpanded: boolean }> = ({
  obj,
  defaultExpanded,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="object-node">
      <div
        className="object-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="toggle">{isExpanded ? '▼' : '▶'}</span>
        <span className="object-icon">
          {getObjectIcon(obj.objectType)}
        </span>
        <span className="object-name">
          {obj.objectTypeName} #{obj.instance}
        </span>
        {obj.properties.length > 0 && (
          <span className="prop-count">({obj.properties.length})</span>
        )}
      </div>
      {isExpanded && obj.properties.length > 0 && (
        <div className="property-list">
          {obj.properties.map((prop, idx) => (
            <div key={idx} className="property-item">
              <span className="prop-name">{prop.identifierName}</span>
              <span className="prop-value">
                {formatPropertyValue(prop.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DeviceTreeNode: React.FC<{ device: DeviceInfo; defaultExpanded: boolean }> = ({
  device,
  defaultExpanded,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const timeSinceLastSeen = Date.now() - device.lastSeen;
  const isStale = timeSinceLastSeen > 30000;

  return (
    <div className="device-node">
      <div
        className="device-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="toggle">{isExpanded ? '▼' : '▶'}</span>
        <span className={`device-icon ${isStale ? 'stale' : 'active'}`}>📟</span>
        <span className="device-name">
          Device #{device.objectId.instance}
        </span>
        <span className="device-address">MAC: {device.address}</span>
        {device.vendorId > 0 && (
          <span className="device-vendor">Vendor: {device.vendorId}</span>
        )}
      </div>
      {isExpanded && (
        <div className="device-children">
          {device.objects.length === 0 ? (
            <div className="empty-objects">No objects discovered yet</div>
          ) : (
            device.objects
              .sort((a, b) => {
                if (a.objectType !== b.objectType) return a.objectType - b.objectType;
                return a.instance - b.instance;
              })
              .map((obj, idx) => (
                <ObjectTreeNode
                  key={`${obj.objectType}-${obj.instance}-${idx}`}
                  obj={obj}
                  defaultExpanded={defaultExpanded}
                />
              ))
          )}
        </div>
      )}
    </div>
  );
};

const DeviceTree: React.FC<Props> = ({ devices, expanded = false }) => {
  if (devices.length === 0) {
    return (
      <div className="device-tree-empty">
        <p>No devices discovered</p>
        <p className="hint">Connect to an MS/TP bus to discover BACnet devices</p>
      </div>
    );
  }

  const sortedDevices = [...devices].sort((a, b) => a.address - b.address);

  return (
    <div className="device-tree">
      {sortedDevices.map(device => (
        <DeviceTreeNode
          key={device.address}
          device={device}
          defaultExpanded={expanded}
        />
      ))}
    </div>
  );
};

function getObjectIcon(objectType: number): string {
  const icons: Record<number, string> = {
    0: '📈',
    1: '📉',
    2: '📊',
    3: '🔘',
    4: '🔀',
    5: '🔄',
    8: '📟',
    10: '📄',
    13: '🔢',
    14: '🔢',
    19: '🔢',
    20: '📋',
  };
  return icons[objectType] ?? '📦';
}

function formatPropertyValue(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && value.objectType !== undefined && value.instance !== undefined) {
    return `(${value.objectType}, ${value.instance})`;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export default DeviceTree;
