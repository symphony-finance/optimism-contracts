const hre = require("hardhat");
const { expect } = require("chai");
const config = require("../config/index.json");
const { AbiCoder } = require("ethers/lib/utils");
const { default: BigNumber } = require("bignumber.js");

const IERC20Artifacts = require(
    "../artifacts/contracts/mocks/TestERC20.sol/TestERC20.json"
);
const ChainlinkArtifacts = require(
    "../artifacts/contracts/oracles/ChainlinkOracle.sol/ChainlinkOracle.json"
);
const UniswapHandlerArtifacts = require(
    "../artifacts/contracts/handlers/UniswapHandler.sol/UniswapHandler.json"
);

const abiCoder = new AbiCoder();
const configParams = config.optimism;
const totalFeePercent = 20; // 0.2%;
const daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const usdcAddress = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

const recipient = "0xfB322aBb71344318AC78463bE16292080d226229";
const executor = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";

const inputAmount = new BigNumber(10).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
);

const minReturnAmount = new BigNumber(10.2).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

const stoplossAmount = new BigNumber(9.98).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

const expectedReturn = new BigNumber(9.9).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

const order = {
    creator: executor,
    recipient,
    inputToken: usdcAddress,
    outputToken: daiAddress,
    inputAmount,
    minReturnAmount,
    stoplossAmount,
    shares: 0,
    executor,
    executionFee: 0,
};

describe("Uniswap V3 Handler Test", () => {
    it("should swap asset", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

        // Create USDC contract instance
        const usdcContract = new ethers.Contract(
            usdcAddress,
            IERC20Artifacts.abi,
            deployer
        );

        // Create DAI contract instance
        const daiContract = new ethers.Contract(
            daiAddress,
            IERC20Artifacts.abi,
            deployer
        );

        // Deploy Chainlink Oracle
        const ChainlinkOracle = await hre.ethers.getContractFactory("ChainlinkOracle");
        let chainlinkOracle = await ChainlinkOracle.deploy(deployer.address);

        await chainlinkOracle.deployed();

        chainlinkOracle = new ethers.Contract(
            chainlinkOracle.address,
            ChainlinkArtifacts.abi,
            deployer
        );
        await chainlinkOracle.updateTokenFeeds(
            [usdcAddress, daiAddress],
            [
                "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3", // USDC-USD
                "0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6", // DAI-USD
            ],
        );

        // Deploy Uniswap Handler
        const UniswapHandler = await ethers.getContractFactory(
            "UniswapHandler"
        );

        let uniswapHandler = await UniswapHandler.deploy(
            configParams.uniswapRouter, // Router
            configParams.wethAddress, // WETH
            deployer.address // false yolo address
        );

        await uniswapHandler.deployed();

        uniswapHandler = new ethers.Contract(
            uniswapHandler.address,
            UniswapHandlerArtifacts.abi,
            deployer
        );

        order.inputAmount = order.inputAmount.plus(
            getFee(order.inputAmount)
        ).toString();

        await usdcContract.transfer(uniswapHandler.address, order.inputAmount);

        const balanceBeforeSwap = await daiContract.balanceOf(recipient);

        const oracleResult = await chainlinkOracle.get(
            order.inputToken,
            order.outputToken,
            order.inputAmount
        );

        // const extraData = abiCoder.encode(['uint24', 'uint24'], [3000, 3000]);
        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        await uniswapHandler.handle(
            order,
            oracleResult.amountOutWithSlippage,
            extraData
        );

        const balanceAfterSwap = await daiContract.balanceOf(recipient);
        const amountReceived = balanceAfterSwap.sub(balanceBeforeSwap);

        expect(Number(amountReceived)).to.be
            .greaterThanOrEqual(Number(expectedReturn));
    });
});

const getFee = (amount) => {
    const _totalFeePercent = new BigNumber(totalFeePercent / 100);
    return amount.multipliedBy(_totalFeePercent).dividedBy(100);
}
