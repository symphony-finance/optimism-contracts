const { expect } = require("chai");
const { default: BigNumber } = require("bignumber.js");
const config = require("../config/index.json");
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
const recipient = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";
const executor = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";
const creator = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";

let inputAmount = new BigNumber(10).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(6))
);
let executionFee = inputAmount.multipliedBy(new BigNumber(0.2)).toString()
inputAmount = inputAmount.toString()

let minReturnAmount = new BigNumber(15).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

let stoplossAmount = new BigNumber(8).times(
    new BigNumber(10).exponentiatedBy(new BigNumber(18))
).toString();

const approveAmount = new BigNumber(100)
    .times(
        new BigNumber(10)
            .exponentiatedBy(new BigNumber(18))
    )
    .toString();

describe("Create Order Test", () => {
    it("Should create multiple orders (diff ids) with no yield strategy", async () => {
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

        await daiContract.approve(yolo.address, approveAmount);
        await usdcContract.approve(yolo.address, approveAmount);

        expect(await yolo.totalTokenShares(usdcAddress)).to.eq(0);

        await yolo.addWhitelistTokens([usdcAddress]);

        // Create 1st Order
        await yolo.createOrder(
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

        // Create New Order
        const newstoploss =
            new BigNumber(7).times(
                new BigNumber(10).exponentiatedBy(new BigNumber(6))
            ).toString();

        await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount,
            minReturnAmount,
            newstoploss,
            executor,
            executionFee,
            creator,
        );
    });

    it("Should create order with native token (ETH)", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );
        deployer.address = deployer._address;

        const configParams = config.optimism;

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

        const Treasury = await ethers.getContractFactory("Treasury");
        const treasury = await upgrades.deployProxy(
            Treasury,
            [deployer.address]
        );
        await treasury.deployed();
        await yolo.updateTreasury(treasury.address);

        await yolo.addWhitelistTokens([configParams.wethAddress]);

        const depositAmount = new BigNumber(0.01).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(18))
        ).toString();

        const minReturnAmount = new BigNumber(15).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        const stoplossAmount = new BigNumber(8).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        // Create Order
        const receipt = await yolo.createNativeOrder(
            deployer.address,
            usdcAddress,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            creator,
            { value: depositAmount }
        );

        const block = await ethers.provider.getBlock(receipt.blockHash);

        const orderId = await yolo.getOrderId(
            deployer.address,
            deployer.address,
            configParams.wethAddress,
            usdcAddress,
            depositAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            block.timestamp
        );

        expect(
            await yolo.totalTokenShares(configParams.wethAddress)
        ).to.eq(depositAmount);

        const orderHash = await yolo.orderHash(orderId);

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

        const shareAmount = depositAmount;

        const enocodedData = abiCoder.encode(
            abi,
            [
                deployer.address,
                deployer.address,
                configParams.wethAddress,
                usdcAddress,
                depositAmount,
                minReturnAmount,
                stoplossAmount,
                shareAmount,
                executor,
                executionFee,
            ]
        );

        expect(orderHash).to.eq(ethers.utils.keccak256(enocodedData));
    });

    it("Should create order with extreme values", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x4DAEf97203Fa6654F6338872DA5bD1EA2E879533"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x4DAEf97203Fa6654F6338872DA5bD1EA2E879533"
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

        await daiContract.approve(yolo.address, approveAmount);
        await usdcContract.approve(yolo.address, approveAmount);

        expect(await yolo.totalTokenShares(usdcAddress)).to.eq(0);

        await yolo.addWhitelistTokens([usdcAddress]);

        // check the state changes
        let totalSharesBefore = await yolo.totalTokenShares(
            usdcAddress
        );

        expect(totalSharesBefore).to.eq(0);

        const inputAmount1 = 2;
        const minReturnAmount1 = 4;
        const executionFee1 = 1;

        // Create Order 1 USDC  
        await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount1,
            minReturnAmount1,
            0,
            executor,
            executionFee1,
            creator,
        );

        // check the state changes
        let totalSharesAfter = await yolo.totalTokenShares(
            usdcAddress
        );

        expect(totalSharesAfter).to.eq(2);

        totalSharesBefore = await yolo.totalTokenShares(
            usdcAddress
        );

        expect(totalSharesBefore).to.eq(2);

        const inputAmount2 = new BigNumber(1000000).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        );
        const executionFee2 = inputAmount2.multipliedBy(0.2).toString();
        const minReturnAmount2 = new BigNumber(2000000).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        await yolo.createOrder(
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount2.toString(),
            minReturnAmount2,
            0,
            executor,
            executionFee2,
            creator,
        );

        totalSharesAfter = await yolo.totalTokenShares(
            usdcAddress
        );
        expect(totalSharesAfter).to.eq(1000000000002);
    });

    it("Should create order with yield strategy & 0% buffer", async () => {
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

        await yolo.setStrategy(
            usdcAddress,
            aaveYield.address,
        );

        await yolo.addWhitelistTokens([usdcAddress]);

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

        const orderStatus = await getOrderStatus(
            yolo,
            receipt,
            deployer.address
        );

        expect(orderStatus).to.be.true;

        // expect(await usdcContract.balanceOf(yolo.address)).to.eq(0);

        // aaveYield = new ethers.Contract(
        //     aaveYield.address,
        //     AaveYieldArtifacts.abi,
        //     deployer
        // );

        // expect(Number(await aaveYield.getTotalUnderlying(usdcAddress)))
        //     .to.greaterThanOrEqual(Number(inputAmount) - 1);
    });

    it("Should create order with yield strategy & 100% buffer", async () => {
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

        await yolo.setStrategy(
            usdcAddress,
            aaveYield.address,
        );

        await yolo.updateTokensBuffer(
            [usdcAddress],
            [10000], // 100%
        );

        await yolo.addWhitelistTokens([usdcAddress]);

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

        const orderStatus = await getOrderStatus(
            yolo,
            receipt,
            recipient
        );

        expect(orderStatus).to.be.true;

        expect(await usdcContract.balanceOf(yolo.address)).to.eq(inputAmount);
    });

    it("Should create order with Aave Yield Strategy", async () => {
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

        expect(await yolo.totalTokenShares(usdcAddress)).to.eq(0);

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

        await yolo.setStrategy(
            usdcAddress,
            aaveYield.address,
        );

        const bufferPercent = 40; // 40%

        await yolo.updateTokensBuffer(
            [usdcAddress],
            [bufferPercent * 100], // 4000
        );

        await yolo.addWhitelistTokens([usdcAddress]);

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

        expect(await yolo.totalTokenShares(usdcAddress)).to.eq(inputAmount);

        const receipt = await tx.wait();

        const orderStatus = await getOrderStatus(
            yolo,
            receipt,
            recipient
        );

        expect(orderStatus).to.be.true;

        await yolo.rebalanceTokens([usdcAddress]);

        expect(Number(await usdcContract.balanceOf(yolo.address))).to.eq(
            Number(new BigNumber(inputAmount).times(
                new BigNumber(bufferPercent / 100)
            ))
        );
        expect(Number(await aaveYield.getTotalUnderlying(usdcAddress)))
            .to.greaterThanOrEqual(
                Number(new BigNumber(inputAmount).times(
                    new BigNumber((100 - bufferPercent) / 100)
                ))
            );
    });

    it("Shouldn't create order when paused & create when unpaused", async () => {
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

        const approveAmount = new BigNumber(100)
            .times(
                new BigNumber(10)
                    .exponentiatedBy(new BigNumber(18))
            )
            .toString();

        await usdcContract.approve(yolo.address, approveAmount);

        await yolo.pause();
        await yolo.addWhitelistTokens([usdcAddress]);

        await expect(
            yolo.createOrder(
                recipient,
                usdcAddress,
                daiAddress,
                inputAmount,
                minReturnAmount,
                stoplossAmount,
                executor,
                executionFee,
                creator,
            )
        ).to.be.revertedWith(
            'Pausable: paused'
        );

        await yolo.unpause();

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

        const orderStatus = await getOrderStatus(
            yolo,
            receipt,
            deployer.address
        );

        expect(orderStatus).to.be.true;
    });
});

