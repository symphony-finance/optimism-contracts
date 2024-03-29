const { expect } = require("chai");
const config = require("../config/index.json");
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
const bufferPercent = 4000; // 40%

const depositAmount = (
    new BigNumber(10).
        times(
            new BigNumber(10)
                .exponentiatedBy(new BigNumber(18))
        )).toString();

describe("Rebalance Asset Test", () => {
    it("Should rebalance correctly", async () => {
        await hre.network.provider.request({
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

        yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                ZERO_ADDRESS,
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

        const configParams = config.optimism;
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

        const aDaiAddress = "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE";

        await yolo.setStrategy(daiAddress, aaveYield.address);
        expect(await yolo.strategy(daiAddress)).to.eq(aaveYield.address);

        await yolo.updateTokensBuffer([daiAddress], [bufferPercent]);
        expect(await yolo.tokenBuffer(daiAddress)).to.eq(bufferPercent);

        // Create aDAI contract instance
        const adaiContract = new ethers.Contract(
            aDaiAddress,
            IERC20Artifacts.abi,
            deployer
        );

        // Transfer Token
        await daiContract.transfer(yolo.address, depositAmount);

        expect(await daiContract.balanceOf(yolo.address)).to.eq(depositAmount);

        // Rebalance asset
        await yolo.rebalanceTokens([daiAddress]);

        const bufferBalance = getBufferBalance(depositAmount, bufferPercent);
        const yieldBalance = getYieldBalance(depositAmount, bufferBalance);

        expect(await daiContract.balanceOf(yolo.address)).to.eq(bufferBalance);
        expect(
            Number(await adaiContract.balanceOf(aaveYield.address))
        ).to.greaterThanOrEqual(Number(yieldBalance));

        const depositAmountNew = (
            new BigNumber(0.1).
                times(
                    new BigNumber(10)
                        .exponentiatedBy(new BigNumber(18))
                )).toString();

        await daiContract.transfer(yolo.address, depositAmountNew);

        // Rebalance asset
        await yolo.rebalanceTokens([daiAddress]);

        const bufferBalanceNew = getBufferBalance(
            new BigNumber(depositAmount).plus(depositAmountNew),
            bufferPercent
        );

        expect(
            Number(await daiContract.balanceOf(yolo.address))
        ).to.greaterThanOrEqual(Number(bufferBalanceNew));

        // Decrease buffer percent
        const newBufferPercent = 3000;
        await yolo.updateTokensBuffer([daiAddress], [newBufferPercent]);
        expect(await yolo.tokenBuffer(daiAddress)).to.eq(newBufferPercent);

        await yolo.rebalanceTokens([daiAddress]);

        const updatedBufferBalance = getBufferBalance(
            new BigNumber(depositAmount).plus(depositAmountNew),
            newBufferPercent,
        );

        const balanceInContract = Number(
            await daiContract.balanceOf(yolo.address)
        );

        expect(
            balanceInContract
        ).to.greaterThanOrEqual(Number(updatedBufferBalance));

        expect(balanceInContract).to.lessThan(Number(bufferBalanceNew));
    });

    it("Should revert for no strategy", async () => {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
        );
        deployer.address = deployer._address;

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        yolo = await upgrades.deployProxy(
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
            yolo.rebalanceTokens([daiAddress])
        ).to.be.revertedWith(
            "Yolo::rebalanceTokens: strategy doesn't exist"
        );
    });
});

const getBufferBalance = (_amount, _bufferPercent) => {
    return (
        new BigNumber(_amount).dividedBy(
            new BigNumber(100)
        )
    ).times(
        new BigNumber(_bufferPercent).dividedBy(
            new BigNumber(100)
        )
    ).toString();
};

const getYieldBalance = (depositAmount, bufferAmount) => {
    return (
        new BigNumber(depositAmount).minus(
            new BigNumber(bufferAmount)
        )
    ).toString();
};
