"""Render original repository-native SVG scenes; no source images or provider calls."""

import hashlib
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / 'content/en-wp-03/verbs.json'
ASSET_ROOT = ROOT / 'public/images/verbs'
INK = '#173f48'
TEAL = '#247f80'
GOLD = '#edb952'
PEACH = '#edbea0'
PAPER = '#fffdf6'
CORAL = '#d36a50'


def path(d, fill='none', **attrs):
    extra = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<path d="{d}" fill="{fill}" {extra}/>'


def circle(x, y, r, fill=PEACH):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def rect(x, y, w, h, fill=PAPER, rx=8, transform=''):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" transform="{transform}"/>'


def person(x, y, scale=1, shirt=TEAL, pose='stand'):
    head = circle(0, 0, 15) + path('M-13 -5 Q-10 -24 7 -14 L14 -4', INK)
    torso = path('M-18 27 Q0 15 18 27 L16 67 L-16 67 Z', shirt)
    if pose == 'run':
        limbs = path('M-13 34 L-36 50 L-47 39 M15 32 L34 17 L42 26 M-8 68 L-28 92 L-49 85 M9 68 L33 83 L26 107', stroke_width=9)
    else:
        limbs = path('M-16 33 L-27 65 M16 33 L27 65 M-8 69 L-10 108 M8 69 L13 108', stroke_width=9)
    return f'<g transform="translate({x} {y}) scale({scale})">{head}{torso}{limbs}</g>'


def arrow(d):
    return path(d, stroke=CORAL, stroke_width=5, marker_end='url(#direction)')


def apple(x, y, scale=1):
    return f'<g transform="translate({x} {y}) scale({scale})">' + path('M0 -16 C-28 -29 -36 -2 -21 19 Q-10 32 0 24 Q12 32 23 14 C37 -9 23 -29 0 -16Z', CORAL) + path('M0 -15 L4 -29 M4 -22 Q18 -35 25 -25 Q18 -13 4 -22', '#78a17d') + '</g>'


def card(x, y, angle=0):
    return f'<g transform="translate({x} {y}) rotate({angle})">' + rect(-19, -28, 38, 56, PAPER, 5) + rect(-12, -20, 24, 40, '#a3c5c0', 3) + circle(0, 0, 5, PAPER) + '</g>'


def coin(x, y):
    return circle(x, y, 13, GOLD) + circle(x, y, 6, GOLD)


def hand(x, y, angle=0):
    return f'<g transform="translate({x} {y}) rotate({angle})">' + rect(-44, -12, 45, 27, TEAL, 3) + path('M0 -11 L19 -11 Q32 -11 32 -1 L45 0 Q57 1 52 12 L35 29 Q28 35 16 30 L0 15Z', PEACH) + '</g>'


