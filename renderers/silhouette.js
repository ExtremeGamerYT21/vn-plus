import { silhouetteProfile } from '../core/silhouette-profile.js';

let sequence = 0;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;

/** Original grayscale figures with layered clothing, limbs, shoes and shaded face planes. */
function figure(type, paint) {
    const { cloth, pants, skin, hair, shoes } = paint;
    const shadow = (d, opacity = .2) => path(d, '#202a32', `opacity="${opacity}"`);
    const light = d => path(d, '#f5f7f8', 'opacity=".22"');
    if (type === 'man') return [
        path('M106 331L151 339 143 514 128 680 101 680 104 505Z', pants),
        path('M151 337L195 333 207 499 197 683 168 683 165 514 146 422Z', pants),
        shadow('M149 365L165 514 168 683 177 683 180 512 159 382Z'),
        light('M113 355L118 503 109 661 116 660 131 498 136 359Z'),
        path('M99 674L129 674 131 696Q119 708 80 704L80 695ZM167 675L198 675 218 698Q214 708 169 705Z', shoes),
        light('M83 697L126 697 126 701 82 701ZM172 698L211 700 211 703 172 702Z'),
        path('M126 133L174 133 177 176 151 199 122 173Z', skin),
        shadow('M126 133L173 139 170 158 149 168 125 154Z', .26),
        path('M123 162L92 173Q74 181 69 213L53 336 74 348 98 254 105 354Q149 370 196 352L202 250 223 337 247 328 229 207Q222 179 180 163L154 186Z', cloth),
        path('M127 166L153 188 177 166 170 346 135 347Z', '#d4d9dc'),
        path('M124 164L153 189 136 214 113 185ZM179 164L153 189 174 212 191 183Z', '#a7afb5'),
        path('M145 192L158 192 163 207 153 221 142 207ZM148 217L157 217 166 309 154 324 143 309Z', '#505a63'),
        shadow('M94 189L88 273 74 348 67 344 78 233ZM200 193L210 268 239 330 247 328 229 208Z'),
        shadow('M113 185L136 214 127 245 136 347 105 354 100 279Z', .14),
        light('M95 178L115 172 103 235 100 302 94 296ZM184 174L202 184 210 223 201 214Z'),
        path('M55 335L73 343 68 365Q58 379 50 365L48 350ZM224 334L245 328 251 350Q253 365 241 365L231 351Z', skin),
        path('M116 72Q116 35 151 32 188 35 189 78L181 121Q172 145 151 148 130 144 121 121Z', skin),
        shadow('M162 63Q187 70 181 111L171 137 151 148 158 124 168 109 161 101Z', .15),
        path('M115 91L109 65Q111 29 143 23 166 17 187 37L197 37Q197 58 185 78L175 62 152 56 134 66 123 95Z', hair),
        light('M118 52Q134 28 164 34L181 45 152 40 128 58Z'),
        shadow('M153 78L159 99 153 104 165 104 165 98Z', .12),
    ].join('');
    if (type === 'woman') return [
        path('M107 350L148 356 143 505 128 678 104 678 107 514ZM148 354L189 350 194 497 172 678 148 678 160 508 140 428Z', pants),
        shadow('M144 391L160 508 148 678 157 678 173 504 158 385Z'),
        light('M114 374L120 513 110 660 115 657 131 510 134 377Z'),
        path('M104 671L129 671 128 697Q114 707 87 704L87 696ZM147 672L173 672 188 697Q183 708 146 704Z', shoes),
        path('M117 75Q107 101 109 144L93 176Q107 187 127 180L177 179Q203 186 214 170L195 140 191 84Z', hair),
        path('M132 129L169 128 174 165 150 184 126 163Z', skin),
        shadow('M132 133L168 133 167 153 145 162 129 151Z', .24),
        path('M124 160Q107 165 94 188L74 245 96 259 117 212 117 275 101 347Q143 371 194 348L177 275 182 214 203 258 226 247 205 189Q197 168 174 160L152 181Z', cloth),
        path('M127 161L152 181 173 161 164 276 173 350 127 350 139 275Z', '#b9c0c5'),
        path('M126 163L138 204 150 182 137 172ZM175 162L162 205 151 182 165 173Z', '#d3d8db'),
        shadow('M177 204L182 214 177 275 194 348 182 353 163 275Z', .22),
        shadow('M107 181L98 222 89 252 80 248 95 198Z', .14),
        light('M113 174L124 168 117 244 113 276 108 271ZM117 308L128 288 120 344 109 341Z'),
        path('M75 245L96 254 111 287 138 292 135 309 100 305Q90 302 86 293Z', skin),
        path('M205 252L224 248 218 299 202 331 188 324 199 295Z', skin),
        shadow('M85 268L102 294 135 299 135 309 100 305 91 297Z', .13),
        path('M119 76Q122 40 151 39 185 42 184 78L177 116Q169 138 150 141 132 139 123 118Z', skin),
        shadow('M160 64L177 75 176 113 163 134 151 141 157 118 164 108 158 100Z', .13),
        path('M115 95Q104 67 123 39 138 20 162 28 190 24 197 58L193 116 184 144 175 137 183 102 176 67Q148 78 133 59L124 78 124 111Z', hair),
        light('M117 60Q127 29 155 36L172 35Q142 42 130 65L119 103Z'),
        shadow('M151 83L155 99 151 104 161 104 160 99Z', .1),
        path('M138 296L150 297 153 306 135 309Z', skin),
    ].join('');
    if (type === 'girl') return [
        path('M110 403L145 404 142 525 133 680 109 680 111 526ZM151 403L185 402 188 526 177 680 151 680 160 525Z', pants),
        shadow('M154 432L161 525 152 677 159 678 172 523 166 433Z'),
        path('M107 672L134 672 136 697Q115 709 93 703L92 695ZM151 672L179 672 192 696Q191 707 153 705Z', shoes),
        path('M111 53Q131 22 160 33 195 30 199 72L196 144 211 167Q194 182 176 170L120 174 95 159 108 127Z', hair),
        path('M133 140L170 140 173 179 150 193 128 177Z', skin),
        shadow('M133 145L169 144 166 164 149 172 130 163Z', .23),
        path('M128 173L97 188Q89 197 85 220L67 318 88 327 110 248 117 300 101 405Q144 427 194 406L180 298 188 249 206 323 228 313 211 217Q208 197 174 173L151 192Z', cloth),
        path('M131 175L150 193 171 175 164 291 173 322 128 322 137 290Z', '#c4cbcf'),
        path('M115 301L180 300 195 409Q149 424 100 407Z', cloth),
        shadow('M123 312L119 408 131 412 135 313ZM163 310L167 414 182 411 176 309Z', .18),
        light('M141 313L150 313 154 415 140 415Z'),
        path('M68 317L87 324 83 344Q74 359 65 346L62 332ZM207 322L227 315 234 335Q235 350 225 351L214 338Z', skin),
        path('M117 83Q115 45 150 42 187 45 185 84L179 125Q167 149 150 152 129 147 121 126Z', skin),
        shadow('M161 64L178 79 176 121 161 145 151 152 156 127 164 113 158 105Z', .13),
        path('M111 92Q103 52 131 36 165 17 189 48L194 89 184 103 178 70 161 76 133 63 122 80 122 110Z', hair),
        path('M182 73Q214 59 218 87L211 132 198 152 187 140 200 111 199 88 185 95Z', hair),
        light('M116 60Q131 33 160 40L174 47 142 46 125 67Z'),
        light('M104 191L114 184 109 249 102 260 96 253Z'),
    ].join('');
    const child = type === 'boy' || type === 'child';
    return [
        path(child ? 'M106 385L150 389 143 525 129 681 103 681 106 526Z' : 'M106 345L151 350 144 515 130 681 103 681 106 516Z', pants),
        path(child ? 'M150 389L193 384 198 524 190 681 161 681 161 529 143 450Z' : 'M151 350L193 344 200 515 190 681 163 681 163 518 144 419Z', pants),
        shadow('M147 424L163 521 163 678 173 679 177 520 159 423Z'),
        light('M114 423L119 524 111 661 119 657 132 522 135 422Z'),
        path('M102 674L130 674 132 698Q114 708 81 704L81 695ZM161 674L192 674 213 696Q213 708 161 705Z', shoes),
        light('M85 698L128 698 128 702 83 702ZM165 699L208 700 208 703 165 703Z'),
        path(child ? 'M130 143L171 143 174 187 151 204 125 184Z' : 'M130 132L172 132 175 172 152 190 125 170Z', skin),
        shadow(child ? 'M130 146L170 146 167 172 147 180 128 168Z' : 'M129 137L171 136 166 157 147 166 127 154Z', .24),
        path(child ? 'M125 179L96 192Q80 205 77 229L61 344 85 351 109 270 108 383Q152 404 196 383L195 270 217 345 241 336 222 228Q218 207 175 180L151 200Z'
            : 'M125 165L94 180Q80 194 76 221L58 339 81 348 107 252 107 344Q149 365 196 345L197 253 221 337 244 328 226 214Q222 189 177 164L152 188Z', cloth),
        path(child ? 'M127 181L152 201 176 181 179 214Q154 230 125 213Z' : 'M129 169L152 190 175 168 166 229 137 228Z', '#c0c7cc'),
        shadow(child ? 'M193 228L198 274 196 383 181 389 176 279Z' : 'M196 211L200 255 196 345 181 350 179 263Z', .2),
        shadow(child ? 'M97 211L90 276 78 348 68 346 83 235Z' : 'M95 195L87 270 75 345 65 343 82 219Z', .17),
        light(child ? 'M105 196L115 189 107 281 99 284 94 274Z' : 'M105 181L118 174 108 266 100 274 96 263Z'),
        path(child ? 'M62 342L84 349 81 367Q74 384 62 370L57 355ZM219 343L240 337 248 356Q249 373 238 375L226 361Z'
            : 'M59 338L80 345 77 365Q68 379 58 365L53 350ZM223 335L243 329 251 350Q252 366 240 367L231 352Z', skin),
        path(child ? 'M113 83Q111 41 151 39 191 43 189 85L183 129Q171 154 151 158 128 153 119 131Z'
            : 'M117 77Q116 39 151 36 189 39 188 79L181 121Q170 146 151 148 130 144 122 124Z', skin),
        shadow(child ? 'M162 64L183 81 178 128 164 151 152 157 158 129 165 114 159 105Z'
            : 'M162 62L181 77 176 120 163 141 152 148 157 123 164 108 159 101Z', .13),
        path(type === 'boy' ? 'M112 96L106 68Q105 36 134 32L131 20 150 28 167 19 173 30Q193 33 198 57L191 98 180 80 176 60 149 67 126 62 121 102Z'
            : child ? 'M110 98Q100 60 117 42 129 27 151 30 183 27 197 55L193 99 182 105 178 69Q157 84 128 65L122 103Z'
                : 'M114 91Q103 60 122 39 144 18 171 30 195 33 197 63L188 103 177 82 173 61 150 70 132 61 121 99Z', hair),
        light(child ? 'M113 60Q127 34 158 39L178 48 150 45 123 65Z' : 'M116 58Q130 31 158 37L177 47 149 43 125 63Z'),
        child ? path('M134 280L171 280 180 324Q152 335 125 325Z', 'none', 'stroke="#e8ecef" stroke-opacity=".25" stroke-width="3"') : '',
    ].join('');
}

