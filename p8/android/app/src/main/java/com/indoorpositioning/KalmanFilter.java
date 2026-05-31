package com.indoorpositioning;

public class KalmanFilter {
    private double x;
    private double P;
    private double Q;
    private double R;

    public KalmanFilter(double initialValue, double processNoise, double measurementNoise) {
        this.x = initialValue;
        this.P = 1.0;
        this.Q = processNoise;
        this.R = measurementNoise;
    }

    public KalmanFilter(double initialValue) {
        this(initialValue, 0.05, 0.5);
    }

    public double update(double measurement) {
        P = P + Q;
        double K = P / (P + R);
        x = x + K * (measurement - x);
        P = (1 - K) * P;
        return x;
    }

    public double getValue() {
        return x;
    }
}
