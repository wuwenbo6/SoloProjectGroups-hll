export interface LdapConnectionConfig {
  host: string;
  port: number;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  useTls: boolean;
  caCert?: string;
}

export interface LdapAttributeType {
  oid: string;
  name: string[];
  description?: string;
  syntax: string;
  singleValue: boolean;
  mandatory: boolean;
  collective: boolean;
  obsolete: boolean;
  matchingRule?: string;
  substringMatchingRule?: string;
  orderingMatchingRule?: string;
}

export interface LdapObjectClass {
  oid: string;
  name: string[];
  description?: string;
  type: 'structural' | 'auxiliary' | 'abstract';
  must: string[];
  may: string[];
  superior?: string[];
  obsolete: boolean;
}

export interface NewAttributeDefinition {
  name: string;
  oid: string;
  description: string;
  syntax: string;
  singleValue: boolean;
  mandatory: boolean;
  collective: boolean;
  matchingRule?: string;
  indexEnabled?: boolean;
  indexTypes?: string[];
}

export interface DbIndexConfig {
  attributeName: string;
  indexTypes: string[];
}

export interface CompatibilityCheckRequest {
  attributes: NewAttributeDefinition[];
  objectClassName?: string;
  objectClassOid?: string;
  existingAttributeTypes: LdapAttributeType[];
  existingObjectClasses: LdapObjectClass[];
}

export interface CompatibilityConflict {
  type: 'oid_conflict' | 'name_conflict' | 'syntax_mismatch' | 'matching_rule_mismatch' | 'single_value_mismatch' | 'object_class_oid_conflict' | 'object_class_name_conflict' | 'object_class_superior_conflict';
  severity: 'error' | 'warning';
  element: 'attribute' | 'objectClass';
  elementName: string;
  conflictingWith: string;
  message: string;
  detail?: string;
}

export interface CompatibilityCheckResponse {
  compatible: boolean;
  conflicts: CompatibilityConflict[];
  summary: string;
}

export interface ExportSchemaLdifRequest {
  attributeTypes: LdapAttributeType[];
  objectClasses: LdapObjectClass[];
  format: 'add' | 'full';
}

export interface ReindexRequest {
  connectionConfig: LdapConnectionConfig;
  attributeNames: string[];
  databaseDn?: string;
}

export interface ReindexResponse {
  success: boolean;
  message: string;
  log: string[];
  restartRequired: boolean;
}

export interface SchemaGenerateRequest {
  attributes: NewAttributeDefinition[];
  objectClassName?: string;
  objectClassOid?: string;
  objectClassType?: 'structural' | 'auxiliary';
}

export interface SchemaGenerateResponse {
  ldifContent: string;
  schemaFileContent: string;
  indexConfigContent: string;
  indexConfigs: DbIndexConfig[];
  warnings: string[];
  errors: string[];
}

export interface SchemaDeployRequest {
  ldifContent: string;
  connectionConfig: LdapConnectionConfig;
  restartRequired: boolean;
}

export interface SchemaDeployResponse {
  success: boolean;
  message: string;
  restartRequired: boolean;
  deployLog: string[];
}

export interface ConnectTestResponse {
  success: boolean;
  message: string;
  serverInfo?: {
    vendorName?: string;
    vendorVersion?: string;
    namingContexts?: string[];
    supportedLDAPVersion?: string[];
  };
}

export const LDAP_SYNTAX_OPTIONS = [
  { value: '1.3.6.1.4.1.1466.115.121.1.15', label: 'Directory String', description: 'UTF-8 字符串' },
  { value: '1.3.6.1.4.1.1466.115.121.1.27', label: 'Integer', description: '整数' },
  { value: '1.3.6.1.4.1.1466.115.121.1.7', label: 'Boolean', description: '布尔值 (TRUE/FALSE)' },
  { value: '1.3.6.1.4.1.1466.115.121.1.24', label: 'Generalized Time', description: '时间格式 (YYYYMMDDHHMMSSZ)' },
  { value: '1.3.6.1.4.1.1466.115.121.1.12', label: 'Distinguished Name', description: 'DN 格式' },
  { value: '1.3.6.1.4.1.1466.115.121.1.44', label: 'Printable String', description: '可打印字符串' },
  { value: '1.3.6.1.4.1.1466.115.121.1.40', label: 'Octet String', description: '二进制数据' },
  { value: '1.3.6.1.4.1.1466.115.121.1.26', label: 'IA5 String', description: 'ASCII 字符串' },
  { value: '1.3.6.1.4.1.1466.115.121.1.50', label: 'Telephone Number', description: '电话号码格式' },
  { value: '1.3.6.1.4.1.1466.115.121.1.34', label: 'OID', description: '对象标识符' },
  { value: '1.3.6.1.4.1.1466.115.121.1.36', label: 'RFC822 Address', description: '邮箱地址格式' },
  { value: '1.3.6.1.4.1.1466.115.121.1.41', label: 'Postal Address', description: '邮政地址格式' },
];

export const MATCHING_RULE_OPTIONS = [
  { value: '2.5.13.2', label: 'caseIgnoreMatch', description: '不区分大小写匹配' },
  { value: '2.5.13.3', label: 'caseExactMatch', description: '区分大小写匹配' },
  { value: '2.5.13.4', label: 'caseIgnoreSubstringsMatch', description: '不区分大小写子串匹配' },
  { value: '2.5.13.5', label: 'caseExactSubstringsMatch', description: '区分大小写子串匹配' },
  { value: '2.5.13.10', label: 'numericStringMatch', description: '数字字符串匹配' },
  { value: '2.5.13.13', label: 'integerMatch', description: '整数匹配' },
  { value: '2.5.13.14', label: 'integerOrderingMatch', description: '整数排序匹配' },
  { value: '2.5.13.15', label: 'octetStringMatch', description: '字节串匹配' },
  { value: '2.5.13.27', label: 'generalizedTimeMatch', description: '时间匹配' },
  { value: '2.5.13.28', label: 'generalizedTimeOrderingMatch', description: '时间排序匹配' },
  { value: '2.5.13.30', label: 'objectIdentifierMatch', description: 'OID 匹配' },
  { value: '2.5.13.34', label: 'telephoneNumberMatch', description: '电话号码匹配' },
];

export const INDEX_TYPE_OPTIONS = [
  { value: 'pres', label: 'presence', description: '存在性索引（检查属性是否存在）' },
  { value: 'eq', label: 'equality', description: '相等匹配索引（精确匹配）' },
  { value: 'sub', label: 'substring', description: '子串匹配索引（模糊搜索）' },
  { value: 'approx', label: 'approximate', description: '近似匹配索引' },
  { value: 'subinitial', label: 'subinitial', description: '前缀匹配索引' },
  { value: 'subany', label: 'subany', description: '任意子串匹配索引' },
  { value: 'subfinal', label: 'subfinal', description: '后缀匹配索引' },
];

export const DEFAULT_INDEX_TYPES = ['pres', 'eq', 'sub'];

export const DEFAULT_ATTRIBUTE: NewAttributeDefinition = {
  name: '',
  oid: '',
  description: '',
  syntax: '1.3.6.1.4.1.1466.115.121.1.15',
  singleValue: true,
  mandatory: false,
  collective: false,
  matchingRule: '2.5.13.2',
  indexEnabled: true,
  indexTypes: [...DEFAULT_INDEX_TYPES],
};
