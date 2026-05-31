package com.indoorpositioning;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

public class StepDetector implements SensorEventListener {
    private static final float STEP_THRESHOLD = 12.0f;
    private static final long STEP_DELAY_NS = 300000000L;
    private static final float STEP_LENGTH = 0.7f;

    private SensorManager sensorManager;
    private Sensor accelerometer;
    private Sensor gyroscope;
    private Sensor magnetometer;

    private OnStepListener stepListener;
    private int stepCount = 0;
    private long lastStepTime = 0;
    private float lastMagnitude = 0;

    private float[] gravity = new float[3];
    private float[] geomagnetic = new float[3];
    private float azimuth = 0;
    private float stepLength = STEP_LENGTH;

    private float[] acceleration = new float[3];
    private KalmanFilter[] kalmanFilters = new KalmanFilter[3];

    public interface OnStepListener {
        void onStep(int stepCount, float direction, float stepLength);
        void onAccelerationUpdate(float x, float y, float z);
    }

    public StepDetector(SensorManager sensorManager) {
        this.sensorManager = sensorManager;
        this.accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        this.gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        this.magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        
        for (int i = 0; i < 3; i++) {
            kalmanFilters[i] = new KalmanFilter(0, 0.01f, 0.5f);
        }
    }

    public void start() {
        sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
        sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_GAME);
        sensorManager.registerListener(this, magnetometer, SensorManager.SENSOR_DELAY_GAME);
    }

    public void stop() {
        sensorManager.unregisterListener(this);
    }

    public void setStepListener(OnStepListener listener) {
        this.stepListener = listener;
    }

    public int getStepCount() {
        return stepCount;
    }

    public float getAzimuth() {
        return azimuth;
    }

    public void resetStepCount() {
        stepCount = 0;
    }

    public void setStepLength(float length) {
        this.stepLength = length;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, gravity, 0, 3);
            
            float x = kalmanFilters[0].update(event.values[0]);
            float y = kalmanFilters[1].update(event.values[1]);
            float z = kalmanFilters[2].update(event.values[2]);

            acceleration[0] = x;
            acceleration[1] = y;
            acceleration[2] = z;

            float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
            
            long currentTime = System.nanoTime();
            if (magnitude > STEP_THRESHOLD && lastMagnitude <= STEP_THRESHOLD) {
                if (currentTime - lastStepTime > STEP_DELAY_NS) {
                    stepCount++;
                    lastStepTime = currentTime;
                    if (stepListener != null) {
                        stepListener.onStep(stepCount, azimuth, stepLength);
                    }
                }
            }
            lastMagnitude = magnitude;

            if (stepListener != null) {
                stepListener.onAccelerationUpdate(x, y, z);
            }
        }

        if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, geomagnetic, 0, 3);
        }

        if (gravity != null && geomagnetic != null) {
            float[] R = new float[9];
            float[] I = new float[9];
            boolean success = SensorManager.getRotationMatrix(R, I, gravity, geomagnetic);
            if (success) {
                float[] orientation = new float[3];
                SensorManager.getOrientation(R, orientation);
                azimuth = (float) Math.toDegrees(orientation[0]);
                if (azimuth < 0) {
                    azimuth += 360;
                }
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }

    private static class KalmanFilter {
        private float x;
        private float P;
        private float Q;
        private float R;

        public KalmanFilter(float initialValue, float processNoise, float measurementNoise) {
            this.x = initialValue;
            this.P = 1.0f;
            this.Q = processNoise;
            this.R = measurementNoise;
        }

        public float update(float measurement) {
            P = P + Q;
            float K = P / (P + R);
            x = x + K * (measurement - x);
            P = (1 - K) * P;
            return x;
        }
    }
}
