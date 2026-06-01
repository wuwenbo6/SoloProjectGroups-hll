"""Allow running as python -m nfs4_client."""

from .cli import main
import sys

if __name__ == "__main__":
    sys.exit(main())
