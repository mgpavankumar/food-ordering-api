## Service access boundary

Set a random `SERVICE_API_KEY` containing at least 32 bytes. Production startup fails when it is missing or short. In any mode where a key is configured, business routes require `X-API-Key`; missing or incorrect keys return 401 before database operations. GET health checks remain accessible to monitors. Comparisons use fixed-length hashes and timing-safe comparison.

This is a shared-key boundary for trusted server-to-server callers, giving all valid key holders the same privileges. It does not provide end-user login, roles, tenant isolation, or record ownership. Keep the service behind a trusted gateway; build role and record-level access before offering a public browser application. Development without a configured key retains the original local demo workflow. Configure abuse limits at the gateway and a documented key rotation procedure.
