import type {
  DeviceConfig,
  GSDMLDevice,
  Module,
  Submodule,
  IOData,
  Slot,
  VirtualModule,
  ProjectFile,
  ProjectDevice,
  LLDPConfig,
  DiagnosticInfo,
} from '../types/gsdml';

class ExportService {
  exportToJSON(config: DeviceConfig, device: GSDMLDevice): string {
    const exportData = {
      exportVersion: '2.0',
      exportTime: new Date().toISOString(),
      gsdmlVersion: device.gsdmlVersion,
      device: {
        vendorId: device.vendorId,
        vendorName: device.vendorName,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        productId: device.productId,
        version: device.version,
        familyName: device.familyName,
      },
      config: {
        deviceName: config.deviceName,
        ipAddress: config.ipAddress,
        subnetMask: config.subnetMask,
        gateway: config.gateway,
        stationName: config.stationName,
        selectedModules: config.selectedModules,
        slotConfiguration: config.slotConfiguration,
        lldpEnabled: config.lldpEnabled,
        diagnosticEnabled: config.diagnosticEnabled,
      },
      slots: device.slots?.map((slot) => ({
        id: slot.id,
        slotNumber: slot.slotNumber,
        name: slot.name,
        description: slot.description,
        isFixed: slot.isFixed,
        isPlugable: slot.isPlugable,
        allowedModules: slot.allowedModules,
        subslots: slot.subslots?.map((subslot) => ({
          id: subslot.id,
          subslotNumber: subslot.subslotNumber,
          name: subslot.name,
          allowedSubmodules: subslot.allowedSubmodules,
        })),
      })),
      virtualModules: device.virtualModules?.map((vm) => ({
        id: vm.id,
        name: vm.name,
        description: vm.description,
        submodules: vm.submodules.map((sm) => ({
          id: sm.id,
          name: sm.name,
          description: sm.description,
          ioData: sm.ioData,
        })),
        ioData: vm.ioData,
      })),
      diagnostics: device.diagnostics?.map((diag) => ({
        id: diag.id,
        name: diag.name,
        type: diag.type,
        severity: diag.severity,
        description: diag.description,
        channelDiagnostics: diag.channelDiagnostics?.map((cd) => ({
          id: cd.id,
          channelNumber: cd.channelNumber,
          channelName: cd.channelName,
          type: cd.type,
          direction: cd.direction,
          supportedCodes: cd.supportedCodes,
        })),
      })),
      lldpConfig: device.lldpConfig,
      modules: device.modules
        .filter((m) => config.selectedModules.includes(m.id))
        .map((m) => this.moduleToJSON(m)),
    };

    return JSON.stringify(exportData, null, 2);
  }

