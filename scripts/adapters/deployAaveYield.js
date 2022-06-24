const hre = require("hardhat");
const config = require("../../config/index.json");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const main = (tokenAddress) => {
    return new Promise(async (resolve) => {
        let configParams = config.development;
        if (network.name === "optimism") {
            configParams = config.optimism;
        }

        // Deploy AaveYield Contract
        const AaveYield = await hre.ethers.getContractFactory("AaveYield");

        AaveYield.deploy(
            configParams.yoloAddress,
            configParams.emergencyAdmin,
            tokenAddress,
            configParams.aaveLendingPool,
            configParams.aaveIncentivesController,
            ZERO_ADDRESS,
        ).then(async (aaveYield) => {
            await aaveYield.deployed();

            console.log(
                "AaveYield contract deployed to:",
                aaveYield.address, "\n"
            );

            resolve(aaveYield.address);
        });
    })
}

module.exports = { deployAaveYield: main }
