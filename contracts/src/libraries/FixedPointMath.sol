// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice WAD (1e18) and RAY (1e27) fixed-point math. Every function names its rounding direction.
/// @dev The Rust common crate must follow the same operation order to match bit for bit.
library FixedPointMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;

    function mulDivDown(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        return (a * b) / denominator;
    }

    function mulDivUp(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        uint256 product = a * b;
        if (product == 0) return 0;
        return (product - 1) / denominator + 1;
    }

    function wadDivDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivDown(a, WAD, b);
    }

    function rayMulDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivDown(a, b, RAY);
    }

    function rayMulUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivUp(a, b, RAY);
    }

    function rayDivDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivDown(a, RAY, b);
    }

    function rayDivUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivUp(a, RAY, b);
    }

    /// @notice (1 + r)^t as 1 + rt + t(t-1)/2 * r^2 + t(t-1)(t-2)/6 * r^3, rounded down.
    /// @param ratePerSecond Interest rate per second in RAY.
    function compoundedGrowth(uint256 ratePerSecond, uint256 elapsed) internal pure returns (uint256) {
        if (elapsed == 0) return RAY;

        uint256 secondTerm = elapsed < 2 ? 0 : (elapsed * (elapsed - 1)) / 2;
        uint256 thirdTerm = elapsed < 3 ? 0 : (elapsed * (elapsed - 1) * (elapsed - 2)) / 6;

        uint256 ratePower2 = rayMulDown(ratePerSecond, ratePerSecond);
        uint256 ratePower3 = rayMulDown(ratePower2, ratePerSecond);

        return RAY + ratePerSecond * elapsed + ratePower2 * secondTerm + ratePower3 * thirdTerm;
    }
}
