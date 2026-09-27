# Troubleshooting

Run `peek doctor` for local setup checks, or `peek doctor --live` to start a
temporary preview and check the public host and supported HMR upgrades. Use
`peek --lan` for a phone on the same Wi-Fi; the dev server must listen on a
LAN address such as `0.0.0.0`.

Run `peek --verbose` for Cloudflare diagnostics and error causes. Framework
stdout and stderr are already shown in normal mode.

| Symptom | What to do |
| --- | --- |
| No `package.json` | Run Peek from the project directory, or use `peek -- <executable> [args...]`. |
| No `dev` script | Add `scripts.dev` to `package.json`, or use `peek -- npm start`. |
| Package manager unavailable | Install or enable the manager named by `packageManager`, or run an available explicit command. Detection does not require a global binary, but execution does. |
| Conflicting lockfiles | Set `packageManager` in `package.json` or remove stale lockfiles. |
| Dev server exits early | Read the framework error above Peek's message. Run its dev command directly to confirm it starts. |
| Port cannot be detected | Use `peek --port <port>`. Silent servers on unusual ports may not emit enough evidence. |
| Port already in use | Stop the existing service or choose a different port. Peek will not tunnel a port occupied before it starts the dev process. |
| Server readiness times out | Confirm the app listens on `127.0.0.1` and inspect its startup logs. A service bound only to another interface cannot be tunneled by Peek's loopback origin. |
| `cloudflared` download fails | Check HTTPS access to GitHub releases, proxy/firewall settings, disk space, and `~/.peek/bin` permissions; retry. Peek does not use an unverified binary. |
| Cloudflare tunnel fails | Check internet access and `peek --verbose`. A `~/.cloudflared/config.yaml` may prevent Quick Tunnels; move it temporarily if appropriate, then retry. Peek does not edit it. |
| Dev server rejects the tunnel hostname | Retry with `peek --host-header localhost`. The origin will see `Host: localhost`, so check apps that generate absolute URLs from the Host header. |
| Network or firewall blocks the tunnel | Permit the network connections required by `cloudflared`, use a different network, or try `--lan` on the same Wi-Fi. |
| QR code is missing | Confirm stdout is a TTY and the terminal is wide and tall enough. The public URL is always printed as text. |
| Windows child remains after exit | Close the process from Task Manager or `taskkill /T /F /PID <pid>`, then report the exact command and Windows version. Execa uses Windows process-tree termination when available. |

Quick Tunnels are for development and have [documented limits and no uptime
guarantee](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
The temporary public URL changes each run.