def scene(lemma):
    scenes = {
        'be': path('M55 111 L158 37 L262 111', '#e9c68b') + rect(74, 109, 167, 101, '#d3e3d9') + rect(101, 130, 113, 79, PAPER) + person(157, 132, .58) + path('M249 113 C218 76 243 54 262 72 C281 91 255 110 249 113Z', CORAL) + circle(253, 85, 5, PAPER),
        'beat': rect(55, 167, 211, 14, '#d9bf94') + path('M72 130 L245 130 Q235 199 158 199 Q83 199 72 130Z', '#b7d4d1') + path('M173 132 L215 55', stroke_width=11) + path('M161 151 Q113 137 153 97 Q187 95 183 148 M150 144 Q132 123 166 104 M164 146 Q151 124 173 107', stroke_width=3) + hand(243, 55, 135) + path('M105 76 Q92 93 107 104 M125 65 Q112 83 126 94', stroke=CORAL) + path('M64 142 Q50 112 67 96 Q84 113 76 134Z', PAPER) + circle(72, 124, 7, GOLD),
        'become': path('M45 178 Q74 149 110 172 Q135 183 162 168 Q213 151 265 180 Q288 202 239 208 L82 211 Q29 205 45 178Z', '#95c9d0') + path('M100 73 L163 48 L214 84 L210 151 L147 178 L96 139Z', '#d6f0ec') + path('M100 73 L151 111 L214 84 M151 111 L147 178 M114 86 L131 101 M171 66 L186 78', stroke='#5a9ca5') + path('M227 130 Q246 157 227 161 Q210 158 227 130Z', '#82bdc7') + path('M77 112 Q91 133 77 140 Q64 135 77 112Z', '#82bdc7'),
        'begin': path('M40 191 L275 191 M40 205 L275 205 M87 166 L87 218', stroke='#9eb8b0') + person(160, 77, 1, pose='run') + path('M61 45 L61 139', stroke_width=6) + path('M63 48 L109 60 L64 79Z', CORAL) + arrow('M220 164 L271 164'),
        'bend': hand(75, 118, 0) + hand(245, 118, 180) + path('M112 126 Q114 178 160 180 Q206 178 208 126', stroke=GOLD, stroke_width=19) + path('M130 102 Q160 80 190 103', stroke=CORAL, stroke_width=3) + path('M132 89 L130 102 L144 102 M178 103 L190 103 L188 90', stroke=CORAL, stroke_width=3),
        'bet': person(63, 71, .72) + person(257, 71, .72, shirt=CORAL) + rect(84, 116, 155, 75, '#d7c39c') + rect(113, 123, 46, 45, '#a4cfca', 4) + rect(171, 123, 46, 45, '#f0cd7c', 4) + circle(135, 143, 7, TEAL) + path('M182 150 L194 133 L205 150Z', CORAL) + circle(129, 181, 8, TEAL) + circle(194, 181, 8, CORAL) + path('M81 103 L123 123 M239 103 L205 123', stroke_width=8),
        'bite': path('M72 194 L73 123 Q48 98 60 65 Q74 30 112 42 Q145 48 145 78 L165 96 L148 108 L147 135 Q139 160 114 158 L114 194Z', PEACH) + path('M61 73 Q58 31 103 36 Q139 37 145 65 L109 59 L96 84', INK) + circle(130, 82, 3, INK) + path('M146 111 L164 113', stroke_width=5) + apple(204, 116, 1.25) + circle(172, 100, 12, PAPER) + circle(175, 119, 11, PAPER) + path('M181 166 Q184 145 198 153 L211 166 L235 182 L230 199 L207 190 L196 179Z', PEACH),
        'bleed': hand(102, 121, 0) + path('M137 123 L185 123 Q198 125 193 137 L141 143', PEACH) + path('M180 127 L187 131', stroke=CORAL, stroke_width=4) + path('M189 146 Q206 169 189 174 Q174 170 189 146Z', '#b9403a') + rect(206, 68, 59, 24, '#dbb796', 9, 'rotate(30 235 80)') + path('M226 75 L242 85 M228 81 L234 85', stroke='#9e806a', stroke_width=2),
        'blow': path('M55 195 L59 130 Q38 111 50 78 Q62 44 96 50 Q129 52 133 82 L153 99 L137 107 L141 116 L132 121 L130 142 L103 155 L102 195Z', PEACH) + path('M49 79 Q48 41 89 43 Q118 44 132 67 L98 62 L80 84', INK) + circle(117, 83, 3, INK) + path('M140 112 L161 112 M150 104 L168 101 M151 121 L168 125', stroke='#709fa1', stroke_width=2) + circle(187, 111, 22, 'none') + path('M181 133 L169 180', stroke=GOLD, stroke_width=7) + circle(238, 91, 15, '#e1efea') + circle(274, 65, 19, '#e1efea') + circle(258, 137, 11, '#e1efea') + path('M232 83 L236 80 M265 56 L270 52', stroke=PAPER, stroke_width=4),
        'break': hand(75, 133, -18) + hand(248, 135, 198) + path('M106 141 L151 118 L150 143 L169 133 L163 158 L121 179Z', GOLD) + path('M167 111 L215 86 L230 121 L180 148 L186 123 L170 133Z', GOLD) + path('M106 141 L121 179 M215 86 L230 121', stroke=CORAL, stroke_width=9) + path('M158 77 L158 90 M136 82 L141 95 M182 75 L176 89 M158 182 L158 196', stroke=CORAL, stroke_width=4),
        'bring': rect(58, 37, 203, 171, '#d7e4dc') + rect(98, 56, 123, 152, '#fffdf6') + path('M61 208 L92 190 M258 208 L229 190', stroke='#9fbab1') + person(161, 78, .9) + path('M133 129 L139 146 L181 146 L190 129Z', '#dec28e') + apple(150, 126, .42) + circle(170, 122, 8, GOLD) + path('M133 111 L128 132 L141 138 M187 111 L194 132 L181 138', stroke=PEACH, stroke_width=9) + arrow('M245 120 L245 178 L225 195'),
        'build': rect(86, 126, 77, 67, '#d5ac73', 2) + rect(163, 126, 70, 67, '#e6c18b', 2) + path('M86 126 L122 101 L264 101 L233 126Z', '#eed3a6') + path('M233 126 L264 101 L264 166 L233 193Z', '#bf965e') + path('M163 126 L163 193 M99 151 L147 151 M99 175 L147 175', stroke='#ad8658', stroke_width=2) + rect(110, 69, 108, 23, '#e6c18b', 3, 'rotate(-10 160 80)') + hand(72, 72, 0) + hand(253, 57, 180) + arrow('M177 44 L177 60'),
        'burn': rect(71, 122, 180, 80, '#a8c9c5', 14) + path('M102 128 L102 69 Q120 43 142 63 Q168 45 189 67 L198 128Z', '#755140') + path('M111 124 L111 80 Q126 61 140 77 Q164 61 181 78 L188 124Z', '#443d34') + rect(86, 134, 146, 12, INK, 5) + circle(225, 171, 8, CORAL) + path('M130 47 Q113 33 132 18 M163 45 Q144 31 164 13 M190 52 Q172 37 191 23', stroke='#779698', stroke_width=4),
        'burst': path('M163 92 L176 66 L189 86 L219 74 L217 101 L247 114 L223 136 L233 163 L204 163 L199 189 L173 175 L149 196 L142 169 L109 180 L112 151 L84 137 L107 115 L96 87 L128 90 L137 62Z', '#f3dc9e') + path('M132 104 L153 118 L132 129 L120 114Z M181 111 L207 101 L206 125 L190 138Z M150 146 L172 135 L182 160 L164 174Z', CORAL) + path('M163 173 L169 185 L160 187 Q178 213 154 218', stroke_width=3) + path('M69 77 L82 89 M241 64 L231 78 M263 171 L248 162', stroke=CORAL, stroke_width=4),
        'buy': path('M69 64 L247 64 L265 91 L52 91Z', '#e6bf6d') + rect(67, 91, 183, 101, '#e8d7b6', 2) + rect(55, 140, 208, 19, TEAL, 3) + path('M173 130 Q160 104 182 98 L220 98 Q243 105 232 131Z', '#d6a45e') + path('M183 107 L188 117 M199 104 L204 115 M215 106 L219 115', stroke='#916634', stroke_width=2) + hand(61, 112, 0) + coin(130, 122) + hand(260, 119, 180) + arrow('M114 82 L145 82') + arrow('M215 174 L180 174'),
        'catch': circle(164, 112, 29, GOLD) + path('M137 107 Q164 119 187 91 M161 84 Q150 115 175 138', stroke='#9c7135', stroke_width=2) + hand(75, 159, -45) + hand(248, 159, 225) + path('M151 51 L153 67 M173 43 L172 63 M194 52 L187 69', stroke=CORAL, stroke_width=4),
        'choose': apple(78, 160, .8) + path('M154 130 Q142 126 143 143 C121 174 136 194 158 191 C182 193 193 173 170 143 L166 127Z', GOLD) + path('M158 128 L164 116', stroke_width=4) + circle(239, 164, 23, '#e7a655') + path('M235 139 Q242 129 253 137', '#759769') + hand(168, 53, 90) + path('M180 108 L180 124 Q177 135 168 128 L162 106', PEACH) + path('M118 211 L190 211', stroke=CORAL, stroke_width=5),
        'come': rect(58, 37, 203, 171, '#d7e4dc') + rect(98, 56, 123, 152, PAPER) + path('M98 56 L80 77 L80 208 L98 208', '#c2d8ce') + person(160, 78, .95) + arrow('M244 111 L244 168 L222 194') + path('M132 204 L143 198 M183 204 L173 198', stroke='#9db4ad'),
        'cost': path('M70 60 L239 60 L239 90 Q211 103 239 116 L239 146 L70 146 L70 116 Q98 103 70 90Z', '#aed0cb') + path('M185 70 L185 84 M185 93 L185 106 M185 116 L185 135', stroke=PAPER, stroke_width=3) + path('M118 83 L143 83 L143 123 L118 123Z', PAPER) + path('M76 162 L236 162', stroke='#9fb8ae', stroke_width=2) + ''.join(coin(x, 191) for x in [87, 124, 161, 198, 235]),
        'cut': rect(111, 58, 124, 143, '#c7ded7', 3) + path('M111 141 L160 141 L142 160', stroke=PAPER, stroke_width=6) + path('M55 114 L157 152 M58 182 L159 127', stroke='#6e9294', stroke_width=9) + circle(70, 127, 19, GOLD) + circle(72, 175, 19, GOLD) + circle(104, 149, 5, INK) + path('M179 146 L218 146 M179 166 L218 166', stroke='#90b8af', stroke_width=2) + path('M233 201 L262 201 L262 172Z', '#c7ded7'),
        'deal': rect(46, 93, 229, 112, '#9fc8bf', 18) + card(97, 155, -18) + card(163, 169, 7) + card(229, 145, 25) + hand(147, 53, 90) + card(169, 102, -8) + arrow('M211 88 Q242 92 246 111'),
        'dig': path('M40 180 Q86 166 121 178 Q196 167 275 180 L275 210 L40 210Z', '#b5ca9e') + path('M108 188 Q130 147 175 176 Q201 197 154 204 Q123 204 108 188Z', '#795a43') + path('M204 181 L223 150 L243 177 L257 181Z', '#ad8355') + path('M139 164 L207 58', stroke='#c79c66', stroke_width=9) + path('M200 57 L215 35 L234 48 L220 70Z', '#b8d0ca') + path('M126 148 L151 164 Q151 187 121 190 L113 179Z', '#799d9e') + path('M68 177 L68 153 M68 164 Q49 164 53 151 Q68 149 68 164 M69 159 Q86 157 83 145 Q70 144 69 159', '#6d996c'),
        'do': rect(52, 140, 221, 18, '#d7bc90', 3) + path('M77 158 L69 209 M249 158 L257 209', stroke_width=7) + person(133, 64, .7) + rect(143, 112, 80, 60, PAPER, 3, 'rotate(-10 184 141)') + path('M158 128 L164 134 L175 119 M161 148 L167 154 L177 141', stroke=TEAL, stroke_width=3) + path('M185 126 L205 122 M189 145 L209 141', stroke='#a3bab3', stroke_width=3) + path('M145 89 L160 110 L188 116', stroke=PEACH, stroke_width=9) + path('M189 121 L211 84', stroke=GOLD, stroke_width=7),
        'draw': rect(65, 58, 190, 145, PAPER, 3) + path('M102 171 L126 126 L115 126 L144 85 L174 126 L164 126 L187 171Z', '#abcdb6') + path('M144 171 L144 189', stroke='#98704e', stroke_width=6) + hand(240, 106, 155) + path('M204 134 L170 180', stroke=GOLD, stroke_width=10) + path('M170 180 L162 190 L164 175Z', INK) + path('M212 198 L233 198', stroke='#9cb5b0', stroke_width=3),
        'dream': rect(40, 172, 170, 34, '#b5d2cc', 9) + rect(47, 149, 63, 30, PAPER, 12) + path('M84 170 Q119 142 177 173 L202 193 L90 193Z', TEAL) + circle(80, 154, 20) + path('M67 153 Q74 160 80 153 M87 166 L94 167', stroke_width=2) + circle(132, 128, 6, PAPER) + circle(148, 111, 9, PAPER) + path('M162 64 Q153 34 180 35 Q193 15 211 33 Q238 20 250 44 Q282 48 270 72 Q283 95 253 102 L178 100 Q145 97 162 64Z', '#e1e9dc') + path('M178 83 L201 58 L218 81 L235 64 L257 84', stroke='#a5c2b5', stroke_width=3) + circle(221, 49, 7, PEACH) + path('M211 60 L221 70 L234 59 M219 70 L208 82 M220 70 L231 80', stroke=CORAL, stroke_width=4),
    }
    return scenes[lemma]


