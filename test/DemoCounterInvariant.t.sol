// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {DemoCounter} from "../src/DemoCounter.sol";

/// @dev Handler con actores fijos que llaman increment() en secuencias aleatorias.
contract DemoCounterHandler is Test {
    DemoCounter public counter;
    address[] internal actors;

    constructor(DemoCounter _counter) {
        counter = _counter;
        for (uint256 i = 0; i < 5; i++) {
            actors.push(makeAddr(string(abi.encodePacked("counterActor", i))));
        }
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function increment(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        vm.prank(actor);
        counter.increment();
    }
}

/// @title Invariant test — DemoCounter: el total siempre es la suma de los individuales
/// @notice Propiedad de contabilidad simple pero real: tras cualquier secuencia de
///         `increment()` desde distintas cuentas, `total` DEBE ser exactamente la
///         suma de `countOf(actor)` de todos los que llamaron. Si alguna vez un
///         incremento actualizara uno sin el otro (p. ej. por un early return mal
///         puesto en un refactor futuro), este invariante lo detecta.
contract DemoCounterInvariantTest is StdInvariant, Test {
    DemoCounter internal counter;
    DemoCounterHandler internal handler;

    function setUp() public {
        counter = new DemoCounter();
        handler = new DemoCounterHandler(counter);
        targetContract(address(handler));
    }

    function invariant_TotalEqualsSumOfIndividualCounts() public view {
        uint256 sum = 0;
        uint256 n = handler.actorsLength();
        for (uint256 i = 0; i < n; i++) {
            sum += counter.countOf(handler.actorAt(i));
        }
        assertEq(sum, counter.total(), "total no coincide con la suma de counts individuales");
    }
}
