# 0003 · Caché de la IA en la base de datos

- **Estado:** aceptada · **Fecha:** 2026-10-19

## Contexto
La cuota gratuita de Gemini es baja y cada página cuesta una llamada larga. En una demostración se repite la misma orden («una landing para una cafetería en Pasto») y se vuelve a ejemplos ya usados. Una caché en memoria se pierde en cada redespliegue o cuando Render duerme el servicio.

## Decisión
- **Tabla `ia_cache`.** La clave es el SHA-256 de la versión del prompt, el modo (generar o editar), la orden normalizada (sin mayúsculas, espacios de más ni punto final) y, al editar, el HTML actual. El valor es `{ html, modo }`, ya validado.
- **Se busca antes de llamar a Gemini.** Si hay un acierto, el stream manda directamente `final` con `desdeCache: true`, y el frontend arma la página por bloques igual y dice «desde la caché».
- **Es compartida entre usuarios:** la clave no tiene datos personales, solo la orden y la página.

## Consecuencias
- La misma orden sobre la misma página nunca vuelve a llamar a Gemini.
- Cambiar los prompts exige subir `VERSION_PROMPT`; si no, se seguirían sirviendo páginas del prompt anterior.
- La tabla crece sin límite. Se puede borrar lo antiguo por `creado_en` sin efectos en la app.
