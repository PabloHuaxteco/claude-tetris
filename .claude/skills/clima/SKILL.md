---
name: clima
description: Consulta el clima actual y el pronóstico de una ciudad usando el servicio gratuito wttr.in (sin API key). Úsalo cuando el usuario pida el clima, temperatura, pronóstico o condiciones meteorológicas de un lugar. Ejemplos - "/clima", "/clima Puebla", "qué clima hace en CDMX", "dame el pronóstico de mañana en Guadalajara".
---

# Skill: Clima

Esta skill obtiene información del clima directamente desde la terminal, sin necesidad de registrar ninguna API key, usando el servicio público **wttr.in**.

## Cómo usarla

1. Determina la ciudad o ubicación:
   - Si el usuario la especifica en `args`, úsala tal cual (respeta acentos y espacios, reemplaza espacios por `+` en la URL).
   - Si no especifica ninguna, omite el nombre de ciudad en la URL: wttr.in detectará la ubicación aproximada por IP.

2. Ejecuta la consulta con la herramienta Bash (funciona igual en Git Bash) o PowerShell, usando `curl`:

   ```bash
   curl -s "wttr.in/<CIUDAD>?lang=es&format=v2"
   ```

   Notas sobre el formato:
   - `?lang=es` devuelve las descripciones en español.
   - `?format=4` es el formato recomendado por defecto: una línea compacta con condición, temperatura y viento (ej. `Puebla: ☀️  🌡️+23°C 🌬️←16km/h`).
   - `?format=3` da algo aún más corto, solo condición y temperatura (ej. `Puebla: ☀️  +23°C`).
   - Si el usuario pide más detalle (pronóstico de varios días, humedad, amanecer/atardecer, etc.), omite el parámetro `format` y usa simplemente `curl -s "wttr.in/<CIUDAD>?lang=es"` para obtener el reporte ASCII completo de 3 días.
   - No uses `format=v2`: a pesar del nombre, ese parámetro no produce un resumen compacto, devuelve el mismo reporte ASCII completo.

   Ejemplo con ciudad:
   ```bash
   curl -s "wttr.in/Puebla?lang=es&format=4"
   ```

   Ejemplo sin ciudad (autodetección por IP):
   ```bash
   curl -s "wttr.in/?lang=es&format=4"
   ```

3. Si `curl` no está disponible o la respuesta falla (sin conexión, servicio caído, nombre de ciudad no reconocido), informa al usuario del error tal cual lo devuelve el comando; no inventes datos del clima.

4. Presenta el resultado al usuario en una respuesta breve y en español, incluyendo la ciudad detectada/usada.

## Notas

- No requiere API key ni configuración adicional — es una skill autocontenida a nivel de proyecto.
- Si el usuario quiere guardar una ciudad por defecto para no tener que escribirla cada vez, puedes sugerirle agregarla como argumento en el propio comando (`/clima Puebla`) o anotarla en este archivo bajo una sección "Ciudad por defecto" si lo pide explícitamente.
