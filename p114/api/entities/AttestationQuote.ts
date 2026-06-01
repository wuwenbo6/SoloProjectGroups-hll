import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VTPMEntity } from './VTPM';

@Entity('attestation_quote')
export class AttestationQuoteEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36 })
  vtpmId!: string;

  @Column('text')
  quote!: string;

  @Column('text')
  signature!: string;

  @Column('text', { nullable: true })
  nonce?: string;

  @Column('text')
  pcrSelection!: string;

  @Column('text', { nullable: true })
  pcrValues?: string;

  @Column('text', { nullable: true })
  signerCertPem?: string;

  @Column('varchar', { length: 50, default: 'TPM2_ALG_SHA256' })
  hashAlg!: string;

  @Column('varchar', { length: 50, default: 'TPM2_ALG_RSASSA' })
  sigAlg!: string;

  @Column('boolean', { default: false })
  verified!: boolean;

  @Column('text', { nullable: true })
  verificationResult?: string;

  @Column('text', { nullable: true })
  signerKeyId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => VTPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vtpmId' })
  vtpm!: VTPMEntity;
}
