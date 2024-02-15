// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

interface IKyberNetworkProxy {
    function tradeWithHintAndFee(
        address srcToken,
        uint256 srcAmount,
        address destToken,
        address payable receiverAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external payable returns (uint256 destAmount);
}
