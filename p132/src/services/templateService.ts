
import { openDB, IDBPDatabase } from 'idb';
import { ConfigTemplate, EsiConfig, defaultEsiConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'EtherCATConfigDB';
const DB_VERSION = 1;
const STORE_NAME = 'templates';

let db: IDBPDatabase | null = null;

const initDB = async (): Promise<IDBPDatabase> => {
  if (db) return db;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    },
  });

  return db;
};

export const getAllTemplates = async (): Promise<ConfigTemplate[]> => {
  const database = await initDB();
  const templates = await database.getAll(STORE_NAME);
  return templates.map((t) => ({
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
    config: {
      ...t.config,
      createdAt: new Date(t.config.createdAt),
      updatedAt: new Date(t.config.updatedAt),
    },
  }));
};

export const getTemplateById = async (id: string): Promise<ConfigTemplate | undefined> => {
  const database = await initDB();
  const template = await database.get(STORE_NAME, id);
  if (!template) return undefined;
  return {
    ...template,
    createdAt: new Date(template.createdAt),
    updatedAt: new Date(template.updatedAt),
    config: {
      ...template.config,
      createdAt: new Date(template.config.createdAt),
      updatedAt: new Date(template.config.updatedAt),
    },
  };
};

export const saveTemplate = async (
  name: string,
  description: string,
  config: EsiConfig
): Promise<ConfigTemplate> => {
  const database = await initDB();
  const now = new Date();

  const template: ConfigTemplate = {
    id: uuidv4(),
    name,
    description,
    config: {
      ...config,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  await database.put(STORE_NAME, template);
  return template;
};

export const updateTemplate = async (
  id: string,
  name: string,
  description: string,
  config: EsiConfig
): Promise<ConfigTemplate | undefined> => {
  const database = await initDB();
  const existing = await database.get(STORE_NAME, id);
  
  if (!existing) return undefined;

  const now = new Date();
  const updated: ConfigTemplate = {
    ...existing,
    name,
    description,
    config: {
      ...config,
      updatedAt: now,
    },
    updatedAt: now,
  };

  await database.put(STORE_NAME, updated);
  return {
    ...updated,
    createdAt: new Date(updated.createdAt),
    updatedAt: now,
    config: {
      ...updated.config,
      createdAt: new Date(updated.config.createdAt),
      updatedAt: now,
    },
  };
};

export const deleteTemplate = async (id: string): Promise<boolean> => {
  const database = await initDB();
  await database.delete(STORE_NAME, id);
  return true;
};

export const exportTemplates = async (ids?: string[]): Promise<string> => {
  const database = await initDB();
  let templates: ConfigTemplate[];

  if (ids && ids.length > 0) {
    templates = await Promise.all(
      ids.map((id) => database.get(STORE_NAME, id))
    ).then((results) => results.filter((t): t is ConfigTemplate => t !== undefined));
  } else {
    templates = await database.getAll(STORE_NAME);
  }

  return JSON.stringify(templates, null, 2);
};

export const importTemplates = async (jsonData: string): Promise<ConfigTemplate[]> => {
  const database = await initDB();
  const templates: ConfigTemplate[] = JSON.parse(jsonData);
  const imported: ConfigTemplate[] = [];
  const now = new Date();

  for (const template of templates) {
    const newTemplate: ConfigTemplate = {
      ...template,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      config: {
        ...template.config,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      },
    };
    await database.put(STORE_NAME, newTemplate);
    imported.push(newTemplate);
  }

  return imported;
};

export const downloadTemplateFile = (templates: ConfigTemplate[], filename: string): void => {
  const json = JSON.stringify(templates, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const createSampleTemplates = async (): Promise<void> => {
  const database = await initDB();
  const count = await database.count(STORE_NAME);
  
  if (count > 0) return;

  const now = new Date();
  
  const sample1: ConfigTemplate = {
    id: uuidv4(),
    name: '数字IO模块',
    description: '8路数字输入和8路数字输出的基础IO模块配置',
    config: {
      ...defaultEsiConfig,
      id: uuidv4(),
      name: 'Digital IO Module',
      slaveInfo: {
        vendorId: '0x00000001',
        productCode: '0x00000001',
        revisionNo: '0x00010000',
        slaveName: 'Digital IO Slave',
        vendorName: 'Sample Vendor',
        productName: 'Digital IO Module',
      },
      txPdO: [
        { id: uuidv4(), index: 0x6000, subIndex: 0x01, name: 'Digital Input 1', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x02, name: 'Digital Input 2', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x03, name: 'Digital Input 3', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x04, name: 'Digital Input 4', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x05, name: 'Digital Input 5', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x06, name: 'Digital Input 6', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x07, name: 'Digital Input 7', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6000, subIndex: 0x08, name: 'Digital Input 8', dataType: 'BOOL' as any, bitLength: 1 },
      ],
      rxPdO: [
        { id: uuidv4(), index: 0x6010, subIndex: 0x01, name: 'Digital Output 1', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x02, name: 'Digital Output 2', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x03, name: 'Digital Output 3', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x04, name: 'Digital Output 4', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x05, name: 'Digital Output 5', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x06, name: 'Digital Output 6', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x07, name: 'Digital Output 7', dataType: 'BOOL' as any, bitLength: 1 },
        { id: uuidv4(), index: 0x6010, subIndex: 0x08, name: 'Digital Output 8', dataType: 'BOOL' as any, bitLength: 1 },
      ],
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  const sample2: ConfigTemplate = {
    id: uuidv4(),
    name: 'CiA402电机驱动',
    description: '基于CiA402协议的伺服电机驱动器配置模板',
    config: {
      ...defaultEsiConfig,
      id: uuidv4(),
      name: 'CiA402 Drive',
      slaveInfo: {
        vendorId: '0x00000002',
        productCode: '0x00000002',
        revisionNo: '0x00010000',
        slaveName: 'CiA402 Servo Drive',
        vendorName: 'Sample Vendor',
        productName: 'Servo Drive',
      },
      txPdO: [
        { id: uuidv4(), index: 0x6041, subIndex: 0x00, name: 'Status Word', dataType: 'UINT16' as any, bitLength: 16 },
        { id: uuidv4(), index: 0x6061, subIndex: 0x00, name: 'Modes of Operation Display', dataType: 'INT8' as any, bitLength: 8 },
        { id: uuidv4(), index: 0x6064, subIndex: 0x00, name: 'Position Actual Value', dataType: 'INT32' as any, bitLength: 32 },
        { id: uuidv4(), index: 0x606C, subIndex: 0x00, name: 'Velocity Actual Value', dataType: 'INT32' as any, bitLength: 32 },
        { id: uuidv4(), index: 0x6077, subIndex: 0x00, name: 'Torque Actual Value', dataType: 'INT16' as any, bitLength: 16 },
      ],
      rxPdO: [
        { id: uuidv4(), index: 0x6040, subIndex: 0x00, name: 'Control Word', dataType: 'UINT16' as any, bitLength: 16 },
        { id: uuidv4(), index: 0x6060, subIndex: 0x00, name: 'Modes of Operation', dataType: 'INT8' as any, bitLength: 8 },
        { id: uuidv4(), index: 0x607A, subIndex: 0x00, name: 'Target Position', dataType: 'INT32' as any, bitLength: 32 },
        { id: uuidv4(), index: 0x60FF, subIndex: 0x00, name: 'Target Velocity', dataType: 'INT32' as any, bitLength: 32 },
        { id: uuidv4(), index: 0x6071, subIndex: 0x00, name: 'Target Torque', dataType: 'INT16' as any, bitLength: 16 },
      ],
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  await database.put(STORE_NAME, sample1);
  await database.put(STORE_NAME, sample2);
};

export const closeDB = (): void => {
  if (db) {
    db.close();
    db = null;
  }
};
