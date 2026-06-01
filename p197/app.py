import math
import io
import datetime
import numpy as np
from flask import Flask, request, jsonify, render_template, make_response
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.graphics.shapes import Drawing, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics import renderPDF

app = Flask(__name__)

BOLTZMANN = -228.6

K_H_TABLE = {
    1: 0.0000387, 2: 0.000154, 4: 0.000650, 6: 0.00175, 7: 0.00262,
    8: 0.00454, 10: 0.0101, 12: 0.0188, 15: 0.0367, 20: 0.0751,
    25: 0.124, 30: 0.187, 35: 0.263, 40: 0.350, 45: 0.442, 50: 0.536
}

K_V_TABLE = {
    1: 0.0000352, 2: 0.000138, 4: 0.000591, 6: 0.00155, 7: 0.00233,
    8: 0.00395, 10: 0.00887, 12: 0.0168, 15: 0.0335, 20: 0.0691,
    25: 0.113, 30: 0.167, 35: 0.233, 40: 0.310, 45: 0.393, 50: 0.479
}

ALPHA_H_TABLE = {
    1: 0.912, 2: 0.963, 4: 1.121, 6: 1.308, 7: 1.332,
    8: 1.327, 10: 1.276, 12: 1.217, 15: 1.154, 20: 1.099,
    25: 1.061, 30: 1.021, 35: 0.979, 40: 0.939, 45: 0.903, 50: 0.873
}

ALPHA_V_TABLE = {
    1: 0.880, 2: 0.923, 4: 1.075, 6: 1.265, 7: 1.312,
    8: 1.310, 10: 1.264, 12: 1.200, 15: 1.128, 20: 1.065,
    25: 1.030, 30: 0.993, 35: 0.957, 40: 0.924, 45: 0.897, 50: 0.873
}


def _log_interp(freq_ghz, table):
    keys = sorted(table.keys())
    if freq_ghz <= keys[0]:
        return table[keys[0]]
    if freq_ghz >= keys[-1]:
        return table[keys[-1]]
    idx = np.searchsorted(keys, freq_ghz)
    f1, f2 = keys[idx - 1], keys[idx]
    v1, v2 = table[f1], table[f2]
    ratio = math.log(freq_ghz / f1) / math.log(f2 / f1)
    return v1 * (v2 / v1) ** ratio


def _get_rain_coefficients(freq_ghz, polarization_angle_deg, elevation_angle_deg):
    k_h = _log_interp(freq_ghz, K_H_TABLE)
    k_v = _log_interp(freq_ghz, K_V_TABLE)
    alpha_h = _log_interp(freq_ghz, ALPHA_H_TABLE)
    alpha_v = _log_interp(freq_ghz, ALPHA_V_TABLE)

    tau = polarization_angle_deg
    elev_rad = math.radians(elevation_angle_deg)
    cos_tau = math.cos(math.radians(tau))
    sin_tau = math.sin(math.radians(tau))
    cos_elev = math.cos(elev_rad)

    k = (k_h + k_v + (k_h - k_v) * cos_tau ** 2 * cos_elev ** 2) / 2
    alpha = (k_h * alpha_h + k_v * alpha_v +
             (k_h * alpha_h - k_v * alpha_v) * cos_tau ** 2 * cos_elev ** 2) / (2 * k)

    return k, alpha


def calculate_rain_height(lat_deg):
    if abs(lat_deg) < 23:
        h_r = 4.5
    else:
        h_r = 4.5 - 0.075 * (abs(lat_deg) - 23)
    return max(h_r, 0.5)


def calculate_eirp(tx_power_dbm, tx_gain_dbi, tx_loss_db):
    return tx_power_dbm + tx_gain_dbi - tx_loss_db


def calculate_free_space_loss(freq_ghz, distance_km):
    return 92.45 + 20 * math.log10(freq_ghz) + 20 * math.log10(distance_km)


