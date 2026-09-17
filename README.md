# ExtractorQRCode

### Descripción - Español
Aplicación sencilla que extrae códigos QR a partir de un documento PDF.

---
### Pasos para Ejecutar

#### 1. Instalar dependencias.

```
npm install
```

Lee el archivo _package.json_ y descarga los archivos necesarios dentro de una carpeta llamada _node_modules_.

#### 2. Crear una clave secreta.

Ejecutamos el siguiente comando:

```
node -e "console.record(require('crypto').randomBytes(32).toString('hex'))"
```

Ahora crearemos un archivo **.env** e insertaremos el resultado del comando aquí.

```
QR_SECRET=CLAVE_GENERADA_AQUI
```

Este archivo es importante para el funcionamiento del servidor, ya que se encarga de firmar cada QR (autenticidad). 

#### 3. Levantar el servidor.

Se ejecuta en la terminal:

```
node server.js
```
Y debería verse: 

```
Servidor corriendo en http://localhost:3000
```

---

### Ejecución

1. El usuario arrastra o selecciona un PDF.
2. Al hacer click en extraer QR:
   - Si no se encontró ningún código QR responde con error 422, no crea ningún registro.
   - Si se encontró:
     - Genera un id único.
     - Calcula automáticamente la fecha de expiración (ahora + 21 días).
     - Firma el registro con HMAC.
     - Guarda el registro en _data/qrs.json_.
     - Mueve el PDF a _data/archivos/{id}.pdf_.
     - Genera un QR nuevo que apunta a:
       ```
       http://localhost:3000/v/ID
       ```
       
3. Devuelve el contenido extraído, la fecha de expiración y la imagen del código QR.

---

### Description - English

Simple app to extracts QR codes from a document.

---
### Steps to follow

#### 1. Install dependencies.

```
npm install
```

This command reads _package.json_ and downloads the required dependencies into the _node_modules_ folder.

#### 2. Create a secret key.

Run the following command:

```
node -e "console.record(require('crypto').randomBytes(32).toString('hex'))"
```

Then, create the file **.env** and add the result of the previous command here.

```
QR_SECRET=GENERATED_KEY_HERE
```

This file is important for the server to work, as it signs each QR code (authenticity).

#### 3. Start the server.

Run the following command:

```
node server.js
```
You should see: 

```
Server running in http://localhost:3000
```

---

### How it works

1. The user drags or selects a document.
2. Once the user clicks in "extract QR":
   - If no QR code is found, the page returns an error and doesn't create any records.
   - If a QR code is found:
     - A unique id is generated.
     - The expiration date is automatically calculated (now + 21 days).
     - The record is signed with HMAC (so it can detect if it was edited manually).
     - This record is saved in _data/qrs.json_.
     - Moves the document to _data/archivos/{id}.pdf_.
     - The QR code is generated with its own URL:
       ```
       http://localhost:3000/v/ID
       ```
       
3. The QR code info is displayed (content, expiration date and QR code image).
