// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MinimalAccount} from "./MinimalAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/// @title AccountFactory — fábrica determinística de MinimalAccount (CREATE2)
/// @author guillemustafa-ux
/// @notice Crea una `MinimalAccount` por (owner, salt) en una dirección PREDECIBLE.
///         Esto habilita el patrón "counterfactual" de ERC-4337: la dApp conoce la
///         dirección de la cuenta ANTES de desplegarla, y el EntryPoint la despliega
///         de forma lazy en la primera UserOperation (vía el `initCode`).
/// @dev    `getAddress` y `createAccount` usan el MISMO bytecode + args + salt, así que
///         la dirección que calcula `getAddress` es exactamente la que se despliega.
contract AccountFactory {
    /// @notice EntryPoint con el que se construyen todas las cuentas de esta fábrica.
    IEntryPoint public immutable entryPoint;

    event AccountCreated(address indexed account, address indexed owner, uint256 salt);

    constructor(address anEntryPoint) {
        entryPoint = IEntryPoint(anEntryPoint);
    }

    /// @notice Despliega (o devuelve, si ya existe) la cuenta de `owner` para ese `salt`.
    /// @dev    Idempotente: si ya hay código en la dirección predicha, no re-despliega.
    function createAccount(address owner, uint256 salt) external returns (MinimalAccount account) {
        address predicted = getAddress(owner, salt);
        if (predicted.code.length > 0) {
            return MinimalAccount(payable(predicted));
        }
        account = new MinimalAccount{salt: bytes32(salt)}(address(entryPoint), owner);
        emit AccountCreated(address(account), owner, salt);
    }

    /// @notice Calcula la dirección counterfactual de la cuenta de `owner` para `salt`.
    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes memory bytecode =
            abi.encodePacked(type(MinimalAccount).creationCode, abi.encode(address(entryPoint), owner));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(salt), keccak256(bytecode)));
        return address(uint160(uint256(hash)));
    }
}
