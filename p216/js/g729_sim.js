const FRAME_SIZE = 80;
const SAMPLE_RATE = 8000;
const FRAME_DURATION_MS = 10;
const LPC_ORDER = 10;
const MAX_PITCH_LAG = 147;
const MIN_PITCH_LAG = 20;

const LSP_QUANT_TABLE = [
    [100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650],
    [200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750],
    [300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850],
    [400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950],
    [500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050],
    [600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150],
    [700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250],
    [800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350],
    [900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350,2400,2450],
    [1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350,2400,2450,2500,2550]
];

let FIXED_CODEBOOK = null;
let codebookInitialized = false;

function initFixedCodebook() {
    if (codebookInitialized) return;
    codebookInitialized = true;
    FIXED_CODEBOOK = new Array(128);
    for (let j = 0; j < 128; j++) {
        FIXED_CODEBOOK[j] = new Array(40);
        const freq = (j + 1) * 50.0;
        for (let i = 0; i < 40; i++) {
            const t = i / 8000.0;
            const noise = (Math.random() * 2 - 1) * 100;
            let val = 500.0 * Math.sin(2.0 * Math.PI * freq * t)
                        + 200.0 * Math.sin(2.0 * Math.PI * freq * 3.0 * t)
                        + noise;
            val = Math.max(-1000, Math.min(1000, val));
            FIXED_CODEBOOK[j][i] = Math.round(val);
        }
    }
}

function generateTestSignal(durationMs, sampleRate = SAMPLE_RATE) {
    const numSamples = Math.floor((durationMs * sampleRate) / 1000);
    const signal = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;
        sample += 0.3 * Math.sin(2.0 * Math.PI * 440 * t);
        sample += 0.2 * Math.sin(2.0 * Math.PI * 880 * t);
        sample += 0.15 * Math.sin(2.0 * Math.PI * 1320 * t);
        sample += 0.05 * (Math.random() * 2 - 1);
        signal[i] = Math.round(sample * 20000);
    }
    return signal;
}

class PlcState {
    constructor() {
        this.consecutiveLostFrames = 0;
        this.lastPitchLag = 40;
        this.lastEnergy = 0.0;
        this.attenuation = 1.0;
        this.pitchCycle = [];
    }
    reset() {
        this.consecutiveLostFrames = 0;
        this.lastPitchLag = 40;
        this.lastEnergy = 0.0;
        this.attenuation = 1.0;
        this.pitchCycle = [];
    }
}

function levinsonDurbin(autocorr) {
    const lpc = new Array(11).fill(0);
    const k = new Array(11).fill(0);
    const a = new Array(11).fill(null).map(() => new Array(11).fill(0));
    const e = new Array(11).fill(0);
    lpc[0] = 1;
    e[0] = autocorr[0];
    for (let i = 1; i <= 10; i++) {
        let sum = 0;
        for (let j = 1; j < i; j++) sum += a[i-1][j] * autocorr[i - j];
        k[i] = e[i-1] !== 0 ? (autocorr[i] - sum) / e[i-1] : 0;
        k[i] = Math.max(-0.9999, Math.min(0.9999, k[i]));
        a[i][i] = k[i];
        for (let j = 1; j < i; j++) a[i][j] = a[i-1][j] - k[i] * a[i-1][i-j];
        e[i] = (1 - k[i] * k[i]) * e[i-1];
    }
    for (let i = 1; i <= 10; i++) lpc[i] = a[10][i];
    return lpc;
}

function quantizeLsp(lspValue, lspIndex) {
    let bestIdx = 0, minDist = Infinity;
    for (let i = 0; i < 32; i++) {
        const dist = Math.abs(lspValue - LSP_QUANT_TABLE[lspIndex][i]);
        if (dist < minDist) { minDist = dist; bestIdx = i; }
    }
    return bestIdx;
}

function dequantizeLsp(quantIdx, lspIndex) {
    return LSP_QUANT_TABLE[lspIndex][quantIdx];
}

