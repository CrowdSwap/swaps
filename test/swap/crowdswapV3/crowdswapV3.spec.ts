import { expect } from "chai";
import { getAddress, parseEther } from "ethers/lib/utils";
import { ethers, waffle } from "hardhat";
import {
  CallInfoStruct,
  CrossDexParamsStruct,
  SwapParamsStruct,
} from "../../../artifacts/types/CrowdSwapV3";
import { CrowdSwapV3Fixture } from "./fixture/crowdswapV3-fixture";
import { FeeCalcDirection } from "./types/fee-calc-direction";
import { setupTokensAndApprove, uniBalanceOf } from "./utils/ethereum-util";
import { UniswapV2Mock } from "./utils/uniswapV2-mock";
import { BigNumber } from "ethers";

describe("AggregatorV3", async () => {
  let owner, feeTo;
  let network;
  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>;

  beforeEach(async function () {
    [owner, feeTo] = await ethers.getSigners();
    loadFixture = waffle.createFixtureLoader(
      [owner, feeTo],
      <any>ethers.provider
    );
    network = await ethers.provider.getNetwork();
  });

  describe("Ownable", async () => {
    it("Call unknown function over Crowdswap contract should be reverted", async () => {
      const { crowdswapV3 } = await loadFixture(CrowdSwapV3Fixture);

      const contractHandler = new ethers.Contract(
        crowdswapV3.address,
        ["function unknown()"],
        ethers.provider.getSigner(owner.address)
      );

      await expect(contractHandler.functions["unknown()"]()).to.revertedWith(
        "CrowdSwapV3: function does  not exist."
      );
    });

    it("Send ETH to the contract should be accepted", async () => {
      const { crowdswapV3 } = await loadFixture(CrowdSwapV3Fixture);

      await expect(await ethers.provider.getBalance(crowdswapV3.address)).to.eq(
        ethers.utils.parseEther("0")
      );

      const amountIn = ethers.utils.parseEther("10");
      await owner.sendTransaction({
        to: crowdswapV3.address,
        value: amountIn,
      });

      await expect(await ethers.provider.getBalance(crowdswapV3.address)).to.eq(
        amountIn
      );
    });

    it("Change feePercentage", async () => {
      const { crowdswapV3 } = await loadFixture(CrowdSwapV3Fixture);

      let feePercentage = await crowdswapV3.affiliateFeePercentage(1);
      await expect(feePercentage).to.eq(parseEther("0"));

      let tx = await crowdswapV3.setAffiliateFeePercentage(
        1,
        parseEther("0.2")
      );
      await tx.wait();

      feePercentage = await crowdswapV3.affiliateFeePercentage(1);
      await expect(feePercentage).to.eq(parseEther("0.2"));
    });
  });

  describe("swap", async () => {
    it("Swap TOKEN/TOKEN should be successful", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        DAI: fromToken,
        USDT: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("10");
      const finalAmountOut = ethers.utils.parseEther("0.0012944");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.address,
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };
      const tx = await crowdswapV3.swap(swapParams);

      //assertions
      await expect(tx)
        .to.emit(crowdswapV3, "SwapSucceedEvent")
        .withArgs(
          owner.address,
          getAddress(fromToken.address),
          getAddress(toToken.address),
          owner.address,
          ownerAmountIn,
          finalAmountOut
        );

      // from token checks
      expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
        BigNumber.from(0)
      );
      expect(await uniBalanceOf(fromToken, crowdswapV3.address)).to.equal(
        BigNumber.from(0)
      );
      expect(await uniBalanceOf(fromToken, feeToAddress)).to.equal(swapFee);

      //to token checks
      expect(await uniBalanceOf(toToken, owner.address)).to.equal(
        finalAmountOut
      );
      expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
        BigNumber.from(0)
      );
      expect(await uniBalanceOf(toToken, feeToAddress)).to.equal(
        BigNumber.from(0)
      );
    });

    it("Swap TOKEN/ETH should be successful", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        DAI: fromToken,
        ETH: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("10");
      const finalAmountOut = ethers.utils.parseEther("0.0012944");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const feeToBalanceBefore = {
        fromToken: await uniBalanceOf(fromToken, feeToAddress),
        toToken: await uniBalanceOf(toToken, feeToAddress),
      };

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.address,
        toToken: toToken.toString(),
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };
      const tx = await crowdswapV3.swap(swapParams);

      //assertions
      await expect(tx)
        .to.emit(crowdswapV3, "SwapSucceedEvent")
        .withArgs(
          owner.address,
          getAddress(fromToken.address),
          getAddress(toToken.toString()),
          owner.address,
          ownerAmountIn,
          finalAmountOut
        );

      const feeToBalanceAfter = {
        fromToken: await uniBalanceOf(fromToken, feeToAddress),
        toToken: await uniBalanceOf(toToken, feeToAddress),
      };

      const feeToBalanceDiff = {
        fromToken: feeToBalanceAfter.fromToken.sub(
          feeToBalanceBefore.fromToken
        ),
        toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
      };

      // from token checks
      expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
        BigNumber.from(0)
      );
      expect(await uniBalanceOf(fromToken, feeToAddress)).to.equal(swapFee);

      //to token checks
      expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
        BigNumber.from(0)
      );
      expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
    });

    it("Swap ETH/TOKEN should be successful", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        ETH: fromToken,
        DAI: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("0.0012944");
      let finalAmountOut = ethers.utils.parseEther("10");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const feeToBalanceBefore = {
        fromToken: await uniBalanceOf(fromToken, feeToAddress),
        toToken: await uniBalanceOf(toToken, feeToAddress),
      };

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.toString(),
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };
      const tx = await crowdswapV3.swap(swapParams, { value: ownerAmountIn });

      const feeToBalanceAfter = {
        fromToken: await uniBalanceOf(fromToken, feeToAddress),
        toToken: await uniBalanceOf(toToken, feeToAddress),
      };

      const feeToBalanceDiff = {
        fromToken: feeToBalanceAfter.fromToken.sub(
          feeToBalanceBefore.fromToken
        ),
        toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
      };

      //assertions
      await expect(tx)
        .to.emit(crowdswapV3, "SwapSucceedEvent")
        .withArgs(
          owner.address,
          getAddress(fromToken.toString()),
          getAddress(toToken.address),
          owner.address,
          ownerAmountIn,
          finalAmountOut
        );

      // from token checks
      expect(await uniBalanceOf(fromToken, crowdswapV3.address)).to.equal(
        BigNumber.from(0)
      );
      expect(feeToBalanceDiff.fromToken).to.equal(swapFee);

      //to token checks
      expect(await uniBalanceOf(toToken, owner.address)).to.equal(
        finalAmountOut
      );
      expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
        BigNumber.from(0)
      );
      expect(await uniBalanceOf(toToken, feeToAddress)).to.equal(
        BigNumber.from(0)
      );
    });

    it("When the non zero ETh is sent, Swap TOKEN/TOKEN should be failed", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        DAI: fromToken,
        USDT: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("10");
      const finalAmountOut = ethers.utils.parseEther("0.0012944");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.address,
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };

      await expect(
        crowdswapV3.swap(swapParams, {
          value: 1,
        })
      ).to.revertedWith("CrowdSwapV3: Incorrect ETH value sent");
    });

    it("When the sent ETh is not equal to amount in, Swap ETH/TOKEN should be failed", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        ETH: fromToken,
        DAI: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("0.0012944");
      let finalAmountOut = ethers.utils.parseEther("10");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.toString(),
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };

      await expect(
        crowdswapV3.swap(swapParams, {
          value: ownerAmountIn.sub(1),
        })
      ).to.revertedWith("CrowdSwapV3: Incorrect ETH value sent");

      await expect(
        crowdswapV3.swap(swapParams, {
          value: ownerAmountIn.add(1),
        })
      ).to.revertedWith("CrowdSwapV3: Incorrect ETH value sent");
    });

    it("When amount out is 0, Swap should be failed", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        ETH: fromToken,
        DAI: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("0.0012944");
      let finalAmountOut = ethers.utils.parseEther("0");
      const minAmountOut = finalAmountOut;
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.toString(),
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };

      await expect(
        crowdswapV3.swap(swapParams, {
          value: ownerAmountIn,
        })
      ).to.revertedWith("CrowdSwapV3: amount out is 0");
    });

    it("When amount out is lower than min amount, Swap should be failed", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        ETH: fromToken,
        DAI: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("0.0012944");
      let finalAmountOut = ethers.utils.parseEther("10");
      const minAmountOut = finalAmountOut.add(1);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.toString(),
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };

      await expect(
        crowdswapV3.swap(swapParams, {
          value: ownerAmountIn,
        })
      ).to.revertedWith("CrowdSwapV3: Minimum amount not met");
    });

    it("When token in is the same token out, Swap should be failed", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        DAI: fromToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const toToken = fromToken;

      const ownerAmountIn = ethers.utils.parseEther("10");
      const finalAmountOut = ethers.utils.parseEther("0.0012944");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.address,
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };

      await expect(crowdswapV3.swap(swapParams)).to.revertedWith(
        "CrowdSwapV3: fromToken should not be equal with toToken"
      );
    });

    it("When dex flag is wrong, Swap should be failed", async () => {
      const {
        crowdswapV3,
        uniswap2: router,
        WETH,
        DAI: fromToken,
        USDT: toToken,
        addressToFlag,
        feeToAddress,
      } = await loadFixture(CrowdSwapV3Fixture);

      const ownerAmountIn = ethers.utils.parseEther("10");
      const finalAmountOut = ethers.utils.parseEther("0.0012944");
      const minAmountOut = finalAmountOut.mul(900).div(1000);
      const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
      const swapFee = ownerAmountIn.div(1000);
      addressToFlag[router.address] = 201;

      //initializing dex
      const dexFromToken = fromToken;
      const dexToToken = toToken;
      const dexAmountIn = ownerAmountIn.sub(swapFee);
      const dexAmountOut = finalAmountOut;
      const dexTo = crowdswapV3.address;

      //initializing dex
      const dex: UniswapV2Mock = await UniswapV2Mock.create(
        router,
        addressToFlag,
        WETH,
        dexFromToken,
        dexToToken,
        dexAmountIn,
        dexAmountOut,
        dexTo
      );

      //prepare the required assets
      await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

      const swapTx = await dex.getTransaction();

      const swapParams: SwapParamsStruct = {
        fromToken: fromToken.address,
        toToken: toToken.address,
        receiverAddress: owner.address,
        amountIn: ownerAmountIn,
        dexFlag: addressToFlag[dex.router.address],
        data: swapTx.data,
        affiliateCode: 0,
        minAmountOut: minAmountOut,
        feeCalcDirection: feeCalcDirection,
      };

      await expect(crowdswapV3.swap(swapParams)).to.revertedWith(
        "CrowdSwapV3: unsupported dex flag"
      );
    });

    describe("deductFee", async () => {
      describe("From token in", async () => {
        it("When TOKEN/ETH swap, should transfer from token to feeTo address", async () => {
          const {
            crowdswapV3,
            uniswap2: router,
            WETH,
            DAI: fromToken,
            ETH: toToken,
            addressToFlag,
            feeToAddress,
          } = await loadFixture(CrowdSwapV3Fixture);

          const ownerAmountIn = ethers.utils.parseEther("10");
          const finalAmountOut = ethers.utils.parseEther("0.0012944");
          const minAmountOut = finalAmountOut.mul(900).div(1000);
          const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
          const swapFee = ownerAmountIn.div(1000);

          //initializing dex
          const dexFromToken = fromToken;
          const dexToToken = toToken;
          const dexAmountIn = ownerAmountIn.sub(swapFee);
          const dexAmountOut = finalAmountOut;
          const dexTo = crowdswapV3.address;

          //initializing dex
          const dex: UniswapV2Mock = await UniswapV2Mock.create(
            router,
            addressToFlag,
            WETH,
            dexFromToken,
            dexToToken,
            dexAmountIn,
            dexAmountOut,
            dexTo
          );

          //prepare the required assets
          await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

          const swapTx = await dex.getTransaction();

          const swapParams: SwapParamsStruct = {
            fromToken: fromToken.address,
            toToken: toToken.toString(),
            receiverAddress: owner.address,
            amountIn: ownerAmountIn,
            dexFlag: addressToFlag[dex.router.address],
            data: swapTx.data,
            affiliateCode: 0,
            minAmountOut: minAmountOut,
            feeCalcDirection: feeCalcDirection,
          };

          const feeToBalanceBefore = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          await crowdswapV3.swap(swapParams);

          const feeToBalanceAfter = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          const feeToBalanceDiff = {
            fromToken: feeToBalanceAfter.fromToken.sub(
              feeToBalanceBefore.fromToken
            ),
            toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
          };

          expect(feeToBalanceDiff.fromToken).to.equal(swapFee);
          expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
        });

        it("When ETH/TOKEN swap, should transfer ETH to feeTo address", async () => {
          const {
            crowdswapV3,
            uniswap2: router,
            WETH,
            ETH: fromToken,
            DAI: toToken,
            addressToFlag,
            feeToAddress,
          } = await loadFixture(CrowdSwapV3Fixture);

          const ownerAmountIn = ethers.utils.parseEther("0.0012944");
          let finalAmountOut = ethers.utils.parseEther("10");
          const minAmountOut = finalAmountOut.mul(900).div(1000);
          const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
          const swapFee = ownerAmountIn.div(1000);

          //initializing dex
          const dexFromToken = fromToken;
          const dexToToken = toToken;
          const dexAmountIn = ownerAmountIn.sub(swapFee);
          const dexAmountOut = finalAmountOut;
          const dexTo = crowdswapV3.address;

          //initializing dex
          const dex: UniswapV2Mock = await UniswapV2Mock.create(
            router,
            addressToFlag,
            WETH,
            dexFromToken,
            dexToToken,
            dexAmountIn,
            dexAmountOut,
            dexTo
          );

          //prepare the required assets
          await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

          const swapTx = await dex.getTransaction();

          const swapParams: SwapParamsStruct = {
            fromToken: fromToken.toString(),
            toToken: toToken.address,
            receiverAddress: owner.address,
            amountIn: ownerAmountIn,
            dexFlag: addressToFlag[dex.router.address],
            data: swapTx.data,
            affiliateCode: 0,
            minAmountOut: minAmountOut,
            feeCalcDirection: feeCalcDirection,
          };

          const feeToBalanceBefore = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          await crowdswapV3.swap(swapParams, { value: ownerAmountIn });

          const feeToBalanceAfter = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          const feeToBalanceDiff = {
            fromToken: feeToBalanceAfter.fromToken.sub(
              feeToBalanceBefore.fromToken
            ),
            toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
          };

          expect(feeToBalanceDiff.fromToken).to.equal(swapFee);
          expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
        });
      });
      describe("From token out", async () => {
        it("When TOKEN/ETH swap, should transfer from token to feeTo address", async () => {
          const {
            crowdswapV3,
            uniswap2: router,
            WETH,
            DAI: fromToken,
            ETH: toToken,
            addressToFlag,
            feeToAddress,
          } = await loadFixture(CrowdSwapV3Fixture);

          const ownerAmountIn = ethers.utils.parseEther("10");
          const finalAmountOut = ethers.utils.parseEther("0.0012944");
          const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenOut;
          const swapFee = finalAmountOut.div(1000);
          const minAmountOut = finalAmountOut.sub(swapFee).mul(900).div(1000);

          //initializing dex
          const dexFromToken = fromToken;
          const dexToToken = toToken;
          const dexAmountIn = ownerAmountIn.sub(swapFee);
          const dexAmountOut = finalAmountOut;
          const dexTo = crowdswapV3.address;

          //initializing dex
          const dex: UniswapV2Mock = await UniswapV2Mock.create(
            router,
            addressToFlag,
            WETH,
            dexFromToken,
            dexToToken,
            dexAmountIn,
            dexAmountOut,
            dexTo
          );

          //prepare the required assets
          await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

          const swapTx = await dex.getTransaction();

          const swapParams: SwapParamsStruct = {
            fromToken: fromToken.address,
            toToken: toToken.toString(),
            receiverAddress: owner.address,
            amountIn: ownerAmountIn,
            dexFlag: addressToFlag[dex.router.address],
            data: swapTx.data,
            affiliateCode: 0,
            minAmountOut: minAmountOut,
            feeCalcDirection: feeCalcDirection,
          };

          const feeToBalanceBefore = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          await crowdswapV3.swap(swapParams);

          const feeToBalanceAfter = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          const feeToBalanceDiff = {
            fromToken: feeToBalanceAfter.fromToken.sub(
              feeToBalanceBefore.fromToken
            ),
            toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
          };

          expect(feeToBalanceDiff.fromToken).to.equal(BigNumber.from(0));
          expect(feeToBalanceDiff.toToken).to.equal(swapFee);
        });

        it("When ETH/TOKEN swap, should transfer ETH to feeTo address", async () => {
          const {
            crowdswapV3,
            uniswap2: router,
            WETH,
            ETH: fromToken,
            DAI: toToken,
            addressToFlag,
            feeToAddress,
          } = await loadFixture(CrowdSwapV3Fixture);

          const ownerAmountIn = ethers.utils.parseEther("0.0012944");
          let finalAmountOut = ethers.utils.parseEther("10");
          const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenOut;
          const swapFee = finalAmountOut.div(1000);
          const minAmountOut = finalAmountOut.sub(swapFee).mul(900).div(1000);

          //initializing dex
          const dexFromToken = fromToken;
          const dexToToken = toToken;
          const dexAmountIn = ownerAmountIn.sub(swapFee);
          const dexAmountOut = finalAmountOut;
          const dexTo = crowdswapV3.address;

          //initializing dex
          const dex: UniswapV2Mock = await UniswapV2Mock.create(
            router,
            addressToFlag,
            WETH,
            dexFromToken,
            dexToToken,
            dexAmountIn,
            dexAmountOut,
            dexTo
          );

          //prepare the required assets
          await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex], owner);

          const swapTx = await dex.getTransaction();

          const swapParams: SwapParamsStruct = {
            fromToken: fromToken.toString(),
            toToken: toToken.address,
            receiverAddress: owner.address,
            amountIn: ownerAmountIn,
            dexFlag: addressToFlag[dex.router.address],
            data: swapTx.data,
            affiliateCode: 0,
            minAmountOut: minAmountOut,
            feeCalcDirection: feeCalcDirection,
          };

          const feeToBalanceBefore = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          await crowdswapV3.swap(swapParams, { value: ownerAmountIn });

          const feeToBalanceAfter = {
            fromToken: await uniBalanceOf(fromToken, feeToAddress),
            toToken: await uniBalanceOf(toToken, feeToAddress),
          };

          const feeToBalanceDiff = {
            fromToken: feeToBalanceAfter.fromToken.sub(
              feeToBalanceBefore.fromToken
            ),
            toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
          };

          expect(feeToBalanceDiff.fromToken).to.equal(BigNumber.from(0));
          expect(feeToBalanceDiff.toToken).to.equal(swapFee);
        });
      });
    });
  });

  describe("crossDexSwap", async () => {
    describe("single path", async () => {
      it("Swap TOKEN/TOKEN should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          WETH,
          USDT: fromToken,
          DAI: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = toToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = finalAmountOut;
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //prepare the required assets
        await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex1], owner);

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams);

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.address),
            getAddress(toToken.address),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //from token checks
        expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(fromToken, feeToAddress)).to.equal(swapFee);

        //to token checks
        expect(await uniBalanceOf(toToken, owner.address)).to.equal(
          finalAmountOut
        );
        expect(await uniBalanceOf(toToken, feeToAddress)).to.equal(
          BigNumber.from(0)
        );
      });

      it("Swap ETH/TOKEN should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          ETH: fromToken,
          WETH,
          USDT: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("0.001");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = toToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = finalAmountOut;
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //prepare the required assets
        await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex1], owner);

        //save before balances
        const feeToBalanceBefore = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams, {
          value: ownerAmountIn,
        });

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.toString()),
            getAddress(toToken.address),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //get balances after
        const feeToBalanceAfter = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };
        const feeToBalanceDiff = {
          fromToken: feeToBalanceAfter.fromToken.sub(
            feeToBalanceBefore.fromToken
          ),
          toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
        };

        //from token checks
        expect(feeToBalanceDiff.fromToken).to.equal(swapFee);

        //to token checks
        expect(await uniBalanceOf(toToken, owner.address)).to.equal(
          finalAmountOut
        );
        expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
      });

      it("Swap TOKEN/ETH should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          WETH,
          USDT: fromToken,
          ETH: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("0.001");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = toToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = finalAmountOut;
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //prepare the required assets
        await setupTokensAndApprove(crowdswapV3, ownerAmountIn, [dex1], owner);

        //save before balances
        const feeToBalanceBefore = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };
        const ownerBalanceBefore = {
          fromToken: await uniBalanceOf(fromToken, owner.address),
          toToken: await uniBalanceOf(toToken, owner.address),
        };

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams);

        //get after balances
        const feeToBalanceAfter = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };
        const feeToBalanceDiff = {
          fromToken: feeToBalanceAfter.fromToken.sub(
            feeToBalanceBefore.fromToken
          ),
          toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
        };

        const ownerBalanceAfter = {
          fromToken: await uniBalanceOf(fromToken, owner.address),
          toToken: await uniBalanceOf(toToken, owner.address),
        };

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.address),
            getAddress(toToken.toString()),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //from token checks
        expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(feeToBalanceDiff.fromToken).to.equal(swapFee);

        //to token checks
        expect(ownerBalanceAfter.toToken).to.gte(ownerBalanceBefore.toToken);
        expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
      });
    });
    describe("double path", async () => {
      it("Swap TOKEN/TOKEN/TOKEN should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          USDT: fromToken,
          AVE: middleToken,
          DAI: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams);

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.address),
            getAddress(toToken.address),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //from token checks
        expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(fromToken, feeToAddress)).to.equal(swapFee);
        expect(await uniBalanceOf(fromToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );

        //middle token checks
        expect(await uniBalanceOf(middleToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(middleToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(middleToken, feeToAddress)).to.equal(
          BigNumber.from(0)
        );

        //to token checks
        expect(await uniBalanceOf(toToken, owner.address)).to.equal(
          finalAmountOut
        );
        expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(toToken, feeToAddress)).to.equal(
          BigNumber.from(0)
        );
      });

      it("Swap ETH/TOKEN/TOKEN should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          ETH: fromToken,
          AVE: middleToken,
          DAI: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //save before balances
        const feeToBalanceBefore = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams, {
          value: ownerAmountIn,
        });

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.toString()),
            getAddress(toToken.address),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //get balances after
        const feeToBalanceAfter = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };
        const feeToBalanceDiff = {
          fromToken: feeToBalanceAfter.fromToken.sub(
            feeToBalanceBefore.fromToken
          ),
          toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
        };

        //from token checks
        expect(feeToBalanceDiff.fromToken).to.equal(swapFee);

        //middle token checks
        expect(await uniBalanceOf(middleToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(middleToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );

        //to token checks
        expect(await uniBalanceOf(toToken, owner.address)).to.equal(
          finalAmountOut
        );
        expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );
        expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
      });

      it("Swap TOKEN/WETH/TOKEN should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          USDT: fromToken,
          WETH: middleToken,
          DAI: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          middleToken,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          dex2FromToken, //WETH
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams);

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.address),
            getAddress(toToken.address),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //from token checks
        expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(fromToken, feeToAddress)).to.equal(swapFee);

        //middle token checks
        expect(await uniBalanceOf(middleToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );

        //to token checks
        expect(await uniBalanceOf(toToken, owner.address)).to.equal(
          finalAmountOut
        );
        expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(toToken, feeToAddress)).to.equal(
          BigNumber.from(0)
        );
      });

      it("Swap TOKEN/TOKEN/ETH should be successful", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          USDT: fromToken,
          AVE: middleToken,
          ETH: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //save before balances
        const feeToBalanceBefore = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };
        const tx = await crowdswapV3.crossDexSwap(crossDexParams);

        //assertions
        await expect(tx)
          .to.emit(crowdswapV3, "SwapSucceedEvent")
          .withArgs(
            owner.address,
            getAddress(fromToken.address),
            getAddress(toToken.toString()),
            owner.address,
            ownerAmountIn,
            finalAmountOut
          );

        //get balances after
        const feeToBalanceAfter = {
          fromToken: await uniBalanceOf(fromToken, feeToAddress),
          toToken: await uniBalanceOf(toToken, feeToAddress),
        };
        const feeToBalanceDiff = {
          fromToken: feeToBalanceAfter.fromToken.sub(
            feeToBalanceBefore.fromToken
          ),
          toToken: feeToBalanceAfter.toToken.sub(feeToBalanceBefore.toToken),
        };

        //from token checks
        expect(await uniBalanceOf(fromToken, owner.address)).to.equal(
          BigNumber.from(0)
        );
        expect(await uniBalanceOf(fromToken, feeToAddress)).to.equal(swapFee);
        expect(await uniBalanceOf(fromToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );

        //middle token checks
        expect(await uniBalanceOf(middleToken, owner.address)).to.equal(
          BigNumber.from(0)
        );

        //to token checks
        expect(await uniBalanceOf(toToken, crowdswapV3.address)).to.equal(
          BigNumber.from(0)
        );
        expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
      });

      it("When the non zero ETh is sent, Swap TOKEN/*/* should be failed", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          USDT: fromToken,
          AVE: middleToken,
          ETH: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };

        await expect(
          crowdswapV3.crossDexSwap(crossDexParams, {
            value: 1,
          })
        ).to.revertedWith("CrowdSwapV3: Incorrect ETH value sent");
      });

      it("When the sent ETh is not equal to amount in, Swap ETH/TOKEN/TOKEN should be failed", async () => {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          ETH: fromToken,
          AVE: middleToken,
          DAI: toToken,
          addressToFlag,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };

        await expect(
          crowdswapV3.crossDexSwap(crossDexParams, {
            value: ownerAmountIn.sub(1),
          })
        ).to.revertedWith("CrowdSwapV3: Incorrect ETH value sent");

        await expect(
          crowdswapV3.crossDexSwap(crossDexParams, {
            value: ownerAmountIn.add(1),
          })
        ).to.revertedWith("CrowdSwapV3: Incorrect ETH value sent");
      });

      it("When amount out is 0, Swap should be failed", async () => {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          ETH: fromToken,
          AVE: middleToken,
          DAI: toToken,
          addressToFlag,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("0");
        const minAmountOut = finalAmountOut;
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };

        await expect(
          crowdswapV3.crossDexSwap(crossDexParams, {
            value: ownerAmountIn,
          })
        ).to.revertedWith("CrowdSwapV3: amount out is 0");
      });

      it("When amount out is lower than min amount, Swap should be failed", async () => {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          ETH: fromToken,
          AVE: middleToken,
          DAI: toToken,
          addressToFlag,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.add(1);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };

        await expect(
          crowdswapV3.crossDexSwap(crossDexParams, {
            value: ownerAmountIn,
          })
        ).to.revertedWith("CrowdSwapV3: Minimum amount not met");
      });

      it("When swap list is empty, swap should be failed", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          USDT: fromToken,
          AVE: middleToken,
          ETH: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = [];

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };

        await expect(crowdswapV3.crossDexSwap(crossDexParams)).to.revertedWith(
          "CrowdSwapV3: Swap List is empty"
        );
      });

      it("When dex flag is wrong, Swap should be failed", async function () {
        const {
          crowdswapV3,
          uniswap2: router1,
          quickswap: router2,
          WETH,
          USDT: fromToken,
          AVE: middleToken,
          ETH: toToken,
          addressToFlag,
          feeToAddress,
        } = await loadFixture(CrowdSwapV3Fixture);

        const ownerAmountIn = ethers.utils.parseEther("10.5");
        const finalAmountOut = ethers.utils.parseEther("10");
        const minAmountOut = finalAmountOut.mul(900).div(1000);
        const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
        const swapFee = ownerAmountIn.div(1000);
        addressToFlag[router1.address] = 201;
        addressToFlag[router2.address] = 202;

        //initializing dex1
        const dex1FromToken = fromToken;
        const dex1ToToken = middleToken;
        const dex1AmountIn = ownerAmountIn.sub(swapFee);
        const dex1AmountOut = ethers.utils.parseEther("30");
        const dex1To = crowdswapV3.address;

        const dex1: UniswapV2Mock = await UniswapV2Mock.create(
          router1,
          addressToFlag,
          WETH,
          dex1FromToken,
          dex1ToToken,
          dex1AmountIn,
          dex1AmountOut,
          dex1To
        );

        //initializing dex2
        const dex2FromToken = middleToken;
        const dex2ToToken = toToken;
        const dex2AmountIn = ethers.utils.parseEther("31");
        const dex2AmountOut = finalAmountOut;
        const dex2To = crowdswapV3.address;

        const dex2: UniswapV2Mock = await UniswapV2Mock.create(
          router2,
          addressToFlag,
          WETH,
          dex2FromToken,
          dex2ToToken,
          dex2AmountIn,
          dex2AmountOut,
          dex2To
        );

        //prepare the required assets
        await setupTokensAndApprove(
          crowdswapV3,
          ownerAmountIn,
          [dex1, dex2],
          owner
        );

        //preparing params for calling crowdswapV3.crowdDex()
        const swapList: CallInfoStruct[] = await Promise.all([
          dex1.splitTransaction(),
          dex2.splitTransaction(),
        ]);

        const crossDexParams: CrossDexParamsStruct = {
          amountIn: ownerAmountIn,
          swapList: swapList,
          affiliateCode: 0,
          minAmountOut: minAmountOut,
          feeCalcDirection: feeCalcDirection,
          receiverAddress: owner.address,
        };

        await expect(crowdswapV3.crossDexSwap(crossDexParams)).to.revertedWith(
          "CrowdSwapV3: unsupported dex flag"
        );
      });

      describe("deductFee", async () => {
        describe("From token in", async () => {
          it("When ETH/TOKEN/TOKEN swap, should transfer from token to feeTo address", async function () {
            const {
              crowdswapV3,
              uniswap2: router1,
              quickswap: router2,
              WETH,
              ETH: fromToken,
              AVE: middleToken,
              DAI: toToken,
              addressToFlag,
              feeToAddress,
            } = await loadFixture(CrowdSwapV3Fixture);

            const ownerAmountIn = ethers.utils.parseEther("10.5");
            const finalAmountOut = ethers.utils.parseEther("10");
            const minAmountOut = finalAmountOut.mul(900).div(1000);
            const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
            const swapFee = ownerAmountIn.div(1000);

            //initializing dex1
            const dex1FromToken = fromToken;
            const dex1ToToken = middleToken;
            const dex1AmountIn = ownerAmountIn.sub(swapFee);
            const dex1AmountOut = ethers.utils.parseEther("30");
            const dex1To = crowdswapV3.address;

            const dex1: UniswapV2Mock = await UniswapV2Mock.create(
              router1,
              addressToFlag,
              WETH,
              dex1FromToken,
              dex1ToToken,
              dex1AmountIn,
              dex1AmountOut,
              dex1To
            );

            //initializing dex2
            const dex2FromToken = middleToken;
            const dex2ToToken = toToken;
            const dex2AmountIn = ethers.utils.parseEther("31");
            const dex2AmountOut = finalAmountOut;
            const dex2To = crowdswapV3.address;

            const dex2: UniswapV2Mock = await UniswapV2Mock.create(
              router2,
              addressToFlag,
              WETH,
              dex2FromToken,
              dex2ToToken,
              dex2AmountIn,
              dex2AmountOut,
              dex2To
            );

            //prepare the required assets
            await setupTokensAndApprove(
              crowdswapV3,
              ownerAmountIn,
              [dex1, dex2],
              owner
            );

            //preparing params for calling crowdswapV3.crowdDex()
            const swapList: CallInfoStruct[] = await Promise.all([
              dex1.splitTransaction(),
              dex2.splitTransaction(),
            ]);

            const crossDexParams: CrossDexParamsStruct = {
              amountIn: ownerAmountIn,
              swapList: swapList,
              affiliateCode: 0,
              minAmountOut: minAmountOut,
              feeCalcDirection: feeCalcDirection,
              receiverAddress: owner.address,
            };

            const feeToBalanceBefore = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            await crowdswapV3.crossDexSwap(crossDexParams, {
              value: ownerAmountIn,
            });

            const feeToBalanceAfter = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            const feeToBalanceDiff = {
              fromToken: feeToBalanceAfter.fromToken.sub(
                feeToBalanceBefore.fromToken
              ),
              toToken: feeToBalanceAfter.toToken.sub(
                feeToBalanceBefore.toToken
              ),
            };

            expect(feeToBalanceDiff.fromToken).to.equal(swapFee);
            expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
          });

          it("When TOKEN/TOKEN/ETH swap, should transfer from token to feeTo address", async function () {
            const {
              crowdswapV3,
              uniswap2: router1,
              quickswap: router2,
              WETH,
              USDT: fromToken,
              AVE: middleToken,
              ETH: toToken,
              addressToFlag,
              feeToAddress,
            } = await loadFixture(CrowdSwapV3Fixture);

            const ownerAmountIn = ethers.utils.parseEther("10.5");
            const finalAmountOut = ethers.utils.parseEther("10");
            const minAmountOut = finalAmountOut.mul(900).div(1000);
            const feeCalcDirection: FeeCalcDirection = FeeCalcDirection.TokenIn;
            const swapFee = ownerAmountIn.div(1000);

            //initializing dex1
            const dex1FromToken = fromToken;
            const dex1ToToken = middleToken;
            const dex1AmountIn = ownerAmountIn.sub(swapFee);
            const dex1AmountOut = ethers.utils.parseEther("30");
            const dex1To = crowdswapV3.address;

            const dex1: UniswapV2Mock = await UniswapV2Mock.create(
              router1,
              addressToFlag,
              WETH,
              dex1FromToken,
              dex1ToToken,
              dex1AmountIn,
              dex1AmountOut,
              dex1To
            );

            //initializing dex2
            const dex2FromToken = middleToken;
            const dex2ToToken = toToken;
            const dex2AmountIn = ethers.utils.parseEther("31");
            const dex2AmountOut = finalAmountOut;
            const dex2To = crowdswapV3.address;

            const dex2: UniswapV2Mock = await UniswapV2Mock.create(
              router2,
              addressToFlag,
              WETH,
              dex2FromToken,
              dex2ToToken,
              dex2AmountIn,
              dex2AmountOut,
              dex2To
            );

            //prepare the required assets
            await setupTokensAndApprove(
              crowdswapV3,
              ownerAmountIn,
              [dex1, dex2],
              owner
            );

            //preparing params for calling crowdswapV3.crowdDex()
            const swapList: CallInfoStruct[] = await Promise.all([
              dex1.splitTransaction(),
              dex2.splitTransaction(),
            ]);

            const crossDexParams: CrossDexParamsStruct = {
              amountIn: ownerAmountIn,
              swapList: swapList,
              affiliateCode: 0,
              minAmountOut: minAmountOut,
              feeCalcDirection: feeCalcDirection,
              receiverAddress: owner.address,
            };

            const feeToBalanceBefore = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            await crowdswapV3.crossDexSwap(crossDexParams);

            const feeToBalanceAfter = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            const feeToBalanceDiff = {
              fromToken: feeToBalanceAfter.fromToken.sub(
                feeToBalanceBefore.fromToken
              ),
              toToken: feeToBalanceAfter.toToken.sub(
                feeToBalanceBefore.toToken
              ),
            };

            expect(feeToBalanceDiff.fromToken).to.equal(swapFee);
            expect(feeToBalanceDiff.toToken).to.equal(BigNumber.from(0));
          });
        });
        describe("From token out", async () => {
          it("When ETH/TOKEN/TOKEN swap, should transfer from token to feeTo address", async function () {
            const {
              crowdswapV3,
              uniswap2: router1,
              quickswap: router2,
              WETH,
              ETH: fromToken,
              AVE: middleToken,
              DAI: toToken,
              addressToFlag,
              feeToAddress,
            } = await loadFixture(CrowdSwapV3Fixture);

            const ownerAmountIn = ethers.utils.parseEther("10.5");
            const finalAmountOut = ethers.utils.parseEther("10");
            const feeCalcDirection: FeeCalcDirection =
              FeeCalcDirection.TokenOut;
            const swapFee = finalAmountOut.div(1000);
            const minAmountOut = finalAmountOut.sub(swapFee).mul(900).div(1000);

            //initializing dex1
            const dex1FromToken = fromToken;
            const dex1ToToken = middleToken;
            const dex1AmountIn = ownerAmountIn.sub(swapFee);
            const dex1AmountOut = ethers.utils.parseEther("30");
            const dex1To = crowdswapV3.address;

            const dex1: UniswapV2Mock = await UniswapV2Mock.create(
              router1,
              addressToFlag,
              WETH,
              dex1FromToken,
              dex1ToToken,
              dex1AmountIn,
              dex1AmountOut,
              dex1To
            );

            //initializing dex2
            const dex2FromToken = middleToken;
            const dex2ToToken = toToken;
            const dex2AmountIn = ethers.utils.parseEther("31");
            const dex2AmountOut = finalAmountOut;
            const dex2To = crowdswapV3.address;

            const dex2: UniswapV2Mock = await UniswapV2Mock.create(
              router2,
              addressToFlag,
              WETH,
              dex2FromToken,
              dex2ToToken,
              dex2AmountIn,
              dex2AmountOut,
              dex2To
            );

            //prepare the required assets
            await setupTokensAndApprove(
              crowdswapV3,
              ownerAmountIn,
              [dex1, dex2],
              owner
            );

            //preparing params for calling crowdswapV3.crowdDex()
            const swapList: CallInfoStruct[] = await Promise.all([
              dex1.splitTransaction(),
              dex2.splitTransaction(),
            ]);

            const crossDexParams: CrossDexParamsStruct = {
              amountIn: ownerAmountIn,
              swapList: swapList,
              affiliateCode: 0,
              minAmountOut: minAmountOut,
              feeCalcDirection: feeCalcDirection,
              receiverAddress: owner.address,
            };

            const feeToBalanceBefore = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            await crowdswapV3.crossDexSwap(crossDexParams, {
              value: ownerAmountIn,
            });

            const feeToBalanceAfter = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            const feeToBalanceDiff = {
              fromToken: feeToBalanceAfter.fromToken.sub(
                feeToBalanceBefore.fromToken
              ),
              toToken: feeToBalanceAfter.toToken.sub(
                feeToBalanceBefore.toToken
              ),
            };

            expect(feeToBalanceDiff.fromToken).to.equal(BigNumber.from(0));
            expect(feeToBalanceDiff.toToken).to.equal(swapFee);
          });

          it("When TOKEN/TOKEN/ETH swap, should transfer from token to feeTo address", async function () {
            const {
              crowdswapV3,
              uniswap2: router1,
              quickswap: router2,
              WETH,
              USDT: fromToken,
              AVE: middleToken,
              ETH: toToken,
              addressToFlag,
              feeToAddress,
            } = await loadFixture(CrowdSwapV3Fixture);

            const ownerAmountIn = ethers.utils.parseEther("10.5");
            const finalAmountOut = ethers.utils.parseEther("10");
            const feeCalcDirection: FeeCalcDirection =
              FeeCalcDirection.TokenOut;
            const swapFee = finalAmountOut.div(1000);
            const minAmountOut = finalAmountOut.sub(swapFee).mul(900).div(1000);

            //initializing dex1
            const dex1FromToken = fromToken;
            const dex1ToToken = middleToken;
            const dex1AmountIn = ownerAmountIn;
            const dex1AmountOut = ethers.utils.parseEther("30");
            const dex1To = crowdswapV3.address;

            const dex1: UniswapV2Mock = await UniswapV2Mock.create(
              router1,
              addressToFlag,
              WETH,
              dex1FromToken,
              dex1ToToken,
              dex1AmountIn,
              dex1AmountOut,
              dex1To
            );

            //initializing dex2
            const dex2FromToken = middleToken;
            const dex2ToToken = toToken;
            const dex2AmountIn = ethers.utils.parseEther("31");
            const dex2AmountOut = finalAmountOut;
            const dex2To = crowdswapV3.address;

            const dex2: UniswapV2Mock = await UniswapV2Mock.create(
              router2,
              addressToFlag,
              WETH,
              dex2FromToken,
              dex2ToToken,
              dex2AmountIn,
              dex2AmountOut,
              dex2To
            );

            //prepare the required assets
            await setupTokensAndApprove(
              crowdswapV3,
              ownerAmountIn,
              [dex1, dex2],
              owner
            );

            //preparing params for calling crowdswapV3.crowdDex()
            const swapList: CallInfoStruct[] = await Promise.all([
              dex1.splitTransaction(),
              dex2.splitTransaction(),
            ]);

            const crossDexParams: CrossDexParamsStruct = {
              amountIn: ownerAmountIn,
              swapList: swapList,
              affiliateCode: 0,
              minAmountOut: minAmountOut,
              feeCalcDirection: feeCalcDirection,
              receiverAddress: owner.address,
            };

            const feeToBalanceBefore = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            await crowdswapV3.crossDexSwap(crossDexParams);

            const feeToBalanceAfter = {
              fromToken: await uniBalanceOf(fromToken, feeToAddress),
              toToken: await uniBalanceOf(toToken, feeToAddress),
            };

            const feeToBalanceDiff = {
              fromToken: feeToBalanceAfter.fromToken.sub(
                feeToBalanceBefore.fromToken
              ),
              toToken: feeToBalanceAfter.toToken.sub(
                feeToBalanceBefore.toToken
              ),
            };

            expect(feeToBalanceDiff.fromToken).to.equal(BigNumber.from(0));
            expect(feeToBalanceDiff.toToken).to.equal(swapFee);
          });
        });
      });
    });
  });
});
