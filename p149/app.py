from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import numpy as np
from astropy import units as u
from astropy.time import Time
from poliastro.bodies import Earth
from poliastro.twobody import Orbit
from poliastro.maneuver import Maneuver
from poliastro.util import norm
from poliastro.iod import izzo
from scipy.optimize import fsolve, root_scalar

app = Flask(__name__)
CORS(app)

MU_EARTH = 398600.4418 * u.km**3 / u.s**2
R_EARTH = 6371.0 * u.km
MU_EARTH_VALUE = MU_EARTH.value


def classical_to_geo(a, ecc, inc, raan, argp, nu):
    p = a * (1 - ecc**2)
    r_norm = p / (1 + ecc * np.cos(nu))
    
    r_pqw = r_norm * np.array([np.cos(nu), np.sin(nu), 0])
    v_pqw = np.sqrt(MU_EARTH.value / p.value) * np.array([-np.sin(nu), ecc + np.cos(nu), 0])
    
    def rot3(angle):
        c, s = np.cos(angle), np.sin(angle)
        return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    
    def rot1(angle):
        c, s = np.cos(angle), np.sin(angle)
        return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
    
    R = rot3(-raan.value) @ rot1(-inc.value) @ rot3(-argp.value)
    
    r_eci = R @ r_pqw
    v_eci = R @ v_pqw
    
    return r_eci * u.km, v_eci * u.km / u.s


def eci_to_geo(r_eci, time):
    jd = time.jd
    T = (jd - 2451545.0) / 36525.0
    gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T**2 - T**3 / 38710000.0
    gmst = gmst % 360.0
    gmst_rad = np.radians(gmst)
    
    c, s = np.cos(gmst_rad), np.sin(gmst_rad)
    R = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    
    r_ecef = R @ r_eci
    
    x, y, z = r_ecef
    r = np.sqrt(x**2 + y**2 + z**2)
    lon = np.degrees(np.arctan2(y, x))
    lat = np.degrees(np.arcsin(z / r))
    alt = r - R_EARTH.value
    
    return lat, lon, alt


def compute_orbit_points(a, ecc, inc, raan, argp, num_points=200):
    nu_values = np.linspace(0, 2 * np.pi, num_points)
    points = []
    
    for nu in nu_values:
        r_eci, _ = classical_to_geo(
            a * u.km,
            ecc * u.one,
            np.radians(inc) * u.rad,
            np.radians(raan) * u.rad,
            np.radians(argp) * u.rad,
            nu * u.rad
        )
        
        time = Time.now()
        lat, lon, alt = eci_to_geo(r_eci.value, time)
        points.append({
            'lon': lon,
            'lat': lat,
            'alt': alt * 1000,
            'x': r_eci[0].value,
            'y': r_eci[1].value,
            'z': r_eci[2].value
        })
    
    return points


def tle_to_orbit(tle_line1, tle_line2):
    from poliastro.api import propagate
    from poliastro.iod import vallado
    
    norad_id = tle_line1[2:7]
    epoch_year = int(tle_line1[18:20])
    epoch_day = float(tle_line1[20:32])
    
    year = 2000 + epoch_year if epoch_year < 57 else 1900 + epoch_year
    
    inc = float(tle_line2[8:16])
    raan = float(tle_line2[17:25])
    ecc = float('0.' + tle_line2[26:33])
    argp = float(tle_line2[34:42])
    M = float(tle_line2[43:51])
    n = float(tle_line2[52:63])
    
    a = (MU_EARTH.value / (4 * np.pi**2 * (n / 86400)**2)) ** (1/3)
    
    M_rad = np.radians(M)
    def KeplerEq(E):
        return E - ecc * np.sin(E) - M_rad
    
    E = fsolve(KeplerEq, M_rad)[0]
    nu = 2 * np.arctan(np.sqrt((1 + ecc) / (1 - ecc)) * np.tan(E / 2))
    
    return {
        'a': a,
        'ecc': ecc,
        'inc': inc,
        'raan': raan,
        'argp': argp,
        'nu': np.degrees(nu),
        'period': 86400 / n
    }


def compute_hohmann_transfer(r1, r2):
    r1 = r1 * u.km
    r2 = r2 * u.km
    
    a_t = (r1 + r2) / 2
    
    v1 = np.sqrt(MU_EARTH / r1)
    v2 = np.sqrt(MU_EARTH / r2)
    
    vp = np.sqrt(MU_EARTH * (2 / r1 - 1 / a_t))
    va = np.sqrt(MU_EARTH * (2 / r2 - 1 / a_t))
    
    delta_v1 = vp - v1
    delta_v2 = v2 - va
    
    total_delta_v = delta_v1 + delta_v2
    
    t_transfer = np.pi * np.sqrt(a_t**3 / MU_EARTH)
    
    return {
        'a_transfer': a_t.value,
        'delta_v1': delta_v1.value * 1000,
        'delta_v2': delta_v2.value * 1000,
        'total_delta_v': total_delta_v.value * 1000,
        'transfer_time': t_transfer.value / 60,
        'initial_orbit_radius': r1.value,
        'target_orbit_radius': r2.value
    }


def compute_launch_window(raan_target, inc_target, lon_launch=100.0, lat_launch=28.0):
    omega_earth = 360.0 / 86400.0
    
    delta_lon = raan_target - lon_launch
    if delta_lon < 0:
        delta_lon += 360.0
    
    time_to_raan = delta_lon / omega_earth
    
    inc_diff = abs(inc_target - lat_launch)
    inclination_penalty = np.sin(np.radians(inc_diff)) * 2000
    
    windows = []
    for i in range(3):
        windows.append({
            'window_time': (time_to_raan + i * 86400) / 3600,
            'delta_v_penalty': inclination_penalty,
            'opportunity': i + 1
        })
    
    return windows


def compute_fuel_consumption(delta_v, Isp=300.0, initial_mass=5000.0):
    g0 = 9.81
    m_ratio = np.exp(delta_v / (Isp * g0))
    fuel_mass = initial_mass * (1 - 1 / m_ratio)
    
    return {
        'delta_v': delta_v,
        'Isp': Isp,
        'initial_mass': initial_mass,
        'fuel_mass': fuel_mass,
        'final_mass': initial_mass - fuel_mass,
        'mass_ratio': m_ratio
    }


def compute_transfer_orbit_points(r1, r2, num_points=100):
    a_t = (r1 + r2) / 2
    points = []
    
    for theta in np.linspace(0, np.pi, num_points):
        r = a_t * (1 - ((r2 - r1) / (r1 + r2)) * np.cos(theta))
        x = r * np.cos(theta)
        y = r * np.sin(theta)
        points.append({
            'x': x,
            'y': y,
            'z': 0,
            'theta': np.degrees(theta)
        })
    
    return points


