const { expect } = require("chai");
const { BigNumber: EthersBN } = require("ethers");
const { default: BigNumber } = require("bignumber.js");
const config = require("../config/index.json");
const { time } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
require('dotenv').config();

const AaveV3YieldArtifacts = require(
    "../artifacts/contracts/adapters/AaveYield.sol/AaveYield.json"
);
const YoloArtifacts = require(
    "../artifacts/contracts/Yolo.sol/Yolo.json"
);
const IERC20Artifacts = require(
    "../artifacts/contracts/mocks/TestERC20.sol/TestERC20.json"
);

const daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const usdcAddress = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

const recipient = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const executor = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const creator = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";

const minReturnAmount = new BigNumber(15).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
).toString();
const stoplossAmount = new BigNumber(8).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
).toString();
const approveAmount = EthersBN.from(100000).mul(
    EthersBN.from(10).pow(EthersBN.from(18))
).toString();

describe("Aave v3 Yield Test", () => {
    it("should correctly supply and withdraw", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        let deployer = await ethers.provider.getSigner(
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

        const Treasury = await ethers.getContractFactory("Treasury");
        let treasury = await upgrades.deployProxy(
            Treasury,
            [deployer.address]
        );
        await treasury.deployed();

        const AaveV3Yield = await ethers.getContractFactory("AaveYield");

        const configParams = config.optimism;
        let aaveV3Yield = await AaveV3Yield.deploy(
            yolo.address,
            deployer.address,
            daiAddress,
            configParams.aaveLendingPool, // pool
            configParams.aaveIncentivesController, // rewards controller
            ZERO_ADDRESS
        );
        await aaveV3Yield.deployed();

        aaveV3Yield = new ethers.Contract(
            aaveV3Yield.address,
            AaveV3YieldArtifacts.abi,
            deployer
        );

        await yolo.setStrategy(daiAddress, aaveV3Yield.address);
        await yolo.addWhitelistToken(daiAddress);

        await daiContract.approve(yolo.address, approveAmount);

        const inputAmount1 = new BigNumber(100).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(18))
        );
        const executionFee = inputAmount1.multipliedBy(0.2).toString();

        // Create first order
        const tx1 = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
            inputAmount1.toString(),
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const tx1Receipt = await tx1.wait();
        const tx1Events = tx1Receipt.events
            .filter((x) => {
                return x.event == "OrderCreated"
            });
        const tx1Id = tx1Events[0].args[0];
        const tx1Data = tx1Events[0].args[1];

        const inputAmount2 = EthersBN.from(25000).mul(
            EthersBN.from(10).pow(EthersBN.from(18))
        ).toString();

        // Create second order
        const tx2 = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
            inputAmount2,
            minReturnAmount,
            stoplossAmount,
            executor,
            1, // executionFee
            creator,
        );

        const tx2Receipt = await tx2.wait();
        const tx2Events = tx2Receipt.events
            .filter((x) => {
                return x.event == "OrderCreated"
            });
        const tx2Id = tx2Events[0].args[0];
        const tx2Data = tx2Events[0].args[1];

        // Advancing 500 blocks
        for (let i = 0; i < 500; ++i) {
            await time.advanceBlock();
        };

        // Cancel first order
        await yolo.cancelOrder(tx1Id, tx1Data);

        // Cancel second order
        await yolo.cancelOrder(tx2Id, tx2Data);

        // TODO: check correct balance deposited in strategy
    });
});
