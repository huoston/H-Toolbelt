/// <reference path="../../node_modules/types-for-adobe/aftereffects/24.6/index.d.ts" />

// The After Effects API declarations, loaded here rather than through a tsconfig
// `types` entry so that *any* program including these host sources picks them
// up — both the host's own type-check and the UI build, which pulls
// `src/jsx/index.ts` in for the `Scripts` type behind `@esTypes`.
//
// Until v0.1.0 the host loaded no AE types at all: `app`, `CompItem`, `Layer`
// and friends resolved to nothing, so every host file was effectively unchecked
// even before TS5108 stopped the check from running at all.
//
// 24.6 is the newest set vendored by types-for-adobe. It is a superset of what
// CC 2019 exposes, so it will type-check calls an older host lacks; the CC 2019
// floor is a runtime promise enforced by the manifest range, not by these
// declarations.

//@ts-ignore
declare var JSON: {
  stringify(object: object): string;
  parse(string: string): object;
};
