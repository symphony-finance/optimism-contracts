// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IYieldAdapter.sol";
import "../interfaces/uniswap/IUniswapRouter.sol";
import "../interfaces/aave/IRewardsController.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";

/**
 * @title Aave v3 Yield contract
 * @notice Implements the functions to deposit/withdraw into Aave V3
 * @author Symphony Finance
 **/
contract AaveYield is IYieldAdapter {
    using SafeERC20 for IERC20;

    address public immutable yolo;
    address public manager;

    // Addresses related to aave
    address internal immutable tokenAddress;
    address internal immutable aTokenAddress;
    IPool public immutable aavePool;
    IRewardsController public immutable rewardsController;
    uint16 internal constant referralCode = 43915;
    address public rewardToken;

    // Addresses related to swap
    address[] route;
    IUniswapRouter public router;
    IUniswapRouter public backupRouter;
    uint256 public harvestMaxGas = 1000000; // 1000k wei

    modifier onlyYolo() {
        require(
            msg.sender == yolo,
            "AaveV3Yield: only yolo contract can invoke this function"
        );
        _;
    }

    modifier onlyManager() {
        require(
            msg.sender == manager,
            "AaveV3Yield: only manager contract can invoke this function"
        );
        _;
    }

    /**
     * @dev To initialize the contract addresses interacting with this contract
     **/
    constructor(
        address _yolo,
        address _manager,
        address _tokenAddress,
        IPool _aavePool,
        IRewardsController _rewardsController,
        address _rewardToken
    ) {
        require(_yolo != address(0), "yolo: zero address");
        require(_manager != address(0), "manager: zero address");
        require(address(_aavePool) != address(0), "aavePool:: zero address");

        yolo = _yolo;
        manager = _manager;
        aavePool = _aavePool;
        tokenAddress = _tokenAddress;
        DataTypes.ReserveData memory reserveData = aavePool.getReserveData(
            _tokenAddress
        );
        aTokenAddress = reserveData.aTokenAddress;
        rewardsController = _rewardsController;
        rewardToken = _rewardToken;
        _maxApprove(_tokenAddress, reserveData.aTokenAddress);
    }

    /**
     * @dev Used to deposit tokens
     **/
    function deposit(address, uint256 amount) external override onlyYolo {
        _depositERC20(amount);
    }

    /**
     * @dev Used to withdraw tokens
     **/
    function withdraw(address, uint256 amount) external override onlyYolo {
        _withdrawERC20(amount);
    }

    /**
     * @dev Withdraw all tokens from the strategy
     **/
    function withdrawAll(address) external override onlyYolo {
        uint256 amount = IERC20(aTokenAddress).balanceOf(address(this));
        _withdrawERC20(amount);
    }

    /**
     * @dev Used to claim reward and do auto compound
     **/
    function harvestReward() external returns (uint256 tokenBal) {
        address[] memory assets = new address[](1);
        assets[0] = aTokenAddress;

        rewardsController.claimRewardsToSelf(
            assets,
            type(uint256).max,
            rewardToken
        );

        address _rewardToken = rewardToken;
        address _tokenAddress = tokenAddress;
        uint256 rewardBal = IERC20(_rewardToken).balanceOf(address(this));

        // reimburse function caller
        uint256 reimbursementAmt = harvestMaxGas * tx.gasprice;
        if (rewardBal > reimbursementAmt) {
            rewardBal -= reimbursementAmt;
            IERC20(_rewardToken).safeTransfer(msg.sender, reimbursementAmt);
        }

        if (_rewardToken != _tokenAddress) {
            _swapRewards(rewardBal);
        }

        tokenBal = IERC20(_tokenAddress).balanceOf(address(this));
        if (tokenBal > 0) {
            _depositERC20(tokenBal);
        }
    }

    // *************** //
    // *** GETTERS *** //
    // *************** //

    /**
     * @dev Get amount of underlying tokens
     **/
    function getTotalUnderlying(address)
        public
        view
        override
        returns (uint256 amount)
    {
        amount = IERC20(aTokenAddress).balanceOf(address(this));
    }

    /**
     * @dev Get IOU token address
     **/
    function getIouTokenAddress(address)
        external
        view
        returns (address iouToken)
    {
        iouToken = aTokenAddress;
    }

    /**
     * @dev Get available reward balance
     **/
    function getRewardBalance() external view returns (uint256 amount) {
        address[] memory aTokens = new address[](1);
        aTokens[0] = aTokenAddress;
        amount = rewardsController.getUserRewards(
            aTokens,
            address(this),
            rewardToken
        );
    }

    // ************************** //
    // *** MANAGER METHODS *** //
    // ************************** //

    function updateManager(address _manager) external onlyManager {
        require(
            _manager != address(0),
            "AaveV3Yield::updateManagerAddr: zero address"
        );
        manager = _manager;
    }

    function updateRouter(IUniswapRouter _router) external onlyManager {
        require(
            address(_router) != address(0),
            "AaveV3Yield::updateRouter: zero address"
        );
        address previousRouterAddr = address(router);
        if (previousRouterAddr != address(0)) {
            IERC20(rewardToken).approve(previousRouterAddr, 0);
        }
        router = _router;
        if (address(_router) != address(0)) {
            IERC20(rewardToken).approve(address(_router), type(uint256).max);
        }
    }

    function updateBackupRouter(IUniswapRouter _router) external onlyManager {
        require(
            address(_router) != address(0),
            "AaveV3Yield::updateBackupRouter: zero address"
        );
        address previousRouterAddr = address(backupRouter);
        if (previousRouterAddr != address(0)) {
            IERC20(rewardToken).approve(previousRouterAddr, 0);
        }
        backupRouter = _router;
        if (address(_router) != address(0)) {
            IERC20(rewardToken).approve(address(_router), type(uint256).max);
        }
    }

    function updateRoute(address[] memory _route) external onlyManager {
        require(
            _route[0] == rewardToken &&
                _route[_route.length - 1] == tokenAddress,
            "AaveV3Yield::updateRoute: incorrect route"
        );
        route = _route;
    }

    function updateHarvestGas(uint256 _gas) external onlyManager {
        harvestMaxGas = _gas;
    }

    function updateRewardToken(address _rewardToken) external onlyManager {
        uint256 distributionEnd = rewardsController.getDistributionEnd(
            aTokenAddress,
            _rewardToken
        );
        require(
            distributionEnd != 0 && distributionEnd > block.timestamp,
            "AaveV3Yield::updateRewardToken: invalid reward token"
        );
        rewardToken = _rewardToken;
    }

    function transferERC20(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external onlyManager {
        require(
            address(_token) != address(aTokenAddress) ||
                address(_token) != address(tokenAddress),
            "AaveV3Yield/forbid-aToken-transfer"
        );
        _token.safeTransfer(_to, _amount);
    }

    // ************************** //
    // *** INTERNAL FUNCTIONS *** //
    // ************************** //

    function _depositERC20(uint256 _amount) internal {
        aavePool.supply(tokenAddress, _amount, address(this), referralCode);
    }

    function _withdrawERC20(uint256 _amount) internal returns (uint256 amount) {
        amount = aavePool.withdraw(tokenAddress, _amount, yolo);
    }

    function _maxApprove(address _token, address _aToken) internal {
        IERC20(_token).safeApprove(address(aavePool), type(uint256).max);
        IERC20(_aToken).safeApprove(address(aavePool), type(uint256).max);
    }

    function _swapRewards(uint256 _amount) internal {
        try
            router.swapExactTokensForTokens(
                _amount,
                0,
                route,
                address(this),
                block.timestamp
            )
        {} catch {
            backupRouter.swapExactTokensForTokens(
                _amount,
                0,
                route,
                address(this),
                block.timestamp
            );
        }
    }
}
