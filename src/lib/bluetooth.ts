// OpenEir — Web Bluetooth device adapters.
// Implements the Bluetooth SIG Blood Pressure (0x1810) and Glucose (0x1808)
// profiles with proper SFLOAT decoding. Works in Chromium-based browsers.

export function bluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

// ---- GATT SFLOAT (IEEE-11073 16-bit SFLOAT) ----
export function parseSFloat(dv: DataView, offset: number): { value: number; next: number } {
  const raw = dv.getUint16(offset, true)
  let mantissa = raw & 0x0fff
  let exponent = raw >> 12
  if (exponent >= 0x8) exponent = -(0x10 - exponent)
  if (mantissa >= 0x800) mantissa = -(0x1000 - mantissa)
  return { value: mantissa * Math.pow(10, exponent), next: offset + 2 }
}

export interface BpMeasurement {
  systolic: number
  diastolic: number
  meanArterial?: number
  pulse?: number
  timestamp?: Date
}

/** Parse a Blood Pressure Measurement characteristic (0x2A35). */
export function parseBpMeasurement(dv: DataView): BpMeasurement {
  const flags = dv.getUint8(0)
  let offset = 1
  const sys = parseSFloat(dv, offset); const systolic = sys.value; offset = sys.next
  const dia = parseSFloat(dv, offset); const diastolic = dia.value; offset = dia.next
  const map = parseSFloat(dv, offset); const meanArterial = map.value; offset = map.next
  let timestamp: Date | undefined
  if (flags & 0x02) {
    const year = dv.getUint16(offset, true)
    const month = dv.getUint8(offset + 2)
    const day = dv.getUint8(offset + 3)
    const hours = dv.getUint8(offset + 4)
    const minutes = dv.getUint8(offset + 5)
    const seconds = dv.getUint8(offset + 6)
    if (year > 2000) timestamp = new Date(year, month - 1, day, hours, minutes, seconds)
    offset += 7
  }
  let pulse: number | undefined
  if (flags & 0x04) {
    const p = parseSFloat(dv, offset)
    pulse = p.value
    offset = p.next
  }
  return { systolic: Math.round(systolic), diastolic: Math.round(diastolic), meanArterial: Math.round(meanArterial), pulse: pulse !== undefined ? Math.round(pulse) : undefined, timestamp }
}

/** Parse a Glucose Measurement characteristic (0x2A18) → kg/L concentration. */
export function parseGlucoseMeasurement(dv: DataView): { kgPerL: number; timestamp?: Date } {
  const flags = dv.getUint8(0)
  let offset = 3 // flags(1) + sequence(2)
  let timestamp: Date | undefined
  if (flags & 0x01) {
    const year = dv.getUint16(offset, true)
    const month = dv.getUint8(offset + 2)
    const day = dv.getUint8(offset + 3)
    const hours = dv.getUint8(offset + 4)
    const minutes = dv.getUint8(offset + 5)
    const seconds = dv.getUint8(offset + 6)
    if (year > 2000) timestamp = new Date(year, month - 1, day, hours, minutes, seconds)
    offset += 7
  }
  let value: number
  if (flags & 0x04) {
    // kg/L (float32 IEEE-11073)
    const dvf = new DataView(dv.buffer, dv.byteOffset + offset, 4)
    value = dvf.getFloat32(0, true)
  } else {
    // mol/L SFLOAT → convert to kg/L
    const sf = parseSFloat(dv, offset)
    value = sf.value * 180.156 / 1_000_000 // mmol/L approximated via mol/L*180.156 g/mol
  }
  return { kgPerL: value, timestamp }
}

const BP_SERVICE = 'blood_pressure'
const GLUCOSE_SERVICE = 'glucose'

export interface DeviceSyncResult {
  type: 'bp'
  readings: BpMeasurement[]
}

export interface GlucoseSyncResult {
  type: 'glucose'
  readings: { kgPerL: number; timestamp?: Date }[]
}

/** Prompt for a blood-pressure monitor and read the latest measurement. */
export async function syncBloodPressureMonitor(
  onMeasurement: (m: BpMeasurement) => void,
): Promise<DeviceSyncResult> {
  const device = await (navigator as unknown as {
    bluetooth: { requestDevice: (o: unknown) => Promise<BluetoothDeviceLike> }
  }).bluetooth.requestDevice({
    filters: [{ services: [BP_SERVICE] }],
    optionalServices: [BP_SERVICE],
  })
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(BP_SERVICE)
  const ch = await service.getCharacteristic('blood_pressure_measurement')
  const readings: BpMeasurement[] = []
  await ch.startNotifications()
  ch.addEventListener('characteristicvaluechanged', (e: Event) => {
    const target = e.target as unknown as { value: DataView }
    const m = parseBpMeasurement(target.value)
    readings.push(m)
    onMeasurement(m)
  })
  // Also try an immediate read (many monitors store the last measurement)
  try {
    const v = await ch.readValue()
    if (v?.byteLength) {
      const m = parseBpMeasurement(v)
      if (!readings.some((r) => r.systolic === m.systolic && r.diastolic === m.diastolic)) {
        readings.push(m)
        onMeasurement(m)
      }
    }
  } catch { /* read not permitted on some devices */ }
  return { type: 'bp', readings }
}

/** Prompt for a glucometer and read the latest measurement. */
export async function syncGlucometer(
  onMeasurement: (m: { kgPerL: number; timestamp?: Date }) => void,
): Promise<GlucoseSyncResult> {
  const device = await (navigator as unknown as {
    bluetooth: { requestDevice: (o: unknown) => Promise<BluetoothDeviceLike> }
  }).bluetooth.requestDevice({
    filters: [{ services: [GLUCOSE_SERVICE] }],
    optionalServices: [GLUCOSE_SERVICE],
  })
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(GLUCOSE_SERVICE)
  const ch = await service.getCharacteristic('glucose_measurement')
  const readings: { kgPerL: number; timestamp?: Date }[] = []
  await ch.startNotifications()
  ch.addEventListener('characteristicvaluechanged', (e: Event) => {
    const target = e.target as unknown as { value: DataView }
    const m = parseGlucoseMeasurement(target.value)
    readings.push(m)
    onMeasurement(m)
  })
  return { type: 'glucose', readings }
}

interface BluetoothDeviceLike {
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (s: string) => Promise<{
        getCharacteristic: (c: string) => Promise<{
          startNotifications: () => Promise<void>
          readValue: () => Promise<DataView>
          addEventListener: (t: string, l: (e: Event) => void) => void
        }>
      }>
    }>
  }
}
