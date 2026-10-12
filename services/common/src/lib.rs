//! Vigil Common Crate
//! Shared fixed-point math, core data types, event schemas, and NATS message structures.

pub mod events;
pub mod math;
pub mod types;

pub use events::*;
pub use math::*;
pub use types::*;
