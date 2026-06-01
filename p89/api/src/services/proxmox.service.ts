import axios from 'axios';
import https from 'https';
import { config } from '../config/index.js';
import type {
  VirtualMachine,
  ClusterNode,
  Snapshot,
  CreateVMParams,
  MigrateParams,
  NodeStatus,
} from '../../../shared/types.js';

class ProxMoxService {
  private ticket: string | null = null;
  private csrfToken: string | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.proxmox.host;
  }

  private get axiosInstance() {
    return axios.create({
      baseURL: this.baseUrl,
      httpsAgent: new https.Agent({
        rejectUnauthorized: config.proxmox.rejectUnauthorized,
      }),
      headers: {
        ...(this.ticket && { Cookie: `PVEAuthCookie=${this.ticket}` }),
        ...(this.csrfToken && { CSRFPreventionToken: this.csrfToken }),
      },
    });
  }

  async login(): Promise<boolean> {
    try {
      if (config.proxmox.tokenId && config.proxmox.tokenSecret) {
        return true;
      }

      const response = await axios.post(
        `${this.baseUrl}/api2/json/access/ticket`,
        new URLSearchParams({
          username: config.proxmox.user,
          password: config.proxmox.password,
        }),
        {
          httpsAgent: new https.Agent({
            rejectUnauthorized: config.proxmox.rejectUnauthorized,
          }),
        }
      );

      if (response.data.data) {
        this.ticket = response.data.data.ticket;
        this.csrfToken = response.data.data.CSRFPreventionToken;
        return true;
      }
      return false;
    } catch (error) {
      console.error('ProxMox login failed:', error);
      return false;
    }
  }

  async getNodes(): Promise<ClusterNode[]> {
    if (config.demoMode) {
      return this.getMockNodes();
    }

    try {
      const response = await this.axiosInstance.get('/api2/json/nodes');
      return response.data.data;
    } catch (error) {
      console.error('Failed to get nodes:', error);
      return this.getMockNodes();
    }
  }

  async getNodeStatus(node: string): Promise<NodeStatus> {
    if (config.demoMode) {
      return this.getMockNodeStatus(node);
    }

    try {
      const response = await this.axiosInstance.get(`/api2/json/nodes/${node}/status`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to get node status:', error);
      return this.getMockNodeStatus(node);
    }
  }

  async getVMs(): Promise<VirtualMachine[]> {
    if (config.demoMode) {
      return this.getMockVMs();
    }

    try {
      const allVMs: VirtualMachine[] = [];
      const nodes = await this.getNodes();

      for (const node of nodes) {
        if (node.status === 'online') {
          const response = await this.axiosInstance.get(
            `/api2/json/nodes/${node.node}/qemu`
          );
          const vms = response.data.data.map((vm: any) => ({
            ...vm,
            node: node.node,
          }));
          allVMs.push(...vms);
        }
      }

      return allVMs;
    } catch (error) {
      console.error('Failed to get VMs:', error);
      return this.getMockVMs();
    }
  }

  async getVM(node: string, vmid: number): Promise<VirtualMachine | null> {
    if (config.demoMode) {
      const vms = this.getMockVMs();
      return vms.find(vm => vm.vmid === vmid) || null;
    }

    try {
      const response = await this.axiosInstance.get(
        `/api2/json/nodes/${node}/qemu/${vmid}/status/current`
      );
      return { ...response.data.data, node };
    } catch (error) {
      console.error('Failed to get VM:', error);
      return null;
    }
  }

  async createVM(params: CreateVMParams): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${params.node}/qemu`,
        {
          vmid: params.vmid,
          name: params.name,
          cores: params.cores,
          memory: params.memory,
          ostype: params.ostype,
          net0: params.net0 || 'virtio,bridge=vmbr0',
          scsi0: params.scsi0 || `local-lvm:${params.disk}`,
        }
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to create VM:', error);
      throw error;
    }
  }

  async cloneVM(
    node: string,
    vmid: number,
    newid: number,
    options: {
      name?: string;
      target?: string;
      full?: boolean;
      storage?: string;
      format?: string;
    } = {}
  ): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      console.log(`Cloning VM ${vmid} to ${newid} on ${node}...`);
      
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/clone`,
        {
          newid,
          name: options.name,
          target: options.target || node,
          full: options.full !== false ? 1 : 0,
          storage: options.storage,
          format: options.format || 'qcow2',
        }
      );

      if (response.status === 200) {
        console.log(`Clone task started for VM ${vmid} -> ${newid}`);
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to clone VM:', error.response?.data || error.message);
      throw error;
    }
  }

  async convertToTemplate(node: string, vmid: number): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      console.log(`Converting VM ${vmid} to template on ${node}...`);
      
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/template`
      );

      return response.status === 200;
    } catch (error: any) {
      console.error('Failed to convert to template:', error.response?.data || error.message);
      throw error;
    }
  }

  async getTemplates(): Promise<VirtualMachine[]> {
    const vms = await this.getVMs();
    return vms.filter(vm => vm.template);
  }

  async startVM(node: string, vmid: number): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/status/start`
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to start VM:', error);
      throw error;
    }
  }

  async stopVM(node: string, vmid: number): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/status/stop`
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to stop VM:', error);
      throw error;
    }
  }

  async restartVM(node: string, vmid: number): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/status/restart`
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to restart VM:', error);
      throw error;
    }
  }

  async getSnapshots(node: string, vmid: number): Promise<Snapshot[]> {
    if (config.demoMode) {
      return this.getMockSnapshots();
    }

    try {
      const response = await this.axiosInstance.get(
        `/api2/json/nodes/${node}/qemu/${vmid}/snapshot`
      );
      return response.data.data.filter((s: Snapshot) => s.name !== 'current');
    } catch (error) {
      console.error('Failed to get snapshots:', error);
      return this.getMockSnapshots();
    }
  }

  async createSnapshot(
    node: string,
    vmid: number,
    snapname: string,
    description: string = ''
  ): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/snapshot`,
        {
          snapname,
          description,
          vmstate: 1,
        }
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      throw error;
    }
  }

  async getVMConfig(node: string, vmid: number): Promise<any> {
    if (config.demoMode) {
      return {
        net0: 'virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,firewall=1',
        cores: 2,
        memory: 4096,
      };
    }

    try {
      const response = await this.axiosInstance.get(
        `/api2/json/nodes/${node}/qemu/${vmid}/config`
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to get VM config:', error);
      return null;
    }
  }

  async setVMConfig(node: string, vmid: number, config: any): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/config`,
        config
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to set VM config:', error);
      throw error;
    }
  }

  async rollbackSnapshot(
    node: string,
    vmid: number,
    snapname: string,
    preserveNetwork: boolean = true
  ): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    let savedNetworkConfig: any = null;

    try {
      if (preserveNetwork) {
        console.log(`Saving network configuration for VM ${vmid} before rollback...`);
        const currentConfig = await this.getVMConfig(node, vmid);
        if (currentConfig) {
          savedNetworkConfig = {};
          Object.keys(currentConfig).forEach(key => {
            if (key.startsWith('net') || key.startsWith('ipconfig')) {
              savedNetworkConfig[key] = currentConfig[key];
            }
          });
          console.log('Saved network config:', savedNetworkConfig);
        }
      }

      console.log(`Rolling back VM ${vmid} to snapshot ${snapname}...`);
      const response = await this.axiosInstance.post(
        `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${snapname}/rollback`
      );

      if (response.status !== 200) {
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      if (preserveNetwork && Object.keys(savedNetworkConfig).length > 0) {
        console.log(`Restoring network configuration for VM ${vmid}...`);
        try {
          await this.setVMConfig(node, vmid, savedNetworkConfig);
          console.log('Network configuration restored successfully');
        } catch (configError) {
          console.warn('Could not restore network config automatically, VM may need restart:', configError);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to rollback snapshot:', error);
      throw error;
    }
  }

  async deleteSnapshot(
    node: string,
    vmid: number,
    snapname: string
  ): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    try {
      const response = await this.axiosInstance.delete(
        `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${snapname}`
      );
      return response.status === 200;
    } catch (error) {
      console.error('Failed to delete snapshot:', error);
      throw error;
    }
  }

  async migrateVM(
    node: string,
    vmid: number,
    params: MigrateParams
  ): Promise<boolean> {
    if (config.demoMode) {
      return true;
    }

    const maxRetries = params.maxRetries || 3;
    const retryDelay = params.retryDelay || 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Migration attempt ${attempt}/${maxRetries} for VM ${vmid}`);
        
        const response = await this.axiosInstance.post(
          `/api2/json/nodes/${node}/qemu/${vmid}/migrate`,
          {
            target: params.target,
            online: params.online ? 1 : 0,
            withlocaldisks: params.withlocaldisks ? 1 : 0,
            migration_network: params.migration_network,
            bwlimit: params.bwlimit,
            force: attempt > 1 ? 1 : 0,
          }
        );

        if (response.status === 200) {
          console.log(`Migration successful for VM ${vmid} on attempt ${attempt}`);
          return true;
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error(`Migration attempt ${attempt} failed for VM ${vmid}:`, errorMsg);

        if (attempt === maxRetries) {
          throw new Error(`Migration failed after ${maxRetries} attempts: ${errorMsg}`);
        }

        const isNetworkError = errorMsg.includes('bandwidth') || 
                              errorMsg.includes('timeout') ||
                              errorMsg.includes('connection') ||
                              errorMsg.includes('network');
                              
        if (!isNetworkError && !errorMsg.includes('lock')) {
          throw error;
        }

        console.log(`Waiting ${retryDelay / 1000}s before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return false;
  }

  private getMockNodes(): ClusterNode[] {
    return [
      {
        node: 'pve-node1',
        status: 'online',
        cpu: 0.23,
        mem: 16 * 1024 * 1024 * 1024,
        maxcpu: 8,
        maxmem: 32 * 1024 * 1024 * 1024,
        disk: 100 * 1024 * 1024 * 1024,
        maxdisk: 500 * 1024 * 1024 * 1024,
        uptime: 86400 * 15,
        level: 'pve',
        id: 'node1',
      },
      {
        node: 'pve-node2',
        status: 'online',
        cpu: 0.45,
        mem: 20 * 1024 * 1024 * 1024,
        maxcpu: 16,
        maxmem: 64 * 1024 * 1024 * 1024,
        disk: 150 * 1024 * 1024 * 1024,
        maxdisk: 1000 * 1024 * 1024 * 1024,
        uptime: 86400 * 7,
        level: 'pve',
        id: 'node2',
      },
      {
        node: 'pve-node3',
        status: 'offline',
        cpu: 0,
        mem: 0,
        maxcpu: 8,
        maxmem: 32 * 1024 * 1024 * 1024,
        disk: 0,
        maxdisk: 500 * 1024 * 1024 * 1024,
        uptime: 0,
        level: 'pve',
        id: 'node3',
      },
    ];
  }

  private getMockNodeStatus(node: string): NodeStatus {
    return {
      node,
      cpu: 0.25 + Math.random() * 0.3,
      memory: {
        used: 16 * 1024 * 1024 * 1024,
        total: 32 * 1024 * 1024 * 1024,
        free: 16 * 1024 * 1024 * 1024,
      },
      rootfs: {
        used: 100 * 1024 * 1024 * 1024,
        total: 500 * 1024 * 1024 * 1024,
        avail: 400 * 1024 * 1024 * 1024,
      },
      swap: {
        used: 1 * 1024 * 1024 * 1024,
        total: 8 * 1024 * 1024 * 1024,
        free: 7 * 1024 * 1024 * 1024,
      },
      loadavg: [1.2, 1.5, 1.8],
      uptime: 86400 * 15,
      kversion: '5.15.0-1-pve',
      pveversion: 'pve-manager/7.4-3/9002ab8a',
    };
  }

  private getMockVMs(): VirtualMachine[] {
    return [
      {
        vmid: 100,
        name: 'web-server-01',
        node: 'pve-node1',
        status: 'running',
        cpu: 0.12,
        maxmem: 4 * 1024 * 1024 * 1024,
        memory: 2 * 1024 * 1024 * 1024,
        maxdisk: 50 * 1024 * 1024 * 1024,
        disk: 25 * 1024 * 1024 * 1024,
        netin: 1024 * 1024 * 100,
        netout: 1024 * 1024 * 50,
        uptime: 86400 * 5,
      },
      {
        vmid: 101,
        name: 'database-01',
        node: 'pve-node1',
        status: 'running',
        cpu: 0.35,
        maxmem: 8 * 1024 * 1024 * 1024,
        memory: 6 * 1024 * 1024 * 1024,
        maxdisk: 100 * 1024 * 1024 * 1024,
        disk: 45 * 1024 * 1024 * 1024,
        netin: 1024 * 1024 * 200,
        netout: 1024 * 1024 * 150,
        uptime: 86400 * 10,
      },
      {
        vmid: 102,
        name: 'dev-server',
        node: 'pve-node2',
        status: 'stopped',
        cpu: 0,
        maxmem: 4 * 1024 * 1024 * 1024,
        memory: 0,
        maxdisk: 80 * 1024 * 1024 * 1024,
        disk: 30 * 1024 * 1024 * 1024,
        netin: 0,
        netout: 0,
        uptime: 0,
      },
      {
        vmid: 103,
        name: 'monitoring',
        node: 'pve-node2',
        status: 'running',
        cpu: 0.08,
        maxmem: 2 * 1024 * 1024 * 1024,
        memory: 1 * 1024 * 1024 * 1024,
        maxdisk: 40 * 1024 * 1024 * 1024,
        disk: 15 * 1024 * 1024 * 1024,
        netin: 1024 * 1024 * 50,
        netout: 1024 * 1024 * 30,
        uptime: 86400 * 3,
      },
      {
        vmid: 104,
        name: 'backup-server',
        node: 'pve-node1',
        status: 'paused',
        cpu: 0,
        maxmem: 4 * 1024 * 1024 * 1024,
        memory: 2 * 1024 * 1024 * 1024,
        maxdisk: 200 * 1024 * 1024 * 1024,
        disk: 120 * 1024 * 1024 * 1024,
        netin: 0,
        netout: 0,
        uptime: 0,
      },
    ];
  }

  private getMockSnapshots(): Snapshot[] {
    return [
      {
        name: 'snap1',
        description: 'Before upgrade',
        time: Date.now() - 86400000 * 3,
        snaptime: Date.now() - 86400000 * 3,
        vmstate: true,
        parent: '',
      },
      {
        name: 'snap2',
        description: 'After config change',
        time: Date.now() - 86400000,
        snaptime: Date.now() - 86400000,
        vmstate: true,
        parent: 'snap1',
      },
    ];
  }
}

export const proxmoxService = new ProxMoxService();
