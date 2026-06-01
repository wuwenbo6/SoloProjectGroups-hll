import { hl7Parser } from '../api/hl7/parser.ts'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function testEscapeSequences() {
  console.log('=== 测试1: HL7转义序列解码 ===')

  const messageWithEscapes = `MSH|^~\\&|LIS|HOSPITAL|HIS|HOSPITAL|20240101120000||ORU^R01|MSG001|P|2.5\rPID|1||P001||Test\\F\\Name^First||19850115|M|||Street\\T\\City\\S\\State\rOBX|1|ST|NOTE^备注||包含\\E\\转义字符的结果|||N|F`

  try {
    const parsed = hl7Parser.parse(messageWithEscapes)
    console.log('患者姓名:', parsed.pid.patientName)
    console.log('地址:', parsed.pid.patientAddress)
    console.log('OBX值:', parsed.obx[0]?.observationValue)

    const namePassed = parsed.pid.patientName.includes('|')
    const addrPassed = parsed.pid.patientAddress.includes('&') && parsed.pid.patientAddress.includes('^')
    const obxPassed = parsed.obx[0]?.observationValue.includes('\\')

    console.log(`\\F\\ 解码 ${namePassed ? '✓' : '✗'}`)
    console.log(`\\T\\ 和 \\S\\ 解码 ${addrPassed ? '✓' : '✗'}`)
    console.log(`\\E\\ 解码 ${obxPassed ? '✓' : '✗'}`)

    return namePassed && addrPassed && obxPassed
  } catch (err) {
    console.error('解析失败:', err)
    return false
  }
}

function testMSH9Default() {
  console.log('\n=== 测试2: MSH-9缺失时默认ORU^R01 ===')

  const messageWithoutMSH9 = `MSH|^~\\&|LIS|HOSPITAL|HIS|HOSPITAL|20240101120000||||MSG001|P|2.5\rPID|1||P001||Test^User||19850115|M\rOBR|1||ORD001|001^Test|||20240101\rOBX|1|NM|WBC^WBC||5.0|10^9/L|4.0-10.0||N|F`

  try {
    const parsed = hl7Parser.parse(messageWithoutMSH9)
    console.log('MSH消息类型:', parsed.msh.messageType)
    const passed = parsed.msh.messageType === 'ORU^R01'
    console.log(`MSH-9默认值 ${passed ? '✓' : '✗'}`)
    return passed
  } catch (err) {
    console.error('解析失败:', err)
    return false
  }
}

function testNormalMSH9() {
  console.log('\n=== 测试3: 正常MSH-9值保持不变 ===')

  const messageWithMSH9 = `MSH|^~\\&|LIS|HOSPITAL|HIS|HOSPITAL|20240101120000||ADT^A01|MSG001|P|2.5\rPID|1||P001||Test^User||19850115|M`

  try {
    const parsed = hl7Parser.parse(messageWithMSH9)
    console.log('MSH消息类型:', parsed.msh.messageType)
    const passed = parsed.msh.messageType === 'ADT'
    console.log(`正常MSH-9值保持 ${passed ? '✓' : '✗'}`)
    return passed
  } catch (err) {
    console.error('解析失败:', err)
    return false
  }
}

function testSampleFile() {
  console.log('\n=== 测试4: 解析带转义序列的测试文件 ===')

  const samplePath = path.join(__dirname, '../samples/test_escape.hl7')
  const content = fs.readFileSync(samplePath, 'utf-8')

  try {
    const parsed = hl7Parser.parse(content)
    console.log('患者姓名:', parsed.pid.patientName)
    console.log('地址:', parsed.pid.patientAddress)
    console.log('MSH消息类型:', parsed.msh.messageType)

    const namePassed = parsed.pid.patientName === '赵^六'
    const addrPassed = parsed.pid.patientAddress === '北京市&朝阳区|建国路88号'
    const msh9Passed = parsed.msh.messageType === 'ORU^R01'

    console.log(`姓名解析 ${namePassed ? '✓' : '✗'}: ${parsed.pid.patientName}`)
    console.log(`地址解析 ${addrPassed ? '✓' : '✗'}: ${parsed.pid.patientAddress}`)
    console.log(`MSH-9默认值 ${msh9Passed ? '✓' : '✗'}: ${parsed.msh.messageType}`)

    return namePassed && addrPassed && msh9Passed
  } catch (err) {
    console.error('解析失败:', err)
    return false
  }
}

function runAllTests() {
  console.log('========================================')
  console.log('  HL7解析器功能测试')
  console.log('========================================\n')

  const results = [
    testEscapeSequences(),
    testMSH9Default(),
    testNormalMSH9(),
    testSampleFile()
  ]

  console.log('\n========================================')
  const passed = results.filter(r => r).length
  const total = results.length
  console.log(`测试结果: ${passed}/${total} 通过`)
  console.log('========================================')

  return passed === total
}

runAllTests()
