from setuptools import setup, find_packages

setup(
    name='avr-firmware-analyzer',
    version='1.0.0',
    description='AVR (Atmega328) Firmware Analysis Tool',
    author='AVR Analysis Team',
    packages=find_packages(),
    install_requires=[
        'graphviz>=0.20.0',
    ],
    entry_points={
        'console_scripts': [
            'avr-analyzer=avr_analyzer.cli:main',
        ],
    },
    python_requires='>=3.8',
)
