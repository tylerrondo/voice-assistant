# Map Channel Migration — Phase 5, slice 2

## Source inspection

The source of truth is `Guseyn9/taxi`, branch `main`. The existing Taxi implementation already has a map interaction boundary in:

- `taxi/src/platform/map-channel/MapChannel.ts`
- `taxi/src/platform/map-channel/MapMapper.ts`
- `taxi/src/platform/map-channel/map-channel-protocol.ts`
- `taxi/src/platform/platform-interface/surfaces/map/MapSurface.ts`

The interaction vocabulary for selecting an order is `driver.order.select` → `driver.order.selected`. The Taxi UI, Leaflet rendering, routing and backend adapters are application-specific and must not be copied into Platform Core.

## Completed in Platform Core

1. Added the replaceable map channel in `packages/map`, with no React, Leaflet or Taxi backend dependency.
2. Preserved raw order IDs as non-empty strings or finite numbers, including leading-zero strings and numeric zero.
3. Added contract coverage for invalid input, observer cleanup, and raw ID preservation.
4. Added Scenario Engine + Execution Log + Verification Harness coverage for the selected-event path and numeric IDs.
5. Added explicit verification coverage that blank, null, undefined, NaN and infinite IDs do not dispatch an Action or produce an Execution Log entry.

## Remaining migration work

- Connect map-channel execution to the interactive Validation Bench UI; the current tests exercise the platform components in-process and are not a browser-level Bench integration.
- Run CI and inspect a real Validation Bench execution report before marking Phase 5 complete.
- Integrate actual map rendering only in a separate application-level change; do not add Leaflet or Taxi backend dependencies to Platform Core.

## Validation Bench scenario fixture

The uploadable fixture is `scenarios/map-order-selection.json`. It uses the existing ScenarioSet v1 contract and checks `driver.order.select` → `driver.order.selected` while preserving string order ID `00123`. The fixture validates the scenario contract; it does not replace a live Taxi UI/backend end-to-end test.

## Raw order ID compatibility

Taxi's `b_id` can arrive as either a string or a number. The platform mapper accepts finite numbers and non-empty strings, preserving the original type and value. It rejects blank strings, non-finite numbers, `null`, and `undefined`. Do not stringify IDs at the channel boundary; application adapters may perform domain-specific normalization only where explicitly required.