function lspToLpc(lsp) {
    const f = new Array(10);
    for (let i = 0; i < 10; i++) f[i] = lsp[i] * 1000.0 * Math.PI / (4000.0 * 256.0);
    const p = new Array(6).fill(0), q = new Array(6).fill(0);
    p[0] = 1; q[0] = 1;
    for (let i = 0; i < 5; i++) {
        const cos2w = 2.0 * Math.cos(2.0 * f[2*i]);
        p[i+1] = -cos2w;
        for (let j = i; j >= 1; j--) p[j] = p[j] - cos2w * p[j-1] + (j > 1 ? p[j-1] * p[j-2] : 0);
    }
    for (let i = 0; i < 5; i++) {
        const cos2w = 2.0 * Math.cos(2.0 * f[2*i+1]);
        q[i+1] = -cos2w;
        for (let j = i; j >= 1; j--) q[j] = q[j] - cos2w * q[j-1] + (j > 1 ? q[j-1] * q[j-2] : 0);
    }
    const a1 = new Array(11), a2 = new Array(11);
    for (let i = 0; i <= 5; i++) { a1[i] = p[i]; a1[10-i] = p[i]; }
    for (let i = 0; i <= 5; i++) { a2[i] = q[i]; a2[10-i] = -q[i]; }
    const lpc = new Array(11);
    for (let i = 1; i <= 10; i++) lpc[i] = 0.5 * (a1[i] + a2[i]);
    lpc[0] = 1.0;
    return lpc;
}

function findBestMatch(target) {
    let bestIndex = 0, bestCorrelation = 0;
    const cbEnergy = new Array(128).fill(0);
    for (let j = 0; j < 128; j++) {
        let correlation = 0;
        for (let i = 0; i < 40; i++) {
            correlation += target[i] * FIXED_CODEBOOK[j][i];
            cbEnergy[j] += FIXED_CODEBOOK[j][i] * FIXED_CODEBOOK[j][i];
        }
        if (j === 0 || correlation > bestCorrelation) { bestCorrelation = correlation; bestIndex = j; }
    }
    let bestGain = 0;
    if (cbEnergy[bestIndex] > 0) {
        bestGain = Math.round((bestCorrelation * 256) / cbEnergy[bestIndex]);
        bestGain = Math.max(0, Math.min(255, bestGain));
    }
    return { index: bestIndex, gain: bestGain };
}

function encodeFrame(frame) {
    const output = { lsp: new Uint8Array(10), fixed_codebook_index: 0, fixed_codebook_gain: 0, adaptive_codebook_lag: 0, adaptive_codebook_gain: 0, lost: false };
    if (frame.length !== FRAME_SIZE) return output;
    const windowed = new Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) { const w = 0.54 - 0.46 * Math.cos(2.0 * Math.PI * i / (FRAME_SIZE - 1)); windowed[i] = frame[i] * w; }
    const autocorr = new Array(11).fill(0);
    for (let i = 0; i < 11; i++) for (let j = 0; j < FRAME_SIZE - i; j++) autocorr[i] += windowed[j] * windowed[j + i];
    const lpc = levinsonDurbin(autocorr);
    const lsp = new Array(10);
    for (let i = 0; i < 10; i++) { const freq = (i + 1) * Math.PI / 11.0; lsp[i] = Math.round(freq * 4000 / Math.PI * 256 / 1000); }
    for (let i = 0; i < 10; i++) output.lsp[i] = quantizeLsp(lsp[i], i);
    const residual = new Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) { let sum = frame[i]; for (let j = 1; j <= 10 && i - j >= 0; j++) sum -= lpc[j] * frame[i - j] * 1024; residual[i] = Math.round(sum / 1024); }
    const match = findBestMatch(residual);
    output.fixed_codebook_index = match.index; output.fixed_codebook_gain = match.gain;
    let pitchLag = 40, maxCorr = 0;
    for (let lag = 20; lag <= 147; lag++) { let corr = 0; for (let i = lag; i < FRAME_SIZE; i++) corr += residual[i] * residual[i - lag]; if (corr > maxCorr) { maxCorr = corr; pitchLag = lag; } }
    output.adaptive_codebook_lag = pitchLag - 20;
    let num = 0, den = 0;
    for (let i = pitchLag; i < FRAME_SIZE; i++) { num += residual[i] * residual[i - pitchLag]; den += residual[i - pitchLag] * residual[i - pitchLag]; }
    let acGain = 0;
    if (den > 0) { acGain = Math.round((num * 256) / den); acGain = Math.max(0, Math.min(255, acGain)); }
    output.adaptive_codebook_gain = acGain;
    return output;
}

