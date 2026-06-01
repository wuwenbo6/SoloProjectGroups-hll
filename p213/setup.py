"""NFSv4 Client Toolkit setup script."""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="nfs4-client",
    version="0.1.0",
    description="NFSv4 Client Toolkit - Mount and access NFSv4 shares with CLI and HTTP API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="NFS4 Client Team",
    url="https://github.com/example/nfs4-client",
    packages=find_packages(exclude=["tests", "tests.*"]),
    include_package_data=True,
    python_requires=">=3.8",
    install_requires=[
        "flask>=3.0.0",
        "flask-cors>=4.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov>=4.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "nfs4-client = nfs4_client.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: System Administrators",
        "Topic :: Communications :: File Sharing",
        "Topic :: System :: Filesystems",
        "Topic :: Internet :: WWW/HTTP :: WSGI :: Application",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
    keywords="nfs nfs4 client fileshare rest-api",
)
