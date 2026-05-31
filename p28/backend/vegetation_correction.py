import numpy as np

def calculate_ndvi(red_reflectance, nir_reflectance):
    if (nir_reflectance + red_reflectance) == 0:
        return 0.0
    ndvi = (nir_reflectance - red_reflectance) / (nir_reflectance + red_reflectance)
    return np.clip(ndvi, -1, 1)

def ndvi_to_vwc(ndvi, ndvi_soil=0.1, ndvi_full=0.8, vwc_max=5.0):
    if ndvi <= ndvi_soil:
        return 0.0
    elif ndvi >= ndvi_full:
        return vwc_max
    
    ndvi_norm = (ndvi - ndvi_soil) / (ndvi_full - ndvi_soil)
    vwc = vwc_max * np.sqrt(ndvi_norm)
    return vwc

def estimate_ndvi_from_ddm(ddm_peak, snr, incidence_angle=30):
    base_ndvi = 0.3
    snr_factor = np.clip(snr / 15, 0.5, 1.5)
    peak_factor = np.clip(ddm_peak / 1.0, 0.5, 1.2)
    ndvi = base_ndvi * snr_factor * peak_factor
    return np.clip(ndvi, 0.05, 0.8)

def vegetation_attenuation_correction(soil_moisture, vwc, frequency=1.575e9):
    wavelength = 3e8 / frequency
    attenuation = 0.1 * vwc
    correction_factor = np.exp(attenuation / 10)
    corrected_sm = soil_moisture * correction_factor
    return np.clip(corrected_sm, 0, 0.6)

def tau_omega_model(soil_moisture, vwc, surface_roughness=0.1):
    veg_dielectric = 1.5 + 0.5 * vwc
    veg_transmission = np.exp(-0.2 * vwc)
    
    soil_dielectric = 1 + 79 * soil_moisture
    soil_reflectivity = (np.sqrt(soil_dielectric) - 1) / (np.sqrt(soil_dielectric) + 1)
    soil_reflectivity = soil_reflectivity ** 2 * (1 - surface_roughness)
    
    total_reflectivity = (1 - veg_transmission ** 2) + veg_transmission ** 2 * soil_reflectivity
    
    effective_dielectric = ((1 + np.sqrt(total_reflectivity)) / (1 - np.sqrt(total_reflectivity))) ** 2
    corrected_sm = (effective_dielectric - 1) / 79
    
    return np.clip(corrected_sm, 0, 0.6)

def correct_soil_moisture_for_vegetation(soil_moisture, ddm_features=None, ndvi=None, vwc=None, method='tau_omega'):
    if vwc is None:
        if ndvi is None and ddm_features is not None:
            ndvi = estimate_ndvi_from_ddm(
                ddm_features['peak_value'],
                ddm_features.get('snr', 10)
            )
        if ndvi is not None:
            vwc = ndvi_to_vwc(ndvi)
        else:
            vwc = 2.0
    
    if method == 'tau_omega':
        return tau_omega_model(soil_moisture, vwc)
    elif method == 'attenuation':
        return vegetation_attenuation_correction(soil_moisture, vwc)
    else:
        return soil_moisture

def calculate_vegetation_index(ddm_features):
    return {
        'estimated_ndvi': estimate_ndvi_from_ddm(ddm_features['peak_value'], ddm_features.get('snr', 10)),
        'estimated_vwc': ndvi_to_vwc(estimate_ndvi_from_ddm(ddm_features['peak_value'], ddm_features.get('snr', 10)))
    }