def calculate_atmospheric_absorption_p676(freq_ghz, elevation_angle_deg,
                                          temperature_c=15, pressure_hpa=1013.25,
                                          water_density_gm3=7.5):
    if freq_ghz < 0.1:
        return 0.0

    T = temperature_c + 273.15
    p = pressure_hpa
    rho = water_density_gm3

    f = freq_ghz

    oxygen_lines = [
        (50.474238, 0.212, 10.69, 0.19, 1.60, 0.30),
        (50.987745, 0.211, 10.54, 0.18, 1.60, 0.30),
        (51.503350, 0.208, 10.35, 0.18, 1.55, 0.30),
        (52.021409, 0.206, 10.21, 0.17, 1.55, 0.30),
        (52.542393, 0.203, 10.01, 0.17, 1.54, 0.30),
        (53.066906, 0.201, 9.84, 0.16, 1.53, 0.30),
        (53.534738, 0.199, 9.66, 0.16, 1.51, 0.30),
        (54.130009, 0.196, 9.45, 0.15, 1.50, 0.30),
        (54.671153, 0.194, 9.24, 0.15, 1.49, 0.30),
        (55.221370, 0.192, 9.03, 0.14, 1.47, 0.30),
        (55.783800, 0.190, 8.83, 0.14, 1.46, 0.30),
        (56.264775, 0.187, 8.62, 0.13, 1.44, 0.30),
        (56.363388, 0.187, 8.56, 0.13, 1.43, 0.30),
        (56.968191, 0.185, 8.36, 0.13, 1.42, 0.30),
        (57.612481, 0.183, 8.16, 0.12, 1.40, 0.30),
        (58.323875, 0.181, 7.96, 0.12, 1.38, 0.30),
        (58.446510, 0.181, 7.91, 0.12, 1.38, 0.30),
        (59.590982, 0.180, 7.60, 0.11, 1.34, 0.30),
        (60.434775, 0.179, 7.37, 0.10, 1.30, 0.30),
        (61.150558, 0.178, 7.17, 0.10, 1.27, 0.30),
        (61.800221, 0.177, 7.01, 0.10, 1.24, 0.30),
        (62.499213, 0.176, 6.85, 0.09, 1.22, 0.30),
        (63.637874, 0.175, 6.59, 0.09, 1.17, 0.30),
        (64.127767, 0.175, 6.48, 0.08, 1.15, 0.30),
        (65.215397, 0.174, 6.25, 0.08, 1.12, 0.30),
        (66.401907, 0.174, 6.04, 0.08, 1.08, 0.30),
        (67.804217, 0.173, 5.81, 0.07, 1.04, 0.30),
        (68.752830, 0.173, 5.68, 0.07, 1.01, 0.30),
        (69.027804, 0.173, 5.64, 0.07, 1.00, 0.30),
        (70.069260, 0.173, 5.47, 0.07, 0.97, 0.30),
        (71.570634, 0.174, 5.26, 0.06, 0.93, 0.30),
        (72.278285, 0.174, 5.18, 0.06, 0.91, 0.30),
        (72.958641, 0.175, 5.10, 0.06, 0.89, 0.30),
        (74.031960, 0.176, 4.97, 0.06, 0.85, 0.30),
        (74.814888, 0.177, 4.88, 0.05, 0.83, 0.30),
        (75.858548, 0.179, 4.77, 0.05, 0.80, 0.30),
        (77.753276, 0.182, 4.58, 0.05, 0.76, 0.30),
        (78.915530, 0.185, 4.47, 0.05, 0.73, 0.30),
        (79.936075, 0.188, 4.39, 0.04, 0.71, 0.30),
        (81.033879, 0.191, 4.31, 0.04, 0.69, 0.30),
        (82.070049, 0.195, 4.24, 0.04, 0.67, 0.30),
        (83.829434, 0.202, 4.14, 0.04, 0.64, 0.30),
        (85.272737, 0.209, 4.08, 0.04, 0.62, 0.30),
        (86.243937, 0.214, 4.05, 0.03, 0.61, 0.30),
        (87.829080, 0.225, 4.00, 0.03, 0.59, 0.30),
        (89.033460, 0.233, 3.98, 0.03, 0.57, 0.30),
        (90.206805, 0.242, 3.97, 0.03, 0.56, 0.30),
        (91.541744, 0.253, 3.96, 0.03, 0.55, 0.30),
        (92.633684, 0.264, 3.96, 0.03, 0.54, 0.30),
        (93.770140, 0.276, 3.97, 0.03, 0.53, 0.30),
        (95.248224, 0.294, 3.99, 0.02, 0.52, 0.30),
        (96.569372, 0.313, 4.02, 0.02, 0.51, 0.30),
        (97.637027, 0.330, 4.06, 0.02, 0.50, 0.30),
        (98.644649, 0.349, 4.11, 0.02, 0.49, 0.30),
        (99.492509, 0.366, 4.17, 0.02, 0.49, 0.30),
        (100.265129, 0.384, 4.23, 0.02, 0.48, 0.30),
        (101.256529, 0.411, 4.32, 0.02, 0.47, 0.30),
        (102.103649, 0.437, 4.42, 0.02, 0.46, 0.30),
        (103.134339, 0.472, 4.55, 0.02, 0.45, 0.30),
        (104.079429, 0.507, 4.69, 0.02, 0.44, 0.30),
        (105.307679, 0.557, 4.87, 0.02, 0.44, 0.30),
        (106.601329, 0.613, 5.07, 0.02, 0.43, 0.30),
        (107.896519, 0.672, 5.28, 0.02, 0.42, 0.30),
        (109.402339, 0.748, 5.53, 0.01, 0.42, 0.30),
        (110.437719, 0.803, 5.70, 0.01, 0.41, 0.30),
        (111.671709, 0.870, 5.89, 0.01, 0.41, 0.30),
        (113.089839, 0.949, 6.10, 0.01, 0.40, 0.30),
        (114.375989, 1.022, 6.28, 0.01, 0.40, 0.30),
        (115.842989, 1.104, 6.45, 0.01, 0.39, 0.30),
        (117.553129, 1.198, 6.62, 0.01, 0.39, 0.30),
        (119.246999, 1.283, 6.75, 0.01, 0.38, 0.30),
        (120.995639, 1.361, 6.85, 0.01, 0.38, 0.30),
        (122.695879, 1.419, 6.89, 0.01, 0.38, 0.30),
        (124.312649, 1.450, 6.87, 0.01, 0.38, 0.30),
        (125.834989, 1.451, 6.80, 0.01, 0.38, 0.30),
        (127.338489, 1.422, 6.68, 0.01, 0.38, 0.30),
        (128.906359, 1.362, 6.51, 0.01, 0.38, 0.30),
        (130.478219, 1.276, 6.31, 0.01, 0.38, 0.30),
        (132.108589, 1.164, 6.09, 0.01, 0.38, 0.30),
        (133.906639, 1.029, 5.85, 0.01, 0.38, 0.30),
        (135.777879, 0.885, 5.62, 0.01, 0.38, 0.30),
        (137.668559, 0.743, 5.40, 0.01, 0.38, 0.30),
        (139.653069, 0.612, 5.20, 0.01, 0.38, 0.30),
        (141.630769, 0.500, 5.02, 0.01, 0.38, 0.30),
        (143.702489, 0.408, 4.87, 0.01, 0.38, 0.30),
        (145.848509, 0.332, 4.73, 0.01, 0.38, 0.30),
        (148.121759, 0.270, 4.60, 0.01, 0.38, 0.30),
        (150.497959, 0.220, 4.48, 0.01, 0.38, 0.30),
        (152.980739, 0.181, 4.37, 0.01, 0.38, 0.30),
        (155.594199, 0.149, 4.27, 0.01, 0.38, 0.30),
        (158.299119, 0.124, 4.18, 0.01, 0.38, 0.30),
        (161.186859, 0.103, 4.09, 0.01, 0.38, 0.30),
        (164.227839, 0.087, 4.01, 0.01, 0.38, 0.30),
        (167.516679, 0.073, 3.94, 0.01, 0.38, 0.30),
        (170.908579, 0.062, 3.87, 0.01, 0.38, 0.30),
        (174.565389, 0.053, 3.80, 0.01, 0.38, 0.30),
        (178.379589, 0.045, 3.74, 0.01, 0.38, 0.30),
        (182.432219, 0.039, 3.68, 0.01, 0.38, 0.30),
        (186.642839, 0.034, 3.63, 0.01, 0.38, 0.30),
        (191.017159, 0.030, 3.58, 0.01, 0.38, 0.30),
        (195.529159, 0.026, 3.53, 0.01, 0.38, 0.30),
        (200.305159, 0.023, 3.48, 0.01, 0.38, 0.30),
    ]

    water_vapor_lines = [
        (22.235, 0.1090, 2.85, 27.7, 4.80, 0.44),
        (67.800, 0.0011, 8.70, 27.7, 4.93, 0.19),
        (119.750, 0.0007, 8.35, 27.7, 4.78, 0.34),
        (183.310, 2.3000, 0.55, 27.7, 5.02, 0.16),
        (321.225, 0.0460, 6.55, 27.7, 4.85, 0.22),
        (325.045, 1.5000, 1.50, 27.7, 4.97, 0.17),
        (336.187, 0.0010, 9.80, 27.7, 4.76, 0.23),
        (380.197, 11.900, 1.05, 27.7, 5.03, 0.16),
        (390.100, 0.0044, 7.70, 27.7, 4.81, 0.20),
        (437.347, 0.0640, 5.05, 27.7, 4.84, 0.22),
        (439.150, 0.8200, 3.60, 27.7, 4.94, 0.18),
        (443.130, 0.0250, 5.80, 27.7, 4.83, 0.22),
        (448.001, 10.600, 1.40, 27.7, 5.04, 0.17),
        (470.889, 0.3300, 3.60, 27.7, 4.93, 0.19),
        (474.689, 1.2800, 2.10, 27.7, 4.99, 0.17),
        (488.491, 0.2500, 2.85, 27.7, 4.93, 0.19),
        (503.568, 0.0380, 6.50, 27.7, 4.81, 0.22),
        (504.482, 0.0130, 6.65, 27.7, 4.79, 0.23),
        (556.936, 49.400, 0.11, 27.7, 5.14, 0.15),
        (620.700, 5.0900, 2.20, 27.7, 4.68, 0.18),
        (658.005, 0.2700, 7.17, 27.7, 4.68, 0.20),
        (752.033, 240.00, 0.036, 27.7, 5.13, 0.11),
        (841.073, 0.0130, 8.13, 27.7, 4.62, 0.24),
        (859.865, 0.1330, 7.95, 27.7, 4.64, 0.21),
        (899.407, 0.0550, 7.80, 27.7, 4.65, 0.22),
        (902.555, 0.0380, 8.45, 27.7, 4.61, 0.25),
        (906.205, 0.0320, 8.70, 27.7, 4.60, 0.26),
        (916.172, 8.5600, 1.45, 27.7, 4.72, 0.18),
        (923.118, 0.0870, 10.5, 27.7, 4.53, 0.24),
        (970.315, 8.9100, 1.25, 27.7, 4.78, 0.18),
        (987.927, 132.70, 0.13, 27.7, 5.13, 0.11),
    ]

    theta = 300.0 / T
    p_ref = p / 1013.25
    rho_ref = rho * theta ** 5 * math.exp(6.1108 * (1 - theta))

    gamma_oxygen_dry = 0.0
    for line in oxygen_lines:
        f0, a1, a2, a3, a4, a5 = line
        if f0 < 50 or f0 > 70:
            continue
        delta = a5 * p_ref * theta ** a4
        line_shape = f / (f0 * ((f0 ** 2 - f ** 2) ** 2 + (f * delta) ** 2))
        gamma_oxygen_dry += a1 * p_ref * theta ** 3 * line_shape * 1e-3

    gamma_oxygen_nonres = 7.2 * p_ref ** 2 * theta ** 2.8 / (f ** 2 + 0.34 * p_ref ** 2 * theta ** 1.6)
    gamma_oxygen_nonres += 1e-3 * (7.2 * p_ref ** 2 * theta ** 2.8) / ((54 - f) ** 2 + 0.9 * p_ref ** 2 * theta ** 1.6) if f < 54 else 0
    gamma_oxygen_nonres += 1e-3 * (7.2 * p_ref ** 2 * theta ** 2.8) / ((f - 118) ** 2 + 0.9 * p_ref ** 2 * theta ** 1.6) if f > 118 and f < 200 else 0

    gamma_oxygen = 0.0
    for line in oxygen_lines:
        f0, a1, a2, a3, a4, a5 = line
        delta_f = a2 * p_ref * theta ** (0.8 - a3) + a4 * p_ref * theta ** a3
        shape = delta_f / ((f0 - f) ** 2 + delta_f ** 2)
        gamma_oxygen += a1 * p_ref * theta ** 3 * shape * 1e-3

    gamma_oxygen += gamma_oxygen_nonres

    gamma_water = 0.0
    for line in water_vapor_lines:
        f0, a1, a2, a3, a4, a5 = line
        if f0 > 200:
            continue
        delta_f = a2 * p_ref * theta ** (0.8 - a3) + a4 * rho_ref * theta ** a3
        shape = delta_f / ((f0 - f) ** 2 + delta_f ** 2)
        gamma_water += a1 * rho_ref * theta ** 3.5 * shape * 1e-3

    gamma_water += 6.56e-4 * rho_ref * theta ** 2.4

    gamma_total = gamma_oxygen + gamma_water

    elev = max(elevation_angle_deg, 0.5)
    elev_rad = math.radians(elev)

    h_oxygen = 6.0
    h_water = 1.6 * math.log(1 + 12 * rho * (0.015 * 293 / T) ** 1.5) if rho > 0 else 1.6

    a_oxygen = gamma_oxygen * h_oxygen * math.sqrt(1 + 0.5 * (h_oxygen / 8500 * math.cos(elev_rad)) ** 2) / math.sin(elev_rad)
    a_water = gamma_water * h_water * math.sqrt(1 + 0.5 * (h_water / 2000 * math.cos(elev_rad)) ** 2) / math.sin(elev_rad)

    total_atten = a_oxygen + a_water
    return max(total_atten, 0.0)


