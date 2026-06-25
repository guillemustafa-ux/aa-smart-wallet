// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_SUCCESS, SIG_VALIDATION_FAILED} from "@account-abstraction/contracts/core/Helpers.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title MinimalAccount — cuenta inteligente ERC-4337 (account abstraction)
/// @author guillemustafa-ux
/// @notice Una "smart wallet" mínima controlada por un único `owner` (un EOA que firma).
///         En vez de mandar transacciones normales, el owner firma `UserOperation`s que
///         un Bundler entrega al EntryPoint; el EntryPoint llama acá a `validateUserOp`
///         y, si la firma es válida, ejecuta la acción vía `execute`.
/// @dev    Hereda de `BaseAccount` (de eth-infinitism), que ya implementa el envoltorio
///         de `validateUserOp` (chequea que venga del EntryPoint, valida la firma, valida
///         el nonce y paga el prefund). Acá solo se completan las dos piezas propias:
///         de dónde sale el EntryPoint (`entryPoint()`) y cómo se valida la firma
///         (`_validateSignature`). El gas puede pagarlo un Paymaster (flujo "gasless").
contract MinimalAccount is BaseAccount {
    using MessageHashUtils for bytes32;

    /// @notice EntryPoint singleton de ERC-4337 con el que opera esta cuenta.
    IEntryPoint private immutable i_entryPoint;

    /// @notice EOA dueño de la cuenta: el único que puede firmar UserOps válidas
    ///         y el único que puede llamar `execute` directamente (sin pasar por el EntryPoint).
    address public immutable owner;

    error MinimalAccount__NotFromEntryPointOrOwner();
    error MinimalAccount__CallFailed(bytes result);
    error MinimalAccount__WrongArrayLengths();

    /// @dev Permite la llamada solo desde el EntryPoint (UserOp) o desde el owner (uso directo).
    modifier requireFromEntryPointOrOwner() {
        if (msg.sender != address(i_entryPoint) && msg.sender != owner) {
            revert MinimalAccount__NotFromEntryPointOrOwner();
        }
        _;
    }

    /// @param anEntryPoint EntryPoint v0.7 canónico de la red.
    /// @param anOwner      EOA dueño/firmante de esta cuenta.
    constructor(address anEntryPoint, address anOwner) {
        i_entryPoint = IEntryPoint(anEntryPoint);
        owner = anOwner;
    }

    /// @notice Permite recibir ETH (p. ej. para fondear el prefund o el saldo de la cuenta).
    receive() external payable {}

    /// @inheritdoc BaseAccount
    function entryPoint() public view override returns (IEntryPoint) {
        return i_entryPoint;
    }

    /// @notice Valida que la `UserOperation` esté firmada por el `owner`.
    /// @dev    El firmante off-chain firma el `userOpHash` con el prefijo EIP-191
    ///         (personal_sign). Acá se reconstruye ese hash y se recupera el firmante.
    /// @return 0 (SIG_VALIDATION_SUCCESS) si la firma es del owner, 1 (SIG_VALIDATION_FAILED) si no.
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        view
        override
        returns (uint256)
    {
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        address recovered = ECDSA.recover(ethSignedHash, userOp.signature);
        if (recovered != owner) {
            return SIG_VALIDATION_FAILED;
        }
        return SIG_VALIDATION_SUCCESS;
    }

    /// @notice Ejecuta una llamada arbitraria desde la cuenta (el corazón de la wallet).
    /// @param dest  contrato/destino a llamar.
    /// @param value ETH a enviar en la llamada.
    /// @param func  calldata de la llamada.
    function execute(address dest, uint256 value, bytes calldata func)
        external
        requireFromEntryPointOrOwner
    {
        (bool ok, bytes memory result) = dest.call{value: value}(func);
        if (!ok) {
            revert MinimalAccount__CallFailed(result);
        }
    }

    /// @notice Ejecuta varias llamadas en una sola UserOp (batching).
    function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func)
        external
        requireFromEntryPointOrOwner
    {
        if (dest.length != func.length || dest.length != value.length) {
            revert MinimalAccount__WrongArrayLengths();
        }
        for (uint256 i = 0; i < dest.length; i++) {
            (bool ok, bytes memory result) = dest[i].call{value: value[i]}(func[i]);
            if (!ok) {
                revert MinimalAccount__CallFailed(result);
            }
        }
    }

    /// @notice Saldo que esta cuenta tiene depositado en el EntryPoint (para pagar gas).
    function getDeposit() external view returns (uint256) {
        return i_entryPoint.balanceOf(address(this));
    }

    /// @notice Deposita ETH en el EntryPoint a nombre de esta cuenta.
    function addDeposit() external payable {
        i_entryPoint.depositTo{value: msg.value}(address(this));
    }
}
