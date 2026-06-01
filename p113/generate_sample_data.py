#!/usr/bin/env python3
"""
生成示例RINEX数据用于测试
"""
import os
import numpy as np
from datetime import datetime, timedelta


def generate_sample_observation_file(output_path):
    """生成示例观测文件"""
    start_time = datetime(2024, 1, 1, 0, 0, 0)
    interval = 30
    num_epochs = 120
    satellites = ['G01', 'G03', 'G07', 'G08', 'G10', 'G14', 'G20', 'G23', 'R02', 'R05', 'E01', 'E05', 'C06', 'C10']

    with open(output_path, 'w') as f:
        f.write('     3.03           OBSERVATION DATA    M (MIXED)           RINEX VERSION / TYPE\n')
        f.write('teqc  2019Feb25                         2024-01-01 00:00:00PGM / RUN BY / DATE\n')
        f.write('TEST                                    MARKER NAME\n')
        f.write('GNSS_USER                               OBSERVER / AGENCY\n')
        f.write('12345           TRIMBLE NETR9          5.15        REC # / TYPE / VERS\n')
        f.write('54321           TRM55971.00     NONE    ANT # / TYPE\n')
        f.write('  3149745.2340  1162046.8930  5432167.8900                  APPROX POSITION XYZ\n')
        f.write('        0.0000        0.0000        0.0000                  ANTENNA: DELTA H/E/N\n')
        f.write('     1     8                                                      WAVELENGTH FACT L1/2\n')
        f.write('     8    C1    L1    L2    P2    S1    S2    D1    D2        # / TYPES OF OBSERV\n')
        f.write('    30.0000                                                       INTERVAL\n')
        f.write('  2024     1     1     0     0     0.0000000     GPS         TIME OF FIRST OBS\n')
        f.write('  2024     1     1     1     0     0.0000000     GPS         TIME OF LAST OBS\n')
        f.write('     0                                                         RCV CLOCK OFFS APPL\n')
        f.write('     0    0     0                                      LEAP SECONDS\n')
        f.write('     0                                                            # OF SATELLITES\n')
        f.write('END OF HEADER\n')

        for epoch_idx in range(num_epochs):
            current_time = start_time + timedelta(seconds=epoch_idx * interval)
            f.write(f"> {current_time.year:4d} {current_time.month:2d} {current_time.day:2d}")
            f.write(f" {current_time.hour:2d} {current_time.minute:2d} {current_time.second:11.7f}")
            f.write(f"  0{len(satellites):3d}\n")

            for sat in satellites:
                base_c1 = 22000000 + hash(sat) % 500000
                noise_c1 = np.random.normal(0, 0.1)
                c1 = base_c1 + epoch_idx * 0.01 + noise_c1

                base_l1 = base_c1 / 0.1903
                noise_l1 = np.random.normal(0, 0.01)
                l1 = base_l1 + epoch_idx * 0.05 + noise_l1

                base_l2 = base_c1 / 0.2442
                noise_l2 = np.random.normal(0, 0.01)
                l2 = base_l2 + epoch_idx * 0.04 + noise_l2

                snr = 35 + 15 * np.sin(epoch_idx / 20) + np.random.normal(0, 2)
                snr2 = 30 + 12 * np.sin(epoch_idx / 20) + np.random.normal(0, 2)

                f.write(f"{c1:14.3f}{l1:14.3f}{l2:14.3f}{c1:14.3f}")
                f.write(f"{snr:14.1f}{snr2:14.1f}{0:14.1f}{0:14.1f}\n")

    print(f"✅ 示例观测文件已生成: {output_path}")


def generate_sample_navigation_file(output_path):
    """生成示例导航文件"""
    satellites = ['G01', 'G03', 'G07', 'G08', 'G10', 'G14', 'G20', 'G23']

    with open(output_path, 'w') as f:
        f.write('     3.03           NAVIGATION DATA     G (GPS)             RINEX VERSION / TYPE\n')
        f.write('teqc  2019Feb25                         2024-01-01 00:00:00PGM / RUN BY / DATE\n')
        f.write('    1.7695D-08 -1.4901D-08 -5.9605D-08  1.1921D-07          ION ALPHA\n')
        f.write('    1.0240D+05  9.8304D+04 -1.3107D+05  1.9661D+05          ION BETA\n')
        f.write('   -3.7253D-09  8.1956D-09       133128     2456656          DELTA-UTC: A0,A1,T,W\n')
        f.write('    18                                                      LEAP SECONDS\n')
        f.write('END OF HEADER\n')

        for sat in satellites:
            prn = int(sat[1:])
            f.write(f"{prn:2d} 24 01 01 00 00 00 3.456789012345D-04  1.234567890123D-08  0.000000000000D+00\n")
            f.write(f"    8.901234567890D-03  1.234567890123D-01  4.567890123456D-06  5.153789012345D+03\n")
            f.write(f"    0.000000000000D+00  2.345678901234D-07  1.234567890123D+00  1.234567890123D-07\n")
            f.write(f"    9.876543210987D-01  2.468013579012D+03  3.141592653589D+00 -1.234567890123D-08\n")
            f.write(f"   -2.345678901234D-09  1.000000000000D+00  2.456656500000D+06  0.000000000000D+00\n")
            f.write(f"    0.000000000000D+00  0.000000000000D+00  0.000000000000D+00  0.000000000000D+00\n")
            f.write(f"    0.000000000000D+00  0.000000000000D+00  0.000000000000D+00  0.000000000000D+00\n")
            f.write(f"    0.000000000000D+00  0.000000000000D+00  0.000000000000D+00  0.000000000000D+00\n")

    print(f"✅ 示例导航文件已生成: {output_path}")


if __name__ == '__main__':
    sample_dir = 'sample_data'
    os.makedirs(sample_dir, exist_ok=True)

    generate_sample_observation_file(os.path.join(sample_dir, 'test.24o'))
    generate_sample_navigation_file(os.path.join(sample_dir, 'test.24n'))

    print("\n📁 示例数据已生成到 sample_data/ 目录")
    print("ℹ️  注意: 这些是测试数据，真实数据请使用实际RINEX文件")
