# Bitácora

Registro de decisiones y de lo que se hizo, en orden. Lo que no está acá se
lee del código; lo que está acá es el *por qué*.

---

## 2026-09-08 — F0: el punto de partida

**Qué se hizo.** Se dejó el repo en `DecoudJuan/Guitar-Learning`, todo
consolidado en `main`, y se escribieron `ROADMAP.md`, `BITACORA.md` y
`CLAUDE.md` antes de tocar código.

**Decisión: el stack de visión antes que la interfaz.** Lo caro de escribir es
lo que está debajo: el pipeline de MediaPipe con filtro One Euro, la histéresis
de dedos medida sobre landmarks *world* (que es lo que hace que sobreviva a la
rotación de la mano), la gracia por mano ante pérdidas de detección, el
andamiaje de i18n con claves tipadas y la disciplina de DOM sin `innerHTML`.
Todo eso es la base de mirar una mano sobre un diapasón.

**Decisión: cero audio sintetizado.** Si la app enseña guitarra, el sonido lo
produce la guitarra del alumno; un sintetizador competiría con el instrumento
real. "Acústica" y "eléctrica" existen como *tipo de guitarra*, no como timbre:
cambian la geometría del mástil (ancho de cejuela, cantidad de trastes
accesibles) y las digitaciones que se sugieren, no el sonido.

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

---

## 2026-09-09 — F13: la homografía como registro, no solo como mapeo

**Aclaración que vale la pena dejar escrita.** La homografía ya era el corazón
del proyecto desde F3: `Fretboard` la usa para convertir el diapasón en la
imagen y viceversa. Lo que faltaba era el *otro* uso, el de las panorámicas:
**registro entre dos vistas de la misma escena plana**. Eso es lo que se agregó.

**Decisión: seguir puntos conocidos en vez de volver a detectar.** La
calibración es una foto de un momento, y una guitarra en la falda no se queda
en ese momento: se corre al acomodarse, se inclina al buscar una cejilla, y
para el cuarto acorde la grilla está a centímetros de la madera. La ventaja
enorme del registro sobre la detección es que ya no hay que *encontrar* el
mástil — se sabe dónde estaba y dónde debería estar cada punto de él. Es una
pregunta mucho más chica, y a diferencia del detector no necesita distinguir un
diapasón de un acolchado.

**Decisión: parches con correlación normalizada, plantilla siempre la
original.** Dos detalles hacen que no derive y no mienta. NCC en vez de
diferencia cruda, porque una nube que pasa o una mano que sombrea el mástil
cambian el brillo de todos los píxeles a la vez y la correlación normalizada
compara *forma*. Y comparar siempre contra el cuadro en que el alumno calibró,
nunca contra el cuadro anterior: encadenar cuadros acumula una fracción de
píxel por vez y en un minuto la grilla se caminó de la guitarra. Contra la
referencia original no puede derivar — solo puede perder el punto, que es una
falla que se anuncia sola.

**Decisión: consenso antes que mínimos cuadrados, y esto salió de medirlo.** La
primera versión ajustaba sobre todos los puntos y después descartaba los que
no coincidían. El `track-check` mostró que eso no funciona y cómo falla: tres
anclas malas de dieciocho corrieron el ajuste **45 píxeles**, y desde ahí los
puntos buenos también parecían malos — se quedó con dos anclas y se rindió.
Mínimos cuadrados no tiene defensa contra outliers porque está ocupado
acomodándolos. Con consenso a lo RANSAC —cuatro anclas al azar, medir cuántas
coinciden, quedarse con el acuerdo más grande y recién ahí ajustar— el mismo
caso baja a **2,6 píxeles**.

El comentario de encabezado del archivo describía el algoritmo viejo durante
media hora. Quedó corregido: un comentario que describe un algoritmo que ya no
está es peor que ninguno.

**Decisión: un null del tracker significa "quedate con lo que tenés".** No es un
error. Una guitarra tapada por una mano un segundo no puede borrar la lección.

## 2026-09-09 — F14: mientras se marca el mástil, la pantalla es de la marca

Probando con la guitarra de verdad apareció algo obvio recién cuando pasa: al
volver a calibrar, la pantalla sigue siendo la de la clase. Los números de
traste, los círculos del acorde y la flecha del dedo quedan justo sobre las
cuatro esquinas que hay que clickear, y el cartel de la calibración aterriza
encima del cartel del coach porque los dos viven abajo y al centro.

**Decisión: durante la calibración se dibuja la grilla y los puntos, nada más.**
Ni números de traste, ni objetivos del acorde, ni esqueleto de la mano. No es
un problema de estética: un número de traste tiene fondo oscuro y radio de diez
puntos, así que tapa literalmente el píxel que el alumno quiere marcar. La
grilla sí se sigue dibujando, porque la pregunta del selector de traste
("¿caen los trastes dibujados sobre los reales?") se contesta mirándola.

