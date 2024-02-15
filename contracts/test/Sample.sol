// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import "hardhat/console.sol";

contract Sample {
    using SafeMath for uint256;

    uint public someVariable;
    uint[] public myData;

    function pushStorageVar(uint arg1) public {
        uint[] storage x = myData;
        x.push(arg1);
    }

    function pushMemoryVar(uint arg1) public {
        uint[] memory x = new uint[](1);
        x[0] = arg1;
        myData = x;
    }

    function getValue() external pure returns (uint) {
        return 2e18;
    }

    function useStorageVar(uint arg1) public {
        uint[] storage x = myData;
        x[0] = arg1;
    }

    function useMemoryVar(uint arg1) public view {
        uint[] memory x = myData;
        x[0] = arg1;
    }

    function feeCalculator(
        uint256 withdrawalAmount,
        uint256 percentage,
        uint256 fraction
    ) public pure returns (uint256) {
        return percentage.mul(withdrawalAmount).div(fraction).div(100);
    }

    function returnNothing() external pure returns (uint256) {
        bool x = true;
    }
}
