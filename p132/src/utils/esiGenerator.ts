
import { EsiConfig, PdoEntry, DataType, SlaveInfo, CoEParameter, CoEAccessType } from '../types';

const pdoIndexToHex = (type: 'Tx' | 'Rx', index: number): string => {
  const base = type === 'Tx' ? 0x1A00 : 0x1600;
  return `0x${(base + index).toString(16).padStart(4, '0').toUpperCase()}`;
};

const dataTypeToHex = (dataType: DataType): string => {
  const typeMap: Record<DataType, string> = {
    [DataType.BOOL]: '0x0001',
    [DataType.INT8]: '0x0002',
    [DataType.INT16]: '0x0003',
    [DataType.INT32]: '0x0004',
    [DataType.INT64]: '0x0015',
    [DataType.UINT8]: '0x0005',
    [DataType.UINT16]: '0x0006',
    [DataType.UINT32]: '0x0007',
    [DataType.UINT64]: '0x001B',
    [DataType.FLOAT32]: '0x0008',
    [DataType.FLOAT64]: '0x0011',
    [DataType.STRING]: '0x0009',
  };
  return typeMap[dataType] || '0x0000';
};

const formatIndex = (index: number): string => {
  return `#x${index.toString(16).padStart(4, '0').toUpperCase()}`;
};

const formatSubIndex = (subIndex: number): string => {
  return `#x${subIndex.toString(16).padStart(2, '0').toUpperCase()}`;
};

