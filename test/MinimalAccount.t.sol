// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {MinimalAccount} from "../src/MinimalAccount.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {DemoCounter} from "../src/DemoCounter.sol";

/// @notice Tests de la smart wallet ERC-4337: validación de firma, control de acceso,
///         e integración real haciendo recorrer un UserOp por EntryPoint.handleOps.
contract MinimalAccountTest is Test {
    using MessageHashUtils for bytes32;

    EntryPoint internal entryPoint;
    AccountFactory internal factory;
    DemoCounter internal counter;
    MinimalAccount internal account;

    uint256 internal ownerKey;
    address internal owner;
    address internal beneficiary;

    function setUp() public {
        entryPoint = new EntryPoint();
        factory = new AccountFactory(address(entryPoint));
        counter = new DemoCounter();

        ownerKey = 0xA11CE;
        owner = vm.addr(ownerKey);
        beneficiary = makeAddr("beneficiary");

        account = factory.createAccount(owner, 0);
        // En tests no usamos Paymaster, así que la cuenta paga su propio prefund.
        vm.deal(address(account), 1 ether);
    }

    // ------------------------------------------------------------------ helpers

    /// @dev Empaqueta dos uint128 en un bytes32 (formato de accountGasLimits / gasFees en v0.7).
    function _pack(uint128 high, uint128 low) internal pure returns (bytes32) {
        return bytes32((uint256(high) << 128) | uint256(low));
    }

    function _incrementCallData() internal view returns (bytes memory) {
        return abi.encodeCall(MinimalAccount.execute, (address(counter), 0, abi.encodeCall(DemoCounter.increment, ())));
    }

    function _buildUserOp(bytes memory callData) internal view returns (PackedUserOperation memory op) {
        op = PackedUserOperation({
            sender: address(account),
            nonce: entryPoint.getNonce(address(account), 0),
            initCode: hex"",
            callData: callData,
            accountGasLimits: _pack(uint128(300_000), uint128(300_000)), // verificación, ejecución
            preVerificationGas: 100_000,
            gasFees: _pack(uint128(1 gwei), uint128(1 gwei)), // maxPriority, maxFee
            paymasterAndData: hex"",
            signature: hex""
        });
    }

    function _sign(PackedUserOperation memory op, uint256 key) internal view returns (bytes memory) {
        bytes32 userOpHash = entryPoint.getUserOpHash(op);
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------- tests

    function test_FactoryIsDeterministic() public view {
        assertEq(factory.getAddress(owner, 0), address(account));
        assertEq(account.owner(), owner);
        assertEq(address(account.entryPoint()), address(entryPoint));
    }

    function test_ValidateUserOp_validSignature_returnsZero() public {
        PackedUserOperation memory op = _buildUserOp(_incrementCallData());
        op.signature = _sign(op, ownerKey);
        bytes32 userOpHash = entryPoint.getUserOpHash(op);

        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(op, userOpHash, 0);
        assertEq(validationData, 0);
    }

    function test_ValidateUserOp_badSignature_returnsOne() public {
        PackedUserOperation memory op = _buildUserOp(_incrementCallData());
        op.signature = _sign(op, 0xBADBAD); // firmante distinto del owner
        bytes32 userOpHash = entryPoint.getUserOpHash(op);

        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(op, userOpHash, 0);
        assertEq(validationData, 1);
    }

    function test_ValidateUserOp_revertsIfNotEntryPoint() public {
        PackedUserOperation memory op = _buildUserOp(_incrementCallData());
        op.signature = _sign(op, ownerKey);
        bytes32 userOpHash = entryPoint.getUserOpHash(op);

        vm.expectRevert(); // BaseAccount: "account: not from EntryPoint"
        account.validateUserOp(op, userOpHash, 0);
    }

    function test_Execute_directFromOwner() public {
        vm.prank(owner);
        account.execute(address(counter), 0, abi.encodeCall(DemoCounter.increment, ()));
        assertEq(counter.countOf(address(account)), 1);
    }

    function test_Execute_revertsFromStranger() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(MinimalAccount.MinimalAccount__NotFromEntryPointOrOwner.selector);
        account.execute(address(counter), 0, abi.encodeCall(DemoCounter.increment, ()));
    }

    /// @notice Integración end-to-end: el UserOp recorre EntryPoint.handleOps, el target
    ///         cambia de estado y el beneficiary (bundler) cobra el gas.
    function test_HandleOps_endToEnd_incrementsCounter() public {
        PackedUserOperation memory op = _buildUserOp(_incrementCallData());
        op.signature = _sign(op, ownerKey);

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;

        assertEq(counter.total(), 0);
        entryPoint.handleOps(ops, payable(beneficiary));

        assertEq(counter.countOf(address(account)), 1);
        assertEq(counter.total(), 1);
        assertGt(beneficiary.balance, 0); // el bundler cobró el gas
    }

    /// @notice Fuzz: cualquier firmante que no sea el owner debe fallar la validación.
    function testFuzz_ValidateUserOp_onlyOwnerSigns(uint256 wrongKey) public {
        wrongKey = bound(wrongKey, 1, type(uint128).max);
        vm.assume(vm.addr(wrongKey) != owner);

        PackedUserOperation memory op = _buildUserOp(_incrementCallData());
        op.signature = _sign(op, wrongKey);
        bytes32 userOpHash = entryPoint.getUserOpHash(op);

        vm.prank(address(entryPoint));
        assertEq(account.validateUserOp(op, userOpHash, 0), 1);
    }
}
