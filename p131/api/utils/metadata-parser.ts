import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PluginMetadata, ParsedPlugin } from '../types';

export function parseMetadataTxt(content: string): PluginMetadata {
  const lines = content.split('\n');
  const metadata: Partial<PluginMetadata> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }
    
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    
    if (!key || !value) continue;
    
    switch (key.toLowerCase()) {
      case 'name':
        metadata.name = value;
        break;
      case 'version':
        metadata.version = value;
        break;
      case 'description':
        metadata.description = value;
        break;
      case 'about':
        metadata.about = value;
        break;
      case 'author':
        metadata.author = value;
        break;
      case 'email':
        metadata.email = value;
        break;
      case 'category':
        metadata.category = value;
        break;
      case 'icon':
        metadata.icon = value;
        break;
      case 'qgis_minimum_version':
      case 'qgisminimumversion':
        metadata.qgisMinimumVersion = value;
        break;
      case 'qgis_maximum_version':
      case 'qgismaximumversion':
        metadata.qgisMaximumVersion = value;
        break;
      case 'homepage':
        metadata.homepage = value;
        break;
      case 'tracker':
        metadata.tracker = value;
        break;
      case 'repository':
      case 'code_repository':
        metadata.repository = value;
        break;
      case 'license':
        metadata.license = value;
        break;
      case 'deprecated':
        metadata.deprecated = value.toLowerCase() === 'true';
        break;
      case 'experimental':
        metadata.experimental = value.toLowerCase() === 'true';
        break;
      case 'dependencies':
        metadata.dependencies = value.split(',').map(d => d.trim()).filter(Boolean);
        break;
      case 'changelog':
        metadata.changelog = value;
        break;
      case 'tags':
        metadata.tags = value.split(',').map(t => t.trim()).filter(Boolean);
        break;
    }
  }
  
  if (!metadata.name) {
    throw new Error('Missing required field: name');
  }
  if (!metadata.version) {
    throw new Error('Missing required field: version');
  }
  if (!metadata.description) {
    throw new Error('Missing required field: description');
  }
  if (!metadata.author) {
    throw new Error('Missing required field: author');
  }
  if (!metadata.qgisMinimumVersion) {
    throw new Error('Missing required field: qgisMinimumVersion');
  }
  
  return metadata as PluginMetadata;
}

export function parsePluginZip(
  zipPath: string,
  storageDir: string,
  iconDir: string
): ParsedPlugin {
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  
  let metadataTxt: string | null = null;
  let iconEntry: AdmZip.IZipEntry | null = null;
  
  const rootFolders = new Set<string>();
  for (const entry of zipEntries) {
    const parts = entry.entryName.split('/');
    if (parts.length > 0 && parts[0]) {
      rootFolders.add(parts[0]);
    }
  }
  
  if (rootFolders.size !== 1) {
    throw new Error('Plugin zip must contain exactly one root folder');
  }
  
  const pluginFolder = Array.from(rootFolders)[0];
  
  for (const entry of zipEntries) {
    const entryName = entry.entryName.toLowerCase();
    
    if (entryName.endsWith('metadata.txt') && !entry.isDirectory) {
      metadataTxt = zip.readAsText(entry);
    }
    
    if (entryName.match(/\/icon\.(png|svg|jpg|jpeg)$/i) && !entry.isDirectory) {
      iconEntry = entry;
    }
  }
  
  if (!metadataTxt) {
    throw new Error('Missing metadata.txt in plugin');
  }
  
  const metadata = parseMetadataTxt(metadataTxt);
  
  let iconPath: string | undefined;
  if (iconEntry) {
    const iconExt = path.extname(iconEntry.entryName);
    const iconFileName = `${pluginFolder}${iconExt}`;
    const iconFilePath = path.join(iconDir, iconFileName);
    const iconData = zip.readFile(iconEntry);
    if (iconData) {
      fs.writeFileSync(iconFilePath, iconData);
      iconPath = `/icons/${iconFileName}`;
    }
  }
  
  const fileBuffer = fs.readFileSync(zipPath);
  const md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
  const fileSize = fs.statSync(zipPath).size;
  
  const filename = `${pluginFolder}-${metadata.version}.zip`;
  const destPath = path.join(storageDir, filename);
  fs.copyFileSync(zipPath, destPath);
  
  return {
    metadata,
    filename,
    fileSize,
    md5Hash,
    iconPath,
  };
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
