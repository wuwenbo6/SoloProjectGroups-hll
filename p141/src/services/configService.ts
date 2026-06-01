import type { GSDMLDevice, DeviceConfig, ValidationResult } from '../types/gsdml';

class ConfigService {
  createDefaultConfig(device: GSDMLDevice): DeviceConfig {
    const now = new Date().toISOString();
    return {
      deviceName: device.deviceName,
      ipAddress: '192.168.0.1',
      subnetMask: '255.255.255.0',
      gateway: '192.168.0.254',
      stationName: device.deviceName.toLowerCase().replace(/\s+/g, '-'),
      selectedModules: device.modules.slice(0, 1).map((m) => m.id),
      lldpEnabled: true,
      diagnosticEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  validateConfig(config: DeviceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.deviceName || config.deviceName.trim().length === 0) {
      errors.push('设备名称不能为空');
    }

    if (!this.isValidIPAddress(config.ipAddress)) {
      errors.push('IP地址格式不正确');
    }

    if (!this.isValidSubnetMask(config.subnetMask)) {
      errors.push('子网掩码格式不正确');
    }

    if (config.gateway && !this.isValidIPAddress(config.gateway)) {
      errors.push('网关地址格式不正确');
    }

    if (!this.isValidStationName(config.stationName)) {
      errors.push('站名称格式不正确，只能包含字母、数字、连字符和点');
    }

    if (config.ipAddress && config.gateway && this.isValidIPAddress(config.ipAddress) && this.isValidIPAddress(config.gateway)) {
      if (!this.isSameNetwork(config.ipAddress, config.subnetMask, config.gateway)) {
        warnings.push('网关与IP地址可能不在同一网段');
      }
    }

    if (config.selectedModules.length === 0) {
      warnings.push('未选择任何模块');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  updateConfig(config: DeviceConfig, updates: Partial<DeviceConfig>): DeviceConfig {
    return {
      ...config,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  private isValidIPAddress(ip: string): boolean {
    if (!ip) return false;
    const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  private isValidSubnetMask(mask: string): boolean {
    if (!this.isValidIPAddress(mask)) return false;
    
    const parts = mask.split('.').map(Number);
    let binaryStr = '';
    for (const part of parts) {
      binaryStr += part.toString(2).padStart(8, '0');
    }
    
    const firstZero = binaryStr.indexOf('0');
    if (firstZero === -1) return true;
    
    const rest = binaryStr.slice(firstZero);
    return !rest.includes('1');
  }

  private isValidStationName(name: string): boolean {
    if (!name || name.length < 1 || name.length > 240) return false;
    const stationNameRegex = /^[a-zA-Z0-9.-]+$/;
    return stationNameRegex.test(name);
  }

  private isSameNetwork(ip: string, mask: string, gateway: string): boolean {
    const ipParts = ip.split('.').map(Number);
    const maskParts = mask.split('.').map(Number);
    const gatewayParts = gateway.split('.').map(Number);

    for (let i = 0; i < 4; i++) {
      if ((ipParts[i] & maskParts[i]) !== (gatewayParts[i] & maskParts[i])) {
        return false;
      }
    }
    return true;
  }
}

export const configService = new ConfigService();
