import { Address } from "ethereumjs-util";
import { BigNumber, Contract } from "ethers";
import { getAddress } from "ethers/lib/utils";
import { UniswapV2Mock } from "./uniswapV2-mock";
import { ERC20PresetMinterPauser } from "../../../../artifacts/types";
import { ethers } from "hardhat";

export function isNetworkCoin(tokenAddress: string): boolean {
  tokenAddress = getAddress(tokenAddress);
  return (
    tokenAddress === getAddress("0x0000000000000000000000000000000000001010") ||
    tokenAddress === getAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")
  );
}

export async function setupTokensAndApprove(
  crowdswapV3: Contract,
  ownerAmountIn: BigNumber,
  dexList: UniswapV2Mock[],
  owner: any
): Promise<void> {
  const fromToken = dexList[0].fromToken;

  if (!(fromToken instanceof Address) && !isNetworkCoin(fromToken.address)) {
    const ownerAddress = await owner.getAddress();

    await fromToken.connect(owner).mint(ownerAddress, ownerAmountIn);
    await fromToken.connect(owner).approve(crowdswapV3.address, ownerAmountIn);
  }

  await Promise.all(
    dexList.map(async (dex) => {
      const routerAddress = dex.router.address;
      const toToken = dex.toToken;
      const amountOut = dex.amountOut;

      if (toToken instanceof Address) {
        if (isNetworkCoin(toToken.toString())) {
          await owner.sendTransaction({ to: routerAddress, value: amountOut });
        }
      } else {
        if (!isNetworkCoin(toToken.address)) {
          await toToken.mint(routerAddress, amountOut);
        }
      }
    })
  );
}

export async function uniBalanceOf(
  token: ERC20PresetMinterPauser | Address,
  address: string
): Promise<BigNumber> {
  if (token instanceof Address) {
    if (isNetworkCoin(token.toString())) {
      return await ethers.provider.getBalance(address);
    }
  } else {
    if (!isNetworkCoin(token.address)) {
      return await token.balanceOf(address);
    }
  }
}
