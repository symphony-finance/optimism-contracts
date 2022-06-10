const hre = require("hardhat");
const { expect } = require("chai");
const config = require("../config/index.json");
const { AbiCoder } = require("ethers/lib/utils");
const { BigNumber: EthersBN } = require("ethers");
const { default: BigNumber } = require("bignumber.js");
const { time, expectRevert } = require("@openzeppelin/test-helpers");
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
const ChainlinkArtifacts = require(
    "../artifacts/contracts/oracles/ChainlinkOracle.sol/ChainlinkOracle.json"
);

const abiCoder = new AbiCoder();
const configParams = config.optimism;
const daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const usdcAddress = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

const recipient = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const executor = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const creator = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";

const executorFeePercent = 15; // 0.15%;
const protocolFeePercent = 5; // 0.05%

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

describe("Execute Order Test", () => {
    it("Should execute order with Uniswap Handler & Aave Yield", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
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

        await chainlinkOracle.updatePriceSlippage(100);

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                chainlinkOracle.address,
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
        await yolo.updateTokensBuffer([daiAddress], [4000]);

        // Deploy Uniswap Handler
        const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

        let uniswapHandler = await UniswapHandler.deploy(
            configParams.uniswapRouter, // Router
            configParams.wethAddress, // WETH
            yolo.address // yolo address
        );

        await uniswapHandler.deployed();

        await yolo.addHandler(uniswapHandler.address);
        await yolo.addWhitelistTokens([daiAddress]);

        await daiContract.approve(yolo.address, approveAmount);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
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

        const daiBalBeforeExecute = await daiContract.balanceOf(deployer.address);
        const usdcBalBeforeExecute = await usdcContract.balanceOf(deployer.address);

        // Advancing 100 blocks
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        };

        const oracleResult = await chainlinkOracle.get(
            daiAddress,
            usdcAddress,
            new BigNumber(inputAmount).minus(new BigNumber(executionFee)).toString()
        );
        const oracleAmount = Number(oracleResult.amountOutWithSlippage);

        const amountOutMin = oracleAmount <= Number(stoplossAmount) ||
            oracleAmount > Number(minReturnAmount)
            ? oracleAmount
            : Number(minReturnAmount);

        const contractBal = await daiContract.balanceOf(yolo.address);
        const totalTokens = await yolo.callStatic.getTotalTokens(
            daiAddress, contractBal, aaveYield.address
        );
        const depositPlusYield = totalTokens; // as there is only one order
        const yieldEarned = depositPlusYield.sub(EthersBN.from(inputAmount));

        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        // Execute Order
        await yolo.executeOrder(orderId, orderData, uniswapHandler.address, extraData);

        const daiBalAfterExecute = await daiContract.balanceOf(deployer.address);
        const usdcBalAfterExecute = await usdcContract.balanceOf(deployer.address);

        expect(Number(usdcBalAfterExecute)).to.be.greaterThanOrEqual(
            Number(usdcBalBeforeExecute) + Number(amountOutMin)
        );

        expect(Number(daiBalAfterExecute))
            .to.be.greaterThanOrEqual(
                Number(daiBalBeforeExecute) + Number(yieldEarned)
            );
    });

    it("Should execute existing order if strategy removed", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
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

        await chainlinkOracle.updatePriceSlippage(100);

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                chainlinkOracle.address,
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

        // Deploy Uniswap Handler
        const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

        let uniswapHandler = await UniswapHandler.deploy(
            configParams.uniswapRouter, // Router
            configParams.wethAddress, // WETH
            yolo.address // yolo address
        );

        await uniswapHandler.deployed();

        // Add Handler
        await yolo.addHandler(uniswapHandler.address);

        const approveAmount = new BigNumber(100)
            .times(
                new BigNumber(10)
                    .exponentiatedBy(new BigNumber(18))
            )
            .toString();

        await daiContract.approve(yolo.address, approveAmount);

        await yolo.addWhitelistTokens([daiAddress]);

        const inputAmount1 = new BigNumber(inputAmount)
            .plus(new BigNumber(executionFee)).toString();

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
            inputAmount1,
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

        await yolo.rebalanceTokens([daiAddress]);

        // Remove yield strategy
        await yolo.migrateStrategy(daiAddress, ZERO_ADDRESS);

        const usdcBalBeforeExecute = await usdcContract.balanceOf(deployer.address);

        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        // Execute Order
        await yolo.executeOrder(orderId, orderData, uniswapHandler.address, extraData);

        const usdcBalAfterExecute = await usdcContract.balanceOf(deployer.address);

        const expectedReturn = new BigNumber(9.9).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();
        expect(Number(usdcBalAfterExecute)).to.be.greaterThanOrEqual(
            Number(usdcBalBeforeExecute) + Number(expectedReturn)
        );
    });

    it("Should execute order if ETH is the output token", async () => {
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
            [daiAddress, configParams.wethAddress],
            [
                "0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6", // DAI-USD
                "0x13e3Ee699D1909E989722E753853AE30b17e08c5", // ETH-USD
            ],
        );

        await chainlinkOracle.updatePriceSlippage(100);

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                chainlinkOracle.address,
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        // Deploy Treasury Contract
        const Treasury = await hre.ethers.getContractFactory("Treasury");
        const treasury = await upgrades.deployProxy(
            Treasury,
            [deployer.address],
        );
        await treasury.deployed();

        await yolo.updateTreasury(treasury.address);
        await yolo.updateProtocolFee(protocolFeePercent);

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

        // Deploy Uniswap Handler
        const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

        let uniswapHandler = await UniswapHandler.deploy(
            configParams.uniswapRouter, // Router
            configParams.wethAddress, // WETH
            yolo.address // yolo address
        );

        await uniswapHandler.deployed();

        // Add Handler
        await yolo.addHandler(uniswapHandler.address);

        await daiContract.approve(yolo.address, approveAmount);

        await yolo.addWhitelistTokens([daiAddress]);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            configParams.wethAddress,
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

        const daiBalBeforeExecute = await daiContract.balanceOf(deployer.address);

        // Advancing 100 blocks
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        };

        const contractBal = await daiContract.balanceOf(yolo.address);
        const totalTokens = await yolo.callStatic.getTotalTokens(
            daiAddress, contractBal, aaveYield.address
        );
        const depositPlusYield = totalTokens; // as there is only one order
        const yieldEarned = depositPlusYield.sub(EthersBN.from(inputAmount));

        const extraData = abiCoder.encode(['uint24', 'uint24'], [3000, 500]);

        // Execute Order
        await yolo.executeOrder(orderId, orderData, uniswapHandler.address, extraData);

        const daiBalAfterExecute = await daiContract.balanceOf(deployer.address);

        expect(Number(daiBalAfterExecute))
            .to.be.greaterThanOrEqual(
                Number(daiBalBeforeExecute) + Number(yieldEarned)
            );
    });

    it("Should transfer correct amount to recipient, executor & treasury", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
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
        await chainlinkOracle.updatePriceSlippage(400);

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                chainlinkOracle.address,
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
        await yolo.updateProtocolFee(protocolFeePercent);

         // Deploy Uniswap Handler
         const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

         let uniswapHandler = await UniswapHandler.deploy(
             configParams.uniswapRouter, // Router
             configParams.wethAddress, // WETH
             yolo.address // yolo address
         );
 
         await uniswapHandler.deployed();

        await yolo.addHandler(uniswapHandler.address);
        await yolo.addWhitelistTokens([daiAddress]);

        await daiContract.approve(yolo.address, approveAmount);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
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

        // Advancing 100 blocks
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        };

        const recipientBalBefore = await usdcContract.balanceOf(recipient);
        const executorBalBefore = await daiContract.balanceOf(executor);

        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        // Execute Order
        await yolo.executeOrder(orderId, orderData, uniswapHandler.address, extraData);

        const recipientBalAfter = await usdcContract.balanceOf(recipient);
        const executorBalAfter = await daiContract.balanceOf(executor);
        const treasuryBalAfter = await daiContract.balanceOf(treasury.address);

        const totalFee = getTotalFee(new BigNumber(inputAmount));
        const oracleResult = await chainlinkOracle.get(
            daiAddress,
            usdcAddress,
            (new BigNumber(inputAmount).minus(totalFee)).toString()
        );
        const oracleAmount = Number(oracleResult.amountOutWithSlippage);

        const amountOutMin = oracleAmount <= Number(stoplossAmount) ||
            oracleAmount > Number(minReturnAmount)
            ? oracleAmount
            : Number(minReturnAmount);

        const result = getParticipantsDividend(inputAmount);

        expect(Number(result.executorFee)).to.be
            .eq(Number(executorBalAfter.sub(executorBalBefore)));
        expect(Number(result.protocolFee)).to.be.eq(Number(treasuryBalAfter));
        expect(Number(recipientBalAfter.sub(recipientBalBefore))).to
            .be.greaterThanOrEqual(Number(amountOutMin));
    });

    it("Should revert if condition doesn't satisfy (uniswap v3 handler)", async () => {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x6Da788AE09788a82DAAce1d642c5f26debf4A153"]
        });

        const deployer = await ethers.provider.getSigner(
            "0x6Da788AE09788a82DAAce1d642c5f26debf4A153"
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

        await chainlinkOracle.updatePriceSlippage(100);

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                chainlinkOracle.address,
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

       // Deploy Uniswap Handler
       const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

       let uniswapHandler = await UniswapHandler.deploy(
           configParams.uniswapRouter, // Router
           configParams.wethAddress, // WETH
           yolo.address // yolo address
       );

       await uniswapHandler.deployed();

        await yolo.addHandler(uniswapHandler.address);
        await yolo.addWhitelistTokens([daiAddress]);

        await daiContract.approve(yolo.address, approveAmount);

        const inputAmount1 = new BigNumber(inputAmount)
            .plus(new BigNumber(executionFee)).toString();
        const stoplossAmount1 = new BigNumber(9).times(
            new BigNumber(10).exponentiatedBy(new BigNumber(6))
        ).toString();

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
            inputAmount1,
            minReturnAmount,
            stoplossAmount1,
            executor,
            executionFee,
            creator,
        );

        const receipt = await tx.wait();
        const events = receipt.events.filter((x) => { return x.event == "OrderCreated" });

        const orderId = events[0].args[0];
        const orderData = events[0].args[1];

        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        await expectRevert(
            yolo.executeOrder(orderId, orderData, uniswapHandler.address, extraData),
            'Too little received'
        );
    });

    it("Should ececute order with allowed executor", async () => {
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

        await chainlinkOracle.updatePriceSlippage(100);

        // Deploy Yolo Contract
        const Yolo = await ethers.getContractFactory("Yolo");

        let yolo = await upgrades.deployProxy(
            Yolo,
            [
                deployer.address,
                deployer.address,
                chainlinkOracle.address,
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

         // Deploy Uniswap Handler
       const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

       let uniswapHandler = await UniswapHandler.deploy(
           configParams.uniswapRouter, // Router
           configParams.wethAddress, // WETH
           yolo.address // yolo address
       );

       await uniswapHandler.deployed();

        await yolo.addHandler(uniswapHandler.address);
        await yolo.addWhitelistTokens([daiAddress]);

        await daiContract.approve(yolo.address, approveAmount);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
            inputAmount,
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

        const newExecutor = "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4";

        await yolo.approveExecutor(newExecutor);

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [newExecutor]
        });
        deployer = await ethers.provider.getSigner(newExecutor);

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        const executeTx = await yolo.executeOrder(
            orderId,
            orderData,
            uniswapHandler.address,
            extraData,
        );

        const executeRecipt = await executeTx.wait();
        const executeEvents = executeRecipt.events.filter((x) => {
            return x.event == "OrderExecuted"
        });

        const executeOrderId = executeEvents[0].args[0];
        expect(executeOrderId).to.eq(orderId);
    });

    it("Should revert if invalid executor or executor not allowed", async () => {
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
                ZERO_ADDRESS, // false chainlink oracle
            ]
        );

        await yolo.deployed();

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        // Deploy Uniswap Handler
        const UniswapHandler = await ethers.getContractFactory("UniswapHandler");

        let uniswapHandler = await UniswapHandler.deploy(
            configParams.uniswapRouter, // Router
            configParams.wethAddress, // WETH
            yolo.address // yolo address
        );
 
        await uniswapHandler.deployed();

        await yolo.addHandler(uniswapHandler.address);
        await yolo.addWhitelistTokens([daiAddress]);

        await daiContract.approve(yolo.address, approveAmount);

        // Create Order
        const tx = await yolo.createOrder(
            recipient,
            daiAddress,
            usdcAddress,
            inputAmount,
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

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"]
        });
        deployer = await ethers.provider.getSigner(
            "0x0fD6f65D35cf13Ae51795036d0aE9AF42f3cBCB4"
        );

        yolo = new ethers.Contract(
            yolo.address,
            YoloArtifacts.abi,
            deployer
        );

        const extraData = abiCoder.encode(['uint24', 'uint24'], [500, 3000]);

        await expectRevert(
            yolo.executeOrder(orderId, orderData, uniswapHandler.address, extraData),
            'Yolo::executeOrder: order executor mismatch'
        );
    });
});

const getTotalFee = (amount) => {
    const _protocolFeePercent = new BigNumber(protocolFeePercent / 100);
    return new BigNumber(executionFee).plus(
        amount.multipliedBy(_protocolFeePercent).dividedBy(100)
    );
}

const getParticipantsDividend = (inputAmount) => {
    const _protocolFeePercent = new BigNumber(protocolFeePercent / 100);
    const executorFee = new BigNumber(executionFee);
    const protocolFee = new BigNumber(inputAmount)
        .times(_protocolFeePercent).dividedBy(100);
    return { executorFee, protocolFee };
}
