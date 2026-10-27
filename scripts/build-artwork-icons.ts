import { mkdir, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { icons } from 'lucide-react';
import { artworkCatalog } from '../shared/scout-catalog.js';

const topicIcons: Record<string, string> = {
  cocina:
    'BookOpen|Coffee|Apple|Soup|ShieldCheck|Archive|ShoppingBasket|CookingPot|Carrot|Flame|CakeSlice|GlassWater|Refrigerator|Utensils|NotebookPen',
  logistica:
    'Truck|Boxes|Luggage|Route|PackagePlus|PackageCheck|Warehouse|ClipboardList|Ticket|FileCheck|Clock|SquareParking|Boxes|Hand|MapPin',
  comunicacion:
    'PanelTop|MessageCircle|Camera|Video|Newspaper|Mail|Globe|Send|Users|Palette|Radio|Mic|NotebookPen|Images|Signpost',
  animacion:
    'Drama|Music|Footprints|Moon|Flashlight|Smile|WandSparkles|Shirt|BookOpen|Laugh|PartyPopper|Guitar|Footprints|Sparkles|DoorOpen',
  infraestructura:
    'Tent|PackageMinus|Hammer|Wrench|Settings|Plug|Lightbulb|Droplets|ShowerHead|Bath|Fence|Layers|Armchair|House|Building',
  salud:
    'BriefcaseMedical|Cross|Shield|Sun|Droplets|Bed|Pill|Bandage|Bug|Accessibility|Hand|Smile|HeartHandshake|Stethoscope|HeartPulse',
  naturaleza:
    'Flower|Rabbit|Bird|Bug|PawPrint|TreeDeciduous|Trees|Waves|Droplets|Mountain|Gem|Telescope|CloudSun|Sprout|Flower2',
  sostenibilidad:
    'Recycle|Leaf|Droplet|Zap|Trash2|Sparkles|Repeat|Wrench|ShoppingBag|Bike|Flower2|TreePine|BookOpen|Footprints|RefreshCcw',
  orientacion:
    'Compass|Map|MapPinned|Navigation|MapPin|Flag|Timer|MoveUpRight|LocateFixed|Mountain|PencilRuler|Signpost|Moon|Star|Route',
  aventura:
    'Footprints|Route|Mountain|ArrowDown|MountainSnow|Waves|Cable|CableCar|Snowflake|Tent|Flame|Backpack|Compass|FlagTriangleRight|Binoculars',
  agua: 'Waves|Ship|Sailboat|Waves|Sailboat|ShipWheel|Waves|Droplets|LifeBuoy|ShieldCheck|Waves|Sun|FlaskConical|Route|Hammer',
  deportes:
    'CircleDot|Circle|Volleyball|Hand|Flag|Timer|Feather|CircleDot|Disc|Bike|Footprints|Handshake|Medal|PersonStanding|Accessibility',
  tecnica:
    'Cable|Link|Hammer|Cable|Flame|CookingPot|Backpack|Tent|Axe|PawPrint|KeyRound|Radio|Flag|Siren|NotebookPen',
  creatividad:
    'Pencil|Paintbrush|Shapes|Shapes|Origami|Scissors|Shirt|Stamp|Axe|Link|Badge|Palette|Recycle|Blocks|BookOpen',
  servicio:
    'HandHeart|ShoppingBasket|House|HeartHandshake|PawPrint|Heart|Globe|Megaphone|Accessibility|Users|BookOpen|GraduationCap|Gift|Package|Handshake',
  educacion:
    'BookOpenCheck|Hand|Heart|Users|Flag|Handshake|MessagesSquare|Scale|Vote|ClipboardCheck|Target|TrendingUp|GraduationCap|Bird|ShieldCheck',
  gestion:
    'Network|Wallet|Calculator|Coins|BadgeEuro|FolderOpen|NotebookPen|Calendar|ClipboardList|ShieldCheck|LockKeyhole|ShoppingCart|Truck|Users|Archive',
  familias:
    'Users|MessagesSquare|DoorOpen|PartyPopper|House|Hand|HeartHandshake|GraduationCap|Vote|Utensils|Tent|ClipboardCheck|Phone|Map|Cake',
  tradiciones:
    'History|BookOpen|Shirt|TreeDeciduous|Flag|Flame|ArrowUp|Shield|Heart|Lamp|Music|Images|Handshake|Repeat|Globe',
  ramas:
    'Rabbit|PawPrint|Compass|Mountain|Footprints|Users|Sun|Snowflake|Flower|Tent|Calendar|Globe|Route|Flag|PawPrint',
};

function symbol(name: string) {
  const seasonal: Record<string, string> = {
    Sleigh: '<path d="M3 9v7h13l3-5h2M5 16v4m11-4v4M2 20h17q3 0 3-3M6 9h6v7M6 9V5h6v4M9 5V3"/>',
    Gingerbread:
      '<circle cx="12" cy="5" r="3"/><path d="m9 8-5 3q-2 2 0 3l5-1-3 7q0 3 3 1l3-5 3 5q3 2 3-1l-3-7 5 1q2-1 0-3l-5-3"/><path d="M10 5h.1M14 5h.1m-4 5 2 1 2-1M12 13v.1M12 15v.1"/>',
    Wreath:
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><path d="m4 7 4 1M3 12l4 1m-2 5 3-2m12-9-4 1m5 4-4 1m2 5-3-2m-4 2-4 4v-4m4 0 4 4v-4M9 3l3 3 3-3"/>',
    Holly:
      '<path d="M12 13Q2 15 3 3q3 3 4 0 0 4 3 3 0 4 3 4M12 13q10 2 9-10-3 3-4 0 0 4-3 3 0 4-3 4M6 6l6 7 6-7"/><circle cx="10" cy="16" r="2"/><circle cx="14" cy="16" r="2"/><circle cx="12" cy="19" r="2"/>',
    Reindeer:
      '<path d="m8 8-3-4V1M5 5 2 3m14 5 3-4V1m0 4 3-2M8 8q4-3 8 0l2 5-3 8H9l-3-8ZM7 10l-5-2 2 5h3m10-3 5-2-2 5h-3M9 13h.1m5.8 0h.1"/><ellipse cx="12" cy="18" rx="2" ry="1.5"/>',
    Skate: '<path d="M8 3h7v8l6 4v3H4v-7h4ZM6 18v3m12-3v3M2 21h18q2 0 2-2M8 7h6m-6 3h6m-3 3h4"/>',
    Lantern:
      '<path d="M9 4V2h6v2M6 6h12l-2 13H8ZM8 19l-2 3h12l-2-3M6 6l3-2h6l3 2M9 17l6-9m-6 0 6 9"/>',
    Candle: '<path d="M8 9h8v12H8Zm4 0V7m-6 14h12"/><path d="M12 1q-5 4 0 6 5-2 0-6Z"/>',
    Snowman:
      '<circle cx="12" cy="7" r="4"/><circle cx="12" cy="16" r="6"/><path d="M7 4h10M9 4V1h6v3M5 14l-4-4m18 4 4-4M9 11l6 1m-3 2v.1m0 3v.1M10 6h.1m3.8 0h.1m-1 1 3 1-3 1"/>',
    Stocking: '<path d="M9 3h10v4H9Zm1 4v7l-6 3q-3 3 1 5h5l8-7V7M4 17l5 5m5-10 4 3"/>',
    Bauble:
      '<circle cx="12" cy="14" r="8"/><path d="M9 6V3h6v3m-3-3V1M5 12q7 6 14 0M9 9h.1m7.8 9h.1"/>',
  };
  if (seasonal[name]) return `<g stroke-width="1.5">${seasonal[name]}</g>`;
  const aliases: Record<string, string> = {
    Music: 'ListMusic',
    Smile: 'FaceSlightlySmiling',
    Laugh: 'FaceGrinning',
    Waves: 'WavesHorizontal',
    History: 'RotateCcwClock',
    Trash2: 'Trash',
    Campfire: 'FlameKindling',
  };
  const Icon = (icons as Record<string, (typeof icons)['Tent']>)[aliases[name] || name];
  if (!Icon) throw new Error('Unknown icon: ' + name);
  return renderToStaticMarkup(createElement(Icon, { strokeWidth: 1.7 }))
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
}
await mkdir('public/artwork/icons', { recursive: true });
for (const [index, entry] of artworkCatalog.entries()) {
  const topic =
    entry.collection === 'christmas' || entry.id.endsWith('-general')
      ? entry.icon
      : topicIcons[entry.family].split('|')[index % 15];
  const badge = entry.id === 'navidad-animacion' ? 'Music' : entry.icon;
  const angle = ((index % 15) * Math.PI * 2) / 15;
  const accentX = (32 + Math.cos(angle) * 26).toFixed(2);
  const accentY = (32 + Math.sin(angle) * 26).toFixed(2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#124d38" transform="translate(9 7) scale(1.8)">${symbol(topic)}</g><circle cx="50" cy="49" r="12" fill="#fff7e5" stroke="#d99a35" stroke-width="1.5"/><g stroke="#b17726" transform="translate(42 41) scale(.67)">${symbol(badge)}</g><circle cx="${accentX}" cy="${accentY}" r="1.5" fill="#d99a35" stroke="none"/></svg>\n`;
  await writeFile('public' + entry.iconUrl, svg);
}
console.log(`Prepared ${artworkCatalog.length} paired catalogue icons.`);
