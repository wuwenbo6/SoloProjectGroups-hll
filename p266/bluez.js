const { systemBus, DBusError, interfaces: { DBusObjectManager, DBusProperties }, Variant } = require('dbus-next');
const { EventEmitter } = require('events');

const BLUEZ_SERVICE = 'org.bluez';
const ADAPTER_INTERFACE = 'org.bluez.Adapter1';
const DEVICE_INTERFACE = 'org.bluez.Device1';
const AGENT_INTERFACE = 'org.bluez.Agent1';
const AGENT_MANAGER_INTERFACE = 'org.bluez.AgentManager1';
const OBJECT_MANAGER_INTERFACE = 'org.freedesktop.DBus.ObjectManager';
const PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const AGENT_PATH = '/org/bluez/agent';

class BlueZAgent extends EventEmitter {
  constructor() {
    super();
  }

  Release() {
    console.log('Agent released');
    this.emit('release');
  }

  RequestPinCode(device) {
    return new Promise((resolve, reject) => {
      this.emit('request-pin', { device, resolve, reject });
    });
  }

  DisplayPinCode(device, pincode) {
    this.emit('display-pin', { device, pincode });
  }

  RequestPasskey(device) {
    return new Promise((resolve, reject) => {
      this.emit('request-passkey', { device, resolve, reject });
    });
  }

  DisplayPasskey(device, passkey, entered) {
    this.emit('display-passkey', { device, passkey, entered });
  }

  RequestConfirmation(device, passkey) {
    return new Promise((resolve, reject) => {
      this.emit('request-confirmation', { device, passkey, resolve, reject });
    });
  }

  RequestAuthorization(device) {
    return new Promise((resolve, reject) => {
      this.emit('request-authorization', { device, resolve, reject });
    });
  }

  AuthorizeService(device, uuid) {
    return new Promise((resolve, reject) => {
      this.emit('authorize-service', { device, uuid, resolve, reject });
    });
  }

  Cancel() {
    this.emit('cancel');
  }
}

const agentInterface = `
<node name="/org/bluez/agent">
  <interface name="org.bluez.Agent1">
    <method name="Release"/>
    <method name="RequestPinCode">
      <arg type="o" name="device" direction="in"/>
      <arg type="s" name="pincode" direction="out"/>
    </method>
    <method name="DisplayPinCode">
      <arg type="o" name="device" direction="in"/>
      <arg type="s" name="pincode" direction="in"/>
    </method>
    <method name="RequestPasskey">
      <arg type="o" name="device" direction="in"/>
      <arg type="u" name="passkey" direction="out"/>
    </method>
    <method name="DisplayPasskey">
      <arg type="o" name="device" direction="in"/>
      <arg type="u" name="passkey" direction="in"/>
      <arg type="q" name="entered" direction="in"/>
    </method>
    <method name="RequestConfirmation">
      <arg type="o" name="device" direction="in"/>
      <arg type="u" name="passkey" direction="in"/>
    </method>
    <method name="RequestAuthorization">
      <arg type="o" name="device" direction="in"/>
    </method>
    <method name="AuthorizeService">
      <arg type="o" name="device" direction="in"/>
      <arg type="s" name="uuid" direction="in"/>
    </method>
    <method name="Cancel"/>
  </interface>
</node>
`;

class BlueZManager extends EventEmitter {
  constructor() {
    super();
    this.bus = null;
    this.adapter = null;
    this.adapterPath = null;
    this.devices = new Map();
    this.isScanning = false;
    this.objectManager = null;
    this.agent = null;
    this.agentManager = null;
  }

  async init() {
    try {
      this.bus = systemBus();
      this.objectManager = this.bus.getProxyObject(BLUEZ_SERVICE, '/');
      const manager = (await this.objectManager).getInterface(OBJECT_MANAGER_INTERFACE);
      
      manager.on('InterfacesAdded', this.handleInterfaceAdded.bind(this));
      manager.on('InterfacesRemoved', this.handleInterfaceRemoved.bind(this));
      
      await this.findAdapter();
      await this.registerAgent();
      await this.loadPairedDevices();
      return true;
    } catch (error) {
      console.error('BlueZ初始化失败:', error);
      throw error;
    }
  }

