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

---

## 2026-09-08 — F8/F9: dibujar y la interfaz

**Decisión: la flecha.** Un punto rojo dice que el dedo está mal; una flecha
desde donde está hasta donde va dice la corrección entera, de un vistazo y sin
idioma. Es lo más útil que hay en pantalla y por eso `chordLayer` existe como
capa separada del juez: el juez decide qué es verdad, esa capa decide qué vale
la pena mostrar, y casi todo lo cierto sobre un acorde mal puesto es ruido.

**Decisión: el diagrama clásico se mantiene.** Es la notación que el alumno va a
encontrar en cualquier cancionero. Una clase que enseña su propia notación
privada lo deja sin poder leer nada más. Los mismos tres colores en la cámara y
en el diagrama unen las dos vistas sin explicación.

**Decisión: se elimina el ajuste de tempo.** Quedó heredado de la idea del
metrónomo visual para los cambios cronometrados, pero nada lo usa. Una perilla
que no hace nada es una mentira sobre lo que el programa puede hacer; vuelve
cuando vuelva la función.

**Decisión: la práctica libre llega a toda la biblioteca desde el primer
minuto.** El bloqueo de lecciones ordena un curso para quien no sabe qué
practicar después; nunca quiso negarle un Do a alguien que quiere probarlo.

---

## 2026-09-08 — F10: deploy

**Qué se hizo.** CSP ajustada (sin micrófono, sin MIDI: se apagan en la
`Permissions-Policy` en vez de quedar simplemente sin usar), `base` de Vite de
vuelta a `/` para Vercel, y README, SECURITY y CLAUDE reescritos alrededor de lo
que la app es ahora.

**Decisión: SECURITY.md se reescribe entero en vez de recortarse.** El documento
original prometía cosas sobre grabaciones, micrófono y MIDI que ya no existen.
Un documento de seguridad que describe un programa anterior es peor que no
tenerlo: se lee como una promesa verificada cuando ya no verifica nada.

**Pendiente honesto.** No hay tests automáticos — la única red es `tsc` en modo
estricto. La lógica difícil (homografía, geometría, juez, viewport) está escrita
como funciones puras justamente para que se pueda probar sin cámara el día que
se agregue un runner; no se agregó ahora para no meter una dependencia de
desarrollo en la misma pasada en que se sacaron todas.

---

## 2026-09-08 — F11: el afinador

**Qué se hizo.** Se agregó `src/tuner/`: micrófono, detección de tono y mapeo a
la cuerda al aire más cercana, con un panel de seis filas que se van tildando.

**Decisión: vuelve el micrófono, y se dice.** Es la única excepción a "todo se
resuelve mirando", y no es negociable: una cuerda floja y una tensa son la misma
foto. La CSP y la `Permissions-Policy` se abren para `microphone=(self)` y
SECURITY.md pasa a describirlo en detalle. Lo que se mantiene entero es el
contrato: se abre al abrir el afinador, se cierra —pistas detenidas, contexto
cerrado— al cerrarlo o al ocultarse la pestaña, y la señal llega a un
`AnalyserNode` y a ningún lado más. Nunca a los parlantes, que es además lo que
hace imposible el acople con una guitarra frente a la notebook.

**Decisión: MPM y no autocorrelación pelada.** La autocorrelación simple tiene
picos que se achican con el lag, así que lee el mi grave como su propia octava:
el alumno ve que su cuerda más gruesa está una octava alta y un afinador que no
se decide. La normalización del NSDF elimina ese sesgo. Por la misma razón se
elige el *primer* pico que llegue al 90% del mejor y no el mejor: una cuerda
pulsada es rica en armónicos y el pico más alto suele ser la octava.

**Decisión: los umbrales salen de medir, no de estimar.** Contra pulsaciones
sintéticas con ruido blanco encima, la claridad cae con la señal: limpia da
0.99+, con ruido moderado 0.97 y el error sigue debajo de dos cents, y con
ruido fuerte da 0.88 mientras la respuesta ya se corrió veintitrés cents.
`MIN_CLARITY` quedó en 0.93, arriba de ese punto. Un afinador que calla en una
sala ruidosa es mejor que uno que miente con seguridad.

**Decisión: se busca la cuerda al aire, no la nota cromática.** "Fa#, 40 cents
bajo" sirve a quien ya sabe. El principiante necesita "esa es la cuarta, tensala".
El límite para reclamar una cuerda bajó de 250 a 150 cents: con 250, como la
distancia máxima entre cuerdas contiguas es de cinco semitonos, *cualquier* tono
reclamaba alguna cuerda — incluida una nota pisada, que aparecía como una cuerda
al aire horriblemente desafinada y mandaba al alumno a mover una clavija que
estaba bien.

