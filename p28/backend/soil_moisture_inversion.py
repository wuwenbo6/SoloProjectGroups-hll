import numpy as np

SURFACE_TYPES = {
    'SOIL': 'soil',
    'WATER': 'water',
    'FROZEN_SOIL': 'frozen_soil',
    'UNKNOWN': 'unknown'
}

def calculate_reflectivity(ddm_peak, incidence_angle, tx_power, tx_gain, rx_gain, wavelength, distance):
    normalized_peak = ddm_peak / 2.0
    reflectivity = normalized_peak * 0.8
    reflectivity = np.clip(reflectivity, 0, 1)
    return reflectivity

def calculate_ddm_sharpness(denoised_ddm, peak_position):
    rows, cols = denoised_ddm.shape
    peak_row, peak_col = peak_position
    peak_value = denoised_ddm[peak_row, peak_col]
    
    neighborhood = []
    for i in range(max(0, peak_row-2), min(rows, peak_row+3)):
        for j in range(max(0, peak_col-2), min(cols, peak_col+3)):
            if i != peak_row or j != peak_col:
                neighborhood.append(denoised_ddm[i, j])
    
    if len(neighborhood) == 0:
        return 0
    
    avg_neighborhood = np.mean(neighborhood)
    sharpness = peak_value / (avg_neighborhood + 1e-10)
    return sharpness

def detect_water(ddm_features, reflectivity):
    WATER_REFLECTIVITY_THRESHOLD = 0.3
    WATER_SHARPNESS_THRESHOLD = 4.0
    
    sharpness = calculate_ddm_sharpness(
        ddm_features['denoised_ddm'],
        ddm_features['peak_position']
    )
    
    is_water = sharpness > WATER_SHARPNESS_THRESHOLD
    
    return is_water, sharpness

def detect_frozen_soil(reflectivity, temperature=None):
    FROZEN_REFLECTIVITY_RANGE = (0.15, 0.35)
    FROZEN_TEMPERATURE_THRESHOLD = 273.15
    
    if temperature is not None:
        return temperature < FROZEN_TEMPERATURE_THRESHOLD
    
    in_frozen_range = (FROZEN_REFLECTIVITY_RANGE[0] <= reflectivity <= FROZEN_REFLECTIVITY_RANGE[1])
    return in_frozen_range

def frozen_soil_reflectivity_to_moisture(reflectivity):
    ice_dielectric = 3.2
    water_dielectric = 80
    
    effective_dielectric = np.sqrt(reflectivity / 0.9)
    
    if effective_dielectric <= ice_dielectric:
        return 0.0
    
    mv = (effective_dielectric - ice_dielectric) / (water_dielectric - ice_dielectric)
    mv = np.clip(mv, 0, 0.6)
    return mv

def surface_reflectivity_to_soil_moisture(reflectivity, roughness_correction=0.9, clay_content=0.2, surface_type='soil'):
    if surface_type == 'frozen_soil':
        return frozen_soil_reflectivity_to_moisture(reflectivity)
    
    mv = reflectivity / 0.8
    mv = np.clip(mv, 0, 0.6)
    return mv

def classify_surface(ddm_features, reflectivity, temperature=None):
    is_water, sharpness = detect_water(ddm_features, reflectivity)
    
    if is_water:
        return SURFACE_TYPES['WATER'], sharpness
    
    is_frozen = detect_frozen_soil(reflectivity, temperature)
    
    if temperature is not None and is_frozen:
        return SURFACE_TYPES['FROZEN_SOIL'], sharpness
    elif temperature is None and is_frozen and sharpness < 2.0:
        return SURFACE_TYPES['FROZEN_SOIL'], sharpness
    
    if 0.02 <= reflectivity <= 0.8:
        return SURFACE_TYPES['SOIL'], sharpness
    
    return SURFACE_TYPES['UNKNOWN'], sharpness

def ddm_to_soil_moisture(ddm_features, incidence_angle=30, tx_power=120, tx_gain=28, rx_gain=28, distance=400000, temperature=None):
    reflectivity = calculate_reflectivity(
        ddm_features['peak_value'],
        incidence_angle,
        tx_power,
        tx_gain,
        rx_gain,
        0.1905,
        distance
    )
    
    surface_type, sharpness = classify_surface(ddm_features, reflectivity, temperature)
    
    soil_moisture = 0.0
    if surface_type == SURFACE_TYPES['WATER']:
        soil_moisture = 1.0
    elif surface_type == SURFACE_TYPES['FROZEN_SOIL']:
        soil_moisture = surface_reflectivity_to_soil_moisture(reflectivity, surface_type='frozen_soil')
    elif surface_type == SURFACE_TYPES['SOIL']:
        soil_moisture = surface_reflectivity_to_soil_moisture(reflectivity)
    
    return {
        'soil_moisture': float(soil_moisture),
        'surface_type': surface_type,
        'reflectivity': float(reflectivity),
        'sharpness': float(sharpness)
    }

def generate_sample_ddm(rows=17, cols=11, surface_type='soil'):
    x, y = np.meshgrid(np.linspace(-5, 5, cols), np.linspace(-5, 5, rows))
    
    if surface_type == 'water':
        ddm = np.exp(-(x**2 + y**2) / 0.5) * 1.5
    elif surface_type == 'frozen':
        ddm = np.exp(-(x**2 + y**2) / 2) * 0.5
    else:
        ddm = np.exp(-(x**2 + y**2) / 2)
    
    ddm += np.random.normal(0, 0.05, ddm.shape)
    return ddm
