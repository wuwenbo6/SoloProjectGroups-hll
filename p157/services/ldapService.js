const ldap = require('ldapjs');

function createClient(config) {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: `ldap://${config.host}:${config.port}`
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.bind(config.adminDn, config.adminPassword, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(client);
      }
    });
  });
}

function search(config, baseDn, options) {
  return new Promise((resolve, reject) => {
    createClient(config).then((client) => {
      const entries = [];
      client.search(baseDn, options, (err, res) => {
        if (err) {
          client.unbind();
          reject(err);
          return;
        }

        res.on('searchEntry', (entry) => {
          const obj = { dn: entry.dn };
          entry.attributes.forEach((attr) => {
            if (attr.type === 'objectClass') {
              obj[attr.type] = attr.values;
            } else if (attr.values.length === 1) {
              obj[attr.type] = attr.values[0];
            } else {
              obj[attr.type] = attr.values;
            }
          });
          entries.push(obj);
        });

        res.on('searchReference', (referral) => {
        });

        res.on('error', (err) => {
          client.unbind();
          reject(err);
        });

        res.on('end', (result) => {
          client.unbind();
          resolve(entries);
        });
      });
    }).catch(reject);
  });
}

function searchWithPagination(config, baseDn, options, pageSize = 100) {
  return new Promise((resolve, reject) => {
    createClient(config).then((client) => {
      const entries = [];
      let cookie = null;

      function doSearch() {
        const searchOpts = {
          ...options,
          controls: [
            new ldap.PagedResultsControl({
              value: {
                size: pageSize,
                cookie: cookie
              }
            })
          ]
        };

        client.search(baseDn, searchOpts, (err, res) => {
          if (err) {
            client.unbind();
            reject(err);
            return;
          }

          res.on('searchEntry', (entry) => {
            const obj = { dn: entry.dn };
            entry.attributes.forEach((attr) => {
              if (attr.type === 'objectClass') {
                obj[attr.type] = attr.values;
              } else if (attr.values.length === 1) {
                obj[attr.type] = attr.values[0];
              } else {
                obj[attr.type] = attr.values;
              }
            });
            entries.push(obj);
          });

          res.on('searchReference', (referral) => {
          });

          res.on('error', (err) => {
            client.unbind();
            reject(err);
          });

          res.on('end', (result) => {
            let pageCookie = null;
            if (result.controls) {
              for (const control of result.controls) {
                if (control.type === '1.2.840.113556.1.4.319') {
                  pageCookie = control.value.cookie;
                  break;
                }
              }
            }

            if (pageCookie && pageCookie.length > 0) {
              cookie = pageCookie;
              doSearch();
            } else {
              client.unbind();
              resolve(entries);
            }
          });
        });
      }

      doSearch();
    }).catch(reject);
  });
}

