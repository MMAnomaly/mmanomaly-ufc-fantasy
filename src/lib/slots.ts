export const CLASS_TO_SLOT = {
  mens_flyweight: "MEN_FLYWEIGHT",
  mens_bantamweight: "MEN_BANTAMWEIGHT",
  mens_featherweight: "MEN_FEATHERWEIGHT",
  mens_lightweight: "MEN_LIGHTWEIGHT",
  mens_welterweight: "MEN_WELTERWEIGHT",
  mens_middleweight: "MEN_MIDDLEWEIGHT",
  mens_light_heavyweight: "MEN_LIGHT_HEAVYWEIGHT",
  mens_heavyweight: "MEN_HEAVYWEIGHT",
  womens_strawweight: "WOMEN_STRAWWEIGHT",
  womens_flyweight: "WOMEN_FLYWEIGHT",
  womens_bantamweight: "WOMEN_BANTAMWEIGHT",
} as const;

export type ClassKey = keyof typeof CLASS_TO_SLOT;
export type PositionalSlot = (typeof CLASS_TO_SLOT)[ClassKey];
export type FlexSlot = "FLEX_1" | "FLEX_2";
export type RosterSlotKey = PositionalSlot | FlexSlot;

export const POSITIONAL_SLOTS: PositionalSlot[] = [
  "MEN_FLYWEIGHT",
  "MEN_BANTAMWEIGHT",
  "MEN_FEATHERWEIGHT",
  "MEN_LIGHTWEIGHT",
  "MEN_WELTERWEIGHT",
  "MEN_MIDDLEWEIGHT",
  "MEN_LIGHT_HEAVYWEIGHT",
  "MEN_HEAVYWEIGHT",
  "WOMEN_STRAWWEIGHT",
  "WOMEN_FLYWEIGHT",
  "WOMEN_BANTAMWEIGHT",
];

export const FLEX_SLOTS: FlexSlot[] = ["FLEX_1", "FLEX_2"];
export const ALL_SLOTS: RosterSlotKey[] = [...POSITIONAL_SLOTS, ...FLEX_SLOTS];
export const ROSTER_SIZE = ALL_SLOTS.length;

export const SLOT_LABELS: Record<RosterSlotKey, string> = {
  MEN_FLYWEIGHT: "Men's Flyweight",
  MEN_BANTAMWEIGHT: "Men's Bantamweight",
  MEN_FEATHERWEIGHT: "Men's Featherweight",
  MEN_LIGHTWEIGHT: "Men's Lightweight",
  MEN_WELTERWEIGHT: "Men's Welterweight",
  MEN_MIDDLEWEIGHT: "Men's Middleweight",
  MEN_LIGHT_HEAVYWEIGHT: "Men's Light Heavyweight",
  MEN_HEAVYWEIGHT: "Men's Heavyweight",
  WOMEN_STRAWWEIGHT: "Women's Strawweight",
  WOMEN_FLYWEIGHT: "Women's Flyweight",
  WOMEN_BANTAMWEIGHT: "Women's Bantamweight",
  FLEX_1: "Flex 1",
  FLEX_2: "Flex 2",
};

export const SLOT_SHORT: Record<RosterSlotKey, string> = {
  MEN_FLYWEIGHT: "M FLY",
  MEN_BANTAMWEIGHT: "M BW",
  MEN_FEATHERWEIGHT: "M FW",
  MEN_LIGHTWEIGHT: "M LW",
  MEN_WELTERWEIGHT: "M WW",
  MEN_MIDDLEWEIGHT: "M MW",
  MEN_LIGHT_HEAVYWEIGHT: "M LHW",
  MEN_HEAVYWEIGHT: "M HW",
  WOMEN_STRAWWEIGHT: "W SW",
  WOMEN_FLYWEIGHT: "W FLY",
  WOMEN_BANTAMWEIGHT: "W BW",
  FLEX_1: "FLEX",
  FLEX_2: "FLEX",
};

export const CLASS_LABELS: Record<ClassKey, string> = {
  mens_flyweight: "Flyweight",
  mens_bantamweight: "Bantamweight",
  mens_featherweight: "Featherweight",
  mens_lightweight: "Lightweight",
  mens_welterweight: "Welterweight",
  mens_middleweight: "Middleweight",
  mens_light_heavyweight: "Light Heavyweight",
  mens_heavyweight: "Heavyweight",
  womens_strawweight: "Women's Strawweight",
  womens_flyweight: "Women's Flyweight",
  womens_bantamweight: "Women's Bantamweight",
};

export function isFlexSlot(slot: string): slot is FlexSlot {
  return slot === "FLEX_1" || slot === "FLEX_2";
}

export function isRosterSlot(slot: string): slot is RosterSlotKey {
  return (ALL_SLOTS as string[]).includes(slot);
}

export function fighterFitsSlot(slotKey: string, slot: string): boolean {
  if (isFlexSlot(slot)) return true;
  return slotKey === slot;
}

export function classKeyToSlot(classKey: string): PositionalSlot | null {
  if (classKey in CLASS_TO_SLOT) {
    return CLASS_TO_SLOT[classKey as ClassKey];
  }
  return null;
}