  async registerAgent() {
    try {
      this.agent = new BlueZAgent();
      
      this.agent.on('request-pin', (data) => {
        this.emit('request-pin', data);
      });
      
      this.agent.on('request-confirmation', (data) => {
        this.emit('request-confirmation', data);
      });
      
      this.agent.on('request-passkey', (data) => {
        this.emit('request-passkey', data);
      });
      
      this.agent.on('display-pin', (data) => {
        this.emit('display-pin', data);
      });
      
      this.agent.on('display-passkey', (data) => {
        this.emit('display-passkey', data);
      });
      
      this.bus.export(AGENT_PATH, this.agent, agentInterface);
      
      const agentManagerObj = await this.bus.getProxyObject(BLUEZ_SERVICE, '/org/bluez');
      this.agentManager = agentManagerObj.getInterface(AGENT_MANAGER_INTERFACE);
      
      await this.agentManager.RegisterAgent(AGENT_PATH, 'KeyboardDisplay');
      await this.agentManager.RequestDefaultAgent(AGENT_PATH);
      
      console.log('Bluetooth Agent已注册');
    } catch (error) {
      console.error('注册Agent失败:', error);
    }
  }

  async findAdapter() {
    const manager = (await this.objectManager).getInterface(OBJECT_MANAGER_INTERFACE);
    const objects = await manager.GetManagedObjects();
    
    for (const [path, interfaces] of Object.entries(objects)) {
      if (interfaces[ADAPTER_INTERFACE]) {
        this.adapterPath = path;
        const adapterObj = await this.bus.getProxyObject(BLUEZ_SERVICE, path);
        this.adapter = {
          path,
          adapterInterface: adapterObj.getInterface(ADAPTER_INTERFACE),
          propertiesInterface: adapterObj.getInterface(PROPERTIES_INTERFACE)
        };
        
        this.adapter.propertiesInterface.on('PropertiesChanged', (iface, changed, invalidated) => {
          if (iface === ADAPTER_INTERFACE) {
            if (changed.Discovering !== undefined) {
              this.isScanning = changed.Discovering.value;
              this.emit('scanning-changed', this.isScanning);
            }
          }
        });
        
        await this.loadExistingDevices(objects);
        
        const discovering = await this.adapter.propertiesInterface.Get(ADAPTER_INTERFACE, 'Discovering');
        this.isScanning = discovering.value;
        
        console.log('找到蓝牙适配器:', path);
        return;
      }
    }
    
    throw new Error('未找到蓝牙适配器');
  }

  async loadExistingDevices(objects) {
    for (const [path, interfaces] of Object.entries(objects)) {
      if (interfaces[DEVICE_INTERFACE]) {
        await this.addDevice(path, interfaces[DEVICE_INTERFACE], true);
      }
    }
  }

  async handleInterfaceAdded(path, interfaces) {
    if (interfaces[DEVICE_INTERFACE]) {
      console.log('发现新设备，调用Refresh更新名称:', path);
      await this.addDevice(path, interfaces[DEVICE_INTERFACE], false);
    }
  }

  async loadPairedDevices() {
    try {
      const manager = (await this.objectManager).getInterface(OBJECT_MANAGER_INTERFACE);
      const objects = await manager.GetManagedObjects();
      
      let pairedCount = 0;
      for (const [path, interfaces] of Object.entries(objects)) {
        if (interfaces[DEVICE_INTERFACE] && !this.devices.has(path)) {
          const props = interfaces[DEVICE_INTERFACE];
          const paired = props.Paired ? props.Paired.value : false;
          const connected = props.Connected ? props.Connected.value : false;
          
          if (paired || connected) {
            await this.addDevice(path, props, true);
            pairedCount++;
          }
        }
      }
      
      console.log(`已加载 ${pairedCount} 个已配对/已连接设备`);
      return pairedCount;
    } catch (error) {
      console.error('加载已配对设备失败:', error);
      return 0;
    }
  }

