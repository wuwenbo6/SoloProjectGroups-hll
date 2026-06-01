
import JSZip from 'jszip';
import { EsiConfig, MultiSlaveProject } from '../types';
import { generateEsiXml } from '../utils/esiGenerator';

export const generateSlaveEsiXml = (config: EsiConfig): string => {
  return generateEsiXml(config);
};

export const exportSlaveAsZip = async (config: EsiConfig): Promise<void> => {
  const zip = new JSZip();
  
  const xml = generateEsiXml(config);
  const fileName = `${config.slaveInfo.slaveName.replace(/\s+/g, '_')}.xml`;
  zip.file(fileName, xml);
  
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.slaveInfo.slaveName.replace(/\s+/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportMultiSlaveProject = async (
  project: MultiSlaveProject
): Promise<void> => {
  const zip = new JSZip();
  
  project.slaves.forEach((slave, index) => {
    const xml = generateEsiXml(slave);
    const slaveName = slave.slaveInfo.slaveName.replace(/\s+/g, '_');
    const fileName = `${slaveName}_${index + 1}.xml`;
    zip.file(fileName, xml);
  });
  
  const projectInfo = {
    name: project.name,
    description: project.description,
    slaveCount: project.slaves.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    slaves: project.slaves.map((slave, index) => ({
      index: index + 1,
      name: slave.name,
      slaveName: slave.slaveInfo.slaveName,
      vendorId: slave.slaveInfo.vendorId,
      productCode: slave.slaveInfo.productCode,
      txPdoCount: slave.txPdO.length,
      rxPdoCount: slave.rxPdO.length,
      coeParameterCount: slave.coeParameters.length,
    })),
  };
  
  zip.file('project.json', JSON.stringify(projectInfo, null, 2));
  
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const mergeSlaveConfigs = (
  baseConfig: EsiConfig,
  ...configs: EsiConfig[]
): EsiConfig => {
  const merged: EsiConfig = {
    ...baseConfig,
    txPdO: [...baseConfig.txPdO],
    rxPdO: [...baseConfig.rxPdO],
    coeParameters: [...baseConfig.coeParameters],
  };
  
  configs.forEach((config) => {
    config.txPdO.forEach((entry) => {
      const exists = merged.txPdO.some(
        (e) => e.index === entry.index && e.subIndex === entry.subIndex
      );
      if (!exists) {
        merged.txPdO.push({ ...entry });
      }
    });
    
    config.rxPdO.forEach((entry) => {
      const exists = merged.rxPdO.some(
        (e) => e.index === entry.index && e.subIndex === entry.subIndex
      );
      if (!exists) {
        merged.rxPdO.push({ ...entry });
      }
    });
    
    config.coeParameters.forEach((param) => {
      const exists = merged.coeParameters.some(
        (p) => p.index === param.index && p.subIndex === param.subIndex
      );
      if (!exists) {
        merged.coeParameters.push({ ...param });
      }
    });
  });
  
  return merged;
};

export const generateMultiSlaveManifest = (
  project: MultiSlaveProject
): string => {
  return JSON.stringify({
    name: project.name,
    description: project.description,
    slaveCount: project.slaves.length,
    slaves: project.slaves.map((slave, index) => ({
      position: index + 1,
      alias: slave.name,
      vendorId: slave.slaveInfo.vendorId,
      productCode: slave.slaveInfo.productCode,
      revisionNo: slave.slaveInfo.revisionNo,
      esiFile: `${slave.slaveInfo.slaveName.replace(/\s+/g, '_')}_${index + 1}.xml`,
    })),
  }, null, 2);
};
