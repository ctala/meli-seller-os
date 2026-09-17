# meli-seller-os change delta

## ADDED Requirements

### Requirement: Final audit hardening
The system SHALL use normalized exact aliases, atomic D1 claims for question, patch, and moderation concurrency, and bounded fail-closed marketplace projections. Public configuration SHALL use a documented Wrangler template and reject placeholder database identifiers before deployment.

#### Scenario: Concurrent observer
- **WHEN** concurrent operations observe one logical event
- **THEN** exactly one caller reports the durable change and any marketplace write is claimed once.

#### Scenario: Placeholder configuration
- **WHEN** deployment configuration contains a placeholder D1 UUID
- **THEN** predeploy validation SHALL reject it.
