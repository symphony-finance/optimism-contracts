// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface IRewardsController {
    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to,
        address reward
    ) external returns (uint256);

    function claimRewardsToSelf(
        address[] calldata assets,
        uint256 amount,
        address reward
    ) external returns (uint256);

    function getUserRewards(
        address[] calldata assets,
        address user,
        address reward
    ) external view returns (uint256);

    function getDistributionEnd(address asset, address reward)
        external
        view
        returns (uint256);
}
