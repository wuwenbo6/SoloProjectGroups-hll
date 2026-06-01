export type ACEType = 'A' | 'D';

export interface ACE {
  type: ACEType;
  flags: string;
  principal: string;
  permissions: string[];
}

export interface GetACLRequest {
  path: string;
}

export interface GetACLResponse {
  success: boolean;
  data?: {
    path: string;
    aces: ACE[];
  };
  error?: string;
}

export interface SetACLRequest {
  path: string;
  aces: ACE[];
}

export interface SetACLResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface PermissionInfo {
  code: string;
  name: string;
  description: string;
  category: 'data' | 'attribute';
}

export const PERMISSIONS: PermissionInfo[] = [
  { code: 'r', name: 'Read', description: '读取文件/列出目录', category: 'data' },
  { code: 'w', name: 'Write', description: '写入文件/创建文件', category: 'data' },
  { code: 'x', name: 'Execute', description: '执行文件/进入目录', category: 'data' },
  { code: 'a', name: 'Append', description: '追加数据/创建子目录', category: 'data' },
  { code: 'd', name: 'Delete', description: '删除文件或目录', category: 'data' },
  { code: 'D', name: 'Delete Child', description: '删除子项', category: 'data' },
  { code: 't', name: 'Read Attr', description: '读取属性', category: 'attribute' },
  { code: 'T', name: 'Write Attr', description: '写入属性', category: 'attribute' },
  { code: 'n', name: 'Read Named Attr', description: '读取命名属性', category: 'attribute' },
  { code: 'N', name: 'Write Named Attr', description: '写入命名属性', category: 'attribute' },
  { code: 'c', name: 'Read ACL', description: '读取ACL', category: 'attribute' },
  { code: 'C', name: 'Write ACL', description: '写入ACL', category: 'attribute' },
  { code: 'o', name: 'Change Owner', description: '改变所有者', category: 'attribute' },
  { code: 'y', name: 'Synchronize', description: '同步', category: 'attribute' },
];

export interface FlagInfo {
  code: string;
  name: string;
  description: string;
  group: 'inheritance' | 'audit';
}

export const FLAGS: FlagInfo[] = [
  { code: 'f', name: 'File Inherit', description: '文件继承', group: 'inheritance' },
  { code: 'd', name: 'Dir Inherit', description: '目录继承', group: 'inheritance' },
  { code: 'i', name: 'Inherit Only', description: '仅继承', group: 'inheritance' },
  { code: 'n', name: 'No Propagate', description: '不传播继承', group: 'inheritance' },
  { code: 'S', name: 'Successful Access', description: '成功访问审计', group: 'audit' },
  { code: 'F', name: 'Failed Access', description: '失败访问审计', group: 'audit' },
];

export const INHERITANCE_FLAGS = ['f', 'd', 'i', 'n'];

export function isInheritedACE(ace: ACE): boolean {
  return INHERITANCE_FLAGS.some((f) => ace.flags.includes(f));
}

export type PrincipalPlaceholder = '${OWNER}' | '${GROUP}' | '${EVERYONE}';

export interface ACETemplate {
  type: ACEType;
  flags: string;
  principal: string;
  permissions: string[];
}

export interface ACLTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  aces: ACETemplate[];
}

export const ACL_TEMPLATES: ACLTemplate[] = [
  {
    id: 'home_dir',
    name: '用户主目录',
    description: '所有者完全控制，同组只读，其他人无权限。适用于 /home/user 目录。',
    icon: '🏠',
    aces: [
      { type: 'A', flags: 'fd', principal: '${OWNER}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'A', flags: 'fd', principal: '${GROUP}', permissions: ['r', 'x', 't', 'n', 'c'] },
      { type: 'D', flags: 'fd', principal: '${EVERYONE}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
    ],
  },
  {
    id: 'shared_dir',
    name: '共享目录',
    description: '所有者完全控制，同组读写执行，其他人只读。适用于团队共享目录。',
    icon: '📁',
    aces: [
      { type: 'A', flags: 'fd', principal: '${OWNER}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'A', flags: 'fd', principal: '${GROUP}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c'] },
      { type: 'D', flags: 'fd', principal: '${GROUP}', permissions: ['C', 'o'] },
      { type: 'A', flags: '', principal: '${EVERYONE}', permissions: ['r', 'x', 't', 'n', 'c'] },
    ],
  },
  {
    id: 'readonly',
    name: '只读共享',
    description: '所有者完全控制，其他人只读。适用于公共文档或发布目录。',
    icon: '📖',
    aces: [
      { type: 'A', flags: 'fd', principal: '${OWNER}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'A', flags: 'fd', principal: '${EVERYONE}', permissions: ['r', 'x', 't', 'n', 'c'] },
      { type: 'D', flags: 'fd', principal: '${EVERYONE}', permissions: ['w', 'a', 'd', 'D', 'T', 'N', 'C', 'o'] },
    ],
  },
  {
    id: 'private',
    name: '私有目录',
    description: '仅所有者完全控制，其他人完全拒绝。适用于私人文件。',
    icon: '🔒',
    aces: [
      { type: 'A', flags: 'fd', principal: '${OWNER}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'D', flags: 'fd', principal: '${GROUP}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'D', flags: 'fd', principal: '${EVERYONE}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
    ],
  },
  {
    id: 'public_read',
    name: '公开只读',
    description: '所有者完全控制，所有人可读。适用于 Web 目录或公共资源。',
    icon: '🌐',
    aces: [
      { type: 'A', flags: 'fd', principal: '${OWNER}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'A', flags: 'fd', principal: '${EVERYONE}', permissions: ['r', 'x', 't'] },
    ],
  },
  {
    id: 'drop_box',
    name: '投递箱',
    description: '所有者完全控制，其他人只能追加写入。适用于收集箱或上传目录。',
    icon: '📬',
    aces: [
      { type: 'A', flags: 'fd', principal: '${OWNER}', permissions: ['r', 'w', 'x', 'a', 'd', 'D', 't', 'T', 'n', 'N', 'c', 'C', 'o', 'y'] },
      { type: 'A', flags: 'fd', principal: '${EVERYONE}', permissions: ['a', 't', 'n', 'c'] },
      { type: 'D', flags: 'fdi', principal: '${EVERYONE}', permissions: ['r', 'w', 'x', 'd'] },
    ],
  },
];

export function resolveTemplatePlaceholders(
  aces: ACETemplate[],
  owner: string,
  group: string,
): ACE[] {
  return aces.map((ace) => ({
    type: ace.type,
    flags: ace.flags,
    principal: ace.principal
      .replace(/\$\{OWNER\}/g, owner)
      .replace(/\$\{GROUP\}/g, group)
      .replace(/\$\{EVERYONE\}/g, 'Everyone@'),
    permissions: [...ace.permissions],
  }));
}
