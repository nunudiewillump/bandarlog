/** Scout topics are explicit: a catalogue entry always pairs one mascot with one icon. */
const groups = [
  [
    'cocina',
    'Cocina',
    'CookingPot',
    'Menús|Desayunos|Meriendas|Cenas|Alergias alimentarias|Despensa|Compra de alimentos|Cocina de campamento|Cocina vegetariana|Horno de campamento|Repostería|Bebidas e hidratación|Conservación de alimentos|Comedor|Recetas scouts',
  ],
  [
    'logistica',
    'Logística',
    'Truck',
    'Transporte|Logística|Equipajes|Rutas de llegada|Carga de vehículos|Reparto de material|Almacén|Inventario|Reservas|Permisos de viaje|Horarios|Aparcamiento|Suministros|Acogida|Puntos de encuentro',
  ],
  [
    'comunicacion',
    'Comunicación',
    'Megaphone',
    'Cartelería|Redes sociales|Fotografía|Vídeo|Prensa|Boletín|Web del grupo|Mensajería|Información a familias|Diseño gráfico|Radio scout|Entrevistas|Crónicas|Archivo audiovisual|Señalización',
  ],
  [
    'animacion',
    'Animación',
    'Drama',
    'Teatro|Canciones|Danzas|Veladas|Juegos nocturnos|Marionetas|Magia|Disfraces|Cuenta cuentos|Humor|Festivales|Música|Coreografías|Espectáculos|Ceremonias de bienvenida',
  ],
  [
    'infraestructura',
    'Infraestructura',
    'Hammer',
    'Montaje de tiendas|Desmontaje|Construcciones|Herramientas|Reparaciones|Electricidad|Iluminación|Fontanería|Duchas|Aseos|Vallado|Tarimas|Mobiliario|Refugios|Mantenimiento del local',
  ],
  [
    'salud',
    'Salud',
    'BriefcaseMedical',
    'Botiquín|Primeros auxilios|Prevención de accidentes|Protección solar|Higiene|Descanso|Medicaciones|Curación de heridas|Picaduras|Ergonomía|Lavado de manos|Salud bucodental|Apoyo emocional|Enfermería|Hábitos saludables',
  ],
  [
    'naturaleza',
    'Naturaleza',
    'Leaf',
    'Flora|Fauna|Aves|Insectos|Huellas|Árboles|Bosques|Ríos|Humedales|Montañas|Geología|Astronomía|Meteorología|Huerto|Jardinería',
  ],
  [
    'sostenibilidad',
    'Sostenibilidad',
    'Recycle',
    'Reciclaje|Compostaje|Ahorro de agua|Ahorro de energía|Residuos cero|Limpieza del entorno|Reutilización|Reparación sostenible|Consumo responsable|Movilidad sostenible|Biodiversidad|Reforestación|Educación ambiental|Huella ecológica|Economía circular',
  ],
  [
    'orientacion',
    'Orientación',
    'Compass',
    'Brújula|Mapas|Cartografía|GPS|Geocaching|Balizas|Carreras de orientación|Rumbos|Coordenadas|Lectura del terreno|Croquis|Señales de pista|Orientación nocturna|Orientación por estrellas|Planificación de rutas',
  ],
  [
    'aventura',
    'Aventura',
    'Mountain',
    'Senderismo|Travesías|Escalada|Rápel|Espeleología|Barranquismo|Tirolina|Puentes de cuerda|Raquetas de nieve|Vivac|Supervivencia|Marchas|Expediciones|Cumbres|Exploración',
  ],
  [
    'agua',
    'Actividades acuáticas',
    'Waves',
    'Natación|Piragüismo|Kayak|Rafting|Vela|Remo|Paddle surf|Juegos acuáticos|Salvamento acuático|Seguridad en piscinas|Seguridad en ríos|Seguridad en playas|Estudio del agua|Rutas fluviales|Construcción de balsas',
  ],
  [
    'deportes',
    'Deportes',
    'Trophy',
    'Fútbol|Baloncesto|Voleibol|Balonmano|Rugby cinta|Atletismo|Bádminton|Tenis de mesa|Frisbee|Ciclismo|Patinaje|Juegos cooperativos|Olimpiadas|Estiramientos|Deporte inclusivo',
  ],
  [
    'tecnica',
    'Técnica scout',
    'Tent',
    'Nudos|Amarres|Pionerismo|Cabuyería|Fuego seguro|Fogones|Mochilas|Acampada|Herramientas de campo|Rastreo|Códigos secretos|Morse|Semáforo scout|Señales de emergencia|Cuaderno de campo',
  ],
  [
    'creatividad',
    'Creatividad',
    'Palette',
    'Dibujo|Pintura|Escultura|Cerámica|Origami|Costura|Bordado|Estampación|Tallado|Pulseras|Insignias artesanales|Murales|Arte reciclado|Modelismo|Encuadernación',
  ],
  [
    'servicio',
    'Servicio',
    'HandHeart',
    'Voluntariado|Banco de alimentos|Apoyo vecinal|Acompañamiento a mayores|Protección animal|Solidaridad|Cooperación|Campañas sociales|Accesibilidad|Inclusión|Aprendizaje servicio|Apoyo escolar|Recogida de juguetes|Donaciones|Acción comunitaria',
  ],
  [
    'educacion',
    'Educación scout',
    'BookOpen',
    'Ley scout|Promesa|Valores|Patrullas|Liderazgo|Trabajo en equipo|Resolución de conflictos|Mediación|Participación|Evaluaciones|Objetivos educativos|Progresión personal|Formación de scouters|Educación para la paz|Derechos de la infancia',
  ],
  [
    'gestion',
    'Gestión',
    'ClipboardList',
    'Coordinación|Tesorería|Presupuestos|Cuotas|Subvenciones|Documentación|Actas|Calendario|Inscripciones|Seguros|Protección de datos|Compras|Proveedores|Reuniones|Archivo del grupo',
  ],
  [
    'familias',
    'Familias',
    'Users',
    'Comité de familias|Reuniones de familias|Jornadas abiertas|Fiestas del grupo|Convivencias|Acogida de familias|Acompañamiento familiar|Escuela de familias|Participación familiar|Comidas compartidas|Apoyo a campamentos|Encuestas a familias|Contacto de emergencia|Información de salidas|Celebraciones',
  ],
  [
    'tradiciones',
    'Tradiciones scouts',
    'Flag',
    'Historia scout|Baden Powell|Pañoletas|Tótems|Banderines|Ceremonias|Pases de rama|San Jorge|Día del pensamiento|Luz de la paz|Cancionero|Álbum del grupo|Hermandad scout|Intercambios|Encuentros internacionales',
  ],
  [
    'ramas',
    'Ramas y campamentos',
    'Campfire',
    'Castores|Lobatos|Tropa scout|Escultas|Rovers|Kraal|Campamento de verano|Campamento de invierno|Campamento de primavera|Acampadas de fin de semana|Ronda solar|Jamboree|Roverway|Interescultas|Encuentro de manadas',
  ],
] as const;