  handleInterfaceRemoved(path, interfaces) {
    if (interfaces.includes(DEVICE_INTERFACE)) {
      if (this.devices.has(path)) {
        const device = this.devices.get(path);
        this.devices.delete(path);
        this.emit('device-removed', { path, address: device.address });
      }
    }
  }

  async addDevice(path, properties, skipRefresh = false) {
    try {
      const deviceObj = await this.bus.getProxyObject(BLUEZ_SERVICE, path);
      const propsInterface = deviceObj.getInterface(PROPERTIES_INTERFACE);
      const device1Interface = deviceObj.getInterface(DEVICE_INTERFACE);
      
      const address = properties.Address ? properties.Address.value : '';
      const name = properties.Name ? properties.Name.value : '';
      const rssi = properties.RSSI ? properties.RSSI.value : null;
      
      const device = {
        path,
        address,
        name,
        rssi,
        propsInterface,
        device1Interface
      };
      
      propsInterface.on('PropertiesChanged', (iface, changed, invalidated) => {
        if (iface === DEVICE_INTERFACE) {
          let updated = false;
          if (changed.Name) {
            device.name = changed.Name.value;
            updated = true;
          }
          if (changed.RSSI) {
            device.rssi = changed.RSSI.value;
            updated = true;
          }
          if (updated) {
            this.emit('device-updated', this.formatDevice(device));
          }
        }
      });
      
      this.devices.set(path, device);
      this.emit('device-added', this.formatDevice(device));
      
      if (!skipRefresh) {
        this.refreshDevice(device).catch(err => {
          console.log('刷新设备属性失败:', device.address, err.message);
        });
      }
    } catch (error) {
      console.error('添加设备失败:', path, error);
    }
  }

  async refreshDevice(device) {
    try {
      if (!device.device1Interface) {
        return;
      }
      
      await device.device1Interface.Refresh();
      
      const [name, rssi] = await Promise.all([
        device.propsInterface.Get(DEVICE_INTERFACE, 'Name').catch(() => ({ value: device.name })),
        device.propsInterface.Get(DEVICE_INTERFACE, 'RSSI').catch(() => ({ value: null }))
      ]);
      
      const updatedName = name.value;
      const updatedRssi = rssi.value;
      
      if (updatedName !== device.name || updatedRssi !== device.rssi) {
        device.name = updatedName;
        device.rssi = updatedRssi;
        this.emit('device-updated', this.formatDevice(device));
        console.log('设备属性已更新:', device.address, device.name);
      }
    } catch (error) {
      console.log('刷新设备失败:', device.address, error.message);
    }
  }

  formatDevice(device) {
    return {
      path: device.path,
      address: device.address,
      name: device.name || '未知设备',
      rssi: device.rssi,
      paired: device.paired || false,
      connected: device.connected || false,
      trusted: device.trusted || false
    };
  }

  async getDeviceDetails(devicePath) {
    try {
      const device = this.devices.get(devicePath);
      if (!device) return null;

      const [paired, connected, trusted, alias] = await Promise.all([
        device.propsInterface.Get(DEVICE_INTERFACE, 'Paired').catch(() => ({ value: false })),
        device.propsInterface.Get(DEVICE_INTERFACE, 'Connected').catch(() => ({ value: false })),
        device.propsInterface.Get(DEVICE_INTERFACE, 'Trusted').catch(() => ({ value: false })),
        device.propsInterface.Get(DEVICE_INTERFACE, 'Alias').catch(() => ({ value: device.name }))
      ]);

      device.paired = paired.value;
      device.connected = connected.value;
      device.trusted = trusted.value;

      return this.formatDevice(device);
    } catch (error) {
      console.error('获取设备详情失败:', error);
      return null;
    }
  }

  async pairDevice(devicePath, pinCode = null) {
    try {
      const device = this.devices.get(devicePath);
      if (!device) {
        throw new Error('设备不存在');
      }

      console.log('开始配对设备:', device.address, device.name);

      await device.device1Interface.Pair();

      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.getDeviceDetails(devicePath);

      console.log('设备配对成功:', device.address);
      return { success: true, device: this.formatDevice(device) };
    } catch (error) {
      console.error('配对设备失败:', error);
      return { success: false, error: error.message };
    }
  }

