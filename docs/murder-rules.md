# Murder Darts Rules

Murder is a two-team darts game about opening scoring targets, exploiting open targets for points, and closing the other team's targets before they pull away.

## Teams And Turns

- Two teams compete.
- Teams alternate turns.
- Each turn consists of the darts thrown by the active team.

## Targets

The game uses 23 scoring targets:

- Numbers `1` through `20`
- Doubles ring, meaning any double
- Trebles ring, meaning any treble
- Bulls

## Hits

A target needs three hits from a team to become open for that team.

Hits can come from singles, doubles, or trebles. For doubles and trebles, the throwing team chooses which target the dart applies to:

- A single can count as `1` hit.
- A double can count as `2` hits on its number target, or `1` hit on Doubles.
- A treble can count as `3` hits on its number target, or `1` hit on Trebles.
- For bulls, single bull counts as `1` hit and double bull counts as `2` hits.

Example: hitting `T20` can count as `3` hits on `20`, or `1` hit on Trebles.

## Opening A Target

A target is open for a team when that team reaches three hits on it.

Once open, that team can score points on the target until the opposing team also reaches three hits on the same target.

## Closing A Target

The opposing team closes an open target by reaching three hits on that same target.

When both teams have three hits on a target, the target is closed and no team can score on it again.

## Scoring

Once a target is open for a team and not closed, that team may score points on hits to that target.

Points scored equal the board value hit.

Examples:

- If `20` is open for Team A, `S20` scores `20` points for Team A.
- If `20` is open for Team A, `T20` scores `60` points for Team A.
- Scoring continues until Team B closes `20`.

## Winning

The game ends once all 23 targets are closed.

The team with the highest total score wins.

## Strategic Choice

Because a team can choose which target a double or treble applies to, each dart can create a tactical decision:

- Build progress on a number target.
- Build progress on the Doubles or Trebles target instead.
- Use a high-value hit for points once the chosen target is already open.

## Version 1 App Interpretations

The first app version uses these locked interpretations:

- A dart is assigned to exactly one target: a number, Doubles, Trebles, or Bulls.
- Doubles and trebles multiply hits only when assigned to their number target: `D20` is `2` hits on `20`, while `T20` is `3` hits on `20`. Assigned to Doubles or Trebles, they count as `1` ring hit.
- Bulls score `25` for single bull and `50` for double bull once open.
- A dart only scores if the chosen target was already open before that dart.
- Each turn consists of three dart entries.
- Misses consume a dart and add no hits or points.
- A hit on a closed target consumes the dart but adds no hits or points.

