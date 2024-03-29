// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract Treasury is Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    function initialize(address _admin) external initializer {
        __Ownable_init();
        super.transferOwnership(_admin);
    }

    /**
        @notice Allows to withdraw native token. Only callable by the owner.
        @param amount The amount of token to withdraw
        @param receiver The address of the receiver
     */
    function withdrawNativeToken(uint256 amount, address payable receiver)
        external
        onlyOwner
    {
        _safeTransferETH(receiver, amount);
    }

    /**
        @notice Allows to withdraw tokens. Only callable by the owner.
        @param tokens Array of token addresses
        @param amounts Array of amounts of each token
        @param receivers Address of each token receiver
     */
    function withdrawTokens(
        IERC20Upgradeable[] memory tokens,
        uint256[] memory amounts,
        address[] memory receivers
    ) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            tokens[i].safeTransfer(receivers[i], amounts[i]);
        }
    }

    /**
        @notice Allows the owner to make arbitary call.
        @param target The contract to call
        @param data The calldata
     */
    function call(address payable target, bytes calldata data)
        external
        onlyOwner
    {
        (bool success, ) = target.call{value: 0}(data);
        require(success, "CALL_FAILED");
    }

    /**
     * @dev Transfer ETH to the address, revert if it fails.
     */
    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    /// @notice receive ETH
    receive() external payable {}
}
