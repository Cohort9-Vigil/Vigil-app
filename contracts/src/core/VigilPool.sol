// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VigilPool {
    event Deposit(address indexed user, address indexed asset, uint256 amount);
    event Borrow(address indexed user, uint256 amount);
    event Repay(address indexed user, uint256 amount);
    event LiquidationCall(
        address indexed collateralAsset,
        address indexed user,
        uint256 debtToCover,
        uint256 liquidatedCollateralAmount,
        address liquidator
    );

    function emitDeposit(address user, address asset, uint256 amount) external {
        emit Deposit(user, asset, amount);
    }

    function emitBorrow(address user, uint256 amount) external {
        emit Borrow(user, amount);
    }

    function emitRepay(address user, uint256 amount) external {
        emit Repay(user, amount);
    }

    function emitLiquidationCall(
        address collateralAsset,
        address user,
        uint256 debtToCover,
        uint256 liquidatedCollateralAmount,
        address liquidator
    ) external {
        emit LiquidationCall(collateralAsset, user, debtToCover, liquidatedCollateralAmount, liquidator);
    }
}
