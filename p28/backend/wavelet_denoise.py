import numpy as np
import pywt

def wavelet_denoise_1d(signal, wavelet='db4', level=3, mode='soft'):
    coeffs = pywt.wavedec(signal, wavelet, level=level)
    sigma = np.median(np.abs(coeffs[-1])) / 0.6745
    threshold = sigma * np.sqrt(2 * np.log(len(signal)))
    coeffs_thresh = [coeffs[0]] + [pywt.threshold(c, threshold, mode=mode) for c in coeffs[1:]]
    return pywt.waverec(coeffs_thresh, wavelet)

def wavelet_denoise_2d(ddm, wavelet='db4', level=2, mode='soft'):
    coeffs = pywt.wavedec2(ddm, wavelet, level=level)
    sigma = np.median(np.abs(coeffs[-1][0])) / 0.6745
    threshold = sigma * np.sqrt(2 * np.log(ddm.size))
    coeffs_thresh = [coeffs[0]]
    for detail_level in coeffs[1:]:
        coeffs_thresh.append(tuple(pywt.threshold(d, threshold, mode=mode) for d in detail_level))
    return pywt.waverec2(coeffs_thresh, wavelet)

def calculate_snr(ddm):
    signal = np.max(ddm)
    noise = np.mean(ddm[0:5, 0:5])
    return 10 * np.log10(signal / noise) if noise > 0 else 0

def extract_ddm_features(ddm):
    denoised_ddm = wavelet_denoise_2d(ddm)
    peak_value = np.max(denoised_ddm)
    noise_floor = np.mean(denoised_ddm[0:3, 0:3])
    snr = calculate_snr(denoised_ddm)
    peak_position = np.unravel_index(np.argmax(denoised_ddm), denoised_ddm.shape)
    return {
        'peak_value': peak_value,
        'noise_floor': noise_floor,
        'snr': snr,
        'peak_position': peak_position,
        'denoised_ddm': denoised_ddm
    }
