export const ATTR_GROUPS = [
  { id: 'finishing', label: 'Finishing', attrs: [
    { key: 'closeShot', label: 'Close Shot' },
    { key: 'drivingLayup', label: 'Driving Layup' },
    { key: 'drivingDunk', label: 'Driving Dunk' },
    { key: 'standingDunk', label: 'Standing Dunk' },
    { key: 'postControl', label: 'Post Control' },
  ] },
  { id: 'shooting', label: 'Shooting', attrs: [
    { key: 'midRange', label: 'Mid-Range Shot' },
    { key: 'threePoint', label: 'Three-Point Shot' },
    { key: 'freeThrow', label: 'Free Throw' },
  ] },
  { id: 'playmaking', label: 'Playmaking', attrs: [
    { key: 'passAccuracy', label: 'Pass Accuracy' },
    { key: 'ballHandle', label: 'Ball Handle' },
    { key: 'speedWithBall', label: 'Speed With Ball' },
  ] },
  { id: 'defense', label: 'Defense', attrs: [
    { key: 'interiorDefense', label: 'Interior Defense' },
    { key: 'perimeterDefense', label: 'Perimeter Defense' },
    { key: 'steal', label: 'Steal' },
    { key: 'block', label: 'Block' },
  ] },
  { id: 'rebounding', label: 'Rebounding', attrs: [
    { key: 'offensiveRebound', label: 'Offensive Rebound' },
    { key: 'defensiveRebound', label: 'Defensive Rebound' },
  ] },
  { id: 'physicals', label: 'Physicals', attrs: [
    { key: 'speed', label: 'Speed' },
    { key: 'agility', label: 'Agility' },
    { key: 'strength', label: 'Strength' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'stamina', label: 'Stamina' },
  ] },
];

export const ATTRS = ATTR_GROUPS.flatMap(g => g.attrs.map(a => ({ ...a, group: g.id })));
export const ATTR_KEYS = ATTRS.map(a => a.key);
export const ATTR_LABEL = Object.fromEntries(ATTRS.map(a => [a.key, a.label]));
export const ATTR_MIN = 25;
export const ATTR_MAX = 99;

// [cap at 5'7", cap at 7'7", wingspan effect, weight effect]
export const CAP_RULES = {
  closeShot:        [86, 99,  2,  3],
  drivingLayup:     [99, 74,  2, -7],
  drivingDunk:      [72, 92,  4, -5],
  standingDunk:     [45, 99,  6,  6],
  postControl:      [58, 99,  2,  7],
  midRange:         [99, 84, -3, -2],
  threePoint:       [99, 80, -4, -3],
  freeThrow:        [99, 88,  0,  0],
  passAccuracy:     [99, 72,  0, -1],
  ballHandle:       [99, 54, -3, -5],
  speedWithBall:    [99, 52, -2, -8],
  interiorDefense:  [58, 99,  5,  7],
  perimeterDefense: [99, 70,  6, -4],
  steal:            [99, 68,  6, -2],
  block:            [48, 99,  9,  2],
  offensiveRebound: [58, 99,  4,  6],
  defensiveRebound: [62, 99,  4,  6],
  speed:            [99, 60,  0, -10],
  agility:          [99, 58,  0, -10],
  strength:         [58, 99,  0, 16],
  vertical:         [95, 72,  1, -9],
  stamina:          [99, 90,  0, -5],
};

export const HEIGHT_MIN = 67; // 5'7"
export const HEIGHT_MAX = 91; // 7'7"
export const BUILD_BUDGET = 1650;

export const BODY_TYPES = {
  Slim:     { torso: 0.86, limb: 0.84, shoulder: 0.94, belly: 0.0, caps: { strength: -6, speed: 2, agility: 2 } },
  Lean:     { torso: 0.93, limb: 0.92, shoulder: 0.99, belly: 0.0, caps: { strength: -3, agility: 1 } },
  Athletic: { torso: 1.0,  limb: 1.0,  shoulder: 1.04, belly: 0.0, caps: { vertical: 2 } },
  Muscular: { torso: 1.06, limb: 1.13, shoulder: 1.12, belly: 0.0, caps: { strength: 4, speed: -1, agility: -1 } },
  Stocky:   { torso: 1.14, limb: 1.08, shoulder: 1.03, belly: 0.12, caps: { strength: 6, speed: -3, agility: -3, vertical: -2 } },
};

