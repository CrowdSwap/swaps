// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IUniswapV2ERC20 {
    function balanceOf(address owner) external view returns (uint);
    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint value
    ) external returns (bool);
}
