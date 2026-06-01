import { hl7Parser } from '../api/hl7/parser.ts'
import { ackGenerator, type AcknowledgmentCode } from '../api/hl7/ackGenerator.ts'
import { fhirConverter } from '../api/fhir/converter.ts'
import { convertHL7ToFHIR } from '../api/hl7/processor.ts'

const testHL7Message = `MSH|^~\\&|LIS|HOSPITAL|HIS|HOSPITAL|20240101120000||ORU^R01|MSG001|P|2.5
PID|1||P001||张三^小明||19850115|M|||北京市\\T\\朝阳区^建国路88号
OBR|1||ORD001|001^血常规|||20240101080000|20240101083000
OBX|1|NM|WBC^白细胞计数||7.5|10^9/L|4.0-10.0||N|F
OBX|2|NM|RBC^红细胞计数||5.2|10^12/L|4.0-5.5||N|F
OBX|3|NM|HGB^血红蛋白||125|g/L|120-160||N|F
OBX|4|NM|PLT^血小板计数||95|10^9/L|100-300|L|F`

function testFHIRPatientConversion() {
  console.log('=== 测试1: HL7 → FHIR Patient 转换 ===')
  try {
    const parsed = hl7Parser.parse(testHL7Message)
    const fhirPatient = fhirConverter.toFHIRPatient(parsed.pid, 1)

    console.log('Patient resource type:', fhirPatient.resourceType)
    console.log('Patient ID:', fhirPatient.id)
    console.log('Patient identifier:', fhirPatient.identifier?.[0]?.value)
    console.log('Patient name:', fhirPatient.name?.[0]?.text)
    console.log('Patient gender:', fhirPatient.gender)
    console.log('Patient birthDate:', fhirPatient.birthDate)
    console.log('Patient address:', fhirPatient.address?.[0]?.text)

    const tests = [
      fhirPatient.resourceType === 'Patient',
      fhirPatient.id === '1',
      fhirPatient.identifier?.[0]?.value === 'P001',
      fhirPatient.name?.[0]?.family === '张三',
      fhirPatient.gender === 'male',
      fhirPatient.birthDate === '1985-01-15'
    ]

    const passed = tests.every(t => t)
    console.log(`FHIR Patient 转换 ${passed ? '✓ 通过' : '✗ 失败'}`)
    return passed
  } catch (err) {
    console.error('FHIR Patient 转换失败:', err)
    return false
  }
}