const w = o => o;
export const POSITIONS = {
  PG: { name: 'Point Guard', short: 'PG', range: [67, 79], typical: 75,
    blurb: 'Floor general. Runs the offense, breaks down defenders, creates for everyone.',
    keys: ['passAccuracy', 'ballHandle', 'speedWithBall', 'threePoint'],
    weights: w({ closeShot: 1, drivingLayup: 2, drivingDunk: 1, standingDunk: 0.2, postControl: 0.3, midRange: 2, threePoint: 2.5, freeThrow: 1.2, passAccuracy: 3, ballHandle: 3, speedWithBall: 2.5, interiorDefense: 0.4, perimeterDefense: 2, steal: 1.5, block: 0.3, offensiveRebound: 0.3, defensiveRebound: 0.6, speed: 2, agility: 2, strength: 0.6, vertical: 1, stamina: 1 }) },
  SG: { name: 'Shooting Guard', short: 'SG', range: [72, 81], typical: 77,
    blurb: 'Primary scorer on the wing. Lives off movement, pull-ups and catch-and-shoot.',
    keys: ['threePoint', 'midRange', 'drivingLayup', 'perimeterDefense'],
    weights: w({ closeShot: 1.2, drivingLayup: 2, drivingDunk: 1.5, standingDunk: 0.3, postControl: 0.5, midRange: 2.5, threePoint: 3, freeThrow: 1.5, passAccuracy: 1.5, ballHandle: 2, speedWithBall: 1.8, interiorDefense: 0.5, perimeterDefense: 2.2, steal: 1.5, block: 0.5, offensiveRebound: 0.5, defensiveRebound: 0.8, speed: 1.8, agility: 1.8, strength: 0.8, vertical: 1.2, stamina: 1 }) },
  SF: { name: 'Small Forward', short: 'SF', range: [76, 83], typical: 79,
    blurb: 'Versatile wing. Scores at all three levels and guards multiple positions.',
    keys: ['drivingDunk', 'midRange', 'perimeterDefense', 'vertical'],
    weights: w({ closeShot: 1.5, drivingLayup: 2, drivingDunk: 2, standingDunk: 0.8, postControl: 1, midRange: 2, threePoint: 2, freeThrow: 1.2, passAccuracy: 1.2, ballHandle: 1.3, speedWithBall: 1.2, interiorDefense: 1, perimeterDefense: 2, steal: 1.3, block: 1, offensiveRebound: 1, defensiveRebound: 1.3, speed: 1.5, agility: 1.5, strength: 1.2, vertical: 1.5, stamina: 1 }) },
  PF: { name: 'Power Forward', short: 'PF', range: [78, 85], typical: 81,
    blurb: 'Physical frontcourt force. Rebounds, finishes through contact, protects the paint.',
    keys: ['closeShot', 'standingDunk', 'defensiveRebound', 'strength'],
    weights: w({ closeShot: 2.2, drivingLayup: 1.2, drivingDunk: 1.5, standingDunk: 2, postControl: 2, midRange: 1.5, threePoint: 1, freeThrow: 1, passAccuracy: 0.8, ballHandle: 0.6, speedWithBall: 0.5, interiorDefense: 2.2, perimeterDefense: 1, steal: 0.8, block: 2, offensiveRebound: 2, defensiveRebound: 2.5, speed: 0.9, agility: 0.8, strength: 2, vertical: 1.3, stamina: 1 }) },
  C: { name: 'Center', short: 'C', range: [80, 91], typical: 84,
    blurb: 'Anchor of the paint. Owns the glass, alters every shot, punishes mismatches.',
    keys: ['standingDunk', 'block', 'interiorDefense', 'defensiveRebound'],
    weights: w({ closeShot: 2.5, drivingLayup: 0.6, drivingDunk: 0.8, standingDunk: 2.8, postControl: 2.2, midRange: 0.8, threePoint: 0.6, freeThrow: 0.8, passAccuracy: 0.6, ballHandle: 0.3, speedWithBall: 0.3, interiorDefense: 3, perimeterDefense: 0.6, steal: 0.5, block: 3, offensiveRebound: 2.5, defensiveRebound: 3, speed: 0.6, agility: 0.5, strength: 2.5, vertical: 1.2, stamina: 1 }) },
};
export const POSITION_KEYS = Object.keys(POSITIONS);

