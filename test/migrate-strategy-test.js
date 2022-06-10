const hre = require("hardhat");
const { expect } = require("chai");
const config = require("../config/index.json");
const { time } = require("@openzeppelin/test-helpers");
const { default: BigNumber } = require("bignumber.js");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const IERC20Artifacts = require(
    "../artifacts/contracts/mocks/TestERC20.sol/TestERC20.json"
);
const YoloArtifacts = require(
    "../artifacts/contracts/Yolo.sol/Yolo.json"
);
const AaveYieldArtifacts = require(
    "../artifacts/contracts/adapters/AaveYield.sol/AaveYield.json"
);

const daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const usdcAddress = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";
const executor = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const creator = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";

const bufferPercent = 0; // 0%
const configParams = config.optimism;
const executorFeePercent = 20 // 0.2%

let inputAmount = new BigNumber(10)
    .times(new BigNumber(10).exponentiatedBy(new BigNumber(18)));
let executionFee = inputAmount
    .multipliedBy(new BigNumber(executorFeePercent / 100)).toString()
inputAmount = inputAmount.toString()

const minReturnAmount = new BigNumber(15).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
).toString();

const stoplossAmount = new BigNumber(11).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
).toString();

const approveAmount = new BigNumber(100)
    .times(
        new BigNumber(10)
            .exponentiatedBy(new BigNumber(18))
    )
    .toString();

describe("Migrate Strategy Test", () => {
    it("Should migrate existing strategy to new strategy and transfer tokens to new stratregy", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
        );
        deployer.address = deployer._address;

        // Create DAI contract instance
        const daiContract = new ethers.Contract(
            daiAddress,
            IERC20Artifacts.abi,
            deployer
        );

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                ZERO_ADDRESS
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        // Deploy AaveYield Contract
        const AaveYield = await hre.ethers.getContractFactory("AaveYield");

        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            daiAddress,
            configParams.aaveLendingPool,
            configParams.aaveIncentivesController,
            ZERO_ADDRESS
        );

        await aaveYield.deployed();

        aaveYield = new ethers.Contract(
            aaveYield.address,
            AaveYieldArtifacts.abi,
            deployer
        );

        await yolo.setStrategy(daiAddress, aaveYield.address);
        await yolo.addWhitelistTokens([daiAddress]);

        const approveAmount = new BigNumber(100)
            .times(
                new BigNumber(10)
                    .exponentiatedBy(new BigNumber(18))
            )
            .toString();

        await daiContract.approve(yolo.address, approveAmount);

        // Create Order
        await yolo.createOrder(
            deployer.address,
            daiAddress,
            usdcAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        await yolo.rebalanceTokens([daiAddress]);

        const strategyBal = Number(inputAmount) * (
            (10000 - bufferPercent) / 10000
        );

        expect(Number(await aaveYield.getTotalUnderlying(daiAddress)))
            .to.be.greaterThanOrEqual(strategyBal);

        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        };

        // Deploy New AaveYield Contract
        const AaveYieldNew = await hre.ethers.getContractFactory("AaveYield");

        let aaveYieldNew = await AaveYieldNew.deploy(
            yolo.address,
            deployer.address,
            daiAddress,
            configParams.aaveLendingPool,
            configParams.aaveIncentivesController,
            ZERO_ADDRESS
        );

        await aaveYieldNew.deployed();

        aaveYieldNew = new ethers.Contract(
            aaveYieldNew.address,
            AaveYieldArtifacts.abi,
            deployer
        );

        // Migrate Strategy to new contract
        await yolo.migrateStrategy(daiAddress, aaveYieldNew.address);

        expect(await yolo.strategy(daiAddress)).to.eq(aaveYieldNew.address);

        expect(Number(await aaveYield.getTotalUnderlying(daiAddress)))
            .to.eq(0);

        expect(Number(await aaveYieldNew.callStatic.getTotalUnderlying(daiAddress)))
            .to.be.greaterThanOrEqual(
                Number(
                    new BigNumber(strategyBal) -
                    new BigNumber(strategyBal).times(0.2 / 100) // 0.2%
                )
            );
    });

    it("Should remove strategy of a token", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
        );
        deployer.address = deployer._address;

        // Create DAI contract instance
        const daiContract = new ethers.Contract(
            daiAddress,
            IERC20Artifacts.abi,
            deployer
        );

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                ZERO_ADDRESS,
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        // Deploy AaveYield Contract
        const AaveYield = await hre.ethers.getContractFactory("AaveYield");

        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            daiAddress,
            configParams.aaveLendingPool,
            configParams.aaveIncentivesController,
            ZERO_ADDRESS
        );

        await aaveYield.deployed();

        aaveYield = new ethers.Contract(
            aaveYield.address,
            AaveYieldArtifacts.abi,
            deployer
        );

        await yolo.setStrategy(daiAddress, aaveYield.address);
        await yolo.addWhitelistTokens([daiAddress]);

        await daiContract.approve(yolo.address, approveAmount);

        // Create Order
        await yolo.createOrder(
            deployer.address,
            daiAddress,
            usdcAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        await yolo.rebalanceTokens([daiAddress]);

        const yoloDaiBal = Number(
            await daiContract.balanceOf(yolo.address)
        );

        expect(yoloDaiBal).to.eq(
            Number(inputAmount) * (bufferPercent / 10000)
        );

        await yolo.migrateStrategy(daiAddress, ZERO_ADDRESS);

        expect(Number(await daiContract.balanceOf(yolo.address)))
            .to.be.greaterThanOrEqual(Number(inputAmount) - 1);
    });

    it("Should revert if no existing strategy", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
        );
        deployer.address = deployer._address;

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                ZERO_ADDRESS,
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        await expect(
            yolo.migrateStrategy(usdcAddress, ZERO_ADDRESS)
        ).to.be.revertedWith(
            "Yolo::migrateStrategy: no previous strategy exists"
        );
    });

    it("Should revert if migrating to same strategy", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
        );
        deployer.address = deployer._address;

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                ZERO_ADDRESS,
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        // Deploy AaveYield Contract
        const AaveYield = await hre.ethers.getContractFactory("AaveYield");

        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            daiAddress,
            configParams.aaveLendingPool,
            configParams.aaveIncentivesController,
            ZERO_ADDRESS
        );

        await aaveYield.deployed();

        aaveYield = new ethers.Contract(
            aaveYield.address,
            AaveYieldArtifacts.abi,
            deployer
        );

        await yolo.setStrategy(usdcAddress, aaveYield.address);

        await expect(
            yolo.migrateStrategy(usdcAddress, aaveYield.address)
        ).to.be.revertedWith(
            "Yolo::migrateStrategy: new strategy same as previous"
        );
    });
});