**Decisión: el coach se calla mientras se marca.** No es que estorbe visualmente
—es que la lección no es lo que está pasando— y además los dos carteles se
pisaban.

**Decisión: el cartel se mueve, no se adivina.** Ninguna esquina es segura: la
guitarra puede apuntar para cualquier lado y estar a cualquier altura del
cuadro, y en la prueba el cartel tapó el punto 3. En vez de elegir un lugar
"bueno" el cartel es angosto, arranca abajo a la izquierda y hay un botón que
lo lleva a la siguiente esquina. Un botón y cuatro posiciones antes que
arrastrar, que en un teléfono sería otra cosa que puede salir mal.

## 2026-09-09 — F14 (2): el mástil remembrado no se seguía, y el detector mentía

Dos reportes de la misma sesión con la guitarra real: "cuando le doy a buscar el
mástil automáticamente no cambia nada, se mantiene estático, ni lo sigue cuando
se mueve", y una captura donde *Buscalo vos* dibujó un cuadrilátero cruzando la
habitación y anunció **mástil encontrado**.

**El bug del seguimiento: la calibración recordada nunca tomaba referencia.** El
`NeckTracker` toma sus anclas en `acceptCorners`, es decir en el momento en que
el alumno marca. Pero `restoreCalibration()` corre en el constructor, antes de
que exista cámara, así que una calibración leída de `localStorage` —o sea
cualquier recarga de la página, que es el caso normal— dejaba el tracker sin una
sola ancla, `ready` en false, y `track()` devolviendo null para siempre. La
grilla quedaba clavada donde se la había dejado la sesión anterior. F13 estaba
verificada con `track-check` y la matemática estaba bien; lo que faltaba era el
cable. Ahora `followNeck` toma la referencia en el primer cuadro vivo en que hay
mástil conocido, y de paso recupera las anclas si alguna vez se tiran.

**El detector: seis rectas paralelas y equiespaciadas no eran nunca la
evidencia.** Es el patrón de una manta, de un radiador, de una persiana y de las
costillas de una almohada. La pista que el ROADMAP tenía anotada y sin usar es
la que separa: los trastes **no** están equiespaciados, se juntan según
`2^(-n/12)`, y eso no lo hace nada en una habitación.

Lo que se aprendió midiendo (`npm run fret-check`, `node scripts/scene.mjs` +
`npm run neck-check`), en orden, porque cada paso corrigió al anterior:

- **Tolerar el modelo de trastes no alcanza.** Sobre los primeros cinco trastes
  los huecos se acortan apenas un 6% cada uno, así que las rayas de una manta
  entran en cualquier tolerancia que sobreviva a un píxel de ruido: *todos* los
  casos rayados pasaban. Lo que una manta no puede hacer es ajustar la curva de
  trastes **mejor que una recta**. Se ajustan los dos modelos y la guitarra
  tiene que ganar por la mitad (`EVEN_MARGIN`).
- **La progresión de trastes es invariante al corrimiento de traste.**
  Renumerar los trastes `n+k` y multiplicar la escala por `2^(k/12)` da
  exactamente las mismas posiciones: los trastes 1 a 7 ajustan como 4 a 10 con
  residuo `1e-13`. Se escribió un ajuste con la cejuela libre y **no puede
  existir**; el número de traste sale sólo si se ancla la cejuela donde las
  cuerdas terminan. Quedó como chequeo para que nadie lo intente de nuevo.
- **En un mástil los trastes le ganan la elección de haz a las cuerdas.** Hay
  diez y son casi equiespaciados, contra seis cuerdas: el haz de cuerdas no
  entraba ni en los cinco candidatos, y el cuadrilátero salía girado noventa
  grados. Cada haz se lee ahora dos veces, como cuerdas y como trastes, y el
  ajuste de trastes elige.
- **Hough sirve para direcciones y no para medir.** Un pico es un bin: huecos
  de 7 px salían 22.6, 21.1, 20.7, 16.5, 20.6 — ni progresión ni monótonos, y
  el detector encontraba el mástil a un ancho de trabajo y lo perdía en el
  siguiente, que es la firma de un estimador ruidoso y no de una idea
  equivocada. Las dos direcciones se miden ahora sobre un **perfil de magnitud
  de borde de un píxel**, con pico sub-pixel por parábola: cada traste aporta
  cientos de píxeles a su propia posición.
- **Las proporciones del instrumento son un filtro gratis.** La escala es más
  de doce veces el ancho del mástil (cejuela 43-52 mm, escala 630-650 mm), y un
  diapasón se ensancha un tercio pero nunca es una cuña. Eso descartó el último
  falso positivo, que era una guitarra real leída de costado: sus seis cuerdas
  convergen por perspectiva, y un haz que converge se junta igual que los
  trastes.

