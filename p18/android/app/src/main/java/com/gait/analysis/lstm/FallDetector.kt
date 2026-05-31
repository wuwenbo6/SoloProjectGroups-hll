package com.gait.analysis.lstm

import kotlin.math.sqrt

enum class FallRisk {
    LOW,
    MEDIUM,
    HIGH,
    FALL_DETECTED
}

data class FallDetectionResult(
    val risk: FallRisk,
    val accelMagnitude: Float,
    val impactForce: Float,
    val orientationChange: Float,
    val timestamp: Long
)

interface FallDetectionCallback {
    fun onFallDetected(result: FallDetectionResult)
    fun onRiskLevelChanged(risk: FallRisk)
}

class FallDetector(private val callback: FallDetectionCallback? = null) {

    private val impactThresholdHigh = 3.5f
    private val impactThresholdMedium = 2.5f
    private val postImpactInactivity = 0.8f
    private val orientationChangeThreshold = 45.0f

    private val windowSize = 50
    private val accelWindow = ArrayDeque<FloatArray>(windowSize)

    private var lastRisk = FallRisk.LOW
    private var lastVerticalAccel = 9.81f
    private var inFreeFall = false
    private var freeFallStartTime = 0L
    private val minFreeFallDuration = 100L

    private var impactDetectedTime = 0L
    private val postImpactWindow = 1000L

    private var baselineAccel = 9.81f
    private var calibrationCount = 0
    private val calibrationFrames = 100
    private var isCalibrated = false

    private var fallCount = 0
    private var nearFallCount = 0

    fun calibrate(accelX: Float, accelY: Float, accelZ: Float) {
        if (calibrationCount < calibrationFrames) {
            val mag = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ)
            baselineAccel = (baselineAccel * calibrationCount + mag) / (calibrationCount + 1)
            calibrationCount++
        } else {
            isCalibrated = true
        }
    }

    fun detect(accelX: Float, accelY: Float, accelZ: Float): FallDetectionResult {
        val currentTime = System.currentTimeMillis()
        val accelMag = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ)

        if (!isCalibrated) {
            calibrate(accelX, accelY, accelZ)
            return FallDetectionResult(
                risk = FallRisk.LOW,
                accelMagnitude = accelMag,
                impactForce = 0f,
                orientationChange = 0f,
                timestamp = currentTime
            )
        }

        val verticalAccel = accelZ
        val normalizedMag = accelMag / baselineAccel

        val orientationChange = if (lastVerticalAccel != 0f) {
            kotlin.math.abs(verticalAccel - lastVerticalAccel) / baselineAccel * 180f
        } else {
            0f
        }

        if (normalizedMag < 0.3f && !inFreeFall) {
            inFreeFall = true
            freeFallStartTime = currentTime
        }

        var risk = FallRisk.LOW
        var impactForce = 0f

        if (inFreeFall) {
            val freeFallDuration = currentTime - freeFallStartTime
            if (freeFallDuration >= minFreeFallDuration && normalizedMag > impactThresholdHigh) {
                impactForce = normalizedMag
                impactDetectedTime = currentTime
                inFreeFall = false

                if (orientationChange > orientationChangeThreshold) {
                    risk = FallRisk.FALL_DETECTED
                    fallCount++
                    callback?.onFallDetected(
                        FallDetectionResult(risk, accelMag, impactForce, orientationChange, currentTime)
                    )
                } else {
                    risk = FallRisk.HIGH
                    nearFallCount++
                }
            } else if (normalizedMag > impactThresholdMedium) {
                risk = FallRisk.MEDIUM
            }
        } else {
            if (normalizedMag > impactThresholdHigh) {
                risk = FallRisk.HIGH
                nearFallCount++
            } else if (normalizedMag > impactThresholdMedium) {
                risk = FallRisk.MEDIUM
            }
        }

        if (currentTime - impactDetectedTime < postImpactWindow) {
            val postImpactMag = normalizedMag
            if (postImpactMag < postImpactInactivity && risk == FallRisk.FALL_DETECTED) {
                risk = FallRisk.FALL_DETECTED
            }
        }

        if (inFreeFall && normalizedMag > 0.8f) {
            val freeFallDuration = currentTime - freeFallStartTime
            if (freeFallDuration < minFreeFallDuration) {
                inFreeFall = false
            }
        }

        accelWindow.addLast(floatArrayOf(accelX, accelY, accelZ))
        if (accelWindow.size > windowSize) {
            accelWindow.removeFirst()
        }

        lastVerticalAccel = verticalAccel

        if (risk != lastRisk) {
            lastRisk = risk
            callback?.onRiskLevelChanged(risk)
        }

        return FallDetectionResult(
            risk = risk,
            accelMagnitude = accelMag,
            impactForce = impactForce,
            orientationChange = orientationChange,
            timestamp = currentTime
        )
    }

    fun getFallCount(): Int = fallCount

    fun getNearFallCount(): Int = nearFallCount

    fun getFallRiskScore(): Float {
        val total = fallCount * 10 + nearFallCount * 3
        return kotlin.math.min(100f, total.toFloat())
    }

    fun reset() {
        fallCount = 0
        nearFallCount = 0
        inFreeFall = false
        lastRisk = FallRisk.LOW
        accelWindow.clear()
    }

    fun isHighRisk(): Boolean {
        return lastRisk == FallRisk.HIGH || lastRisk == FallRisk.FALL_DETECTED
    }

    fun getRiskLevelText(): String {
        return when (lastRisk) {
            FallRisk.LOW -> "低风险"
            FallRisk.MEDIUM -> "中风险"
            FallRisk.HIGH -> "高风险"
            FallRisk.FALL_DETECTED -> "检测到摔倒！"
        }
    }

    fun getRiskColor(): Int {
        return when (lastRisk) {
            FallRisk.LOW -> android.graphics.Color.GREEN
            FallRisk.MEDIUM -> android.graphics.Color.YELLOW
            FallRisk.HIGH -> android.graphics.Color.rgb(255, 165, 0)
            FallRisk.FALL_DETECTED -> android.graphics.Color.RED
        }
    }
}
