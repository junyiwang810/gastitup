/**
 * OBDManager.js
 *
 * Manages a Web Bluetooth connection to an ELM327 OBD-II adapter
 * (e.g. Veepeak Mini Bluetooth). Handles:
 *   - BLE device discovery and GATT connection
 *   - ELM327 initialisation sequence (ATZ, ATE0, ATL0, ATSP0)
 *   - Periodic PID polling for live vehicle data
 *   - Response parsing for supported Mode 01 PIDs
 *   - Graceful disconnect and error recovery
 *
 * ELM327 BLE characteristic UUIDs (standard Nordic UART / generic):
 *   Service    : FFF0  (common ELM327 clone)
 *   Notify     : FFF1
 *   WriteNoResp: FFF2
 *
 * Fallback service UUIDs tried: 0xFFE0 (HM-10 style), Nordic UART 6E400001…
 *
 * Supported PIDs polled:
 *   0x0C — Engine RPM           (r/min)
 *   0x0D — Vehicle Speed        (km/h)
 *   0x05 — Coolant Temperature  (°C)
 *   0x2F — Fuel Tank Level      (%)
 *   0x0F — Intake Air Temp      (°C)
 *   0x5E — Fuel Rate            (L/h)  [if supported]
 *   0x11 — Throttle Position    (%)
 *
 * Usage:
 *   const obd = new OBDManager(onData, onStatus);
 *   await obd.connect();
 *   obd.disconnect();
 *
 * Dependencies: Web Bluetooth API (Chrome on Windows with BT enabled)
 * Used by: App.js, OBDPanel.js
 */

class OBDManager {

  // ── BLE service / characteristic identifiers ──────────────────