async function getUsersPaginated(config, ouDn, page = 1, pageSize = 50) {
  const base = ouDn || config.baseDn;
  const options = {
    scope: 'one',
    filter: '(|(objectClass=inetOrgPerson)(objectClass=person)(objectClass=organizationalPerson)(objectClass=user))',
    attributes: ['dn', 'cn', 'sn', 'uid', 'givenName', 'mail', 'telephoneNumber', 'objectClass']
  };

  try {
    const allEntries = await searchWithPagination(config, base, options, pageSize);
    const total = allEntries.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const users = allEntries.slice(startIndex, endIndex);

    return {
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch (err) {
    try {
      const allEntries = await search(config, base, options);
      const total = allEntries.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const users = allEntries.slice(startIndex, endIndex);

      return {
        users,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  }
}

async function getDirectoryTree(config) {
  const options = {
    scope: 'sub',
    filter: '(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=dcObject))',
    attributes: ['dn', 'objectClass', 'ou', 'dc', 'o']
  };

  try {
    const entries = await search(config, config.baseDn, options);
    return buildTree(entries, config.baseDn);
  } catch (err) {
    throw err;
  }
}

function buildTree(entries, baseDn) {
  const dnMap = new Map();
  const root = {
    dn: baseDn,
    name: baseDn,
    type: 'root',
    children: [],
    expanded: true
  };
  dnMap.set(baseDn, root);

  const sortedEntries = [...entries].sort((a, b) => {
    return a.dn.split(',').length - b.dn.split(',').length;
  });

  sortedEntries.forEach((entry) => {
    const node = {
      dn: entry.dn,
      name: entry.ou || entry.dc || entry.o || entry.dn.split(',')[0].split('=')[1],
      type: getNodeType(entry),
      children: []
    };
    dnMap.set(entry.dn, node);

    const parentDn = getParentDn(entry.dn);
    if (parentDn) {
      let parent = dnMap.get(parentDn);
      if (!parent) {
        parent = {
          dn: parentDn,
          name: parentDn.split(',')[0].split('=')[1],
          type: 'container',
          children: []
        };
        dnMap.set(parentDn, parent);
      }
      parent.children.push(node);
    } else {
      root.children.push(node);
    }
  });

  return root;
}

function getNodeType(entry) {
  if (entry.objectClass) {
    const classes = Array.isArray(entry.objectClass) ? entry.objectClass : [entry.objectClass];
    if (classes.includes('organizationalUnit')) return 'ou';
    if (classes.includes('domain') || classes.includes('dcObject')) return 'domain';
    if (classes.includes('organization')) return 'o';
  }
  return 'container';
}

function getParentDn(dn) {
  const parts = dn.split(',');
  if (parts.length <= 1) return null;
  return parts.slice(1).join(',');
}

async function getUsers(config, ouDn) {
  const base = ouDn || config.baseDn;
  const options = {
    scope: 'one',
    filter: '(|(objectClass=inetOrgPerson)(objectClass=person)(objectClass=organizationalPerson)(objectClass=user))',
    attributes: ['dn', 'cn', 'sn', 'uid', 'givenName', 'mail', 'telephoneNumber', 'objectClass']
  };

  try {
    const entries = await search(config, base, options);
    return entries;
  } catch (err) {
    throw err;
  }
}

async function getUser(config, dn) {
  const options = {
    scope: 'base',
    filter: '(objectClass=*)',
    attributes: ['dn', 'cn', 'sn', 'uid', 'givenName', 'mail', 'telephoneNumber', 'objectClass']
  };

  try {
    const entries = await search(config, dn, options);
    return entries[0] || null;
  } catch (err) {
    throw err;
  }
}

async function createUser(config, ouDn, userData) {
  return new Promise((resolve, reject) => {
    createClient(config).then((client) => {
      const dn = `uid=${userData.uid},${ouDn}`;
      const entry = {
        objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson'],
        cn: userData.cn,
        sn: userData.sn,
        uid: userData.uid
      };

      if (userData.givenName) entry.givenName = userData.givenName;
      if (userData.mail) entry.mail = userData.mail;
      if (userData.telephoneNumber) entry.telephoneNumber = userData.telephoneNumber;
      if (userData.userPassword) entry.userPassword = userData.userPassword;

      client.add(dn, entry, (err) => {
        client.unbind();
        if (err) {
          reject(err);
        } else {
          resolve({ dn, ...userData });
        }
      });
    }).catch(reject);
  });
}

async function updateUser(config, dn, userData) {
  return new Promise((resolve, reject) => {
    createClient(config).then((client) => {
      const changes = [];

      if (userData.cn !== undefined) {
        changes.push(new ldap.Change({
          operation: 'replace',
          modification: { cn: userData.cn }
        }));
      }
      if (userData.sn !== undefined) {
        changes.push(new ldap.Change({
          operation: 'replace',
          modification: { sn: userData.sn }
        }));
      }
      if (userData.givenName !== undefined) {
        changes.push(new ldap.Change({
          operation: 'replace',
          modification: { givenName: userData.givenName }
        }));
      }
      if (userData.mail !== undefined) {
        changes.push(new ldap.Change({
          operation: 'replace',
          modification: { mail: userData.mail }
        }));
      }
      if (userData.telephoneNumber !== undefined) {
        changes.push(new ldap.Change({
          operation: 'replace',
          modification: { telephoneNumber: userData.telephoneNumber }
        }));
      }

      client.modify(dn, changes, (err) => {
        client.unbind();
        if (err) {
          reject(err);
        } else {
          resolve({ success: true });
        }
      });
    }).catch(reject);
  });
}

async function deleteUser(config, dn) {
  return new Promise((resolve, reject) => {
    createClient(config).then((client) => {
      client.del(dn, (err) => {
        client.unbind();
        if (err) {
          reject(err);
        } else {
          resolve({ success: true });
        }
      });
    }).catch(reject);
  });
}

async function resetPassword(config, dn, newPassword) {
  return new Promise((resolve, reject) => {
    createClient(config).then((client) => {
      const change = new ldap.Change({
        operation: 'replace',
        modification: { userPassword: newPassword }
      });

      client.modify(dn, change, (err) => {
        client.unbind();
        if (err) {
          reject(err);
        } else {
          resolve({ success: true });
        }
      });
    }).catch(reject);
  });
}

async function testConnection(config) {
  try {
    const client = await createClient(config);
    client.unbind();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  testConnection,
  getDirectoryTree,
  getUsers,
  getUsersPaginated,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  resetPassword
};
