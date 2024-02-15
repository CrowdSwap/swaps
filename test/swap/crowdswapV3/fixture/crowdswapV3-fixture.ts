import { Fixture } from "ethereum-waffle";
import { Address } from "ethereumjs-util";
import { BigNumber } from "ethers";
import { upgrades } from "hardhat";
import {
  CrowdSwapV3,
  CrowdSwapV3__factory,
  ERC20PresetMinterPauser,
  ERC20PresetMinterPauser__factory,
  UniswapV2FactoryTest__factory,
  UniswapV2Router02Test,
  UniswapV2Router02Test__factory
} from "../../../../artifacts/types";

export interface CrpowdswapV3FixtureResult {
  crowdswapV3: CrowdSwapV3;
  uniswap2: UniswapV2Router02Test;
  quickswap: UniswapV2Router02Test;
  addressToFlag: Record<string, number>;
  ETH: Address;
  WETH: ERC20PresetMinterPauser;
  DAI: ERC20PresetMinterPauser;
  USDT: ERC20PresetMinterPauser;
  AVE: ERC20PresetMinterPauser;
  feeToAddress: string;
}

export const CrowdSwapV3Fixture: Fixture<CrpowdswapV3FixtureResult> = async (
  [owner, feeTo],
  provider
): Promise<CrpowdswapV3FixtureResult> => {
  const signer = provider.getSigner(owner.address);
  const factory = await new UniswapV2FactoryTest__factory(signer).deploy();
  const feeToAddress = feeTo.address;
  const defaultFeePercentage = BigNumber.from(10).pow(17); // 0.1%

  const ETH = Address.fromString("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");

  const WETH = await new ERC20PresetMinterPauser__factory(signer).deploy(
    "WETH minter",
    "WETH"
  );
  const DAI = await new ERC20PresetMinterPauser__factory(signer).deploy(
    "DAI minter",
    "DAI"
  );
  const USDT = await new ERC20PresetMinterPauser__factory(signer).deploy(
    "USDT minter",
    "USDT"
  );
  const AVE = await new ERC20PresetMinterPauser__factory(signer).deploy(
    "AVE minter",
    "AVE"
  );

  const deployRouter = async (
    routerFactory: UniswapV2Router02Test__factory
  ) => {
    return routerFactory.deploy(factory.address, WETH.address);
  };

  const [uniswap2, quickswap] = await Promise.all([
    deployRouter(new UniswapV2Router02Test__factory(signer)),
    deployRouter(new UniswapV2Router02Test__factory(signer)),
  ]);

  const addressToFlag = {
    [quickswap.address]: 1,
    [uniswap2.address]: 2,
  };

  const definedNetworks = Object.entries(addressToFlag).map(([adr, flag]) => ({
    flag,
    adr,
  }));

  const params = [feeToAddress, defaultFeePercentage, definedNetworks];

  const contractFactory = await new CrowdSwapV3__factory(signer);
  const contract = await upgrades.deployProxy(contractFactory, params, {
    kind: "uups",
  });

  addressToFlag[contract.address] = 0;

  return {
    crowdswapV3: contract as CrowdSwapV3,
    uniswap2,
    quickswap,
    addressToFlag,
    ETH,
    WETH,
    DAI,
    USDT,
    AVE,
    feeToAddress,
  };
};
