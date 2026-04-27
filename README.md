# Catalogo Web conectado a Google Drive

Este proyecto muestra carpetas y fotos de Google Drive como un catalogo web navegable.

## 1) Crear credenciales en Google Cloud

1. Entra a Google Cloud Console.
2. Crea un proyecto (o usa uno existente).
3. Activa la API de Google Drive.
4. Crea una API Key.
5. Crea un OAuth Client ID de tipo **Web application**.
6. En **Authorized JavaScript origins**, agrega la URL donde vas a abrir esta web.
   - Ejemplo local: `http://localhost:5500`

## 2) Configurar el proyecto

Edita `app.js` y completa:

- `CLIENT_ID`
- `API_KEY`
- `ROOT_FOLDER_ID` (ID de la carpeta raiz de tu catalogo en Drive)

## 3) Ejecutar localmente

Cualquier servidor estatico funciona. Ejemplo con VS Code Live Server o con Python:

```bash
python3 -m http.server 5500
```

Luego abre:

```text
http://localhost:5500
```

## 4) Permisos en Drive

- Si usas tu cuenta personal, al conectar se pedira permiso de lectura (`drive.readonly`).
- Si usas carpetas compartidas o Shared Drives, la app ya usa `supportsAllDrives`.

## Notas

- Esta version muestra carpetas e imagenes (`image/*`).
- Si una imagen no tiene miniatura disponible, la app intenta descargarla para generar vista previa.
