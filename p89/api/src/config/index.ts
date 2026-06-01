import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  proxmox: {
    host: process.env.PROXMOX_HOST || 'https://localhost:8006',
    user: process.env.PROXMOX_USER || 'root@pam',
    password: process.env.PROXMOX_PASSWORD || '',
    tokenId: process.env.PROXMOX_TOKEN_ID || '',
    tokenSecret: process.env.PROXMOX_TOKEN_SECRET || '',
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-here-change-in-production',
    expiresIn: '24h',
  },
  database: {
    path: process.env.DB_PATH || './data/pvemanager.db',
  },
  demoMode: process.env.DEMO_MODE === 'true',
};
