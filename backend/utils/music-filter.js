// ================================
// MOYOFY FILTER v3 - SISTEMA INTELIGENTE MEJORADO
// Rafa's Bar - Versión Premium con prioridad de artistas
// ================================

// ✅ ARTISTAS Y BANDAS PERMITIDOS (Lista Blanca expandida - PRIORIDAD MÁXIMA)
const ALLOWED_ARTISTS = {
  classic: [
    "queen", "acdc", "ac/dc", "led zeppelin", "the beatles", "rolling stones",
    "pink floyd", "the who", "jimi hendrix", "cream", "deep purple", "van halen",
    "aerosmith", "kiss", "ozzy osbourne", "black sabbath", "def leppard",
    "scorpions", "whitesnake", "bon jovi", "boston", "journey", "foreigner",
    "rush", "styx", "kansas", "yes", "genesis", "supertramp", "elton john",
    "david bowie", "rod stewart", "cat stevens", "eric clapton", "santana"
  ],
  metal: [
    "metallica", "iron maiden", "slayer", "megadeth", "judas priest", "motorhead",
    "black sabbath", "ozzy osbourne", "pantera", "tool", "system of a down",
    "slipknot", "korn", "deftones", "disturbed", "five finger death punch",
    "avenged sevenfold", "lamb of god", "machine head", "gojira", "meshuggah",
    "mastodon", "high on fire", "sleep", "electric wizard", "cannibal corpse",
    "death", "morbid angel", "behemoth", "dimmu borgir", "emperor"
  ],
  alternative: [
    "nirvana", "pearl jam", "soundgarden", "alice in chains", "stone temple pilots",
    "tool", "red hot chili peppers", "foals", "queens of the stone age", "dave matthews band",
    "foo fighters", "green day", "blink 182", "sum 41", "offspring", "bad religion",
    "nofx", "rise against", "paramore", "fall out boy", "my chemical romance",
    "linkin park", "deftones", "rage against the machine", "audioslave", "muse",
    "arctic monkeys", "the strokes", "the killers", "kings of leon", "cage the elephant"
  ],
  punk: [
    "ramones", "sex pistols", "the clash", "dead kennedys", "black flag", "misfits",
    "bad brains", "minor threat", "circle jerk", "social distortion", "rancid",
    "dropkick murphys", "the offspring", "bad religion", "anti-flag", "nofx",
    "rise against", "against me", "propagandhi", "strike anywhere", "the bouncing souls"
  ],
  industrial: [
    "ministry", "nine inch nails", "skinny puppy", "killing joke", "godflesh",
    "front line assembly", "fear factory", "type o negative", "the cure", "depeche mode",
    "new order", "joy division", "bauhaus", "siouxsie and the banshees", "the sisters of mercy"
  ],
  latino: [
    "soda stereo", "caifanes", "heroes del silencio", "enanitos verdes", "fito paez",
    "andres calamaro", "los fabulosos cadillacs", "la rota", "molotov", "cafe tacvba",
    "manu chao", "radio futura", "los enemigos", "los brincos", "los saicos"
  ]
};

// ✅ GÉNEROS PERMITIDOS (lista expandida)
const ALLOWED_GENRES = [
  "rock", "rock and roll", "rock'n'roll", "hard rock", "heavy metal", "metal",
  "punk", "punk rock", "alternative", "alternative rock", "grunge", "indie",
  "indie rock", "garage", "garage rock", "classic rock", "progressive",
  "progressive rock", "psychedelic", "psychedelic rock", "surf rock",
  "stoner rock", "emo", "post grunge", "britpop", "ska punk", "folk rock",
  "blues rock", "industrial rock", "industrial", "nu metal", "metalcore", 
  "black metal", "death metal", "thrash metal", "gothic rock", "post punk", 
  "power metal", "speed metal", "southern rock", "new wave", "alt rock", 
  "grindcore", "doom metal", "sludge", "rockabilly", "fusion rock",
  "shock rock", "glam rock", "gothic metal", "symphonic metal", "classic",
  "progressive metal", "melodic death metal", "folk metal", "viking metal"
];

// ❌ BLOQUEOS ABSOLUTOS (Lista Negra - Sin excepciones)
const BLOCKED_TERMS = [
  "reggaeton", "reguetón", "trap", "perreo", "bachata", "salsa", 
  "vallenato", "cumbia", "merengue", "norteño", "corridos", "ranchera",
  "balada", "romántica", "cristiana", "gospel", "worship", "infantil",
  "pop latino", "urbano latino", "latin pop", "reggaeton", "dembow",
  "kpop", "jpop", "mpb", "bossa", "samba", "flamenco", "country", "rap",
  "hip hop", "r&b", "soul", "jazz", "electronica", "electrónica", "tecno",
  "techno", "edm", "dance", "house", "trance", "reggae", "dancehall",
  "afrobeat", "funk", "disco", "latin", "latino", "romantica", "chill",
  "lofi", "ambient", "mariachi", "banda", "tropical", "bolero", "tango",
  "bad bunny", "pimpinela", "karol g", "anuel", "feid", "maluma", "yuri",
  "manuel mijares", "camilo sesto", "cristian castro", "luis miguel", "rosalía",
  "la oreja de van gogh", "camilo", "grupo firme", "temerarios", "vicente fernández",
  "ana gabriel"
];

