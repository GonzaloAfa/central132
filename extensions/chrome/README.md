# Central132 Chrome Extension

Extensión de Chrome (Manifest V3) para traducir claves radiales en los popups de `https://central132.cl/*`.

## Que hace

- Detecta el popup que aparece al hacer click en una emergencia.
- Extrae la clave del titulo (ejemplo: `10-3-1 en Las Condes`).
- Busca traduccion en diccionario local (`src/data/codes.full.json`).
- Aplica microcopy ciudadano para que el tipo de emergencia se entienda rapido.
- Agrega una linea extra:
  - `En palabras simples` + tipo principal + detalle corto.
  - o `Código no catalogado` cuando no hay mapeo.
- Si no encuentra clave exacta, aplica fallback jerarquico:
  - `10-3-1` -> `10-3` -> `10`.

## Estructura

- `manifest.json`: configuracion MV3.
- `src/content.js`: logica principal de traduccion e inyeccion DOM.
- `src/styles.css`: estilo de la linea de traduccion.
- `src/data/codes.full.json`: diccionario local completo.
- `tools/build-dictionary.mjs`: script para regenerar diccionario desde la fuente.

## Regenerar diccionario

```bash
node tools/build-dictionary.mjs
```

Ese comando descarga la tabla de:

- `https://noticias.masternet.cl/claves-radiales-articulo-noticias-1440702877.html`

Y genera/actualiza:

- `src/data/codes.full.json`

## Instalar en Chrome

1. Abre `chrome://extensions`.
2. Activa `Developer mode`.
3. Click en `Load unpacked`.
4. Selecciona la carpeta `extensions/chrome/` de este repo.

## Validacion rapida

1. Entra a `https://central132.cl/`.
2. Haz click en un marcador del mapa.
3. Verifica que aparezca la linea `Clave traducida` en el popup.
4. Repite con varios marcadores para confirmar que no se duplique la linea.

## Nota de red

Durante uso normal de la extensión no se hacen llamadas a `noticias.masternet.cl`.
Solo el script `tools/build-dictionary.mjs` usa esa URL cuando tu quieres regenerar el diccionario.
