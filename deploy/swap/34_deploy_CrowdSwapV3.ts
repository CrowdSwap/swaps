/**
 * How to deploy:
 * $npx hardhat deploy --network BSCMAIN --tags CrowdSwapV3
 */
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const CONTRACT_NAME = "CrowdSwapV3";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const feeTo = "<fee to address>";
  const defaultFeePercentage = BigNumber.from(10).pow(17); //It means 0.1%

  // Fill it accordingly
  const definedNetworks: {
    flag: number;
    adr: string;
  }[] = [];

  const params = [feeTo, defaultFeePercentage, definedNetworks];

  if (params.includes(null) || params.includes(undefined)) {
    throw Error("Required data is missing.");
  }
  console.log({ params });

  console.log(`Start [${CONTRACT_NAME}] contract deployment`);
  const factory = await ethers.getContractFactory(CONTRACT_NAME);
  const proxy = await upgrades.deployProxy(factory, params, {
    kind: "uups",
  });
  await proxy.deployed();
  console.log(`Finish [${CONTRACT_NAME}] contract deployment`);

  const implAddress = await getImplementationAddress(
    ethers.provider,
    proxy.address
  );
  console.log(`${CONTRACT_NAME} Proxy: `, proxy.address);
  console.log(`${CONTRACT_NAME} Implementation: `, implAddress);
};
export default func;
func.tags = [CONTRACT_NAME];
