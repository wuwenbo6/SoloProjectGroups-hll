package com.gait.analysis.lstm

import android.content.Context
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.sqrt
import kotlin.math.abs

enum class GaitPhase {
    STANCE,
    SWING,
    UNKNOWN
}

data class GaitPrediction(
    val phase: GaitPhase,
    val confidence: Float,
    val timestamp: Long,
    val inferenceTime: Long = 0
)

class GaitPhaseClassifier(private val context: Context) {

    private var interpreter: Interpreter? = null
    private val inputWindow = ArrayDeque<FloatArray>()
    private val windowSize = 50
    private val featureSize = 6
    private val inferenceInterval = 5
    private var frameCount = 0

    private var lastPhase = GaitPhase.UNKNOWN
    private var phaseStartTime = System.currentTimeMillis()

    private val stanceDurationRange = 600..800
    private val swingDurationRange = 300..400

    private lateinit var inputBuffer: ByteBuffer
    private lateinit var outputBuffer: Array<FloatArray>

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private var inferenceFuture: Future<*>? = null
    private val cachedPrediction = AtomicReference<GaitPhase?>(null)

    private val gravityThreshold = 1.15f
    private val gyroThreshold = 80f

    fun initialize(modelPath: String = "gait_lstm_model.tflite") {
        try {
            val modelBuffer = FileUtil.loadMappedFile(context, modelPath)
            val options = Interpreter.Options().apply {
                setNumThreads(2)
                setUseNNAPI(true)
            }
            interpreter = Interpreter(modelBuffer, options)

            val inputSize = windowSize * featureSize * 4
            inputBuffer = ByteBuffer.allocateDirect(inputSize)
                .order(ByteOrder.nativeOrder())
            outputBuffer = Array(1) { FloatArray(2) }

        } catch (e: Exception) {
            initializeFallback()
        }
    }

    private fun initializeFallback() {
        interpreter = null
    }

    fun predict(accelX: Float, accelY: Float, accelZ: Float,
                gyroX: Float, gyroY: Float, gyroZ: Float): GaitPrediction {

        val startTime = System.nanoTime()
        val normalized = normalizeFeatures(accelX, accelY, accelZ, gyroX, gyroY, gyroZ)

        synchronized(inputWindow) {
            inputWindow.addLast(normalized)
            if (inputWindow.size > windowSize) {
                inputWindow.removeFirst()
            }
        }

        frameCount++

        val predictedPhase = when {
            interpreter == null -> predictHeuristically(accelX, accelY, accelZ, gyroX, gyroY, gyroZ)
            inputWindow.size < windowSize -> predictHeuristically(accelX, accelY, accelZ, gyroX, gyroY, gyroZ)
            frameCount % inferenceInterval == 0 -> runAsyncInference()
            else -> cachedPrediction.get() ?: predictHeuristically(accelX, accelY, accelZ, gyroX, gyroY, gyroZ)
        }

        val validatedPhase = validatePhaseDuration(predictedPhase)
        val confidence = calculateConfidence(accelX, accelY, accelZ, gyroX, gyroY, gyroZ)

        val inferenceTime = (System.nanoTime() - startTime) / 1_000_000

        return GaitPrediction(
            phase = validatedPhase,
            confidence = confidence,
            timestamp = System.currentTimeMillis(),
            inferenceTime = inferenceTime
        )
    }

    private fun normalizeFeatures(
        accelX: Float, accelY: Float, accelZ: Float,
        gyroX: Float, gyroY: Float, gyroZ: Float
    ): FloatArray {
        return floatArrayOf(
            accelX / 16.0f,
            accelY / 16.0f,
            accelZ / 16.0f,
            gyroX / 2000.0f,
            gyroY / 2000.0f,
            gyroZ / 2000.0f
        )
    }

    private fun runAsyncInference(): GaitPhase {
        return try {
            val future = executor.submit<GaitPhase> {
                runInferenceSync()
            }
            future.get()
        } catch (e: Exception) {
            GaitPhase.UNKNOWN
        }
    }

