require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// === CONFIGURACIÓN UTF-8 CORRECTA ===
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  next();
});

// === IMPORTAR EL SISTEMA DE FILTRADO ===
const { filterSongForBar } = require('./utils/music-filter');

// === CONFIGURACIÓN YOUTUBE API ===
const youtubeApiKey = process.env.YOUTUBE_API_KEY;
if (!youtubeApiKey) {
  console.error("❌ ERROR CRÍTICO: No se encontró YOUTUBE_API_KEY en .env");
  process.exit(1);
}

// === CONFIGURACIÓN OAUTH2 ===
const oAuth2Client = new google.auth.OAuth2(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// === CARGA DE TOKENS ===
const TOKEN_PATH = path.join(__dirname, "tokens.json");
let hasValidTokens = false;
let lastAuthError = null;

if (fs.existsSync(TOKEN_PATH)) {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    if (tokens.refresh_token || tokens.access_token) {
      oAuth2Client.setCredentials(tokens);
      hasValidTokens = true;
      console.log("✅ TOKENS cargados correctamente.");
      
      oAuth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          console.log("🔄 Token refrescado y guardado.");
        }
      });
    }
  } catch (err) {
    console.error("❌ Error al cargar tokens.json:", err.message);
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  }
}

// === AUTORIZACIÓN ===
app.get("/auth", (req, res) => {
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl"
    ]
  });
  res.redirect(url);
});

// === CALLBACK DE OAUTH ===
app.get("/oauth2callback", async (req, res) => {
  try {
    const { tokens } = await oAuth2Client.getToken(req.query.code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    hasValidTokens = true;
    lastAuthError = null;
    console.log("✅ Nuevos tokens guardados.");
    res.redirect('/');
  } catch (err) {
    lastAuthError = err.message;
    console.error("Error en OAuth callback:", err.message);
    res.status(500).send(`
      <html>
        <head><meta charset="UTF-8"><title>Error - MOYOFY</title></head>
        <body style="background:#12121f;color:white;text-align:center;padding:50px;">
          <h1>❌ ERROR DE AUTORIZACIÓN</h1>
          <p>${err.message}</p>
          <button onclick="window.location.href='/auth'" style="background:#ff004c;color:white;border:none;padding:15px 30px;font-size:1.1rem;border-radius:25px;margin-top:20px;">🔁 INTENTAR DE NUEVO</button>
        </body>
      </html>
    `);
  }
});

// === RUTA DE SALUD ===
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    serverTime: new Date().toISOString(),
    youtubeApiKey: !!youtubeApiKey,
    oauthConfigured: !!process.env.OAUTH_CLIENT_ID,
    hasValidTokens,
    lastAuthError
  });
});

