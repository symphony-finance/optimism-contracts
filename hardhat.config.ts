require('dotenv').config();
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('@openzeppelin/hardhat-upgrades');
const { accounts } = require('./test-accounts.ts');

const HARDFORK = 'london';
const DEFAULT_GAS_MUL = 5;
const GWEI = 1000 * 1000 * 1000;
const DEFAULT_BLOCK_GAS_LIMIT = 12450000;
const INFURA_KEY = process.env.INFURA_KEY || '';
const ALCHEMY_KEY = process.env.ALCHEMY_KEY || '';
const MAINNET_FORK = process.env.MAINNET_FORK === 'true';
const BUIDLEREVM_CHAINID = 31337;
const ARBISCAN_KEY = process.env.ARBISCAN_KEY || '';
const mainnetFork = MAINNET_FORK
    ? {
        blockNumber: 9091364,
        url: ALCHEMY_KEY
            ? `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
            : `https://optimism.infura.io/v3/${INFURA_KEY}`,
    }
    : undefined;

module.exports = {
    defaultNetwork: "localhost",
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545",
            loggingEnabled: true,
        },
        hardhat: {
            hardfork: HARDFORK,
            blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
            gas: DEFAULT_BLOCK_GAS_LIMIT,
            gasPrice: 8000000000,
            chainId: BUIDLEREVM_CHAINID,
            throwOnTransactionFailures: true,
            throwOnCallFailures: true,
            accounts: accounts.map(({ secretKey, balance }: { secretKey: string; balance: string }) => ({
                privateKey: secretKey,
                balance,
            })),
            forking: mainnetFork,
            loggingEnabled: true,
        },
        optimism: {
            hardfork: HARDFORK,
            url: `https://mainnet.optimism.io`,
            accounts: [`0x${process.env.MAINNET_PRIVATE_KEY}`],
            chainId: 10,
            blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
            gasPrice: 25 * GWEI
        },
        rinkeby: {
            url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_KEY}`,
            chainId: 4,
            accounts: [`0x${process.env.TESTNET_PRIVATE_KEY}`],
            blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
        }
    },
    etherscan: {
        apiKey: ARBISCAN_KEY
    },
    solidity: {
        version: "0.8.10",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
                details: {
                    yul: false
                },
            }
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    mocha: {
        timeout: 100000000
    }
}
