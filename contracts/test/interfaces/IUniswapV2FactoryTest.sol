// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IUniswapV2FactoryTest {
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair);
}
