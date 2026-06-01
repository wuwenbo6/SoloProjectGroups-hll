import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { VTPMEntity } from './entities/VTPM';
import { VirtualMachineEntity } from './entities/VirtualMachine';
import { CertificateEntity } from './entities/Certificate';
import { OperationLogEntity } from './entities/OperationLog';
import { PCREntity } from './entities/PCR';
import { VTPMAllocationEntity } from './entities/VTPMAllocation';
import { TPMKeyEntity } from './entities/TPMKey';
import { AttestationQuoteEntity } from './entities/AttestationQuote';
import { TPMEventLogEntity } from './entities/TPMEventLog';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: path.join(__dirname, '../data/vtpm.db'),
  synchronize: true,
  logging: false,
  entities: [VTPMEntity, VirtualMachineEntity, CertificateEntity, OperationLogEntity, PCREntity, VTPMAllocationEntity, TPMKeyEntity, AttestationQuoteEntity, TPMEventLogEntity],
  migrations: [],
  subscribers: [],
});

export async function initDatabase() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}