// 🧠 FUNCIÓN PARA VERIFICAR SI UN ARTISTA ESTÁ PERMITIDO
function isAllowedArtist(text = "") {
  const normalizedText = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  
  for (const category in ALLOWED_ARTISTS) {
    const artists = ALLOWED_ARTISTS[category];
    
    for (const artist of artists) {
      const normalizedArtist = artist
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      
      const regex = new RegExp(`\\b${normalizedArtist}\\b`, 'i');
      if (regex.test(normalizedText)) {
        console.log(`✅ Artista permitido encontrado: ${artist} (categoría: ${category})`);
        return true;
      }
    }
  }
  
  return false;
}

// ✅ VERIFICAR GÉNEROS PERMITIDOS
function isAllowedGenre(text = "") {
  const normalizedText = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  
  return ALLOWED_GENRES.some(genre => {
    const normalizedGenre = genre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    
    const regex = new RegExp(`\\b${normalizedGenre}\\b`, 'i');
    return regex.test(normalizedText);
  });
}

// 🔍 FUNCIÓN DE BLOQUEO ABSOLUTO
function isBlocked(text = "") {
  const normalizedText = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  
  return BLOCKED_TERMS.some(term => {
    const normalizedTerm = term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    
    const regex = new RegExp(`\\b${normalizedTerm}\\b`, 'i');
    return regex.test(normalizedText);
  });
}

// 📊 SISTEMA DE PUNTUACIÓN INTELIGENTE
function calculateSongScore(text = "") {
  let score = 0.6;
  
  const positiveKeywords = [
    "rock", "guitar", "drums", "metal", "punk", "alternative", 
    "classic", "blues", "heavy", "distortion", "amplifier", "riff",
    "industrial", "gothic", "thrash", "death", "black", "doom",
    "progressive", "symphonic", "power", "speed", "shock", "glam",
    "band", "vocal", "solo", "electric", "acoustic", "vinyl", "concert",
    "tour", "album", "live", "studio", "recording", "musician", "composer"
  ];
  
  const negativeKeywords = [
    "baile", "romántica", "suave", "dulce", "amor", "corazón", 
    "lento", "suave", "romance", "boda", "fiesta", "club",
    "reggaeton", "trap", "perreo", "bachata", "salsa", "urbano",
    "bailar", "bailando", "fiesta", "pachanga", "discoteca", "dj",
    "mix", "remix", "dance", "electronic", "edm", "house", "techno"
  ];
  
  positiveKeywords.forEach(keyword => {
    if (text.includes(keyword)) score += 0.1;
  });
  
  negativeKeywords.forEach(keyword => {
    if (text.includes(keyword)) score -= 0.15;
  });
  
  const legendaryKeywords = ["queen", "zeppelin", "beatles", "stones", "sabbath", "metallica", "nirvana", "rush", "acdc"];
  legendaryKeywords.some(keyword => {
    if (text.includes(keyword)) {
      score += 0.2;
      return true;
    }
    return false;
  });
  
  return Math.max(0, Math.min(1, score));
}

// 🧠 SISTEMA DE CLASIFICACIÓN INTELIGENTE
function classifySong(songData) {
  const { title, artist, channelId, channelTitle } = songData;
  const text = `${title} ${artist} ${channelTitle}`.toLowerCase();
  
  if (isBlocked(text)) {
    return { 
      allowed: false, 
      reason: "blocked_term", 
      confidence: 0.95,
      blockedTerm: BLOCKED_TERMS.find(term => text.includes(term.toLowerCase()))
    };
  }
  
  if (isAllowedArtist(text)) {
    return { 
      allowed: true, 
      reason: "allowed_artist", 
      confidence: 0.98,
      artistCategory: "found_in_whitelist"
    };
  }
  
  if (isAllowedGenre(text)) {
    return { 
      allowed: true, 
      reason: "allowed_genre", 
      confidence: 0.85
    };
  }
  
  const score = calculateSongScore(text);
  
  return { 
    allowed: score >= 0.5,
    reason: score >= 0.5 ? "score_approved" : "score_rejected",
    confidence: Math.min(0.9, Math.max(0.1, score)),
    scoreDetails: score
  };
}

// 🎯 FUNCIÓN PRINCIPAL
function filterSongForBar(songData, barConfig = { name: "Rafa's Bar", strictMode: false }) {
  const result = classifySong(songData);
  
  return {
    allowed: result.allowed,
    reason: result.allowed ? 
      `✅ Aprobada - ${result.reason.replace('_', ' ')}` : 
      `❌ Bloqueada - ${result.reason.replace('_', ' ')}`,
    confidence: result.confidence,
    details: result
  };
}

// 📦 EXPORTAR FUNCIONES
module.exports = {
  filterSongForBar,
  classifySong,
  isBlocked,
  isAllowedArtist,
  isAllowedGenre,
  ALLOWED_ARTISTS,
  ALLOWED_GENRES
};