export const COUNTRIES = ['United States', 'Canada', 'Australia', 'Serbia', 'France', 'Spain', 'Greece', 'Slovenia', 'Germany', 'Lithuania', 'Nigeria', 'Cameroon', 'Senegal', 'South Sudan', 'DR Congo', 'Brazil', 'Argentina', 'Dominican Republic', 'Puerto Rico', 'Bahamas', 'Jamaica', 'Mexico', 'United Kingdom', 'Italy', 'Turkey', 'Croatia', 'Montenegro', 'Latvia', 'Finland', 'Japan', 'China', 'Philippines', 'South Korea', 'New Zealand', 'Israel', 'Georgia', 'Ukraine', 'Austria', 'Sweden', 'Ghana', 'Mali'];

export const COLLEGES = ['Duke', 'Kentucky', 'Kansas', 'North Carolina', 'UCLA', 'Gonzaga', 'Villanova', 'Michigan State', 'Arizona', 'UConn', 'Baylor', 'Houston', 'Texas', 'Florida', 'Syracuse', 'Indiana', 'Georgetown', 'Memphis', 'Overtime Elite', 'G League Ignite', 'International', 'Straight from High School', 'Rucker Park, NY', 'Venice Beach, CA', 'Brooklyn, NY', 'Chicago, IL', 'Oakland, CA', 'Baltimore, MD', 'Compton, CA', 'Philadelphia, PA'];

export const SKIN_TONES = ['#f4d5bd', '#e8bf9f', '#d9a47f', '#c68b62', '#ad7349', '#8f5b37', '#76462a', '#5e3720', '#4a2a18', '#3a2012'];
export const HAIR_STYLES = ['Bald', 'Buzz Cut', 'Low Fade', 'Waves', 'High Top', 'Afro', 'Twists', 'Dreads', 'Cornrows', 'Man Bun', 'Mohawk', 'Curly Top'];
export const HAIR_COLORS = { Black: '#141010', 'Dark Brown': '#2e1d14', Brown: '#5a3a24', Blonde: '#c9a35b', Bleached: '#e8dfc4', Red: '#8e3a1e', Gray: '#8a8a8a', Neon: '#39ff14' };
export const FACIAL_HAIR = ['None', 'Stubble', 'Mustache', 'Goatee', 'Chin Strap', 'Full Beard', 'Big Beard'];
export const EYE_COLORS = { Brown: '#5a3418', 'Dark Brown': '#2f1a0c', Hazel: '#8a6a2e', Green: '#3f7a3a', Blue: '#3a6fb0', Gray: '#7c8a94', Amber: '#b8801d' };
export const TATTOO_SPOTS = ['Left Sleeve', 'Right Sleeve', 'Left Forearm', 'Right Forearm', 'Chest', 'Neck', 'Left Leg', 'Right Leg'];
export const JERSEY_COLORS = { Volt: '#39ff14', Black: '#141414', White: '#f2f2f2', Red: '#c8102e', Royal: '#1d4ed8', Purple: '#5b2a86', Gold: '#f2b705', Teal: '#008c8c', Orange: '#f26b1d', Navy: '#0c2340' };
export const SHOE_COLORS = { 'Triple Black': '#111111', 'Triple White': '#f2f2f2', Volt: '#39ff14', 'Bred Red': '#b3001b', 'Royal Blue': '#1d4ed8', 'Gold Rush': '#e3a400' };