  async cancelPairing(devicePath) {
    try {
      const device = this.devices.get(devicePath);
      if (!device) {
        throw new Error('设备不存在');
      }

      await device.device1Interface.CancelPairing();
      console.log('取消配对:', device.address);
      return { success: true };
    } catch (error) {
      console.error('取消配对失败:', error);
      return { success: false, error: error.message };
    }
  }

  async removeDevice(devicePath) {
    try {
      if (!this.adapter) {
        throw new Error('蓝牙适配器未初始化');
      }

      await this.adapter.adapterInterface.RemoveDevice(devicePath);
      this.devices.delete(devicePath);
      console.log('移除设备:', devicePath);
      return { success: true };
    } catch (error) {
      console.error('移除设备失败:', error);
      return { success: false, error: error.message };
    }
  }

  async connectDevice(devicePath) {
    try {
      const device = this.devices.get(devicePath);
      if (!device) {
        throw new Error('设备不存在');
      }

      await device.device1Interface.Connect();
      await this.getDeviceDetails(devicePath);
      console.log('设备已连接:', device.address);
      return { success: true, device: this.formatDevice(device) };
    } catch (error) {
      console.error('连接设备失败:', error);
      return { success: false, error: error.message };
    }
  }

  async disconnectDevice(devicePath) {
    try {
      const device = this.devices.get(devicePath);
      if (!device) {
        throw new Error('设备不存在');
      }

      await device.device1Interface.Disconnect();
      await this.getDeviceDetails(devicePath);
      console.log('设备已断开:', device.address);
      return { success: true, device: this.formatDevice(device) };
    } catch (error) {
      console.error('断开设备失败:', error);
      return { success: false, error: error.message };
    }
  }

  async providePinCode(devicePath, pinCode, confirm = true) {
    try {
      if (!this.agent) {
        throw new Error('Agent未初始化');
      }

      this.agent.emit('provide-pin', { device: devicePath, pinCode, confirm });
      return { success: true };
    } catch (error) {
      console.error('提供PIN码失败:', error);
      return { success: false, error: error.message };
    }
  }

  exportDevicesCSV() {
    const devices = this.getDevices();
    const headers = ['名称', 'MAC地址', '信号强度(dBm)', '已配对', '已连接', '设备路径'];
    
    const csvContent = [
      headers.join(','),
      ...devices.map(d => [
        `"${(d.name || '').replace(/"/g, '""')}"`,
        d.address,
        d.rssi ?? 'N/A',
        d.paired ? '是' : '否',
        d.connected ? '是' : '否',
        d.path
      ].join(','))
    ].join('\n');

    const bom = '\uFEFF';
    return bom + csvContent;
  }

  async startScan() {
    if (!this.adapter) {
      throw new Error('蓝牙适配器未初始化');
    }
    
    if (this.isScanning) {
      return;
    }
    
    try {
      await this.adapter.adapterInterface.SetDiscoveryFilter({
        'Transport': { type: 's', value: 'auto' }
      });
    } catch (e) {
      console.log('设置DiscoveryFilter失败，使用默认设置');
    }
    
    await this.adapter.adapterInterface.StartDiscovery();
    this.isScanning = true;
    this.emit('scanning-changed', true);
    console.log('开始蓝牙扫描');
  }

  async stopScan() {
    if (!this.adapter) {
      throw new Error('蓝牙适配器未初始化');
    }
    
    if (!this.isScanning) {
      return;
    }
    
    await this.adapter.adapterInterface.StopDiscovery();
    this.isScanning = false;
    this.emit('scanning-changed', false);
    console.log('停止蓝牙扫描');
  }

  getDevices() {
    return Array.from(this.devices.values()).map(d => this.formatDevice(d));
  }

  getAdapterInfo() {
    if (!this.adapter) return null;
    return {
      path: this.adapterPath,
      isScanning: this.isScanning
    };
  }

  async destroy() {
    if (this.isScanning) {
      try {
        await this.stopScan();
      } catch (e) {}
    }
    if (this.bus) {
      this.bus.disconnect();
    }
    this.devices.clear();
  }
}

module.exports = BlueZManager;
