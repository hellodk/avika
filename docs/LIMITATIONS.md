# Avika NGINX Manager - Limitations & Future Implementation

This document tracks current limitations of the Avika platform compared to commercial alternatives and industry standards, along with planned improvements.

---

## Table of Contents

1. [Compared to NGINX Instance Manager (F5)](#compared-to-nginx-instance-manager-f5)
2. [Compared to NGINX Amplify](#compared-to-nginx-amplify)
3. [Compared to General Observability Tools](#compared-to-general-observability-tools)
4. [Agent Architecture Limitations](#agent-architecture-limitations)
5. [Compared to OpenTelemetry Collector](#compared-to-opentelemetry-collector)
6. [Compared to Prometheus Ecosystem](#compared-to-prometheus-ecosystem)
7. [Current Technical Limitations](#current-technical-limitations)

---

## Compared to NGINX Instance Manager (F5)

### Limitations

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| NIM-001 | No native NGINX Plus integration (enhanced metrics, health checks) | Medium | TODO |
| NIM-002 | No built-in WAF policy management | High | TODO |
| NIM-003 | No CVE scanning and patch management | High | TODO |
| NIM-004 | No configuration templates/snippets marketplace | Medium | TODO |
| NIM-005 | Limited RBAC (no team-level policies) | High | TODO |
| NIM-006 | No audit log export to SIEM | Medium | TODO |
| NIM-007 | No official support/SLA | Low | N/A (OSS) |
| NIM-008 | No configuration staging/approval workflow | Medium | TODO |
| NIM-009 | No native integration with F5 BIG-IP | Low | Won't Fix |
| NIM-010 | No GUI-based configuration editor (only text) | Medium | TODO |

### Future Implementation TODOs

- [ ] **NIM-001**: Add NGINX Plus API integration for enhanced metrics (upstream health, caches, zones)
- [ ] **NIM-002**: Implement WAF policy management (ModSecurity rules editor, policy versioning)
- [ ] **NIM-003**: Integrate CVE database scanning (NVD API integration, version-to-CVE mapping)
- [ ] **NIM-004**: Create configuration template system with versioning and sharing
- [ ] **NIM-005**: Implement team-based RBAC with LDAP/SAML integration
- [ ] **NIM-006**: Add audit log export (Syslog, Splunk HEC, S3)
- [ ] **NIM-008**: Add multi-stage config deployment (draft → review → staging → production)
- [ ] **NIM-010**: Build visual configuration editor with syntax highlighting and validation

---

## Compared to NGINX Amplify

### Limitations

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| AMP-001 | No automatic NGINX configuration analysis | Medium | TODO |
| AMP-002 | No security advisories dashboard | Medium | TODO |
| AMP-003 | No static configuration scoring | Low | TODO |
| AMP-004 | No multi-account/multi-tenant support | High | TODO |

### Future Implementation TODOs

- [ ] **AMP-001**: Implement config analysis rules engine (detect common misconfigurations)
- [ ] **AMP-002**: Add security advisories feed integration (NGINX security announcements)
- [ ] **AMP-003**: Build configuration scoring system (security, performance, best practices)
- [ ] **AMP-004**: Implement multi-tenant architecture with isolated namespaces

---

## Compared to General Observability Tools

### Limitations vs Datadog/New Relic/Dynatrace

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| OBS-001 | No APM/distributed tracing correlation | High | In Progress |
| OBS-002 | No synthetic monitoring/uptime checks | Medium | TODO |
| OBS-003 | No log pattern analysis/ML clustering | Medium | TODO |
| OBS-004 | No mobile app for alerts | Low | TODO |
| OBS-005 | No Slack/Teams/PagerDuty native integrations | High | TODO |
| OBS-006 | No custom dashboard builder | Medium | TODO |
| OBS-007 | No SLO/SLI tracking | Medium | TODO |
| OBS-008 | Limited alert routing (no escalation policies) | Medium | TODO |

### Future Implementation TODOs

- [ ] **OBS-001**: Complete Jaeger/Tempo integration for trace correlation
- [ ] **OBS-002**: Add synthetic monitoring (HTTP probes, SSL cert checks)
- [ ] **OBS-003**: Implement log clustering using ML (group similar errors)
- [ ] **OBS-004**: Develop mobile app (React Native) for alerts and status
- [ ] **OBS-005**: Add notification integrations:
  - [ ] Slack webhook
  - [ ] Microsoft Teams
  - [ ] PagerDuty
  - [ ] OpsGenie
  - [ ] Email (SMTP)
  - [ ] Generic webhook
- [ ] **OBS-006**: Build drag-and-drop dashboard builder
- [ ] **OBS-007**: Implement SLO/SLI definitions with burn rate alerts
- [ ] **OBS-008**: Add alert escalation policies and on-call schedules

---

## Agent Architecture Limitations

### Push Model Limitations

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| AGT-001 | No scrape endpoint for Prometheus (pull-compatible) | Medium | TODO |
| AGT-002 | Proprietary protobuf format (not OpenMetrics) | Medium | TODO |
| AGT-003 | Single-point metrics collection (agent failure = no data) | Medium | Mitigated |
| AGT-004 | 1-second interval may be aggressive for constrained systems | Low | Configurable |
| AGT-005 | WAL file can grow large during extended disconnections | Low | TODO |
| AGT-006 | No metric cardinality controls | Medium | TODO |

### Future Implementation TODOs

- [ ] **AGT-001**: Add optional `/metrics` endpoint on agent for Prometheus scraping
- [ ] **AGT-002**: Support OpenMetrics exposition format alongside protobuf
- [ ] **AGT-003**: Implement metric caching at gateway for short agent outages (done: WAL)
- [ ] **AGT-005**: Add WAL rotation configuration and alerts for disk usage
- [ ] **AGT-006**: Implement label cardinality limits and metric aggregation options

---

## Compared to OpenTelemetry Collector

### Limitations

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| OTL-001 | Not a standard OTLP receiver (can't receive from other OTel sources) | Medium | TODO |
| OTL-002 | No pluggable processor/exporter architecture | Low | By Design |
| OTL-003 | Limited to NGINX - not generic telemetry collector | Low | By Design |
| OTL-004 | No Kubernetes metadata enrichment (pod labels, annotations) | Medium | TODO |
| OTL-005 | No resource detection processors | Low | TODO |
| OTL-006 | No tail-based sampling for traces | Medium | TODO |
| OTL-007 | Binary format not compatible with OTLP | Medium | Partial |

### Future Implementation TODOs

- [ ] **OTL-001**: Add OTLP gRPC receiver to gateway (accept telemetry from other sources)
- [ ] **OTL-004**: Enrich metrics with K8s metadata using downward API
- [ ] **OTL-005**: Add resource attribute detection (cloud provider, region, instance type)
- [ ] **OTL-006**: Implement tail-based trace sampling policies
- [ ] **OTL-007**: Support OTLP export format alongside current protobuf

**Note**: Agent already exports logs to OTLP endpoint when configured.

---

## Compared to Prometheus Ecosystem

### Limitations

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| PRM-001 | No PromQL query language support | High | TODO |
| PRM-002 | No Alertmanager integration | High | TODO |
| PRM-003 | No remote write support (to Thanos/Cortex/Mimir) | High | TODO |
| PRM-004 | No recording rules | Medium | TODO |
| PRM-005 | No Grafana data source plugin | High | TODO |
| PRM-006 | No service discovery mechanisms (Consul, K8s, DNS) | Medium | N/A |
| PRM-007 | Metrics not in Prometheus format | Medium | TODO |
| PRM-008 | No federation support | Low | TODO |

### Future Implementation TODOs

- [ ] **PRM-001**: Implement PromQL query endpoint for ClickHouse data
- [ ] **PRM-002**: Add Alertmanager webhook receiver for alert routing
- [ ] **PRM-003**: Implement Prometheus remote write compatible endpoint
- [ ] **PRM-004**: Support recording rules via ClickHouse materialized views
- [ ] **PRM-005**: Develop Grafana data source plugin for Avika
- [ ] **PRM-007**: Add `/metrics` endpoint with Prometheus format export
- [ ] **PRM-008**: Support metric federation between multiple Avika deployments

---

## Current Technical Limitations

### Known Issues

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| TEC-001 | ClickHouse TTL not working with DateTime64 columns | Critical | TODO |
| TEC-002 | No automatic database migrations | Medium | TODO |
| TEC-003 | Legacy port configuration precedence issues | Medium | TODO |
| TEC-004 | Kafka connection logging noise when disabled | Low | TODO |
| TEC-005 | Single gateway connection per agent (no automatic failover) | Medium | Partial |
| TEC-006 | No horizontal pod autoscaling rules | Low | TODO |
| TEC-007 | No backup/restore automation | Medium | TODO |
| TEC-008 | Limited test coverage for integration scenarios | Medium | In Progress |

### Security Limitations

| ID | Limitation | Priority | Status |
|----|------------|----------|--------|
| SEC-001 | No mTLS between agent and gateway | High | TODO |
| SEC-002 | No secret rotation automation | Medium | TODO |
| SEC-003 | No audit logging to external systems | Medium | TODO |
| SEC-004 | No IP allowlist for agent connections | Low | TODO |
| SEC-005 | JWT secret not persisted by default | Medium | Documented |

### Future Implementation TODOs

- [ ] **TEC-001**: Fix ClickHouse TTL with DateTime64 cast or schema migration
- [ ] **TEC-002**: Implement automatic schema migrations with versioning
- [ ] **TEC-003**: Remove legacy port support, add deprecation warnings
- [ ] **TEC-004**: Add config flag to disable recommendation consumer
- [ ] **TEC-005**: Implement automatic gateway failover with health-based routing
- [ ] **TEC-006**: Add HPA configurations for gateway and frontend
- [ ] **TEC-007**: Create backup/restore scripts for PostgreSQL and ClickHouse
- [ ] **TEC-008**: Expand integration test suite with Docker test containers
- [ ] **SEC-001**: Implement mTLS with automatic certificate provisioning
- [ ] **SEC-002**: Add integration with HashiCorp Vault for secret rotation
- [ ] **SEC-003**: Implement audit log streaming to Syslog/Splunk
- [ ] **SEC-004**: Add agent connection allowlist by IP/CIDR

---

## Summary by Priority

### Critical (Blocks Production Use)
- [ ] TEC-001: ClickHouse TTL fix

### High Priority (Significant Feature Gaps)
- [ ] NIM-002: WAF policy management
- [ ] NIM-003: CVE scanning
- [ ] NIM-005: Enhanced RBAC with LDAP/SAML
- [ ] AMP-004: Multi-tenant support
- [ ] OBS-001: APM/tracing correlation
- [ ] OBS-005: Notification integrations (Slack, PagerDuty)
- [ ] PRM-001: PromQL query support
- [ ] PRM-002: Alertmanager integration
- [ ] PRM-003: Prometheus remote write
- [ ] PRM-005: Grafana data source plugin
- [ ] SEC-001: mTLS for agent-gateway communication

### Medium Priority (Nice to Have)
- [ ] NIM-001: NGINX Plus integration
- [ ] NIM-004: Configuration templates
- [ ] NIM-008: Config staging workflow
- [ ] NIM-010: Visual config editor
- [ ] OBS-002: Synthetic monitoring
- [ ] OBS-006: Custom dashboard builder
- [ ] AGT-001: Prometheus scrape endpoint
- [ ] OTL-004: Kubernetes metadata enrichment

### Low Priority (Future Enhancements)
- [ ] AMP-003: Configuration scoring
- [ ] OBS-004: Mobile app
- [ ] AGT-004: Configurable collection intervals (already possible)

---

## Contributing

To contribute to addressing these limitations:

1. Pick an item from this list
2. Create a GitHub issue referencing the limitation ID
3. Submit a PR with implementation
4. Update this document to mark as completed

---

*Last Updated: February 2026*
*Document Version: 1.0*
