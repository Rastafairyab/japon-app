# Japón 2026

App de bolsillo para un viaje a Japón. Funciona sin conexión y se instala en la pantalla
de inicio del móvil (Chrome en Android).

La app publicada **no trae datos de ningún viaje**: los vuelos, alojamientos y planes se
añaden en la pestaña Viaje o se cargan desde un archivo JSON con **Viaje → Datos → Importar**
(el mismo formato que genera **Exportar**). Ese archivo no forma parte del repositorio.

- **Hoy**: cuenta atrás; durante el viaje, el día, la ciudad, el alojamiento de esa noche,
  el próximo vuelo y los planes del día.
- **Frases**: 168 frases educadas en 8 categorías, con voz en japonés, favoritas,
  buscador, modo «enseñar» a pantalla completa y repaso con tarjetas.
- **Viaje**: itinerario editable, vuelos, alojamientos (con «Enseñar al taxista») y copia
  de seguridad en JSON.
- **Mapa**: hoteles y planes en un mapa de OpenStreetMap (Leaflet), tu ubicación, «Cómo llegar»
  con Google Maps y «Situar» un lugar buscando su dirección (buscador del Instituto Geográfico de
  Japón, con confirmación). Las zonas vistas con conexión se guardan para verlas sin internet.
- **Traducir**: español ⇄ japonés escribiendo o dictando (MyMemory, necesita internet), con
  «Enseñar» a pantalla completa, voz, frases guardadas parecidas (sin conexión) y atajo a Google Traductor.

HTML, CSS y JavaScript sin frameworks ni dependencias. Los datos se guardan en el móvil
(IndexedDB); no hay servidor.

## Estructura

```
index.html              página única con la barra de pestañas
manifest.webmanifest    datos para instalarla
sw.js                   service worker (caché para usarla sin conexión)
css/styles.css
js/app.js               arranque, pestañas, avisos de versión nueva
js/db.js                IndexedDB, exportar/importar
js/seed.js              datos iniciales del viaje (vuelos y alojamientos)
js/trip.js              cálculos de fechas, día del viaje, próximo vuelo
js/phrases.js           las frases
js/speech.js            voz en japonés
js/showcard.js          pantalla completa para enseñar
js/form.js              formularios en hoja inferior
js/components.js        tarjetas de vuelo y alojamiento
js/backup.js            tarjeta de copia de seguridad
js/utils.js
js/views/               una pantalla por archivo
icons/
```

## Probar en el ordenador

Desde la carpeta que contiene `japon-app` (por ejemplo `Documentos\viaje-japon-2026`):

```bash
python serve.py
```

`serve.py` sirve solo `japon-app`, escucha solo en este ordenador (IPv4 e IPv6, así
«localhost» funciona siempre), marca con `[MÓVIL]` lo que pide el teléfono y guarda en
`diag.log` un informe que envía la app al abrirse en localhost (versión, vuelos guardados, errores).

Con el móvil por USB, lo más fiable es usar `adb` en vez del port forwarding de Chrome:

```bash
tools/platform-tools/adb.exe reverse tcp:8080 tcp:8080
```

- No arranques `python -m http.server` en otra carpeta (por ejemplo tu carpeta de usuario):
  serviría esa carpeta entera, a toda la wifi, y la app no se actualizaría.

Abre <http://localhost:8080>; deberías ver la app, no una lista de archivos. Para simular otra fecha: `http://localhost:8080/?ahora=2026-01-12T09:00#hoy`.

## Probar en el móvil por USB

1. En el móvil: activa las opciones de desarrollador (Ajustes → Sobre el teléfono → toca 7 veces
   la versión de HyperOS/MIUI) y luego **Depuración USB**.
2. Conecta el cable y acepta el aviso en el móvil.
3. Con `python serve.py` en marcha, ejecuta `tools/platform-tools/adb.exe reverse tcp:8080 tcp:8080`
   (o, en Chrome del ordenador, `chrome://inspect/#devices` → **Port forwarding…** →
   `8080` → `localhost:8080`).
4. En Chrome del móvil abre `http://localhost:8080` → ⋮ → **Instalar aplicación**.

## Si el móvil sigue con una versión antigua

En la app: **Viaje → Datos → Más opciones → Reiniciar la app**. Descarga la última versión
sin borrar planes ni favoritas. Ahí mismo se ve la versión instalada (debe coincidir con
`VERSION` de `sw.js`).

## Publicar una versión nueva

1. Cambia lo que haga falta.
2. **Sube el número de versión** en `sw.js` (`const VERSION = 'v8'`, etc.).
   Si se te olvida, los móviles seguirán con la versión anterior.
3. Sube los archivos (ver «Publicar» abajo).
4. En el móvil, al abrir la app aparecerá «Hay una versión nueva · Toca para actualizar».

Si cambias los datos iniciales de `seed.js`, sube también `SEED_VERSION`: los móviles recibirán
los vuelos y alojamientos nuevos, salvo los que se hayan editado a mano.

## Publicar gratis en GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta (que `index.html` quede en la raíz).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)` → **Save**.
3. En un par de minutos estará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
4. Abre esa dirección en Chrome del móvil → ⋮ → **Instalar aplicación**.

En la cuenta gratuita de GitHub, el repositorio de una web publicada tiene que ser
**público**. Por eso `js/seed.js` está vacío: no subas nunca el JSON de tu viaje al
repositorio; pásalo aparte (WhatsApp, correo…) e impórtalo en la app.

## Antes del viaje

- Instalad la voz japonesa **y descargadla** para usarla sin conexión:
  Ajustes → Idioma y entrada → Salida de texto a voz → Google → Japonés.
- Abrid cada pantalla una vez con conexión y probad la app en modo avión.
- Exportad una copia (Viaje → Datos) y guardadla también fuera del móvil.
