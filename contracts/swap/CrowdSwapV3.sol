// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;
import "../libraries/UniERC20Upgradeable.sol";
import "../helpers/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract CrowdSwapV3 is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    using UniERC20Upgradeable for ERC20Upgradeable;
    using SafeERC20Upgradeable for ERC20Upgradeable;

    enum FeeCalcDirection {
        TokenIn,
        TokenOut
    }
    struct AffiliateFeeInfo {
        uint256 feePercentage;
        bool isDefined;
    }

    struct DexAddress {
        uint8 flag;
        address adr;
    }

    struct CallInfo {
        uint8 dexFlag;
        address fromToken;
        address toToken;
        bytes4 selector;
        bytes[] params;
        uint8 index;
    }
    struct CrossDexParams {
        address payable receiverAddress;
        uint256 amountIn;
        CallInfo[] swapList;
        uint32 affiliateCode;
        uint256 minAmountOut;
        FeeCalcDirection feeCalcDirection;
    }

    struct SwapParams {
        address fromToken;
        address toToken;
        address payable receiverAddress;
        uint256 amountIn;
        uint8 dexFlag;
        bytes data;
        uint32 affiliateCode;
        uint256 minAmountOut;
        FeeCalcDirection feeCalcDirection;
    }

    mapping(uint8 => address) public dexchanges;

    uint256 public constant MIN_FEE = 1e16; //0.01%
    uint256 public constant MAX_FEE = 1e20; //100%
    mapping(uint32 => AffiliateFeeInfo) private _affiliateFees;
    address public feeTo;

    event SetFeeTo(address oldFeeToAddress, address newFeeToAddress);
    event setAffiliateFeePercent(
        uint32 indexed affiliateCode,
        uint256 oldFeePercentage,
        bool oldIsDefined,
        uint256 newFeePercentage,
        bool newIsDefined
    );
    event FeeDeducted(
        address indexed user,
        address indexed token,
        uint32 indexed affiliateCode,
        uint256 amount,
        uint256 feeAmount
    );

    event MiddleSwapEvent(
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut,
        uint8 dexFlag
    );

    event SwapSucceedEvent(
        address indexed receiverAddress,
        address indexed fromToken,
        address indexed toToken,
        address userAddress,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    function initialize(
        address payable _feeTo,
        uint256 _defaultFeePercentage,
        DexAddress[] calldata _dexAddresses
    ) public initializer {
        OwnableUpgradeable.initialize();
        PausableUpgradeable.__Pausable_init();
        setFeeTo(_feeTo);
        addDexchangesList(_dexAddresses);
        _setAffiliateFeePercentage(0, _defaultFeePercentage, true);
    }

    receive() external payable {}
    fallback() external {
        revert("CrowdSwapV3: function does  not exist.");
    }
    function pause() external onlyOwner {
        _pause();
    }
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Swap an input token to output token
     * @param _swapParams This is a struct of Parameters
     **/
    function swap(
        SwapParams memory _swapParams
    ) external payable whenNotPaused returns (uint256) {
        require(
            _swapParams.fromToken != _swapParams.toToken,
            "CrowdSwapV3: fromToken should not be equal with toToken"
        );
        require(
            _swapParams.receiverAddress != address(0),
            "CrowdSwapV3: receiverAddress is 0"
        );

        ERC20Upgradeable _fromToken = ERC20Upgradeable(_swapParams.fromToken);
        ERC20Upgradeable _toToken = ERC20Upgradeable(_swapParams.toToken);

        require(
            msg.value ==
                (
                    UniERC20Upgradeable.isETH(_fromToken)
                        ? _swapParams.amountIn
                        : 0
                ),
            "CrowdSwapV3: Incorrect ETH value sent"
        );

        _safeTransferTokenFrom(_fromToken, msg.sender, _swapParams.amountIn);

        uint256 _amountIn = _swapParams.amountIn;

        if (_swapParams.feeCalcDirection == FeeCalcDirection.TokenIn) {
            _amountIn = _deductFee(
                _fromToken,
                msg.sender,
                _swapParams.amountIn,
                _swapParams.affiliateCode
            );
        }

        address _dexAddress = _extractDexAddress(_swapParams.dexFlag);

        uint256 _amountOut = _swap(
            _dexAddress,
            _swapParams.data,
            _fromToken,
            _toToken,
            _amountIn
        );

        if (_swapParams.feeCalcDirection == FeeCalcDirection.TokenOut) {
            _amountOut = _deductFee(
                _toToken,
                msg.sender,
                _amountOut,
                _swapParams.affiliateCode
            );
        }

        require(
            _amountOut >= _swapParams.minAmountOut,
            "CrowdSwapV3: Minimum amount not met"
        );

        _safeTransferTokenTo(
            _toToken,
            payable(_swapParams.receiverAddress),
            _amountOut
        );

        emit SwapSucceedEvent(
            _swapParams.receiverAddress,
            _swapParams.fromToken,
            _swapParams.toToken,
            msg.sender,
            _swapParams.amountIn,
            _amountOut
        );

        return _amountOut;
    }

    /**
     * @dev Swap the input tokens to output tokens by doing two or more separate swaps between dexes
     **/
    function crossDexSwap(
        CrossDexParams memory _crossDexParams
    ) external payable whenNotPaused returns (uint256) {
        require(
            _crossDexParams.swapList.length > 0,
            "CrowdSwapV3: Swap List is empty"
        );
        require(
            _crossDexParams.receiverAddress != address(0),
            "CrowdSwapV3: receiverAddress is 0"
        );

        ERC20Upgradeable fromToken = ERC20Upgradeable(
            _crossDexParams.swapList[0].fromToken
        );
        ERC20Upgradeable toToken;
        uint256 amountIn = _crossDexParams.amountIn;
        uint256 amountOut; // It will be calculated in the loop

        address dexAddress;

        // Validate ETH value sent if the input token is ETH
        require(
            msg.value == (UniERC20Upgradeable.isETH(fromToken) ? amountIn : 0),
            "CrowdSwapV3: Incorrect ETH value sent"
        );

        // Transfer input tokens to the contract
        _safeTransferTokenFrom(fromToken, msg.sender, amountIn);

        // Deduct fees if applicable from the initial input
        if (_crossDexParams.feeCalcDirection == FeeCalcDirection.TokenIn) {
            amountIn = _deductFee(
                fromToken,
                msg.sender,
                amountIn,
                _crossDexParams.affiliateCode
            );
        }

        // Perform middle swaps
        for (uint256 i = 0; i < _crossDexParams.swapList.length; i++) {
            toToken = ERC20Upgradeable(_crossDexParams.swapList[i].toToken);
            dexAddress = _extractDexAddress(
                _crossDexParams.swapList[i].dexFlag
            );

            // amount replacement
            _crossDexParams.swapList[i].params[
                _crossDexParams.swapList[i].index
            ] = abi.encode(amountIn);

            // Perform the swap
            bytes memory swapData = _assembleCallData(
                _crossDexParams.swapList[i]
            );
            amountOut = _swap(
                dexAddress,
                swapData,
                fromToken,
                toToken,
                amountIn
            );

            emit MiddleSwapEvent(
                address(fromToken),
                address(toToken),
                amountIn,
                amountOut,
                _crossDexParams.swapList[i].dexFlag
            );

            amountIn = amountOut;
            fromToken = toToken;
        }

        // Deduct fees if applicable for the final output
        if (_crossDexParams.feeCalcDirection == FeeCalcDirection.TokenOut) {
            amountOut = _deductFee(
                toToken,
                msg.sender,
                amountOut,
                _crossDexParams.affiliateCode
            );
        }

        // Check if the minimum amount out is met
        require(
            amountOut >= _crossDexParams.minAmountOut,
            "CrowdSwapV3: Minimum amount not met"
        );

        // Transfer output tokens to the receiver
        _safeTransferTokenTo(
            toToken,
            payable(_crossDexParams.receiverAddress),
            amountOut
        );

        emit SwapSucceedEvent(
            _crossDexParams.receiverAddress,
            _crossDexParams.swapList[0].fromToken,
            address(toToken),
            msg.sender,
            _crossDexParams.amountIn,
            amountOut
        );

        return amountOut;
    }

    function version() external pure returns (string memory) {
        return "V3.0";
    }

    function setAffiliateFeePercentage(
        uint32 _code,
        uint256 _feePercentage,
        bool _isDefined
    ) public onlyOwner whenPaused {
        _setAffiliateFeePercentage(_code, _feePercentage, _isDefined);
    }

    function addDexchangesList(
        DexAddress[] memory dexAddresses
    ) public onlyOwner {
        for (uint8 i = 0; i < dexAddresses.length; ++i) {
            DexAddress memory dexAddress = dexAddresses[i];
            if (dexAddress.adr != address(0)) {
                dexchanges[dexAddress.flag] = dexAddress.adr;
            }
        }
    }

    function setFeeTo(address payable _feeTo) public onlyOwner {
        require(_feeTo != address(0), "CrowdSwapV3: feeTo is 0");
        emit SetFeeTo(feeTo, _feeTo);
        feeTo = _feeTo;
    }

    function _extractDexAddress(uint8 _dexFlag) private view returns (address) {
        address _dexAddress = dexchanges[_dexFlag];
        require(_dexAddress != address(0), "CrowdSwapV3: unsupported dex flag");
        return _dexAddress;
    }

    function _safeTransferTokenFrom(
        IERC20Upgradeable _fromToken,
        address _senderAddress,
        uint256 _amountIn
    ) private {
        if (UniERC20Upgradeable.isETH(_fromToken)) {
            return;
        }
        uint256 _balanceBefore = UniERC20Upgradeable.uniBalanceOf(
            _fromToken,
            address(this)
        );
        SafeERC20Upgradeable.safeTransferFrom(
            _fromToken,
            _senderAddress,
            address(this),
            _amountIn
        );
        uint256 _balanceAfter = UniERC20Upgradeable.uniBalanceOf(
            _fromToken,
            address(this)
        );
        require(
            _balanceAfter - _balanceBefore == _amountIn,
            "CrowdSwapV3: tokenIn has not transferred to contract"
        );
    }

    function _safeTransferTokenTo(
        IERC20Upgradeable _toToken,
        address payable _receiverAddress,
        uint256 _amountOut
    ) private {
        uint256 _balanceBefore = UniERC20Upgradeable.uniBalanceOf(
            _toToken,
            _receiverAddress
        );
        UniERC20Upgradeable.uniTransfer(_toToken, _receiverAddress, _amountOut);
        uint256 _balanceAfter = UniERC20Upgradeable.uniBalanceOf(
            _toToken,
            _receiverAddress
        );
        require(
            _balanceAfter - _balanceBefore == _amountOut,
            "CrowdSwapV3: tokenOut has not transferred to receiver"
        );
    }

    function _setAffiliateFeePercentage(
        uint32 _code,
        uint256 _feePercentage,
        bool _isDefined
    ) private {
        // 1e18 is 1%
        require(
            MIN_FEE <= _feePercentage && _feePercentage <= MAX_FEE,
            "CrowdSwapV3: feePercentage is not in the range"
        );

        AffiliateFeeInfo memory _oldAffiliateFee = _affiliateFees[_code]; //gas saving

        emit setAffiliateFeePercent(
            _code,
            _oldAffiliateFee.feePercentage,
            _oldAffiliateFee.isDefined,
            _feePercentage,
            _isDefined
        );

        _affiliateFees[_code] = AffiliateFeeInfo({
            feePercentage: _feePercentage,
            isDefined: _isDefined
        });
    }

    function _calculateAmountFee(
        uint256 _calculationAmount,
        uint32 _affiliateCode
    ) private view returns (uint256) {
        uint256 _percentage = _affiliateFees[_affiliateCode].feePercentage;
        return (_percentage * _calculationAmount) / (1e20);
    }

    function _deductFee(
        IERC20Upgradeable _token,
        address _onBehalfOfAddress,
        uint256 _amount,
        uint32 _affiliateCode
    ) private returns (uint256) {
        //default affliate code is 0
        uint32 _effectiveAffiliateCode = _affiliateFees[_affiliateCode]
            .isDefined
            ? _affiliateCode
            : 0;

        //default affliate code is 0
        uint256 _amountFee = _calculateAmountFee(
            _amount,
            _effectiveAffiliateCode
        );
        if (_amountFee > 0) {
            _safeTransferTokenTo(_token, payable(feeTo), _amountFee);
        }
     
        emit FeeDeducted(
            _onBehalfOfAddress,
            address(_token),
            _affiliateCode,
            _amount,
            _amountFee
        );
        uint256 _netAmount = _amount - _amountFee;
        return _netAmount;
    }

    function _swap(
        address _dexAddress,
        bytes memory _data,
        IERC20Upgradeable _fromToken,
        IERC20Upgradeable _toToken,
        uint256 _amountIn
    ) private returns (uint256 amountOut) {
        if (!UniERC20Upgradeable.isETH(_fromToken)) {
            UniERC20Upgradeable.uniApprove(_fromToken, _dexAddress, _amountIn);
        }
        uint256 _beforeBalance = UniERC20Upgradeable.uniBalanceOf(
            _toToken,
            address(this)
        );

        uint256 _msgValue = (
            UniERC20Upgradeable.isETH(_fromToken) ? _amountIn : 0
        );

        (bool success, bytes memory returnData) = _dexAddress.call{
            value: _msgValue
        }(_data);

        if (!success) {
            assembly {
                let returnData_size := mload(returnData)
                revert(add(32, returnData), returnData_size)
            }
        }

        amountOut =
            UniERC20Upgradeable.uniBalanceOf(_toToken, address(this)) -
            _beforeBalance;
        require(amountOut > 0, "CrowdSwapV3: amount out is 0");
    }

    /**
     * @dev Create the rewuired Data by using CallInfo
     * @param _callInfo The information of the function to be called
     **/
    function _assembleCallData(
        CallInfo memory _callInfo
    ) private pure returns (bytes memory returnData) {
        bytes memory _data = abi.encodePacked(_callInfo.selector);
        for (uint8 i = 0; i < _callInfo.params.length; i++) {
            _data = abi.encodePacked(_data, _callInfo.params[i]);
        }
        returnData = _data;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
