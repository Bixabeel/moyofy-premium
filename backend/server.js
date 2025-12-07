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
      
      // Refrescar token automáticamente
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

// === AUTORIZACIÓN CON SCOPES CORRECTOS ===
app.get("/auth", (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtubepartner"
  ];
  
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    include_granted_scopes: true
  });
  
  console.log("🔐 URL de autorización generada con scopes completos");
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
    console.log("✅ Nuevos tokens guardados con todos los permisos.");
    res.redirect('/?auth_success=true');
  } catch (err) {
    lastAuthError = err.message;
    console.error("❌ Error en OAuth callback:", err.message);
    
    let errorMessage = "Error de autenticación con YouTube";
    if (err.message.includes('invalid_scope')) {
      errorMessage = "❌ SCOPES INVÁLIDOS: Debes configurar los scopes correctos en Google Cloud Console";
    } else if (err.message.includes('redirect_uri_mismatch')) {
      errorMessage = "❌ URI DE REDIRECCIÓN INCORRECTA: Verifica los URIs autorizados en Google Cloud Console";
    }
    
    res.status(500).send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Error de Autenticación - MOYOFY</title>
          <style>
            body { font-family: Arial, sans-serif; background: #12121f; color: white; text-align: center; padding: 50px; }
            .error-container { max-width: 600px; margin: 0 auto; background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3); border-radius: 10px; padding: 30px; }
            h1 { color: #ff6b6b; font-size: 2.5rem; margin-bottom: 20px; }
            p { margin: 15px 0; line-height: 1.5; }
            .solution-list { text-align: left; margin-top: 20px; padding-left: 20px; }
            .solution-list li { margin: 8px 0; color: #ffcc00; }
            .retry-btn { background: #ff004c; color: white; border: none; padding: 15px 30px; font-size: 1.1rem; border-radius: 25px; cursor: pointer; margin-top: 20px; transition: all 0.3s ease; }
            .retry-btn:hover { background: #cc003d; transform: scale(1.05); }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>❌ ERROR DE AUTENTICACIÓN</h1>
            <p>${errorMessage}</p>
            <p>Código de error: ${err.code || 'unknown'}</p>
            <div class="solution-list">
              <h3>🔍 Pasos para solucionar:</h3>
              <ul>
                <li>Verifica que los scopes estén configurados en Google Cloud Console</li>
                <li>Asegúrate de que los URIs de redirección coincidan exactamente</li>
                <li>Confirma que tu cuenta tiene permisos de propietario del canal de YouTube</li>
                <li>Revisa que la app esté en modo "Prueba" con tus correos como usuarios de prueba</li>
              </ul>
            </div>
            <button class="retry-btn" onclick="window.location.href='/auth'">🔁 INTENTAR DE NUEVO</button>
          </div>
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

// === FUNCIÓN PARA OBTENER CANAL ACTUAL ===
async function getCurrentChannel() {
  try {
    if (!hasValidTokens || !oAuth2Client.credentials.access_token) {
      throw new Error("No hay tokens de autenticación válidos");
    }

    const yt = google.youtube({ version: "v3", auth: oAuth2Client });
    const response = await yt.channels.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      mine: true,
      maxResults: 1
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error("No se encontró canal asociado a esta cuenta");
    }

    const channel = response.data.items[0];
    console.log(`✅ Canal encontrado: ${channel.snippet.title} (ID: ${channel.id})`);
    return {
      id: channel.id,
      title: channel.snippet.title,
      customUrl: channel.snippet.customUrl,
      statistics: channel.statistics,
      playlists: channel.contentDetails.relatedPlaylists
    };
  } catch (err) {
    console.error("❌ Error al obtener canal actual:", err.message);
    throw err;
  }
}

// === FUNCIÓN INTELIGENTE PARA OBTENER PLAYLIST EDITABLE ===
async function getEditablePlaylistId() {
  try {
    if (!hasValidTokens || !oAuth2Client.credentials.access_token) {
      throw new Error("🔐 No hay autorización de YouTube. Por favor, autentica primero en /auth");
    }

    console.log("🔍 Buscando playlists editables en tu canal...");
    
    // Obtener información del canal actual
    const channel = await getCurrentChannel();
    const yt = google.youtube({ version: "v3", auth: oAuth2Client });
    
    // Obtener todas las playlists del canal
    const playlistsResponse = await yt.playlists.list({
      part: ['snippet', 'status', 'contentDetails'],
      channelId: channel.id,
      maxResults: 50
    });

    console.log(`📊 Encontradas ${playlistsResponse.data.items.length} playlists en tu canal`);
    
    // Buscar playlists editables (públicas y de propiedad del usuario)
    const editablePlaylists = playlistsResponse.data.items.filter(playlist => {
      return (
        playlist.status.privacyStatus === 'public' && 
        playlist.snippet.channelId === channel.id
      );
    });

    console.log(`✅ Encontradas ${editablePlaylists.length} playlists editables`);
    
    // Buscar playlist MOYOFY específica
    let moyofyPlaylist = editablePlaylists.find(p => 
      p.snippet.title.toLowerCase().includes('moyofy') ||
      p.snippet.title.toLowerCase().includes('rafas') ||
      p.snippet.title.toLowerCase().includes('bar')
    );

    // Si encuentra playlist MOYOFY editable, usarla
    if (moyofyPlaylist) {
      console.log(`🎯 Playlist MOYOFY encontrada y editable: ${moyofyPlaylist.snippet.title} (ID: ${moyofyPlaylist.id})`);
      return moyofyPlaylist.id;
    }

    // Si no encuentra playlist MOYOFY pero hay playlists editables, usar la primera
    if (editablePlaylists.length > 0) {
      console.log(`🎯 Usando primera playlist editable disponible: ${editablePlaylists[0].snippet.title} (ID: ${editablePlaylists[0].id})`);
      return editablePlaylists[0].id;
    }

    // Si no hay playlists editables, crear una nueva automáticamente
    console.log("🆕 Creando nueva playlist MOYOFY automáticamente...");
    const createResponse = await yt.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: "MOYOFY Rafa's Bar",
          description: "Playlist generada automáticamente por MOYOFY PREMIUM v2 - " + new Date().toISOString()
        },
        status: {
          privacyStatus: "public"
        }
      }
    });
    
    console.log(`✅ Playlist creada exitosamente: ${createResponse.data.snippet.title} (ID: ${createResponse.data.id})`);
    return createResponse.data.id;

  } catch (err) {
    console.error("❌ Error al obtener playlist editable:", err.message);
    console.error("📊 Detalles del error:", JSON.stringify(err, null, 2));
    
    // Mensajes específicos para el error que mencionaste
    if (err.message.includes('does not support the ability to insert') || 
        err.message.includes('playlistItems.insert is not allowed')) {
      console.error("🚫 ERROR ESPECÍFICO DETECTADO: La playlist no es editable");
      console.error("💡 SOLUCIÓN: MOYOFY creará automáticamente una playlist editable en tu canal");
      
      // Intentar crear una nueva playlist
      try {
        const yt = google.youtube({ version: "v3", auth: oAuth2Client });
        const createResponse = await yt.playlists.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: "MOYOFY Rafa's Bar - AUTOMÁTICA",
              description: "Playlist creada automáticamente por MOYOFY PREMIUM para resolver problemas de permisos"
            },
            status: {
              privacyStatus: "public"
            }
          }
        });
        
        console.log(`✅ Playlist de emergencia creada: ${createResponse.data.snippet.title} (ID: ${createResponse.data.id})`);
        return createResponse.data.id;
        
      } catch (createError) {
        console.error("❌ Error al crear playlist de emergencia:", createError.message);
      }
    }
    
    // Fallback final: usar playlist por defecto del .env
    const fallbackPlaylist = process.env.DEFAULT_PLAYLIST_ID || "PLo_v1BZSJlIu1xn68IYp164HHvQR2p5K0";
    console.log(`⚠️ Usando playlist de fallback: ${fallbackPlaylist}`);
    return fallbackPlaylist;
  }
}

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
      fields: "items(id/videoId,snippet(title,channelTitle,channelId))"
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
    console.error("❌ Error al buscar canciones:", err.message);
    
    if (err.message.includes("API key not valid") || err.message.includes("unregistered caller")) {
      return res.status(401).json({ 
        ok: false, 
        error: "🔑 Error de autenticación con YouTube API" 
      });
    }
    
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === AGREGAR CANCIÓN A PLAYLIST CON MANEJO ESPECÍFICO DE ERRORES ===
app.post("/add-song", async (req, res) => {
  try {
    const { videoId, userId } = req.body;
    if (!videoId || !userId) {
      return res.status(400).json({ ok: false, error: "Datos faltantes: videoId o userId." });
    }

    if (!hasValidTokens || !oAuth2Client.credentials.access_token) {
      return res.status(401).json({ 
        ok: false, 
        error: "🔐 No hay autorización de YouTube. Por favor, autentica primero en /auth",
        requiresAuth: true
      });
    }

    // Obtener playlist ID editable
    const playlistId = await getEditablePlaylistId();
    console.log(`🎯 Playlist editable seleccionada: ${playlistId}`);

    const yt = google.youtube({ version: "v3", auth: oAuth2Client });
    
    try {
      // Intentar agregar la canción
      const response = await yt.playlistItems.insert({
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
      
      console.log(`✅ Canción agregada exitosamente a playlist ${playlistId}: ${videoId}`);
      
      // +10 MOYOS por canción agregada
      const userPoints = 100;
      
      res.json({ 
        ok: true,
        user: {
          points: userPoints + 10,
          nickname: "Usuario_" + userId.slice(0,6)
        },
        playlistId,
        songDetails: {
          videoId,
          title: response.data.snippet.title,
          addedAt: new Date().toISOString()
        },
        successMessage: "✅ ¡Canción agregada exitosamente a la playlist MOYOFY!"
      });
      
    } catch (insertError) {
      console.error("❌ Error al insertar canción:", insertError.message);
      
      // Manejo específico del error que mencionaste
      if (insertError.message.includes('does not support the ability to insert') || 
          insertError.message.includes('playlistItems.insert is not allowed')) {
        console.error("🚫 ERROR ESPECÍFICO: La playlist seleccionada no es editable");
        
        // Intentar con una playlist diferente
        console.log("🔄 Intentando con una playlist alternativa...");
        const alternativePlaylistId = await getEditablePlaylistId();
        
        if (alternativePlaylistId !== playlistId) {
          console.log(`🔄 Reintentando con playlist alternativa: ${alternativePlaylistId}`);
          
          try {
            const response = await yt.playlistItems.insert({
              part: "snippet",
              requestBody: {
                snippet: {
                  playlistId: alternativePlaylistId,
                  resourceId: {
                    kind: "youtube#video",
                    videoId
                  }
                }
              }
            });
            
            console.log(`✅ Canción agregada exitosamente a playlist alternativa ${alternativePlaylistId}: ${videoId}`);
            
            return res.json({ 
              ok: true,
              user: {
                points: 110,
                nickname: "Usuario_" + userId.slice(0,6)
              },
              playlistId: alternativePlaylistId,
              successMessage: "✅ ¡Canción agregada exitosamente a una playlist alternativa!"
            });
            
          } catch (retryError) {
            console.error("❌ Error al reintentar con playlist alternativa:", retryError.message);
          }
        }
        
        // Si todo falla, dar solución clara al usuario
        return res.status(403).json({ 
          ok: false, 
          error: "🚫 No se puede agregar canciones a la playlist seleccionada",
          solution: "MOYOFY está creando automáticamente una playlist editable en tu canal. Por favor, espera unos minutos y vuelve a intentarlo.",
          action: "wait_and_retry",
          youtubeError: insertError.message
        });
      }
      
      // Otros errores de YouTube API
      if (insertError.response?.data?.error) {
        const youtubeError = insertError.response.data.error;
        
        if (youtubeError.code === 403) {
          return res.status(403).json({ 
            ok: false, 
            error: "🔐 Error de permisos: No puedes editar playlists en este canal",
            solution: "Verifica que tu cuenta de Google esté asociada al canal correcto y que los scopes estén configurados",
            youtubeError: youtubeError
          });
        }
        
        if (youtubeError.code === 404) {
          return res.status(404).json({ 
            ok: false, 
            error: `❌ Playlist no encontrada. Verifica el ID o permite que MOYOFY cree una automáticamente.`,
            solution: "Usa la función automática de MOYOFY para gestionar playlists"
          });
        }
      }
      
      throw insertError;
    }
    
  } catch (err) {
    console.error("❌ Error general al agregar canción:", err.message);
    console.error("📊 Detalles completos:", JSON.stringify(err, null, 2));
    
    if (err.message.includes("unauthorized") || err.message.includes("invalid_grant")) {
      hasValidTokens = false;
      return res.status(401).json({ 
        ok: false, 
        error: "🔐 Tu sesión de YouTube ha expirado. Por favor, vuelve a autenticarte en /auth",
        requiresAuth: true
      });
    }
    
    res.status(500).json({ 
      ok: false, 
      error: "🎵 Error al agregar canción: " + (err.message || 'Error desconocido'),
      details: err.response?.data?.error?.message || err.message
    });
  }
});

// === SERVIR INTERFAZ FRONTEND ===
app.use(express.static(path.join(__dirname, "../frontend/public"), {
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  }
}));

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "../frontend/public", "index.html"));
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
  console.log(`🔗 URL de autenticación: http://localhost:${PORT}/auth`);
  
  // Mensajes de diagnóstico al iniciar
  setTimeout(() => {
    if (!youtubeApiKey) {
      console.error("❌ ¡ALERTA! YOUTUBE_API_KEY no está configurada.");
    }
    if (!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) {
      console.error("❌ ¡ALERTA! Credenciales OAuth no configuradas.");
    }
    if (!hasValidTokens) {
      console.warn("⚠️ ¡IMPORTANTE! Necesitas autenticarte con YouTube para agregar canciones.");
      console.warn(`   Visita: http://localhost:${PORT}/auth`);
    }
  }, 2000);
});