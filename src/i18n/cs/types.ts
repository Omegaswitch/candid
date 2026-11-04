/** Czech plural categories (Intl.PluralRules("cs")): 1 úkol, 2–4 úkoly, 1,5 úkolu, 5+ úkolů. */
export type CzechPlural = { one: string; few: string; many: string; other: string };

/**
 * The shape a translation must have: the English namespace with every string kept as a string,
 * and every `{ one, other }` plural object widened to Czech's four forms. Used as the declared
 * type of each cs namespace, so a missing key, an extra key or a missing plural form is a type error.
 */
export type Localized<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Localized<U>[]
    : T extends { one: string; other: string }
      ? [Exclude<keyof T, "one" | "other">] extends [never]
        ? CzechPlural
        : { [K in keyof T]: Localized<T[K]> }
      : { [K in keyof T]: Localized<T[K]> };
