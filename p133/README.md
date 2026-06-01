# pci-browser

Web UI for exploring PCI device configuration space on Linux.

- **Backend** — Flask reads `/sys/bus/pci/devices/*/config` and exposes
  the parsed content (Vendor ID, Device ID, Class, BARs, capabilities, etc.)
  as JSON.
- **Privilege** — a tiny C helper (`pci-helper`) is designed to be installed
  setuid-root so the web app (which runs as a normal user) can safely read
  and write the 256-byte config-space files.
- **Error injection** — predefined register writes (vendor, status, command,
  cache-line, latency) and a raw 4-byte write form exercise driver
  robustness.
- **Frontend** — a single HTML page with a jsTree tree
  (domain → bus → device → function) and a tabbed detail panel
  (summary / BARs / capabilities / hex dump / inject).

## Layout

```
app.py             Flask app (API + static server)
pci-helper.c       Setuid helper: reads / writes config space safely
Makefile           Builds pci-helper; `make install-root` sets 4755
static/            Frontend (index.html + app.js)
requirements.txt   Python deps
run.sh             Convenience launcher (builds + runs the Flask server)
```

## Run (Linux)

```bash
make
pip install -r requirements.txt
# Enable writes / injection (requires root to install setuid helper):
sudo make install-root
./run.sh            # http://0.0.0.0:5000
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/devices` | Enumerate devices and tree |
| GET  | `/api/device/<BDF>` | Parsed config space |
| GET  | `/api/device/<BDF>/config` | Raw hex dump |
| POST | `/api/device/<BDF>/config` | `{"offset": N, "value": "hex"}` (4 bytes) |
| POST | `/api/device/<BDF>/inject` | `{"type": "vendor\|status\|command\|cacheline\|latency"}` |

## Security notes

- The helper validates the BDF format strictly and only opens paths that
  `realpath(3)` resolves to `/sys/bus/pci/devices/...` or `/sys/devices/...`.
- Writes are limited to 4-byte dword writes in the 0..252 range or to the
  pre-defined injection recipes.
- Running this in production is NOT recommended — it is intended for a
  lab environment to validate driver robustness against misconfigured
  devices.