function encodeBuffer(buffer) {
    const frames = [], numFrames = Math.floor(buffer.length / FRAME_SIZE);
    for (let i = 0; i < numFrames; i++) frames.push(encodeFrame(buffer.slice(i * FRAME_SIZE, (i + 1) * FRAME_SIZE)));
    return frames;
}

class PacketLossSimulator {
    constructor(lossRate = 0.05) {
        this.lossRate = lossRate;
        this.pattern = 0;
        this.gilbertInBurst = false;
        this.periodicCounter = 0;
        this.frameCounter = 0;
    }
    setLossRate(rate) { this.lossRate = rate; }
    getLossRate() { return this.lossRate; }
    setLossPattern(pattern) { this.pattern = pattern; this.resetState(); }
    resetState() { this.gilbertInBurst = false; this.periodicCounter = 0; this.frameCounter = 0; }
    shouldDrop() {
        switch (this.pattern) {
            case 0: return this._shouldDropRandom();
            case 1: return this._shouldDropGilbert();
            case 2: return this._shouldDropPeriodic();
            case 3: return this._shouldDropGradual();
            default: return this._shouldDropRandom();
        }
    }
    _shouldDropRandom() { return Math.random() < this.lossRate; }
    _shouldDropGilbert() {
        let pG2B = Math.min(this.lossRate * 3.0, 0.8);
        let pB2G = 0.3;
        if (this.gilbertInBurst) {
            if (Math.random() < pB2G) { this.gilbertInBurst = false; return false; }
            return true;
        } else {
            if (Math.random() < pG2B) { this.gilbertInBurst = true; return true; }
            return false;
        }
    }
    _shouldDropPeriodic() {
        let interval = Math.max(1, Math.floor(1.0 / this.lossRate));
        this.periodicCounter++;
        if (this.periodicCounter >= interval) { this.periodicCounter = 0; return true; }
        return false;
    }
    _shouldDropGradual() {
        let maxFrames = 300.0;
        let progress = Math.min(1.0, this.frameCounter / maxFrames);
        let currentRate = Math.min(this.lossRate * progress * 2.0, 0.5);
        this.frameCounter++;
        return Math.random() < currentRate;
    }
    simulate(frames) {
        const result = frames.map(f => ({...f}));
        this.resetState();
        for (let i = 0; i < result.length; i++) { if (this.shouldDrop()) result[i].lost = true; }
        return result;
    }
}

function estimatePitchLag(signal) {
    let bestLag = 40, maxCorr = 0, maxEnergy = 0;
    const start = Math.max(0, signal.length - FRAME_SIZE * 2);
    for (let lag = MIN_PITCH_LAG; lag <= MAX_PITCH_LAG; lag++) {
        let corr = 0, energy = 0;
        for (let i = start + lag; i < signal.length; i++) { corr += signal[i] * signal[i - lag]; energy += signal[i - lag] * signal[i - lag]; }
        if (corr > maxCorr && energy > 0) { const normalized = (corr * corr) / energy; if (normalized > maxEnergy) { maxEnergy = normalized; bestLag = lag; } }
    }
    return bestLag;
}

function calculateEnergy(signal) {
    let energy = 0.0;
    const start = Math.max(0, signal.length - FRAME_SIZE);
    for (let i = start; i < signal.length; i++) energy += signal[i] * signal[i];
    return Math.sqrt(energy / FRAME_SIZE);
}

