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

        // Deploy Treasury Contract
        const Treasury = await hre.ethers.getContractFactory("Treasury");

        upgrades.deployProxy(
            Treasury,
            [configParams.admin],
        ).then(async (treasury) => {
            await treasury.deployed();
            console.log("Treasury deployed to:", treasury.address, "\n");

            if (network.name === "optimism") {
                file.optimism.treasury = treasury.address;
            } else {
                file.development.treasury = treasury.address;
            }

            fs.writeFileSync(
                path.join(__dirname, fileName),
                JSON.stringify(file, null, 2),
            );

            resolve(true);
        });
    });
}

module.exports = { deployTreasury: main }
