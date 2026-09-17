require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const multer = require('multer');
const express = require('express');
const QRCode = require('qrcode');
const { pdf } = require('pdf-to-img');

function rutaComoUrl(...partes) {
  const rutaNativa = path.join(...partes);
  const rutaConSlashes = rutaNativa.split(path.sep).join('/');
  return rutaConSlashes.endsWith('/') ? rutaConSlashes : rutaConSlashes + '/';
}

const pdfjsDistDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = rutaComoUrl(pdfjsDistDir, 'standard_fonts');
const CMAP_URL = rutaComoUrl(pdfjsDistDir, 'cmaps');

const SECRET = process.env.QR_SECRET;
if (!SECRET) {
  console.error('Falta QR_SECRET en el archivo .env');
  process.exit(1);
}

const DIAS_VALIDEZ_AUTOMATICA = 21;

function firmar(texto) {
  return crypto.createHmac('sha256', SECRET).update(texto).digest('hex');
}

const DB_PATH = path.join(__dirname, 'data', 'qrs.json');
function leerDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function guardarDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const app = express();
const PORT = 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ARCHIVOS_DIR = path.join(__dirname, 'data', 'archivos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(ARCHIVOS_DIR)) fs.mkdirSync(ARCHIVOS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se aceptan archivos PDF.'));
    }
    cb(null, true);
  },
});

app.use(express.json());
app.use(express.static('public'));

function decodificarQrDeBuffer(buffer) {
  const png = PNG.sync.read(buffer);
  const resultado = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return resultado ? resultado.data : null;
}

async function extraerQrDePdf(pdfPath) {
  const documento = await pdf(pdfPath, {
    scale: 3,
    docInitParams: {
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
    },
  });

  let contenidoEncontrado = null;
  let paginaEncontrada = null;
  let totalPaginas = 0;

  for await (const imagenBuffer of documento) {
    totalPaginas++;
    const contenido = decodificarQrDeBuffer(imagenBuffer);
    if (contenido) {
      contenidoEncontrado = contenido;
      paginaEncontrada = totalPaginas;
      break;
    }
  }

  return { contenido: contenidoEncontrado, pagina: paginaEncontrada, totalPaginas };
}

app.post('/api/extraer', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo PDF.' });
  }

  try {
    const { contenido, pagina, totalPaginas } = await extraerQrDePdf(req.file.path);

    if (!contenido) {
      return res.status(422).json({
        error: `No se encontró ningún código QR en el PDF (se revisaron ${totalPaginas} página(s)).`,
      });
    }

    const id = nanoid(10);
    const fechaCreacion = new Date();
    const fechaExpiracion = new Date(fechaCreacion);
    fechaExpiracion.setDate(fechaExpiracion.getDate() + DIAS_VALIDEZ_AUTOMATICA);

    const registro = {
      id,
      contenido,
      fecha_creacion: fechaCreacion.toISOString(),
      fecha_expiracion: fechaExpiracion.toISOString(),
      origen: 'pdf',
      pagina_origen: pagina,
      archivo_original: req.file.originalname,
      archivo_guardado: `${id}.pdf`,
    };
    registro.firma = firmar(`${registro.id}|${registro.contenido}|${registro.fecha_expiracion}`);

    const db = leerDB();
    db[id] = registro;
    guardarDB(db);

    const rutaPermanente = path.join(ARCHIVOS_DIR, registro.archivo_guardado);
    fs.renameSync(req.file.path, rutaPermanente);

    const urlVerificacion = `${req.protocol}://${req.get('host')}/v/${id}`;
    const qrDataUrl = await QRCode.toDataURL(urlVerificacion, { width: 256 });

    res.json({
      id,
      contenido,
      pagina_origen: pagina,
      fecha_creacion: registro.fecha_creacion,
      fecha_expiracion: registro.fecha_expiracion,
      qr: qrDataUrl,
      url: urlVerificacion,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el PDF.' });
  }
});
app.get('/api/verificar/:id', async (req, res) => {
  const db = leerDB();
  const registro = db[req.params.id];
  if (!registro) {
    return res.status(404).json({ error: 'No existe ningún registro con ese identificador.' });
  }

  const firmaEsperada = firmar(`${registro.id}|${registro.contenido}|${registro.fecha_expiracion}`);
  const integro = firmaEsperada === registro.firma;
  const ahora = new Date();
  const valido = ahora <= new Date(registro.fecha_expiracion);

  const qrDataUrl = await QRCode.toDataURL(registro.contenido, { width: 256 });
  const urlVerificacion = `${req.protocol}://${req.get('host')}/v/${registro.id}`;

  res.json({
    id: registro.id,
    contenido: registro.contenido,
    fecha_creacion: registro.fecha_creacion,
    fecha_expiracion: registro.fecha_expiracion,
    pagina_origen: registro.pagina_origen,
    archivo_original: registro.archivo_original,
    valido,
    integro,
    qr: qrDataUrl,
    url: urlVerificacion,
  });
});

app.get('/v/:id', (req, res) => {
  const db = leerDB();
  const registro = db[req.params.id];

  if (!registro) {
    return res.status(404).send(paginaMensaje('QR no encontrado', 'Este código no corresponde a ningún registro válido.', 'expirado'));
  }

  const ahora = new Date();
  const valido = ahora <= new Date(registro.fecha_expiracion);

  if (!valido) {
    return res.status(410).send(paginaMensaje(
      'Este QR ha expirado',
      `Fue extraído el ${new Date(registro.fecha_creacion).toLocaleString('es-ES')} y su validez de ${DIAS_VALIDEZ_AUTOMATICA} días terminó el ${new Date(registro.fecha_expiracion).toLocaleString('es-ES')}.`,
      'expirado'
    ));
  }

  const rutaArchivo = path.join(ARCHIVOS_DIR, registro.archivo_guardado || '');

  if (!registro.archivo_guardado || !fs.existsSync(rutaArchivo)) {
    return res.status(404).send(paginaMensaje('Archivo no disponible', 'El archivo original ya no está disponible en el servidor.', 'expirado'));
  }

  return res.download(rutaArchivo, registro.archivo_original || 'documento.pdf');
});

function paginaMensaje(titulo, texto, tipo) {
  const color = tipo === 'valido' ? '#3c6e52' : '#b0483f';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<style>
  body{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f6f4ee; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding:24px; }
  .box{ max-width:400px; background:#fff; border:1px solid #d8d3c4; border-radius:6px; padding:32px; text-align:center; }
  h1{ color:${color}; font-size:1.2rem; margin:0 0 12px; }
  p{ color:#4a463c; font-size:0.95rem; line-height:1.5; margin:0; word-break:break-word; }
</style>
</head>
<body><div class="box"><h1>${titulo}</h1><p>${texto}</p></div></body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`Servidor de extracción de QR corriendo en http://localhost:${PORT}`);
});
