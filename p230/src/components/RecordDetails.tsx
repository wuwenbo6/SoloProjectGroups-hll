import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Copy, Check, FileText } from 'lucide-react';
import { DSRecord, DNSKEYRecord, RRSIGRecord, DNSRecord, ChainNode, NSECRecord, NSEC3Record } from '../types';
import { getAlgorithmName, getDigestTypeName } from '../utils/format';

interface RecordDetailsProps {
  chain: ChainNode[];
  targetRecords: DNSRecord[];
}

interface RecordSectionProps {
  title: string;
  records: DSRecord[] | DNSKEYRecord[] | RRSIGRecord[] | NSECRecord[] | NSEC3Record[] | DNSRecord[];
  icon: React.ReactNode;
  defaultOpen?: boolean;
}

function RecordSection({ title, records, icon, defaultOpen = false }: RecordSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const formatRecord = (record: any, index: number) => {
    const fields = [];

    if ('keyTag' in record && 'digest' in record) {
      const ds = record as DSRecord;
      fields.push(
        { label: 'Key Tag', value: ds.keyTag },
        { label: '算法', value: `${ds.algorithm} (${getAlgorithmName(ds.algorithm)})` },
        { label: '摘要类型', value: `${ds.digestType} (${getDigestTypeName(ds.digestType)})` },
        { label: '摘要', value: ds.digest, code: true },
      );
    } else if ('flags' in record && 'publicKey' in record) {
      const dnskey = record as DNSKEYRecord;
      fields.push(
        { label: 'Flags', value: dnskey.flags },
        { label: 'Protocol', value: dnskey.protocol },
        { label: '算法', value: `${dnskey.algorithm} (${getAlgorithmName(dnskey.algorithm)})` },
        { label: 'Key Tag', value: dnskey.keyTag },
        { label: '类型', value: dnskey.isKSK ? 'KSK (密钥签名密钥)' : dnskey.isZSK ? 'ZSK (区域签名密钥)' : '未知' },
        { label: '公钥', value: dnskey.publicKey, code: true },
      );
    } else if ('typeCovered' in record && 'signature' in record) {
      const rrsig = record as RRSIGRecord;
      fields.push(
        { label: '覆盖类型', value: rrsig.typeCovered },
        { label: '算法', value: `${rrsig.algorithm} (${getAlgorithmName(rrsig.algorithm)})` },
        { label: '标签数', value: rrsig.labels },
        { label: '原始TTL', value: rrsig.originalTTL },
        { label: '签名有效期', value: `${new Date(rrsig.signatureInception * 1000).toLocaleString()} - ${new Date(rrsig.signatureExpiration * 1000).toLocaleString()}` },
        { label: 'Key Tag', value: rrsig.keyTag },
        { label: '签名者', value: rrsig.signerName },
        { label: '签名', value: rrsig.signature, code: true },
      );
    } else if ('nextDomain' in record && 'coveredTypes' in record && !('hashAlgorithm' in record)) {
      const nsec = record as NSECRecord;
      fields.push(
        { label: '下一个域名', value: nsec.nextDomain },
        { label: '存在的记录类型', value: nsec.coveredTypes.join(', ') },
        { label: '类型位图', value: nsec.typeBitmaps.join(', '), code: true },
      );
    } else if ('hashAlgorithm' in record && 'nextHashedOwnerName' in record) {
      const nsec3 = record as NSEC3Record;
      fields.push(
        { label: '哈希算法', value: nsec3.hashAlgorithm === 1 ? '1 (SHA-1)' : String(nsec3.hashAlgorithm) },
        { label: '标志', value: nsec3.flags },
        { label: '迭代次数', value: nsec3.iterations },
        { label: 'Salt', value: nsec3.salt || '(空)', code: true },
        { label: '所有者哈希', value: nsec3.hash, code: true },
        { label: '下一个哈希', value: nsec3.nextHashedOwnerName, code: true },
        { label: '存在的记录类型', value: nsec3.coveredTypes.join(', ') },
      );
    } else {
      const dns = record as DNSRecord;
      fields.push(
        { label: '名称', value: dns.name },
        { label: '类型', value: dns.type },
        { label: 'TTL', value: dns.ttl },
        { label: '数据', value: dns.data, code: true },
      );
    }

    return fields;
  };

  if (records.length === 0) {
    return null;
  }

  return (
    <div className="border border-slate-700/50 rounded-xl overflow-hidden bg-slate-800/30 backdrop-blur-xl">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-400">{icon}</span>
          <span className="font-semibold text-white">{title}</span>
          <span className="px-2 py-0.5 bg-slate-700/50 rounded-full text-xs text-slate-400">
            {records.length} 条
          </span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-4">
              {records.map((record, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30 relative group"
                >
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(record, null, 2), index)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="复制原始数据"
                  >
                    {copiedIndex === index ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  <div className="grid gap-2">
                    {formatRecord(record, index).map((field, fieldIndex) => (
                      <div key={fieldIndex} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                        <span className="text-xs text-slate-500 w-24 shrink-0 mt-0.5">
                          {field.label}
                        </span>
                        {field.code ? (
                          <code className="text-xs text-emerald-400 font-mono break-all bg-slate-800/80 px-2 py-1 rounded flex-1">
                            {field.value}
                          </code>
                        ) : (
                          <span className="text-sm text-slate-300 break-all">{field.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RecordDetails({ chain, targetRecords }: RecordDetailsProps) {
  const dsNode = chain.find(n => n.id === 'ds');
  const dnskeyNode = chain.find(n => n.id === 'dnskey');
  const rrsigNode = chain.find(n => n.id === 'rrsig');
  const nsecNode = chain.find(n => n.id === 'nsec');
  const nsec3Node = chain.find(n => n.id === 'nsec3');

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="w-full max-w-4xl mx-auto space-y-4"
    >
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5 text-purple-400" />
        记录详情
      </h3>

      <RecordSection
        title="目标记录"
        records={targetRecords}
        icon={<FileText className="w-4 h-4" />}
        defaultOpen
      />

      {dsNode && (
        <RecordSection
          title="DS 记录"
          records={dsNode.records}
          icon={<FileText className="w-4 h-4" />}
        />
      )}

      {dnskeyNode && (
        <RecordSection
          title="DNSKEY 记录"
          records={dnskeyNode.records}
          icon={<FileText className="w-4 h-4" />}
        />
      )}

      {nsecNode && nsecNode.records.length > 0 && (
        <RecordSection
          title="NSEC 负响应证明"
          records={nsecNode.records}
          icon={<FileText className="w-4 h-4" />}
        />
      )}

      {nsec3Node && nsec3Node.records.length > 0 && (
        <RecordSection
          title="NSEC3 负响应证明"
          records={nsec3Node.records}
          icon={<FileText className="w-4 h-4" />}
        />
      )}

      {rrsigNode && rrsigNode.records.length > 0 && (
        <RecordSection
          title="RRSIG 签名记录"
          records={rrsigNode.records}
          icon={<FileText className="w-4 h-4" />}
        />
      )}
    </motion.div>
  );
}
