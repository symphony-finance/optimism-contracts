const { expect } = require("chai");
const { BigNumber: EthersBN } = require("ethers");
const { default: BigNumber } = require("bignumber.js");
const { time } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const config = require("../config/index.json");
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
const recipient = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";
const executor = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";
const creator = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";
const treasury = "0x71068bf5a429ccf51a4e2e6a65d930e3019f4d0e";

let inputAmount = new BigNumber(10).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
);
let executionFee = inputAmount.multipliedBy(new BigNumber(0.2)).toString()
inputAmount = inputAmount.toString()

const minReturnAmount = new BigNumber(15).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

const stoplossAmount = new BigNumber(8).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

const approveAmount = new BigNumber(100)
    .times(
        new BigNumber(10)
            .exponentiatedBy(new BigNumber(18))
    )
    .toString();

describe("Cancel Order Test", () => {
    it("Should cancel order if no yield strategy", async () => {
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

        await usdcContract.approve(yolo.address, approveAmount);

        await yolo.addWhitelistTokens([usdcAddress]);

        // Create Order
        const createTx = await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const createTxReceipt = await createTx.wait();
        const createTxEvents = createTxReceipt.events.filter(
            (x) => { return x.event == "OrderCreated" }
        );
        const createTxOrderId = createTxEvents[0].args[0];
        const orderData = createTxEvents[0].args[1];

        const balanceBeforeCancellation = await usdcContract
            .balanceOf(recipient);

        const cancelTx = await yolo.cancelOrder(
            createTxOrderId,
            orderData
        );

        const cancelTxReceipt = await cancelTx.wait();
        const cancelTxEvents = cancelTxReceipt.events.filter(
            (x) => { return x.event == "OrderCancelled" }
        );
        const cancelTxOrderId = cancelTxEvents[0].args[0];

        expect(createTxOrderId).to.eq(cancelTxOrderId);

        const balanceAfterCancellation = await usdcContract
            .balanceOf(recipient);

        expect(balanceBeforeCancellation).to
            .eq(balanceAfterCancellation.sub(inputAmount));
    });

    it("Should cancel multiple orders with Aave yield strategy", async () => {
        let totalShares = 0;

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

        await usdcContract.approve(yolo.address, approveAmount);

        const AaveYield = await ethers.getContractFactory("AaveYield");

        const configParams = config.optimism;
        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            usdcAddress,
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
        await yolo.addWhitelistTokens([usdcAddress]);

        // Create Order
        const tx1 = await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const receipt1 = await tx1.wait();
        const events1 = receipt1.events.filter((x) => { return x.event == "OrderCreated" });
        const orderId1 = events1[0].args[0];
        const orderData1 = events1[0].args[1];

        totalShares = totalShares + getShareFromOrder(orderData1);

        const inputAmount1 = new BigNumber(11).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        // Advancing 100 blocks
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        };

        // Create Order
        const tx2 = await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount1,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const receipt2 = await tx2.wait();
        const events2 = receipt2.events.filter((x) => { return x.event == "OrderCreated" });

        const orderId2 = events2[0].args[0];
        const orderData2 = events2[0].args[1];

        totalShares = totalShares + getShareFromOrder(orderData2);

        await yolo.cancelOrder(
            orderId2,
            orderData2
        );

        await yolo.cancelOrder(
            orderId1,
            orderData1
        );
    });

    it("Should cancel order when strategy removed after creating the order", async () => {
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

        const configParams = config.optimism;
        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            usdcAddress,
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

        const bufferPercent = 0;

        await yolo.setStrategy(usdcAddress, aaveYield.address);
        await yolo.addWhitelistTokens([usdcAddress]);

        await usdcContract.approve(yolo.address, approveAmount);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const receipt = await tx.wait();
        const events = receipt.events.filter((x) => { return x.event == "OrderCreated" });

        const orderId = events[0].args[0];
        const orderData = events[0].args[1];

        await yolo.rebalanceTokens([usdcAddress]);

        expect(Number(await usdcContract.balanceOf(yolo.address))).to.eq(
            Number(new BigNumber(inputAmount).times(
                new BigNumber(bufferPercent / 100)
            ))
        );
        expect(Number(await aaveYield.getTotalUnderlying(usdcAddress))).to
            .greaterThanOrEqual(
                Number(new BigNumber(inputAmount).times(
                    new BigNumber((100 - bufferPercent) / 100)
                )) - 1
            );

        // Remove yield strategy
        await yolo.migrateStrategy(usdcAddress, ZERO_ADDRESS);

        expect(Number(await usdcContract.balanceOf(yolo.address)))
            .to.be.greaterThanOrEqual(Number(inputAmount) - 1);
        expect(await aaveYield.getTotalUnderlying(usdcAddress)).to.eq(0);

        const usdcBalBeforeCancel = await usdcContract.balanceOf(deployer.address);

        // Cancel Order
        await yolo.cancelOrder(orderId, orderData);

        const usdcBalAfterCancel = await usdcContract.balanceOf(deployer.address);

        expect(Number(usdcBalAfterCancel)).to.be
            .greaterThanOrEqual(Number(usdcBalBeforeCancel.add(inputAmount)) - 1);
    });

    it("Should cancel order when strategy migrated after creating the order", async () => {
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

        const configParams = config.optimism;
        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            usdcAddress,
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

        const bufferPercent = 0;

        await yolo.setStrategy(usdcAddress, aaveYield.address);
        await yolo.addWhitelistTokens([usdcAddress]);

        await usdcContract.approve(yolo.address, approveAmount);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const receipt = await tx.wait();
        const events = receipt.events.filter((x) => { return x.event == "OrderCreated" });

        const orderId = events[0].args[0];
        const orderData = events[0].args[1];

        await yolo.rebalanceTokens([usdcAddress]);

        expect(Number(await usdcContract.balanceOf(yolo.address))).to.eq(
            Number(new BigNumber(inputAmount).times(
                new BigNumber(bufferPercent / 100)
            ))
        );
        expect(Number(await aaveYield.getTotalUnderlying(usdcAddress))).to
            .greaterThanOrEqual(
                Number(new BigNumber(inputAmount).times(
                    new BigNumber((100 - bufferPercent) / 100)
                )) - 1
            );

        let aaveYieldNew = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            usdcAddress,
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

        // Migrate startegy to new contract
        await yolo.migrateStrategy(usdcAddress, aaveYieldNew.address);

        expect(Number(await usdcContract.balanceOf(yolo.address))).to.eq(
            Number(new BigNumber(inputAmount).times(
                new BigNumber(bufferPercent / 100)
            ))
        );
        expect(Number(await aaveYieldNew.getTotalUnderlying(usdcAddress))).to.
            greaterThanOrEqual(
                Number(new BigNumber(inputAmount).times(
                    new BigNumber((100 - bufferPercent) / 100)
                ))
            );
        expect(await aaveYield.getTotalUnderlying(usdcAddress)).to.eq(0);

        const usdcBalBeforeCancel = await usdcContract.balanceOf(deployer.address);

        await yolo.cancelOrder(orderId, orderData);

        const usdcBalAfterCancel = await usdcContract.balanceOf(deployer.address);

        expect(Number(usdcBalAfterCancel)).to.be
            .greaterThanOrEqual(Number(usdcBalBeforeCancel.add(inputAmount)));
    });

    it("Should deduct correct cancellation fee", async () => {
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

        await usdcContract.approve(yolo.address, approveAmount);

        const AaveYield = await ethers.getContractFactory("AaveYield");

        const configParams = config.optimism;
        let aaveYield = await AaveYield.deploy(
            yolo.address,
            deployer.address,
            usdcAddress,
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
        await yolo.addWhitelistTokens([usdcAddress]);
        await yolo.updateTreasury(treasury);
        await yolo.updateCancellationFee(1000); // 10%

        const inputAmt = new BigNumber(1000).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmt,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
        );

        const receipt = await tx.wait();
        const events = receipt.events.filter((x) => {
            return x.event == "OrderCreated"
        });
        const orderId = events[0].args[0];
        const orderData = events[0].args[1];

        // Advancing 7 blocks
        for (let i = 0; i < 7; ++i) {
            await time.advanceBlock();
        };

        const yoloContractBal = await usdcContract.balanceOf(yolo.address);
        const depositPlusYield = await yolo.callStatic.getTotalTokens(
            usdcAddress, yoloContractBal, aaveYield.address
        );
        const yieldEarned = depositPlusYield.sub(EthersBN.from(inputAmt));
        const cancellationFee = yieldEarned.mul(1000).div(10000);

        const userBalBeforeCancellation =
            await usdcContract.balanceOf(recipient);
        const treasuryBalBeforeCancellation =
            await usdcContract.balanceOf(treasury);

        await yolo.cancelOrder(orderId, orderData);

        const userBalAfterCancellation =
            await usdcContract.balanceOf(recipient);
        const treasuryBalAfterCancellation =
            await usdcContract.balanceOf(treasury);

        expect(Number(userBalAfterCancellation))
            .greaterThanOrEqual(
                Number(userBalBeforeCancellation.add(
                    depositPlusYield.sub(cancellationFee)
                )) - 1);
        expect(Number(treasuryBalAfterCancellation))
            .greaterThanOrEqual(
                Number(treasuryBalBeforeCancellation.add(cancellationFee)));
    });
});

const getShareFromOrder = (orderData) => {
    const abiCoder = new ethers.utils.AbiCoder();
    const abi = [
        "address",
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "address",
        "uint256",
    ];

    const decodedData = abiCoder.decode(abi, orderData);
    return decodedData[6];
}
