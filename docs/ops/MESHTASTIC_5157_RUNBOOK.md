# Meshtastic 5157 Recovery Runbook

Last updated: 2026-03-03

## Problem Pattern

Symptoms seen:

- Homepage tile shows Meshtastic on `:5157` but no nodes appear.
- Browser error:
  `Blocked request. This host ("aiserver.tail3f0b08.ts.net") is not allowed.`

## Root Causes (what happened)

1. Meshtastic is a 2-part setup:
   - HTTP serial bridge on `:4403` (`meshtastic-http-bridge.service`)
   - Web client on `vite preview` (`meshtastic-web-client.service`)
2. A standalone container (`ghcr.io/meshtastic/web`) was briefly used on `:5157`.
   - That UI was not wired to the existing bridge service, so nodes were not visible.
3. After moving the real web client to `:5157`, Vite preview host checks blocked the Tailscale hostname.

## Known-Good Architecture

- Bridge service: `meshtastic-http-bridge.service`
  - Serial device: `/dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0`
  - Port: `4403`
- Web service: `meshtastic-web-client.service`
  - Runs from: `/home/jimmy/aistuff/meshtastic/web`
  - Port: `5157`
  - Default bridge URL env: `VITE_DEFAULT_MESHTASTIC_URL=http://100.126.122.113:4403`

## Permanent Fix Applied

File changed:

- `/home/jimmy/aistuff/meshtastic/web/packages/web/vite.config.ts`

Change:

- Added Vite preview host allowlist:
  - `preview.allowedHosts: ["aiserver.tail3f0b08.ts.net"]`

Local commit:

- `ef49bfd0` - `fix(web): allow aiserver host in vite preview`

## Fast Validation Checklist

Run these:

```bash
systemctl status meshtastic-http-bridge.service --no-pager
systemctl status meshtastic-web-client.service --no-pager
curl -fsS http://127.0.0.1:4403/healthz
curl -fsS -H 'Host: aiserver.tail3f0b08.ts.net' http://127.0.0.1:5157 >/dev/null && echo OK
ss -ltnp | rg ':(4403|5157)\b'
```

Expected:

- Bridge service active
- Web service active
- `/healthz` returns `ok`
- Host-header request to `:5157` returns HTTP 200
- Ports `4403` and `5157` listening

## If It Breaks Again

1. Check host block first

```bash
curl -i -H 'Host: aiserver.tail3f0b08.ts.net' http://127.0.0.1:5157 | head
```

If you see `Blocked request...allowedHosts`, confirm `vite.config.ts` still has:

```ts
preview: {
  allowedHosts: ["aiserver.tail3f0b08.ts.net"],
},
```

2. Rebuild/restart web service

```bash
sudo systemctl daemon-reload
sudo systemctl restart meshtastic-web-client.service
journalctl -u meshtastic-web-client.service -n 80 --no-pager
```

3. Verify bridge packet flow

```bash
for i in $(seq 1 8); do
  n=$(curl -sS --max-time 4 "http://127.0.0.1:4403/api/v1/fromradio?all=false" | wc -c)
  echo "$i $n"
  sleep 0.5
done
```

Non-zero packet sizes on some polls indicate radio traffic is flowing.

## Avoid This In Future

- Do not run standalone `ghcr.io/meshtastic/web` on `:5157` when using the bridge-backed systemd setup.
- Keep homepage tile URL aligned with the real web service port.
- Prefer systemd services over temporary containers for Meshtastic on this host.

## 2026-03-27 Freeze Triage Notes

- Symptom reported: web UI appeared frozen/intermittent.
- Verified healthy endpoints:
  - `http://127.0.0.1:5157` returned HTTP 200
  - `http://127.0.0.1:4403/healthz` returned `ok`
  - `http://127.0.0.1:4410/healthz` returned `{"ok": true}`
- Verified bridge packet activity:
  - `/api/v1/fromradio?all=false` returned non-zero payload sizes during sample loop.
- Verified host-header path:
  - `Host: aiserver.tail3f0b08.ts.net` on `:5157` returned HTTP 200.
- Recovery action performed:
  - restarted `meshtastic-web-client.service`
  - service came back `active (running)` and rebuilt/served successfully.

Quick commands used:

```bash
curl -i --max-time 5 http://127.0.0.1:5157 | head -n 20
curl -i --max-time 5 http://127.0.0.1:4403/healthz
curl -i --max-time 5 http://127.0.0.1:4410/healthz
for i in $(seq 1 8); do
  n=$(curl -sS --max-time 4 "http://127.0.0.1:4403/api/v1/fromradio?all=false" | wc -c)
  echo "$i $n"
  sleep 0.5
done
sudo systemctl restart meshtastic-web-client.service
systemctl --no-pager --full status meshtastic-web-client.service
```
