FROM nginx:stable

# Build arguments
ARG VERSION=dev
ARG BUILD_DATE
ARG GIT_COMMIT
ARG GIT_BRANCH

# Metadata
LABEL maintainer="Avika NGINX Manager"
LABEL description="NGINX with Avika monitoring agent"
LABEL version="${VERSION}"
LABEL build-date="${BUILD_DATE}"
LABEL git-commit="${GIT_COMMIT}"
LABEL git-branch="${GIT_BRANCH}"

# Set default Timezone to IST
ENV TZ=Asia/Kolkata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install dependencies
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Architecture-specific agent binary
ARG TARGETARCH
COPY agent-linux-${TARGETARCH} /usr/local/bin/avika-agent
RUN chmod +x /usr/local/bin/avika-agent

# Startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Create directories for agent data and copy default config
# /var/lib/avika/ - WAL buffer and config backups (matches avika-agent.conf)
# /var/log/avika/ - Agent logs (if not using stdout)
RUN mkdir -p /etc/avika /var/lib/avika /var/lib/avika/backups /var/log/avika
COPY avika-agent.conf /etc/avika/avika-agent.conf

# Expose ports
EXPOSE 80 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/start.sh"]
