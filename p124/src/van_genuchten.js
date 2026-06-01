const math = require('mathjs')

function vanGenuchten(h, thetaR, thetaS, alpha, n) {
  const m = 1 - 1 / n
  const absAlphaH = Math.abs(alpha * h)
  const denominator = Math.pow(1 + Math.pow(absAlphaH, n), m)
  return thetaR + (thetaS - thetaR) / denominator
}

function vanGenuchtenVector(hValues, params) {
  const [thetaR, thetaS, alpha, n] = params
  return hValues.map(h => vanGenuchten(h, thetaR, thetaS, alpha, n))
}

function calculateResiduals(hValues, thetaObserved, params) {
  const thetaPredicted = vanGenuchtenVector(hValues, params)
  return thetaObserved.map((obs, i) => obs - thetaPredicted[i])
}

function calculateSSR(residuals) {
  return residuals.reduce((sum, r) => sum + r * r, 0)
}

function calculateRMSE(residuals) {
  const ssr = calculateSSR(residuals)
  return Math.sqrt(ssr / residuals.length)
}

function calculateR2(thetaObserved, thetaPredicted) {
  const meanObs = thetaObserved.reduce((sum, v) => sum + v, 0) / thetaObserved.length
  const ssTot = thetaObserved.reduce((sum, v) => sum + (v - meanObs) ** 2, 0)
  const ssRes = thetaObserved.reduce((sum, v, i) => sum + (v - thetaPredicted[i]) ** 2, 0)
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot
}

function numericalJacobian(hValues, params, epsilon = 1e-8) {
  const n = hValues.length
  const p = params.length
  const jacobian = math.zeros(n, p)

  for (let j = 0; j < p; j++) {
    const paramsPlus = [...params]
    const paramsMinus = [...params]
    const eps = Math.max(Math.abs(params[j]) * epsilon, epsilon)
    paramsPlus[j] += eps
    paramsMinus[j] -= eps

    const fPlus = vanGenuchtenVector(hValues, paramsPlus)
    const fMinus = vanGenuchtenVector(hValues, paramsMinus)

    for (let i = 0; i < n; i++) {
      jacobian.set([i, j], (fPlus[i] - fMinus[i]) / (2 * eps))
    }
  }

  return jacobian
}

function clampParams(params, bounds) {
  return params.map((p, i) => {
    const [min, max] = bounds[i]
    return Math.max(min, Math.min(max, p))
  })
}

function levenbergMarquardt(hValues, thetaObserved, initialParams, options = {}) {
  const {
    maxIterations = 2000,
    tolerance = 1e-12,
    initialLambda = 0.01,
    lambdaUp = 10,
    lambdaDown = 0.5,
    bounds = [
      [0, 0.5],
      [0.1, 0.8],
      [0.0001, 1],
      [1.01, 10]
    ]
  } = options

  let params = clampParams([...initialParams], bounds)
  let lambda = initialLambda
  let residuals = calculateResiduals(hValues, thetaObserved, params)
  let bestSSR = calculateSSR(residuals)
  let noImprovementCount = 0

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const jacobian = numericalJacobian(hValues, params)
    const jTJ = math.multiply(math.transpose(jacobian), jacobian)
    const jTR = math.multiply(math.transpose(jacobian), residuals)

    const eye = math.eye(params.length)
    const scaledEye = math.multiply(lambda, eye)
    const lhs = math.add(jTJ, scaledEye)

    let delta
    try {
      delta = math.lusolve(lhs, jTR)
    } catch (err) {
      lambda *= lambdaUp
      continue
    }

    const deltaArray = delta.toArray().flat()
    let newParams = params.map((p, i) => p + deltaArray[i])
    newParams = clampParams(newParams, bounds)

    if (newParams[1] <= newParams[0]) {
      newParams[1] = Math.min(newParams[0] + 0.01, 0.8)
    }

    const newResiduals = calculateResiduals(hValues, thetaObserved, newParams)
    const newSSR = calculateSSR(newResiduals)

    if (newSSR < bestSSR * 0.999999) {
      const improvement = bestSSR - newSSR
      params = newParams
      residuals = newResiduals
      bestSSR = newSSR
      lambda *= lambdaDown
      noImprovementCount = 0

      if (improvement < tolerance) {
        break
      }
    } else {
      lambda *= lambdaUp
      noImprovementCount++
      if (noImprovementCount > 50) {
        break
      }
    }

    if (lambda > 1e15) {
      break
    }
  }

  return { params, ssr: bestSSR }
}

