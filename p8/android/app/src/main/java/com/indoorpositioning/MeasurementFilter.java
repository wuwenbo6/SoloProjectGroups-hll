package com.indoorpositioning;

import java.util.HashMap;
import java.util.Map;

public class MeasurementFilter {
    private Map<String, KalmanFilter> kalmanFilters;
    private Map<String, MovingAverage> movingAverages;
    private Map<String, OutlierDetector> outlierDetectors;

    public MeasurementFilter() {
        kalmanFilters = new HashMap<>();
        movingAverages = new HashMap<>();
        outlierDetectors = new HashMap<>();
    }

    public double filter(String bssid, double distance) {
        if (!kalmanFilters.containsKey(bssid)) {
            kalmanFilters.put(bssid, new KalmanFilter(distance, 0.05, 0.8));
            movingAverages.put(bssid, new MovingAverage(5));
            outlierDetectors.put(bssid, new OutlierDetector(2.5));
        }

        OutlierDetector detector = outlierDetectors.get(bssid);
        KalmanFilter kalman = kalmanFilters.get(bssid);
        MovingAverage ma = movingAverages.get(bssid);

        detector.update(distance);

        if (detector.isOutlier(distance)) {
            return kalman.getValue();
        }

        double kalmanFiltered = kalman.update(distance);
        double maFiltered = ma.update(kalmanFiltered);

        return maFiltered;
    }

    public void reset(String bssid) {
        kalmanFilters.remove(bssid);
        movingAverages.remove(bssid);
        outlierDetectors.remove(bssid);
    }

    public void clearAll() {
        kalmanFilters.clear();
        movingAverages.clear();
        outlierDetectors.clear();
    }

    private static class OutlierDetector {
        private double threshold;
        private double mean;
        private double std;
        private java.util.List<Double> history;

        public OutlierDetector(double threshold) {
            this.threshold = threshold;
            this.mean = 0;
            this.std = 1;
            this.history = new java.util.ArrayList<>();
        }

        public void update(double value) {
            history.add(value);
            if (history.size() > 20) {
                history.remove(0);
            }

            mean = 0;
            for (double v : history) {
                mean += v;
            }
            mean /= history.size();

            double variance = 0;
            for (double v : history) {
                variance += Math.pow(v - mean, 2);
            }
            variance /= history.size();
            std = Math.sqrt(variance);
        }

        public boolean isOutlier(double value) {
            if (history.size() < 5) return false;
            double zScore = Math.abs((value - mean) / (std > 0 ? std : 1));
            return zScore > threshold;
        }
    }
}
