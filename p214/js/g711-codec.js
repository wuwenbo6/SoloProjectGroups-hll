const G711Codec = (function() {
    const ULAW_BIAS = 0x84;
    const ULAW_CLIP = 8159;
    const ULAW_MAX_POSITIVE = 8159;
    const ULAW_MAX_NEGATIVE = -8159;

    const ALAW_CLIP = 4095;
    const ALAW_MAX_POSITIVE = 4095;
    const ALAW_MAX_NEGATIVE = -4095;

    const _uLawDecodeTable = new Int16Array(256);
    const _aLawDecodeTable = new Int16Array(256);

    (function initTables() {
        for (let i = 0; i < 256; i++) {
            const ulaw = ~i & 0xFF;
            let sign = (ulaw & 0x80) >> 7;
            let exponent = (ulaw & 0x70) >> 4;
            let mantissa = ulaw & 0x0F;
            
            let sample;
            if (exponent === 0) {
                sample = (mantissa << 3) + 0x84;
            } else {
                sample = ((mantissa << 3) + 0x104) << (exponent - 1);
            }
            
            sample = Math.max(ULAW_MAX_NEGATIVE, Math.min(ULAW_MAX_POSITIVE, sample));
            _uLawDecodeTable[i] = sign === 0 ? sample : -sample;
        }

        for (let i = 0; i < 256; i++) {
            const alaw = i ^ 0x55;
            let sign = (alaw & 0x80) >> 7;
            let exponent = (alaw & 0x70) >> 4;
            let mantissa = alaw & 0x0F;
            
            let sample;
            if (exponent === 0) {
                sample = (mantissa << 4) + 8;
            } else {
                sample = ((mantissa << 4) + 0x108) << (exponent - 1);
            }
            
            sample = Math.max(ALAW_MAX_NEGATIVE, Math.min(ALAW_MAX_POSITIVE, sample));
            _aLawDecodeTable[i] = sign === 0 ? sample : -sample;
        }
    })();

    function linearToULaw(sample) {
        sample = Math.max(ULAW_MAX_NEGATIVE, Math.min(ULAW_MAX_POSITIVE, sample));
        
        let sign = 0;
        if (sample < 0) {
            sign = 0x80;
            sample = -sample;
        }
        
        if (sample > ULAW_CLIP) {
            sample = ULAW_CLIP;
        }
        
        sample += ULAW_BIAS;
        
        let exponent = 7;
        for (let expMask = 0x1000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
            exponent--;
        }
        
        const mantissa = (sample >> (exponent + 3)) & 0x0F;
        const ulawByte = ~(sign | (exponent << 4) | mantissa) & 0xFF;
        
        return ulawByte;
    }

    function uLawToLinear(ulawByte) {
        return _uLawDecodeTable[ulawByte & 0xFF];
    }

    function linearToALaw(sample) {
        sample = Math.max(ALAW_MAX_NEGATIVE, Math.min(ALAW_MAX_POSITIVE, sample));
        
        let sign = 0;
        if (sample < 0) {
            sign = 0x80;
            sample = -sample;
        }
        
        if (sample > ALAW_CLIP) {
            sample = ALAW_CLIP;
        }
        
        let exponent = 7;
        if (sample < 256) {
            exponent = 0;
        } else {
            for (let expMask = 0x1000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
                exponent--;
            }
        }
        
        let mantissa;
        if (exponent === 0) {
            mantissa = (sample >> 4) & 0x0F;
        } else {
            mantissa = (sample >> (exponent + 3)) & 0x0F;
        }
        
        let alawByte = (sign | (exponent << 4) | mantissa) & 0xFF;
        alawByte ^= 0x55;
        
        return alawByte;
    }

    function aLawToLinear(alawByte) {
        return _aLawDecodeTable[alawByte & 0xFF];
    }

    function encodeBufferULaw(pcmBuffer) {
        const length = pcmBuffer.length;
        const encoded = new Uint8Array(length);
        
        for (let i = 0; i < length; i++) {
            const pcm = Math.round(pcmBuffer[i] * ULAW_MAX_POSITIVE);
            encoded[i] = linearToULaw(pcm);
        }
        
        return encoded;
    }

    function decodeBufferULaw(ulawBuffer) {
        const length = ulawBuffer.length;
        const decoded = new Float32Array(length);
        
        for (let i = 0; i < length; i++) {
            decoded[i] = uLawToLinear(ulawBuffer[i]) / ULAW_MAX_POSITIVE;
        }
        
        return decoded;
    }

    function encodeBufferALaw(pcmBuffer) {
        const length = pcmBuffer.length;
        const encoded = new Uint8Array(length);
        
        for (let i = 0; i < length; i++) {
            const pcm = Math.round(pcmBuffer[i] * ALAW_MAX_POSITIVE);
            encoded[i] = linearToALaw(pcm);
        }
        
        return encoded;
    }

    function decodeBufferALaw(alawBuffer) {
        const length = alawBuffer.length;
        const decoded = new Float32Array(length);
        
        for (let i = 0; i < length; i++) {
            decoded[i] = aLawToLinear(alawBuffer[i]) / ALAW_MAX_POSITIVE;
        }
        
        return decoded;
    }

    function encodeFloat32(float32Array, codecType = 'ulaw') {
        if (codecType === 'alaw') {
            return encodeBufferALaw(float32Array);
        } else {
            return encodeBufferULaw(float32Array);
        }
    }

    function decodeToFloat32(uint8Array, codecType = 'ulaw') {
        if (codecType === 'alaw') {
            return decodeBufferALaw(uint8Array);
        } else {
            return decodeBufferULaw(uint8Array);
        }
    }

    function getCodecInfo(codecType) {
        if (codecType === 'alaw') {
            return {
                name: 'G.711 A-law',
                maxPositive: ALAW_MAX_POSITIVE,
                maxNegative: ALAW_MAX_NEGATIVE,
                clip: ALAW_CLIP,
                bitRate: 64,
                description: '欧洲及国际电话系统标准'
            };
        } else {
            return {
                name: 'G.711 μ-law',
                maxPositive: ULAW_MAX_POSITIVE,
                maxNegative: ULAW_MAX_NEGATIVE,
                clip: ULAW_CLIP,
                bitRate: 64,
                description: '北美及日本电话系统标准'
            };
        }
    }

    return {
        linearToULaw,
        uLawToLinear,
        linearToALaw,
        aLawToLinear,
        encodeBufferULaw,
        decodeBufferULaw,
        encodeBufferALaw,
        decodeBufferALaw,
        encodeFloat32,
        decodeToFloat32,
        getCodecInfo,
        ULAW_MAX_POSITIVE,
        ULAW_MAX_NEGATIVE,
        ALAW_MAX_POSITIVE,
        ALAW_MAX_NEGATIVE
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = G711Codec;
}