  static BLE_SERVICES = [
    // Common ELM327 BLE clone (Veepeak Mini, most clones)
    { service: '0000fff0-0000-1000-8000-00805f9b34fb',
      write:   '0000fff2-0000-1000-8000-00805f9b34fb',
      notify:  '0000fff1-0000-1000-8000-00805f9b34fb' },
    // HM-10 based adapters
    { service: '0000ffe0-0000-1000-8000-00805f9b34fb',
      write:   '0000ffe1-0000-1000-8000-00805f9b34fb',
      notify:  '0000ffe1-0000-1000-8000-00805f9b34fb' },
    // Nordic UART (some premium adapters)
    { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      write:   '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
      notify:  '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
  ];

  // OBD PIDs to poll in round-robin order
  static PIDS = [
    { pid: '010C', name: 'rpm',      label: 'Engine RPM',     unit: 'rpm',  parse: OBDManager._parseRPM     },
    { pid: '010D', name: 'speed',    label: 'Speed',          unit: 'km/h', parse: OBDManager._parseSpeed   },
    { pid: '0105', name: 'coolant',  label: 'Coolant Temp',   unit: '°C',   parse: OBDManager._parseTemp    },
    { pid: '012F', name: 'fuel',     label: 'Fuel Level',     unit: '%',    parse: OBDManager._parseFuel    },
    { pid: '010F', name: 'intake',   label: 'Intake Air',     unit: '°C',   parse: OBDManager._parseTemp    },
    { pid: '0111', name: 'throttle', label: 'Throttle',       unit: '%',    parse: OBDManager._parseFuel    },
  ];

  // AT initialisation sequence (sent after connection, before polling)
  static INIT_CMDS = [
    'ATZ\r',    // reset ELM327
    'ATE0\r',   // echo off
    'ATL0\r',   // linefeeds off
    'ATS0\r',   // spaces off
    'ATH0\r',   // headers off
    'ATSP0\r',  // auto select protocol
    'ATAT2\r',  // adaptive timing mode 2
  ];

  // ── Constructor ────────────────────────────────────────────────

  /**
   * @param {Function} onData   - called with the latest metrics object
   * @param {Function} onStatus - called with { state, message } on state changes
   */
  constructor(onData, onStatus) {
    this._onData      = onData   || (() => {});
    this._onStatus    = onStatus || (() => {});

    this._device      = null;
    this._server      = null;
    this._writeChar   = null;
    this._notifyChar  = null;

    this._responseBuffer = '';
    this._pendingResolve = null;
    this._pendingReject  = null;
    this._cmdTimeout     = null;

    this._pidIndex    = 0;
    this._pollTimer   = null;
    this._connected   = false;
    this._initDone    = false;

    // Live metrics object — exposed externally
    this.metrics = {
      rpm:      null,
      speed:    null,
      coolant:  null,
      fuel:     null,
      intake:   null,
      throttle: null,
    };
  }

  // ── Public API ─────────────────────────────────────────────────

  get isConnected() { return this._connected; }

  /**
   * Scans for and connects to the ELM327 adapter.
   * Tries each known BLE service profile until one succeeds.
   */
  async connect() {
    if (!navigator.bluetooth) {
      this._status('unsupported', 'Web Bluetooth is not available. Use Chrome on Windows.');
      return false;
    }

    this._status('scanning', 'Scanning for OBD-II adapter…');

    try {
      const serviceUUIDs = OBDManager.BLE_SERVICES.map(s => s.service);

      this._device = await navigator.bluetooth.requestDevice({
        // Accept all devices — many ELM327 clones don't advertise a fixed name
        acceptAllDevices: true,
        optionalServices: serviceUUIDs,
      });

      this._device.addEventListener('gattserverdisconnected', () => this._handleDisconnect());

      this._status('connecting', `Connecting to ${this._device.name || 'OBD Adapter'}…`);
      this._server = await this._device.gatt.connect();

      // Try each service profile until one works
      let profile = null;
      for (const p of OBDManager.BLE_SERVICES) {
        try {
          const svc = await this._server.getPrimaryService(p.service);
          this._writeChar  = await svc.getCharacteristic(p.write);
          this._notifyChar = await svc.getCharacteristic(p.notify);
          profile = p;
          break;
        } catch (_) { /* try next */ }
      }

      if (!profile) throw new Error('No compatible ELM327 BLE service found on this device.');

      // Subscribe to notifications (all incoming data comes here)
      await this._notifyChar.startNotifications();
      this._notifyChar.addEventListener('characteristicvaluechanged', e => this._onNotify(e));

      this._status('initialising', 'Initialising ELM327…');
      await this._runInitSequence();

      this._connected = true;
      this._status('connected', `Connected — ${this._device.name || 'OBD-II Adapter'}`);

      // Start polling loop
      this._startPolling();
      return true;

    } catch (err) {
      const msg = err.name === 'NotFoundError'
        ? 'No device selected. Pair the Veepeak Mini first, then try again.'
        : err.message || 'Connection failed.';
      this._status('error', msg);
      return false;
    }
  }

  /**
   * Gracefully disconnects from the GATT server.
   */
  disconnect() {
    this._stopPolling();
    if (this._device && this._device.gatt.connected) {
      this._device.gatt.disconnect();
    }
    this._connected  = false;
    this._initDone   = false;
    this._status('disconnected', 'Disconnected from OBD-II adapter.');
  }

  // ── Initialisation ─────────────────────────────────────────────

  /**
   * Sends each AT command in sequence and waits for a response.
   * The ATZ (reset) command gets extra time as the ELM327 restarts.
   */
  async _runInitSequence() {
    for (const cmd of OBDManager.INIT_CMDS) {
      const timeout = cmd.startsWith('ATZ') ? 2500 : 1200;
      try {
        await this._sendCommand(cmd, timeout);
      } catch (_) {
        // Non-critical — some ELM327 variants ignore certain AT commands
      }
      // Short pause between init commands
      await this._sleep(80);
    }
    this._initDone = true;
  }

  // ── Polling ────────────────────────────────────────────────────

  _startPolling() {
    this._pidIndex = 0;
    this._pollNext();
  }

  _stopPolling() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    if (this._cmdTimeout) clearTimeout(this._cmdTimeout);
    this._cmdTimeout = null;
    this._pendingResolve = null;
    this._pendingReject  = null;
  }

  async _pollNext() {
    if (!this._connected) return;

    const pidDef = OBDManager.PIDS[this._pidIndex];
    this._pidIndex = (this._pidIndex + 1) % OBDManager.PIDS.length;

    try {
      const raw = await this._sendCommand(pidDef.pid + '\r', 1500);
      const value = pidDef.parse(raw);
      if (value !== null) {
        this.metrics[pidDef.name] = value;
        this._onData({ ...this.metrics });
      }
    } catch (_) {
      // Timeout or parse error — skip this cycle, keep polling
    }

    // 250 ms between each PID query
    this._pollTimer = setTimeout(() => this._pollNext(), 250);
  }

