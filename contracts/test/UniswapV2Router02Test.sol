// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./BaseTest.sol";
import "./UniswapV2FactoryTest.sol";
import "../interfaces/IUniswapV2Router02.sol";
import "../libraries/UniERC20.sol";
import "./lib/UniswapV2LibraryTest.sol";

contract UniswapV2Router02Test is IUniswapV2Router02, BaseTest {
    address public factory;
    address public WETH;

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        _;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable override returns (uint256[] memory amounts) {
        super._safeTransfer(path[path.length - 1], to, amountOut);
        uint256[] memory results = new uint256[](1);
        results[0] = amountOut;
        return results;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override returns (uint256[] memory amounts) {
        super._safeTransfer(path[path.length - 1], to, amountOut);
        uint256[] memory results = new uint256[](1);
        results[0] = amountOut;
        return results;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override returns (uint256[] memory amounts) {
        super._safeTransferFrom(path[0], msg.sender, address(this), amountIn);
        super._safeTransfer(path[path.length - 1], to, amountOut);
        uint256[] memory results = new uint256[](1);
        results[0] = amountOut;
        return results;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
        returns (uint amountA, uint amountB, uint liquidity)
    {
        (amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );
        address pair = UniswapV2FactoryTest(factory).getPair(tokenA, tokenB);
        super._safeTransferFrom(tokenA, msg.sender, pair, amountA);
        super._safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IUniswapV2PairTest(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    )
        public
        virtual
        override
        ensure(deadline)
        returns (uint amountA, uint amountB)
    {
        address pair = UniswapV2FactoryTest(factory).getPair(tokenA, tokenB);
        IUniswapV2PairTest(pair).transferFrom(msg.sender, pair, liquidity);
        (uint amount0, uint amount1) = IUniswapV2PairTest(pair).burn(to);
        (amountA, amountB) = (amount0, amount1);
        require(
            amountA >= amountAMin,
            "UniswapV2Router: INSUFFICIENT_A_AMOUNT"
        );
        require(
            amountB >= amountBMin,
            "UniswapV2Router: INSUFFICIENT_B_AMOUNT"
        );
    }

    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    )
        public
        virtual
        override
        ensure(deadline)
        returns (uint amountToken, uint amountETH)
    {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
    }

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn't exist yet
        if (
            UniswapV2FactoryTest(factory).getPair(tokenA, tokenB) == address(0)
        ) {
            UniswapV2FactoryTest(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = UniswapV2LibraryTest.getReserves(
            factory,
            tokenA,
            tokenB
        );
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = UniswapV2LibraryTest.quote(
                amountADesired,
                reserveA,
                reserveB
            );
            if (amountBOptimal <= amountBDesired) {
                require(
                    amountBOptimal >= amountBMin,
                    "UniswapV2Router: INSUFFICIENT_B_AMOUNT"
                );
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = UniswapV2LibraryTest.quote(
                    amountBDesired,
                    reserveB,
                    reserveA
                );
                assert(amountAOptimal <= amountADesired);
                require(
                    amountAOptimal >= amountAMin,
                    "UniswapV2Router: INSUFFICIENT_A_AMOUNT"
                );
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
}
