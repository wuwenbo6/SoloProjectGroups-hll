import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Unique } from 'typeorm';
import type { VTPMStatus } from '../../shared/types';
import { PCREntity } from './PCR';
import { VTPMAllocationEntity } from './VTPMAllocation';

@Entity('vtpm')
@Unique(['vmId'])
export class VTPMEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 100 })
  name!: string;

  @Column('varchar', { length: 20, default: 'initializing' })
  status!: VTPMStatus;

  @Column('varchar', { length: 255, nullable: true })
  socketPath?: string;

  @Column('varchar', { length: 255, nullable: true })
  statePath?: string;

  @Column('text', { nullable: true })
  ekCert?: string;

  @Column('text', { nullable: true })
  akCert?: string;

  @Column('varchar', { length: 36, nullable: true, unique: true })
  vmId?: string;

  @Column('text', { nullable: true })
  migrationData?: string;

  @Column('datetime', { nullable: true })
  lastMigratedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => PCREntity, (pcr) => pcr.vtpm, { cascade: true })
  pcrs!: PCREntity[];

  @OneToMany(() => VTPMAllocationEntity, (allocation) => allocation.vtpm, { cascade: true })
  allocations!: VTPMAllocationEntity[];
}
