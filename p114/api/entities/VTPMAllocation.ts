import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { VTPMEntity } from './VTPM';
import { VirtualMachineEntity } from './VirtualMachine';

@Entity('vtpm_allocation')
export class VTPMAllocationEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36 })
  vtpmId!: string;

  @Column('varchar', { length: 36 })
  vmId!: string;

  @Column('varchar', { length: 20, default: 'allocated' })
  status!: 'allocated' | 'released' | 'migrated';

  @Column('datetime', { nullable: true })
  allocatedAt?: Date;

  @Column('datetime', { nullable: true })
  releasedAt?: Date;

  @Column('text', { nullable: true })
  reason?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => VTPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vtpmId' })
  vtpm!: VTPMEntity;

  @ManyToOne(() => VirtualMachineEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vmId' })
  vm!: VirtualMachineEntity;
}
