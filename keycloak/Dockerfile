# Stage 1: Build/Optimization stage
FROM quay.io/keycloak/keycloak:26.5.0 as builder

# Configure a specific database vendor (e.g., postgres, mysql, mariadb, oracle, mssql)
ENV KC_DB=postgres

# Optional: Enable specific features for 2026 (e.g., OpenTelemetry for observability)
ENV KC_FEATURES=token-exchange,scripts,opentelemetry

# Run the build command to optimize the image
RUN /opt/keycloak/bin/kc.sh build

# Stage 2: Final runtime stage
FROM quay.io/keycloak/keycloak:26.5.0
COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Define essential runtime environment variables
# In 2026, Keycloak uses JDBC_PING by default for cluster discovery
ENV KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
ENV KC_DB_USERNAME=keycloak
ENV KC_DB_PASSWORD=password
ENV KC_HOSTNAME=localhost
ENV KC_HOSTNAME_STRICT_HTTPS=false
ENV KC_HTTP_ENABLED=true


# Set initial admin credentials (use secrets in production)
ENV KC_BOOTSTRAP_ADMIN_USERNAME=admin
ENV KC_BOOTSTRAP_ADMIN_PASSWORD=admin

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