const parseHexString = (value: string): number => {
  const cleanValue = value.replace(/^#?x|^0x/i, '').replace(/^0/i, '');
  return parseInt(cleanValue || '0', 16);
};

const formatVendorId = (vendorId: string): string => {
  const numValue = parseHexString(vendorId);
  return `#x${numValue.toString(16).padStart(8, '0').toUpperCase()}`;
};

const formatProductCode = (productCode: string): string => {
  const numValue = parseHexString(productCode);
  return `#x${numValue.toString(16).padStart(8, '0').toUpperCase()}`;
};

const formatRevisionNo = (revisionNo: string): string => {
  const numValue = parseHexString(revisionNo);
  return `#x${numValue.toString(16).padStart(8, '0').toUpperCase()}`;
};

const generatePdoMappingXml = (entries: PdoEntry[], type: 'Tx' | 'Rx', pdoNumber: number): string => {
  const pdoIndex = pdoIndexToHex(type, pdoNumber);
  
  let xml = '';
  
  xml += `            <Index SubIndex="0">\n`;
  xml += `              <Name>P${type === 'Tx' ? 'O' : 'I'} Mapping ${pdoNumber + 1}</Name>\n`;
  xml += `              <Type>UNSIGNED8</Type>\n`;
  xml += `              <BitLen>8</BitLen>\n`;
  xml += `              <DefaultValue>${entries.length}</DefaultValue>\n`;
  xml += `              <Flags>\n`;
  xml += `                <Access>rw</Access>\n`;
  xml += `                <PDO />\n`;
  xml += `                <DC />\n`;
  xml += `              </Flags>\n`;
  xml += `            </Index>\n`;

  entries.forEach((entry, idx) => {
    xml += `            <Index SubIndex="${idx + 1}">\n`;
    xml += `              <Name>${entry.name}</Name>\n`;
    xml += `              <Type>UNSIGNED32</Type>\n`;
    xml += `              <BitLen>32</BitLen>\n`;
    const mappingValue = (entry.index << 16) | (entry.subIndex << 8) | entry.bitLength;
    xml += `              <DefaultValue>0x${mappingValue.toString(16).padStart(8, '0').toUpperCase()}</DefaultValue>\n`;
    xml += `              <Flags>\n`;
    xml += `                <Access>rw</Access>\n`;
    xml += `                <PDO />\n`;
    xml += `              </Flags>\n`;
    xml += `            </Index>\n`;
  });

  return xml;
};

const generateTxPdoXml = (entries: PdoEntry[]): string => {
  if (entries.length === 0) {
    return '        <TxPdo />\n';
  }

  let xml = '        <TxPdo>\n';
  xml += `          <Index ${formatIndex(0x1C13)}>\n`;
  xml += `            <Name>TxPDO Assign</Name>\n`;
  xml += `            <Type>UNSIGNED8</Type>\n`;
  xml += `            <BitLen>8</BitLen>\n`;
  xml += `            <DefaultValue>1</DefaultValue>\n`;
  xml += `            <Flags>\n`;
  xml += `              <Access>rw</Access>\n`;
  xml += `              <PDO />\n`;
  xml += `              <DC />\n`;
  xml += `            </Flags>\n`;
  xml += `          </Index>\n`;
  xml += `          <Index ${formatIndex(0x1C13)} SubIndex="1">\n`;
  xml += `            <Name>TxPDO 1 Mapping</Name>\n`;
  xml += `            <Type>UNSIGNED16</Type>\n`;
  xml += `            <BitLen>16</BitLen>\n`;
  xml += `            <DefaultValue>#x1A00</DefaultValue>\n`;
  xml += `            <Flags>\n`;
  xml += `              <Access>rw</Access>\n`;
  xml += `              <PDO />\n`;
  xml += `              <DC />\n`;
  xml += `            </Flags>\n`;
  xml += `          </Index>\n`;
  xml += `          <Index ${formatIndex(0x1A00)}>\n`;
  generatePdoMappingXml(entries, 'Tx', 0).split('\n').forEach(line => {
    if (line.trim()) xml += line + '\n';
  });
  xml += `          </Index>\n`;
  xml += '        </TxPdo>\n';

  return xml;
};

const generateRxPdoXml = (entries: PdoEntry[]): string => {
  if (entries.length === 0) {
    return '        <RxPdo />\n';
  }

  let xml = '        <RxPdo>\n';
  xml += `          <Index ${formatIndex(0x1C12)}>\n`;
  xml += `            <Name>RxPDO Assign</Name>\n`;
  xml += `            <Type>UNSIGNED8</Type>\n`;
  xml += `            <BitLen>8</BitLen>\n`;
  xml += `            <DefaultValue>1</DefaultValue>\n`;
  xml += `            <Flags>\n`;
  xml += `              <Access>rw</Access>\n`;
  xml += `              <PDO />\n`;
  xml += `              <DC />\n`;
  xml += `            </Flags>\n`;
  xml += `          </Index>\n`;
  xml += `          <Index ${formatIndex(0x1C12)} SubIndex="1">\n`;
  xml += `            <Name>RxPDO 1 Mapping</Name>\n`;
  xml += `            <Type>UNSIGNED16</Type>\n`;
  xml += `            <BitLen>16</BitLen>\n`;
  xml += `            <DefaultValue>#x1600</DefaultValue>\n`;
  xml += `            <Flags>\n`;
  xml += `              <Access>rw</Access>\n`;
  xml += `              <PDO />\n`;
  xml += `              <DC />\n`;
  xml += `            </Flags>\n`;
  xml += `          </Index>\n`;
  xml += `          <Index ${formatIndex(0x1600)}>\n`;
  generatePdoMappingXml(entries, 'Rx', 0).split('\n').forEach(line => {
    if (line.trim()) xml += line + '\n';
  });
  xml += `          </Index>\n`;
  xml += '        </RxPdo>\n';

  return xml;
};

const generateObjectDictionaryXml = (config: EsiConfig): string => {
  let xml = '';
  
  config.txPdO.forEach((entry) => {
    xml += `      <Entry Index="${formatIndex(entry.index)}" SubIndex="${formatSubIndex(entry.subIndex)}">\n`;
    xml += `        <Name>${entry.name}</Name>\n`;
    xml += `        <Type>${dataTypeToHex(entry.dataType)}</Type>\n`;
    xml += `        <BitSize>${entry.bitLength}</BitSize>\n`;
    xml += `        <Flags>\n`;
    xml += `          <Access>ro</Access>\n`;
    xml += `          <Output />\n`;
    xml += `        </Flags>\n`;
    xml += `      </Entry>\n`;
  });
  
  config.rxPdO.forEach((entry) => {
    xml += `      <Entry Index="${formatIndex(entry.index)}" SubIndex="${formatSubIndex(entry.subIndex)}">\n`;
    xml += `        <Name>${entry.name}</Name>\n`;
    xml += `        <Type>${dataTypeToHex(entry.dataType)}</Type>\n`;
    xml += `        <BitSize>${entry.bitLength}</BitSize>\n`;
    xml += `        <Flags>\n`;
    xml += `          <Access>rw</Access>\n`;
    xml += `          <Input />\n`;
    xml += `        </Flags>\n`;
    xml += `      </Entry>\n`;
  });

  if (config.coeParameters.length > 0) {
    xml += `        <Group>\n`;
    xml += `          <Name>CoE Parameters</Name>\n`;
    
    config.coeParameters.forEach((param) => {
      xml += `          <Index SubIndex="${formatSubIndex(param.subIndex)}">\n`;
      xml += `            <Name>${param.name}</Name>\n`;
      xml += `            <Type>${dataTypeToHex(param.dataType)}</Type>\n`;
      xml += `            <BitLen>${getDataTypeBitLen(param.dataType)}</BitLen>\n`;
      
      if (param.defaultValue !== undefined && param.defaultValue !== '') {
        xml += `            <DefaultValue>${param.defaultValue}</DefaultValue>\n`;
      }
      
      if (param.lowLimit !== undefined && param.lowLimit !== '') {
        xml += `            <LowLimit>${param.lowLimit}</LowLimit>\n`;
      }
      
      if (param.highLimit !== undefined && param.highLimit !== '') {
        xml += `            <HighLimit>${param.highLimit}</HighLimit>\n`;
      }
      
      xml += `            <Flags>\n`;
      xml += `              <Access>${param.accessType}</Access>\n`;
      if (param.pdoMapping) {
        xml += `              <PDO />\n`;
      }
      xml += `            </Flags>\n`;
      xml += `          </Index>\n`;
    });
    
    xml += `        </Group>\n`;
  }

  return xml;
};

const getDataTypeBitLen = (dataType: DataType): number => {
  const typeMap: Record<DataType, number> = {
    [DataType.BOOL]: 1,
    [DataType.INT8]: 8,
    [DataType.INT16]: 16,
    [DataType.INT32]: 32,
    [DataType.INT64]: 64,
    [DataType.UINT8]: 8,
    [DataType.UINT16]: 16,
    [DataType.UINT32]: 32,
    [DataType.UINT64]: 64,
    [DataType.FLOAT32]: 32,
    [DataType.FLOAT64]: 64,
    [DataType.STRING]: 8,
  };
  return typeMap[dataType] || 16;
};

export const generateEsiXml = (config: EsiConfig): string => {
  const { slaveInfo, txPdO, rxPdO } = config;
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<EtherCATInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
  xml += `  xsi:noNamespaceSchemaLocation="ESI.xsd">\n`;
  xml += `  <Vendor>\n`;
  xml += `    <Id>${formatVendorId(slaveInfo.vendorId)}</Id>\n`;
  xml += `    <Name LcId="1033">${slaveInfo.vendorName}</Name>\n`;
  xml += `    <Descriptions>\n`;
  xml += `      <Description LcId="1033">${slaveInfo.vendorName}</Description>\n`;
  xml += `    </Descriptions>\n`;
  xml += `  </Vendor>\n`;
  xml += `  <Descriptions>\n`;
  xml += `    <Devices>\n`;
  xml += `      <Device Physics="A" ProductCode="${formatProductCode(slaveInfo.productCode)}" RevisionNo="${formatRevisionNo(slaveInfo.revisionNo)}">\n`;
  xml += `        <Type>0</Type>\n`;
  xml += `        <Name LcId="1033">${slaveInfo.productName}</Name>\n`;
  xml += `        <GroupType>Slave</GroupType>\n`;
  xml += `        <Image>phdevice.ico</Image>\n`;
  xml += `        <Descriptions>\n`;
  xml += `          <Description LcId="1033">${slaveInfo.slaveName}</Description>\n`;
  xml += `        </Descriptions>\n`;
  xml += `        <Port Type="MII">\n`;
  xml += `          <Name>Port 0</Name>\n`;
  xml += `          <Address>0x0000</Address>\n`;
  xml += `        </Port>\n`;
  xml += `        <Port Type="MII">\n`;
  xml += `          <Name>Port 1</Name>\n`;
  xml += `          <Address>0x0000</Address>\n`;
  xml += `        </Port>\n`;
  xml += `        <Fmmu>\n`;
  xml += `          <BitOp>0</BitOp>\n`;
  xml += `          <WriteLogical>0</WriteLogical>\n`;
  xml += `          <ReadLogical>0</ReadLogical>\n`;
  xml += `        </Fmmu>\n`;
  xml += `        <Sm>\n`;
  xml += `          <Sm Enable="1" StartAddress="0x1000" ControlByte="0x26" DefaultSize="128">\n`;
  xml += `            <Name>MailBox Out</Name>\n`;
  xml += `          </Sm>\n`;
  xml += `          <Sm Enable="1" StartAddress="0x1080" ControlByte="0x22" DefaultSize="128">\n`;
  xml += `            <Name>MailBox In</Name>\n`;
  xml += `          </Sm>\n`;
  xml += `          <Sm Enable="0" StartAddress="0x1100" ControlByte="0x64" DefaultSize="0">\n`;
  xml += `            <Name>Outputs</Name>\n`;
  xml += `          </Sm>\n`;
  xml += `          <Sm Enable="0" StartAddress="0x1180" ControlByte="0x20" DefaultSize="0">\n`;
  xml += `            <Name>Inputs</Name>\n`;
  xml += `          </Sm>\n`;
  xml += `        </Sm>\n`;
  xml += generateRxPdoXml(rxPdO);
  xml += generateTxPdoXml(txPdO);
  xml += `        <ObjectDictionary>\n`;
  xml += `          <Group>\n`;
  xml += `            <Name>PDO Mapping</Name>\n`;
  xml += generateObjectDictionaryXml(config);
  xml += `          </Group>\n`;
  xml += `        </ObjectDictionary>\n`;
  xml += `        <Profile>\n`;
  xml += `          <ProfileNo>5001</ProfileNo>\n`;
  xml += `          <AddInfo>0</AddInfo>\n`;
  xml += `          <ProfileType>0</ProfileType>\n`;
  xml += `        </Profile>\n`;
  xml += `        <Diagnostic>\n`;
  xml += `          <DiagnosticItem Type="0x0001" Count="0">\n`;
  xml += `            <Text LcId="1033">Link lost</Text>\n`;
  xml += `            <Description LcId="1033">Link lost</Description>\n`;
  xml += `          </DiagnosticItem>\n`;
  xml += `        </Diagnostic>\n`;
  xml += `      </Device>\n`;
  xml += `    </Devices>\n`;
  xml += `  </Descriptions>\n`;
  xml += `</EtherCATInfo>\n`;

  return xml;
};

export const downloadEsiFile = (config: EsiConfig): void => {
  const xml = generateEsiXml(config);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.slaveInfo.slaveName.replace(/\s+/g, '_')}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};