# Spanish descriptions are deliberate nonvisual learning cues, with no target English form.
CUES = {
    'be': ('Una persona se encuentra dentro de una casa y un marcador señala su ubicación.', 'Piensa en su ubicación, no en entrar ni caminar.', True),
    'beat': ('Una mano mueve un utensilio de alambre dentro de un cuenco con huevo.', 'Describe lo que se hace con el huevo para mezclarlo.', False),
    'become': ('Un cubo de hielo pierde gotas y se transforma en un charco de agua.', 'Describe el cambio de estado del hielo.', True),
    'begin': ('Una persona sale de una línea de carrera cuando se levanta una bandera.', 'Piensa en el momento de iniciar la actividad.', True),
    'bend': ('Dos manos curvan un tubo flexible hasta formar una U.', 'El material cambia de forma sin romperse.', False),
    'bet': ('Dos personas colocan fichas junto a sus predicciones sobre un juego.', 'Cada una arriesga una ficha a que su predicción sea correcta; no es solo elegir.', True),
    'bite': ('Una persona acerca una manzana a la boca; falta un trozo junto a los dientes.', 'Describe la acción con los dientes.', False),
    'bleed': ('Un pequeño rasguño en un dedo deja caer una gota roja junto a una venda.', 'Describe lo que ocurre con la sangre, no la cura.', False),
    'blow': ('Una persona expulsa aire por un aro y salen burbujas de jabón.', 'Describe lo que hace con el aire de la boca.', False),
    'break': ('Dos manos separan las partes de un lápiz que se parte por la mitad.', 'El lápiz queda en dos partes.', False),
    'bring': ('Una persona llega hacia quien mira, con un cuenco de fruta en las manos.', 'La fruta se mueve hacia el lugar donde está quien habla.', True),
    'build': ('Dos manos añaden una pieza a una caja de madera en construcción.', 'Las piezas se unen para crear un objeto.', False),
    'burn': ('Del tostador sale una tostada muy oscura con humo encima.', 'El exceso de calor daña el pan; no se trata solo de cocinar.', False),
    'burst': ('Un globo se abre de repente y salen trozos en varias direcciones.', 'El aire rompe el globo de forma repentina.', False),
    'buy': ('En un puesto, una mano entrega una moneda y recibe una barra de pan.', 'Hay un intercambio de dinero por un producto.', False),
    'catch': ('Una pelota baja hacia dos manos abiertas que la reciben.', 'Las manos detienen la pelota que viene por el aire.', False),
    'choose': ('Una mano señala una pera entre tres frutas diferentes.', 'Hay varias opciones y se selecciona una.', False),
    'come': ('Una persona avanza por una puerta hacia quien mira, con las manos vacías.', 'El movimiento es hacia quien habla; no está saliendo.', True),
    'cost': ('Un billete aparece encima de cinco monedas, separadas por una línea.', 'Las monedas indican el precio del billete; no se muestra una compra.', True),
    'cut': ('Unas tijeras dividen una hoja de papel y dejan un recorte separado.', 'Describe la acción de las tijeras sobre el papel.', False),
    'deal': ('Una mano distribuye cartas de una baraja en distintos lugares de la mesa.', 'Las cartas se entregan una a una a las personas que juegan.', True),
    'dig': ('Una pala retira tierra de un agujero y deja un pequeño montículo al lado.', 'Se abre un hueco en la tierra para una planta.', False),
    'do': ('Una persona completa casillas en una hoja de tareas con un lápiz.', 'Piensa en realizar una tarea, no específicamente en dibujar.', True),
    'draw': ('Una mano traza con lápiz un árbol en una hoja de papel.', 'El lápiz crea una imagen, no palabras.', False),
    'dream': ('Una persona duerme y una nube muestra una escena imaginada de volar sobre colinas.', 'La escena imaginada ocurre durante el sueño.', True),
}


