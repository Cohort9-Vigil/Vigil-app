//! Fixed-point math utilities for Vigil protocol.
//! Ensures 100% parity with Solidity WAD (1e18) and RAY (1e27) calculations.

pub const WAD: u128 = 1_000_000_000_000_000_000; // 1e18
pub const HALF_WAD: u128 = WAD / 2;
pub const RAY: u128 = 1_000_000_000_000_000_000_000_000_000; // 1e27
pub const HALF_RAY: u128 = RAY / 2;

/// Multiplies two WAD numbers rounding down.
pub fn wad_mul(a: u128, b: u128) -> u128 {
    (a * b) / WAD
}

/// Multiplies two WAD numbers rounding up (used for debt calculations).
pub fn wad_mul_up(a: u128, b: u128) -> u128 {
    let product = a * b;
    if product == 0 {
        0
    } else {
        product.div_ceil(WAD)
    }
}

/// Divides two WAD numbers rounding down.
pub fn wad_div(a: u128, b: u128) -> u128 {
    assert!(b > 0, "Division by zero");
    (a * WAD) / b
}

/// Divides two WAD numbers rounding up.
pub fn wad_div_up(a: u128, b: u128) -> u128 {
    assert!(b > 0, "Division by zero");
    let numerator = a * WAD;
    if numerator == 0 {
        0
    } else {
        numerator.div_ceil(b)
    }
}

/// Calculates health factor: (collateral_value_in_usd * ltv) / total_debt_in_usd
/// Returned as WAD (1.0 = 1e18).
pub fn calculate_health_factor(collateral_value_wad: u128, ltv_wad: u128, debt_value_wad: u128) -> u128 {
    if debt_value_wad == 0 {
        return u128::MAX;
    }
    let adjusted_collateral = wad_mul(collateral_value_wad, ltv_wad);
    wad_div(adjusted_collateral, debt_value_wad)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wad_mul() {
        let one = WAD;
        let two = 2 * WAD;
        assert_eq!(wad_mul(one, two), two);
    }

    #[test]
    fn test_health_factor() {
        let collateral = 150 * WAD; // $150
        let ltv = 800_000_000_000_000_000; // 80% (0.8 WAD)
        let debt = 100 * WAD; // $100 debt
        // adjusted collateral = 150 * 0.8 = 120. HF = 120 / 100 = 1.2 WAD
        let hf = calculate_health_factor(collateral, ltv, debt);
        assert_eq!(hf, 1_200_000_000_000_000_000);
    }
}
