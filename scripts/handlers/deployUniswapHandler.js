const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { network } = require("hardhat");
const fileName = "../../config/index.json";
const file = require("../../config/index.json");
const config = require("../../config/index.json");
const YoloArtifacts = require('../../artifacts/contracts/Yolo.sol/Yolo.json');

const main = () => {
    return new Promise(async (resolve) => {
        let configParams = config.development;
        if (network.name === "optimism") {
            configParams = config.optimism;
        }

        const UniswapHandler = await hre.ethers
            .getContractFactory("UniswapHandler");

        await UniswapHandler.deploy(
            configParams.uniswapRouter,
            configParams.wethAddress,
            configParams.yoloAddress
        ).then(async (quickswapHandler) => {
            await quickswapHandler.deployed();

            console.log(
                "Quickswap Handler deployed to:",
                quickswapHandler.address, "\n"
            );

            if (network.name === "optimism") {
                file.optimism.uniswapHandlerAddress = quickswapHandler.address;
            } else {
                file.development.uniswapHandlerAddress = quickswapHandler.address;
            }

            fs.writeFileSync(
                path.join(__dirname, fileName),
                JSON.stringify(file, null, 2),
            );

            const [deployer] = await ethers.getSigners();

            // Set Handler In Yolo Contract
            const yolo = new ethers.Contract(
                configParams.yoloAddress,
                YoloArtifacts.abi,
                deployer
            );

            const tx = await yolo.addHandler(quickswapHandler.address);
            await tx.wait();

            resolve(true);
        });
    });
}

module.exports = { deployUniswapHandler: main }