function testFHIRObservationConversion() {
  console.log('\n=== 测试2: HL7 → FHIR Observation 转换 ===')
  try {
    const parsed = hl7Parser.parse(testHL7Message)

    for (let i = 0; i < parsed.obx.length; i++) {
      const obs = fhirConverter.toFHIRObservation(
        parsed.obx[i],
        parsed.obr,
        parsed.pid,
        1,
        1
      )

      console.log(`\nObservation ${i + 1}:`)
      console.log('  ID:', obs.id)
      console.log('  Status:', obs.status)
      console.log('  Code:', obs.code.text)
      console.log('  Value:', obs.valueQuantity ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit}` : obs.valueString)
      console.log('  Reference Range:', obs.referenceRange?.[0]?.text)

      if (parsed.obx[i].abnormalFlags === 'L') {
        console.log('  Interpretation:', obs.interpretation?.[0]?.text)
        const hasInterpretation = obs.interpretation?.[0]?.text?.includes('Below low normal')
        if (!hasInterpretation) {
          console.log('  ⚠ 异常标记未正确转换')
        }
      }
    }

    const firstObs = fhirConverter.toFHIRObservation(parsed.obx[0], parsed.obr, parsed.pid, 1, 1)
    const passed =
      firstObs.resourceType === 'Observation' &&
      firstObs.status === 'final' &&
      firstObs.code.coding?.[0]?.code === 'WBC' &&
      firstObs.valueQuantity?.value === 7.5 &&
      firstObs.valueQuantity?.unit === '10^9/L'

    console.log(`\nFHIR Observation 转换 ${passed ? '✓ 通过' : '✗ 失败'}`)
    return passed
  } catch (err) {
    console.error('FHIR Observation 转换失败:', err)
    return false
  }
}

function testFHIRBundleConversion() {
  console.log('\n=== 测试3: HL7 → FHIR Bundle 转换 ===')
  try {
    const parsed = hl7Parser.parse(testHL7Message)
    const bundle = fhirConverter.toFHIRBundle(parsed, 1, 1, [1, 2, 3, 4])

    console.log('Bundle type:', bundle.type)
    console.log('Total entries:', bundle.entry?.length)
    console.log('Entry types:', bundle.entry?.map(e => e.resource.resourceType).join(', '))

    const patientEntry = bundle.entry?.find(e => e.resource.resourceType === 'Patient')
    const reportEntry = bundle.entry?.find(e => e.resource.resourceType === 'DiagnosticReport')
    const obsEntries = bundle.entry?.filter(e => e.resource.resourceType === 'Observation')

    console.log('Patient entry:', patientEntry ? '✓ 存在' : '✗ 缺失')
    console.log('DiagnosticReport entry:', reportEntry ? '✓ 存在' : '✗ 缺失')
    console.log('Observation entries:', obsEntries?.length === 4 ? '✓ 4条' : `✗ ${obsEntries?.length || 0}条`)

    const passed =
      bundle.type === 'collection' &&
      bundle.entry?.length === 6 &&
      !!patientEntry && !!reportEntry && obsEntries?.length === 4

    console.log(`FHIR Bundle 转换 ${passed ? '✓ 通过' : '✗ 失败'}`)
    return passed
  } catch (err) {
    console.error('FHIR Bundle 转换失败:', err)
    return false
  }
}

function testACKGeneration() {
  console.log('\n=== 测试4: ACK消息生成（MSA段） ===')

  const mshInfo = ackGenerator.parseMSHForACK(testHL7Message)
  if (!mshInfo) {
    console.log('✗ 无法解析MSH信息')
    return false
  }

  console.log('MSH 信息解析:')
  console.log('  Sending App:', mshInfo.sendingApplication)
  console.log('  Sending Facility:', mshInfo.sendingFacility)
  console.log('  Message Control ID:', mshInfo.messageControlId)
  console.log('  Version:', mshInfo.versionId)

  const tests: Array<{ code: AcknowledgmentCode; name: string }> = [
    { code: 'AA', name: '应用接受 (AA)' },
    { code: 'AE', name: '应用错误 (AE)' },
    { code: 'AR', name: '应用拒绝 (AR)' }
  ]

  const results: boolean[] = []

  for (const test of tests) {
    let ackMsg: string
    switch (test.code) {
      case 'AA':
        ackMsg = ackGenerator.generateAA(mshInfo, mshInfo.messageControlId, 'Test success')
        break
      case 'AE':
        ackMsg = ackGenerator.generateAE(mshInfo, mshInfo.messageControlId, 'Test error', '207')
        break
      case 'AR':
        ackMsg = ackGenerator.generateAR(mshInfo, mshInfo.messageControlId, 'Test reject', '100')
        break
      default:
        continue
    }

    const hasMSH = ackMsg.startsWith('MSH|')
    const hasMSA = ackMsg.includes('\rMSA|')
    const hasCorrectCode = ackMsg.includes(`MSA|${test.code}|`)
    const hasMsgCtrlId = ackMsg.includes(`|${mshInfo.messageControlId}|`)

    const passed = hasMSH && hasMSA && hasCorrectCode && hasMsgCtrlId

    console.log(`\n${test.name}:`)
    console.log('  MSH 段:', hasMSH ? '✓ 存在' : '✗ 缺失')
    console.log('  MSA 段:', hasMSA ? '✓ 存在' : '✗ 缺失')
    console.log('  确认码:', hasCorrectCode ? `✓ ${test.code}` : `✗ 错误`)
    console.log('  消息控制ID:', hasMsgCtrlId ? '✓ 匹配' : '✗ 不匹配')

    console.log('  ACK消息预览:', ackMsg.substring(0, 100).replace(/\r/g, ' ↵ ') + '...')
    results.push(passed)
  }

  const allPassed = results.every(r => r)
  console.log(`\nACK生成 ${allPassed ? '✓ 全部通过' : '✗ 存在失败'}`)
  return allPassed
}

function testMLLPWrapping() {
  console.log('\n=== 测试5: MLLP 协议封装 ===')

  const testMessage = 'MSH|^~\\&|...|...|...|'
  const wrapped = ackGenerator.wrapMLLP(testMessage)
  const unwrapped = ackGenerator.unwrapMLLP(wrapped)

  const hasStart = wrapped[0] === 0x0b
  const hasEnd = wrapped[wrapped.length - 1] === 0x0d && wrapped[wrapped.length - 2] === 0x1c
  const unwrappedCorrect = unwrapped === testMessage

  console.log('MLLP 开始字节 (0x0B):', hasStart ? '✓ 存在' : '✗ 缺失')
  console.log('MLLP 结束字节 (0x1C 0x0D):', hasEnd ? '✓ 存在' : '✗ 缺失')
  console.log('解封装正确:', unwrappedCorrect ? '✓ 正确' : '✗ 错误')

  const passed = hasStart && hasEnd && unwrappedCorrect
  console.log(`MLLP 协议封装 ${passed ? '✓ 通过' : '✗ 失败'}`)
  return passed
}

function testConvertHL7ToFHIRFunction() {
  console.log('\n=== 测试6: convertHL7ToFHIR API ===')

  const result = convertHL7ToFHIR(testHL7Message)

  console.log('Success:', result.success)
  console.log('Has FHIR Patient:', !!result.fhirPatient)
  console.log('Has FHIR Bundle:', !!result.fhirBundle)
  console.log('Bundle entries:', result.fhirBundle?.entry?.length)

  const passed =
    result.success &&
    !!result.fhirPatient &&
    !!result.fhirBundle &&
    result.fhirPatient.resourceType === 'Patient' &&
    result.fhirBundle.type === 'collection'

  console.log(`convertHL7ToFHIR API ${passed ? '✓ 通过' : '✗ 失败'}`)
  return passed
}

function runAllTests() {
  console.log('========================================')
  console.log('  HL7 → FHIR 转换 和 ACK 功能测试')
  console.log('========================================\n')

  const results = [
    testFHIRPatientConversion(),
    testFHIRObservationConversion(),
    testFHIRBundleConversion(),
    testACKGeneration(),
    testMLLPWrapping(),
    testConvertHL7ToFHIRFunction()
  ]

  console.log('\n========================================')
  const passed = results.filter(r => r).length
  const total = results.length
  console.log(`测试结果: ${passed}/${total} 通过`)
  console.log('========================================')

  return passed === total
}

runAllTests()