export const scoutCatalog = groups.flatMap(([family, familyName, icon, topics]) =>
  topics.split('|').map((name, index) => ({
    id: `${family}-${String(index + 1).padStart(2, '0')}`,
    name,
    family,
    familyName,
    icon,
  })),
);

export type ScoutArtwork = (typeof scoutCatalog)[number];

export const christmasTopics = [
  ['Cocina · Jengibre', 'cocina', 'Gingerbread'],
  ['Logística · Trineo', 'logistica', 'Sleigh'],
  ['Comunicación · Campanas', 'comunicacion', 'Bell'],
  ['Animación · Estrella', 'animacion', 'Star'],
  ['Infraestructura · Árbol', 'infraestructura', 'TreePine'],
  ['Salud · Corona de cuidados', 'salud', 'Wreath'],
  ['Naturaleza · Acebo', 'naturaleza', 'Holly'],
  ['Sostenibilidad · Corona', 'sostenibilidad', 'Wreath'],
  ['Orientación · Estrella polar', 'orientacion', 'Star'],
  ['Aventura · Reno', 'aventura', 'Reindeer'],
  ['Agua · Copo de nieve', 'agua', 'Snowflake'],
  ['Deportes · Patines', 'deportes', 'Skate'],
  ['Técnica scout · Farol', 'tecnica', 'Lantern'],
  ['Creatividad · Adorno', 'creatividad', 'Star'],
  ['Servicio · Regalo', 'servicio', 'Gift'],
  ['Educación · Vela', 'educacion', 'Candle'],
  ['Gestión · Lista de deseos', 'gestion', 'ClipboardList'],
  ['Familias · Muñeco de nieve', 'familias', 'Snowman'],
  ['Tradiciones · Belén', 'tradiciones', 'House'],
  ['Ramas · Corona navideña', 'ramas', 'Wreath'],
  ['Bastón de caramelo', 'cocina', 'CandyCane'],
  ['Chocolate caliente', 'cocina', 'Coffee'],
  ['Galletas de Navidad', 'cocina', 'Cookie'],
  ['Elfo ayudante', 'servicio', 'Gift'],
  ['Calcetín de regalos', 'creatividad', 'Stocking'],
  ['Bola de Navidad', 'creatividad', 'Bauble'],
  ['Abeto nevado', 'naturaleza', 'TreePine'],
  ['Cascabeles', 'comunicacion', 'BellRing'],
  ['Paquete navideño', 'logistica', 'Package'],
  ['Hoguera de invierno', 'tecnica', 'Campfire'],
] as const;

