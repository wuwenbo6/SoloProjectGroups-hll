import { XMLParser } from 'fast-xml-parser';
import type {
  GSDMLDevice,
  Module,
  Submodule,
  IOData,
  TreeNode,
  ParsedGSDML,
  ValidationResult,
  GSDMLVersion,
  Slot,
  Subslot,
  VirtualModule,
  DiagnosticInfo,
  ChannelDiagnostic,
  DiagnosticCode,
  LLDPConfig,
  LLDPPortConfig,
  LLDPDeviceInfo,
} from '../types/gsdml';

class GSDMLParserService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      allowBooleanAttributes: true,
      parseAttributeValue: true,
      trimValues: true,
      ignoreDeclaration: false,
      ignorePiTags: false,
    });
  }

  detectGSDMLVersion(xmlContent: string): GSDMLVersion {
    if (xmlContent.includes('GSDML/2003/11/DeviceProfile')) {
      return '2.3';
    }
    if (xmlContent.includes('GSDML/2007/07/DeviceProfile') || xmlContent.includes('GSDML/2.4')) {
      return '2.4';
    }
    if (xmlContent.includes('ISO15745Profile')) {
      return '2.3';
    }
    return 'unknown';
  }

  validate(xmlContent: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!xmlContent || xmlContent.trim().length === 0) {
      errors.push('XML内容为空');
      return { valid: false, errors, warnings };
    }

    const version = this.detectGSDMLVersion(xmlContent);
    if (version === 'unknown') {
      warnings.push('无法确定GSDML版本，尝试通用解析');
    } else {
      warnings.push(`检测到GSDML版本: ${version}`);
    }

    if (!xmlContent.includes('<ISO15745Profile') && !xmlContent.includes('ISO15745Profile')) {
      warnings.push('未找到ISO15745Profile根元素，可能不是标准GSDML文件');
    }

    try {
      this.parser.parse(xmlContent);
    } catch (e) {
      errors.push(`XML解析错误: ${(e as Error).message}`);
      return { valid: false, errors, warnings };
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async parse(xmlContent: string): Promise<ParsedGSDML> {
    const validation = this.validate(xmlContent);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    const gsdmlVersion = this.detectGSDMLVersion(xmlContent);
    const parsed = this.parser.parse(xmlContent);
    const device = this.extractDeviceInfo(parsed, gsdmlVersion);

    return {
      device,
      rawXml: xmlContent,
      parsedAt: new Date().toISOString(),
      gsdmlVersion,
    };
  }

  private extractDeviceInfo(parsed: unknown, gsdmlVersion: GSDMLVersion): GSDMLDevice {
    const profile = this.getPathValue(parsed, 'ISO15745Profile') || this.getPathValue(parsed, 'ISO15745Profile');
    const profileHeader = this.getPathValue(profile, 'ProfileHeader');
    const profileBody = this.getPathValue(profile, 'ProfileBody');
    const deviceIdentity = this.getPathValue(profileBody, 'DeviceIdentity');
    const deviceFunction = this.getPathValue(profileBody, 'DeviceFunction');

    const vendorId =
      this.getAttrValue(profileHeader, '@_ProfileRevision', 'ProfileIdentification') ||
      this.getAttrValue(profileHeader, 'ProfileRevision', 'ProfileIdentification') ||
      this.getAttrValue(deviceIdentity, '@_VendorID') ||
      this.getAttrValue(deviceIdentity, 'VendorID');

    const vendorName =
      this.getTextValue(profileHeader, 'ProfileIdentification', 'ProfileName') ||
      this.getAttrValue(deviceIdentity, 'VendorName', 'VendorName') ||
      this.getTextValue(deviceIdentity, 'VendorName') ||
      this.getAttrValue(deviceIdentity, 'VendorName');

    const deviceId =
      this.getAttrValue(deviceIdentity, '@_DeviceID') ||
      this.getAttrValue(deviceIdentity, 'DeviceID') ||
      this.getAttrValue(deviceIdentity, '@_DeviceID');

    const deviceName =
      this.getTextValue(deviceIdentity, 'DeviceName') ||
      this.getAttrValue(deviceIdentity, 'DeviceName', 'DeviceName') ||
      this.getAttrValue(deviceIdentity, '@_DeviceName') ||
      'Unknown Device';

    const familyName =
      this.getTextValue(deviceIdentity, 'FamilyName') ||
      this.getAttrValue(deviceIdentity, 'FamilyName', 'FamilyName') ||
      this.getAttrValue(deviceIdentity, '@_FamilyName') ||
      'Unknown Family';

    const productId =
      this.getAttrValue(deviceIdentity, '@_ProductID') ||
      this.getAttrValue(deviceIdentity, 'ProductID') ||
      '0x0000';

    const version =
      this.getAttrValue(deviceIdentity, '@_Revision') ||
      this.getAttrValue(deviceIdentity, 'Revision') ||
      this.getTextValue(deviceIdentity, 'SoftwareRelease') ||
      '1.0';

    const modules = this.extractModules(deviceFunction, gsdmlVersion);
    const virtualModules = this.extractVirtualModules(deviceFunction, gsdmlVersion);
    const slots = this.extractSlots(deviceFunction, gsdmlVersion);
    const diagnostics = this.extractDiagnostics(deviceFunction);
    const lldpConfig = this.extractLLDPConfig(deviceFunction, deviceIdentity);

    return {
      vendorId: String(vendorId || '0x0000'),
      vendorName: String(vendorName || 'Unknown Vendor'),
      deviceId: String(deviceId || '0x0000'),
      deviceName: String(deviceName || 'Unknown Device'),
      familyName: String(familyName || 'Unknown Family'),
      productId: String(productId || '0x0000'),
      version: String(version || '1.0'),
      gsdmlVersion,
      modules,
      virtualModules: virtualModules.length > 0 ? virtualModules : undefined,
      slots: slots.length > 0 ? slots : undefined,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      lldpConfig,
    };
  }

  private extractModules(deviceFunction: unknown, gsdmlVersion: GSDMLVersion): Module[] {
    const modules: Module[] = [];

    const moduleList =
      this.getPathValue(deviceFunction, 'ModuleList') ||
      this.getPathValue(deviceFunction, 'Modules') ||
      this.getPathValue(deviceFunction, 'ModuleCatalog');

    if (!moduleList) {
      return modules;
    }

    const moduleItems = this.ensureArray(this.getPathValue(moduleList, 'Module'));

    for (const item of moduleItems) {
      const module = this.parseModule(item, gsdmlVersion);
      if (module) {
        modules.push(module);
      }
    }

    return modules;
  }

  private extractVirtualModules(deviceFunction: unknown, gsdmlVersion: GSDMLVersion): VirtualModule[] {
    const virtualModules: VirtualModule[] = [];

    const virtualModuleList =
      this.getPathValue(deviceFunction, 'VirtualModuleList') ||
      this.getPathValue(deviceFunction, 'VirtualModules') ||
      this.getPathValue(deviceFunction, 'VirtualSubmoduleList');

    if (!virtualModuleList) {
      return virtualModules;
    }

    const virtualItems = this.ensureArray(
      this.getPathValue(virtualModuleList, 'VirtualModule') ||
        this.getPathValue(virtualModuleList, 'VirtualSubmodule') ||
        this.getPathValue(virtualModuleList, 'Module')
    );

    for (const item of virtualItems) {
      const virtualModule = this.parseVirtualModule(item, gsdmlVersion);
      if (virtualModule) {
        virtualModules.push(virtualModule);
      }
    }

    return virtualModules;
  }

  private extractSlots(deviceFunction: unknown, gsdmlVersion: GSDMLVersion): Slot[] {
    const slots: Slot[] = [];

    const slotDefs =
      this.getPathValue(deviceFunction, 'SlotDefList') ||
      this.getPathValue(deviceFunction, 'SlotDefinitions') ||
      this.getPathValue(deviceFunction, 'Slots');

    if (!slotDefs) {
      return slots;
    }

    const slotItems = this.ensureArray(
      this.getPathValue(slotDefs, 'SlotDef') || this.getPathValue(slotDefs, 'Slot')
    );

    for (const item of slotItems) {
      const slot = this.parseSlot(item, gsdmlVersion);
      if (slot) {
        slots.push(slot);
      }
    }

    return slots;
  }

  private extractDiagnostics(deviceFunction: unknown): DiagnosticInfo[] {
    const diagnostics: DiagnosticInfo[] = [];

    const diagnosticList =
      this.getPathValue(deviceFunction, 'DiagnosticItemList') ||
      this.getPathValue(deviceFunction, 'Diagnostics') ||
      this.getPathValue(deviceFunction, 'LogBookEntryList');

    if (!diagnosticList) {
      return diagnostics;
    }

    const diagnosticItems = this.ensureArray(
      this.getPathValue(diagnosticList, 'DiagnosticItem') ||
        this.getPathValue(diagnosticList, 'Diagnostic') ||
        this.getPathValue(diagnosticList, 'LogBookEntry')
    );

    for (const item of diagnosticItems) {
      const diag = this.parseDiagnostic(item);
      if (diag) {
        diagnostics.push(diag);
      }
    }

    const channelDiagItem = this.extractChannelDiagnostics(deviceFunction);
    if (channelDiagItem) {
      diagnostics.push(channelDiagItem);
    }

    return diagnostics;
  }

  private extractChannelDiagnostics(deviceFunction: unknown): DiagnosticInfo | null {
    const modules = this.getPathValue(deviceFunction, 'ModuleList') || this.getPathValue(deviceFunction, 'Modules');
    if (!modules) return null;

    const moduleItems = this.ensureArray(this.getPathValue(modules, 'Module'));
    const channelDiagnostics: ChannelDiagnostic[] = [];

    for (const moduleItem of moduleItems) {
      const submoduleList =
        this.getPathValue(moduleItem, 'SubmoduleList') || this.getPathValue(moduleItem, 'Submodules');
      if (!submoduleList) continue;

      const submoduleItems = this.ensureArray(this.getPathValue(submoduleList, 'Submodule'));
      for (const submoduleItem of submoduleItems) {
        const ioData = this.getPathValue(submoduleItem, 'IOData');
        if (!ioData) continue;

        const inputs = this.getPathValue(ioData, 'Input');
        const outputs = this.getPathValue(ioData, 'Output');

        if (inputs) {
          const inputItems = this.ensureArray(this.getPathValue(inputs, 'DataItem'));
          inputItems.forEach((item: unknown, idx: number) => {
            const name = this.getAttrValue(item, '@_Name') || `Input ${idx + 1}`;
            channelDiagnostics.push({
              id: `diag_input_${idx}`,
              channelNumber: idx + 1,
              channelName: name,
              type: 'digital',
              direction: 'input',
              supportedCodes: [
                { code: '0x0001', name: 'Short circuit', description: 'Short circuit detected', severity: 'error' },
                { code: '0x0002', name: 'Overload', description: 'Channel overload detected', severity: 'warning' },
                { code: '0x0003', name: 'Wire break', description: 'Wire break detected', severity: 'fault' },
              ],
            });
          });
        }

        if (outputs) {
          const outputItems = this.ensureArray(this.getPathValue(outputs, 'DataItem'));
          outputItems.forEach((item: unknown, idx: number) => {
            const name = this.getAttrValue(item, '@_Name') || `Output ${idx + 1}`;
            channelDiagnostics.push({
              id: `diag_output_${idx}`,
              channelNumber: idx + 1,
              channelName: name,
              type: 'digital',
              direction: 'output',
              supportedCodes: [
                { code: '0x0001', name: 'Short circuit', description: 'Short circuit detected', severity: 'error' },
                { code: '0x0002', name: 'Overload', description: 'Channel overload detected', severity: 'warning' },
                { code: '0x0003', name: 'Underload', description: 'Channel underload detected', severity: 'warning' },
              ],
            });
          });
        }
      }
    }

    if (channelDiagnostics.length > 0) {
      return {
        id: 'channel-diagnostics',
        name: 'Channel Diagnostics',
        type: 'channel',
        severity: 'info',
        description: 'Per-channel diagnostic information',
        channelDiagnostics,
      };
    }

    return null;
  }

  private extractLLDPConfig(deviceFunction: unknown, deviceIdentity: unknown): LLDPConfig | undefined {
    const lldpSection =
      this.getPathValue(deviceFunction, 'LLDP') ||
      this.getPathValue(deviceFunction, 'LLDPConfig') ||
      this.getPathValue(deviceFunction, 'NetworkConfig');

    const chassisId =
      this.getAttrValue(deviceIdentity, '@_DeviceID') || this.getAttrValue(deviceIdentity, 'DeviceID') || '00:00:00:00:00:00';

    const deviceName =
      this.getTextValue(deviceIdentity, 'DeviceName') ||
      this.getAttrValue(deviceIdentity, 'DeviceName', 'DeviceName') ||
      'PROFINET Device';

    const portConfigs: LLDPPortConfig[] = [];

    const slotDefs = this.getPathValue(deviceFunction, 'SlotDefList');
    if (slotDefs) {
      const slotItems = this.ensureArray(this.getPathValue(slotDefs, 'SlotDef'));
      for (const slot of slotItems) {
        const subslotList = this.getPathValue(slot, 'SubslotDefList');
        if (subslotList) {
          const subslotItems = this.ensureArray(this.getPathValue(subslotList, 'SubslotDef'));
          for (const subslot of subslotItems) {
            const subslotId = this.getAttrValue(subslot, '@_ID') || this.getAttrValue(subslot, 'ID');
            const subslotNumber = Number(this.getAttrValue(subslot, '@_SubslotNumber') || 0);
            portConfigs.push({
              portId: String(subslotId || `port-${subslotNumber}`),
              portIdType: 'local',
              portDescription: `Port ${subslotNumber}`,
              enabled: true,
              ttl: 120,
            });
          }
        }
      }
    }

    if (portConfigs.length === 0) {
      portConfigs.push(
        { portId: 'port-1', portIdType: 'local', portDescription: 'Port 1', enabled: true, ttl: 120 },
        { portId: 'port-2', portIdType: 'local', portDescription: 'Port 2', enabled: true, ttl: 120 }
      );
    }

    return {
      enabled: true,
      portConfigs,
      deviceInfo: {
        chassisId: String(chassisId),
        chassisIdType: 'local',
        systemName: String(deviceName),
        systemDescription: 'PROFINET IO Device',
        systemCapabilities: ['bridge', 'router'],
      },
    };
  }

  private parseDiagnostic(item: unknown): DiagnosticInfo | null {
    if (!item) return null;

    const id = this.getAttrValue(item, '@_ID') || this.getAttrValue(item, 'ID');
    const name =
      this.getTextValue(item, 'Name') ||
      this.getAttrValue(item, '@_Name') ||
      this.getAttrValue(item, 'DiagnosticType') ||
      'Diagnostic';

    const severity = (this.getAttrValue(item, '@_Severity') || 'info') as DiagnosticInfo['severity'];

    return {
      id: String(id || `diag_${Date.now()}_${Math.random()}`),
      name: String(name),
      type: 'device',
      severity: ['info', 'warning', 'error', 'fault'].includes(severity) ? severity : 'info',
      description: this.getTextValue(item, 'Description') || this.getAttrValue(item, '@_Description'),
      helpText: this.getTextValue(item, 'HelpText') || this.getAttrValue(item, '@_HelpText'),
    };
  }

  private parseModule(item: unknown, gsdmlVersion: GSDMLVersion): Module | null {
    if (!item) return null;

    const id = this.getAttrValue(item, '@_ID') || this.getAttrValue(item, 'ID');
    const name =
      this.getAttrValue(item, '@_Name') ||
      this.getTextValue(item, 'Name') ||
      this.getAttrValue(item, 'Name', 'Name') ||
      'Unknown Module';

    const isVirtual = this.getAttrValue(item, '@_Virtual') === 'true' || false;
    const category = this.getAttrValue(item, '@_Category') || this.getAttrValue(item, 'Category');

    const submodules = this.extractSubmodules(item, gsdmlVersion);
    const ioData = this.extractIOData(item);
    const allowedInSlots = this.extractAllowedSlots(item);
    const diagnostics = this.extractModuleDiagnostics(item);

    return {
      id: String(id || `mod_${Date.now()}_${Math.random()}`),
      name: String(name),
      type: 'module',
      description:
        this.getTextValue(item, 'Description') ||
        this.getAttrValue(item, 'InfoText', 'InfoText') ||
        this.getAttrValue(item, '@_InfoText'),
      submodules: submodules.length > 0 ? submodules : undefined,
      ioData: ioData.length > 0 ? ioData : undefined,
      isVirtual: isVirtual || undefined,
      allowedInSlots: allowedInSlots.length > 0 ? allowedInSlots : undefined,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      info: {
        category: category || undefined,
      },
    };
  }

  private extractModuleDiagnostics(moduleItem: unknown): ChannelDiagnostic[] {
    const diagnostics: ChannelDiagnostic[] = [];
    return diagnostics;
  }

  private parseVirtualModule(item: unknown, gsdmlVersion: GSDMLVersion): VirtualModule | null {
    if (!item) return null;

    const id = this.getAttrValue(item, '@_ID') || this.getAttrValue(item, 'ID');
    const name =
      this.getAttrValue(item, '@_Name') ||
      this.getTextValue(item, 'Name') ||
      this.getAttrValue(item, 'Name', 'Name') ||
      'Virtual Module';

    const submodules = this.extractSubmodules(item, gsdmlVersion);
    const ioData = this.extractIOData(item);

    return {
      id: String(id || `vmod_${Date.now()}_${Math.random()}`),
      name: String(name),
      description:
        this.getTextValue(item, 'Description') ||
        this.getAttrValue(item, 'InfoText', 'InfoText') ||
        this.getAttrValue(item, '@_InfoText'),
      submodules: submodules.length > 0 ? submodules : [],
      ioData: ioData.length > 0 ? ioData : undefined,
    };
  }

  private parseSlot(item: unknown, gsdmlVersion: GSDMLVersion): Slot | null {
    if (!item) return null;

    const id = this.getAttrValue(item, '@_ID') || this.getAttrValue(item, 'ID');
    const slotNumber = Number(this.getAttrValue(item, '@_SlotNumber') || this.getAttrValue(item, 'SlotNumber') || 0);
    const name =
      this.getAttrValue(item, '@_Name') ||
      this.getTextValue(item, 'Name') ||
      `Slot ${slotNumber}`;

    const isFixed = this.getAttrValue(item, '@_Fixed') === 'true' || false;
    const isPlugable = this.getAttrValue(item, '@_Plugable') !== 'false';

    const allowedModules = this.extractAllowedModules(item);
    const subslots = this.extractSubslots(item, gsdmlVersion);

    return {
      id: String(id || `slot_${slotNumber}`),
      slotNumber,
      name: String(name),
      description: this.getTextValue(item, 'Description') || this.getAttrValue(item, '@_Description'),
      allowedModules,
      subslots: subslots.length > 0 ? subslots : undefined,
      isFixed: isFixed || undefined,
      isPlugable: isPlugable || undefined,
    };
  }

  private extractSubslots(slotItem: unknown, gsdmlVersion: GSDMLVersion): Subslot[] {
    const subslots: Subslot[] = [];

    const subslotList =
      this.getPathValue(slotItem, 'SubslotDefList') ||
      this.getPathValue(slotItem, 'Subslots') ||
      this.getPathValue(slotItem, 'SubslotDefinitions');

    if (!subslotList) {
      return subslots;
    }

    const subslotItems = this.ensureArray(
      this.getPathValue(subslotList, 'SubslotDef') || this.getPathValue(subslotList, 'Subslot')
    );

    for (const item of subslotItems) {
      const subslot = this.parseSubslot(item);
      if (subslot) {
        subslots.push(subslot);
      }
    }

    return subslots;
  }

  private parseSubslot(item: unknown): Subslot | null {
    if (!item) return null;

    const id = this.getAttrValue(item, '@_ID') || this.getAttrValue(item, 'ID');
    const subslotNumber = Number(
      this.getAttrValue(item, '@_SubslotNumber') || this.getAttrValue(item, 'SubslotNumber') || 0
    );
    const name =
      this.getAttrValue(item, '@_Name') ||
      this.getTextValue(item, 'Name') ||
      `Subslot ${subslotNumber}`;

    const allowedSubmodules = this.extractAllowedSubmodules(item);

    return {
      id: String(id || `subslot_${subslotNumber}`),
      subslotNumber,
      name: String(name),
      description: this.getTextValue(item, 'Description'),
      allowedSubmodules,
    };
  }

  private extractSubmodules(moduleItem: unknown, gsdmlVersion: GSDMLVersion): Submodule[] {
    const submodules: Submodule[] = [];

    const submoduleList =
      this.getPathValue(moduleItem, 'SubmoduleList') ||
      this.getPathValue(moduleItem, 'Submodules') ||
      this.getPathValue(moduleItem, 'SubmoduleDefList');

    if (!submoduleList) {
      return submodules;
    }

    const submoduleItems = this.ensureArray(
      this.getPathValue(submoduleList, 'Submodule') || this.getPathValue(submoduleList, 'SubmoduleDef')
    );

    for (const item of submoduleItems) {
      const submodule = this.parseSubmodule(item, gsdmlVersion);
      if (submodule) {
        submodules.push(submodule);
      }
    }

    return submodules;
  }

  private parseSubmodule(item: unknown, gsdmlVersion: GSDMLVersion): Submodule | null {
    if (!item) return null;

    const id = this.getAttrValue(item, '@_ID') || this.getAttrValue(item, 'ID');
    const name =
      this.getAttrValue(item, '@_Name') ||
      this.getTextValue(item, 'Name') ||
      this.getAttrValue(item, 'Name', 'Name') ||
      'Unknown Submodule';

    const isVirtual = this.getAttrValue(item, '@_Virtual') === 'true' || false;
    const ioData = this.extractIOData(item);

    let submoduleType: 'standard' | 'virtual' | 'plug' = 'standard';
    if (isVirtual) {
      submoduleType = 'virtual';
    } else if (this.getAttrValue(item, '@_Plug') === 'true') {
      submoduleType = 'plug';
    }

    return {
      id: String(id || `submod_${Date.now()}_${Math.random()}`),
      name: String(name),
      description:
        this.getTextValue(item, 'Description') ||
        this.getAttrValue(item, 'InfoText', 'InfoText') ||
        this.getAttrValue(item, '@_InfoText'),
      ioData: ioData.length > 0 ? ioData : undefined,
      isVirtual: isVirtual || undefined,
      type: submoduleType,
    };
  }

  private extractIOData(item: unknown): IOData[] {
    const ioDataList: IOData[] = [];

    const ioDataContainer =
      this.getPathValue(item, 'IOData') ||
      this.getPathValue(item, 'IO') ||
      this.getPathValue(item, 'ProcessData');

    if (!ioDataContainer) {
      return ioDataList;
    }

    const inputs =
      this.getPathValue(ioDataContainer, 'Input') ||
      this.getPathValue(ioDataContainer, 'Inputs') ||
      this.getPathValue(ioDataContainer, 'InputData');
    const outputs =
      this.getPathValue(ioDataContainer, 'Output') ||
      this.getPathValue(ioDataContainer, 'Outputs') ||
      this.getPathValue(ioDataContainer, 'OutputData');

    if (inputs) {
      const inputItems = this.ensureArray(
        this.getPathValue(inputs, 'DataItem') ||
          this.getPathValue(inputs, 'Data') ||
          this.getPathValue(inputs, 'InputDataItem') ||
          (this.hasDataAttrs(inputs) ? [inputs] : [])
      );
      inputItems.forEach((dataItem: unknown, index: number) => {
        const io = this.parseIOData(dataItem, 'input', index);
        if (io) ioDataList.push(io);
      });
    }

    if (outputs) {
      const outputItems = this.ensureArray(
        this.getPathValue(outputs, 'DataItem') ||
          this.getPathValue(outputs, 'Data') ||
          this.getPathValue(outputs, 'OutputDataItem') ||
          (this.hasDataAttrs(outputs) ? [outputs] : [])
      );
      outputItems.forEach((dataItem: unknown, index: number) => {
        const io = this.parseIOData(dataItem, 'output', index);
        if (io) ioDataList.push(io);
      });
    }

    return ioDataList;
  }

  private hasDataAttrs(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj as Record<string, unknown>);
    return keys.some((k) => k.includes('Length') || k.includes('Offset') || k.includes('ID'));
  }

  private parseIOData(dataItem: unknown, direction: 'input' | 'output', index: number): IOData | null {
    if (!dataItem) return null;

    const id =
      this.getAttrValue(dataItem, '@_ID') ||
      this.getAttrValue(dataItem, 'ID') ||
      this.getAttrValue(dataItem, '@_DataItemID');
    const name =
      this.getAttrValue(dataItem, '@_Name') ||
      this.getTextValue(dataItem, 'Name') ||
      this.getAttrValue(dataItem, 'Name', 'Name') ||
      `${direction === 'input' ? 'Input' : 'Output'} ${index + 1}`;
    const length = Number(
      this.getAttrValue(dataItem, '@_Length') ||
        this.getAttrValue(dataItem, 'Length') ||
        this.getAttrValue(dataItem, '@_BitLength') ||
        1
    );
    const dataType = this.getAttrValue(dataItem, '@_DataType') || this.getAttrValue(dataItem, 'DataType');

    return {
      id: String(id || `io_${direction}_${index}`),
      name: String(name),
      direction,
      length,
      unit:
        this.getAttrValue(dataItem, 'Unit') ||
        this.getAttrValue(dataItem, '@_Unit') ||
        this.getAttrValue(dataItem, '@_Unit'),
      byteOffset: Number(
        this.getAttrValue(dataItem, 'ByteOffset') || this.getAttrValue(dataItem, '@_ByteOffset') || 0
      ),
      bitOffset: Number(
        this.getAttrValue(dataItem, 'BitOffset') || this.getAttrValue(dataItem, '@_BitOffset') || 0
      ),
      dataType: dataType || undefined,
    };
  }

  private extractAllowedModules(slotItem: unknown): string[] {
    const allowed: string[] = [];

    const allowedModules =
      this.getPathValue(slotItem, 'AllowedModuleList') ||
      this.getPathValue(slotItem, 'AllowedModules') ||
      this.getPathValue(slotItem, 'Modules');

    if (!allowedModules) {
      return allowed;
    }

    const moduleRefs = this.ensureArray(
      this.getPathValue(allowedModules, 'AllowedModule') ||
        this.getPathValue(allowedModules, 'ModuleRef') ||
        this.getPathValue(allowedModules, 'Module')
    );

    for (const ref of moduleRefs) {
      const moduleId = this.getAttrValue(ref, '@_ModuleIDRef') || this.getAttrValue(ref, '@_ID');
      if (moduleId) {
        allowed.push(String(moduleId));
      }
    }

    return allowed;
  }

  private extractAllowedSubmodules(subslotItem: unknown): string[] {
    const allowed: string[] = [];

    const allowedSubmodules =
      this.getPathValue(subslotItem, 'AllowedSubmoduleList') ||
      this.getPathValue(subslotItem, 'AllowedSubmodules') ||
      this.getPathValue(subslotItem, 'Submodules');

    if (!allowedSubmodules) {
      return allowed;
    }

    const submoduleRefs = this.ensureArray(
      this.getPathValue(allowedSubmodules, 'AllowedSubmodule') ||
        this.getPathValue(allowedSubmodules, 'SubmoduleRef') ||
        this.getPathValue(allowedSubmodules, 'Submodule')
    );

    for (const ref of submoduleRefs) {
      const submoduleId =
        this.getAttrValue(ref, '@_SubmoduleIDRef') || this.getAttrValue(ref, '@_ID');
      if (submoduleId) {
        allowed.push(String(submoduleId));
      }
    }

    return allowed;
  }

  private extractAllowedSlots(moduleItem: unknown): string[] {
    const allowed: string[] = [];

    const allowedSlots =
      this.getPathValue(moduleItem, 'AllowedInSlotList') ||
      this.getPathValue(moduleItem, 'AllowedSlots') ||
      this.getPathValue(moduleItem, 'Slots');

    if (!allowedSlots) {
      return allowed;
    }

    const slotRefs = this.ensureArray(
      this.getPathValue(allowedSlots, 'AllowedInSlot') || this.getPathValue(allowedSlots, 'SlotRef')
    );

    for (const ref of slotRefs) {
      const slotId = this.getAttrValue(ref, '@_SlotIDRef') || this.getAttrValue(ref, '@_ID');
      if (slotId) {
        allowed.push(String(slotId));
      }
    }

    return allowed;
  }

  getModuleTree(device: GSDMLDevice): TreeNode[] {
    const children: TreeNode[] = [];

    if (device.slots && device.slots.length > 0) {
      const slotsNode: TreeNode = {
        id: 'slots-root',
        name: '插槽定义',
        type: 'slot',
        expanded: false,
        children: device.slots.map((slot) => ({
          id: `slot-${slot.id}`,
          name: slot.name,
          type: 'slot',
          data: slot,
          expanded: false,
          children: slot.subslots?.map((subslot) => ({
            id: `subslot-${subslot.id}`,
            name: subslot.name,
            type: 'slot',
            data: subslot,
          })),
        })),
      };
      children.push(slotsNode);
    }

    if (device.virtualModules && device.virtualModules.length > 0) {
      const virtualNode: TreeNode = {
        id: 'virtual-root',
        name: '虚拟模块',
        type: 'virtual',
        expanded: false,
        children: device.virtualModules.map((vm) => ({
          id: `virtual-${vm.id}`,
          name: vm.name,
          type: 'virtual',
          data: vm,
          expanded: false,
          children: vm.submodules.map((sm) => ({
            id: `vsub-${sm.id}`,
            name: sm.name,
            type: 'submodule',
            data: sm,
          })),
        })),
      };
      children.push(virtualNode);
    }

    if (device.diagnostics && device.diagnostics.length > 0) {
      const diagNode: TreeNode = {
        id: 'diagnostics-root',
        name: '诊断信息',
        type: 'diagnostic',
        expanded: false,
        children: device.diagnostics.map((diag) => ({
          id: `diag-${diag.id}`,
          name: diag.name,
          type: 'diagnostic',
          data: diag,
          expanded: false,
          children: diag.channelDiagnostics?.map((cd) => ({
            id: `channeldiag-${cd.id}`,
            name: cd.channelName,
            type: 'diagnostic',
            data: cd,
          })),
        })),
      };
      children.push(diagNode);
    }

    if (device.lldpConfig) {
      const lldpNode: TreeNode = {
        id: 'lldp-root',
        name: 'LLDP 配置',
        type: 'lldp',
        data: device.lldpConfig,
        expanded: false,
        children: device.lldpConfig.portConfigs?.map((pc) => ({
          id: `lldp-port-${pc.portId}`,
          name: pc.portDescription || pc.portId,
          type: 'lldp',
          data: pc,
        })),
      };
      children.push(lldpNode);
    }

    const modulesNode: TreeNode = {
      id: 'modules-root',
      name: '模块',
      type: 'module',
      expanded: true,
      children: device.modules.map((module) => ({
        id: module.id,
        name: module.name,
        type: 'module',
        data: module,
        expanded: false,
        children: this.buildModuleChildren(module),
      })),
    };
    children.push(modulesNode);

    const tree: TreeNode[] = [
      {
        id: 'device-root',
        name: device.deviceName,
        type: 'device',
        data: device,
        expanded: true,
        children,
      },
    ];

    return tree;
  }

  private buildModuleChildren(module: Module): TreeNode[] {
    const children: TreeNode[] = [];

    if (module.submodules && module.submodules.length > 0) {
      module.submodules.forEach((submodule) => {
        children.push({
          id: submodule.id,
          name: submodule.name,
          type: 'submodule',
          data: submodule,
          expanded: false,
          children: this.buildIOChildren(submodule.ioData),
        });
      });
    }

    if (module.ioData && module.ioData.length > 0) {
      children.push(...this.buildIOChildren(module.ioData));
    }

    return children;
  }

  private buildIOChildren(ioData?: IOData[]): TreeNode[] {
    if (!ioData || ioData.length === 0) return [];

    return ioData.map((io) => ({
      id: io.id,
      name: io.name,
      type: io.direction === 'input' ? 'input' : 'output',
      data: io,
    }));
  }

  private ensureArray(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
  }

  private getPathValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === 'object') {
        const record = current as Record<string, unknown>;
        if (part in record) {
          current = record[part];
        } else {
          const nsKeys = Object.keys(record).filter((k) => k.includes(part));
          if (nsKeys.length > 0) {
            current = record[nsKeys[0]];
          } else {
            return undefined;
          }
        }
      } else {
        return undefined;
      }
    }

    return current;
  }

  private getAttrValue(obj: unknown, attr: string, subPath?: string): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    if (subPath) {
      const subObj = (obj as Record<string, unknown>)[subPath];
      if (subObj && typeof subObj === 'object') {
        const subRecord = subObj as Record<string, unknown>;
        const value =
          subRecord[attr] ??
          subRecord[`@_${attr}`] ??
          subRecord[`@_${attr}Value`] ??
          (subRecord['#text'] ? subRecord['#text'] : undefined);
        return value !== undefined ? String(value) : undefined;
      }
      return undefined;
    }

    const record = obj as Record<string, unknown>;
    const value =
      record[attr] ??
      record[`@_${attr}`] ??
      record[`@_${attr}Value`] ??
      (record['Value'] !== undefined ? record['Value'] : undefined) ??
      (record['#text'] ? record['#text'] : undefined);

    return value !== undefined ? String(value) : undefined;
  }

  private getTextValue(obj: unknown, key: string, subPath?: string): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    let target = obj;
    if (subPath) {
      target = (obj as Record<string, unknown>)[subPath];
      if (!target || typeof target !== 'object') return undefined;
    }

    const value = (target as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const valueRecord = value as Record<string, unknown>;
      if ('#text' in valueRecord) {
        return String(valueRecord['#text']);
      }
      if ('Value' in valueRecord) {
        return String(valueRecord['Value']);
      }
      if ('@_Value' in valueRecord) {
        return String(valueRecord['@_Value']);
      }
    }

    return undefined;
  }
}

export const gsdmlParser = new GSDMLParserService();
