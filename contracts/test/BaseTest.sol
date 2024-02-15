// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./interfaces/IKyberNetworkProxy.sol";
import "../libraries/UniERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";

contract BaseTest is Context {

    using UniERC20 for IERC20;

    uint256 internal amountOut;
    uint256 internal receivedETH;
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

    receive() external payable {}

    function setAmountOut(uint256 _amountOut) external {
        amountOut = _amountOut;
    }

    function getReceivedEth() external view returns(uint256) {
        return receivedETH;
    }

    function _safeTransfer(address token, address to, uint value) internal {
        receivedETH = msg.value;

        if (IERC20(token).isETH()) {
            payable(to).transfer(value);
        } else {
            IERC20(token).transfer(to, value);
        }
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint value
    ) internal {
        receivedETH = msg.value;

        if (IERC20(token).isETH()) {
            payable(to).transfer(value);
        } else {
            IERC20(token).transferFrom(from, to, value);
        }
    }
}
