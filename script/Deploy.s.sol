// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {DemoCounter} from "../src/DemoCounter.sol";

/// @title Deploy — despliega AccountFactory + DemoCounter (Sepolia)
/// @notice No se despliega EntryPoint: se usa el singleton v0.7 canónico ya desplegado.
///         Corré:
///           forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify -vvvv
/// @dev `vm.envOr` permite overridear el EntryPoint sin tocar el código.
contract Deploy is Script {
    /// @dev EntryPoint v0.7 canónico (misma dirección en todas las redes, incl. Sepolia).
    address constant ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external returns (AccountFactory factory, DemoCounter counter) {
        // Acepta PRIVATE_KEY con o sin prefijo "0x".
        string memory pkStr = vm.envString("PRIVATE_KEY");
        if (bytes(pkStr).length == 64) {
            pkStr = string.concat("0x", pkStr);
        }
        uint256 pk = vm.parseUint(pkStr);

        address entryPoint = vm.envOr("ENTRYPOINT", ENTRYPOINT_V07);

        vm.startBroadcast(pk);
        factory = new AccountFactory(entryPoint);
        counter = new DemoCounter();
        vm.stopBroadcast();

        console.log("EntryPoint     :", entryPoint);
        console.log("AccountFactory :", address(factory));
        console.log("DemoCounter    :", address(counter));
        console.log("Pega estas address en frontend/dapp/src/lib/aa.ts y en el README.");
    }
}
