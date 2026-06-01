const fs = require('fs');

const pkg = {
  name: 'p200',
  private: true,
  version: '0.1.0',
  type: 'module',
  scripts: {
    dev: 'concurrently "npm run dev:client" "npm run dev:server"',
    'dev:client': 'vite',
    'dev:server': 'nodemon',
    build: 'tsc && vite build',
    'build:server': 'tsc --project tsconfig.json',
    lint: 'eslint .',
    preview: 'vite preview',
    start: 'node api/dist/server.js'
  },
  dependencies: {
    react: '^18.3.1',
    'react-dom': '^18.3.1',
    'react-router-dom': '^6.26.2',
    zustand: '^4.5.5',
    'lucide-react': '^0.441.0',
    clsx: '^2.1.1',
    'tailwind-merge': '^2.5.2',
    express: '^4.21.0',
    cors: '^2.8.5',
    dotenv: '^16.4.5',
    leaflet: '^1.9.4',
    'react-leaflet': '^4.2.1',
    papaparse: '^5.4.1',
    multer: '^1.4.5-lts.1'
  },
  devDependencies: {
    '@types/react': '^18.3.5',
    '@types/react-dom': '^18.3.0',
    '@types/express': '^4.17.21',
    '@types/cors': '^2.8.17',
    '@types/node': '^22.5.5',
    '@types/leaflet': '^1.9.12',
    '@types/react-leaflet': '^3.0.0',
    '@types/papaparse': '^5.3.14',
    '@types/multer': '^1.4.12',
    '@vitejs/plugin-react': '^4.3.1',
    vite: '^5.4.6',
    'vite-tsconfig-paths': '^5.0.1',
    'vite-plugin-trae-solo-badge': '^0.1.0',
    'react-dev-locator': '^1.0.0',
    typescript: '^5.6.2',
    tailwindcss: '^3.4.11',
    postcss: '^8.4.47',
    autoprefixer: '^10.4.20',
    eslint: '^9.10.0',
    '@typescript-eslint/eslint-plugin': '^8.5.0',
    '@typescript-eslint/parser': '^8.5.0',
    nodemon: '^3.1.4',
    concurrently: '^9.0.1',
    tsx: '^4.19.1'
  }
};

fs.writeFileSync('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p200/package.json', JSON.stringify(pkg, null, 2));
console.log('package.json created successfully');
