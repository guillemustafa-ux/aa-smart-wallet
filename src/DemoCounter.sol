// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DemoCounter — target trivial para demostrar una acción gasless
/// @author guillemustafa-ux
/// @notice Contador simple. La dApp hace que una `MinimalAccount` con 0 ETH llame
///         `increment()` a través de una UserOperation patrocinada por un Paymaster.
///         `msg.sender` será la smart account, no el EOA del usuario.
contract DemoCounter {
    /// @notice Cantidad de incrementos por cuenta llamante.
    mapping(address => uint256) public countOf;

    /// @notice Total global de incrementos.
    uint256 public total;

    event Incremented(address indexed caller, uint256 newCountForCaller, uint256 newTotal);

    function increment() external {
        countOf[msg.sender] += 1;
        total += 1;
        emit Incremented(msg.sender, countOf[msg.sender], total);
    }
}
