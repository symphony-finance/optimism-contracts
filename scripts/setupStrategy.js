const fs = require("fs");
const path = require("path");
const fileName = "../config/asset.json";
const file = require("../config/asset.json");
const config = require("../config/index.json");
const assetConfig = require("../config/asset.json");
const { deployAaveYield } = require('./adapters/deployAaveYield');
const YoloArtifacts = require("../artifacts/contracts/Yolo.sol/Yolo.json");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);

    let configParams = config.development;
    if (network.name === "optimism") {
        configParams = config.optimism;
    }

    const yolo = new ethers.Contract(
        configParams.yoloAddress,
        YoloArtifacts.abi,
        deployer
    );

    let assetsData = assetConfig.optimism;

    for (let i = 0; i < assetsData.length; i++) {
        let data = assetsData[i];

        if (data.address && !data.aaveStrategy) {
            console.log("\nSetting up strategy for", data.token);
            const strategyAddr = await deployAaveYield(data.address);

            const tx = await yolo.setStrategy(
                data.address,
                strategyAddr,
            );
            await tx.wait();

            file[network.name][i].aaveStrategy = strategyAddr;

            fs.writeFileSync(
                path.join(__dirname, fileName),
                JSON.stringify(file, null, 2),
            );
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