  // ── BLE Communication ──────────────────────────────────────────

  /**
   * Sends a command string and waits for the '>' prompt in the response.
   * @param {string} cmd
   * @param {number} timeoutMs
   * @returns {Promise<string>}
   */
  _sendCommand(cmd, timeoutMs = 1200) {
    return new Promise((resolve, reject) => {
      this._pendingResolve = resolve;
      this._pendingReject  = reject;
      this._responseBuffer = '';

      // ELM327 accepts ASCII; encode as UTF-8 bytes
      const encoder = new TextEncoder();
      const bytes   = encoder.encode(cmd);
      this._writeChar.writeValueWithoutResponse(bytes).catch(reject);

      this._cmdTimeout = setTimeout(() => {
        this._pendingResolve = null;
        this._pendingReject  = null;
        reject(new Error(`Timeout waiting for response to: ${cmd.trim()}`));
      }, timeoutMs);
    });
  }

  /**
   * Receives BLE notification chunks and appends them to the buffer.
   * When the '>' prompt is seen the current command is resolved.
   */
  _onNotify(event) {
    const decoder = new TextDecoder();
    const chunk   = decoder.decode(event.target.value);
    this._responseBuffer += chunk;

    // ELM327 terminates every response with '>'
    if (this._responseBuffer.includes('>') && this._pendingResolve) {
      clearTimeout(this._cmdTimeout);
      const response = this._responseBuffer.replace(/>/g, '').trim();
      const resolve  = this._pendingResolve;
      this._pendingResolve = null;
      this._pendingReject  = null;
      resolve(response);
    }
  }

  // ── Disconnect handler ─────────────────────────────────────────

  _handleDisconnect() {
    this._stopPolling();
    this._connected = false;
    this._status('disconnected', 'Adapter disconnected. Tap Connect to reconnect.');
    this._onData({ ...this.metrics }); // push stale metrics so UI can show "—"
  }

  // ── PID Parsers ────────────────────────────────────────────────

  /**
   * Extracts the hex data bytes from an OBD response string.
   * E.g. "410C1AF8" → ["1A", "F8"]
   */
  static _dataBytes(raw) {
    // Strip whitespace, look for a response starting with 41 (mode 01 reply)
    const clean = raw.replace(/\s/g, '').toUpperCase();
    const idx   = clean.indexOf('41');
    if (idx === -1) return null;
    // Skip "41" (1 byte) + PID byte (1 byte) = 4 hex chars after "41"
    const payload = clean.slice(idx + 4);
    const bytes = [];
    for (let i = 0; i < payload.length - 1; i += 2) {
      bytes.push(parseInt(payload.slice(i, i + 2), 16));
    }
    return bytes.length > 0 ? bytes : null;
  }

  /** PID 0x0C — Engine RPM: ((A*256)+B)/4 */
  static _parseRPM(raw) {
    const b = OBDManager._dataBytes(raw);
    if (!b || b.length < 2) return null;
    const rpm = ((b[0] * 256) + b[1]) / 4;
    return Math.round(rpm);
  }

  /** PID 0x0D — Vehicle Speed: A (km/h) */
  static _parseSpeed(raw) {
    const b = OBDManager._dataBytes(raw);
    if (!b || b.length < 1) return null;
    return b[0];
  }

  /** PID 0x05 / 0x0F — Temperature: A - 40 (°C) */
  static _parseTemp(raw) {
    const b = OBDManager._dataBytes(raw);
    if (!b || b.length < 1) return null;
    return b[0] - 40;
  }

  /** PID 0x2F / 0x11 — Percentage: (A/255)*100 */
  static _parseFuel(raw) {
    const b = OBDManager._dataBytes(raw);
    if (!b || b.length < 1) return null;
    return Math.round((b[0] / 255) * 100);
  }

  // ── Utilities ──────────────────────────────────────────────────

  _status(state, message) {
    console.log(`[OBD] ${state}: ${message}`);
    this._onStatus({ state, message });
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