    private fun runInferenceSync(): GaitPhase {
        return try {
            inputBuffer.clear()

            synchronized(inputWindow) {
                val iterator = inputWindow.iterator()
                var count = 0
                while (iterator.hasNext() && count < windowSize) {
                    val features = iterator.next()
                    features.forEach { inputBuffer.putFloat(it) }
                    count++
                }
            }

            inputBuffer.rewind()
            outputBuffer[0][0] = 0f
            outputBuffer[0][1] = 0f

            interpreter?.run(inputBuffer, outputBuffer)

            val result = if (outputBuffer[0][0] > outputBuffer[0][1]) {
                GaitPhase.STANCE
            } else {
                GaitPhase.SWING
            }

            cachedPrediction.set(result)
            result

        } catch (e: Exception) {
            GaitPhase.UNKNOWN
        }
    }

    private fun predictHeuristically(
        accelX: Float, accelY: Float, accelZ: Float,
        gyroX: Float, gyroY: Float, gyroZ: Float
    ): GaitPhase {
        val accelMag = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ)
        val gyroMag = sqrt(gyroX * gyroX + gyroY * gyroY + gyroZ * gyroZ)

        val currentTime = System.currentTimeMillis()
        val phaseDuration = currentTime - phaseStartTime

        val gyroHighFreq = abs(gyroY) > gyroThreshold * 0.7f

        return when {
            accelMag > gravityThreshold && gyroMag < gyroThreshold * 0.5f -> GaitPhase.STANCE
            accelMag < gravityThreshold * 0.85f || gyroHighFreq -> GaitPhase.SWING
            lastPhase == GaitPhase.STANCE && phaseDuration < stanceDurationRange.first -> GaitPhase.STANCE
            lastPhase == GaitPhase.SWING && phaseDuration < swingDurationRange.first -> GaitPhase.SWING
            else -> lastPhase
        }
    }

    private fun validatePhaseDuration(predictedPhase: GaitPhase): GaitPhase {
        val currentTime = System.currentTimeMillis()
        val duration = currentTime - phaseStartTime

        return if (predictedPhase != lastPhase && predictedPhase != GaitPhase.UNKNOWN) {
            val minDuration = when (lastPhase) {
                GaitPhase.STANCE -> stanceDurationRange.first
                GaitPhase.SWING -> swingDurationRange.first
                else -> 150
            }

            if (duration >= minDuration) {
                lastPhase = predictedPhase
                phaseStartTime = currentTime
                predictedPhase
            } else {
                lastPhase
            }
        } else {
            val maxDuration = when (lastPhase) {
                GaitPhase.STANCE -> stanceDurationRange.last
                GaitPhase.SWING -> swingDurationRange.last
                else -> Int.MAX_VALUE
            }

            if (duration > maxDuration) {
                lastPhase = if (lastPhase == GaitPhase.STANCE) GaitPhase.SWING else GaitPhase.STANCE
                phaseStartTime = currentTime
            }
            lastPhase
        }
    }

    private fun calculateConfidence(
        accelX: Float, accelY: Float, accelZ: Float,
        gyroX: Float, gyroY: Float, gyroZ: Float
    ): Float {
        val accelMag = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ)
        val gyroMag = sqrt(gyroX * gyroX + gyroY * gyroY + gyroZ * gyroZ)

        val stanceConfidence = kotlin.math.max(0f, 1f - abs(accelMag - 1f))
        val swingConfidence = kotlin.math.min(1f, gyroMag / 250f)

        return when (lastPhase) {
            GaitPhase.STANCE -> stanceConfidence
            GaitPhase.SWING -> swingConfidence
            else -> 0.5f
        }
    }

    fun getPhaseDuration(): Long {
        return System.currentTimeMillis() - phaseStartTime
    }

    fun close() {
        executor.shutdownNow()
        try {
            inferenceFuture?.cancel(true)
        } catch (e: Exception) {
        }
        interpreter?.close()
        interpreter = null
        synchronized(inputWindow) {
            inputWindow.clear()
        }
        cachedPrediction.set(null)
    }

    fun isPhaseError(predicted: GaitPhase, expected: GaitPhase): Boolean {
        return predicted != expected && predicted != GaitPhase.UNKNOWN
    }

    fun getInferenceInterval(): Int = inferenceInterval
}