  private moduleToJSON(m: Module) {
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      isVirtual: m.isVirtual,
      category: m.info?.category,
      allowedInSlots: m.allowedInSlots,
      diagnostics: m.diagnostics,
      submodules: m.submodules?.map((sm) => ({
        id: sm.id,
        name: sm.name,
        description: sm.description,
        type: sm.type,
        isVirtual: sm.isVirtual,
        ioData: sm.ioData?.map((io) => this.ioToJSON(io)),
      })),
      ioData: m.ioData?.map((io) => this.ioToJSON(io)),
    };
  }

  private ioToJSON(io: IOData) {
    return {
      id: io.id,
      name: io.name,
      direction: io.direction,
      length: io.length,
      dataType: io.dataType,
      unit: io.unit,
      byteOffset: io.byteOffset,
      bitOffset: io.bitOffset,
    };
  }

  exportToXML(config: DeviceConfig, device: GSDMLDevice): string {
    const timestamp = new Date().toISOString();

    const selectedModules = device.modules.filter((m) => config.selectedModules.includes(m.id));

    let slotsXML = '';
    if (device.slots && device.slots.length > 0) {
      slotsXML += '  <Slots>\n';
      for (const slot of device.slots) {
        slotsXML += this.slotToXML(slot);
      }
      slotsXML += '  </Slots>\n';
    }

    let virtualModulesXML = '';
    if (device.virtualModules && device.virtualModules.length > 0) {
      virtualModulesXML += '  <VirtualModules>\n';
      for (const vm of device.virtualModules) {
        virtualModulesXML += this.virtualModuleToXML(vm);
      }
      virtualModulesXML += '  </VirtualModules>\n';
    }

    let diagnosticsXML = '';
    if (device.diagnostics && device.diagnostics.length > 0) {
      diagnosticsXML += '  <Diagnostics>\n';
      for (const diag of device.diagnostics) {
        diagnosticsXML += this.diagnosticToXML(diag);
      }
      diagnosticsXML += '  </Diagnostics>\n';
    }

    let lldpXML = '';
    if (device.lldpConfig) {
      lldpXML += this.lldpToXML(device.lldpConfig);
    }

    let modulesXML = '';
    if (selectedModules.length > 0) {
      modulesXML += '  <SelectedModules>\n';
      for (const module of selectedModules) {
        modulesXML += this.moduleToXML(module);
      }
      modulesXML += '  </SelectedModules>\n';
    }

    let slotConfigXML = '';
    if (config.slotConfiguration && config.slotConfiguration.length > 0) {
      slotConfigXML += '  <SlotConfiguration>\n';
      for (const sc of config.slotConfiguration) {
        slotConfigXML += `    <SlotConfig slotId="${this.escapeXML(sc.slotId)}" slotNumber="${sc.slotNumber}" moduleId="${this.escapeXML(sc.moduleId)}"/>\n`;
      }
      slotConfigXML += '  </SlotConfiguration>\n';
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<ProfinetDeviceConfig exportVersion="2.0" exportTime="${timestamp}" gsdmlVersion="${device.gsdmlVersion}">
  <DeviceInfo>
    <VendorID>${this.escapeXML(device.vendorId)}</VendorID>
    <VendorName>${this.escapeXML(device.vendorName)}</VendorName>
    <DeviceID>${this.escapeXML(device.deviceId)}</DeviceID>
    <DeviceName>${this.escapeXML(device.deviceName)}</DeviceName>
    <FamilyName>${this.escapeXML(device.familyName)}</FamilyName>
    <ProductID>${this.escapeXML(device.productId)}</ProductID>
    <Version>${this.escapeXML(device.version)}</Version>
  </DeviceInfo>
  <NetworkConfig>
    <DeviceName>${this.escapeXML(config.deviceName)}</DeviceName>
    <IPAddress>${this.escapeXML(config.ipAddress)}</IPAddress>
    <SubnetMask>${this.escapeXML(config.subnetMask)}</SubnetMask>
    <Gateway>${this.escapeXML(config.gateway)}</Gateway>
    <StationName>${this.escapeXML(config.stationName)}</StationName>
    <LLDPEnabled>${config.lldpEnabled ? 'true' : 'false'}</LLDPEnabled>
    <DiagnosticEnabled>${config.diagnosticEnabled ? 'true' : 'false'}</DiagnosticEnabled>
  </NetworkConfig>
${slotsXML}${virtualModulesXML}${diagnosticsXML}${lldpXML}${modulesXML}${slotConfigXML}</ProfinetDeviceConfig>`;
  }

  exportToProject(projectName: string, configs: Array<{ config: DeviceConfig; device: GSDMLDevice }>, description?: string): string {
    const projectFile: ProjectFile = {
      projectVersion: '1.0',
      projectName,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      devices: configs.map(({ config, device }, index) =>
        this.createProjectDevice(config, device, `device-${index + 1}`)
      ),
      topology: this.generateTopology(configs),
    };

    return JSON.stringify(projectFile, null, 2);
  }

  private createProjectDevice(config: DeviceConfig, device: GSDMLDevice, deviceId: string): ProjectDevice {
    return {
      id: deviceId,
      deviceName: config.deviceName,
      gsdmlInfo: {
        vendorId: device.vendorId,
        deviceId: device.deviceId,
        productId: device.productId,
        version: device.version,
        gsdmlVersion: device.gsdmlVersion,
      },
      networkConfig: {
        ipAddress: config.ipAddress,
        subnetMask: config.subnetMask,
        gateway: config.gateway,
        stationName: config.stationName,
      },
      moduleConfiguration:
        config.slotConfiguration?.map((sc) => ({
          slotNumber: sc.slotNumber,
          moduleId: sc.moduleId,
        })) ||
        config.selectedModules.map((moduleId, idx) => ({
          slotNumber: idx + 1,
          moduleId,
        })),
      lldpConfig: device.lldpConfig,
      diagnosticConfig: {
        enabled: config.diagnosticEnabled ?? true,
        monitoredChannels: device.diagnostics?.flatMap((d) => d.channelDiagnostics?.map((cd) => cd.id)),
      },
    };
  }

  private generateTopology(configs: Array<{ config: DeviceConfig; device: GSDMLDevice }>) {
    return {
      nodes: configs.map(({ config, device }, index) => ({
        deviceId: `device-${index + 1}`,
        deviceName: config.deviceName,
        ipAddress: config.ipAddress,
        ports:
          device.lldpConfig?.portConfigs?.map((pc) => ({
            portId: pc.portId,
            portName: pc.portDescription || `Port ${pc.portId}`,
            isConnected: false,
            lldpNeighbors: [],
          })) || [],
      })),
      connections: [],
    };
  }

  downloadProject(projectName: string, configs: Array<{ config: DeviceConfig; device: GSDMLDevice }>, description?: string): void {
    const content = this.exportToProject(projectName, configs, description);
    const mimeType = 'application/json';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName.replace(/\s+/g, '-').toLowerCase()}.pnproj`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private slotToXML(slot: Slot): string {
    let subslotsXML = '';
    if (slot.subslots && slot.subslots.length > 0) {
      subslotsXML += '      <Subslots>\n';
      for (const ss of slot.subslots) {
        subslotsXML += `        <Subslot id="${this.escapeXML(ss.id)}" subslotNumber="${ss.subslotNumber}">
          <Name>${this.escapeXML(ss.name)}</Name>
        </Subslot>\n`;
      }
      subslotsXML += '      </Subslots>\n';
    }

    let allowedModulesXML = '';
    if (slot.allowedModules && slot.allowedModules.length > 0) {
      allowedModulesXML += '      <AllowedModules>\n';
      for (const modId of slot.allowedModules) {
        allowedModulesXML += `        <ModuleRef id="${this.escapeXML(modId)}"/>\n`;
      }
      allowedModulesXML += '      </AllowedModules>\n';
    }

    return `    <Slot id="${this.escapeXML(slot.id)}" slotNumber="${slot.slotNumber}" fixed="${slot.isFixed ? 'true' : 'false'}" plugable="${slot.isPlugable ? 'true' : 'false'}">
      <Name>${this.escapeXML(slot.name)}</Name>
      ${slot.description ? `<Description>${this.escapeXML(slot.description)}</Description>` : ''}
${allowedModulesXML}${subslotsXML}    </Slot>
`;
  }

  private diagnosticToXML(diag: DiagnosticInfo): string {
    let channelDiagXML = '';
    if (diag.channelDiagnostics && diag.channelDiagnostics.length > 0) {
      channelDiagXML += '      <ChannelDiagnostics>\n';
      for (const cd of diag.channelDiagnostics) {
        channelDiagXML += `        <Channel id="${this.escapeXML(cd.id)}" channelNumber="${cd.channelNumber}" type="${cd.type}" direction="${cd.direction || ''}">
          <Name>${this.escapeXML(cd.channelName)}</Name>
          <SupportedCodes>\n`;
        for (const code of cd.supportedCodes) {
          channelDiagXML += `            <Code code="${this.escapeXML(code.code)}" severity="${code.severity}">
              <Name>${this.escapeXML(code.name)}</Name>
              <Description>${this.escapeXML(code.description)}</Description>
            </Code>\n`;
        }
        channelDiagXML += `          </SupportedCodes>
        </Channel>\n`;
      }
      channelDiagXML += '      </ChannelDiagnostics>\n';
    }

    return `    <Diagnostic id="${this.escapeXML(diag.id)}" type="${diag.type}" severity="${diag.severity}">
      <Name>${this.escapeXML(diag.name)}</Name>
      ${diag.description ? `<Description>${this.escapeXML(diag.description)}</Description>` : ''}
${channelDiagXML}    </Diagnostic>
`;
  }

  private lldpToXML(lldp: LLDPConfig): string {
    let portsXML = '';
    if (lldp.portConfigs && lldp.portConfigs.length > 0) {
      portsXML += '      <PortConfigs>\n';
      for (const pc of lldp.portConfigs) {
        portsXML += `        <Port id="${this.escapeXML(pc.portId)}" type="${pc.portIdType}" enabled="${pc.enabled ? 'true' : 'false'}">
          <Name>${this.escapeXML(pc.portDescription || pc.portId)}</Name>
          ${pc.ttl ? `<TTL>${pc.ttl}</TTL>` : ''}
        </Port>\n`;
      }
      portsXML += '      </PortConfigs>\n';
    }

    return `  <LLDPConfig enabled="${lldp.enabled ? 'true' : 'false'}">
      <DeviceInfo>
        <ChassisID>${this.escapeXML(lldp.deviceInfo.chassisId)}</ChassisID>
        <ChassisIDType>${this.escapeXML(lldp.deviceInfo.chassisIdType)}</ChassisIDType>
        ${lldp.deviceInfo.systemName ? `<SystemName>${this.escapeXML(lldp.deviceInfo.systemName)}</SystemName>` : ''}
        ${lldp.deviceInfo.systemDescription ? `<SystemDescription>${this.escapeXML(lldp.deviceInfo.systemDescription)}</SystemDescription>` : ''}
      </DeviceInfo>
${portsXML}  </LLDPConfig>
`;
  }

  private virtualModuleToXML(vm: VirtualModule): string {
    let submodulesXML = '';
    if (vm.submodules && vm.submodules.length > 0) {
      submodulesXML += '      <Submodules>\n';
      for (const sm of vm.submodules) {
        submodulesXML += this.submoduleToXML(sm, 8);
      }
      submodulesXML += '      </Submodules>\n';
    }

    return `    <VirtualModule id="${this.escapeXML(vm.id)}">
      <Name>${this.escapeXML(vm.name)}</Name>
      ${vm.description ? `<Description>${this.escapeXML(vm.description)}</Description>` : ''}
${submodulesXML}    </VirtualModule>
`;
  }

  private moduleToXML(module: Module): string {
    let submodulesXML = '';
    let ioDataXML = '';

    if (module.submodules && module.submodules.length > 0) {
      submodulesXML += '      <Submodules>\n';
      for (const sm of module.submodules) {
        submodulesXML += this.submoduleToXML(sm, 8);
      }
      submodulesXML += '      </Submodules>\n';
    }

    if (module.ioData && module.ioData.length > 0) {
      ioDataXML += '      <IOData>\n';
      for (const io of module.ioData) {
        ioDataXML += this.ioToXML(io, 8);
      }
      ioDataXML += '      </IOData>\n';
    }

    const category = module.info?.category ? ` category="${this.escapeXML(module.info.category)}"` : '';
    const virtual = module.isVirtual ? ` virtual="true"` : '';

    return `    <Module id="${this.escapeXML(module.id)}"${category}${virtual}>
      <Name>${this.escapeXML(module.name)}</Name>
      ${module.description ? `<Description>${this.escapeXML(module.description)}</Description>` : ''}
${submodulesXML}${ioDataXML}    </Module>
`;
  }

  private submoduleToXML(submodule: Submodule, indent: number): string {
    const spaces = ' '.repeat(indent);
    const childSpaces = ' '.repeat(indent + 2);
    let ioDataXML = '';

    if (submodule.ioData && submodule.ioData.length > 0) {
      ioDataXML += `${childSpaces}<IOData>\n`;
      for (const io of submodule.ioData) {
        ioDataXML += this.ioToXML(io, indent + 4);
      }
      ioDataXML += `${childSpaces}</IOData>\n`;
    }

    const type = submodule.type ? ` type="${this.escapeXML(submodule.type)}"` : '';
    const virtual = submodule.isVirtual ? ` virtual="true"` : '';

    return `${spaces}<Submodule id="${this.escapeXML(submodule.id)}"${type}${virtual}>
${childSpaces}<Name>${this.escapeXML(submodule.name)}</Name>
${submodule.description ? `${childSpaces}<Description>${this.escapeXML(submodule.description)}</Description>\n` : ''}${ioDataXML}${spaces}</Submodule>
`;
  }

  private ioToXML(io: IOData, indent: number): string {
    const spaces = ' '.repeat(indent);
    const dataType = io.dataType ? ` dataType="${this.escapeXML(io.dataType)}"` : '';
    const unit = io.unit ? ` unit="${this.escapeXML(io.unit)}"` : '';

    return `${spaces}<DataItem id="${this.escapeXML(io.id)}" direction="${this.escapeXML(io.direction)}" length="${io.length}"${dataType}${unit}>
${spaces}  <Name>${this.escapeXML(io.name)}</Name>
${spaces}</DataItem>
`;
  }

  private escapeXML(str: string | number | boolean | undefined): string {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  downloadFile(content: string, filename: string, format: 'json' | 'xml'): void {
    const mimeType = format === 'json' ? 'application/json' : 'application/xml';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const exportService = new ExportService();
