import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { VTPMEntity } from './VTPM';

@Entity('pcr_register')
@Unique(['vtpmId', 'index'])
export class PCREntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36 })
  vtpmId!: string;

  @Column('int')
  index!: number;

  @Column('text')
  value!: string;

  @Column('varchar', { length: 10, default: 'SHA256' })
  algorithm!: 'SHA1' | 'SHA256';

  @Column('text', { nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column('datetime', { nullable: true })
  lastUpdatedAt?: Date;

  @ManyToOne(() => VTPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vtpmId' })
  vtpm!: VTPMEntity;
}