def calculate_rain_attenuation_p618(freq_ghz, elevation_angle_deg,
                                    rain_rate_mmhr, polarization_angle_deg,
                                    availability, lat_deg, h_s_km=0.5):
    if freq_ghz < 1 or rain_rate_mmhr <= 0:
        return 0.0

    elev = max(elevation_angle_deg, 0.5)
    elev_rad = math.radians(elev)

    h_r = calculate_rain_height(lat_deg)

    L_s = (h_r - h_s_km) / math.sin(elev_rad) if h_r > h_s_km else 0.0
    if L_s <= 0:
        return 0.0

    L_g = L_s * math.cos(elev_rad)

    k, alpha = _get_rain_coefficients(freq_ghz, polarization_angle_deg, elev)

    gamma_r = k * (rain_rate_mmhr ** alpha)

    if L_g > 0 and gamma_r > 0:
        r_001 = 1 / (1 + 0.78 * math.sqrt(L_g * gamma_r / freq_ghz) -
                      0.38 * (1 - math.exp(-2 * L_g)))
    else:
        r_001 = 1.0

    A_001 = gamma_r * L_s * r_001

    p = 100 - availability
    if p <= 0:
        p = 0.001
    if p >= 100:
        return 0.0

    if abs(p - 0.01) < 1e-9:
        return max(A_001, 0.0)

    beta_p = 0.0
    if p < 1:
        beta_p = 0.0
    elif p < 0.01:
        beta_p = 0.0
    else:
        if 0.01 <= p <= 1:
            beta_p = -0.655
        else:
            beta_p = -0.446

    if A_001 > 0:
        A_p = A_001 * (p / 0.01) ** (-(0.655 + 0.033 * math.log(p) -
                                          0.013 * math.log(A_001) +
                                          0.017 * math.log(0.01) ** 2 +
                                          0.007 * math.log(p) ** 2))
    else:
        A_p = 0.0

    return max(A_p, 0.0)


