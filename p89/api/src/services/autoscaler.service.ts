import { proxmoxService } from './proxmox.service.js';
import { logService } from './log.service.js';
import type { VirtualMachine } from '../../../shared/types.js';

export interface AutoScalerConfig {
  enabled: boolean;
  minVMs: number;
  maxVMs: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
  templateVMID: number;
  templateNode: string;
  targetNode: string;
  checkInterval: number;
  cpuAverageWindow: number;
}

interface ScalingEvent {
  timestamp: number;
  action: 'scale_up' | 'scale_down';
  vmid?: number;
  reason: string;
  avgCPU: number;
}

class AutoScalerService {
  private config: AutoScalerConfig = {
    enabled: false,
    minVMs: 2,
    maxVMs: 10,
    scaleUpThreshold: 0.7,
    scaleDownThreshold: 0.3,
    scaleUpCooldown: 300000,
    scaleDownCooldown: 600000,
    templateVMID: 100,
    templateNode: 'pve-node1',
    targetNode: 'pve-node1',
    checkInterval: 60000,
    cpuAverageWindow: 5,
  };

  private lastScaleUp: number = 0;
  private lastScaleDown: number = 0;
  private cpuHistory: number[] = [];
  private history: ScalingEvent[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private nextVMID: number = 200;

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const saved = process.env.AUTOSCALER_CONFIG;
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load autoscaler config:', error);
    }
  }

  getConfig(): AutoScalerConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<AutoScalerConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enabled && !this.intervalId) {
      this.start();
    } else if (!this.config.enabled && this.intervalId) {
      this.stop();
    }
  }

  start() {
    if (this.intervalId) return;
    
    console.log('AutoScaler started');
    this.intervalId = setInterval(() => this.checkAndScale(), this.config.checkInterval);
    this.config.enabled = true;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('AutoScaler stopped');
    }
    this.config.enabled = false;
  }

  getHistory(): ScalingEvent[] {
    return [...this.history];
  }

  private async checkAndScale() {
    if (!this.config.enabled) return;

    try {
      const vms = await this.getScalableVMs();
      const avgCPU = await this.calculateAverageCPU(vms);
      
      console.log(`AutoScaler check - VMs: ${vms.length}, Avg CPU: ${(avgCPU * 100).toFixed(1)}%`);

      this.cpuHistory.push(avgCPU);
      if (this.cpuHistory.length > this.config.cpuAverageWindow) {
        this.cpuHistory.shift();
      }

      const smoothedAvgCPU = this.cpuHistory.reduce((a, b) => a + b, 0) / this.cpuHistory.length;

      const now = Date.now();

      if (smoothedAvgCPU > this.config.scaleUpThreshold) {
        if (now - this.lastScaleUp > this.config.scaleUpCooldown) {
          if (vms.length < this.config.maxVMs) {
            await this.scaleUp(vms.length, smoothedAvgCPU);
          } else {
            console.log('Max VMs reached, cannot scale up further');
          }
        }
      } else if (smoothedAvgCPU < this.config.scaleDownThreshold) {
        if (now - this.lastScaleDown > this.config.scaleDownCooldown) {
          if (vms.length > this.config.minVMs) {
            await this.scaleDown(vms, smoothedAvgCPU);
          }
        }
      }
    } catch (error) {
      console.error('AutoScaler error:', error);
    }
  }

  private async getScalableVMs(): Promise<VirtualMachine[]> {
    const vms = await proxmoxService.getVMs();
    return vms.filter(vm => 
      vm.status === 'running' && 
      !vm.template &&
      vm.name.startsWith('worker-')
    );
  }

  private async calculateAverageCPU(vms: VirtualMachine[]): Promise<number> {
    if (vms.length === 0) return 0;
    const totalCPU = vms.reduce((sum, vm) => sum + vm.cpu, 0);
    return totalCPU / vms.length;
  }

  private async scaleUp(currentVMs: number, avgCPU: number) {
    try {
      const newVMID = this.nextVMID++;
      const newVMName = `worker-${Date.now()}`;

      console.log(`Scaling up: creating VM ${newVMID} (${newVMName})`);

      const result = await proxmoxService.cloneVM(
        this.config.templateNode,
        this.config.templateVMID,
        newVMID,
        {
          name: newVMName,
          target: this.config.targetNode,
          full: true,
        }
      );

      if (result) {
        this.lastScaleUp = Date.now();
        this.history.unshift({
          timestamp: Date.now(),
          action: 'scale_up',
          vmid: newVMID,
          reason: `High CPU usage (${(avgCPU * 100).toFixed(1)}%)`,
          avgCPU,
        });

        await logService.log(
          'autoscaler',
          'scale_up',
          'vm',
          newVMID.toString(),
          'success',
          `Auto-scaled up to ${currentVMs + 1} VMs due to high CPU (${(avgCPU * 100).toFixed(1)}%)`
        );

        setTimeout(async () => {
          try {
            await proxmoxService.startVM(this.config.targetNode, newVMID);
          } catch (error) {
            console.error('Failed to start scaled VM:', error);
          }
        }, 10000);
      }
    } catch (error: any) {
      console.error('Scale up failed:', error);
      await logService.log(
        'autoscaler',
        'scale_up',
        'vm',
        'auto',
        'failed',
        `Scale up failed: ${error.message}`
      );
    }
  }

  private async scaleDown(vms: VirtualMachine[], avgCPU: number) {
    try {
      const sortedVMs = [...vms].sort((a, b) => a.cpu - b.cpu);
      const vmToRemove = sortedVMs[0];

      console.log(`Scaling down: removing VM ${vmToRemove.vmid} (${vmToRemove.name})`);

      await proxmoxService.stopVM(vmToRemove.node, vmToRemove.vmid);

      this.lastScaleDown = Date.now();
      this.history.unshift({
        timestamp: Date.now(),
        action: 'scale_down',
        vmid: vmToRemove.vmid,
        reason: `Low CPU usage (${(avgCPU * 100).toFixed(1)}%)`,
        avgCPU,
      });

      await logService.log(
        'autoscaler',
        'scale_down',
        'vm',
        vmToRemove.vmid.toString(),
        'success',
        `Auto-scaled down to ${vms.length - 1} VMs due to low CPU (${(avgCPU * 100).toFixed(1)}%)`
      );
    } catch (error: any) {
      console.error('Scale down failed:', error);
      await logService.log(
        'autoscaler',
        'scale_down',
        'vm',
        'auto',
        'failed',
        `Scale down failed: ${error.message}`
      );
    }
  }
}

export const autoScalerService = new AutoScalerService();
