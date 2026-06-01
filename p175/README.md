# MAVLink Parameter Console

A web-based parameter console for PX4 / ArduPilot flight controllers. Connects to the autopilot via a serial port, streams `PARAM_VALUE` (#22) messages, and allows you to edit and write back parameters with a grouped, filterable UI.

## Features

- **Live parameter streaming** — receives `PARAM_VALUE` from the flight stack and renders them in real time.
- **Grouped view** — parameters are automatically grouped by name prefix (System, RTL, Navigation, Control, Estimator, GPS, Radio, Safety, Camera, Tuning, Other).
- **Search & filter** — search by parameter id, filter by group and MAVLink type.
- **Write parameters** — edit any value and send `PARAM_SET` (#23) back to the flight stack.
- **PARAM_ACK 等待 + 超时重试** — each write is followed by waiting for `PARAM_ACK` (#127); times out after 3 s and retries up to 3 times (configurable).
- **范围校验** — built-in range validation based on parameter name (e.g. `SYSID_THISMAV` 1–255).
- **Dual confirmation** — treats a matching `PARAM_VALUE` response as implicit ACK for stacks that don't emit `PARAM_ACK`.
- **Export / Import** — export live parameters as PX4-style `.params` file; import files (supports PX4 `.params`, QGC `.param`, Mission Planner `.txt`).
- **Compare mode** — side-by-side diff of live params vs. a loaded file; shows added/removed/changed values with "Only diffs" toggle.

## Architecture

```
┌──────────┐  Serial (MAVLink v1)  ┌──────────┐  WebSocket (/ws)  ┌────────┐
│  PX4 / │ ◄──────────────► │ Server  │ ◄────────────────► │ UI   │
│  ArduPilot │               │ (Node) │                   │(HTML) │
└──────────┘                  └────────┘                  └────────┘
```

**Backend** ([server.js](server.js))
- Connects to the serial port with configurable baud rate.
- Parses MAVLink v1 frames ([mavlink.js](mavlink.js)) — supports `HEARTBEAT` (#0), `PARAM_VALUE` (#22), `PARAM_ACK` (#127).
- Encodes `PARAM_SET` (#23) with correct CRC.
- WebSocket server at `/ws` broadcasts parameter updates to all connected clients.
- ACK waiting + retry + range validation are in `server.js`.

**Frontend** ([public/](public/))
- `index.html` — layout (topbar, group chips, search, parameter table, compare view).
- `styles.css` — dark theme, responsive.
- `app.js` — WebSocket client, parameter store, group inference, filtering, inline editing, write actions, import/export, compare mode.

## Usage

### List mode
- Parameters are grouped by prefix (System / RTL / Navigation / etc.)
- Click group chips to filter
- Search by parameter id or filter by type
- Edit a value and click **Write** (or press Enter) to send `PARAM_SET`
- The row will show spinner until `PARAM_ACK` or matching `PARAM_VALUE` is received

### Export / Import
- Click **Export** to save live parameters as a `.params` file
- Click **Import** to load a parameter file — it will preview-update matching parameters (no writes sent automatically)

### Compare mode
1. Click **Compare** (top bar) or use the **List / Compare** tabs
2. Click **Load B…** to select a comparison file
3. View side-by-side differences:
   - **new** — parameter exists only in B
   - **gone** — parameter exists only in A
   - **changed** — values differ
4. Toggle **Only diffs** to hide identical parameters
5. Click **Swap A ↔ B** to swap sides

Supported file formats (parser auto-detects):
- `PARAM_NAME,VALUE` (Mission Planner / QGC)
- `PARAM_NAME VALUE` (space/tab separated, PX4 `.params`)
- Lines starting with `#` are treated as comments

## Getting started

```bash
npm install
# Or if you hit npm cache permission errors:
npm install --cache /tmp/npm-cache

# Default: connect to /dev/tty.usbmodem01 @ 57600
npm start

# Custom serial port & baud:
SERIAL_PORT=/dev/tty.usbmodem01 BAUD_RATE=115200 npm start

# Custom web port:
PORT=8080 npm start
```

Then open http://localhost:3000 in your browser.

## MAVLink parameter streaming

The flight stack must be configured to stream parameters. For PX4, set `SR0_PARAMS` (or `SR1_PARAMS`) to a non-zero rate. For ArduPilot, use the GCS can request the list.

## WebSocket protocol

All messages are JSON with a `type` field:

Server → Client:
- `hello` — initial snapshot (params, link state).
- `link` — serial / MAVLink connection state.
- `param` — a single `PARAM_VALUE` received.
- `params_reset` — list cleared.
- `set_pending` — ACK requested.
- `set_result` — `PARAM_ACK` or matching `PARAM_VALUE` confirmation.
- `set_retry` — retrying after ACK timeout.
- `set_timeout` — all retries exhausted.
- `set_invalid` — value out of range.

Client → Server (`action` field):
- `set_param` — `{ action: "set_param", param_id, param_value, param_type }`.
- `reconnect` — reopen serial.
- `reset_list` — clear parameter list.
- `get_serial_list` — list available serial ports.

## Configuration

| Env variable | Default | Description |
|----|----|----|
| `SERIAL_PORT` | `/dev/tty.usbmodem01` | Serial device path |
| `BAUD_RATE` | `57600` | Baud rate |
| `PORT` | `3000` | Web server port |
| — | — | ACK timeout = 3000 ms, max retries = 3 |

## Parameter ranges

Range validation uses a table in `server.js` (`PARAM_RANGES`)。 Add more entries to extend coverage.
