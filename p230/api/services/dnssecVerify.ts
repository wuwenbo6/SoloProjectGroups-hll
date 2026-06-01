import {
  VerifyRequest,
  VerifyResponse,
  VerificationStep,
  ChainNode,
  DSRecord,
  DNSKEYRecord,
  RRSIGRecord,
  DNSRecord,
  RecordType,
  VerificationStatus,
  NSECRecord,
  NSEC3Record,
  TimelineEntry,
} from '../../shared/types';
import { queryRecords, queryDNSKEY, queryDS } from './dnsQuery';
import { verifyRRSIG, verifyNSEC, verifyNSEC3 } from './signatureVerify';
import { calculateDSDigest, getAlgorithmName, getDigestTypeName } from '../utils/dnsUtils';
import { getAnchorById, anchorToDSRecord, getAnchorsForDomain } from './trustAnchors';

interface VerificationContext {
  domain: string;
  recordType: RecordType;
  targetRecords: DNSRecord[];
  targetRRSIG?: RRSIGRecord;
  dnskeyRecords: DNSKEYRecord[];
  dnskeyRRSIG?: RRSIGRecord;
  dsRecords: DSRecord[];
  nsecRecords: NSECRecord[];
  nsec3Records: NSEC3Record[];
  nsecRRSIG?: RRSIGRecord;
  isNegativeResponse: boolean;
  steps: VerificationStep[];
  timeline: TimelineEntry[];
  usedTrustAnchor?: string;
}

