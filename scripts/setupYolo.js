const config = require("../config/index.json");
const assetConfig = require("../config/asset.json");
const globalArgs = require('../config/arguments.json');
const YoloArtifacts = require("../artifacts/contracts/Yolo.sol/Yolo.json");
const ChainlinkArtifacts = require(
    "../artifacts/contracts/oracles/ChainlinkOracle.sol/ChainlinkOracle.json"
);
const { deployYolo } = require('./deployYolo');
const { deployTreasury } = require('./deployTreasury');
const { deployChainlinkOracle } = require('./oracles/deployChainlinkOracle');
const { deployUniswapHandler } = require('./handlers/deployUniswapHandler');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );

    // console.log("\nDeploying ChainlinkOracle..");
    // await deployChainlinkOracle();

    // console.log("\nDeploying Yolo..");
    // await deployYolo();

    // console.log("\nDeploying Treasury..");
    // await deployTreasury();

    // console.log("\nDeploying UniswapHandler..");
    // await deployUniswapHandler();

    // let configParams = config.development;
    // if (network.name === "optimism") {
    //     configParams = config.optimism;
    // }

    // const yolo = new ethers.Contract(
    //     configParams.yoloAddress,
    //     YoloArtifacts.abi,
    //     deployer
    // );

    // const chainlinkOracle = new ethers.Contract(
    //     configParams.chainlinkOracle,
    //     ChainlinkArtifacts.abi,
    //     deployer,
    // );

    // let assetsData = assetConfig.optimism;

    // console.log("\nupdating treasury address in contract");
    // const tx1 = await yolo.updateTreasury(configParams.treasury);
    // await tx1.wait();

    // console.log("\nupdating protocol fee in contract");
    // const tx2 = await yolo.updateProtocolFee(
    //     globalArgs.yolo.protocolFeePercent
    // );
    // await tx2.wait();

    // console.log("\nupdating cancellation fee in contract");
    // const tx3 = await yolo.updateCancellationFee(
    //     globalArgs.yolo.cancellationFeePercent
    // );
    // await tx3.wait();

    // let tokens = [];
    // let feedAssets = [];
    // let chainlinkFeeds = [];
    // let bufferPercents = [];

    // for (let i = 0; i < assetsData.length; i++) {
    //     let data = assetsData[i];

    //     if (data.address) {
    //         if (data.isWhitelistToken) {
    //             tokens.push(data.address);
    //         }

    //         if (data.feed) {
    //             feedAssets.push(data.address)
    //             chainlinkFeeds.push(data.feed)
    //         }

    //         if (data.buffer > 0) {
    //             bufferPercents.push(data.buffer);
    //         }
    //     }

    //     if (i === assetsData.length - 1) {
    //         if (tokens.length > 0) {
    //             console.log("\nadding whitelist tokens...");
    //             const tx = await yolo.addWhitelistTokens(tokens);
    //             await tx.wait();
    //         }

    //         if (bufferPercents.length > 0) {
    //             console.log("\nupdating tokens buffer...");
    //             const tx = await yolo
    //                 .updateTokensBuffer(tokens, bufferPercents);
    //             await tx.wait();
    //         }

    //         if (feedAssets.length > 0) {
    //             console.log("\nupdating chainlink feeds...");
    //             const feedTx = await chainlinkOracle
    //                 .updateTokenFeeds(feedAssets, chainlinkFeeds);
    //             await feedTx.wait();
    //         }
    //     }
    // }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