function estimateInitialParamsMethod1(hValues, thetaObserved) {
  const sortedData = hValues.map((h, i) => ({ h, theta: thetaObserved[i] }))
    .sort((a, b) => a.h - b.h)

  const thetaS = Math.max(...thetaObserved)
  const thetaR = Math.min(...thetaObserved)

  const thetaMid = (thetaS + thetaR) / 2
  let hMid = 100

  for (let i = 0; i < sortedData.length - 1; i++) {
    if ((sortedData[i].theta - thetaMid) * (sortedData[i + 1].theta - thetaMid) <= 0) {
      const fraction = (thetaMid - sortedData[i].theta) / (sortedData[i + 1].theta - sortedData[i].theta)
      hMid = sortedData[i].h + fraction * (sortedData[i + 1].h - sortedData[i].h)
      break
    }
  }

  const alpha = 1 / Math.max(Math.abs(hMid), 1)

  const h10 = Math.max(...hValues) * 0.1
  let thetaAtH10 = thetaR
  for (let i = 0; i < sortedData.length - 1; i++) {
    if ((sortedData[i].h - h10) * (sortedData[i + 1].h - h10) <= 0) {
      const fraction = (h10 - sortedData[i].h) / (sortedData[i + 1].h - sortedData[i].h)
      thetaAtH10 = sortedData[i].theta + fraction * (sortedData[i + 1].theta - sortedData[i].theta)
      break
    }
  }

  const normalizedTheta = (thetaAtH10 - thetaR) / Math.max(thetaS - thetaR, 0.001)
  const effectiveValue = Math.max(1 - normalizedTheta, 0.01)
  const n = Math.max(1.1, Math.log(1 / effectiveValue - 1) / Math.log(alpha * h10))

  return [thetaR, thetaS, alpha, n]
}

function estimateInitialParamsMethod2(hValues, thetaObserved) {
  const sortedData = hValues.map((h, i) => ({ h: Math.log10(h), theta: thetaObserved[i] }))
    .sort((a, b) => a.h - b.h)

  const thetaS = Math.max(...thetaObserved) * 1.02
  const thetaR = Math.min(...thetaObserved) * 0.98

  const midIndex = Math.floor(sortedData.length / 2)
  const hMid = Math.pow(10, sortedData[midIndex].h)
  const alpha = 1 / hMid

  const logH90 = sortedData[Math.floor(sortedData.length * 0.9)].h
  const theta90 = sortedData[Math.floor(sortedData.length * 0.9)].theta
  const normalized90 = Math.max((thetaS - theta90) / (thetaS - thetaR), 0.01)
  const n90 = Math.log(1 / Math.pow(normalized90, 1 / (1 - 1 / 2)) - 1) / (logH90 + Math.log10(alpha))

  const n = Math.max(1.05, Math.min(n90, 8))

  return [thetaR, thetaS, alpha, n]
}

function estimateInitialParamsMethod3(hValues, thetaObserved) {
  const thetaS = Math.max(...thetaObserved)
  const thetaR = Math.max(0, Math.min(...thetaObserved) * 0.9)

  const hRange = Math.max(...hValues) - Math.min(...hValues)
  const alphaCandidates = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]
  const nCandidates = [1.2, 1.5, 2, 2.5, 3, 4, 5]

  let bestSSR = Infinity
  let bestParams = [thetaR, thetaS, 0.02, 2]

  for (const alpha of alphaCandidates) {
    for (const n of nCandidates) {
      const params = [thetaR, thetaS, alpha, n]
      const residuals = calculateResiduals(hValues, thetaObserved, params)
      const ssr = calculateSSR(residuals)
      if (ssr < bestSSR) {
        bestSSR = ssr
        bestParams = [...params]
      }
    }
  }

  return bestParams
}

function generateInitialGuesses(hValues, thetaObserved) {
  const guesses = []

  try {
    guesses.push(estimateInitialParamsMethod1(hValues, thetaObserved))
  } catch (e) {}

  try {
    guesses.push(estimateInitialParamsMethod2(hValues, thetaObserved))
  } catch (e) {}

  try {
    guesses.push(estimateInitialParamsMethod3(hValues, thetaObserved))
  } catch (e) {}

  const thetaS = Math.max(...thetaObserved)
  const thetaR = Math.min(...thetaObserved)

  const additionalGuesses = [
    [Math.max(0, thetaR * 0.8), Math.min(thetaS * 1.1, 0.8), 0.005, 1.5],
    [thetaR, thetaS, 0.01, 2],
    [thetaR * 0.9, thetaS * 1.05, 0.02, 2.5],
    [0.05, 0.45, 0.01, 2],
    [0.02, 0.5, 0.005, 1.8],
    [0.08, 0.4, 0.03, 3],
  ]

  for (const guess of additionalGuesses) {
    guesses.push(guess)
  }

  return guesses.filter(g =>
    !g.some(v => isNaN(v) || !isFinite(v)) &&
    g[1] > g[0] && g[2] > 0 && g[3] > 1
  )
}

