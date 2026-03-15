# Design Doc: VM-based Nginx Mocks for Agent Testing

## Goal
To provide a reliable environment for testing the Avika Agent's interaction with the operating system, specifically `systemctl` commands (start, stop, restart, reload) and the self-update functionality, without requiring the developer to have Nginx locally installed or risk their host system's configuration.

## Requirements
1. **Isolation**: Tests should not affect the host OS.
2. **OS Fidelity**: The environment must support `systemd`.
3. **Nginx Integration**: A real Nginx instance must be available for `nginx -t` and service management.
4. **Agent Lifecycle**: Support for replacing the agent binary and restarting the service.

## Proposed Strategy: Docker with Systemd (or Vagrant)

While Vagrant provides the best fidelity, Docker with a `systemd`-enabled base image is faster for local dev loops.

### Option A: Systemd-enabled Docker (Recommended for Speed)
We use a base image like `jrei/systemd-ubuntu` or `rohandev/systemd-ubuntu` that has `systemd` initialized.

#### Dockerfile (`tests/mock-vm/Dockerfile`)
```dockerfile
FROM jrei/systemd-ubuntu:latest

# Install Nginx and dependencies
RUN apt-get update && apt-get install -y nginx curl ca-certificates procps sudo

# Install Avika Agent (placeholder for build process)
COPY dist/bin/agent-linux-amd64 /usr/local/bin/avika-agent
COPY deploy/systemd/avika-agent.service /etc/systemd/system/avika-agent.service

# Enable services
RUN systemctl enable nginx
RUN systemctl enable avika-agent

EXPOSE 80 5025
```

### Option B: Vagrant (Recommended for High Fidelity)
Use a shared folder to mount the project and run the agent inside a real VM.

#### Vagrantfile
```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/focal64"
  config.vm.network "forwarded_port", guest: 80, host: 8080
  config.vm.provision "shell", inline: <<-SHELL
    apt-get update
    apt-get install -y nginx
    # Setup agent service here
  SHELL
end
```

## Testing Flows

### 1. Systemctl Commands
1. Gateway sends `RESTART` action.
2. Agent executes `systemctl restart nginx`.
3. Verify via `systemctl is-active nginx`.

### 2. Agent Update
1. Gateway triggers update with a new binary URL.
2. Agent downloads binary to a temp location.
3. Agent uses a helper script or internal logic to:
   - Copy new binary over old one (`/usr/local/bin/avika-agent`).
   - Call `systemctl restart avika-agent`.
4. Verify via `avika-agent --version`.

## Success Criteria
- [ ] Agent successfully reloads Nginx after a config push in the VM.
- [ ] Agent can be stopped/started via the Gateway UI.
- [ ] Agent can self-update to a "newer" version (mocked) and stay online.