export const FIRST_NAMES = ['Marcus', 'Jaylen', 'Tyrese', 'Darius', 'Malik', 'Andre', 'Caleb', 'Isaiah', 'Xavier', 'Devin', 'Luka', 'Nikola', 'Mateo', 'Kofi', 'Elijah', 'Jalen', 'Cam', 'Trey', 'Amari', 'Zion', 'Rafael', 'Kenji', 'Dante', 'Omari', 'Bryce', 'Theo', 'Silas', 'Khalil', 'Ezra', 'Quentin'];
export const LAST_NAMES = ['Reed', 'Carter', 'Okafor', 'Banks', 'Vasquez', 'Whitfield', 'Mensah', 'Holloway', 'Pierce', 'Grant', 'Novak', 'Ellison', 'Draper', 'Kingsley', 'Abara', 'Monroe', 'Sato', 'Delgado', 'Fontaine', 'Hayes', 'Brooks', 'Sterling', 'Mbeki', 'Castillo', 'Walker', 'Dupree', 'Ivanov', 'Lockett', 'Rhodes', 'Ashford'];
export const NICKNAMES = ['The Blur', 'Ice', 'Slim', 'Big Smooth', 'Cash', 'The Architect', 'Splash', 'Hammer', 'Silk', 'Wolf', 'Bucket', 'Showtime', 'The Wall', 'Flash', 'Mamba Jr', 'Skyhook', 'Clutch', 'Iso', 'Glass', 'Microwave'];

export const BADGE_CATEGORIES = [
  { id: 'finishing', label: 'Finishing' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'playmaking', label: 'Playmaking' },
  { id: 'defense', label: 'Defense' },
  { id: 'rebounding', label: 'Rebounding' },
  { id: 'physicals', label: 'General' },
];
export const BADGE_TIERS = ['Bronze', 'Silver', 'Gold', 'Hall of Fame', 'Legend'];
export const BADGE_TIER_STEPS = [0, 8, 15, 21, 25];

