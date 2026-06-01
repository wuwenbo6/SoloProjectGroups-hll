import coap from 'coap'

interface ObserveTest {
  pathname: string
  description: string
}

const tests: ObserveTest[] = [
  {
    pathname: '/sensors/temperature',
    description: 'All temperature changes (no filter)',
  },
  {
    pathname: '/sensors/temperature?lt=22',
    description: 'Temperature < 22°C (cold alert)',
  },
  {
    pathname: '/sensors/humidity?gt=65',
    description: 'Humidity > 65% (high humidity alert)',
  },
  {
    pathname: '/sensors/temperature?gte=25&lt=28',
    description: 'Temperature 25-28°C (comfort range)',
  },
]

console.log('[CoAP Client] Starting conditional observer tests...')
console.log('='.repeat(60))

for (const test of tests) {
  const req = coap.request({
    hostname: 'localhost',
    port: 5683,
    pathname: test.pathname,
    method: 'GET',
    observe: true,
  })

  req.on('response', (res) => {
    const filterInfo = test.description
    console.log(`[CoAP Client] ✅ Connected: ${test.pathname}`)
    console.log(`[CoAP Client]    Filter: ${filterInfo}`)

    res.on('data', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString())
        const time = new Date().toLocaleTimeString('zh-CN')
        const observeSeq = res.headers['Observe']
        const filterStr = parsed.filter
          ? Object.entries(parsed.filter)
              .map(([k, v]) => `${k}=${v}`)
              .join('&')
          : 'none'

        console.log(
          `[${time}] 📡 ${test.pathname} | ` +
            `Observe: ${String(observeSeq ?? 'N/A').padStart(3)} | ` +
            `Seq: ${String(parsed.sequence ?? 'N/A').padStart(3)} | ` +
            `Value: ${String(parsed.value).padStart(5)} ${parsed.unit} | ` +
            `Filter: ${filterStr}`
        )
      } catch {
        console.error(`[CoAP Client] ❌ Parse error from ${test.pathname}`)
      }
    })
  })

  req.on('error', (err: Error) => {
    console.error(`[CoAP Client] ❌ Error for ${test.pathname}:`, err.message)
  })

  req.end()
  console.log(`[CoAP Client] 👀 Observing ${test.pathname}`)
  console.log(`              📋 ${test.description}`)
}

console.log('='.repeat(60))
console.log('[CoAP Client] Press Ctrl+C to stop')