def calculate_scintillation_p618(freq_ghz, elevation_angle_deg, availability,
                                 antenna_diameter_m=1.0, antenna_efficiency=0.5):
    elev = max(elevation_angle_deg, 0.5)
    elev_rad = math.radians(elev)

    sigma_ref = 3.6 * (freq_ghz ** (-7.0 / 12.0)) * 1e-3

    D_eff = math.sqrt(antenna_efficiency) * antenna_diameter_m
    if D_eff > 0:
        lam = 0.3 / freq_ghz
        x = 1.22 * lam / D_eff
        sigma_ref *= math.sqrt(x / math.sin(elev_rad)) if x < math.sqrt(elev_rad * lam / 8500) else 1.0

    p = max(100 - availability, 0.001)

    if sigma_ref > 0:
        q = -0.25
        A_s = sigma_ref * (-math.log(p / 100)) ** (5.0 / 12.0)
    else:
        A_s = 0.0

    return max(A_s, 0.0)


def calculate_link_budget(params):
    freq_ghz = params.get('freq_ghz', 12)
    distance_km = params.get('distance_km', 35786)
    tx_power_dbm = params.get('tx_power_dbm', 40)
    tx_gain_dbi = params.get('tx_gain_dbi', 40)
    tx_loss_db = params.get('tx_loss_db', 2)
    rx_gain_dbi = params.get('rx_gain_dbi', 35)
    rx_loss_db = params.get('rx_loss_db', 1)
    elevation_angle_deg = params.get('elevation_angle_deg', 45)
    rain_rate_mmhr = params.get('rain_rate_mmhr', 10)
    polarization_angle_deg = params.get('polarization_angle_deg', 0)
    availability = params.get('availability', 99.9)
    bandwidth_hz = params.get('bandwidth_hz', 1e6)
    noise_figure_db = params.get('noise_figure_db', 3)
    system_temp_k = params.get('system_temp_k', 290)
    lat_deg = params.get('lat_deg', 35)
    h_s_km = params.get('h_s_km', 0.5)
    antenna_diameter_m = params.get('antenna_diameter_m', 1.0)
    temperature_c = params.get('temperature_c', 15)
    pressure_hpa = params.get('pressure_hpa', 1013.25)
    water_density_gm3 = params.get('water_density_gm3', 7.5)

    eirp = calculate_eirp(tx_power_dbm, tx_gain_dbi, tx_loss_db)

    free_space_loss = calculate_free_space_loss(freq_ghz, distance_km)

    atmospheric_loss = calculate_atmospheric_absorption_p676(
        freq_ghz, elevation_angle_deg, temperature_c, pressure_hpa, water_density_gm3
    )

    rain_loss = calculate_rain_attenuation_p618(
        freq_ghz, elevation_angle_deg, rain_rate_mmhr,
        polarization_angle_deg, availability, lat_deg, h_s_km
    )

    scintillation_loss = calculate_scintillation_p618(
        freq_ghz, elevation_angle_deg, availability, antenna_diameter_m
    )

    total_loss = free_space_loss + atmospheric_loss + rain_loss + scintillation_loss + tx_loss_db + rx_loss_db

    rx_power_dbm = eirp - free_space_loss - atmospheric_loss - rain_loss - scintillation_loss + rx_gain_dbi - rx_loss_db

    noise_power_dbm = BOLTZMANN + 10 * math.log10(system_temp_k) + 10 * math.log10(bandwidth_hz)
    noise_total_dbm = noise_power_dbm + noise_figure_db

    snr_db = rx_power_dbm - noise_total_dbm

    h_rain = calculate_rain_height(lat_deg)

    result = {
        'eirp': {
            'value': round(eirp, 2),
            'unit': 'dBm',
            'description': '有效全向辐射功率'
        },
        'losses': {
            'free_space': {
                'value': round(free_space_loss, 2),
                'unit': 'dB',
                'description': '自由空间传播损耗'
            },
            'atmospheric': {
                'value': round(atmospheric_loss, 2),
                'unit': 'dB',
                'description': '大气吸收损耗 (ITU-R P.676)'
            },
            'rain': {
                'value': round(rain_loss, 2),
                'unit': 'dB',
                'description': '雨衰 (ITU-R P.618/P.838)'
            },
            'scintillation': {
                'value': round(scintillation_loss, 2),
                'unit': 'dB',
                'description': '闪烁衰落 (ITU-R P.618)'
            },
            'total': {
                'value': round(total_loss, 2),
                'unit': 'dB',
                'description': '总链路损耗'
            }
        },
        'received_power': {
            'value': round(rx_power_dbm, 2),
            'unit': 'dBm',
            'description': '接收功率'
        },
        'noise': {
            'thermal_noise': {
                'value': round(noise_power_dbm, 2),
                'unit': 'dBm',
                'description': '热噪声功率'
            },
            'total_noise': {
                'value': round(noise_total_dbm, 2),
                'unit': 'dBm',
                'description': '总噪声功率'
            }
        },
        'snr': {
            'value': round(snr_db, 2),
            'unit': 'dB',
            'description': '信噪比'
        },
        'auxiliary': {
            'rain_height_km': round(h_rain, 2),
            'rain_height_description': '雨高 (ITU-R P.839)'
        },
        'parameters': {
            'freq_ghz': freq_ghz,
            'distance_km': distance_km,
            'elevation_angle_deg': elevation_angle_deg,
            'rain_rate_mmhr': rain_rate_mmhr,
            'availability': availability,
            'lat_deg': lat_deg,
            'h_s_km': h_s_km
        }
    }

    return result


