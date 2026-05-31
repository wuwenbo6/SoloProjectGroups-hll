package com.gait.analysis.vibration

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class VibrationFeedback(private val context: Context) {

    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    private var isVibrating = false
    private var lastVibrationTime = 0L
    private val vibrationCooldown = 500L

    enum class FeedbackType {
        PHASE_ERROR,
        CORRECTION_HINT,
        CALIBRATION_COMPLETE,
        CONNECTION_SUCCESS
    }

    fun triggerFeedback(type: FeedbackType) {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastVibrationTime < vibrationCooldown) {
            return
        }

        when (type) {
            FeedbackType.PHASE_ERROR -> vibrateError()
            FeedbackType.CORRECTION_HINT -> vibrateHint()
            FeedbackType.CALIBRATION_COMPLETE -> vibrateSuccess()
            FeedbackType.CONNECTION_SUCCESS -> vibrateShort()
        }

        lastVibrationTime = currentTime
    }

    private fun vibrateError() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val timings = longArrayOf(0, 100, 50, 100, 50, 100)
            val amplitudes = intArrayOf(0, 200, 0, 200, 0, 200)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 100, 50, 100, 50, 100), -1)
        }
    }

    private fun vibrateHint() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val timings = longArrayOf(0, 50, 30, 50)
            val amplitudes = intArrayOf(0, 150, 0, 150)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 50, 30, 50), -1)
        }
    }

    private fun vibrateSuccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createOneShot(200, VibrationEffect.DEFAULT_AMPLITUDE)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(200)
        }
    }

    private fun vibrateShort() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(100)
        }
    }

    fun stop() {
        vibrator.cancel()
        isVibrating = false
    }

    fun hasVibrator(): Boolean {
        return vibrator.hasVibrator()
    }
}
