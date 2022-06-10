// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IHandler.sol";
import {IUniswapV3Router as IUniswapRouter} from "../interfaces/uniswap/IUniswapV3Router.sol";

/// @notice Uniswap V3 Handler used to execute an order
contract UniswapHandler is IHandler {
    using SafeERC20 for IERC20;

    IUniswapRouter internal immutable uniswapRouter;
    address public immutable WETH;
    address public immutable yolo;

    /**
     * @param _router - Address of the Uniswap V3 router
     * @param _yolo - Address of YOLO contract
     */
    constructor(
        IUniswapRouter _router,
        address _weth,
        address _yolo
    ) {
        uniswapRouter = _router;
        WETH = _weth;
        yolo = _yolo;
    }

    modifier onlyYolo() {
        require(
            msg.sender == yolo,
            "UniswapHandler: Only yolo contract can invoke this function"
        );
        _;
    }

    /**
     * @notice Handle an order execution
     */
    function handle(
        IOrderStructs.Order memory order,
        uint256 oracleAmount,
        bytes calldata extraData
    ) external override onlyYolo returns (uint256 actualAmtOut) {
        uint256 amountOutMin = oracleAmount <= order.stoplossAmount ||
            oracleAmount > order.minReturnAmount
            ? oracleAmount
            : order.minReturnAmount;

        actualAmtOut = _swap(order, amountOutMin, extraData);
    }

    function _swap(
        IOrderStructs.Order memory order,
        uint256 amountOutMin,
        bytes calldata extraData
    ) internal returns (uint256 returnAmount) {
        IERC20(order.inputToken).safeIncreaseAllowance(
            address(uniswapRouter),
            order.inputAmount
        );

        (uint24 poo1Fee, uint24 poo2Fee) = abi.decode(
            extraData,
            (uint24, uint24)
        );

        IUniswapRouter.ExactInputSingleParams memory singlePoolparams = IUniswapRouter
            .ExactInputSingleParams(
                order.inputToken,
                order.outputToken,
                poo1Fee,
                order.recipient,
                block.timestamp, // deadline
                order.inputAmount,
                amountOutMin,
                0 // sqrtPriceLimitX96
            );

        try uniswapRouter.exactInputSingle(singlePoolparams) returns (
            uint256 amountOut
        ) {
            returnAmount = amountOut;
        } catch {
            IUniswapRouter.ExactInputParams
                memory multiPoolParams = IUniswapRouter.ExactInputParams({
                    path: abi.encodePacked(
                        order.inputToken,
                        poo1Fee,
                        WETH,
                        poo2Fee,
                        order.outputToken
                    ),
                    recipient: order.recipient,
                    deadline: block.timestamp,
                    amountIn: order.inputAmount,
                    amountOutMinimum: amountOutMin
                });

            returnAmount = uniswapRouter.exactInput(multiPoolParams);
        }
    }
}
