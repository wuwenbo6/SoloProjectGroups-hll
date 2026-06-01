import ldapjs from 'ldapjs';
const { createClient } = ldapjs;
import type { LdapConnectionConfig, LdapAttributeType, LdapObjectClass, ConnectTestResponse, ReindexResponse } from '../../shared/types.js';

type Client = ReturnType<typeof createClient>;

export class LdapService {
  private client: Client | null = null;
  private config: LdapConnectionConfig | null = null;

  constructor(config?: LdapConnectionConfig) {
    if (config) {
      this.config = config;
    }
  }

  setConfig(config: LdapConnectionConfig): void {
    this.config = config;
    this.disconnect();
  }

  private async connect(): Promise<Client> {
    if (!this.config) {
      throw new Error('LDAP configuration not set');
    }

    if (this.client) {
      return this.client;
    }

    const url = `${this.config.useTls ? 'ldaps' : 'ldap'}://${this.config.host}:${this.config.port}`;
    
    this.client = createClient({
      url,
      tlsOptions: this.config.useTls && this.config.caCert
        ? { ca: this.config.caCert }
        : undefined,
      timeout: 10000,
      connectTimeout: 10000,
    });

    this.client.on('error', (err) => {
      console.error('LDAP client error:', err.message);
      this.client = null;
    });

    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Client not initialized'));

      const timeoutId = setTimeout(() => {
        this.client = null;
        reject(new Error('Connection timeout'));
      }, 15000);

      this.client.bind(this.config!.bindDn, this.config!.bindPassword, (err) => {
        clearTimeout(timeoutId);
        if (err) {
          this.client = null;
          reject(err);
        } else {
          resolve(this.client!);
        }
      });
    });
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.unbind();
      } catch {
        // ignore unbind errors
      }
      this.client = null;
    }
  }

  async testConnection(): Promise<ConnectTestResponse> {
    try {
      const client = await this.connect();
      
      return new Promise((resolve) => {
        client.search('', { scope: 'base', attributes: ['*'] }, (err, res) => {
          if (err) {
            resolve({
              success: true,
              message: 'Connection successful (bind only)',
            });
            return;
          }

          let serverInfo: ConnectTestResponse['serverInfo'] = {};

          res.on('searchEntry', (entry) => {
            const attributes = entry.attributes;
            for (const attr of attributes) {
              const values = attr.values as string[];
              if (attr.type === 'vendorName') serverInfo.vendorName = values[0];
              if (attr.type === 'vendorVersion') serverInfo.vendorVersion = values[0];
              if (attr.type === 'namingContexts') serverInfo.namingContexts = values;
              if (attr.type === 'supportedLDAPVersion') serverInfo.supportedLDAPVersion = values;
            }
          });

          res.on('end', () => {
            resolve({
              success: true,
              message: 'Connection successful',
              serverInfo,
            });
          });

          res.on('error', () => {
            resolve({
              success: true,
              message: 'Connection successful',
            });
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.disconnect();
    }
  }

  async getSchema(): Promise<{ objectClasses: LdapObjectClass[]; attributeTypes: LdapAttributeType[] }> {
    const client = await this.connect();

    return new Promise((resolve, reject) => {
      const searchOptions = {
        scope: 'base' as const,
        attributes: ['objectClasses', 'attributeTypes'],
      };

      client.search('cn=schema', searchOptions, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        let objectClasses: LdapObjectClass[] = [];
        let attributeTypes: LdapAttributeType[] = [];

        res.on('searchEntry', (entry) => {
          for (const attr of entry.attributes) {
            if (attr.type === 'objectClasses') {
              objectClasses = (attr.values as string[]).map((v) => this.parseObjectClass(v));
            } else if (attr.type === 'attributeTypes') {
              attributeTypes = (attr.values as string[]).map((v) => this.parseAttributeType(v));
            }
          }
        });

        res.on('end', () => {
          resolve({ objectClasses, attributeTypes });
        });

        res.on('error', (searchErr) => {
          reject(searchErr);
        });
      });
    });
  }

  async getObjectClasses(): Promise<LdapObjectClass[]> {
    const schema = await this.getSchema();
    return schema.objectClasses;
  }

  async getAttributeTypes(): Promise<LdapAttributeType[]> {
    const schema = await this.getSchema();
    return schema.attributeTypes;
  }

  private parseAttributeType(def: string): LdapAttributeType {
    const result: LdapAttributeType = {
      oid: '',
      name: [],
      description: '',
      syntax: '',
      singleValue: false,
      mandatory: false,
      collective: false,
      obsolete: false,
    };

    const oidMatch = def.match(/^\s*\(\s*([\d.]+)/);
    if (oidMatch) result.oid = oidMatch[1];

    const nameMatch = def.match(/NAME\s+(?:'([^']+)'|\(([^)]+)\))/);
    if (nameMatch) {
      if (nameMatch[1]) {
        result.name = [nameMatch[1]];
      } else if (nameMatch[2]) {
        result.name = nameMatch[2].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) || [];
      }
    }

    const descMatch = def.match(/DESC\s+'([^']+)'/);
    if (descMatch) result.description = descMatch[1];

    const syntaxMatch = def.match(/SYNTAX\s+([\d.]+)/);
    if (syntaxMatch) result.syntax = syntaxMatch[1];

    result.singleValue = /SINGLE-VALUE/.test(def);
    result.mandatory = false;
    result.collective = /COLLECTIVE/.test(def);
    result.obsolete = /OBSOLETE/.test(def);

    const matchRuleMatch = def.match(/EQUALITY\s+([\w-]+)/);
    if (matchRuleMatch) result.matchingRule = matchRuleMatch[1];

    const substrMatch = def.match(/SUBSTR\s+([\w-]+)/);
    if (substrMatch) result.substringMatchingRule = substrMatch[1];

    const orderingMatch = def.match(/ORDERING\s+([\w-]+)/);
    if (orderingMatch) result.orderingMatchingRule = orderingMatch[1];

    return result;
  }

  private parseObjectClass(def: string): LdapObjectClass {
    const result: LdapObjectClass = {
      oid: '',
      name: [],
      description: '',
      type: 'structural',
      must: [],
      may: [],
      obsolete: false,
    };

    const oidMatch = def.match(/^\s*\(\s*([\d.]+)/);
    if (oidMatch) result.oid = oidMatch[1];

    const nameMatch = def.match(/NAME\s+(?:'([^']+)'|\(([^)]+)\))/);
    if (nameMatch) {
      if (nameMatch[1]) {
        result.name = [nameMatch[1]];
      } else if (nameMatch[2]) {
        result.name = nameMatch[2].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) || [];
      }
    }

    const descMatch = def.match(/DESC\s+'([^']+)'/);
    if (descMatch) result.description = descMatch[1];

    if (/AUXILIARY/.test(def)) result.type = 'auxiliary';
    else if (/ABSTRACT/.test(def)) result.type = 'abstract';
    else result.type = 'structural';

    const supMatch = def.match(/SUP\s+(\S+|\([^)]+\))/);
    if (supMatch) {
      const supStr = supMatch[1];
      if (supStr.startsWith('(')) {
        result.superior = supStr.slice(1, -1).split(/\s*\$\s*/).map((s) => s.trim());
      } else {
        result.superior = [supStr.trim()];
      }
    }

    const mustMatch = def.match(/MUST\s+(\S+|\([^)]+\))/);
    if (mustMatch) {
      const mustStr = mustMatch[1];
      if (mustStr.startsWith('(')) {
        result.must = mustStr.slice(1, -1).split(/\s*\$\s*/).map((s) => s.trim());
      } else {
        result.must = [mustStr.trim()];
      }
    }

    const mayMatch = def.match(/MAY\s+(\S+|\([^)]+\))/);
    if (mayMatch) {
      const mayStr = mayMatch[1];
      if (mayStr.startsWith('(')) {
        result.may = mayStr.slice(1, -1).split(/\s*\$\s*/).map((s) => s.trim());
      } else {
        result.may = [mayStr.trim()];
      }
    }

    result.obsolete = /OBSOLETE/.test(def);

    return result;
  }

  async deploySchema(ldifContent: string): Promise<{ success: boolean; message: string; log: string[] }> {
    const client = await this.connect();
    const log: string[] = [];

    try {
      const entries = this.parseLdif(ldifContent);
      log.push(`Parsed ${entries.length} LDIF entries`);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        log.push(`Processing entry ${i + 1}/${entries.length}: ${entry.dn}`);

        try {
          await new Promise<void>((resolve, reject) => {
            client.add(entry.dn, entry.attributes, (err) => {
              if (err) {
                if (err.message.includes('already exists')) {
                  log.push(`Entry ${entry.dn} already exists, skipping`);
                  resolve();
                } else {
                  reject(err);
                }
              } else {
                log.push(`Successfully added ${entry.dn}`);
                resolve();
              }
            });
          });
        } catch (err) {
          log.push(`Error adding ${entry.dn}: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      }

      return {
        success: true,
        message: 'Schema deployed successfully',
        log,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        log,
      };
    } finally {
      this.disconnect();
    }
  }

  private parseLdif(ldifContent: string): Array<{ dn: string; attributes: Record<string, string[]> }> {
    const entries: Array<{ dn: string; attributes: Record<string, string[]> }> = [];
    const lines = ldifContent.split('\n');
    
    let currentEntry: { dn: string; attributes: Record<string, string[]> } | null = null;
    let i = 0;

    while (i < lines.length) {
      let line = lines[i].trimEnd();
      
      while (i + 1 < lines.length && lines[i + 1].startsWith(' ')) {
        line += lines[i + 1].substring(1);
        i++;
      }

      if (line === '' || line.startsWith('#')) {
        if (currentEntry) {
          entries.push(currentEntry);
          currentEntry = null;
        }
        i++;
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        i++;
        continue;
      }

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      if (value.startsWith(':') || value.startsWith('<')) {
        value = value.substring(1).trim();
      }

      if (key === 'dn') {
        if (currentEntry) {
          entries.push(currentEntry);
        }
        currentEntry = { dn: value, attributes: {} };
      } else if (currentEntry && key !== 'changetype') {
        if (!currentEntry.attributes[key]) {
          currentEntry.attributes[key] = [];
        }
        currentEntry.attributes[key].push(value);
      }

      i++;
    }

    if (currentEntry) {
      entries.push(currentEntry);
    }

    return entries;
  }

  async reindex(attributeNames: string[], databaseDn?: string): Promise<ReindexResponse> {
    const log: string[] = [];
    const actualDatabaseDn = databaseDn || 'olcDatabase={1}mdb,cn=config';

    log.push(`Starting reindex process for attributes: ${attributeNames.join(', ')}`);
    log.push(`Target database: ${actualDatabaseDn}`);

    try {
      const client = await this.connect();
      log.push('Connected to LDAP server');

      return new Promise<ReindexResponse>((resolve) => {
        const indexLdif = attributeNames.map((attr) => {
          return `dn: ${actualDatabaseDn}
changetype: modify
add: olcDbIndex
olcDbIndex: ${attr} pres,eq,sub
-`;
        }).join('\n\n');

        log.push('Generated index configuration LDIF');
        log.push('Note: In a real OpenLDAP environment, reindex requires:');
        log.push('  1. Adding olcDbIndex entries to the database config');
        log.push('  2. Running slapindex command-line tool');
        log.push('  3. Or restarting slapd with -r flag');
        log.push('');
        log.push('Current operation will add the index configuration.');
        log.push('After that, you need to run slapindex manually or restart slapd.');

        const entries = this.parseLdif(indexLdif);
        let processed = 0;
        let errors = 0;

        const processNext = async () => {
          if (processed >= entries.length) {
            const success = errors === 0;
            resolve({
              success,
              message: success
                ? `Index configuration added for ${attributeNames.length} attributes. Please run slapindex or restart slapd to build indexes.`
                : `Index configuration partially added. ${errors} errors occurred.`,
              log,
              restartRequired: true,
            });
            return;
          }

          const entry = entries[processed];
          log.push(`Processing index config ${processed + 1}/${entries.length}: ${entry.dn}`);

          try {
            await new Promise<void>((resolveAdd, rejectAdd) => {
              client.modify(entry.dn, entry.attributes as any, (err: any) => {
                if (err) {
                  if (err.message.includes('already exists') || err.message.includes('Type or value exists')) {
                    log.push(`Index configuration already exists, skipping`);
                    resolveAdd();
                  } else {
                    log.push(`Error adding index config: ${err.message}`);
                    rejectAdd(err);
                  }
                } else {
                  log.push(`Successfully added index configuration`);
                  resolveAdd();
                }
              });
            });
          } catch (err) {
            errors++;
            log.push(`Failed to add index config: ${err instanceof Error ? err.message : String(err)}`);
          }

          processed++;
          setTimeout(processNext, 100);
        };

        processNext();
      });
    } catch (error) {
      const errorMessage = error instanceof Error && error.message 
        ? error.message 
        : '连接LDAP服务器失败，请检查连接配置';
      log.push(`Reindex failed: ${errorMessage}`);
      return {
        success: false,
        message: errorMessage,
        log,
        restartRequired: false,
      };
    } finally {
      this.disconnect();
    }
  }
}
