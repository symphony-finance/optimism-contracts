const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { network } = require("hardhat");
const fileName = "../config/index.json";
const file = require("../config/index.json");
const config = require("../config/index.json");

const main = () => {
    return new Promise(async (resolve) => {
        let configParams = config.development;
        if (network.name === "optimism") {
            configParams = config.optimism;
        }

        // Deploy Yolo Contract
        const Yolo = await hre.ethers.getContractFactory("Yolo");

        upgrades.deployProxy(
            Yolo,
            [
                configParams.admin,
                configParams.emergencyAdmin,
                configParams.chainlinkOracle,
            ]
        ).then(async (yolo) => {
            await yolo.deployed();

            console.log(
                "Yolo contract deployed to:",
                yolo.address, "\n"
            );

            if (network.name === "optimism") {
                file.optimism.yoloAddress = yolo.address;
            } else {
                file.development.yoloAddress = yolo.address;
            }

            fs.writeFileSync(
                path.join(__dirname, fileName),
                JSON.stringify(file, null, 2),
            );

            resolve(true);
        });
    });
}

module.exports = { deployYolo: main }