def compute_inclination_change(r1, inc1, inc2, raan1, raan2):
    delta_inc = np.radians(inc2 - inc1)
    delta_raan = np.radians(raan2 - raan1)
    
    cos_delta_i = np.cos(np.radians(inc1)) * np.cos(np.radians(inc2)) + \
                  np.sin(np.radians(inc1)) * np.sin(np.radians(inc2)) * np.cos(delta_raan)
    
    delta_i_angle = np.arccos(np.clip(cos_delta_i, -1.0, 1.0))
    
    v = np.sqrt(MU_EARTH_VALUE / r1)
    delta_v_inc = 2 * v * np.sin(delta_i_angle / 2)
    
    return delta_v_inc * 1000, np.degrees(delta_i_angle)


def compute_bielliptic_transfer(r1, r2, r_intermediate=None):
    if r_intermediate is None:
        r_intermediate = r2 * 11.94
    
    if r_intermediate <= max(r1, r2):
        r_intermediate = max(r1, r2) * 2
    
    mu = MU_EARTH_VALUE
    
    v1 = np.sqrt(mu / r1)
    
    a1 = (r1 + r_intermediate) / 2
    vp1 = np.sqrt(mu * (2 / r1 - 1 / a1))
    dv1 = vp1 - v1
    
    a2 = (r_intermediate + r2) / 2
    va1 = np.sqrt(mu * (2 / r_intermediate - 1 / a1))
    vp2 = np.sqrt(mu * (2 / r_intermediate - 1 / a2))
    dv2 = vp2 - va1
    
    v2 = np.sqrt(mu / r2)
    va2 = np.sqrt(mu * (2 / r2 - 1 / a2))
    dv3 = v2 - va2
    
    total_dv = dv1 + dv2 + dv3
    
    t1 = np.pi * np.sqrt(a1**3 / mu)
    t2 = np.pi * np.sqrt(a2**3 / mu)
    total_time = t1 + t2
    
    return {
        'r_intermediate': r_intermediate,
        'delta_v1': dv1 * 1000,
        'delta_v2': dv2 * 1000,
        'delta_v3': dv3 * 1000,
        'total_delta_v': total_dv * 1000,
        'transfer_time1': t1 / 60,
        'transfer_time2': t2 / 60,
        'total_transfer_time': total_time / 60
    }


def compute_plane_change_hohmann(r1, r2, inc1, inc2, raan1=0, raan2=0):
    hohmann = compute_hohmann_transfer(r1, r2)
    
    delta_v_inc_plane, delta_angle = compute_inclination_change(r1, inc1, inc2, raan1, raan2)
    
    total_delta_v = hohmann['total_delta_v'] + delta_v_inc_plane
    
    return {
        'hohmann': hohmann,
        'inclination_change': {
            'delta_angle': delta_angle,
            'delta_v': delta_v_inc_plane
        },
        'total_delta_v': total_delta_v,
        'initial_inc': inc1,
        'target_inc': inc2
    }


def solve_lambert_robust(r1_vec, r2_vec, tof, mu=MU_EARTH_VALUE):
    r1 = np.linalg.norm(r1_vec)
    r2 = np.linalg.norm(r2_vec)
    
    cos_dnu = np.dot(r1_vec, r2_vec) / (r1 * r2)
    cos_dnu = np.clip(cos_dnu, -1.0, 1.0)
    dnu = np.arccos(cos_dnu)
    
    A = np.sin(dnu) * np.sqrt(r1 * r2 / (1.0 - cos_dnu))
    
    if A < 1e-10:
        A = 1e-10
    
    def y(z):
        if z > 1e-8:
            sqrt_z = np.sqrt(z)
            C = (1.0 - np.cos(sqrt_z)) / z
            S = (sqrt_z - np.sin(sqrt_z)) / (z * sqrt_z)
        elif z < -1e-8:
            sqrt_z = np.sqrt(-z)
            C = (1.0 - np.cosh(sqrt_z)) / z
            S = (np.sinh(sqrt_z) - sqrt_z) / (-z * sqrt_z)
        else:
            C = 0.5
            S = 1.0 / 6.0
        
        return r1 + r2 + A * (z * S - 1.0) / np.sqrt(C)
    
    def F(z, tof):
        if abs(z) < 1e-10:
            y_val = r1 + r2 - A
        else:
            y_val = y(z)
        
        if y_val < 0:
            y_val = 1e-10
        
        if z > 1e-8:
            sqrt_z = np.sqrt(z)
            C = (1.0 - np.cos(sqrt_z)) / z
            S = (sqrt_z - np.sin(sqrt_z)) / (z * sqrt_z)
        elif z < -1e-8:
            sqrt_z = np.sqrt(-z)
            C = (1.0 - np.cosh(sqrt_z)) / z
            S = (np.sinh(sqrt_z) - sqrt_z) / (-z * sqrt_z)
        else:
            C = 0.5
            S = 1.0 / 6.0
        
        X = np.sqrt(y_val / C)
        return np.sqrt(y_val**3 / mu) * S + A * np.sqrt(y_val) - np.sqrt(mu) * tof
    
    z_low = -20.0
    z_high = 20.0
    
    while z_low < z_high:
        y_low = y(z_low) if z_low != 0 else r1 + r2 - A
        y_high = y(z_high) if z_high != 0 else r1 + r2 - A
        
        if y_low > 0 and y_high > 0:
            break
        
        z_low += 0.5
    
    if z_low >= z_high:
        z_low = -20.0
        z_high = 20.0
    
    for _ in range(50):
        try:
            result = root_scalar(
                lambda z: F(z, tof),
                bracket=[z_low, z_high],
                method='brentq',
                xtol=1e-12,
                maxiter=100
            )
            z = result.root
            break
        except ValueError:
            z_low -= 10.0
            z_high += 10.0
            if z_low < -1000:
                z = 0.0
                break
    else:
        z = 0.0
    
    y_val = y(z) if abs(z) > 1e-10 else r1 + r2 - A
    if y_val < 0:
        y_val = 1e-10
    
    f = 1.0 - y_val / r1
    g = A * np.sqrt(y_val / mu)
    f_dot = np.sqrt(mu / (r1 * r2 * y_val / (1.0 - cos_dnu))) * (y_val / r1 - 1.0) * np.sin(dnu) / np.sin(dnu) if abs(np.sin(dnu)) > 1e-10 else 0.0
    g_dot = 1.0 - y_val / r2
    
    if g == 0:
        g = 1e-10
    
    v1 = (r2_vec - f * r1_vec) / g
    v2 = (f_dot * r1_vec + g_dot * r2_vec) / g if g != 0 else np.zeros(3)
    
    a = -mu / (2.0 * (v_norm_sq(v1) - 2.0 * mu / r1)) if v_norm_sq(v1) - 2.0 * mu / r1 != 0 else r1 + r2
    e_vec = (v_norm_sq(v1) - mu / r1) * r1_vec - np.dot(r1_vec, v1) * v1
    e = np.linalg.norm(e_vec) / mu
    
    return v1, v2, abs(a), abs(e)


