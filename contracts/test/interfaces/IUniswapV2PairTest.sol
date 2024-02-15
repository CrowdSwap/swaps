// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./IUniswapV2ERC20.sol";

interface IUniswapV2PairTest is IUniswapV2ERC20 {
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function mint(address to) external returns (uint liquidity);
    function burn(address to) external returns (uint amount0, uint amount1);
    function initialize(address, address) external;
}