export type ArtworkEntry = {
  id: string;
  name: string;
  family: string;
  familyName: string;
  icon: string;
  collection: 'scout' | 'christmas';
  iconUrl: string;
  mascotUrl: string;
};
const originalArtworkCatalog: ArtworkEntry[] = [
  ...scoutCatalog.map((entry) => ({ ...entry, collection: 'scout' as const })),
  ...christmasTopics.map(([name, family, icon], index) => ({
    id: `navidad-${String(index + 1).padStart(2, '0')}`,
    name,
    family,
    familyName: 'Navidad',
    icon,
    collection: 'christmas' as const,
  })),
].map((entry, index) => ({
  ...entry,
  iconUrl: `/artwork/icons/${entry.id}.svg`,
  mascotUrl: `/artwork/mascots/${String(Math.floor(index / 6)).padStart(3, '0')}.webp#tile=${index % 6}`,
}));

// Append standalone pairs so existing sheet positions and saved selections stay stable.
export const artworkCatalog: ArtworkEntry[] = [
  ...originalArtworkCatalog,
  {
    id: 'servicios-general',
    name: 'Servicios',
    family: 'servicio',
    familyName: 'Servicios',
    icon: 'BrushCleaning',
    collection: 'scout',
    iconUrl: '/artwork/icons/servicios-general.svg',
    mascotUrl: '/artwork/mascots/servicios.webp',
  },
  {
    id: 'animacion-general',
    name: 'Animación',
    family: 'animacion',
    familyName: 'Animación',
    icon: 'Drama',
    collection: 'scout',
    iconUrl: '/artwork/icons/animacion-general.svg',
    mascotUrl: '/artwork/mascots/animacion.webp',
  },
  ...[
    ['servicios', 'Servicios', 'servicio', 'Gift'],
    ['animacion', 'Animación', 'animacion', 'Star'],
    ['material', 'Material', 'infraestructura', 'Package'],
    ['menu', 'Menú', 'cocina', 'Gingerbread'],
    ['logistica', 'Logística', 'logistica', 'Sleigh'],
    ['lugar', 'Lugar', 'orientacion', 'TreePine'],
  ].map(([key, name, family, icon], tile) => ({
    id: `navidad-${key}`,
    name,
    family,
    familyName: 'Navidad',
    icon,
    collection: 'christmas' as const,
    iconUrl: `/artwork/icons/navidad-${key}.svg`,
    mascotUrl: `/artwork/mascots/055.webp#tile=${tile}`,
  })),
];