def calculate_frequency_sweep(params):
    freqs = np.arange(1, 51, 0.5)
    results = []
    for f in freqs:
        p = dict(params)
        p['freq_ghz'] = float(f)
        r = calculate_link_budget(p)
        results.append({
            'freq_ghz': float(f),
            'free_space': r['losses']['free_space']['value'],
            'atmospheric': r['losses']['atmospheric']['value'],
            'rain': r['losses']['rain']['value'],
            'scintillation': r['losses']['scintillation']['value'],
            'snr': r['snr']['value'],
            'rx_power': r['received_power']['value']
        })
    return results


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()

        required_params = ['freq_ghz', 'distance_km']
        for param in required_params:
            if param not in data:
                return jsonify({'error': f'缺少必需参数: {param}'}), 400

        params = {
            'freq_ghz': float(data['freq_ghz']),
            'distance_km': float(data['distance_km']),
            'tx_power_dbm': float(data.get('tx_power_dbm', 40)),
            'tx_gain_dbi': float(data.get('tx_gain_dbi', 40)),
            'tx_loss_db': float(data.get('tx_loss_db', 2)),
            'rx_gain_dbi': float(data.get('rx_gain_dbi', 35)),
            'rx_loss_db': float(data.get('rx_loss_db', 1)),
            'elevation_angle_deg': float(data.get('elevation_angle_deg', 45)),
            'rain_rate_mmhr': float(data.get('rain_rate_mmhr', 10)),
            'polarization_angle_deg': float(data.get('polarization_angle_deg', 0)),
            'availability': float(data.get('availability', 99.9)),
            'bandwidth_hz': float(data.get('bandwidth_hz', 1e6)),
            'noise_figure_db': float(data.get('noise_figure_db', 3)),
            'system_temp_k': float(data.get('system_temp_k', 290)),
            'lat_deg': float(data.get('lat_deg', 35)),
            'h_s_km': float(data.get('h_s_km', 0.5)),
            'antenna_diameter_m': float(data.get('antenna_diameter_m', 1.0)),
            'temperature_c': float(data.get('temperature_c', 15)),
            'pressure_hpa': float(data.get('pressure_hpa', 1013.25)),
            'water_density_gm3': float(data.get('water_density_gm3', 7.5))
        }

        if params['freq_ghz'] <= 0 or params['freq_ghz'] > 50:
            return jsonify({'error': '频率必须在 0.1-50 GHz 范围内'}), 400
        if params['distance_km'] <= 0 or params['distance_km'] > 1000000:
            return jsonify({'error': '距离必须在 1-1,000,000 km 范围内'}), 400

        result = calculate_link_budget(params)
        return jsonify(result)

    except ValueError as e:
        return jsonify({'error': f'参数格式错误: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'计算错误: {str(e)}'}), 500


@app.route('/api/sweep', methods=['POST'])
def sweep():
    try:
        data = request.get_json()

        params = {
            'distance_km': float(data.get('distance_km', 35786)),
            'tx_power_dbm': float(data.get('tx_power_dbm', 40)),
            'tx_gain_dbi': float(data.get('tx_gain_dbi', 40)),
            'tx_loss_db': float(data.get('tx_loss_db', 2)),
            'rx_gain_dbi': float(data.get('rx_gain_dbi', 35)),
            'rx_loss_db': float(data.get('rx_loss_db', 1)),
            'elevation_angle_deg': float(data.get('elevation_angle_deg', 45)),
            'rain_rate_mmhr': float(data.get('rain_rate_mmhr', 10)),
            'polarization_angle_deg': float(data.get('polarization_angle_deg', 0)),
            'availability': float(data.get('availability', 99.9)),
            'bandwidth_hz': float(data.get('bandwidth_hz', 1e6)),
            'noise_figure_db': float(data.get('noise_figure_db', 3)),
            'system_temp_k': float(data.get('system_temp_k', 290)),
            'lat_deg': float(data.get('lat_deg', 35)),
            'h_s_km': float(data.get('h_s_km', 0.5)),
            'antenna_diameter_m': float(data.get('antenna_diameter_m', 1.0)),
            'temperature_c': float(data.get('temperature_c', 15)),
            'pressure_hpa': float(data.get('pressure_hpa', 1013.25)),
            'water_density_gm3': float(data.get('water_density_gm3', 7.5))
        }

        results = calculate_frequency_sweep(params)
        return jsonify(results)

    except Exception as e:
        return jsonify({'error': f'扫描计算错误: {str(e)}'}), 500


def calculate_multibeam(base_params, beams):
    results = []
    for beam in beams:
        params = dict(base_params)
        params.update(beam)
        r = calculate_link_budget(params)
        r['beam_name'] = beam.get('name', f'Beam {len(results)+1}')
        r['beam_id'] = beam.get('id', len(results))
        results.append(r)

    best_snr = max(results, key=lambda x: x['snr']['value'])
    worst_snr = min(results, key=lambda x: x['snr']['value'])
    avg_snr = sum(r['snr']['value'] for r in results) / len(results)

    analysis = {
        'beams': results,
        'summary': {
            'beam_count': len(results),
            'best_snr_beam': best_snr['beam_name'],
            'best_snr': round(best_snr['snr']['value'], 2),
            'worst_snr_beam': worst_snr['beam_name'],
            'worst_snr': round(worst_snr['snr']['value'], 2),
            'avg_snr': round(avg_snr, 2)
        }
    }
    return analysis


@app.route('/api/multibeam', methods=['POST'])
def multibeam():
    try:
        data = request.get_json()

        base_params = {
            'distance_km': float(data.get('distance_km', 35786)),
            'tx_power_dbm': float(data.get('tx_power_dbm', 40)),
            'tx_gain_dbi': float(data.get('tx_gain_dbi', 40)),
            'tx_loss_db': float(data.get('tx_loss_db', 2)),
            'rx_gain_dbi': float(data.get('rx_gain_dbi', 35)),
            'rx_loss_db': float(data.get('rx_loss_db', 1)),
            'bandwidth_hz': float(data.get('bandwidth_hz', 1e6)),
            'noise_figure_db': float(data.get('noise_figure_db', 3)),
            'system_temp_k': float(data.get('system_temp_k', 290)),
            'lat_deg': float(data.get('lat_deg', 35)),
            'h_s_km': float(data.get('h_s_km', 0.5)),
            'antenna_diameter_m': float(data.get('antenna_diameter_m', 1.0)),
            'temperature_c': float(data.get('temperature_c', 15)),
            'pressure_hpa': float(data.get('pressure_hpa', 1013.25)),
            'water_density_gm3': float(data.get('water_density_gm3', 7.5))
        }

        beams = data.get('beams', [])
        if not beams:
            beams = [
                {'name': '波束1 (Ku)', 'freq_ghz': 12, 'elevation_angle_deg': 45, 'rain_rate_mmhr': 10, 'polarization_angle_deg': 0, 'availability': 99.9},
                {'name': '波束2 (Ka)', 'freq_ghz': 28, 'elevation_angle_deg': 35, 'rain_rate_mmhr': 15, 'polarization_angle_deg': 0, 'availability': 99.9},
                {'name': '波束3 (Ka)', 'freq_ghz': 28, 'elevation_angle_deg': 25, 'rain_rate_mmhr': 20, 'polarization_angle_deg': 45, 'availability': 99.9},
                {'name': '波束4 (Q)', 'freq_ghz': 40, 'elevation_angle_deg': 40, 'rain_rate_mmhr': 12, 'polarization_angle_deg': 0, 'availability': 99.5}
            ]

        result = calculate_multibeam(base_params, beams)
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': f'多波束计算错误: {str(e)}'}), 500


def generate_pdf_report(params, result, sweep_data=None, multibeam_data=None):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=10)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=14, spaceAfter=8, textColor=colors.HexColor('#1a237e'))
    normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=10, spaceAfter=6)

    story = []

    story.append(Paragraph('🛰️ 卫星通信链路预算分析报告', title_style))
    story.append(Paragraph(f'生成时间: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', normal_style))
    story.append(Spacer(1, 0.5*cm))

    story.append(Paragraph('📋 输入参数', heading_style))
    param_data = [
        ['工作频率', f"{params.get('freq_ghz', 12)} GHz"],
        ['通信距离', f"{params.get('distance_km', 35786)} km"],
        ['发射功率', f"{params.get('tx_power_dbm', 40)} dBm"],
        ['发射天线增益', f"{params.get('tx_gain_dbi', 40)} dBi"],
        ['接收天线增益', f"{params.get('rx_gain_dbi', 35)} dBi"],
        ['仰角', f"{params.get('elevation_angle_deg', 45)}°"],
        ['降雨率', f"{params.get('rain_rate_mmhr', 10)} mm/h"],
        ['可用度', f"{params.get('availability', 99.9)}%"],
        ['信号带宽', f"{params.get('bandwidth_hz', 1e6)} Hz"],
        ['噪声系数', f"{params.get('noise_figure_db', 3)} dB"],
        ['地面站纬度', f"{params.get('lat_deg', 35)}°"]
    ]
    param_table = Table(param_data, colWidths=[7*cm, 5*cm])
    param_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#1a237e')),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bbdefb'))
    ]))
    story.append(param_table)
    story.append(Spacer(1, 0.5*cm))

    story.append(Paragraph('📊 链路预算结果', heading_style))
    result_data = [
        ['有效全向辐射功率 (EIRP)', f"{result['eirp']['value']} {result['eirp']['unit']}"],
        ['自由空间传播损耗', f"{result['losses']['free_space']['value']} {result['losses']['free_space']['unit']}"],
        ['大气吸收损耗 (P.676)', f"{result['losses']['atmospheric']['value']} {result['losses']['atmospheric']['unit']}"],
        ['雨衰 (P.618/P.838)', f"{result['losses']['rain']['value']} {result['losses']['rain']['unit']}"],
        ['闪烁衰落 (P.618)', f"{result['losses']['scintillation']['value']} {result['losses']['scintillation']['unit']}"],
        ['总链路损耗', f"{result['losses']['total']['value']} {result['losses']['total']['unit']}"],
        ['接收功率', f"{result['received_power']['value']} {result['received_power']['unit']}"],
        ['热噪声功率', f"{result['noise']['thermal_noise']['value']} {result['noise']['thermal_noise']['unit']}"],
        ['总噪声功率', f"{result['noise']['total_noise']['value']} {result['noise']['total_noise']['unit']}"],
        ['信噪比 (SNR)', f"{result['snr']['value']} {result['snr']['unit']}"]
    ]
    result_table = Table(result_data, colWidths=[9*cm, 4*cm])
    result_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#1a237e')),
        ('BACKGROUND', (-1, -1), (-1, -1), colors.HexColor('#4fc3f7')),
        ('TEXTCOLOR', (-1, -1), (-1, -1), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bbdefb'))
    ]))
    story.append(result_table)
    story.append(Spacer(1, 0.5*cm))

    story.append(Paragraph('📐 辅助信息', heading_style))
    aux_data = [
        ['雨高 h_R (P.839)', f"{result['auxiliary']['rain_height_km']} km"]
    ]
    aux_table = Table(aux_data, colWidths=[7*cm, 5*cm])
    aux_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#fff3e0')),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#ffcc80'))
    ]))
    story.append(aux_table)
    story.append(Spacer(1, 0.5*cm))

    if multibeam_data and 'beams' in multibeam_data:
        story.append(Paragraph('🔀 多波束分析', heading_style))
        mb_data = [['波束名称', '频率', '仰角', 'EIRP', '总损耗', 'SNR']]
        for beam in multibeam_data['beams']:
            mb_data.append([
                beam['beam_name'],
                f"{beam['parameters']['freq_ghz']} GHz",
                f"{beam['parameters']['elevation_angle_deg']}°",
                f"{beam['eirp']['value']} dBm",
                f"{beam['losses']['total']['value']} dB",
                f"{beam['snr']['value']} dB"
            ])
        mb_table = Table(mb_data, colWidths=[3*cm, 2.5*cm, 2*cm, 2.5*cm, 2.5*cm, 2.5*cm])
        mb_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a237e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bbdefb'))
        ]))
        story.append(mb_table)

        story.append(Spacer(1, 0.3*cm))
        summary = multibeam_data['summary']
        story.append(Paragraph(f"<b>波束总数:</b> {summary['beam_count']} | "
                               f"<b>最佳SNR:</b> {summary['best_snr_beam']} ({summary['best_snr']} dB) | "
                               f"<b>最差SNR:</b> {summary['worst_snr_beam']} ({summary['worst_snr']} dB) | "
                               f"<b>平均SNR:</b> {summary['avg_snr']} dB", normal_style))

    story.append(Spacer(1, 1*cm))
    story.append(Paragraph('📝 标准参考', heading_style))
    story.append(Paragraph('ITU-R P.618-13: 地空路径雨衰减计算方法', normal_style))
    story.append(Paragraph('ITU-R P.676-12: 大气气体衰减计算方法', normal_style))
    story.append(Paragraph('ITU-R P.838-3: 雨的具体衰减系数', normal_style))
    story.append(Paragraph('ITU-R P.839-4: 雨高度模型', normal_style))

    doc.build(story)
    buffer.seek(0)
    return buffer