def render():
    data = json.loads(DATA_PATH.read_text())
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    ledger = []
    for verb in data['verbs']:
        lemma = verb['lemma']
        alt, context, ambiguous = CUES[lemma]
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240" role="img" aria-labelledby="cue-title cue-desc">\n'
               f'<title id="cue-title">{escape(alt)}</title>\n'
               f'<desc id="cue-desc">{escape(context)} No se indica un tiempo verbal.</desc>\n'
               '<defs><marker id="direction" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0L6 3L0 6Z" fill="#d36a50"/></marker></defs>\n'
               f'<rect x="1" y="1" width="318" height="238" rx="24" fill="#f8f3e7"/>\n'
               f'<g stroke="{INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
               + scene(lemma) + '</g>\n</svg>\n')
        filename = lemma + '.svg'
        (ASSET_ROOT / filename).write_text(svg)
        verb['image_cue'].update({
            'alt': alt, 'nonvisual_cue_es': alt, 'context_es': context,
            'ambiguous': ambiguous, 'asset_status': 'original-local-svg',
            'file': 'public/images/verbs/' + filename,
            'src': '/images/verbs/' + filename,
            'attribution': 'Original repository-authored SVG illustration for Lang Lessons; no third-party assets.',
            'creator': 'EN-WP-03 curriculum executor, authored for Pablo Coronel',
        })
        ledger.append({
            'content_id': verb['id'], 'asset_id': 'cue-' + lemma + '-v1',
            'file': verb['image_cue']['file'], 'src': verb['image_cue']['src'],
            'sha256': hashlib.sha256(svg.encode()).hexdigest(),
            'origin': 'Original SVG paths composed in content/en-wp-03/render_cues.py; no imported art, fonts or images.',
            'creator': verb['image_cue']['creator'],
            'rights_basis': 'Original commissioned repository work under the task mandate; no third-party license or provider output. No separate public license grant is asserted.',
            'attribution': verb['image_cue']['attribution'],
            'created': '2026-10-16', 'ambiguous': ambiguous,
            'review_status': 'authored; XML/reference/browser checks recorded separately; independent comprehension review pending',
        })
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'content/en-wp-03/asset-ledger.json').write_text(json.dumps({
        'schema_version': 'en-wp-03/assets/1', 'authorship': 'authored-original-vector-assets', 'assets': ledger,
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'Rendered {len(ledger)} original local SVG cues and refreshed provenance/checksums.')


if __name__ == '__main__':
    render()
