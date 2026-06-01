const ldap = require('ldapjs');
const ldapService = require('./ldapService');

function escapeLDIFValue(value) {
  if (typeof value === 'string') {
    if (/[\x00-\x1F\x7F\\:;,<>\"]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
      return Buffer.from(value, 'utf8').toString('base64');
    }
    return value;
  }
  return value;
}

function formatAttribute(name, values) {
  const lines = [];
  const valueArray = Array.isArray(values) ? values : [values];
  
  valueArray.forEach(value => {
    const escaped = escapeLDIFValue(value);
    if (typeof escaped === 'string' && escaped !== value) {
      lines.push(`${name}:: ${escaped}`);
    } else {
      lines.push(`${name}: ${escaped}`);
    }
  });
  
  return lines.join('\n');
}

function entryToLDIF(entry) {
  const lines = [];
  
  lines.push(`dn: ${entry.dn}`);
  
  const excludedAttrs = ['dn', 'entryDN', 'entryUUID', 'creatorsName', 'createTimestamp', 'modifiersName', 'modifyTimestamp', 'structuralObjectClass', 'subschemaSubentry', 'hasSubordinates', 'objectClass'];
  
  if (entry.objectClass) {
    const objectClasses = Array.isArray(entry.objectClass) ? entry.objectClass : [entry.objectClass];
    objectClasses.forEach(oc => {
      lines.push(`objectClass: ${oc}`);
    });
  }
  
  Object.keys(entry).forEach(key => {
    if (!excludedAttrs.includes(key) && entry[key] !== undefined && entry[key] !== null) {
      lines.push(formatAttribute(key, entry[key]));
    }
  });
  
  return lines.join('\n');
}

async function exportToLDIF(config, options = {}) {
  const { baseDn, scope = 'sub', filter = '(objectClass=*)', attributes } = options;
  
  const searchOptions = {
    scope: scope,
    filter: filter,
    attributes: attributes || ['*']
  };
  
  try {
    const entries = await ldapService.search(config, baseDn || config.baseDn, searchOptions);
    
    const ldifContent = entries.map(entry => entryToLDIF(entry)).join('\n\n');
    
    return ldifContent + '\n';
  } catch (err) {
    throw err;
  }
}

async function exportUsersToLDIF(config, ouDn) {
  return exportToLDIF(config, {
    baseDn: ouDn || config.baseDn,
    scope: 'sub',
    filter: '(|(objectClass=inetOrgPerson)(objectClass=person)(objectClass=organizationalPerson)(objectClass=user))'
  });
}

function parseLDIF(ldifContent) {
  const entries = [];
  const lines = ldifContent.split(/\r?\n/);
  
  let currentEntry = null;
  let currentAttr = null;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    if (line.startsWith('#')) continue;
    if (line.trim() === '') {
      if (currentEntry && currentEntry.dn) {
        entries.push(currentEntry);
      }
      currentEntry = null;
      currentAttr = null;
      continue;
    }
    
    if (line.startsWith(' ')) {
      if (currentEntry && currentAttr) {
        currentEntry[currentAttr] += line.slice(1);
      }
      continue;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const attrName = line.slice(0, colonIndex).trim();
    let attrValue = line.slice(colonIndex + 1).trim();
    
    const isBase64 = line.slice(colonIndex, colonIndex + 2) === '::';
    if (isBase64) {
      attrValue = line.slice(colonIndex + 2).trim();
      try {
        attrValue = Buffer.from(attrValue, 'base64').toString('utf8');
      } catch (e) {
      }
    }
    
    if (attrName.toLowerCase() === 'dn') {
      if (currentEntry && currentEntry.dn) {
        entries.push(currentEntry);
      }
      currentEntry = { dn: attrValue };
      currentAttr = null;
    } else if (currentEntry) {
      if (currentEntry[attrName] !== undefined) {
        if (!Array.isArray(currentEntry[attrName])) {
          currentEntry[attrName] = [currentEntry[attrName]];
        }
        currentEntry[attrName].push(attrValue);
      } else {
        currentEntry[attrName] = attrValue;
      }
      currentAttr = attrName;
    }
  }
  
  if (currentEntry && currentEntry.dn) {
    entries.push(currentEntry);
  }
  
  return entries;
}

function getParentDn(dn) {
  const parts = dn.split(',');
  if (parts.length <= 1) return null;
  return parts.slice(1).join(',');
}

async function importFromLDIF(config, ldifContent) {
  const entries = parseLDIF(ldifContent);
  const results = [];
  
  entries.sort((a, b) => a.dn.split(',').length - b.dn.split(',').length);
  
  for (const entry of entries) {
    try {
      const dn = entry.dn;
      const objectClass = entry.objectClass;
      
      if (!objectClass) {
        results.push({ dn, success: false, error: '缺少 objectClass' });
        continue;
      }
      
      const entryData = {};
      Object.keys(entry).forEach(key => {
        if (key !== 'dn' && key !== 'objectClass') {
          entryData[key] = entry[key];
        }
      });
      
      if (Array.isArray(objectClass)) {
        entryData.objectClass = objectClass;
      } else {
        entryData.objectClass = [objectClass];
      }
      
      const isUser = entryData.objectClass.some(oc => 
        ['inetOrgPerson', 'person', 'organizationalPerson', 'user'].includes(oc)
      );
      
      if (isUser && entryData.uid) {
        const parentDn = getParentDn(dn);
        if (parentDn) {
          const existingUser = await ldapService.getUser(config, dn);
          if (existingUser) {
            results.push({ dn, success: false, error: '用户已存在' });
            continue;
          }
          
          const userData = {
            uid: entryData.uid,
            cn: entryData.cn || entryData.uid,
            sn: entryData.sn || entryData.uid,
            ...entryData
          };
          
          await ldapService.createUser(config, parentDn, userData);
          results.push({ dn, success: true, action: 'created' });
        } else {
          results.push({ dn, success: false, error: '无效的 DN' });
        }
      } else {
        results.push({ dn, success: false, error: '暂不支持的对象类型' });
      }
    } catch (err) {
      results.push({ dn: entry.dn, success: false, error: err.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  
  return {
    success: failedCount === 0,
    total: results.length,
    successCount,
    failedCount,
    results
  };
}

module.exports = {
  exportToLDIF,
  exportUsersToLDIF,
  importFromLDIF,
  parseLDIF,
  entryToLDIF
};
