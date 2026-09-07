# Device adapters (Bluetooth)

OpenEir speaks the Bluetooth SIG health profiles directly from the browser via **Web Bluetooth** — no companion app, no gateway box (unless you want one).

## Supported today

| Device class | GATT service | Characteristic | Notes |
|---|---|---|---|
| Blood pressure monitors | `0x1810` (`blood_pressure`) | `0x2A35` measurement | Systolic/diastolic/MAP + pulse, SFLOAT parsed, timestamp honored when present |
| Glucose meters | `0x1808` (`glucose`) | `0x2A18` measurement | kg/L concentration → mmol/L conversion |

Browser support: Chromium browsers (Chrome, Edge, Opera) on desktop and Android, or inside an installed PWA. Safari/iOS and Firefox do not expose Web Bluetooth — the UI detects this and says so honestly.

## Testing your monitor

1. Open **Record → Blood pressure → Bluetooth device**.
2. Chrome will show the device chooser — pick your monitor, pair.
3. The parser fills the form; you review and press Save (a human stays in the loop on purpose).

## Adding a device type

The GATT plumbing lives in `src/lib/bluetooth.ts`:

```ts
export async function syncMyScale(
  onMeasurement: (m: { kg: number }) => void,
): Promise<DeviceSyncResult> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['weight_scale'] }],
    optionalServices: ['weight_scale'],
  })
  // connect, getPrimaryService('weight_scale'), read notifications,
  // parse the characteristic, call onMeasurement…
}
```

Contribution checklist:

- [ ] Parse the official SIG spec (SFLOAT helper `parseSFloat` is ready to reuse)
- [ ] Handle both notification *and* read-value paths (some monitors only push on measurement)
- [ ] Add a Record-tab entry point and a documentation row here
- [ ] Test with the real hardware — device quirks are the whole job

## Headless / non-Chromium setups

Use the `bluetooth` compose profile: a BLE→MQTT bridge runs on the host with your adapter, and anything that can publish MQTT can write into OpenEir via the REST API (webhook or a 20-line script). See `docs/API.md`.
