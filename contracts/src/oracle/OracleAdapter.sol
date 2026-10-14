// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OracleAdapter {
    event PriceUpdated(address indexed asset, uint256 price, uint256 timestamp);

    function emitPriceUpdated(address asset, uint256 price, uint256 timestamp) external {
        emit PriceUpdated(asset, price, timestamp);
    }
}