class MosEstimator {
    static computeSegmentalSnr(original, degraded, segmentSamples = 160) {
        const len = Math.min(original.length, degraded.length);
        const numSegments = Math.floor(len / segmentSamples);
        if (numSegments <= 0) return 0.0;
        let totalSnr = 0.0, validSegments = 0;
        for (let seg = 0; seg < numSegments; seg++) {
            const start = seg * segmentSamples;
            let signalEnergy = 0.0, noiseEnergy = 0.0;
            for (let i = 0; i < segmentSamples; i++) {
                const s = original[start + i], d = degraded[start + i];
                const noise = s - d;
                signalEnergy += s * s;
                noiseEnergy += noise * noise;
            }
            if (noiseEnergy > 0.0 && signalEnergy > 0.0) {
                let segSnr = 10.0 * Math.log10(signalEnergy / noiseEnergy);
                segSnr = Math.max(-10.0, Math.min(50.0, segSnr));
                totalSnr += segSnr;
                validSegments++;
            }
        }
        return validSegments > 0 ? totalSnr / validSegments : 0.0;
    }
    static computePesqLike(original, degraded) {
        const len = Math.min(original.length, degraded.length);
        if (len === 0) return 1.0;
        const segSnr = this.computeSegmentalSnr(original, degraded, 160);
        const barkLen = Math.floor(len / 2);
        let spectralDist = 0.0, barkBands = 0;
        const bandSizes = [2,2,2,3,3,3,4,4,5,5,6,6,7,8,9,10,12,14,16,20];
        let pos = 0;
        for (let band = 0; band < 20 && pos < barkLen; band++) {
            const bandSize = bandSizes[band];
            const end = Math.min(pos + bandSize, barkLen);
            let origEnergy = 0.0, degEnergy = 0.0;
            for (let i = pos; i < end; i++) {
                const o = original[i * 2], d = degraded[i * 2];
                origEnergy += o * o;
                degEnergy += d * d;
            }
            if (origEnergy > 0.0) {
                const ratio = degEnergy / origEnergy;
                const dbDiff = 10.0 * Math.log10(Math.max(ratio, 1e-10));
                spectralDist += dbDiff * dbDiff;
                barkBands++;
            }
            pos = end;
        }
        if (barkBands > 0) spectralDist = Math.sqrt(spectralDist / barkBands);
        let lossCount = 0;
        for (let i = 0; i < len; i += FRAME_SIZE) {
            let segEnergy = 0.0;
            for (let j = i; j < Math.min(i + FRAME_SIZE, len); j++) segEnergy += degraded[j] * degraded[j];
            if (segEnergy < 1.0) lossCount++;
        }
        const lossRatio = (lossCount * FRAME_SIZE) / len;
        let pesq = 4.5;
        pesq -= 0.08 * Math.max(0.0, -segSnr);
        pesq -= 0.015 * spectralDist;
        pesq -= 3.0 * lossRatio;
        const segSnrClamped = Math.max(-5.0, Math.min(30.0, segSnr));
        pesq = pesq * 0.5 + (1.0 + segSnrClamped / 10.0) * 0.5;
        return Math.max(1.0, Math.min(4.5, pesq));
    }
    static snrToMos(segSnr) { return Math.max(1.0, Math.min(5.0, 1.0 + 0.035 * segSnr)); }
    static pesqToMos(pesq) { return Math.max(1.0, Math.min(4.5, 1.0 + 0.335 * pesq + 0.117 * pesq * pesq - 0.013 * pesq * pesq * pesq)); }
    static estimate(original, noPlc, withPlc) {
        const segSnrNoPlc = this.computeSegmentalSnr(original, noPlc);
        const segSnrWithPlc = this.computeSegmentalSnr(original, withPlc);
        const pesqLikeNoPlc = this.computePesqLike(original, noPlc);
        const pesqLikeWithPlc = this.computePesqLike(original, withPlc);
        const mosSnrNoPlc = this.snrToMos(segSnrNoPlc);
        const mosSnrWithPlc = this.snrToMos(segSnrWithPlc);
        const mosPesqNoPlc = this.pesqToMos(pesqLikeNoPlc);
        const mosPesqWithPlc = this.pesqToMos(pesqLikeWithPlc);
        let mosNoPlc = 0.4 * mosSnrNoPlc + 0.6 * mosPesqNoPlc;
        let mosWithPlc = 0.4 * mosSnrWithPlc + 0.6 * mosPesqWithPlc;
        mosNoPlc = Math.max(1.0, Math.min(4.5, mosNoPlc));
        mosWithPlc = Math.max(1.0, Math.min(4.5, mosWithPlc));
        return { mos_no_plc: mosNoPlc, mos_with_plc: mosWithPlc, seg_snr_no_plc: segSnrNoPlc, seg_snr_with_plc: segSnrWithPlc, pesq_like_no_plc: pesqLikeNoPlc, pesq_like_with_plc: pesqLikeWithPlc };
    }
}

