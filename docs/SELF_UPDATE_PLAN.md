# Agent Self-Update Plan

This document outlines the architecture and implementation plan for the NGINX Manager Agent's self-update mechanism.

## 🎯 Objective
Automate the deployment and update cycle of the agent fleet across different environments (Kubernetes, Bare Metal, VMs) without requiring manual redeployment.

## 🏗️ Architecture

The system follows a **Pull-Based Update Model** where agents are responsible for identifying, downloading, and applying their own updates.

### 1. Update Server (Distribution)
A central (or local) HTTP server that hosts:
- `version.json`: A manifest file containing the latest version, checksums, and download URLs.
- Binaries: Pre-compiled agent binaries for various architectures (linux/amd64, linux/arm64).

### 2. Update Manifest (`version.json`)
```json
{
  "version": "0.1.2",
  "release_date": "2026-02-10T21:00:00Z",
  "binaries": {
    "linux-amd64": {
      "url": "http://update-server:8090/bin/agent-linux-amd64",
      "sha256": "..."
    },
    "linux-arm64": {
      "url": "http://update-server:8090/bin/agent-linux-arm64",
      "sha256": "..."
    }
  }
}
```

### 3. Agent Update Cycle (Every 5 Minutes)
1. **Poll**: Fetch `version.json` from the Update Server.
2. **Compare**: Compare the `version` in the manifest with the agent's internal `Version` (injected at build time).
3. **Decide**: If `manifest.version > current.version`, initiate update.
4. **Download**: Download the architecture-specific binary to a temporary file.
5. **Verify**: Calculate the SHA256 hash of the downloaded file and compare it with the manifest.
6. **Apply**:
   - **Standalone (VM/Bare Metal)**: 
     - Replace the current binary using `os.Rename`.
     - Trigger a restart via `systemctl restart nginx-manager-agent` (requires sudo).
   - **Container (Kubernetes Pod)**:
     - Replace the binary file in-place.
     - Exit the process with code `100` (Update Success).
     - Kubernetes `restartPolicy: Always` will relaunch the pod with the updated binary.

---

## 🛠️ Implementation Phasing

### Phase 1: Local Distribution (Current Focus)
- **Local Update Server**: A simple static file server to host binaries for internal testing.
- **Release Script**: Automate building and staging of binaries and the manifest.
- **Agent Polling**: Implement the basic "Check for Update" loop.

### Phase 2: Self-Update Logic
- **Internal Updater Package**: Handle downloads, hashing, and binary atomic swapping.
- **Process Management**: Implement the restart/exit logic for different environments.

### Phase 3: Production Readiness
- **GitHub Integration**: Switch the poll URL to GitHub Releases.
- **Staggered Rollouts**: Add random jitter to prevents "Thundering Herd" on the update server.
- **Rollback Mechanism**: Keep the `.old` binary to allow fallback if the new version fails health checks.

---

## 🛡️ Security Considerations
- **Checksum Verification**: Prevents execution of partial or corrupted downloads.
- **HTTPS Only**: In production, all updates must flow over encrypted channels.
- **Code Signing (Future)**: Use GPG signatures to verify the authenticity of binaries.

---

## 🚀 Local Development Setup

To test updates locally:
1. Run `./scripts/update-server.sh` (starts server on port 8090).
2. Run `./scripts/release-local.sh` (builds and publishes new version).
3. Watch Agent logs for: `Update found: 0.1.1. Synchronizing...`
