## Current device smoke test — 2026-11-07

Pixel 9 Pro XL (komodo), kernel `7.3.0-rc6-omamobile-komodo-gnss-km4`.
This is the existing Omarchy 4.5 phone installation with private plugin changes,
not an isolated installation of a revised PR head. It is baseline/continuation
evidence only. Required smoke checks passed; Bluetooth retains its prior failed
unit/no-controller state. No screen, power, radio or authentication state was
changed by the read-only smoke test.

| Check | Result | Detail |
| --- | --- | --- |
| boot | ok | kernel 7.3.0-rc6-omamobile-komodo-gnss-km4, slot b, up 48818s |
| storage guard | ok | 62 partitions; only userdata and slot B's boot images writable |
| root | ok | ext4 on userdata, 83G free |
| kernel health | ok | no oops or BUG; 0 WARN, 0 error lines in dmesg (0 known, 0 new) |
| systemd units | not ok | failed: komodo-bluetooth.service |
| USB gadget | ok | bound to 11210000.usb |
| display | ok | card1-DSI-1 connected, 1344x2992 |
| GPU | ok | render node on panthor |
| session | ok | Hyprland and the Omarchy shell running |
| lock | ok | PAM file present, the shell can lock (passwordPam true, locked false) |
| touch | ok | Synaptics TouchComm Touchscreen |
| buttons | ok | gpio-keys |
| Wi-Fi | ok | wlp1s0 on brcmfmac, link up |
| Bluetooth | skip | no controller |
| battery | ok | 65% Charging, 34 °C |
| sound cards | ok | googlekomodoaoc |
| sensors | ok | Accelerometer AmbientLight Proximity |
| cameras | skip | no libcamera tools |
| thermal | ok | hottest zone 45 °C |

Not performed: exact revised package-head installation; real multi-notification swipe acceptance; Home/app screen-off/on animation acceptance; Pixel 7 Pro upgrade.