class G729Decoder {
    constructor() {
        this.prevFrame = new Array(FRAME_SIZE).fill(0);
        this.prevLpc = new Array(LPC_ORDER).fill(0.0);
        this.prevPrevLpc = new Array(LPC_ORDER).fill(0.0);
        this.synthHistory = new Array(MAX_PITCH_LAG).fill(0);
        this.synthHistoryPtr = 0;
        this.hasPrevFrame = false;
        this.plcState = new PlcState();
    }
    reset() {
        this.prevFrame = new Array(FRAME_SIZE).fill(0);
        this.prevLpc = new Array(LPC_ORDER).fill(0.0);
        this.prevPrevLpc = new Array(LPC_ORDER).fill(0.0);
        this.synthHistory = new Array(MAX_PITCH_LAG).fill(0);
        this.synthHistoryPtr = 0;
        this.hasPrevFrame = false;
        this.plcState = new PlcState();
    }
    updateSynthHistory(frame) { for (const s of frame) { this.synthHistory[this.synthHistoryPtr] = s; this.synthHistoryPtr = (this.synthHistoryPtr + 1) % MAX_PITCH_LAG; } }
    doPlcPeriodic() {
        const plcFrame = new Array(FRAME_SIZE).fill(0);
        if (!this.hasPrevFrame) return plcFrame;
        if (this.plcState.consecutiveLostFrames === 0) {
            this.plcState.lastPitchLag = estimatePitchLag(this.prevFrame);
            this.plcState.lastEnergy = calculateEnergy(this.prevFrame);
            this.plcState.attenuation = 1.0;
            const lag = this.plcState.lastPitchLag;
            this.plcState.pitchCycle = new Array(lag);
            let start = this.prevFrame.length - lag;
            if (start < 0) start = 0;
            for (let i = 0; i < lag; i++) { if (start + i < this.prevFrame.length) this.plcState.pitchCycle[i] = this.prevFrame[start + i]; }
        }
        this.plcState.consecutiveLostFrames++;
        const perFrameAttenuation = Math.pow(0.85, this.plcState.consecutiveLostFrames);
        this.plcState.attenuation = Math.min(1.0, perFrameAttenuation);
        const pitchLag = this.plcState.lastPitchLag, pitchCycle = this.plcState.pitchCycle;
        if (pitchCycle.length === 0) return plcFrame;
        for (let i = 0; i < FRAME_SIZE; i++) {
            const cycleIdx = i % pitchLag;
            let sample = cycleIdx < pitchCycle.length ? pitchCycle[cycleIdx] : 0.0;
            let fade = 1.0;
            if (i < 10) fade = i / 10.0;
            if (i > FRAME_SIZE - 10) fade = (FRAME_SIZE - i) / 10.0;
            const totalAttenuation = this.plcState.attenuation * (0.7 + 0.3 * fade);
            plcFrame[i] = Math.round(Math.max(-32768, Math.min(32767, sample * totalAttenuation)));
        }
        const currentEnergy = calculateEnergy(plcFrame);
        if (currentEnergy > 0 && this.plcState.lastEnergy > 0) {
            let scale = Math.max(0.5, Math.min(1.5, this.plcState.lastEnergy * this.plcState.attenuation / currentEnergy));
            for (let i = 0; i < FRAME_SIZE; i++) plcFrame[i] = Math.round(Math.max(-32768, Math.min(32767, plcFrame[i] * scale)));
        }
        return plcFrame;
    }
    decode(frame, usePlc = false) {
        let output = new Array(FRAME_SIZE).fill(0);
        if (frame.lost) {
            if (usePlc && this.hasPrevFrame) { output = this.doPlcPeriodic(); }
            else { output = new Array(FRAME_SIZE).fill(0); this.plcState.consecutiveLostFrames++; }
        } else {
            this.plcState.consecutiveLostFrames = 0;
            const lsp = new Array(10);
            for (let i = 0; i < 10; i++) lsp[i] = dequantizeLsp(frame.lsp[i], i);
            const lpc = lspToLpc(lsp);
            for (let i = 0; i < LPC_ORDER; i++) { this.prevPrevLpc[i] = this.prevLpc[i]; this.prevLpc[i] = lpc[i + 1]; }
            const excitation = new Array(FRAME_SIZE).fill(0);
            const pitchLag = frame.adaptive_codebook_lag + 20;
            const acGain = frame.adaptive_codebook_gain / 256.0;
            for (let i = 0; i < FRAME_SIZE; i++) {
                if (i < pitchLag && this.hasPrevFrame) {
                    const prevIdx = this.prevFrame.length - pitchLag + i;
                    if (prevIdx >= 0 && prevIdx < this.prevFrame.length) excitation[i] = Math.round(this.prevFrame[prevIdx] * acGain);
                } else if (i >= pitchLag) { excitation[i] = Math.round(excitation[i - pitchLag] * acGain); }
            }
            const cbIndex = frame.fixed_codebook_index, fcGain = frame.fixed_codebook_gain / 256.0;
            for (let subframe = 0; subframe < 2; subframe++) for (let i = 0; i < 40; i++) excitation[subframe * 40 + i] += Math.round(FIXED_CODEBOOK[cbIndex][i] * fcGain);
            const synth = new Array(FRAME_SIZE).fill(0);
            for (let i = 0; i < FRAME_SIZE; i++) {
                let sum = excitation[i];
                for (let j = 1; j <= LPC_ORDER && i - j >= 0; j++) sum -= lpc[j] * synth[i - j];
                for (let j = 1; j <= LPC_ORDER && i - j < 0 && this.hasPrevFrame; j++) { const prevIdx = this.prevFrame.length + (i - j); if (prevIdx >= 0 && prevIdx < this.prevFrame.length) sum -= lpc[j] * this.prevFrame[prevIdx]; }
                synth[i] = Math.round(Math.max(-32768, Math.min(32767, sum)));
            }
            if (this.hasPrevFrame) {
                for (let i = 0; i < FRAME_SIZE; i++) {
                    const fadeOut = 1.0 - i / FRAME_SIZE;
                    const prevIdx = this.prevFrame.length - FRAME_SIZE + i;
                    if (prevIdx >= 0 && prevIdx < this.prevFrame.length) synth[i] = Math.round(this.prevFrame[prevIdx] * fadeOut * 0.1 + synth[i] * (1.0 - fadeOut * 0.1));
                }
            }
            output = synth.slice();
        }
        this.prevFrame = output.slice();
        this.hasPrevFrame = true;
        this.updateSynthHistory(output);
        return output;
    }
    decodeBuffer(frames, usePlc = false) {
        const output = [];
        this.reset();
        for (const frame of frames) { const decoded = this.decode(frame, usePlc); output.push(...decoded); }
        return new Int16Array(output);
    }
}

