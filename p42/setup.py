#!/usr/bin/env python3
import os
import subprocess
import sys
from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext

class CMakeBuild(build_ext):
    def run(self):
        try:
            subprocess.check_output(['cmake', '--version'])
        except OSError:
            raise RuntimeError("CMake must be installed")

        for ext in self.extensions:
            self.build_extension(ext)

    def build_extension(self, ext):
        extdir = os.path.abspath(os.path.dirname(self.get_ext_fullpath(ext.name)))
        cmake_args = [
            '-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=' + extdir,
            '-DPYTHON_EXECUTABLE=' + sys.executable,
        ]

        cfg = 'Debug' if self.debug else 'Release'
        build_args = ['--config', cfg]
        cmake_args += ['-DCMAKE_BUILD_TYPE=' + cfg]
        build_args += ['--', '-j4']

        env = os.environ.copy()
        env['CXXFLAGS'] = '{} -DVERSION_INFO=\\"{}\\"'.format(
            env.get('CXXFLAGS', ''),
            self.distribution.get_version()
        )

        if not os.path.exists(self.build_temp):
            os.makedirs(self.build_temp)

        subprocess.check_call(['cmake', ext.sourcedir] + cmake_args,
                              cwd=self.build_temp, env=env)
        subprocess.check_call(['cmake', '--build', '.'] + build_args,
                              cwd=self.build_temp)

setup(
    name='shallow_water',
    version='0.1.0',
    author='Meteorology Simulator',
    description='SWIG-wrapped C++ shallow water equation solver',
    long_description='',
    ext_modules=[
        Extension(
            name='shallow_water._shallow_water',
            sources=[],
            sourcedir='.'
        )
    ],
    cmdclass=dict(build_ext=CMakeBuild),
    packages=['shallow_water'],
    package_dir={'shallow_water': 'src/python'},
    install_requires=[
        'numpy>=1.20',
        'matplotlib>=3.4',
        'netCDF4>=1.5',
    ],
    entry_points={
        'console_scripts': [
            'shallow-water=shallow_water.cli:main',
        ],
    },
    zip_safe=False,
)