def v_norm_sq(v):
    return np.dot(v, v)


def compute_inclined_transfer_orbit_points(r1, r2, inc1, inc2, raan1, raan2, num_points=200):
    r1_vec = np.array([
        r1 * np.cos(np.radians(raan1)) * np.cos(np.radians(inc1)),
        r1 * np.sin(np.radians(raan1)) * np.cos(np.radians(inc1)),
        r1 * np.sin(np.radians(inc1))
    ])
    
    r2_vec = np.array([
        r2 * np.cos(np.radians(raan2)) * np.cos(np.radians(inc2)),
        r2 * np.sin(np.radians(raan2)) * np.cos(np.radians(inc2)),
        r2 * np.sin(np.radians(inc2))
    ])
    
    a_t = (r1 + r2) / 2
    tof = np.pi * np.sqrt(a_t**3 / MU_EARTH_VALUE)
    
    try:
        v1, v2, a, e = solve_lambert_robust(r1_vec, r2_vec, tof)
    except Exception as ex:
        print(f"Lambert solver failed: {ex}")
        v1_circular = np.sqrt(MU_EARTH_VALUE / r1)
        h1 = np.cross(r1_vec, np.array([0, 0, 1]))
        if np.linalg.norm(h1) < 1e-10:
            h1 = np.cross(r1_vec, np.array([0, 1, 0]))
        v1 = v1_circular * h1 / np.linalg.norm(h1)
        a, e = a_t, 0.0
    
    r = r1_vec.copy()
    v = v1.copy()
    
    points = []
    dt = tof / num_points
    
    for i in range(num_points):
        r_norm = np.linalg.norm(r)
        
        time = Time.now()
        lat, lon, alt = eci_to_geo(r, time)
        points.append({
            'lon': lon,
            'lat': lat,
            'alt': alt * 1000,
            'x': r[0],
            'y': r[1],
            'z': r[2]
        })
        
        a_grav = -MU_EARTH_VALUE * r / r_norm**3
        
        v_half = v + a_grav * dt / 2
        r = r + v_half * dt
        r_norm_new = np.linalg.norm(r)
        a_grav_new = -MU_EARTH_VALUE * r / r_norm_new**3
        v = v_half + a_grav_new * dt / 2
    
    v1_circular = np.sqrt(MU_EARTH_VALUE / r1)
    h1 = np.cross(r1_vec, np.array([0, 0, 1]))
    if np.linalg.norm(h1) < 1e-10:
        h1 = np.cross(r1_vec, np.array([0, 1, 0]))
    v1_ref = v1_circular * h1 / np.linalg.norm(h1)
    
    v2_circular = np.sqrt(MU_EARTH_VALUE / r2)
    h2 = np.cross(r2_vec, np.array([0, 0, 1]))
    if np.linalg.norm(h2) < 1e-10:
        h2 = np.cross(r2_vec, np.array([0, 1, 0]))
    v2_ref = v2_circular * h2 / np.linalg.norm(h2)
    
    delta_v1 = np.linalg.norm(v1 - v1_ref)
    delta_v2 = np.linalg.norm(v2_ref - v)
    
    transfer_info = {
        'semi_major_axis': a,
        'eccentricity': e,
        'delta_v1': delta_v1 * 1000,
        'delta_v2': delta_v2 * 1000,
        'total_delta_v': (delta_v1 + delta_v2) * 1000,
        'time_of_flight': tof / 60
    }
    
    return points, transfer_info


