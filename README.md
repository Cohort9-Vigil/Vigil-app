# Vigil Protocol

> **High-Performance Web3 Lending and Liquidation Protocol Monorepo**

Vigil is an institutional-grade, risk-resilient lending and automated liquidation protocol engineered with Foundry smart contracts and a sub-second, event-driven Rust microservices architecture.

---

## 🏗 Monorepo Architecture & Directory Structure

```text
vigil/
├── contracts/               # Foundry smart contracts project folder
│   ├── src/                 # Core protocol, interest rate models, oracle, settlement
│   ├── test/                # Unit tests, invariant handlers, differential fuzzing
│   ├── script/              # Deployment and fixture seed scripts
│   ├── foundry.toml         # Foundry build and test configuration
│   └── remappings.txt       # Solidity library import remappings
├── services/                # Cargo workspace root for Rust microservices (resolver = "2")
│   ├── Cargo.toml           # Root workspace configuration
│   ├── common/              # Shared crate: WAD/RAY fixed-point math, domain types, NATS schemas
│   ├── indexer/             # Indexer microservice: EVM log streaming, reorg detection, Postgres storage
│   ├── risk-engine/         # Risk Engine microservice: Zero-divergence health factor calculation & signals
│   └── liquidator/          # Liquidator microservice: Safe nonce management, pre-flight simulation, execution
├── migrations/              # Postgres schema migrations (blocks, positions, prices, liquidations)
├── scenario/                # Acceptance scenario and chaos test scripts (reorgs, crashes, market shocks)
├── docker-compose.yml       # Local environment: Anvil, Postgres, NATS JetStream, and services
├── .env.example             # Example environment configuration
├── .gitignore               # Standard ignores for Rust, Foundry, Node, and environment secrets
└── README.md                # Project architecture & documentation
```

---

## ⚙️ Microservices Overview

| Microservice | Crate | Responsibilities |
|---|---|---|
| **Common** | `services/common` | WAD (1e18) & RAY (1e27) fixed-point math with exact rounding parity to Solidity; shared types and NATS JetStream events. |
| **Indexer** | `services/indexer` | Subscribes to EVM blocks and contract events; reconciles chain reorgs; persists normalized position states to Postgres; streams events to NATS. |
| **Risk Engine** | `services/risk-engine` | Ingests position updates and oracle price streams; continuously computes borrower health factors; emits liquidation signals when $HF < 1.0$. |
| **Liquidator** | `services/liquidator` | Listens to liquidation signals; manages transaction nonces with gap detection and fee bumping; simulates pre-flight health; signs and submits liquidations. |

---

## 🚀 Quick Start & Development Setup

### 1. Prerequisites
- [Rust & Cargo](https://rustup.rs/) (v1.75+)
- [Foundry](https://getfoundry.sh/) (`forge`, `anvil`, `cast`)
- [Docker & Docker Compose](https://www.docker.com/)

### 2. Environment Configuration
Copy the sample environment variables:
```bash
cp .env.example .env
```

### 3. Spin Up Local Infrastructure
Spin up Anvil local node, Postgres database, and NATS JetStream bus:
```bash
docker compose up -d anvil postgres nats
```

### 4. Smart Contracts (Foundry)
Compile and test the contracts:
```bash
cd contracts
forge build
forge test
```

### 5. Services Workspace (Rust)
Check and test all workspace crates:
```bash
cd services
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

### 6. Acceptance & Chaos Scenario Testing
Run the protocol market-shock and chaos test scenario:
```bash
./scenario/run_scenario.sh
```

---

## 📊 Acceptance Scenario Pass Criteria
- **Duplicate liquidations**: `0`
- **Nonce gaps after run**: `0`
- **Successful manipulation attacks**: `0`
- **Rust / Solidity health-factor divergences**: `0`
- **Indexer gaps or duplicates after reorg**: `0`
- **Positions still liquidatable at end**: `0`

---

## 📄 License
MIT OR Apache-2.0