export function createSilhouette(name, profile = silhouetteProfile(name)) {
    const container = document.createElement('div'); container.className = 'vn-missing-bust'; container.dataset.silhouette = profile.type;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), id = `vn-figure-${++sequence}`;
    svg.setAttribute('viewBox', '0 0 300 720'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${name} — ${profile.label} silhouette`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    const gradients = {
        cloth: ['var(--vn-figure-cloth-light,#abb3ba)', 'var(--vn-figure-cloth,#7f8a94)', 'var(--vn-figure-cloth-shadow,#515e69)'],
        pants: ['#7d8891', '#626e78', '#46535e'], skin: ['#edf0f2', '#cbd2d7', '#a1adb6'],
        hair: ['#78848d', '#56636d', '#36444f'], shoes: ['#5c6973', '#3e4b55', '#253440'],
    };
    const defs = Object.entries(gradients).map(([key, colors]) => `<linearGradient id="${id}-${key}" x1="0" y1="0" x2="1" y2=".65">${colors.map((color, index) => `<stop offset="${index / 2}" stop-color="${color}"/>`).join('')}</linearGradient>`).join('');
    const paint = Object.fromEntries(Object.keys(gradients).map(key => [key, `url(#${id}-${key})`]));
    // All markup is authored geometry. Names only enter textContent and ARIA attributes.
    svg.innerHTML = `<defs>${defs}</defs><ellipse cx="150" cy="709" rx="77" ry="8" fill="#101820" opacity=".22"/><g class="vn-figure-body">${figure(profile.type, paint)}</g>`;
    const label = document.createElement('span'); label.className = 'vn-silhouette-name'; label.textContent = name;
    container.append(svg, label); return container;
}
