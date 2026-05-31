package com.indoorpositioning;

import java.util.LinkedList;
import java.util.Queue;

public class MovingAverage {
    private Queue<Double> values;
    private int windowSize;
    private double sum;

    public MovingAverage(int windowSize) {
        this.windowSize = windowSize;
        this.values = new LinkedList<>();
        this.sum = 0;
    }

    public MovingAverage() {
        this(5);
    }

    public double update(double value) {
        values.add(value);
        sum += value;
        
        if (values.size() > windowSize) {
            double removed = values.poll();
            sum -= removed;
        }
        
        return getValue();
    }

    public double getValue() {
        if (values.isEmpty()) return 0;
        return sum / values.size();
    }

    public void reset() {
        values.clear();
        sum = 0;
    }
}