// === BÚSQUEDA DE CANCIONES ===
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ ok: false, error: "Falta parámetro de búsqueda." });

    const yt = google.youtube({
      version: "v3",
      auth: youtubeApiKey
    });

    const r = await yt.search.list({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 10,
      fields: "items(id/videoId,snippet(title,channelTitle))"
    });

    const filteredItems = r.data.items
      .map(item => {
        const songData = {
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          videoId: item.id.videoId
        };
        
        const filterResult = filterSongForBar(songData, {
          name: "Rafa's Bar",
          strictMode: false
        });
        
        return {
          ...songData,
          allowed: filterResult.allowed,
          filterReason: filterResult.reason,
          confidence: filterResult.confidence
        };
      })
      .filter(item => item.allowed)
      .slice(0, 8);

    console.log(`🔍 Búsqueda: "${query}" | Resultados: ${r.data.items.length} → ${filteredItems.length} aprobados`);

    res.json({
      ok: true,
      items: filteredItems.map(i => ({
        title: i.title,
        artist: i.artist,
        videoId: i.videoId,
        confidence: i.confidence
      })),
      filterStats: {
        totalResults: r.data.items.length,
        approved: filteredItems.length,
        approvalRate: Math.round((filteredItems.length / r.data.items.length) * 100)
      }
    });
  } catch (err) {
    console.error("Error al buscar canciones:", err.message);
    if (err.message.includes("API key not valid") || err.message.includes("unregistered caller")) {
      return res.status(401).json({ 
        ok: false, 
        error: "🔑 Error de autenticación con YouTube API." 
      });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === AGREGAR CANCIÓN A PLAYLIST ===
app.post("/add-song", async (req, res) => {
  try {
    const { playlistId, videoId, userId } = req.body;
    if (!playlistId || !videoId || !userId) {
      return res.status(400).json({ ok: false, error: "Datos faltantes: playlistId, videoId o userId." });
    }

    if (!hasValidTokens || !oAuth2Client.credentials.access_token) {
      return res.status(401).json({ 
        ok: false, 
        error: "🔐 No hay autorización de YouTube. Por favor, autentica primero en /auth",
        requiresAuth: true
      });
    }

    const yt = google.youtube({ version: "v3", auth: oAuth2Client });
    await yt.playlistItems.insert({
      part: "snippet",
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId
          }
        }
      }
    });
    console.log(`✅ Canción agregada a la playlist ${playlistId}: ${videoId}`);
    
    res.json({ 
      ok: true,
      user: {
        points: 110,
        nickname: "Usuario_" + userId.slice(0,6)
      },
      successMessage: "✅ ¡Canción agregada exitosamente!"
    });
    
  } catch (err) {
    console.error("❌ Error al agregar canción:", err.message);
    if (err.message.includes("unauthorized") || err.message.includes("invalid_grant")) {
      hasValidTokens = false;
      return res.status(401).json({ 
        ok: false, 
        error: "🔐 Tu sesión de YouTube ha expirado. Por favor, vuelve a autenticarte en /auth",
        requiresAuth: true
      });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === SERVIR INTERFAZ FRONTEND (RUTAS CORREGIDAS PARA PRODUCCIÓN) ===
const publicPath = path.join(__dirname, "../public");
const indexPath = path.join(publicPath, "index.html");

// Diagnóstico en producción
if (process.env.NODE_ENV === 'production') {
  console.log("🔍 Verificando rutas en producción:");
  console.log("publicPath:", publicPath);
  console.log("indexPath:", indexPath);
  console.log("Directorio actual:", __dirname);
}

app.use(express.static(publicPath, {
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  }
}));

app.get("/", (_, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error("❌ ERROR CRÍTICO: index.html no encontrado en:", indexPath);
    try {
      const publicFiles = fs.readdirSync(publicPath);
      console.error("📁 Archivos en public/:", publicFiles);
    } catch (err) {
      console.error("❌ Error al listar public/:", err.message);
    }
    res.status(500).json({ 
      ok: false, 
      error: "Interfaz principal no disponible - index.html no encontrado",
      path_checked: indexPath
    });
  }
});

// === MANEJADOR DE ERRORES GLOBAL ===
app.use((err, req, res, next) => {
  console.error("❌ Error global:", err.stack);
  res.status(500).json({ 
    ok: false, 
    error: "Error interno del servidor" 
  });
});

// === SERVIDOR ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 MOYOFY PREMIUM ONLINE EN PUERTO ${PORT}`);
  console.log(`🌐 URL local: http://localhost:${PORT}`);
  
  const baseUrl = process.env.REDIRECT_URI 
    ? process.env.REDIRECT_URI.replace('/oauth2callback', '') 
    : `http://localhost:${PORT}`;
  
  console.log(`🔗 URL de autenticación: ${baseUrl}/auth`);
  
  // Verificación crítica al iniciar
  setTimeout(() => {
    if (!youtubeApiKey) {
      console.error("❌ ¡ALERTA! YOUTUBE_API_KEY no está configurada.");
    }
    if (!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) {
      console.error("❌ ¡ALERTA! Credenciales OAuth no configuradas.");
    }
    if (!hasValidTokens) {
      console.warn("⚠️ ¡IMPORTANTE! Necesitas autenticarte con YouTube para agregar canciones.");
      console.warn(`   Visita: ${baseUrl}/auth`);
    }
  }, 2000);
});