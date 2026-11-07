## VPN-active USB transport test — 2026-11-07

Laptop: Linux, Tailscale daemon active. Policy rule priority 5270 selects
Tailscale table 52 before the main table. Ordinary route lookup:

```text
172.16.42.1 dev tailscale0 table 52 src <VPN-address> uid 1000 
    cache
```

Using the revised PR467 helper with explicit `/dev/null` SSH config and the
existing strict phone host-key pin, automatic discovery selected the directly
connected USB interface. Global routing and VPN settings were unchanged.

- Fresh `uname -r`: `7.3.0-rc6-omamobile-komodo-gnss-km4`.
- Upload: 67108864 bytes of generated data to an owned temporary phone file.
- Upload time: 2.107 seconds.
- Local and remote SHA256: `2193a065da892ada30e567f90ad3ed0caf180a4438b81942f2f44ace6a14cda4` (identical).
- Three shared-master calls returned the same kernel release.
- `--stop` succeeded; a subsequent fresh connection succeeded.
- Generated data and the remote temporary file were removed.

The shared-master socket used a private short temporary runtime directory for
this test, because the Codex sandbox cannot write the desktop runtime directory.
The original attempt with a longer temporary socket path failed on Unix socket
path length; shortening only the test directory resolved it. No sandbox, route,
VPN or host-key restrictions were disabled.
