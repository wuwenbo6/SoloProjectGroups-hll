import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('operation_log')
export class OperationLogEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36, nullable: true })
  vtpmId?: string;

  @Column('varchar', { length: 50 })
  operation!: string;

  @Column('varchar', { length: 20 })
  status!: string;

  @Column('text', { nullable: true })
  details?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