@app.route('/api/export/pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json()

        params = {
            'freq_ghz': float(data.get('freq_ghz', 12)),
            'distance_km': float(data.get('distance_km', 35786)),
            'tx_power_dbm': float(data.get('tx_power_dbm', 40)),
            'tx_gain_dbi': float(data.get('tx_gain_dbi', 40)),
            'tx_loss_db': float(data.get('tx_loss_db', 2)),
            'rx_gain_dbi': float(data.get('rx_gain_dbi', 35)),
            'rx_loss_db': float(data.get('rx_loss_db', 1)),
            'elevation_angle_deg': float(data.get('elevation_angle_deg', 45)),
            'rain_rate_mmhr': float(data.get('rain_rate_mmhr', 10)),
            'polarization_angle_deg': float(data.get('polarization_angle_deg', 0)),
            'availability': float(data.get('availability', 99.9)),
            'bandwidth_hz': float(data.get('bandwidth_hz', 1e6)),
            'noise_figure_db': float(data.get('noise_figure_db', 3)),
            'system_temp_k': float(data.get('system_temp_k', 290)),
            'lat_deg': float(data.get('lat_deg', 35)),
            'h_s_km': float(data.get('h_s_km', 0.5)),
            'antenna_diameter_m': float(data.get('antenna_diameter_m', 1.0)),
            'temperature_c': float(data.get('temperature_c', 15)),
            'pressure_hpa': float(data.get('pressure_hpa', 1013.25)),
            'water_density_gm3': float(data.get('water_density_gm3', 7.5))
        }

        result = calculate_link_budget(params)

        sweep_data = None
        if data.get('include_sweep', True):
            sweep_data = calculate_frequency_sweep(params)

        multibeam_data = None
        if data.get('include_multibeam', False):
            base_params = {k: v for k, v in params.items() if k != 'freq_ghz' and k != 'elevation_angle_deg' and k != 'rain_rate_mmhr' and k != 'polarization_angle_deg'}
            beams = [
                {'name': '当前波束', 'freq_ghz': params['freq_ghz'], 'elevation_angle_deg': params['elevation_angle_deg'],
                 'rain_rate_mmhr': params['rain_rate_mmhr'], 'polarization_angle_deg': params['polarization_angle_deg'],
                 'availability': params['availability']}
            ]
            multibeam_data = calculate_multibeam(base_params, beams)

        pdf_buffer = generate_pdf_report(params, result, sweep_data, multibeam_data)

        response = make_response(pdf_buffer.getvalue())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename=link-budget-{datetime.datetime.now().strftime("%Y%m%d-%H%M%S")}.pdf'
        return response

    except Exception as e:
        return jsonify({'error': f'PDF导出错误: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