const b = (id, name, cat, desc, req, extra = {}) => ({ id, name, cat, desc, req, ...extra });
export const BADGES = [
  b('aerial_wizard', 'Aerial Wizard', 'finishing', 'Finishes alley-oops and putback dunks with more consistency.', [['drivingDunk', 70], ['vertical', 65]]),
  b('float_game', 'Float Game', 'finishing', 'Better touch on floaters and runners in the lane.', [['drivingLayup', 70]]),
  b('hook_specialist', 'Hook Specialist', 'finishing', 'Hook shots fall more often over defenders.', [['postControl', 68]]),
  b('layup_mixmaster', 'Layup Mixmaster', 'finishing', 'Euro-steps, cradles and reverses finish cleaner.', [['drivingLayup', 74]]),
  b('paint_prodigy', 'Paint Prodigy', 'finishing', 'Boosts close shots around the rim.', [['closeShot', 72]]),
  b('physical_finisher', 'Physical Finisher', 'finishing', 'Absorbs contact and still finishes the layup.', [['drivingLayup', 68], ['strength', 62]]),
  b('post_fade_phenom', 'Post Fade Phenom', 'finishing', 'Fadeaways and shimmies out of the post drop in.', [['postControl', 70], ['midRange', 70]]),
  b('post_powerhouse', 'Post Powerhouse', 'finishing', 'Backs defenders down with authority.', [['postControl', 64], ['strength', 72]]),
  b('posterizer', 'Posterizer', 'finishing', 'Higher chance to throw down contact dunks on defenders.', [['drivingDunk', 78], ['vertical', 68]]),
  b('rise_up', 'Rise Up', 'finishing', 'Standing dunks and posterizers under the basket.', [['standingDunk', 74]]),
  b('deadeye', 'Deadeye', 'shooting', 'Jump shots are less affected by contests.', [['threePoint', 73]]),
  b('limitless_range', 'Limitless Range', 'shooting', 'Extends shooting range well beyond the arc.', [['threePoint', 80]]),
  b('mini_marksman', 'Mini Marksman', 'shooting', 'Small guards shoot better over bigger defenders.', [['threePoint', 70]], { maxH: 76 }),
  b('set_shot_specialist', 'Set Shot Specialist', 'shooting', 'Deadly on stand-still catch-and-shoot jumpers.', [['midRange', 68], ['threePoint', 65]]),
  b('shifty_shooter', 'Shifty Shooter', 'shooting', 'Off-the-dribble and high-difficulty shots fall more.', [['midRange', 72], ['ballHandle', 70]]),
  b('ice_veins', 'Ice Veins', 'shooting', 'Free throws stay true in clutch moments.', [['freeThrow', 75]]),
  b('ankle_assassin', 'Ankle Assassin', 'playmaking', 'Dribble moves freeze defenders and cause ankle breakers.', [['ballHandle', 80], ['speedWithBall', 70]]),
  b('bail_out', 'Bail Out', 'playmaking', 'Passes out of jumps and layups are more accurate.', [['passAccuracy', 70]]),
  b('break_starter', 'Break Starter', 'playmaking', 'Launch long outlet passes after defensive rebounds.', [['passAccuracy', 60], ['defensiveRebound', 68]]),
  b('dimer', 'Dimer', 'playmaking', 'Teammates get a shot boost off your passes.', [['passAccuracy', 72]]),
  b('handles_for_days', 'Handles For Days', 'playmaking', 'Lose less energy chaining dribble moves.', [['ballHandle', 70], ['stamina', 72]]),
  b('lightning_launch', 'Lightning Launch', 'playmaking', 'Explosive first step on drives from the perimeter.', [['speedWithBall', 76]]),
  b('strong_handle', 'Strong Handle', 'playmaking', 'Keep your dribble through bumps and contact.', [['ballHandle', 68], ['strength', 58]]),
  b('unpluckable', 'Unpluckable', 'playmaking', 'Much harder to strip the ball from.', [['ballHandle', 74]]),
  b('versatile_visionary', 'Versatile Visionary', 'playmaking', 'Unlocks more types of passes for every situation.', [['passAccuracy', 76], ['ballHandle', 65]]),
  b('challenger', 'Challenger', 'defense', 'Perimeter shot contests are more effective.', [['perimeterDefense', 70]]),
  b('glove', 'Glove', 'defense', 'Better at stripping ball handlers and shooters.', [['steal', 74]]),
  b('interceptor', 'Interceptor', 'defense', 'Get hands on more passing lanes.', [['steal', 68]]),
  b('high_flying_denier', 'High-Flying Denier', 'defense', 'Chase-down and weak-side blocks from above the rim.', [['block', 72], ['vertical', 66]]),
  b('immovable_enforcer', 'Immovable Enforcer', 'defense', 'Stands ground against drives and post-ups.', [['interiorDefense', 68], ['strength', 70]]),
  b('off_ball_pest', 'Off-Ball Pest', 'defense', 'Makes it hard for shooters to get open.', [['perimeterDefense', 66], ['stamina', 65]]),
  b('on_ball_menace', 'On-Ball Menace', 'defense', 'Smothers ball handlers on the perimeter.', [['perimeterDefense', 74], ['agility', 65]]),
  b('paint_patroller', 'Paint Patroller', 'defense', 'Rim protection boost for blocks and contests.', [['block', 74], ['interiorDefense', 60]]),
  b('pick_dodger', 'Pick Dodger', 'defense', 'Navigate through screens with ease.', [['perimeterDefense', 68], ['agility', 62]]),
  b('post_lockdown', 'Post Lockdown', 'defense', 'Shut down post scorers on the block.', [['interiorDefense', 72]]),
  b('boxout_beast', 'Boxout Beast', 'rebounding', 'Wins positioning battles for boards.', [['defensiveRebound', 70], ['strength', 62]]),
  b('rebound_chaser', 'Rebound Chaser', 'rebounding', 'Tracks down missed shots from farther away.', [['offensiveRebound', 70], ['defensiveRebound', 65]]),
  b('brick_wall', 'Brick Wall', 'physicals', 'Screens are punishing; drains opponents’ energy.', [['strength', 75]]),
  b('slippery_off_ball', 'Slippery Off-Ball', 'physicals', 'Slips through traffic when moving without the ball.', [['speed', 72], ['agility', 70]]),
  b('pogo_stick', 'Pogo Stick', 'physicals', 'Jump again quickly after landing.', [['vertical', 75]]),
  b('relentless', 'Relentless', 'physicals', 'Energy recovers faster during stoppages.', [['stamina', 85]]),
];