export type ArtworkTheme = 'scout' | 'christmas';
export const artworkThemes = [
  { id: 'scout' as const, name: 'Scouts' },
  { id: 'christmas' as const, name: 'Navidad' },
];
export const normalizeArtworkText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const aliases: Record<string, string[]> = {
  cocina: ['cocina', 'comida', 'menu', 'alimentacion', 'comedor'],
  logistica: ['logistica', 'transporte', 'autobus', 'almacen'],
  comunicacion: ['comunicacion', 'cartel', 'redes', 'fotografia', 'prensa'],
  animacion: ['animacion', 'velada', 'teatro', 'juegos', 'festival'],
  infraestructura: ['infraestructura', 'material', 'montaje', 'mantenimiento'],
  salud: ['salud', 'botiquin', 'sanitario', 'auxilios', 'enfermeria'],
  naturaleza: ['naturaleza', 'flora', 'fauna', 'huerto'],
  sostenibilidad: ['sostenibilidad', 'reciclaje', 'residuos', 'medio ambiente'],
  orientacion: ['orientacion', 'brujula', 'mapas', 'geocaching', 'lugar', 'emplazamiento'],
  aventura: ['aventura', 'senderismo', 'escalada', 'travesia', 'exploracion'],
  agua: ['acuatic', 'piscina', 'piragua', 'natacion', 'kayak'],
  deportes: ['deporte', 'futbol', 'baloncesto', 'olimpiada'],
  tecnica: ['tecnica', 'nudos', 'pionerismo', 'cabuyeria', 'fuego'],
  creatividad: ['creatividad', 'manualidad', 'artesania', 'taller', 'pintura'],
  servicio: ['servicio', 'voluntariado', 'solidaridad', 'cooperacion'],
  educacion: ['educacion', 'formacion', 'valores', 'progresion'],
  gestion: ['gestion', 'coordinacion', 'tesoreria', 'presupuesto', 'secretaria'],
  familias: ['familias', 'familia', 'padres', 'madres'],
  tradiciones: ['tradicion', 'ceremonia', 'historia', 'promesa', 'san jorge'],
  ramas: ['rama', 'castores', 'lobatos', 'tropa', 'escultas', 'rovers', 'kraal'],
};
export function inferArtworkTheme(projectName: string): ArtworkTheme {
  return /invierno|navidad|christmas/.test(normalizeArtworkText(projectName))
    ? 'christmas'
    : 'scout';
}
export function projectArtworkTheme(project: {
  name: string;
  artworkTheme?: string | null;
}): ArtworkTheme {
  return inferArtworkTheme(project.name) === 'christmas'
    ? 'christmas'
    : project.artworkTheme === 'christmas'
      ? 'christmas'
      : 'scout';
}
export function hasArtworkAssociation(
  name: string,
  theme: ArtworkTheme,
  extra: ArtworkEntry[] = [],
) {
  const normalized = normalizeArtworkText(name).trim();
  return [...artworkCatalog, ...extra].some((entry) => {
    if (entry.collection !== theme) return false;
    const topic = normalizeArtworkText(entry.name.split(' · ')[0]);
    return (
      normalized === topic ||
      normalized.includes(topic) ||
      (aliases[entry.family] || []).some((word) => normalized.includes(word))
    );
  });
}
export function selectArtwork(
  input: {
    name: string;
    description?: string;
    theme: ArtworkTheme;
    key?: string | null;
    seed?: string;
  },
  extra: ArtworkEntry[] = [],
) {
  const candidates = [...artworkCatalog, ...extra].filter(
    (entry) => entry.collection === input.theme,
  );
  const selected = candidates.find((entry) => entry.id === input.key);
  if (selected) return selected;
  const name = normalizeArtworkText(input.name);
  const description = normalizeArtworkText(input.description || '');
  const scores = candidates.map((entry) => {
    const words = aliases[entry.family] || [];
    const topic = normalizeArtworkText(entry.name.split(' · ')[0]);
    const score =
      (name === normalizeArtworkText(entry.name) ? 50 : 0) +
      (name === topic ? 30 : name.includes(topic) ? 20 : 0) +
      words.reduce(
        (n, word) => n + (name.includes(word) ? 10 : description.includes(word) ? 1 : 0),
        0,
      );
    return { entry, score };
  });
  const best = Math.max(...scores.map((item) => item.score));
  const matches = scores.filter((item) => item.score === best).map((item) => item.entry);
  const hash = [...(input.seed || input.name)].reduce(
    (value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0,
    0,
  );
  return matches[hash % matches.length];
}