function fit(pressures, waterContents, options = {}) {
  if (!pressures || !waterContents || pressures.length !== waterContents.length) {
    throw new Error('数据无效：压力和含水量数组长度必须一致')
  }

  if (pressures.length < 4) {
    throw new Error('数据点不足：至少需要4个数据点进行拟合')
  }

  const hValues = pressures.map(p => Math.abs(p))
  const thetaObserved = [...waterContents]

  const {
    outlierThreshold = 3,
    removeOutliers = false
  } = options

  let filteredH = hValues
  let filteredTheta = thetaObserved

  if (removeOutliers) {
    const meanTheta = thetaObserved.reduce((a, b) => a + b, 0) / thetaObserved.length
    const stdTheta = Math.sqrt(thetaObserved.reduce((sum, v) => sum + (v - meanTheta) ** 2, 0) / thetaObserved.length)

    const filtered = hValues.map((h, i) => ({ h, theta: thetaObserved[i] }))
      .filter(d => Math.abs(d.theta - meanTheta) <= outlierThreshold * stdTheta)

    if (filtered.length >= 4) {
      filteredH = filtered.map(d => d.h)
      filteredTheta = filtered.map(d => d.theta)
    }
  }

  const bounds = options.bounds || [
    [0, 0.5],
    [0.1, 0.8],
    [0.0001, 1],
    [1.01, 10]
  ]

  const initialGuesses = generateInitialGuesses(filteredH, filteredTheta)

  let bestResult = null
  let bestSSR = Infinity

  for (const initialParams of initialGuesses) {
    try {
      const result = levenbergMarquardt(filteredH, filteredTheta, initialParams, {
        ...options,
        bounds
      })

      if (result.ssr < bestSSR) {
        bestSSR = result.ssr
        bestResult = result
      }
    } catch (e) {
    }
  }

  if (!bestResult) {
    const fallbackGuess = [0.05, 0.45, 0.01, 2]
    bestResult = levenbergMarquardt(filteredH, filteredTheta, fallbackGuess, { bounds })
  }

  const [thetaR, thetaS, alpha, n] = bestResult.params
  const m = 1 - 1 / n

  const thetaPredicted = vanGenuchtenVector(hValues, bestResult.params)
  const residuals = calculateResiduals(hValues, thetaObserved, bestResult.params)
  const rmse = calculateRMSE(residuals)
  const r2 = calculateR2(thetaObserved, thetaPredicted)

  return {
    parameters: {
      thetaR: parseFloat(thetaR.toFixed(6)),
      thetaS: parseFloat(thetaS.toFixed(6)),
      alpha: parseFloat(alpha.toFixed(6)),
      n: parseFloat(n.toFixed(6)),
      m: parseFloat(m.toFixed(6))
    },
    statistics: {
      rmse: parseFloat(rmse.toFixed(8)),
      r2: parseFloat(r2.toFixed(6)),
      ssr: parseFloat(calculateSSR(residuals).toFixed(8)),
      sampleCount: pressures.length
    },
    fittedData: hValues.map((h, i) => ({
      pressure: pressures[i],
      observed: thetaObserved[i],
      predicted: parseFloat(thetaPredicted[i].toFixed(6)),
      residual: parseFloat(residuals[i].toFixed(6))
    }))
  }
}

function generateCurve(params, options = {}) {
  const {
    thetaR,
    thetaS,
    alpha,
    n
  } = params

  const {
    minH = 0.1,
    maxH = 10000,
    points = 200,
    logScale = true
  } = options

  const hValues = []
  if (logScale) {
    const logMin = Math.log10(minH)
    const logMax = Math.log10(maxH)
    const step = (logMax - logMin) / (points - 1)
    for (let i = 0; i < points; i++) {
      hValues.push(Math.pow(10, logMin + i * step))
    }
  } else {
    const step = (maxH - minH) / (points - 1)
    for (let i = 0; i < points; i++) {
      hValues.push(minH + i * step)
    }
  }

  return hValues.map(h => ({
    pressure: h,
    waterContent: parseFloat(vanGenuchten(h, thetaR, thetaS, alpha, n).toFixed(6))
  }))
}

module.exports = {
  fit,
  generateCurve,
  vanGenuchten
}