**Decisión: la cuerda tiene que *sostenerse* afinada para tildarse.** Misma
razón que el acorde: una clavija que pasa por la tensión correcta camino a otro
lado no es una cuerda afinada.

---

## 2026-09-09 — F12: la primera prueba con una guitarra de verdad

Dos fallas reportadas desde el uso real. Una era mía y grave; la otra sigue
abierta y ahora está medida.

### Los dedos de un acorde aparecían separados por tres trastes

**Causa.** La calibración confiaba en que el alumno clickeara las cuatro
esquinas exactamente en el orden pedido. La intro decía "hacé clic en las
cuatro esquinas del diapasón" —que invita a dar la vuelta al rectángulo— y los
pasos pedían cejuela-grave, cejuela-agudo, traste12-agudo, traste12-grave. Son
dos instrucciones distintas. Clickeando en el orden que invita la intro, la
homografía mapea el eje "a lo ancho del mástil" sobre el eje "a lo largo": la
grilla se dibuja igual, la app sigue andando, y cada acorde sale con los dedos
desparramados por medio mástil. **Nada avisa que algo está mal**, que es lo peor
del asunto.

**Decisión: no depender del orden.** `orderCorners` deduce el orden de la forma
de lo clickeado, y un mástil se delata solo: es mucho más largo que ancho, así
que los dos lados *cortos* del cuadrilátero son las puntas; y se abre hacia el
cuerpo, así que la punta más angosta es la cejuela. Lo único irrecuperable de
la forma es cuál lado es el mi grave —eso es para qué lado está puesta la
guitarra, no qué forma tiene— y para eso está el botón de dar vuelta. Verificado
contra los cuatro órdenes de clic posibles.

**Decisión: el traste marcado es ajustable.** Un diapasón tiene esquinas en su
*extremo*, no en el traste 12, así que pedir "las esquinas del diapasón"
consigue exactamente eso: un mástil estirado al doble. Ahora hay un stepper que
corrige el número contra la grilla dibujada sobre el mástil real. Se verifica
mirando, no confiando.

### El detector automático no encuentra el mástil

**Qué se hizo.** Se reescribió entero y —más importante— se volvió medible: el
análisis se separó del canvas (`detectInGrey`) y `scripts/neck-check.mjs` lo
corre contra una foto fija, con un decodificador PNG propio para no sumar
dependencias. Todas las constantes que hoy tienen un número en su comentario
salieron de ahí.

Lo que se aprendió corriendo, en orden:

- **El PCA sobre todos los bordes del cuadro era una fantasía.** El comentario
  original decía que las cuerdas dominan cualquier foto con una guitarra. No es
  cierto: una cama, un almohadón y una remera con letras las superan cómodas.
- **`PEAK_THRESHOLD` a 0.25 del pico máximo dejaba 3 líneas en toda la imagen.**
  Una cuerda es fina y corta; el borde de una cama la supera muchas veces. A
  0.05 aparecen sesenta líneas y seis son las cuerdas.
- **A 320px de ancho las cuerdas caen a 3px y el ángulo sale 10° torcido.** A
  480px, el mismo cuadro da el ángulo del mástil con un grado de error.
- **Con umbral global, dentro del mástil quedaban 121 píxeles de borde y cero
  trastes.** El diapasón es lo más oscuro de una habitación iluminada. Con
  umbral calculado *dentro* de la banda de las cuerdas, 856.
- **Los trastes que sí aparecen están todos juntos cerca de la cejuela**, donde
  pega la luz. Pedirles que definan el largo del mástil daba un "mástil" de 24
  píxeles, así que el largo pasó a salir de hasta dónde llegan las cuerdas.

**Y sin embargo sigue fallando.** Sobre la foto real, el haz que gana es una
franja de la cama al fondo del cuadro, casi al mismo ángulo que el mástil. Se
agregó el discriminador correcto en principio —solo una guitarra tiene rayas en
las dos direcciones, así que los trastes eligen entre los haces candidatos— y
la cama igual gana, con confianza 0.90.

**Decisión: `autoDetect` arranca apagado.** Es una medición, no prudencia. Un
detector que se equivoca con seguridad es peor que uno que no está: marcar
cuatro esquinas tarda cinco segundos y siempre funciona, mientras que un mástil
confiadamente mal le cuesta al alumno la confianza en todo lo que la app diga
después. El botón queda para quien quiera probar, y el harness queda para que el
próximo intento se pueda medir en vez de suponer.
