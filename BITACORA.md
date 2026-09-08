# Bitácora

Registro de decisiones y de lo que se hizo, en orden. Lo que no está acá se
lee del código; lo que está acá es el *por qué*.

---

## 2026-09-08 — F0: corte del proyecto original

**Qué se hizo.** Se quitaron los remotos `origin` (malenitaa/manos) y `fork`
(DecoudJuan/manos), se apuntó `origin` a `DecoudJuan/Guitar-Learning`, se
consolidó todo en la rama `main` y se borró la rama de trabajo vieja.

**Decisión: partir del código de `manos` en vez de empezar de cero.** Lo que se
hereda vale mucho y es lo caro de escribir: el pipeline de MediaPipe con filtro
One Euro, la histéresis de dedos medida sobre landmarks *world* (que es lo que
hace que sobreviva a la rotación de la mano), la gracia por mano ante pérdidas
de detección, el andamiaje de i18n con claves tipadas, y la disciplina de DOM
sin `innerHTML`. Todo eso aplica igual a mirar una mano sobre un diapasón.

**Decisión: el audio se va entero.** El pedido es explícito y además es
coherente: si la app enseña guitarra, el sonido lo produce la guitarra del
alumno. Un sintetizador competiría con el instrumento real. "Acústica" y
"eléctrica" sobreviven como *tipo de guitarra*, no como timbre: cambian la
geometría del mástil (ancho de cejuela, cantidad de trastes accesibles) y las
digitaciones que se sugieren, no el sonido.

---

## 2026-09-08 — F1: demolición

**Qué se hizo.** Se borraron `src/audio/` (sinte, voces, timbres, batería,
efectos, grabadores WAV y video), `src/midi/`, `src/music/chords.ts` y todo lo
que en `App` traducía gestos a frecuencias. `src/music/theory.ts` se conservó
recortado: los nombres de las doce notas y la aritmética de semitonos siguen
haciendo falta para nombrar lo que se pisa.

**Decisión: se conserva `src/song/parse.ts` intacto.** Parsear un cifrado
pegado ("Am F C G" sobre la letra) es exactamente lo que hace falta para la
fase de canciones, y ese parser ya aprendió a la mala que las letras parecen
acordes. Reusarlo es gratis.

**Decisión: se conserva `src/gesture/Steady.ts` y la histéresis.** El problema
que resolvían —que un valor discreto no parpadee entre frames— es idéntico
cuando lo discreto es "el dedo 3 está en el traste 2" en vez de "el acorde es
un IV". Sin esto, el feedback titila y es inusable.

---

## 2026-09-08 — F2: dominio de la guitarra

**Decisión: los trastes se calculan, no se tabulan.** La posición del traste
`n` sobre la escala es `1 - 2^(-n/12)`. Una tabla sería equivalente pero
mentiría sobre el origen del número; la fórmula deja claro que un diapasón es
una escala logarítmica y permite cualquier largo de escala (Fender 25.5",
Gibson 24.75") con un solo parámetro.

**Decisión: la biblioteca de acordes guarda digitación, no solo notas.** Un
acorde de guitarra no es un conjunto de notas: es una posición concreta de
dedos. Enseñar requiere decir "el dedo anular va en la tercera cuerda, segundo
traste", así que cada forma guarda `{ dedo, cuerda, traste }` más las cuerdas
al aire y las silenciadas.

---

## 2026-09-08 — F3/F4: el diapasón

**Decisión: homografía de 4 puntos como base, detección automática encima.**
Un diapasón visto en perspectiva es un cuadrilátero; con las cuatro esquinas
(cejuela y traste 12) alcanza para una homografía que convierte cualquier píxel
en coordenadas (cuerda, traste). La calibración manual va primero porque es
determinista y se puede depurar; la detección automática por Hough se apoya en
la misma representación, así que puede fallar sin romper nada.

**Decisión: visión clásica, no otro modelo.** Meter un segundo modelo (YOLO,
segmentación) costaría megabytes de descarga, tiempo de GPU compitiendo con el
tracker de manos, y una dependencia más. Un diapasón es el caso ideal de la
transformada de Hough: seis rectas casi paralelas y equiespaciadas, cruzadas
por trastes perpendiculares y brillantes. Se implementa a mano sobre el
`ImageData` del canvas.

---

## 2026-09-08 — F5/F6: leer y evaluar la mano

**Decisión: se evalúa por dedo, no por acorde.** Decir "mal" no enseña. El
evaluador compara cada dedo objetivo con el más cercano de los detectados y
devuelve un diagnóstico: correcto, cuerda equivocada, traste equivocado, o
ausente. La UI recién entonces decide cómo decirlo.

**Decisión: tolerancia configurable.** Una yema no cae en el centro geométrico
del casillero, y la homografía tiene error. La tolerancia (en fracciones de
casillero) es un ajuste del alumno: estricta para pulir, generosa para empezar.

---

## 2026-09-08 — F7: lecciones

**Decisión: sostener, no tocar de paso.** Un acorde cuenta como logrado
después de mantenerlo correcto durante un tiempo continuo (por defecto ~1s).
Eso separa el acierto real del dedo que pasó por ahí, y es además lo que hay
que entrenar: la mano tiene que *quedarse*.

**Decisión: el progreso vive en localStorage y se trata como hostil.** Igual
que los ajustes: se valida y se recorta al cargar. Un progreso corrupto vuelve
a cero en vez de romper la app.
