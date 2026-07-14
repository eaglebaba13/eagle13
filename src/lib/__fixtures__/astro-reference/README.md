# Astro Reference Fixtures (Phase 21.0B)

Immutable, human-captured reference data used only by the read-only Phase 21.0B
astronomy audit. **These fixtures are NOT consumed by any production code path
(live / backtest / replay / decision / signal / options / broker).**

## Sources

Fixtures should be captured manually from at least one of:

- Swiss Ephemeris (`swisseph` on a workstation, Lahiri / Chitrapaksha)
- Drik Panchang — https://www.drikpanchang.com/planet/position/planetary-positions-sidereal.html
- MPanchang — https://mpanchang.com/planets/ephemeris/
- Prokerala Panchang — https://www.prokerala.com/astrology/panchang/aaj-ka-panchang.html

Each fixture must record which engine, ayanamsha, node mode, and Moon
convention produced its values so downstream comparisons stay unambiguous.

## Rules

1. Do NOT auto-generate fixtures from the EagleBaba engine — that produces a
   self-consistent tautology.
2. Do NOT modify a captured fixture. If a reference value is wrong, add a new
   fixture with an incremented `fixtureVersion`.
3. One fixture = one instant. Do not merge multiple timestamps.
4. Node mode (`mean` vs `true`) and Moon convention (`geocentric` vs
   `topocentric`) must be filled in. Missing conventions trigger the
   `CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE` verdict, per Phase 21.0B
   stop conditions.
5. The `example.json` template is a schema example only and is skipped by
   the audit runner (fixtureVersion starts with `example-`).

## Location

Default audit location — Mumbai, India:

- Latitude: 19.0760° N
- Longitude: 72.8777° E
- Elevation: 14 m
- Timezone: Asia/Kolkata (UTC+5:30)