// preview: parameters consumed by the 3D animation player
const a = (id, name, desc, req = {}, preview = {}) => ({ id, name, desc, req, preview });
export const ANIMATIONS = {
  jumpShot: { label: 'Jump Shot', clip: 'jumpShot', items: [
    a('standard', 'Standard Set', 'Balanced, repeatable mechanics.', {}, { speed: 1, set: 1.0 }),
    a('quick_trigger', 'Quick Trigger', 'Fast, compact release.', { attrs: { threePoint: 70 }, maxH: 81 }, { speed: 1.35, set: 0.95 }),
    a('splash_release', 'Splash Release', 'Lightning-quick one-motion jumper with a low set point.', { attrs: { threePoint: 86 }, maxH: 79 }, { speed: 1.6, set: 0.85 }),
    a('rainmaker', 'High Arc Rainmaker', 'Huge arc, high release over contests.', { attrs: { threePoint: 80 } }, { speed: 1.05, set: 1.15, arc: 1.4 }),
    a('feather_fade', 'Feather Fade', 'Drifting fadeaway feel on every jumper.', { attrs: { midRange: 80 } }, { speed: 1.1, set: 1.1, fade: 1 }),
    a('slingshot', 'Slingshot', 'Two-motion release from the hip.', { attrs: { threePoint: 65 } }, { speed: 0.95, set: 0.8 }),
    a('sidewinder', 'Sidewinder', 'Unorthodox side release that defenders can’t time.', { attrs: { threePoint: 75 } }, { speed: 1.2, set: 1.0, side: 1 }),
    a('big_push', 'Big Man Push', 'Sturdy push shot for long-armed bigs.', { minH: 81 }, { speed: 0.85, set: 1.05 }),
  ] },
  freeThrow: { label: 'Free Throw', clip: 'freeThrow', items: [
    a('classic', 'Classic Routine', 'Three dribbles, deep breath, shoot.', {}, { speed: 1, dribbles: 3 }),
    a('quick_flick', 'Quick Flick', 'Barely a pause before the release.', {}, { speed: 1.4, dribbles: 1 }),
    a('spin_set', 'Spin & Set', 'Spins the ball before setting.', {}, { speed: 1, dribbles: 2, spin: 1 }),
    a('deep_breath', 'Deep Breath', 'Long pause, then a smooth stroke.', {}, { speed: 0.8, dribbles: 2 }),
    a('underhand', 'Underhand Throwback', 'Old-school underhand toss.', { attrs: { freeThrow: 80 } }, { speed: 0.9, dribbles: 1, underhand: 1 }),
  ] },
  dribble: { label: 'Dribble Style', clip: 'dribble', items: [
    a('fundamental', 'Fundamental', 'Simple, safe and controlled.', {}, { speed: 1, low: 0.5 }),
    a('low_tight', 'Low & Tight', 'Keeps the ball below the knees.', { attrs: { ballHandle: 70 } }, { speed: 1.2, low: 0.25 }),
    a('bouncy', 'Bouncy Crossover', 'Exaggerated rhythm and big crosses.', { attrs: { ballHandle: 75 } }, { speed: 1.15, low: 0.55, cross: 1 }),
    a('shifty', 'Shifty', 'Quick hesitations and change of pace.', { attrs: { ballHandle: 80 } }, { speed: 1.35, low: 0.4, cross: 1 }),
    a('lightning', 'Lightning', 'Elite speed with tight control.', { attrs: { ballHandle: 88, speedWithBall: 85 } }, { speed: 1.7, low: 0.3, cross: 1 }),
    a('big_man', 'Big Man', 'High, upright dribble for bigs.', { minH: 81 }, { speed: 0.8, low: 0.75 }),
  ] },
  sizeUp: { label: 'Signature Size-Up', clip: 'sizeUp', items: [
    a('none', 'No Size-Up', 'Straight to the move.', {}, { speed: 1, moves: 1 }),
    a('hesi_hop', 'Hesitation Hop', 'Short hesitation into a hop.', { attrs: { ballHandle: 65 } }, { speed: 1, moves: 2 }),
    a('btl_combo', 'Between-Legs Combo', 'Rhythmic between-the-legs chain.', { attrs: { ballHandle: 75 } }, { speed: 1.15, moves: 3, legs: 1 }),
    a('iso_rocker', 'Iso Rocker', 'Rocking crossovers to freeze the defender.', { attrs: { ballHandle: 80 } }, { speed: 1.2, moves: 4 }),
    a('snatch_back', 'Snatch Back', 'Explosive gather and snatch back.', { attrs: { ballHandle: 84 } }, { speed: 1.35, moves: 3, snatch: 1 }),
    a('behind_back', 'Behind-Back Chain', 'Smooth behind-the-back combos.', { attrs: { ballHandle: 88 } }, { speed: 1.45, moves: 4, legs: 1 }),
    a('elite_sig', 'Elite Signature', 'The most dangerous size-up package.', { attrs: { ballHandle: 92, speedWithBall: 85 } }, { speed: 1.7, moves: 5, legs: 1 }),
  ] },
  layup: { label: 'Layup Package', clip: 'layup', items: [
    a('fundamental', 'Fundamental', 'Basic, reliable layups.', {}, { speed: 1, reach: 1 }),
    a('reverse_king', 'Reverse King', 'Finishes on the other side of the rim.', { attrs: { drivingLayup: 70 } }, { speed: 1, reach: 1.05, reverse: 1 }),
    a('power_finisher', 'Power Finisher', 'Two-foot power gathers through contact.', { attrs: { drivingLayup: 70, strength: 70 } }, { speed: 0.9, reach: 1, twoFoot: 1 }),
    a('euro_artist', 'Euro-Step Artist', 'Long euro-steps and hop steps.', { attrs: { drivingLayup: 75 } }, { speed: 1.1, reach: 1.05 }),
    a('floater', 'Floater Specialist', 'Soft floaters over the trees.', { attrs: { drivingLayup: 80 } }, { speed: 1.05, reach: 0.9, floater: 1 }),
    a('acrobat', 'Acrobat', 'Contorting, hang-time finishes.', { attrs: { drivingLayup: 85, vertical: 70 } }, { speed: 1.15, reach: 1.15 }),
  ] },
  dunks: { label: 'Dunk Packages', clip: 'dunk', multi: 3, items: [
    a('basic', 'Basic Dunks', 'One and two-hand basic slams.', { attrs: { drivingDunk: 50 } }, { power: 0.8, jump: 0.85 }),
    a('two_hand_power', 'Two-Hand Power', 'Violent two-hand flushes.', { attrs: { drivingDunk: 60, strength: 60 } }, { power: 1, jump: 0.9, twoHand: 1 }),
    a('rim_grazer', 'Rim Grazer', 'Quick dunks that barely clear the rim.', { attrs: { drivingDunk: 70, vertical: 70 } }, { power: 0.9, jump: 1 }),
    a('big_hammer', 'Bigman Hammer', 'Standing two-hand hammers in the paint.', { attrs: { standingDunk: 75 }, minH: 81 }, { power: 1.2, jump: 0.75, twoHand: 1 }),
    a('tomahawk', 'Tomahawk Flash', 'Cocked-back tomahawks on the break.', { attrs: { drivingDunk: 80, vertical: 75 } }, { power: 1.1, jump: 1.1, cock: 1 }),
    a('posterizer', 'Contact Posterizer', 'Throws it down on whoever is in the way.', { attrs: { drivingDunk: 84, vertical: 70, strength: 65 } }, { power: 1.25, jump: 1.05, twoHand: 1 }),
    a('windmill', 'Windmill Showtime', 'Flashy windmills on open looks.', { attrs: { drivingDunk: 86, vertical: 80 }, maxH: 81 }, { power: 1, jump: 1.2, windmill: 1 }),
    a('elite_bounce', 'Elite Bounce', 'Highest-flying dunk package in the game.', { attrs: { drivingDunk: 92, vertical: 88 } }, { power: 1.15, jump: 1.35, windmill: 1 }),
  ] },
  passing: { label: 'Passing Style', clip: 'pass', items: [
    a('fundamental', 'Fundamental', 'Crisp chest and bounce passes.', {}, { speed: 1 }),
    a('bullet', 'Bullet', 'Fast, hard passes into tight windows.', { attrs: { passAccuracy: 70 } }, { speed: 1.5 }),
    a('lob_city', 'Lob City', 'Floats alley-oops and lob passes.', { attrs: { passAccuracy: 65 } }, { speed: 0.9, lob: 1 }),
    a('post_passer', 'Post Passer', 'Passes out of the post over the top.', { minH: 80 }, { speed: 1, overhead: 1 }),
    a('flashy', 'Flashy', 'Behind-the-back and wraparound dimes.', { attrs: { passAccuracy: 80 } }, { speed: 1.2, flashy: 1 }),
    a('no_look', 'No-Look Magician', 'Looks one way, passes the other.', { attrs: { passAccuracy: 88 } }, { speed: 1.3, noLook: 1 }),
  ] },
};
export const ANIM_KEYS = Object.keys(ANIMATIONS);

export function fmtHeight(inches) {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