export async function performDNSSECVerification(request: VerifyRequest): Promise<VerifyResponse> {
  const startTime = Date.now();
  const context: VerificationContext = {
    domain: request.domain,
    recordType: request.recordType,
    targetRecords: [],
    dnskeyRecords: [],
    dsRecords: [],
    nsecRecords: [],
    nsec3Records: [],
    isNegativeResponse: false,
    steps: [],
    timeline: [],
  };

  let overallStatus: VerificationStatus = 'pending';
  let errorMessage: string | undefined;
  const zone = getParentZone(request.domain);

  try {
    addStep(context, '查询目标记录', 'pending', `正在查询 ${request.domain} 的 ${request.recordType} 记录...`);
    const t0 = Date.now();

    const targetResult = await queryRecords(request.domain, request.recordType);
    context.targetRecords = targetResult.records;
    context.targetRRSIG = targetResult.rrsig;
    context.nsecRecords = targetResult.nsec || [];
    context.nsec3Records = targetResult.nsec3 || [];
    context.nsecRRSIG = targetResult.nsecRRSIG;

    recordTimeline(context, '查询目标记录', t0, 'pending');

    const hasNSEC = context.nsecRecords.length > 0;
    const hasNSEC3 = context.nsec3Records.length > 0;

    if (context.targetRecords.length === 0) {
      if (hasNSEC || hasNSEC3) {
        context.isNegativeResponse = true;
        addStep(context, '查询目标记录', 'passed', `未找到 ${request.recordType} 记录，但发现 NSEC${hasNSEC3 ? '3' : ''} 负响应证明`);
        updateTimeline(context, '查询目标记录', 'passed');
      } else {
        addStep(context, '查询目标记录', 'failed', `未找到 ${request.domain} 的 ${request.recordType} 记录，且没有 NSEC/NSEC3 负响应证明`);
        updateTimeline(context, '查询目标记录', 'failed');
        overallStatus = 'unsigned';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }
    } else if (hasNSEC || hasNSEC3) {
      addStep(context, '查询目标记录', 'passed', `找到 ${context.targetRecords.length} 条 ${request.recordType} 记录，同时包含 NSEC${hasNSEC3 ? '3' : ''} 记录`);
      updateTimeline(context, '查询目标记录', 'passed');
    } else if (!context.targetRRSIG) {
      addStep(context, '查询目标记录', 'passed', `找到 ${context.targetRecords.length} 条 ${request.recordType} 记录`);
      addStep(context, '检查RRSIG签名', 'failed', '该域名的记录没有RRSIG签名，未启用DNSSEC');
      updateTimeline(context, '查询目标记录', 'passed');
      overallStatus = 'unsigned';
      return buildResponse(context, startTime, overallStatus, errorMessage);
    } else {
      addStep(context, '查询目标记录', 'passed', `找到 ${context.targetRecords.length} 条 ${request.recordType} 记录和对应的RRSIG签名`);
      updateTimeline(context, '查询目标记录', 'passed');
    }

    addStep(context, '查询DNSKEY记录', 'pending', '正在查询DNSKEY记录...');
    const t1 = Date.now();

    const dnskeyResult = await queryDNSKEY(zone);
    context.dnskeyRecords = dnskeyResult.records;
    context.dnskeyRRSIG = dnskeyResult.rrsig;

    recordTimeline(context, '查询DNSKEY记录', t1, 'pending');

    if (context.dnskeyRecords.length === 0) {
      addStep(context, '查询DNSKEY记录', 'failed', `未找到 ${zone} 的DNSKEY记录`);
      updateTimeline(context, '查询DNSKEY记录', 'failed');
      overallStatus = 'failed';
      return buildResponse(context, startTime, overallStatus, errorMessage);
    }

    addStep(context, '查询DNSKEY记录', 'passed', `找到 ${context.dnskeyRecords.length} 条 ${zone} 的DNSKEY记录`);
    updateTimeline(context, '查询DNSKEY记录', 'passed');

    let usedTrustAnchor = false;

    if (request.trustAnchorId) {
      const anchor = getAnchorById(request.trustAnchorId);
      if (anchor) {
        context.dsRecords = [anchorToDSRecord(anchor)];
        context.usedTrustAnchor = anchor.description || anchor.id;
        addStep(context, '查询DS记录', 'passed', `使用指定信任锚: ${context.usedTrustAnchor}`);
        recordTimeline(context, '查询DS记录', Date.now(), 'passed');
        usedTrustAnchor = true;
      }
    }

    if (!usedTrustAnchor) {
      const autoAnchors = getAnchorsForDomain(zone);
      if (autoAnchors.length > 0 && autoAnchors.some(a => a.domain === zone)) {
        context.dsRecords = autoAnchors.filter(a => a.domain === zone).map(anchorToDSRecord);
        context.usedTrustAnchor = autoAnchors.filter(a => a.domain === zone).map(a => a.description || a.id).join(', ');
        addStep(context, '查询DS记录', 'passed', `使用信任锚: ${context.usedTrustAnchor}`);
        recordTimeline(context, '查询DS记录', Date.now(), 'passed');
        usedTrustAnchor = true;
      }
    }

    if (!usedTrustAnchor) {
      addStep(context, '查询DS记录', 'pending', '正在查询父域的DS记录...');
      const t2 = Date.now();

      context.dsRecords = await queryDS(zone);

      recordTimeline(context, '查询DS记录', t2, 'pending');

      if (context.dsRecords.length === 0) {
        addStep(context, '查询DS记录', 'failed', `父域中未找到 ${zone} 的DS记录，无法建立信任链`);
        updateTimeline(context, '查询DS记录', 'failed');
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      addStep(context, '查询DS记录', 'passed', `找到 ${context.dsRecords.length} 条 ${zone} 的DS记录`);
      updateTimeline(context, '查询DS记录', 'passed');
    }

    addStep(context, '验证DS记录哈希', 'pending', '正在验证DS记录与DNSKEY的匹配...');
    const t3 = Date.now();

    const dsMatch = verifyDSMatch(context.dsRecords, context.dnskeyRecords, zone);

    recordTimeline(context, '验证DS记录哈希', t3, dsMatch.valid ? 'passed' : 'failed');

    if (!dsMatch.valid) {
      addStep(context, '验证DS记录哈希', 'failed', dsMatch.reason || 'DS记录验证失败', dsMatch.details);
      overallStatus = 'failed';
      return buildResponse(context, startTime, overallStatus, errorMessage);
    }

    addStep(context, '验证DS记录哈希', 'passed', `DS记录验证通过，使用 ${getDigestTypeName(dsMatch.digestType!)} 摘要`);

    addStep(context, '验证DNSKEY签名', 'pending', '正在验证DNSKEY记录的RRSIG签名...');
    const t4 = Date.now();

    if (!context.dnskeyRRSIG) {
      addStep(context, '验证DNSKEY签名', 'failed', 'DNSKEY记录缺少RRSIG签名');
      recordTimeline(context, '验证DNSKEY签名', t4, 'failed');
      overallStatus = 'failed';
      return buildResponse(context, startTime, overallStatus, errorMessage);
    }

    const kskKey = context.dnskeyRecords.find(k => k.isKSK && k.keyTag === context.dnskeyRRSIG!.keyTag);

    if (!kskKey) {
      addStep(context, '验证DNSKEY签名', 'failed', `未找到匹配KeyTag ${context.dnskeyRRSIG.keyTag} 的KSK密钥`);
      recordTimeline(context, '验证DNSKEY签名', t4, 'failed');
      overallStatus = 'failed';
      return buildResponse(context, startTime, overallStatus, errorMessage);
    }

    const dnskeyVerifyResult = verifyRRSIG(context.dnskeyRRSIG, context.dnskeyRecords, kskKey);

    recordTimeline(context, '验证DNSKEY签名', t4, dnskeyVerifyResult.valid ? 'passed' : 'failed');

    if (!dnskeyVerifyResult.valid) {
      addStep(context, '验证DNSKEY签名', 'failed', dnskeyVerifyResult.reason || 'DNSKEY签名验证失败', dnskeyVerifyResult.details);
      overallStatus = 'failed';
      return buildResponse(context, startTime, overallStatus, errorMessage);
    }

    addStep(context, '验证DNSKEY签名', 'passed', `DNSKEY签名验证通过，使用 ${getAlgorithmName(context.dnskeyRRSIG.algorithm)} 算法`);

    if (context.isNegativeResponse) {
      const useNSEC3 = context.nsec3Records.length > 0;
      const nsecType = useNSEC3 ? 'NSEC3' : 'NSEC';

      addStep(context, `验证${nsecType}负响应`, 'pending', `正在验证${nsecType}负响应证明...`);
      const t5 = Date.now();

      const nsecRecords = useNSEC3 ? context.nsec3Records : context.nsecRecords;
      const nsecRRSIG = context.nsecRRSIG;

      if (!nsecRRSIG) {
        addStep(context, `验证${nsecType}负响应`, 'failed', `${nsecType}记录缺少RRSIG签名`);
        recordTimeline(context, `验证${nsecType}负响应`, t5, 'failed');
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      const zskKey = context.dnskeyRecords.find(k => k.isZSK && k.keyTag === nsecRRSIG.keyTag);

      if (!zskKey) {
        addStep(context, `验证${nsecType}负响应`, 'failed', `未找到匹配KeyTag ${nsecRRSIG.keyTag} 的ZSK密钥`);
        recordTimeline(context, `验证${nsecType}负响应`, t5, 'failed');
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      const nsecSigResult = verifyRRSIG(nsecRRSIG, nsecRecords, zskKey);

      if (!nsecSigResult.valid) {
        addStep(context, `验证${nsecType}负响应`, 'failed', `${nsecType}签名验证失败`, nsecSigResult.details);
        recordTimeline(context, `验证${nsecType}签名`, t5, 'failed');
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      addStep(context, `验证${nsecType}签名`, 'passed', `${nsecType}签名验证通过，使用 ${getAlgorithmName(nsecRRSIG.algorithm)} 算法`);
      recordTimeline(context, `验证${nsecType}签名`, t5, 'passed');

      addStep(context, `验证${nsecType}范围证明`, 'pending', `正在验证${nsecType}范围和类型覆盖...`);
      const t6 = Date.now();

      let nsecProofResult;

      if (useNSEC3) {
        nsecProofResult = verifyNSEC3(context.nsec3Records[0], context.domain, context.recordType, zone);
      } else {
        nsecProofResult = verifyNSEC(context.nsecRecords[0], context.domain, context.recordType, zone);
      }

      recordTimeline(context, `验证${nsecType}范围证明`, t6, nsecProofResult.valid ? 'passed' : 'failed');

      if (!nsecProofResult.valid) {
        addStep(context, `验证${nsecType}范围证明`, 'failed', nsecProofResult.reason || `${nsecType}范围验证失败`, nsecProofResult.details);
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      if (nsecProofResult.nameExists && nsecProofResult.typeExists) {
        addStep(context, `验证${nsecType}范围证明`, 'failed', `${nsecType}证明表明该域名和记录类型应该存在，但实际响应中没有记录`);
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      const existenceType = nsecProofResult.nameExists ? '域名存在但记录类型不存在' : '域名不存在';
      const coveredTypes = nsecProofResult.coveredTypes?.join(', ') || '无';

      addStep(context, `验证${nsecType}范围证明`, 'passed', `${nsecType}证明有效：${existenceType}。存在的记录类型：${coveredTypes}`);

      overallStatus = 'passed';
    } else {
      addStep(context, '验证目标记录签名', 'pending', '正在验证目标记录的RRSIG签名...');
      const t7 = Date.now();

      const zskKey = context.dnskeyRecords.find(k => k.isZSK && k.keyTag === context.targetRRSIG!.keyTag);

      if (!zskKey) {
        addStep(context, '验证目标记录签名', 'failed', `未找到匹配KeyTag ${context.targetRRSIG.keyTag} 的ZSK密钥`);
        recordTimeline(context, '验证目标记录签名', t7, 'failed');
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      const targetVerifyResult = verifyRRSIG(context.targetRRSIG!, context.targetRecords, zskKey);

      recordTimeline(context, '验证目标记录签名', t7, targetVerifyResult.valid ? 'passed' : 'failed');

      if (!targetVerifyResult.valid) {
        addStep(context, '验证目标记录签名', 'failed', targetVerifyResult.reason || '目标记录签名验证失败', targetVerifyResult.details);
        overallStatus = 'failed';
        return buildResponse(context, startTime, overallStatus, errorMessage);
      }

      addStep(context, '验证目标记录签名', 'passed', `目标记录签名验证通过，使用 ${getAlgorithmName(context.targetRRSIG.algorithm)} 算法`);

      overallStatus = 'passed';
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    addStep(context, '验证过程出错', 'failed', errorMessage);
    overallStatus = 'failed';
  }

  return buildResponse(context, startTime, overallStatus, errorMessage);
}

function recordTimeline(
  context: VerificationContext,
  step: string,
  startMs: number,
  status: 'passed' | 'failed' | 'pending'
) {
  const existing = context.timeline.find(t => t.step === step);
  const entry: TimelineEntry = {
    step,
    startMs: startMs - (context.timeline.length > 0 ? context.timeline[0].startMs : startMs),
    durationMs: Date.now() - startMs,
    status,
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    context.timeline.push(entry);
  }
}

function updateTimeline(
  context: VerificationContext,
  step: string,
  status: 'passed' | 'failed' | 'pending'
) {
  const existing = context.timeline.find(t => t.step === step);
  if (existing) {
    existing.status = status;
  }
}

function addStep(
  context: VerificationContext,
  name: string,
  status: 'passed' | 'failed' | 'pending',
  message: string,
  details?: string
) {
  const existingIndex = context.steps.findIndex(s => s.name === name);
  const step: VerificationStep = { name, status, message, details };
  if (existingIndex >= 0) {
    const prevStep = context.steps[existingIndex];
    step.durationMs = prevStep.durationMs;
    context.steps[existingIndex] = step;
  } else {
    context.steps.push(step);
  }
}

function verifyDSMatch(
  dsRecords: DSRecord[],
  dnskeyRecords: DNSKEYRecord[],
  domain: string
): { valid: boolean; reason?: string; details?: string; digestType?: number } {
  for (const ds of dsRecords) {
    for (const dnskey of dnskeyRecords) {
      if (dnskey.keyTag !== ds.keyTag || dnskey.algorithm !== ds.algorithm) {
        continue;
      }

      try {
        const computedDigest = calculateDSDigest(
          domain,
          dnskey.flags,
          dnskey.protocol,
          dnskey.algorithm,
          Buffer.from(dnskey.publicKey, 'base64'),
          ds.digestType
        );

        if (computedDigest === ds.digest) {
          return { valid: true, digestType: ds.digestType };
        }
      } catch (e) {
        continue;
      }
    }
  }

  return {
    valid: false,
    reason: '没有DS记录与DNSKEY记录匹配',
    details: `DS记录中的KeyTag和摘要与任何DNSKEY记录都不匹配`,
  };
}

function buildResponse(
  context: VerificationContext,
  startTime: number,
  overallStatus: VerificationStatus,
  error?: string
): VerifyResponse {
  const chain: ChainNode[] = [
    {
      id: 'ds',
      name: context.usedTrustAnchor ? '信任锚 (DS)' : 'DS 记录',
      status: getChainStatus(context.steps, context.usedTrustAnchor ? '查询DS记录' : '验证DS记录哈希', overallStatus),
      records: context.dsRecords,
    },
    {
      id: 'dnskey',
      name: 'DNSKEY 记录',
      status: getChainStatus(context.steps, '验证DNSKEY签名', overallStatus),
      records: context.dnskeyRecords,
    },
  ];

  if (context.isNegativeResponse) {
    const useNSEC3 = context.nsec3Records.length > 0;
    const nsecType = useNSEC3 ? 'nsec3' : 'nsec';
    const nsecName = useNSEC3 ? 'NSEC3 负响应证明' : 'NSEC 负响应证明';
    const nsecSigStepName = useNSEC3 ? '验证NSEC3签名' : '验证NSEC签名';

    chain.push({
      id: nsecType,
      name: nsecName,
      status: getChainStatus(context.steps, nsecSigStepName, overallStatus),
      records: useNSEC3 ? context.nsec3Records : context.nsecRecords,
    });

    chain.push({
      id: 'rrsig',
      name: 'RRSIG 签名',
      status: getChainStatus(context.steps, nsecSigStepName, overallStatus),
      records: context.nsecRRSIG ? [context.nsecRRSIG] : [],
    });
  } else {
    chain.push({
      id: 'rrsig',
      name: 'RRSIG 签名',
      status: getChainStatus(context.steps, '验证目标记录签名', overallStatus),
      records: context.targetRRSIG ? [context.targetRRSIG] : [],
    });
  }

  const stepsWithDuration = context.steps.map((step, index) => {
    const timelineEntry = context.timeline.find(t => t.step === step.name);
    return {
      ...step,
      durationMs: timelineEntry?.durationMs,
    };
  });

  return {
    success: overallStatus === 'passed',
    domain: context.domain,
    recordType: context.recordType,
    overallStatus,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    chain,
    steps: stepsWithDuration,
    timeline: context.timeline,
    targetRecords: context.targetRecords,
    error,
  };
}

function getChainStatus(
  steps: VerificationStep[],
  stepName: string,
  overallStatus: VerificationStatus
): 'passed' | 'failed' | 'pending' {
  if (overallStatus === 'unsigned') return 'failed';
  const step = steps.find(s => s.name.startsWith(stepName));
  if (!step) return 'pending';
  return step.status as 'passed' | 'failed' | 'pending';
}

export function getParentZone(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) {
    return domain;
  }
  return parts.slice(1).join('.');
}
