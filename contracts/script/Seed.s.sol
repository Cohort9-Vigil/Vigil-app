// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {VigilPool} from "../src/core/VigilPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";

/// @notice Funds a lender and a liquidator, then opens 100 borrower positions spread over the three collateral
/// assets with health factors between 1.05 and 1.6. Run it after Deploy, once chain time has passed the TWAP window.
contract Seed is Script {
    using stdJson for string;

    uint256 constant BORROWERS = 100;
    uint256 constant MIN_HEALTH_FACTOR = 1.05e18;
    uint256 constant HEALTH_FACTOR_SPREAD = 0.55e18;
    uint256 constant COLLATERAL_VALUE_USD = 10_000;
    uint256 constant LIQUIDITY_USD = 5_000_000;
    uint256 constant LIQUIDATOR_USD = 1_000_000;
    uint256 constant THRESHOLD_BPS = 8000;
    uint256 constant GAS_MONEY = 0.05 ether;

    VigilPool pool;
    MockERC20 stablecoin;
    MockERC20[3] collateral;
    uint256[3] pricesUsd = [uint256(100), 50, 20_000];

    function run() external {
        string memory json = vm.readFile("./deployments/anvil.json");
        pool = VigilPool(json.readAddress(".pool"));
        stablecoin = MockERC20(json.readAddress(".stablecoin"));
        collateral[0] = MockERC20(json.readAddress(".feeToken"));
        collateral[1] = MockERC20(json.readAddress(".sixDecimalToken"));
        collateral[2] = MockERC20(json.readAddress(".eightDecimalToken"));
        address settlement = json.readAddress(".settlement");

        IOracleAdapter oracle = IOracleAdapter(json.readAddress(".oracle"));
        require(oracle.state() == IOracleAdapter.State.Normal, "oracle is frozen, advance chain time first");

        vm.startBroadcast();
        _fundLenderAndLiquidator(settlement);
        vm.stopBroadcast();

        for (uint256 i = 0; i < BORROWERS; i++) {
            _openBorrower(i);
        }

        console2.log("borrowers seeded", BORROWERS);
    }

    function _fundLenderAndLiquidator(address settlement) internal {
        stablecoin.mint(msg.sender, LIQUIDITY_USD * 1e6);
        stablecoin.approve(address(pool), type(uint256).max);
        pool.supply(LIQUIDITY_USD * 1e6);

        // the liquidator is the deployer account, so it needs the stablecoin and an approval for the settlement
        stablecoin.mint(msg.sender, LIQUIDATOR_USD * 1e6);
        stablecoin.approve(settlement, type(uint256).max);
    }

    function _openBorrower(uint256 index) internal {
        uint256 borrowerKey = uint256(keccak256(abi.encode("vigil-borrower", index)));
        address borrower = vm.addr(borrowerKey);
        MockERC20 token = collateral[index % 3];
        uint256 priceUsd = pricesUsd[index % 3];
        uint256 amount = (COLLATERAL_VALUE_USD * 10 ** token.decimals()) / priceUsd;

        // pseudo-random health factor in [1.05, 1.6), the same every run
        uint256 healthFactor = MIN_HEALTH_FACTOR + uint256(keccak256(abi.encode("hf", index))) % HEALTH_FACTOR_SPREAD;

        vm.startBroadcast();
        payable(borrower).transfer(GAS_MONEY);
        token.mint(borrower, amount);
        vm.stopBroadcast();

        vm.startBroadcast(borrowerKey);
        token.approve(address(pool), amount);
        pool.depositCollateral(address(token), amount);
        vm.stopBroadcast();

        // borrow against what the pool actually credited (the fee token loses 2% on the way in)
        uint256 credited = pool.getCollateralBalance(borrower, address(token));
        uint256 collateralValueUsd6 = (credited * priceUsd * 1e6) / 10 ** token.decimals();
        uint256 debt = (collateralValueUsd6 * THRESHOLD_BPS * 1e18) / (10_000 * healthFactor);

        vm.startBroadcast(borrowerKey);
        pool.borrow(debt);
        vm.stopBroadcast();
    }
}
