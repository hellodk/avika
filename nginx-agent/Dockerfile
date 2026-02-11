FROM nginx:stable

# Set default Timezone to IST
ENV TZ=Asia/Kolkata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

ARG TARGETARCH

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Docker will substitute TARGETARCH = amd64 or arm64
COPY agent-linux-${TARGETARCH} /usr/local/bin/agent

RUN chmod +x /usr/local/bin/agent

COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
