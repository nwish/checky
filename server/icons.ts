// Kept in sync with src/icons.ts's CHECKLIST_ICONS list. A fixed, curated set rather than
// free text: keeps the pickers sane and rejects anything unknown. Used for checklist icons
// and user avatars.
const ICONS = [
  'Waves', 'Sailboat', 'Anchor', 'Fish', 'Droplet',
  'Tent', 'Mountain', 'Trees', 'Palmtree', 'Compass', 'Backpack', 'Snowflake', 'Sun', 'Flame',
  'Dumbbell', 'Bike',
  'Car', 'Plane', 'Luggage',
  'Home', 'Wrench', 'Hammer', 'Tractor', 'PaintRoller', 'Scissors', 'Package', 'ShoppingCart',
  'UtensilsCrossed', 'Coffee', 'Wine',
  'Briefcase', 'Book', 'Music', 'Camera', 'Baby', 'Dog', 'Heart', 'Stethoscope', 'Sparkles', 'Shirt',
  'ListChecks'
]

export const ICON_SET = new Set(ICONS)
