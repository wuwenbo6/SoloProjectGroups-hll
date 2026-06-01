import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { VTPMEntity } from './VTPM';

@Entity('tpm_key')
@Unique(['vtpmId', 'type'])
export class TPMKeyEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36 })
  vtpmId!: string;

  @Column('varchar', { length: 10 })
  type!: 'EK' | 'AK' | 'SRK' | 'Derived';

  @Column('text')
  publicKeyPem!: string;

  @Column('text', { nullable: true })
  privateKeyPem?: string;

  @Column('varchar', { length: 50, default: 'RSA2048' })
  algorithm!: string;

  @Column('text', { nullable: true })
  keyHandle?: string;

  @Column('boolean', { default: false })
  isPersistent!: boolean;

  @Column('text', { nullable: true })
  attributes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column('datetime', { nullable: true })
  activatedAt?: Date;

  @ManyToOne(() => VTPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vtpmId' })
  vtpm!: VTPMEntity;
}
