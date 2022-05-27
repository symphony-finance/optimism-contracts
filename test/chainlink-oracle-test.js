const hre = require("hardhat");
const { expect } = require("chai");
const { BigNumber: EthersBN } = require("ethers");
const { default: BigNumber } = require("bignumber.js");
const ChainlinkArtifacts = require(
    "../artifacts/contracts/oracles/ChainlinkOracle.sol/ChainlinkOracle.json"
);
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const usdcAddress = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";
const aaveAddress = "0x76FB31fb4af56892A25e32cFC43De717950c9278";

const daiFeed = "0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6"
const usdcFeed = "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3";
const aaveFeed = "0x338ed6787f463394D24813b297401B9F05a8C9d1";

describe("Chainlink Oracle Test", () => {
    it("should add oracle feed in the contract", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

        // Deploy Chainlink Oracle
        const ChainlinkOracle = await hre.ethers.getContractFactory("ChainlinkOracle");
        let chainlinkOracle = await ChainlinkOracle.deploy(deployer.address);

        await chainlinkOracle.deployed();

        chainlinkOracle = new ethers.Contract(
            chainlinkOracle.address,
            ChainlinkArtifacts.abi,
            deployer
        );

        expect(await chainlinkOracle.owner()).to.eq(deployer.address);

        await chainlinkOracle.updateTokenFeeds(
            [daiAddress, usdcAddress],
            [daiFeed, usdcFeed]
        );

        expect(await chainlinkOracle.oracleFeed(daiAddress)).to.eq(daiFeed);
        expect(await chainlinkOracle.oracleFeed(usdcAddress)).to.eq(usdcFeed);
    });

    it("should fetch the price of a pair", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

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
            [daiAddress, usdcAddress, aaveAddress],
            [daiFeed, usdcFeed, aaveFeed]
        );

        await chainlinkOracle.updatePriceSlippage(0);

        // USDC to DAI price
        const inputAmount1 = new BigNumber(10).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        const outputAmount1 = new BigNumber(9.95).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(18))
        ).toString();

        const result1 = await chainlinkOracle.get(
            usdcAddress, daiAddress, inputAmount1
        );

        expect(Number(result1.amountOutWithSlippage)).to.be
            .greaterThan(Number(outputAmount1));

        // DAI to USDC price
        const inputAmount2 = new BigNumber(10).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(18))
        ).toString();

        const outputAmount2 = new BigNumber(9.95).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        const result2 = await chainlinkOracle.get(
            daiAddress, usdcAddress, inputAmount2
        );

        expect(Number(result2.amountOutWithSlippage)).to.be
            .greaterThan(Number(outputAmount2));

        // DAI to AAVE price
        const inputAmount3 = new BigNumber(100).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(18))
        ).toString();

        const outputAmount3 = new BigNumber(0.469).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(18))
        ).toString();

        const result3 = await chainlinkOracle.get(
            daiAddress, aaveAddress, inputAmount3
        );

        expect(Number(result3.amountOutWithSlippage)).to.be
            .greaterThan(Number(outputAmount3));
    });

    it("should revert if no price feed", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

        // Deploy Chainlink Oracle
        const ChainlinkOracle = await hre.ethers.getContractFactory("ChainlinkOracle");
        let chainlinkOracle = await ChainlinkOracle.deploy(deployer.address);

        await chainlinkOracle.deployed();

        chainlinkOracle = new ethers.Contract(
            chainlinkOracle.address,
            ChainlinkArtifacts.abi,
            deployer
        );
        await chainlinkOracle.updateTokenFeeds([daiAddress], [daiFeed]);

        // USDC to DAI price
        const inputAmount = new BigNumber(10).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        await expect(
            chainlinkOracle.get(
                usdcAddress, daiAddress, inputAmount
            )
        ).to.be.revertedWith(
            "oracle feed doesn't exist for the input token"
        );

        await chainlinkOracle.updateTokenFeeds(
            [daiAddress, usdcAddress],
            [ZERO_ADDRESS, usdcFeed],
        );

        await expect(
            chainlinkOracle.get(
                usdcAddress, daiAddress, inputAmount
            )
        ).to.be.revertedWith(
            "oracle feed doesn't exist for the output token"
        );
    });

    it("should work for small value", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

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
            [daiAddress, aaveAddress],
            [daiFeed, aaveFeed]
        );

        await chainlinkOracle.updatePriceSlippage(0);

        // DAI to AAVE price
        const inputAmount = 1;

        let expectedOutputAmount = 0;

        let result = await chainlinkOracle.get(
            daiAddress, aaveAddress, inputAmount
        );
        expect(Number(result.amountOutWithSlippage)).to.eq(
            Number(expectedOutputAmount)
        );

        // AAVE to DAI price
        result = await chainlinkOracle.get(
            aaveAddress, daiAddress, inputAmount
        );

        expectedOutputAmount = 96; // aave price on 27/05/22 7:28 UTC
        expect(Number(result.amountOut)).to.eq(expectedOutputAmount);
    });

    it("should work for large value (USD denomination)", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

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
            [daiAddress, aaveAddress],
            [daiFeed, aaveFeed],
        );
        await chainlinkOracle.updatePriceSlippage(0);

        // DAI to AAVE price
        const inputAmount = EthersBN.from(100).mul(
            EthersBN.from(10).pow(EthersBN.from(30))
        ).toString();

        const outputAmount = EthersBN.from(469).mul(
            EthersBN.from(10).pow(EthersBN.from(27))
        ).toString();

        let result = await chainlinkOracle.get(
            daiAddress, aaveAddress, inputAmount
        );

        expect(Number(result.amountOutWithSlippage)).to.be
            .greaterThan(Number(outputAmount));
    });
});