def low_thrust_transfer(r1, r2, thrust=0.5, Isp=3000.0, initial_mass=5000.0, num_steps=5000):
    mu = MU_EARTH_VALUE
    g0 = 9.81
    
    r = np.array([r1, 0.0, 0.0])
    v = np.array([0.0, np.sqrt(mu / r1), 0.0])
    m = initial_mass
    
    target_r = r2
    target_v = np.sqrt(mu / target_r)
    
    points = []
    time_points = []
    mass_points = []
    delta_v_points = []
    
    total_delta_v = 0.0
    
    r_curr = np.linalg.norm(r)
    period = 2 * np.pi * np.sqrt(r_curr**3 / mu)
    dt = period / 500
    
    max_steps = num_steps
    step_count = 0
    
    def derivatives(state, thrust_vec, mass):
        r_vec = state[:3]
        v_vec = state[3:6]
        r_norm = np.linalg.norm(r_vec)
        
        a_grav = -mu * r_vec / r_norm**3
        a_thrust = thrust_vec / mass
        
        dr_dt = v_vec
        dv_dt = a_grav + a_thrust
        
        return np.concatenate([dr_dt, dv_dt])
    
    def rk4_step(state, thrust_vec, mass, dt):
        k1 = derivatives(state, thrust_vec, mass)
        k2 = derivatives(state + 0.5 * dt * k1, thrust_vec, mass)
        k3 = derivatives(state + 0.5 * dt * k2, thrust_vec, mass)
        k4 = derivatives(state + dt * k3, thrust_vec, mass)
        
        return state + (dt / 6.0) * (k1 + 2*k2 + 2*k3 + k4)
    
    def compute_thrust_direction(r_vec, v_vec, target_r, target_v):
        r_norm = np.linalg.norm(r_vec)
        v_norm = np.linalg.norm(v_vec)
        
        r_unit = r_vec / r_norm
        v_unit = v_vec / v_norm
        
        h = np.cross(r_vec, v_vec)
        h_norm = np.linalg.norm(h)
        h_unit = h / h_norm if h_norm > 1e-10 else np.array([0, 0, 1])
        
        e_vec = (v_norm**2 - mu / r_norm) * r_unit - np.dot(r_vec, v_vec) * v_unit
        e = np.linalg.norm(e_vec)
        
        a = -mu / (v_norm**2 - 2 * mu / r_norm)
        
        delta_r = target_r - r_norm
        
        thrust_dir = v_unit.copy()
        
        if abs(delta_r) > 1.0:
            if a > 0 and a < target_r * 10:
                e_unit = e_vec / e if e > 1e-10 else v_unit
                
                if delta_r > 0:
                    true_anomaly = np.arctan2(
                        np.dot(np.cross(h_unit, r_unit), v_unit),
                        np.dot(r_unit, v_unit)
                    )
                    
                    if abs(true_anomaly) < np.pi / 3:
                        thrust_dir = 0.8 * v_unit + 0.2 * e_unit
                    else:
                        thrust_dir = 0.5 * v_unit + 0.5 * e_unit
                else:
                    thrust_dir = 0.9 * v_unit + 0.1 * r_unit
            else:
                thrust_dir = v_unit
        
        if a > 0 and a < target_r * 5:
            v_circ = np.sqrt(mu / r_norm)
            if abs(v_norm - v_circ) > 10.0:
                circ_dir = v_unit if v_norm < v_circ else -v_unit
                thrust_dir = 0.6 * thrust_dir + 0.4 * circ_dir
        
        thrust_dir = thrust_dir / np.linalg.norm(thrust_dir)
        return thrust_dir
    
    while step_count < max_steps:
        r_norm = np.linalg.norm(r)
        v_norm = np.linalg.norm(v)
        
        time = Time.now()
        lat, lon, alt = eci_to_geo(r, time)
        points.append({
            'lon': lon,
            'lat': lat,
            'alt': alt * 1000,
            'x': r[0],
            'y': r[1],
            'z': r[2],
            'mass': m,
            'radius': r_norm,
            'velocity': v_norm
        })
        
        time_points.append(step_count * dt)
        mass_points.append(m)
        delta_v_points.append(total_delta_v)
        
        if r_norm >= target_r * 0.998 and r_norm <= target_r * 1.002:
            v_circular = np.sqrt(mu / r_norm)
            if abs(v_norm - v_circular) < 2.0:
                break
        
        thrust_dir = compute_thrust_direction(r, v, target_r, target_v)
        thrust_vec = thrust * thrust_dir
        
        state = np.concatenate([r, v])
        
        a_thrust = thrust_vec / m
        delta_v_step = np.linalg.norm(a_thrust) * dt
        total_delta_v += delta_v_step
        
        state = rk4_step(state, thrust_vec, m, dt)
        
        r = state[:3]
        v = state[3:6]
        
        m_dot = thrust / (Isp * g0)
        m = m - m_dot * dt
        
        if m <= 100:
            break
        
        step_count += 1
        
        if step_count % 100 == 0 and step_count > 0:
            r_norm = np.linalg.norm(r)
            v_norm = np.linalg.norm(v)
            
            if r_norm > target_r * 2 or r_norm < r1 * 0.5:
                break
    
    v_final = np.sqrt(mu / target_r)
    v_curr = np.linalg.norm(v)
    delta_v_circularization = abs(v_final - v_curr)
    total_delta_v += delta_v_circularization
    
    fuel_used = initial_mass - m
    transfer_time = step_count * dt
    
    return {
        'trajectory_points': points,
        'time_points': time_points,
        'mass_points': mass_points,
        'delta_v_points': delta_v_points,
        'final_mass': m,
        'fuel_used': fuel_used,
        'total_delta_v': total_delta_v * 1000,
        'transfer_time': transfer_time / 60,
        'final_radius': np.linalg.norm(r),
        'final_velocity': np.linalg.norm(v),
        'thrust': thrust,
        'Isp': Isp,
        'num_steps': step_count
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/orbit/from-elements', methods=['POST'])
def orbit_from_elements():
    try:
        data = request.json
        a = data.get('a', 7000.0)
        ecc = data.get('ecc', 0.001)
        inc = data.get('inc', 28.5)
        raan = data.get('raan', 0.0)
        argp = data.get('argp', 0.0)
        
        orbit_points = compute_orbit_points(a, ecc, inc, raan, argp)
        
        period = 2 * np.pi * np.sqrt(a**3 / MU_EARTH.value)
        
        v_circular = np.sqrt(MU_EARTH.value / a) * 1000
        
        return jsonify({
            'success': True,
            'orbit': {
                'a': a,
                'ecc': ecc,
                'inc': inc,
                'raan': raan,
                'argp': argp,
                'period': period / 60,
                'velocity': v_circular
            },
            'points': orbit_points
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/orbit/from-tle', methods=['POST'])
def orbit_from_tle():
    try:
        data = request.json
        tle_line1 = data.get('tle_line1', '')
        tle_line2 = data.get('tle_line2', '')
        
        orbit_params = tle_to_orbit(tle_line1, tle_line2)
        orbit_points = compute_orbit_points(
            orbit_params['a'],
            orbit_params['ecc'],
            orbit_params['inc'],
            orbit_params['raan'],
            orbit_params['argp']
        )
        
        return jsonify({
            'success': True,
            'orbit': orbit_params,
            'points': orbit_points
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/maneuver/hohmann', methods=['POST'])
def hohmann_transfer():
    try:
        data = request.json
        r1 = data.get('initial_radius', 7000.0)
        r2 = data.get('target_radius', 36000.0)
        Isp = data.get('Isp', 300.0)
        initial_mass = data.get('initial_mass', 5000.0)
        
        transfer = compute_hohmann_transfer(r1, r2)
        fuel = compute_fuel_consumption(transfer['total_delta_v'], Isp, initial_mass)
        transfer_points = compute_transfer_orbit_points(r1, r2)
        
        initial_points = compute_orbit_points(r1, 0.0, 0.0, 0.0, 0.0)
        target_points = compute_orbit_points(r2, 0.0, 0.0, 0.0, 0.0)
        
        return jsonify({
            'success': True,
            'transfer': transfer,
            'fuel': fuel,
            'transfer_orbit_points': transfer_points,
            'initial_orbit_points': initial_points,
            'target_orbit_points': target_points
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/launch-window', methods=['POST'])
def launch_window():
    try:
        data = request.json
        raan_target = data.get('raan', 0.0)
        inc_target = data.get('inc', 28.5)
        lon_launch = data.get('lon_launch', 100.0)
        lat_launch = data.get('lat_launch', 28.0)
        
        windows = compute_launch_window(raan_target, inc_target, lon_launch, lat_launch)
        
        return jsonify({
            'success': True,
            'windows': windows
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/fuel-calculation', methods=['POST'])
def fuel_calculation():
    try:
        data = request.json
        delta_v = data.get('delta_v', 1000.0)
        Isp = data.get('Isp', 300.0)
        initial_mass = data.get('initial_mass', 5000.0)
        
        fuel = compute_fuel_consumption(delta_v, Isp, initial_mass)
        
        return jsonify({
            'success': True,
            'fuel': fuel
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/maneuver/inclined-hohmann', methods=['POST'])
def inclined_hohmann():
    try:
        data = request.json
        r1 = data.get('initial_radius', 7000.0)
        r2 = data.get('target_radius', 36000.0)
        inc1 = data.get('initial_inclination', 28.5)
        inc2 = data.get('target_inclination', 0.0)
        raan1 = data.get('initial_raan', 0.0)
        raan2 = data.get('target_raan', 0.0)
        Isp = data.get('Isp', 300.0)
        initial_mass = data.get('initial_mass', 5000.0)
        
        plane_change = compute_plane_change_hohmann(r1, r2, inc1, inc2, raan1, raan2)
        
        transfer_points, transfer_info = compute_inclined_transfer_orbit_points(
            r1, r2, inc1, inc2, raan1, raan2
        )
        
        initial_points = compute_orbit_points(r1, 0.0, inc1, raan1, 0.0)
        target_points = compute_orbit_points(r2, 0.0, inc2, raan2, 0.0)
        
        fuel = compute_fuel_consumption(plane_change['total_delta_v'], Isp, initial_mass)
        
        return jsonify({
            'success': True,
            'plane_change': plane_change,
            'transfer_info': transfer_info,
            'fuel': fuel,
            'transfer_orbit_points': transfer_points,
            'initial_orbit_points': initial_points,
            'target_orbit_points': target_points
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/maneuver/bielliptic', methods=['POST'])
def bielliptic_transfer():
    try:
        data = request.json
        r1 = data.get('initial_radius', 7000.0)
        r2 = data.get('target_radius', 36000.0)
        r_intermediate = data.get('intermediate_radius', None)
        Isp = data.get('Isp', 300.0)
        initial_mass = data.get('initial_mass', 5000.0)
        
        transfer = compute_bielliptic_transfer(r1, r2, r_intermediate)
        fuel = compute_fuel_consumption(transfer['total_delta_v'], Isp, initial_mass)
        
        hohmann = compute_hohmann_transfer(r1, r2)
        
        initial_points = compute_orbit_points(r1, 0.0, 0.0, 0.0, 0.0)
        target_points = compute_orbit_points(r2, 0.0, 0.0, 0.0, 0.0)
        intermediate_points = compute_orbit_points(transfer['r_intermediate'], 0.0, 0.0, 0.0, 0.0)
        
        transfer1_points = compute_transfer_orbit_points(r1, transfer['r_intermediate'])
        transfer2_points = compute_transfer_orbit_points(transfer['r_intermediate'], r2)
        
        return jsonify({
            'success': True,
            'transfer': transfer,
            'fuel': fuel,
            'hohmann_comparison': {
                'delta_v': hohmann['total_delta_v'],
                'time': hohmann['transfer_time'],
                'saving': hohmann['total_delta_v'] - transfer['total_delta_v']
            },
            'initial_orbit_points': initial_points,
            'target_orbit_points': target_points,
            'intermediate_orbit_points': intermediate_points,
            'transfer1_orbit_points': transfer1_points,
            'transfer2_orbit_points': transfer2_points
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/maneuver/low-thrust', methods=['POST'])
def low_thrust_maneuver():
    try:
        data = request.json
        r1 = data.get('initial_radius', 7000.0)
        r2 = data.get('target_radius', 36000.0)
        thrust = data.get('thrust', 0.5)
        Isp = data.get('Isp', 3000.0)
        initial_mass = data.get('initial_mass', 5000.0)
        num_steps = data.get('num_steps', 1000)
        
        result = low_thrust_transfer(r1, r2, thrust, Isp, initial_mass, num_steps)
        
        initial_points = compute_orbit_points(r1, 0.0, 0.0, 0.0, 0.0)
        target_points = compute_orbit_points(r2, 0.0, 0.0, 0.0, 0.0)
        
        return jsonify({
            'success': True,
            'low_thrust': result,
            'initial_orbit_points': initial_points,
            'target_orbit_points': target_points,
            'trajectory_points': result['trajectory_points']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/maneuver/gravity-assist', methods=['POST'])
def gravity_assist():
    try:
        data = request.json
        r1 = data.get('initial_radius', 7000.0)
        r2 = data.get('target_radius', 200000.0)
        assist_body = data.get('assist_body', 'moon')
        Isp = data.get('Isp', 300.0)
        initial_mass = data.get('initial_mass', 5000.0)
        
        result = compute_gravity_assist(r1, r2, assist_body, Isp, initial_mass)
        
        initial_points = compute_orbit_points(r1, 0.0, 0.0, 0.0, 0.0)
        target_points = compute_orbit_points(r2, 0.0, 0.0, 0.0, 0.0)
        
        assist_body_pos = result['assist_body_position']
        assist_body_marker = {
            'x': assist_body_pos[0] * 0.1,
            'y': assist_body_pos[1] * 0.1,
            'z': assist_body_pos[2] * 0.1,
            'name': assist_body.capitalize()
        }
        
        return jsonify({
            'success': True,
            'gravity_assist': result,
            'initial_orbit_points': initial_points,
            'target_orbit_points': target_points,
            'transfer_orbit_points': result['assist_orbit_points'],
            'assist_body_marker': assist_body_marker
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/debris/generate', methods=['POST'])
def generate_debris():
    try:
        data = request.json
        num_debris = data.get('num_debris', 20)
        base_orbit_radius = data.get('base_orbit_radius', 7000.0)
        
        debris = generate_sample_debris(num_debris, base_orbit_radius)
        
        return jsonify({
            'success': True,
            'debris': debris
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/maneuver/avoid-obstacles', methods=['POST'])
def obstacle_avoidance():
    try:
        data = request.json
        initial_orbit = data.get('initial_orbit', {'radius': 7000.0})
        target_orbit = data.get('target_orbit', {'radius': 36000.0})
        debris_list = data.get('debris', None)
        Isp = data.get('Isp', 300.0)
        initial_mass = data.get('initial_mass', 5000.0)
        
        if debris_list is None:
            debris_list = generate_sample_debris(20, initial_orbit['radius'])
        
        result = avoid_obstacles(initial_orbit, target_orbit, debris_list, Isp, initial_mass)
        
        return jsonify({
            'success': True,
            'avoidance': result
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/export/commands', methods=['POST'])
def export_commands():
    try:
        data = request.json
        maneuver_data = data.get('maneuver_data', {})
        format = data.get('format', 'json')
        
        result = export_maneuver_commands(maneuver_data, format)
        
        if format == 'csv':
            from flask import Response
            return Response(
                result,
                mimetype='text/csv',
                headers={'Content-Disposition': 'attachment; filename=maneuver_commands.csv'}
            )
        else:
            return jsonify({
                'success': True,
                'export': result
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


MU_MOON = 4902.800066 * u.km**3 / u.s**2
MU_SUN = 1.32712440018e11 * u.km**3 / u.s**2
DIST_MOON_EARTH = 384400.0 * u.km
DIST_SUN_EARTH = 149597870.700 * u.km
R_MOON = 1737.4 * u.km


def compute_third_body_acceleration(r, third_body_pos, mu_third):
    r_rel = r - third_body_pos
    r_third = third_body_pos
    
    a_third = mu_third * (r_rel / np.linalg.norm(r_rel)**3 - r_third / np.linalg.norm(r_third)**3)
    return a_third


def get_moon_position(time_jd):
    T = (time_jd - 2451545.0) / 36525.0
    
    L_prime = 218.3164591 + 481267.88134236 * T - 0.0013268 * T**2 + T**3 / 538841.0 - T**4 / 65194000.0
    l = 134.9634114 + 477198.8676313 * T + 0.0089970 * T**2 + T**3 / 69699.0 - T**4 / 14712000.0
    F = 93.2720993 + 483202.0175273 * T - 0.0034029 * T**2 - T**3 / 3526000.0 + T**4 / 863310000.0
    D = 297.8502042 + 445267.1115168 * T - 0.0016300 * T**2 + T**3 / 545868.0 - T**4 / 113065000.0
    
    L_prime = np.radians(L_prime % 360)
    l = np.radians(l % 360)
    F = np.radians(F % 360)
    D = np.radians(D % 360)
    
    delta_L = (22640 * np.sin(l)
              + 769 * np.sin(2 * l)
              - 4586 * np.sin(l - 2 * D)
              + 2370 * np.sin(2 * D)
              - 668 * np.sin(l - 2 * F)
              - 412 * np.sin(2 * F)
              - 212 * np.sin(2 * l - 2 * D)
              - 206 * np.sin(l + l - 2 * D)
              + 192 * np.sin(l + 2 * D)
              - 165 * np.sin(l - 2 * F - 2 * D)
              + 148 * np.sin(l - l - 2 * D)
              - 125 * np.sin(2 * F - 2 * D)
              + 110 * np.sin(l - l)
              + 55 * np.sin(2 * F - 2 * l))
    
    delta_B = (1852 * np.sin(l + F - 2 * D)
              + 100 * np.sin(l - F - 2 * D)
              + 82 * np.sin(-l + F + 2 * D)
              + 79 * np.sin(l - F + 2 * D))
    
    delta_P = (-34225 * np.cos(l)
               - 20905 * np.cos(l - 2 * D)
               - 3699 * np.cos(2 * D)
               - 2956 * np.cos(2 * l)
               - 570 * np.cos(2 * l - 2 * D)
               + 246 * np.cos(2 * l - 2 * F)
               - 205 * np.cos(l - 2 * F)
               - 171 * np.cos(l + 2 * D)
               - 152 * np.cos(l + l - 2 * D))
    
    L = L_prime + np.radians(delta_L / 3600.0)
    B = np.radians(delta_B / 3600.0)
    P = 385000.56 + delta_P / 1000.0
    
    r_moon_eci = np.array([
        P * np.cos(B) * np.cos(L),
        P * np.cos(B) * np.sin(L),
        P * np.sin(B)
    ])
    
    return r_moon_eci


def get_sun_position(time_jd):
    T = (time_jd - 2451545.0) / 36525.0
    
    L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T**2
    M = 357.52911 + 35999.05029 * T - 0.0001537 * T**2
    e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T**2
    
    L0 = np.radians(L0 % 360)
    M = np.radians(M % 360)
    
    nu = M + (1.914602 - 0.004817 * T - 0.000014 * T**2) * np.sin(M) \
         + (0.019993 - 0.000101 * T) * np.sin(2 * M) \
         + 0.000289 * np.sin(3 * M)
    nu = np.radians(nu % 360)
    
    r = 1.000001018 * (1 - e**2) / (1 + e * np.cos(nu))
    r_km = r * 149597870.700
    
    r_sun_eci = np.array([
        r_km * np.cos(nu),
        r_km * np.sin(nu),
        0.0
    ])
    
    eps = np.radians(23.439291)
    rot_matrix = np.array([
        [1, 0, 0],
        [0, np.cos(eps), np.sin(eps)],
        [0, -np.sin(eps), np.cos(eps)]
    ])
    
    r_sun_eci = rot_matrix @ r_sun_eci
    
    return r_sun_eci


def compute_gravity_assist(r1, r2, assist_body='moon', Isp=300.0, initial_mass=5000.0):
    if assist_body == 'moon':
        mu_assist = MU_MOON.value
        assist_radius = R_MOON.value
        assist_dist = DIST_MOON_EARTH.value
    elif assist_body == 'sun':
        mu_assist = MU_SUN.value
        assist_radius = 695700.0
        assist_dist = DIST_SUN_EARTH.value
    else:
        raise ValueError('Unknown assist body')
    
    time_now = Time.now().jd
    
    if assist_body == 'moon':
        r_assist = get_moon_position(time_now)
    else:
        r_assist = get_sun_position(time_now)
    
    v1 = np.sqrt(MU_EARTH_VALUE / r1)
    v2_target = np.sqrt(MU_EARTH_VALUE / r2)
    
    r_encounter = assist_dist * 0.9
    
    v_inf = np.sqrt(2 * MU_EARTH_VALUE * (1 / r1 - 1 / r_encounter))
    
    if assist_body == 'moon':
        r_periapsis = assist_radius + 500.0
    else:
        r_periapsis = assist_radius + 100000.0
    
    delta = 2 * np.arcsin(1 / (1 + r_periapsis * v_inf**2 / mu_assist))
    
    v_encounter = np.sqrt(v_inf**2 + 2 * MU_EARTH_VALUE / r_encounter)
    delta_v_assist = v_encounter * 2 * np.sin(delta / 2)
    
    v_after_assist = np.sqrt(v_encounter**2 + delta_v_assist**2)
    a_final = -MU_EARTH_VALUE / (v_after_assist**2 - 2 * MU_EARTH_VALUE / r_encounter)
    
    apoapsis = a_final * (1 + np.sqrt(1 - 2 * r_encounter / a_final + (r_encounter * v_after_assist / MU_EARTH_VALUE)**2))
    
    if apoapsis >= r2:
        delta_v1 = np.sqrt(2 * MU_EARTH_VALUE * (1 / r1 - 1 / r_encounter)) - v1
        v2_apoapsis = np.sqrt(2 * MU_EARTH_VALUE * (1 / apoapsis - 1 / (2 * a_final)))
        delta_v2 = v2_target - v2_apoapsis
        
        total_delta_v = abs(delta_v1) + abs(delta_v2)
    else:
        delta_v1 = np.sqrt(2 * MU_EARTH_VALUE * (1 / r1 - 1 / r_encounter)) - v1
        delta_v2 = np.sqrt(2 * MU_EARTH_VALUE * (1 / apoapsis - 1 / r2)) - np.sqrt(2 * MU_EARTH_VALUE * (1 / apoapsis - 1 / (2 * a_final)))
        total_delta_v = abs(delta_v1) + abs(delta_v2)
    
    hohmann = compute_hohmann_transfer(r1, r2)
    delta_v_saving = hohmann['total_delta_v'] - total_delta_v * 1000
    
    transfer_time = 2 * np.pi * np.sqrt((r_encounter / 2)**3 / MU_EARTH_VALUE) / 2
    
    fuel = compute_fuel_consumption(total_delta_v * 1000, Isp, initial_mass)
    
    assist_points = []
    for theta in np.linspace(0, 2 * np.pi, 100):
        r = r_encounter
        x = r * np.cos(theta) + r_assist[0] * 0.1
        y = r * np.sin(theta) + r_assist[1] * 0.1
        z = r_assist[2] * 0.1
        assist_points.append({'x': x, 'y': y, 'z': z, 'theta': np.degrees(theta)})
    
    return {
        'assist_body': assist_body,
        'assist_radius': assist_radius,
        'encounter_radius': r_encounter,
        'periapsis': r_periapsis,
        'approach_angle': np.degrees(delta),
        'v_infinity': v_inf * 1000,
        'delta_v1': delta_v1 * 1000,
        'delta_v2': delta_v2 * 1000,
        'total_delta_v': total_delta_v * 1000,
        'delta_v_saving': delta_v_saving,
        'transfer_time': transfer_time / 60,
        'apoapsis': apoapsis,
        'assist_body_position': r_assist.tolist(),
        'fuel': fuel,
        'assist_orbit_points': assist_points
    }


def generate_sample_debris(num_debris=20, base_orbit_radius=7000.0):
    debris = []
    np.random.seed(42)
    
    for i in range(num_debris):
        delta_r = np.random.uniform(-200, 200)
        delta_inc = np.random.uniform(-5, 5)
        delta_raan = np.random.uniform(0, 360)
        size = np.random.uniform(0.1, 5.0)
        
        r = base_orbit_radius + delta_r
        inc = 28.5 + delta_inc
        raan = delta_raan
        
        points = compute_orbit_points(r, 0.001, inc, raan, 0.0, num_points=50)
        
        debris.append({
            'id': f'DEB-{i:04d}',
            'radius': r,
            'inclination': inc,
            'raan': raan,
            'size': size,
            'points': points,
            'position': points[0]
        })
    
    return debris


def check_collision_risk(trajectory_points, debris_list, safety_radius=10.0):
    risks = []
    
    for i, traj_point in enumerate(trajectory_points):
        traj_pos = np.array([traj_point['x'], traj_point['y'], traj_point['z']])
        
        for debris in debris_list:
            debris_pos = np.array([
                debris['position']['x'],
                debris['position']['y'],
                debris['position']['z']
            ])
            
            distance = np.linalg.norm(traj_pos - debris_pos)
            
            if distance < safety_radius * 2:
                risk_level = 'HIGH' if distance < safety_radius else 'MEDIUM'
                
                risks.append({
                    'trajectory_index': i,
                    'debris_id': debris['id'],
                    'distance': distance,
                    'risk_level': risk_level,
                    'trajectory_position': traj_pos.tolist(),
                    'debris_position': debris_pos.tolist(),
                    'debris_size': debris['size']
                })
    
    return risks


def compute_collision_avoidance_maneuver(r, v, debris_pos, debris_vel, safety_distance=20.0, time_to_encounter=60.0):
    r_rel = r - debris_pos
    v_rel = v - debris_vel
    
    h = np.cross(r_rel, v_rel)
    h_norm = np.linalg.norm(h)
    
    if h_norm < 1e-10:
        avoid_dir = np.array([0, 0, 1])
    else:
        avoid_dir = h / h_norm
    
    delta_v_required = safety_distance / time_to_encounter
    delta_v_vec = avoid_dir * delta_v_required
    
    return {
        'delta_v': delta_v_vec,
        'delta_v_magnitude': np.linalg.norm(delta_v_vec) * 1000,
        'direction': avoid_dir.tolist(),
        'time_to_encounter': time_to_encounter,
        'miss_distance': safety_distance
    }


def avoid_obstacles(initial_orbit, target_orbit, debris_list, Isp=300.0, initial_mass=5000.0):
    r1 = initial_orbit['radius']
    r2 = target_orbit['radius']
    inc1 = initial_orbit.get('inclination', 0.0)
    inc2 = target_orbit.get('inclination', 0.0)
    raan1 = initial_orbit.get('raan', 0.0)
    raan2 = target_orbit.get('raan', 0.0)
    
    nominal_transfer, transfer_info = compute_inclined_transfer_orbit_points(
        r1, r2, inc1, inc2, raan1, raan2
    )
    
    collision_risks = check_collision_risk(nominal_transfer, debris_list)
    
    avoidance_maneuvers = []
    total_avoidance_dv = 0.0
    
    if collision_risks:
        for risk in collision_risks:
            if risk['risk_level'] == 'HIGH':
                traj_idx = risk['trajectory_index']
                traj_point = nominal_transfer[min(traj_idx, len(nominal_transfer) - 1)]
                
                r = np.array([traj_point['x'], traj_point['y'], traj_point['z']])
                v = np.array([0, 0, 0])
                
                debris_pos = np.array(risk['debris_position'])
                debris_vel = np.array([0, 0, 0])
                
                avoidance = compute_collision_avoidance_maneuver(r, v, debris_pos, debris_vel)
                avoidance_maneuvers.append({
                    'risk': risk,
                    'maneuver': avoidance,
                    'location': traj_point
                })
                total_avoidance_dv += avoidance['delta_v_magnitude']
    
    nominal_dv = compute_hohmann_transfer(r1, r2)['total_delta_v']
    if transfer_info and transfer_info.get('total_delta_v') is not None and not np.isnan(transfer_info['total_delta_v']):
        nominal_dv = transfer_info['total_delta_v']
    
    nominal_fuel = compute_fuel_consumption(nominal_dv, Isp, initial_mass)
    
    total_dv = nominal_dv + total_avoidance_dv
    total_fuel = compute_fuel_consumption(total_dv, Isp, initial_mass)
    
    initial_points = compute_orbit_points(r1, 0.0, inc1, raan1, 0.0)
    target_points = compute_orbit_points(r2, 0.0, inc2, raan2, 0.0)
    
    return {
        'nominal_transfer': nominal_transfer,
        'transfer_info': transfer_info,
        'collision_risks': collision_risks,
        'avoidance_maneuvers': avoidance_maneuvers,
        'avoidance_delta_v': total_avoidance_dv,
        'total_delta_v': total_dv,
        'nominal_fuel': nominal_fuel,
        'total_fuel': total_fuel,
        'debris_list': debris_list,
        'initial_orbit_points': initial_points,
        'target_orbit_points': target_points
    }


def export_maneuver_commands(maneuver_data, format='json'):
    commands = []
    
    if 'hohmann' in maneuver_data:
        transfer = maneuver_data['hohmann']
        fuel = maneuver_data.get('fuel', {})
        
        commands.append({
            'time': 'T0',
            'type': 'MANEUVER_START',
            'description': '开始霍曼转移',
            'delta_v': transfer.get('delta_v1', 0),
            'direction': 'prograde',
            'duration': 60.0
        })
        
        commands.append({
            'time': f"T0 + {transfer.get('transfer_time', 0):.1f} min",
            'type': 'CIRCULARIZATION',
            'description': '圆化轨道',
            'delta_v': transfer.get('delta_v2', 0),
            'direction': 'prograde',
            'duration': 60.0
        })
    
    if 'transfer' in maneuver_data:
        transfer = maneuver_data['transfer']
        if 'r_intermediate' in transfer:
            commands.append({
                'time': 'T0',
                'type': 'TRANSFER_1',
                'description': '第一次转移 (初始→中间)',
                'delta_v': transfer.get('delta_v1', 0),
                'direction': 'prograde',
                'duration': 60.0
            })
            
            commands.append({
                'time': f"T0 + {transfer.get('transfer_time1', 0):.1f} min",
                'type': 'TRANSFER_2',
                'description': '第二次转移 (中间→外)',
                'delta_v': transfer.get('delta_v2', 0),
                'direction': 'prograde',
                'duration': 60.0
            })
            
            commands.append({
                'time': f"T0 + {transfer.get('total_transfer_time', 0):.1f} min",
                'type': 'CIRCULARIZATION',
                'description': '目标轨道圆化',
                'delta_v': transfer.get('delta_v3', 0),
                'direction': 'prograde',
                'duration': 60.0
            })
    
    if 'plane_change' in maneuver_data:
        pc = maneuver_data['plane_change']
        if 'inclination_change' in pc:
            commands.append({
                'time': 'T0',
                'type': 'INCLINATION_CHANGE',
                'description': f"倾角变化 {pc['initial_inc']}° → {pc['target_inc']}°",
                'delta_v': pc['inclination_change'].get('delta_v', 0),
                'direction': 'out-of-plane',
                'duration': 120.0
            })
    
    if 'low_thrust' in maneuver_data:
        lt = maneuver_data['low_thrust']
        commands.append({
            'time': 'T0',
            'type': 'LOW_THRUST_START',
            'description': '开始小推力连续推进',
            'thrust': lt.get('thrust', 0),
            'Isp': lt.get('Isp', 0),
            'total_delta_v': lt.get('total_delta_v', 0),
            'estimated_duration': f"{lt.get('transfer_time', 0):.1f} min"
        })
        
        total_time = 0
        num_commands = 5
        for i in range(num_commands):
            total_time += lt.get('transfer_time', 0) / num_commands
            commands.append({
                'time': f"T0 + {total_time:.1f} min",
                'type': 'LOW_THRUST_STATUS',
                'description': f"小推力推进进度检查 {i+1}/{num_commands}",
                'thrust_direction': 'velocity-aligned',
                'status': 'ongoing'
            })
        
        commands.append({
            'time': f"T0 + {lt.get('transfer_time', 0):.1f} min",
            'type': 'LOW_THRUST_END',
            'description': '小推力推进完成',
            'final_radius': lt.get('final_radius', 0),
            'fuel_used': lt.get('fuel_used', 0)
        })
    
    if 'avoidance_maneuvers' in maneuver_data and maneuver_data['avoidance_maneuvers']:
        for i, am in enumerate(maneuver_data['avoidance_maneuvers']):
            commands.append({
                'time': f"T0 + {am['maneuver'].get('time_to_encounter', 0):.1f} min",
                'type': 'COLLISION_AVOIDANCE',
                'description': f"规避碎片 {am['risk']['debris_id']}",
                'delta_v': am['maneuver'].get('delta_v_magnitude', 0),
                'direction': am['maneuver'].get('direction', [0, 0, 1]),
                'miss_distance': am['maneuver'].get('miss_distance', 0),
                'debris_size': am['risk'].get('debris_size', 0)
            })
    
    if 'assist_body' in maneuver_data:
        ga = maneuver_data
        commands.append({
            'time': 'T0',
            'type': 'GRAVITY_ASSIST_START',
            'description': f"{ga['assist_body']}引力辅助转移开始",
            'delta_v': ga.get('delta_v1', 0),
            'direction': 'prograde',
            'assist_body': ga['assist_body']
        })
        
        commands.append({
            'time': f"T0 + {ga.get('transfer_time', 0):.1f} min",
            'type': 'GRAVITY_ASSIST_ENCOUNTER',
            'description': f"{ga['assist_body']}近心点交会",
            'periapsis': ga.get('periapsis', 0),
            'approach_angle': ga.get('approach_angle', 0)
        })
        
        commands.append({
            'time': f"T0 + {ga.get('transfer_time', 0) * 2:.1f} min",
            'type': 'GRAVITY_ASSIST_COMPLETE',
            'description': '引力辅助转移完成',
            'delta_v': ga.get('delta_v2', 0),
            'delta_v_saving': ga.get('delta_v_saving', 0)
        })
    
    summary = {
        'total_commands': len(commands),
        'total_delta_v_required': sum(cmd.get('delta_v', 0) for cmd in commands),
        'maneuver_types': list(set(cmd['type'] for cmd in commands)),
        'generated_at': Time.now().iso
    }
    
    if format == 'json':
        return {
            'commands': commands,
            'summary': summary
        }
    elif format == 'csv':
        csv_lines = ['time,type,description,delta_v_magnitude,direction,duration']
        for cmd in commands:
            csv_lines.append(
                f"{cmd.get('time', '')},"
                f"{cmd.get('type', '')},"
                f"{cmd.get('description', '').replace(',', ';')},"
                f"{cmd.get('delta_v', '')},"
                f"{cmd.get('direction', '')},"
                f"{cmd.get('duration', '')}"
            )
        return '\n'.join(csv_lines)
    else:
        return commands


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
