# Peron production runbook

## Server
- Provider: Hetzner Cloud
- Location: Falkenstein (FSN1)
- Type: CX22 (2 vCPU / 4GB / 40GB)
- Image: Ubuntu 24.04
- Hostname: ubuntu-4gb-fsn1-6
- IPv4: 178.105.66.66
- IPv6: 2a01:4f8:c014:13b::1
- SSH user: peron (sudo NOPASSWD)
- SSH key: `~/.ssh/id_ed25519_hetzner`
- Connect: `ssh -i ~/.ssh/id_ed25519_hetzner peron@178.105.66.66`

Hardening applied (manual cloud-init equivalent on 2026-04-28):
- `peron` user with NOPASSWD sudo
- Password auth disabled; root SSH is `prohibit-password` (key-only) — Coolify needs root over SSH to manage the host (`/etc/ssh/sshd_config.d/99-peron-hardening.conf`)
- UFW: 22, 80, 443, 8000 from anywhere; plus 22/tcp from `10.0.0.0/24` for Coolify's docker bridge
- fail2ban active
- 2G swapfile

Coolify-specific gotchas resolved during initial setup (2026-04-28):
- Coolify pins `host.docker.internal` to `docker0`'s gateway (10.0.0.1) at container-create time, but Ubuntu/Docker leaves `docker0` admin-DOWN when no containers are on it, breaking the localhost-server SSH check ("Server is not reachable").
- Fix: systemd unit `docker0-keepup.service` runs `ip link set docker0 up` after `docker.service` on every boot. Status: `systemctl status docker0-keepup`.
- If "Server is not reachable" recurs after a reboot, run `sudo ip link set docker0 up` and click "Validate Server" in the Coolify dashboard.

## Stack
- Coolify v4 (Docker) — dashboard at http://178.105.66.66:8000
- Two services: peron-api, peron-web
- TLS: Cloudflare origin certificate -> Traefik (Coolify proxy)
- DNS: Cloudflare proxied (orange cloud); registrar NameSilo
- Coolify env file backed up locally at `.deploy-secrets/coolify.env` (gitignored) — copy to 1Password

## Logs
- Application: Coolify dashboard -> service -> Logs tab (pino JSON, search "msg")
- System: `ssh peron@178.105.66.66`; `sudo journalctl -fu coolify`

## Redeploy
- Auto: push to main; Coolify webhook redeploys both
- Manual: Coolify dashboard -> service -> "Redeploy"

## Captcha incident
1. Check Sentry for spike in `kind:captcha` warnings.
2. If sustained, set `CFR_PROXY_URL=<residential-proxy-url>` env var on api, redeploy.
3. Re-run canary: `./scripts/canary.sh`.
