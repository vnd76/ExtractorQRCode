const dropZone = document.getElementById('drop-zone');
const pdfInput = document.getElementById('pdf-input');
const fileName = document.getElementById('file-name');
const extractBtn = document.getElementById('extract-btn');
const errorMsg = document.getElementById('error-msg');
const result = document.getElementById('result');

let archivoSeleccionado = null;

dropZone.addEventListener('click', () => pdfInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) seleccionarArchivo(e.dataTransfer.files[0]);
});
pdfInput.addEventListener('change', () => {
  if (pdfInput.files.length) seleccionarArchivo(pdfInput.files[0]);
});

function seleccionarArchivo(file) {
  if (file.type !== 'application/pdf') {
    errorMsg.textContent = 'Solo se aceptan archivos PDF.';
    errorMsg.classList.add('show');
    return;
  }
  errorMsg.classList.remove('show');
  archivoSeleccionado = file;
  fileName.textContent = file.name;
  extractBtn.disabled = false;
}

extractBtn.addEventListener('click', async () => {
  if (!archivoSeleccionado) return;

  errorMsg.classList.remove('show');
  extractBtn.disabled = true;
  extractBtn.textContent = 'Extrayendo...';

  const formData = new FormData();
  formData.append('pdf', archivoSeleccionado);

  try {
    const resp = await fetch('/api/extraer', { method: 'POST', body: formData });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || 'Error al extraer el QR.');
    }

    document.getElementById('qrcode').innerHTML = `<img src="${data.qr}" alt="QR extraído">`;
    document.getElementById('result-contenido').textContent = data.contenido;
    document.getElementById('result-pagina').textContent = data.pagina_origen;
    document.getElementById('validity-note').textContent =
      'Válido hasta: ' + new Date(data.fecha_expiracion).toLocaleString('es-ES');
    document.getElementById('url-note').innerHTML =
      `Probar sin escanear: <a href="${data.url}" target="_blank">${data.url}</a>`;

    result.classList.add('show');
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.classList.add('show');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extraer QR';
  }
});
