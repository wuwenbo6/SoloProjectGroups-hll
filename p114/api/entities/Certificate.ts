import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('certificate')
export class CertificateEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36 })
  vtpmId!: string;

  @Column('varchar', { length: 10 })
  type!: 'EK' | 'AK' | 'platform';

  @Column('varchar', { length: 255, nullable: true })
  subject?: string;

  @Column('varchar', { length: 255, nullable: true })
  issuer?: string;

  @Column('datetime', { nullable: true })
  validFrom?: Date;

  @Column('datetime', { nullable: true })
  validTo?: Date;

  @Column('text')
  pem!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
