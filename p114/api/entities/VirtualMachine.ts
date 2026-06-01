import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('virtual_machine')
export class VirtualMachineEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 100 })
  name!: string;

  @Column('varchar', { length: 36, nullable: true, unique: true })
  libvirtUuid?: string;

  @Column('varchar', { length: 20, default: 'stopped' })
  state!: 'running' | 'stopped' | 'paused';

  @Column('varchar', { length: 36, nullable: true })
  vtpmId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
