import { Address } from "ethereumjs-util";
import { BigNumber, PopulatedTransaction } from "ethers";
import { ethers } from "hardhat";
import { CallInfoStruct } from "../../../../artifacts/types/CrowdSwapV3";

import { isNetworkCoin } from "./ethereum-util";

import {
  ERC20PresetMinterPauser,
  UniswapV2Router02Test,
  WETH,
} from "../../../../artifacts/types";

export class UniswapV2Mock {
  public router: UniswapV2Router02Test;
  public dexFlag: number;
  public wrapToken: ERC20PresetMinterPauser;
  public fromToken: ERC20PresetMinterPauser | Address | WETH;
  public toToken: ERC20PresetMinterPauser | Address | WETH;
  public amountIn: BigNumber;
  public amountOut: BigNumber;
  public to: string;

  //This is private. Use the static method `create(....)` for creating an object
  private constructor(
    router: UniswapV2Router02Test,
    addressToFlag: Record<string, number>,
    wrapToken: ERC20PresetMinterPauser,
    fromToken: ERC20PresetMinterPauser | Address | WETH,
    toToken: ERC20PresetMinterPauser | Address | WETH,
    amountIn: BigNumber,
    amountOut: BigNumber,
    to: string
  ) {
    this.router = router;
    this.dexFlag = addressToFlag[router.address];
    this.wrapToken = wrapToken;
    this.fromToken = fromToken;
    this.toToken = toToken;
    this.amountIn = amountIn;
    this.amountOut = amountOut;
    this.to = to;
  }

  static async create(
    router: UniswapV2Router02Test,
    addressToFlag: Record<string, number>,
    wrapToken: ERC20PresetMinterPauser,
    fromToken: ERC20PresetMinterPauser | Address | WETH,
    toToken: ERC20PresetMinterPauser | Address | WETH,
    amountIn: BigNumber,
    amountOut: BigNumber,
    to: string
  ): Promise<UniswapV2Mock> {
    const dex = new UniswapV2Mock(
      router,
      addressToFlag,
      wrapToken,
      fromToken,
      toToken,
      amountIn,
      amountOut,
      to
    );

    await dex.setAmountOut(amountOut);
    return dex;
  }

  public getFromTokenAddress(): string {
    return this.fromToken instanceof Address
      ? this.fromToken.toString()
      : this.fromToken.address;
  }

  public getToTokenAddress(): string {
    return this.toToken instanceof Address
      ? this.toToken.toString()
      : this.toToken.address;
  }

  /**
   *
   * @param fromToken
   * @param toToken
   * @returns the type of swaps includes: ETH_TO_TOKEN, TOKEN_TO_ETH, TOKEN_TO_TOKEN
   */
  public getSwapType(): "ETH_TO_TOKEN" | "TOKEN_TO_ETH" | "TOKEN_TO_TOKEN" {
    if (isNetworkCoin(this.getFromTokenAddress())) {
      return "ETH_TO_TOKEN";
    } else if (isNetworkCoin(this.getToTokenAddress())) {
      return "TOKEN_TO_ETH";
    } else {
      return "TOKEN_TO_TOKEN";
    }
  }

  public async splitTransaction(): Promise<CallInfoStruct> {
    const tx: PopulatedTransaction = await this.getTransaction();

    const selector = ethers.utils.arrayify(tx.data.substring(0, 10));

    let params: Uint8Array[] = [];
    for (let i = 10; i < tx.data.length; i += 64) {
      params.push(ethers.utils.arrayify("0x" + tx.data.substring(i, i + 64)));
    }

    let index = this.getPositionOfAmountIn();
    let isReplace = true;

    if (index < 0) {
      index = 0;
      isReplace = false;
    }

    return {
      dexFlag: this.dexFlag,
      fromToken: this.getFromTokenAddress(),
      toToken: this.getToTokenAddress(),
      selector,
      index,
      params,
      isReplace,
    };
  }

  public async getTransaction(): Promise<PopulatedTransaction> {
    const swapType = this.getSwapType();
    const amountOutMin = this.amountOut.mul(990).div(1000);
    const deadLine = await this.getDeadLine();

    if (swapType === "ETH_TO_TOKEN") {
      const path = [this.wrapToken.address, this.getToTokenAddress()];
      const tx = this.router.populateTransaction.swapExactETHForTokens(
        amountOutMin,
        path,
        this.to,
        deadLine,
        { value: this.amountIn }
      );

      return tx;
    } else if (swapType === "TOKEN_TO_ETH") {
      const path = [this.getFromTokenAddress(), this.getToTokenAddress()];
      const tx = this.router.populateTransaction.swapExactTokensForETH(
        this.amountIn,
        amountOutMin,
        path,
        this.to,
        deadLine
      );

      return tx;
    } else {
      const path = [this.getFromTokenAddress(), this.getToTokenAddress()];
      const tx = this.router.populateTransaction.swapExactTokensForTokens(
        this.amountIn,
        amountOutMin,
        path,
        this.to,
        deadLine
      );

      return tx;
    }
  }
  public async setAmountOut(amountOut: BigNumber): Promise<void> {
    this.amountOut = amountOut;
    await this.router.setAmountOut(amountOut);
  }

  public async getDeadLine(): Promise<number> {
    return (await ethers.provider.getBlock("latest")).timestamp + 1000;
  }

  /**
   *
   * @param fromToken
   * @param toToken
   * @returns the position of amountIn in the splitted call data if exist, else -1
   */
  private getPositionOfAmountIn(): number {
    const swapType = this.getSwapType();

    if (swapType === "ETH_TO_TOKEN") {
      /**
         we need to  call the function
         swapExactETHForTokens(
          uint256 amountOutMin,
          address[] calldata path,
          address to,
          uint256 deadline
         )
        */
      return -1; //There is not amountIn in the parameters
    } else if (swapType === "TOKEN_TO_ETH") {
      /**
          we need to  call the function
          swapExactTokensForETH(
            uint256 amountIn,
            uint256 amountOutMin,
            address[] calldata path,
            address to,
            uint256 deadline
          )
        */
      return 0; //the position of amountIn
    } else {
      /**
          we need to  call the
          function swapExactTokensForTokens(
            uint256 amountIn,
            uint256 amountOutMin,
            address[] calldata path,
            address to,
          )
        */
      return 0; //the position of amountIn
    }
  }
}
