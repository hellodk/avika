# Custom Grafana image with plugins pre-installed
# This avoids network timeouts when downloading plugins at runtime

ARG GRAFANA_VERSION=12.0.1
FROM grafana/grafana:${GRAFANA_VERSION}

# Switch to root to install plugins
USER root

# Install plugins using grafana-cli
# These are downloaded at build time, not runtime
RUN grafana cli plugins install grafana-clickhouse-datasource && \
    grafana cli plugins install grafana-clock-panel && \
    grafana cli plugins install grafana-piechart-panel && \
    grafana cli plugins install grafana-polystat-panel && \
    grafana cli plugins install marcusolsson-json-datasource && \
    grafana cli plugins install yesoreyeram-infinity-datasource && \
    grafana cli plugins install grafana-opensearch-datasource && \
    grafana cli plugins install redis-datasource && \
    grafana cli plugins install btplc-status-dot-panel || true

# digrich-bubblechart-panel often fails, try separately
RUN grafana cli plugins install digrich-bubblechart-panel || echo "Warning: digrich-bubblechart-panel failed to install"

# Fix permissions
RUN chown -R grafana:root /var/lib/grafana/plugins

# Switch back to grafana user
USER grafana
