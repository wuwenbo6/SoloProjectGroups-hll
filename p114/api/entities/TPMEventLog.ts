import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { VTPMEntity } from './VTPM';

@Entity('tpm_event_log')
export class TPMEventLogEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  vtpmId!: string;

  @Column({ type: 'int', nullable: true })
  pcrIndex?: number;

  @Column({ type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ type: 'text', nullable: true })
  digest?: string;

  @Column({ type: 'varchar', length: 10, default: 'SHA256' })
  digestAlg!: string;

  @Column({ type: 'text', nullable: true })
  eventData?: string;

  @Column({ type: 'text', nullable: true })
  eventName?: string;

  @Column({ type: 'int', default: 0 })
  sequence!: number;

  @Column({ type: 'text', nullable: true })
  details?: string;

  @CreateDateColumn()
  @Index()
  createdAt!: Date;

  @ManyToOne(() => VTPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vtpmId' })
  vtpm!: VTPMEntity;
}