class G729Codec {
    constructor() {
        initFixedCodebook();
        this.lossSim = new PacketLossSimulator(0.05);
        this.decoder = new G729Decoder();
    }
    setLossRate(rate) { this.lossSim.setLossRate(rate); }
    getLossRate() { return this.lossSim.getLossRate(); }
    setLossPattern(pattern) { this.lossSim.setLossPattern(pattern); }
    getFrameSize() { return FRAME_SIZE; }
    getSampleRate() { return SAMPLE_RATE; }
    getFrameDurationMs() { return FRAME_DURATION_MS; }
    processFullPipeline(durationMs) {
        const original = generateTestSignal(durationMs);
        const frames = encodeBuffer(original);
        const framesWithLoss = this.lossSim.simulate(frames);
        this.decoder.reset();
        const noPlc = this.decoder.decodeBuffer(framesWithLoss, false);
        this.decoder.reset();
        const withPlc = this.decoder.decodeBuffer(framesWithLoss, true);
        let lostCount = 0, maxBurst = 0, currentBurst = 0;
        for (const f of framesWithLoss) {
            if (f.lost) { lostCount++; currentBurst++; maxBurst = Math.max(maxBurst, currentBurst); }
            else currentBurst = 0;
        }
        const mosResult = MosEstimator.estimate(Array.from(original), Array.from(noPlc), Array.from(withPlc));
        return {
            original: Array.from(original),
            no_plc: Array.from(noPlc),
            with_plc: Array.from(withPlc),
            frames_with_loss: framesWithLoss.map(f => ({ lsp: Array.from(f.lsp), fixed_codebook_index: f.fixed_codebook_index, fixed_codebook_gain: f.fixed_codebook_gain, adaptive_codebook_lag: f.adaptive_codebook_lag, adaptive_codebook_gain: f.adaptive_codebook_gain, lost: f.lost })),
            lost_count: lostCount,
            total_frames: framesWithLoss.length,
            max_burst_length: maxBurst,
            mos_no_plc: mosResult.mos_no_plc,
            mos_with_plc: mosResult.mos_with_plc,
            seg_snr_no_plc: mosResult.seg_snr_no_plc,
            seg_snr_with_plc: mosResult.seg_snr_with_plc,
            pesq_like_no_plc: mosResult.pesq_like_no_plc,
            pesq_like_with_plc: mosResult.pesq_like_with_plc
        };
    }
}

window.G729CodecJS = G729Codec;
