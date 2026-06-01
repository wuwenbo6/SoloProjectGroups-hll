import type { NewAttributeDefinition, SchemaGenerateRequest, SchemaGenerateResponse, DbIndexConfig, LdapAttributeType, LdapObjectClass, CompatibilityCheckRequest, CompatibilityConflict, CompatibilityCheckResponse, ExportSchemaLdifRequest } from '../../shared/types.js';

export class SchemaService {
  private oidPattern = /^\d+(\.\d+)*$/;
  private namePattern = /^[a-zA-Z][a-zA-Z0-9-]*$/;

  validateAttribute(attr: NewAttributeDefinition, existingNames: string[] = []): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!attr.name.trim()) {
      errors.push('属性名称不能为空');
    } else if (!this.namePattern.test(attr.name)) {
      errors.push('属性名称格式不正确，必须以字母开头，只能包含字母、数字和连字符');
    } else if (existingNames.includes(attr.name.toLowerCase())) {
      errors.push(`属性名称 "${attr.name}" 已存在`);
    }

    if (!attr.oid.trim()) {
      errors.push('OID 不能为空');
    } else if (!this.oidPattern.test(attr.oid)) {
      errors.push('OID 格式不正确，必须是数字和点的组合，例如 1.3.6.1.4.1.xxxxx');
    }

    if (!attr.syntax.trim()) {
      errors.push('语法类型不能为空');
    }

    if (attr.name.length > 64) {
      warnings.push('属性名称建议不超过 64 个字符');
    }

    if (attr.description && attr.description.length > 1024) {
      warnings.push('描述建议不超过 1024 个字符');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateObjectClass(name: string, oid: string, existingNames: string[] = []): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name.trim()) {
      errors.push('ObjectClass 名称不能为空');
    } else if (!this.namePattern.test(name)) {
      errors.push('ObjectClass 名称格式不正确，必须以字母开头，只能包含字母、数字和连字符');
    } else if (existingNames.includes(name.toLowerCase())) {
      errors.push(`ObjectClass 名称 "${name}" 已存在`);
    }

    if (!oid.trim()) {
      errors.push('OID 不能为空');
    } else if (!this.oidPattern.test(oid)) {
      errors.push('OID 格式不正确，必须是数字和点的组合');
    }

    if (name.length > 64) {
      warnings.push('ObjectClass 名称建议不超过 64 个字符');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  generateSchema(request: SchemaGenerateRequest, existingAttributeNames: string[] = [], existingObjectClassNames: string[] = []): SchemaGenerateResponse {
    const warnings: string[] = [];
    const errors: string[] = [];

    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (let i = 0; i < request.attributes.length; i++) {
      const attr = request.attributes[i];
      const result = this.validateAttribute(attr, existingAttributeNames);
      if (!result.valid) {
        allErrors.push(`属性 ${i + 1} (${attr.name || '未命名'}): ${result.errors.join('; ')}`);
      }
      allWarnings.push(...result.warnings.map((w) => `属性 ${i + 1} (${attr.name || '未命名'}): ${w}`));
    }

    if (request.objectClassName && request.objectClassOid) {
      const ocResult = this.validateObjectClass(
        request.objectClassName,
        request.objectClassOid,
        existingObjectClassNames
      );
      if (!ocResult.valid) {
        allErrors.push(`ObjectClass: ${ocResult.errors.join('; ')}`);
      }
      allWarnings.push(...ocResult.warnings.map((w) => `ObjectClass: ${w}`));
    }

    if (allErrors.length > 0) {
      errors.push(...allErrors);
      return {
        ldifContent: '',
        schemaFileContent: '',
        indexConfigContent: '',
        indexConfigs: [],
        errors,
        warnings: allWarnings,
      };
    }

    warnings.push(...allWarnings);

    const ldifContent = this.generateLdif(request);
    const schemaFileContent = this.generateSchemaFile(request);
    const { indexConfigContent, indexConfigs } = this.generateIndexConfig(request);

    return {
      ldifContent,
      schemaFileContent,
      indexConfigContent,
      indexConfigs,
      warnings,
      errors,
    };
  }

  private generateLdif(request: SchemaGenerateRequest): string {
    const lines: string[] = [];
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';

    lines.push('# Auto-generated LDAP Schema LDIF');
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push('');

    for (const attr of request.attributes) {
      lines.push('dn: cn=schema');
      lines.push('changetype: modify');
      lines.push('add: attributeTypes');
      lines.push(`attributeTypes: ${this.formatAttributeType(attr)}`);
      lines.push('-');
      lines.push('');
    }

    if (request.objectClassName && request.objectClassOid) {
      lines.push('dn: cn=schema');
      lines.push('changetype: modify');
      lines.push('add: objectClasses');
      lines.push(`objectClasses: ${this.formatObjectClass(request)}`);
      lines.push('-');
      lines.push('');
    }

    lines.push('# End of Schema');

    return lines.join('\n');
  }

  private formatAttributeType(attr: NewAttributeDefinition): string {
    const parts: string[] = ['(', attr.oid];

    parts.push(`NAME '${attr.name}'`);

    if (attr.description) {
      parts.push(`DESC '${this.escapeQuotes(attr.description)}'`);
    }

    if (attr.matchingRule) {
      const matchingRuleName = this.getMatchingRuleName(attr.matchingRule);
      if (matchingRuleName) {
        parts.push(`EQUALITY ${matchingRuleName}`);
      }
    }

    parts.push(`SYNTAX ${attr.syntax}`);

    if (attr.singleValue) {
      parts.push('SINGLE-VALUE');
    }

    if (attr.collective) {
      parts.push('COLLECTIVE');
    }

    parts.push('USAGE userApplications');

    parts.push(')');

    return parts.join(' ');
  }

  private formatObjectClass(request: SchemaGenerateRequest): string {
    if (!request.objectClassName || !request.objectClassOid) {
      return '';
    }

    const parts: string[] = ['(', request.objectClassOid];

    parts.push(`NAME '${request.objectClassName}'`);

    parts.push(`SUP top`);

    const type = request.objectClassType || 'auxiliary';
    parts.push(type.toUpperCase());

    const attrNames = request.attributes.map((a) => a.name);

    if (request.attributes.some((a) => a.mandatory)) {
      const mustAttrs = request.attributes.filter((a) => a.mandatory).map((a) => a.name);
      if (mustAttrs.length === 1) {
        parts.push(`MUST ${mustAttrs[0]}`);
      } else {
        parts.push(`MUST ( ${mustAttrs.join(' $ ')} )`);
      }
    }

    const mayAttrs = request.attributes.filter((a) => !a.mandatory).map((a) => a.name);
    if (mayAttrs.length > 0) {
      if (mayAttrs.length === 1) {
        parts.push(`MAY ${mayAttrs[0]}`);
      } else {
        parts.push(`MAY ( ${mayAttrs.join(' $ ')} )`);
      }
    }

    parts.push(')');

    return parts.join(' ');
  }

  private generateSchemaFile(request: SchemaGenerateRequest): string {
    const lines: string[] = [];

    lines.push('# Auto-generated OpenLDAP Schema File');
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push(`# Schema Name: Custom Schema`);
    lines.push('');

    for (const attr of request.attributes) {
      lines.push(`attributetype ${this.formatAttributeType(attr)}`);
      lines.push('');
    }

    if (request.objectClassName && request.objectClassOid) {
      lines.push(`objectclass ${this.formatObjectClass(request)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private escapeQuotes(str: string): string {
    return str.replace(/'/g, "\\'");
  }

  private getMatchingRuleName(oid: string): string | null {
    const matchingRules: Record<string, string> = {
      '2.5.13.2': 'caseIgnoreMatch',
      '2.5.13.3': 'caseExactMatch',
      '2.5.13.4': 'caseIgnoreSubstringsMatch',
      '2.5.13.5': 'caseExactSubstringsMatch',
      '2.5.13.10': 'numericStringMatch',
      '2.5.13.13': 'integerMatch',
      '2.5.13.14': 'integerOrderingMatch',
      '2.5.13.15': 'octetStringMatch',
      '2.5.13.27': 'generalizedTimeMatch',
      '2.5.13.28': 'generalizedTimeOrderingMatch',
      '2.5.13.30': 'objectIdentifierMatch',
      '2.5.13.34': 'telephoneNumberMatch',
    };
    return matchingRules[oid] || null;
  }

  validateSchemaContent(content: string, type: 'ldif' | 'schema'): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!content.trim()) {
      errors.push('Schema 内容不能为空');
      return { valid: false, errors, warnings };
    }

    const oidMatches = content.match(/\d+(\.\d+)+/g) || [];
    const uniqueOids = new Set(oidMatches);
    if (oidMatches.length !== uniqueOids.size) {
      warnings.push('检测到重复的 OID');
    }

    const nameMatches = content.match(/NAME\s+'([^']+)'/g) || [];
    const uniqueNames = new Set(nameMatches.map((m) => m.match(/NAME\s+'([^']+)'/)?.[1]?.toLowerCase()));
    if (nameMatches.length !== uniqueNames.size) {
      errors.push('检测到重复的属性名称');
    }

    const unclosedParens = this.checkParentheses(content);
    if (unclosedParens > 0) {
      errors.push(`存在 ${unclosedParens} 个未闭合的括号`);
    }

    if (type === 'ldif') {
      if (!content.includes('dn:')) {
        warnings.push('LDIF 内容中未检测到 dn 字段');
      }
      if (!content.includes('changetype:')) {
        warnings.push('LDIF 内容中未检测到 changetype 字段');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private checkParentheses(str: string): number {
    let count = 0;
    for (const char of str) {
      if (char === '(') count++;
      if (char === ')') count--;
    }
    return count;
  }

  generateIndexConfig(request: SchemaGenerateRequest): { indexConfigContent: string; indexConfigs: DbIndexConfig[] } {
    const indexConfigs: DbIndexConfig[] = [];
    const ldifLines: string[] = [];

    ldifLines.push('# Auto-generated LDAP Index Configuration (olcDbIndex)');
    ldifLines.push(`# Generated at: ${new Date().toISOString()}`);
    ldifLines.push('#');
    ldifLines.push('# Apply this LDIF to your OpenLDAP cn=config database');
    ldifLines.push('# to create indexes for the new attributes');
    ldifLines.push('');

    for (const attr of request.attributes) {
      if (attr.indexEnabled && attr.name.trim()) {
        const indexTypes = attr.indexTypes && attr.indexTypes.length > 0
          ? attr.indexTypes
          : ['pres', 'eq', 'sub'];

        indexConfigs.push({
          attributeName: attr.name,
          indexTypes,
        });

        ldifLines.push('dn: olcDatabase={1}mdb,cn=config');
        ldifLines.push('changetype: modify');
        ldifLines.push('add: olcDbIndex');
        ldifLines.push(`olcDbIndex: ${attr.name} ${indexTypes.join(',')}`);
        ldifLines.push('-');
        ldifLines.push('');
      }
    }

    if (indexConfigs.length === 0) {
      ldifLines.push('# No indexes configured for the new attributes');
      ldifLines.push('');
    } else {
      ldifLines.push('# After applying this configuration, run reindex to build the indexes');
      ldifLines.push('# or restart slapd to automatically reindex');
      ldifLines.push('');
    }

    ldifLines.push('# End of Index Configuration');

    return {
      indexConfigContent: ldifLines.join('\n'),
      indexConfigs,
    };
  }

  checkCompatibility(request: CompatibilityCheckRequest): CompatibilityCheckResponse {
    const conflicts: CompatibilityConflict[] = [];
    const { attributes, objectClassName, objectClassOid, existingAttributeTypes, existingObjectClasses } = request;

    const existingAttrByOid = new Map<string, LdapAttributeType>();
    const existingAttrByName = new Map<string, LdapAttributeType>();
    for (const at of existingAttributeTypes) {
      existingAttrByOid.set(at.oid, at);
      for (const name of at.name) {
        existingAttrByName.set(name.toLowerCase(), at);
      }
    }

    const existingOcByOid = new Map<string, LdapObjectClass>();
    const existingOcByName = new Map<string, LdapObjectClass>();
    for (const oc of existingObjectClasses) {
      existingOcByOid.set(oc.oid, oc);
      for (const name of oc.name) {
        existingOcByName.set(name.toLowerCase(), oc);
      }
    }

    for (const attr of attributes) {
      if (!attr.name.trim() || !attr.oid.trim()) continue;

      const oidConflict = existingAttrByOid.get(attr.oid);
      if (oidConflict) {
        const hasNameOverlap = oidConflict.name.some(
          (n) => n.toLowerCase() === attr.name.toLowerCase()
        );
        if (hasNameOverlap) {
          conflicts.push({
            type: 'oid_conflict',
            severity: 'warning',
            element: 'attribute',
            elementName: attr.name,
            conflictingWith: oidConflict.name.join(', '),
            message: `属性 "${attr.name}" 的 OID ${attr.oid} 与已有属性 "${oidConflict.name.join(', ')}" 相同`,
            detail: 'OID 相同且名称一致，这通常意味着您正在重新定义已有属性。如果语法和匹配规则也一致，这不会造成问题。',
          });
        } else {
          conflicts.push({
            type: 'oid_conflict',
            severity: 'error',
            element: 'attribute',
            elementName: attr.name,
            conflictingWith: oidConflict.name.join(', '),
            message: `属性 "${attr.name}" 的 OID ${attr.oid} 与已有属性 "${oidConflict.name.join(', ')}" 冲突`,
            detail: 'OID 必须全局唯一。两个不同名称的属性不能共享同一个 OID。',
          });
        }
      }

      const nameConflict = existingAttrByName.get(attr.name.toLowerCase());
      if (nameConflict && !existingAttrByOid.has(attr.oid)) {
        conflicts.push({
          type: 'name_conflict',
          severity: 'error',
          element: 'attribute',
          elementName: attr.name,
          conflictingWith: nameConflict.oid,
          message: `属性名称 "${attr.name}" 与已有属性 (OID: ${nameConflict.oid}) 冲突`,
          detail: '属性名称在 Schema 中必须唯一。请使用不同的名称。',
        });
      }

      if (nameConflict && nameConflict.oid !== attr.oid) {
        conflicts.push({
          type: 'name_conflict',
          severity: 'error',
          element: 'attribute',
          elementName: attr.name,
          conflictingWith: nameConflict.oid,
          message: `属性名称 "${attr.name}" 已被 OID 为 ${nameConflict.oid} 的属性使用，但您指定了不同的 OID ${attr.oid}`,
          detail: '同一属性名称不能映射到不同的 OID。',
        });
      }

      if (oidConflict) {
        if (attr.syntax !== oidConflict.syntax) {
          conflicts.push({
            type: 'syntax_mismatch',
            severity: 'error',
            element: 'attribute',
            elementName: attr.name,
            conflictingWith: oidConflict.name.join(', '),
            message: `属性 "${attr.name}" 的语法 ${attr.syntax} 与已有定义的语法 ${oidConflict.syntax} 不一致`,
            detail: '重新定义已有属性时，语法类型必须与原始定义一致，否则会导致数据不一致。',
          });
        }

        if (attr.singleValue !== oidConflict.singleValue) {
          conflicts.push({
            type: 'single_value_mismatch',
            severity: 'error',
            element: 'attribute',
            elementName: attr.name,
            conflictingWith: oidConflict.name.join(', '),
            message: `属性 "${attr.name}" 的单值/多值设置与已有定义不一致`,
            detail: `新定义: ${attr.singleValue ? '单值' : '多值'}，已有定义: ${oidConflict.singleValue ? '单值' : '多值'}`,
          });
        }

        if (attr.matchingRule && oidConflict.matchingRule) {
          const newRuleName = this.getMatchingRuleName(attr.matchingRule);
          if (newRuleName && newRuleName !== oidConflict.matchingRule) {
            conflicts.push({
              type: 'matching_rule_mismatch',
              severity: 'warning',
              element: 'attribute',
              elementName: attr.name,
              conflictingWith: oidConflict.name.join(', '),
              message: `属性 "${attr.name}" 的匹配规则 (${newRuleName}) 与已有定义的匹配规则 (${oidConflict.matchingRule}) 不一致`,
              detail: '匹配规则不一致可能导致搜索行为改变。建议保持与已有定义一致。',
            });
          }
        }
      }
    }

    const seenNames = new Set<string>();
    const seenOids = new Set<string>();
    for (const attr of attributes) {
      if (!attr.name.trim()) continue;
      const lowerName = attr.name.toLowerCase();
      if (seenNames.has(lowerName)) {
        conflicts.push({
          type: 'name_conflict',
          severity: 'error',
          element: 'attribute',
          elementName: attr.name,
          conflictingWith: attr.name,
          message: `新属性中存在重复的名称 "${attr.name}"`,
          detail: '同一批属性定义中不能有重复的名称。',
        });
      }
      seenNames.add(lowerName);

      if (seenOids.has(attr.oid) && attr.oid.trim()) {
        conflicts.push({
          type: 'oid_conflict',
          severity: 'error',
          element: 'attribute',
          elementName: attr.name,
          conflictingWith: attr.oid,
          message: `新属性中存在重复的 OID ${attr.oid}`,
          detail: '同一批属性定义中不能有重复的 OID。',
        });
      }
      if (attr.oid.trim()) seenOids.add(attr.oid);
    }

    if (objectClassName && objectClassOid) {
      const ocOidConflict = existingOcByOid.get(objectClassOid);
      if (ocOidConflict) {
        const hasNameOverlap = ocOidConflict.name.some(
          (n) => n.toLowerCase() === objectClassName.toLowerCase()
        );
        if (hasNameOverlap) {
          conflicts.push({
            type: 'object_class_oid_conflict',
            severity: 'warning',
            element: 'objectClass',
            elementName: objectClassName,
            conflictingWith: ocOidConflict.name.join(', '),
            message: `ObjectClass "${objectClassName}" 的 OID 与已有定义相同`,
            detail: 'OID 和名称都相同，这通常意味着您正在重新定义已有 ObjectClass。',
          });
        } else {
          conflicts.push({
            type: 'object_class_oid_conflict',
            severity: 'error',
            element: 'objectClass',
            elementName: objectClassName,
            conflictingWith: ocOidConflict.name.join(', '),
            message: `ObjectClass "${objectClassName}" 的 OID ${objectClassOid} 与已有 ObjectClass "${ocOidConflict.name.join(', ')}" 冲突`,
            detail: 'OID 必须全局唯一。两个不同名称的 ObjectClass 不能共享同一个 OID。',
          });
        }
      }

      const ocNameConflict = existingOcByName.get(objectClassName.toLowerCase());
      if (ocNameConflict && ocNameConflict.oid !== objectClassOid) {
        conflicts.push({
          type: 'object_class_name_conflict',
          severity: 'error',
          element: 'objectClass',
          elementName: objectClassName,
          conflictingWith: ocNameConflict.oid,
          message: `ObjectClass 名称 "${objectClassName}" 已被 OID 为 ${ocNameConflict.oid} 的定义使用`,
          detail: 'ObjectClass 名称在 Schema 中必须唯一。',
        });
      }

      for (const attr of attributes) {
        if (!attr.name.trim()) continue;
        const attrInExisting = existingAttrByName.get(attr.name.toLowerCase());
        if (attrInExisting) {
          const isMustInSomeOc = existingObjectClasses.some(
            (oc) => oc.must.includes(attr.name) || oc.must.includes(attrInExisting.name[0])
          );
          if (isMustInSomeOc && !attr.mandatory) {
            conflicts.push({
              type: 'object_class_superior_conflict',
              severity: 'warning',
              element: 'objectClass',
              elementName: objectClassName,
              conflictingWith: attr.name,
              message: `属性 "${attr.name}" 在其他 ObjectClass 中为 MUST 属性，但在您的定义中为 MAY`,
              detail: '建议检查这是否符合预期。属性在不同 ObjectClass 中的 MUST/MAY 设置可能影响数据一致性。',
            });
          }
        }
      }
    }

    const errorCount = conflicts.filter((c) => c.severity === 'error').length;
    const warningCount = conflicts.filter((c) => c.severity === 'warning').length;
    const compatible = errorCount === 0;

    let summary: string;
    if (errorCount === 0 && warningCount === 0) {
      summary = '兼容性检查通过：未发现与现有 Schema 的冲突';
    } else if (errorCount === 0) {
      summary = `兼容性检查通过（有 ${warningCount} 个警告）：存在潜在问题，但不阻止操作`;
    } else {
      summary = `兼容性检查未通过：发现 ${errorCount} 个错误和 ${warningCount} 个警告`;
    }

    return { compatible, conflicts, summary };
  }

  exportSchemaAsLdif(request: ExportSchemaLdifRequest): string {
    const { attributeTypes, objectClasses, format } = request;
    const lines: string[] = [];

    lines.push('# Exported LDAP Schema LDIF');
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push(`# Format: ${format === 'add' ? 'Modify (add)' : 'Full entry'}`);
    lines.push('');

    if (format === 'full') {
      lines.push('dn: cn=schema');
      lines.push('objectClass: olcSchemaConfig');
      lines.push('cn: schema');
      lines.push('');

      for (const at of attributeTypes) {
        lines.push(`attributeTypes: ${this.formatExistingAttributeType(at)}`);
      }

      lines.push('');

      for (const oc of objectClasses) {
        lines.push(`objectClasses: ${this.formatExistingObjectClass(oc)}`);
      }

      lines.push('');
    } else {
      for (const at of attributeTypes) {
        lines.push('dn: cn=schema');
        lines.push('changetype: modify');
        lines.push('add: attributeTypes');
        lines.push(`attributeTypes: ${this.formatExistingAttributeType(at)}`);
        lines.push('-');
        lines.push('');
      }

      for (const oc of objectClasses) {
        lines.push('dn: cn=schema');
        lines.push('changetype: modify');
        lines.push('add: objectClasses');
        lines.push(`objectClasses: ${this.formatExistingObjectClass(oc)}`);
        lines.push('-');
        lines.push('');
      }
    }

    lines.push('# End of Exported Schema');

    return lines.join('\n');
  }

  private formatExistingAttributeType(at: LdapAttributeType): string {
    const parts: string[] = ['(', at.oid];

    if (at.name.length === 1) {
      parts.push(`NAME '${at.name[0]}'`);
    } else if (at.name.length > 1) {
      parts.push(`NAME ( ${at.name.map((n) => `'${n}'`).join(' $ ')} )`);
    }

    if (at.description) {
      parts.push(`DESC '${this.escapeQuotes(at.description)}'`);
    }

    if (at.obsolete) {
      parts.push('OBSOLETE');
    }

    if (at.matchingRule) {
      parts.push(`EQUALITY ${at.matchingRule}`);
    }

    if (at.orderingMatchingRule) {
      parts.push(`ORDERING ${at.orderingMatchingRule}`);
    }

    if (at.substringMatchingRule) {
      parts.push(`SUBSTR ${at.substringMatchingRule}`);
    }

    parts.push(`SYNTAX ${at.syntax}`);

    if (at.singleValue) {
      parts.push('SINGLE-VALUE');
    }

    if (at.collective) {
      parts.push('COLLECTIVE');
    }

    parts.push('USAGE userApplications');
    parts.push(')');

    return parts.join(' ');
  }

  private formatExistingObjectClass(oc: LdapObjectClass): string {
    const parts: string[] = ['(', oc.oid];

    if (oc.name.length === 1) {
      parts.push(`NAME '${oc.name[0]}'`);
    } else if (oc.name.length > 1) {
      parts.push(`NAME ( ${oc.name.map((n) => `'${n}'`).join(' $ ')} )`);
    }

    if (oc.description) {
      parts.push(`DESC '${this.escapeQuotes(oc.description)}'`);
    }

    if (oc.obsolete) {
      parts.push('OBSOLETE');
    }

    if (oc.superior && oc.superior.length > 0) {
      parts.push(`SUP ${oc.superior.length === 1 ? oc.superior[0] : `( ${oc.superior.join(' $ ')} )`}`);
    }

    parts.push(oc.type.toUpperCase());

    if (oc.must.length > 0) {
      if (oc.must.length === 1) {
        parts.push(`MUST ${oc.must[0]}`);
      } else {
        parts.push(`MUST ( ${oc.must.join(' $ ')} )`);
      }
    }

    if (oc.may.length > 0) {
      if (oc.may.length === 1) {
        parts.push(`MAY ${oc.may[0]}`);
      } else {
        parts.push(`MAY ( ${oc.may.join(' $ ')} )`);
      }
    }

    parts.push(')');

    return parts.join(' ');
  }
}