const getOrderStatus = (
    yolo,
    receipt,
    recipient
) => {
    return new Promise(async (resolve) => {
        const events = receipt.events.filter((x) => { return x.event == "OrderCreated" });

        const orderId = events[0].args[0];
        const orderData = events[0].args[1];

        const block = await ethers.provider.getBlock(receipt.blockHash);
        const creator = recipient;

        const _orderId = await yolo.getOrderId(
            creator,
            recipient,
            usdcAddress,
            daiAddress,
            inputAmount,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
            block.timestamp
        );

        expect(orderId).to.eq(_orderId);

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

        expect(decodedData[0].toLowerCase()).to.eq(creator.toLowerCase());
        expect(decodedData[1].toLowerCase()).to.eq(recipient.toLowerCase());
        expect(decodedData[2].toLowerCase()).to.eq(usdcAddress.toLowerCase());
        expect(decodedData[3].toLowerCase()).to.eq(daiAddress.toLowerCase());
        expect(decodedData[4]).to.eq(inputAmount);
        expect(decodedData[5]).to.eq(minReturnAmount);
        expect(decodedData[6]).to.eq(stoplossAmount);
        expect(decodedData[7]).to.eq(inputAmount);
        expect(decodedData[8]).to.eq(executor);
        expect(decodedData[9]).to.eq(executionFee);

        resolve(true);
    });
}
