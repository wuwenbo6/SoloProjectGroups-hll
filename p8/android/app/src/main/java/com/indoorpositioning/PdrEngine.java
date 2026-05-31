package com.indoorpositioning;

public class PdrEngine {
    private double x;
    private double y;
    private double z;
    private long lastUpdateTime;
    
    private double wifiX;
    private double wifiY;
    private double wifiZ;
    private long lastWifiTime;
    
    private static final double WIFI_WEIGHT = 0.3;
    private static final double PDR_WEIGHT = 0.7;
    private static final long WIFI_TIMEOUT_MS = 5000;

    private boolean isInitialized = false;

    public PdrEngine() {
        reset();
    }

    public void reset() {
        x = 0;
        y = 0;
        z = 0;
        wifiX = 0;
        wifiY = 0;
        wifiZ = 0;
        lastWifiTime = 0;
        isInitialized = false;
    }

    public void setInitialPosition(double x, double y, double z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.wifiX = x;
        this.wifiY = y;
        this.wifiZ = z;
        this.lastWifiTime = System.currentTimeMillis();
        isInitialized = true;
    }

    public void updateWithStep(float direction, float stepLength) {
        if (!isInitialized) return;

        double rad = Math.toRadians(direction);
        double dx = stepLength * Math.sin(rad);
        double dy = stepLength * Math.cos(rad);

        x += dx;
        y += dy;
    }

    public void updateWithWifiPosition(double wifiX, double wifiY, double wifiZ) {
        this.wifiX = wifiX;
        this.wifiY = wifiY;
        this.wifiZ = wifiZ;
        this.lastWifiTime = System.currentTimeMillis();

        if (!isInitialized) {
            x = wifiX;
            y = wifiY;
            z = wifiZ;
            isInitialized = true;
            return;
        }

        long timeSinceLastWifi = System.currentTimeMillis() - lastWifiTime;
        double effectiveWifiWeight = timeSinceLastWifi > WIFI_TIMEOUT_MS ? 0.5 : WIFI_WEIGHT;

        x = x * (1 - effectiveWifiWeight) + wifiX * effectiveWifiWeight;
        y = y * (1 - effectiveWifiWeight) + wifiY * effectiveWifiWeight;
        z = z * (1 - effectiveWifiWeight) + wifiZ * effectiveWifiWeight;
    }

    public Position getPosition() {
        return new Position(x, y, z);
    }

    public boolean isInitialized() {
        return isInitialized;
    }

    public static class Position {
        public final double x;
        public final double y;
        public final double z;

        public Position(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }
}