**Dónde quedó, dicho sin adornos.** Rechaza la manta, encuentra la dirección y
la cejuela de un mástil dibujado, y estira el extremo lejano más allá de donde
el mástil termina (lee nueve trastes como quince). O sea: dejó de mentir, todavía
no acierta. `autoDetect` sigue **apagado** y la calibración a mano sigue siendo
la verdad. Lo que falta no es otra constante: hacen falta fotos reales, varias,
porque las escenas sintéticas ya están al límite de lo que pueden enseñar y
seguir afinando contra ellas es sobreajustar un dibujo.

## 2026-09-09 — F14 (3): siete fotos reales, y lo que dijeron

Siete cuadros de la webcam, la guitarra sobre la falda, en la habitación de
siempre. Es la evidencia que faltaba y cambió el diagnóstico completo. Sirvieron
para arreglar tres cosas y para descubrir dónde está el problema de verdad.

**La cejuela no está donde terminan las cuerdas.** El ajuste anclaba la cejuela
en el extremo del recorrido de las cuerdas, que es cierto en un dibujo y falso
en una guitarra: las cuerdas van del puente a los clavijeros, así que sus dos
extremos están en otra parte y la cejuela queda a un cuarto del camino. Lo que
la cejuela *es*, en una foto, es **el último alambre**: los trastes terminan ahí
y el clavijero no tiene ninguno. Ahora se prueba cada extremo del grupo de
alambres como cejuela, y ser el extremo es lo que dice que no hay nada detrás.

**Un traste cruza el mástil entero; un pliegue de remera no.** El perfil de
bordes contaba cualquier cosa que cayera en la banda, y en una foto real la
banda cruza toda la imagen: la remera, la almohada, el borde de la cama. Cuarenta
alambres donde la guitarra tiene doce, y un "mástil" del ancho del cuadro. El
perfil se mide ahora en cuatro **carriles** a lo ancho y cada bin se queda con
el *mínimo* de los cuatro: la pregunta pasa a ser "esta línea llega de lado a
lado", y eso sólo lo contesta un traste. (Con un bug propio en el camino: para
el haz leído como trastes los carriles estaban partidos a lo *largo*, o sea le
pedían a cada traste aparecer en todo el largo del mástil, y el perfil devolvía
cero alambres en todas las fotos.)

**La escala es dieciséis veces el ancho entre las cuerdas exteriores, y eso
rompe la degeneración de corrimiento.** Un ajuste de trastes encaja igual de
bien corrido k trastes con la escala multiplicada por `2^(k/12)`, así que los
alambres solos nunca dicen si el primero es el traste 1 o el 4 — y en las fotos
el ajuste caía tres trastes corrido, sobre el diapasón correcto, con el ángulo
correcto y el ancho correcto. El ancho es lo que dice cuál corrimiento es el
real: 35 mm entre las cuerdas exteriores en la cejuela de una acústica, 43 en
una clásica, contra escalas de 630-650 mm. **Verificado en la foto 40**: un
ancho medido de 130 px predice una escala de ~2080 px, y la medida era ~2040.
De paso mostró que las escenas dibujadas estaban desproporcionadas (mástil a un
veinticuatroavo de su escala, en vez de un dieciseisavo) — un error del test y
no de lo testeado, ya corregido en `scripts/scene.mjs`.

**Y el veredicto, que es lo importante: el detector falla en la primera etapa.**
Con todo lo anterior, las siete fotos dan **null**, y el motivo es medible: en
ninguna de las siete el buscador de haces (picos de Hough + series
equiespaciadas) devuelve un haz que sean las cuerdas o los trastes de la
guitarra. Las bandas candidatas medían 400 a 575 píxeles de trabajo de ancho,
donde el mástil mide unos 32. Los picos de Hough de una habitación —el borde de
la cama, el respaldo, la almohada, los pliegues de la remera— se comen los
noventa lugares disponibles y las líneas de la guitarra no entran. Todo lo que
viene después estaba trabajando sobre la habitación, y las dos detecciones que
por un rato parecieron buenas eran suerte: caían sobre el diapasón porque el
perfil de alambres encuentra los trastes reales *incluso dentro de una banda
equivocada*.

Esa última frase es la pista para el próximo intento, y es concreta: **la
búsqueda tiene que manejarla el perfil, no los haces de Hough.** El perfil sabe
encontrar trastes; lo que no hay es una manera de proponerle la región correcta.
Buscar primero el diapasón como *región* (lo oscuro, liso y alargado con una
grilla brillante encima) o barrer direcciones y bandas directamente son las dos
formas de darle esa región.

`autoDetect` sigue apagado, y con más razón que antes: ahora se sabe que en una
foto real no llega ni a mirar la guitarra.
