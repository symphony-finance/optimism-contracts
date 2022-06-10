const hre = require("hardhat");
const { expect } = require("chai");
const config = require("../config/index.json");
const { default: BigNumber } = require("bignumber.js");
const { time } = require("@openzeppelin/test-helpers");
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

const executorFeePercent = 20; // 0.2%
const configParams = config.optimism;
const daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const usdcAddress = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

const recipient = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const executor = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";
const creator = "0x6Da788AE09788a82DAAce1d642c5f26debf4A153";

let inputAmount = new BigNumber(10)
    .times(new BigNumber(10).exponentiatedBy(new BigNumber(18)));
let executionFee = inputAmount
    .multipliedBy(new BigNumber(executorFeePercent / 100)).toString()
inputAmount = new BigNumber(inputAmount)
    .plus(new BigNumber(executionFee)).toString()

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

describe("Update Order Test", () => {
    it("Should Update order with Uniswap Handler & Aave Yield", async () => {
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
        await yolo.updateTokensBuffer([daiAddress], [4000]);

        await daiContract.approve(yolo.address, approveAmount);

        await yolo.addWhitelistTokens([daiAddress]);

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

        await yolo.rebalanceTokens([daiAddress]);

        // Advancing 100 blocks
        for (let i = 0; i < 100; ++i) {
            await time.advanceBlock();
        };

        const randomAddress = "0x829BD824B016326A401d083B33D092293333A830";

        // Update the recipient of the order
        let updateTx = await yolo.updateOrder(
            orderId,
            orderData,
            randomAddress,
            usdcAddress,
            minReturnAmount,
            stoplossAmount,
            executor,
            executionFee,
        );

        // check the recipient of the order has changed (check the event logs)
        let updateTxReceipt = await updateTx.wait();
        let updateTxEvents = updateTxReceipt.events
            .filter((e) => {
                return e.event == "OrderUpdated"
            })
        let eventOrderData = updateTxEvents[0].args[2];

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

        const decodedData = abiCoder.decode(abi, eventOrderData);
        const newRecipient = decodedData[1];
        expect(newRecipient.toString()).to.eq(randomAddress);
    });
});
