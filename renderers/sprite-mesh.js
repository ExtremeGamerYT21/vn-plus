import { lightDirection } from '../core/scene-light.js';

const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export function breathingConfig(properties, settings = {}) {
    const config = properties?.breathing;
    return {
        enabled: config !== false && config?.enabled !== false && settings.spriteBreathing !== false,
        amount: clamp(config?.amount ?? settings.breathingAmount, 0, 5, 1.6) / 100,
        duration: clamp(config?.duration ?? settings.breathingDuration, 1000, 20000, 4200),
        centerX: clamp(config?.centerX, 0, 1, .5),
        centerY: clamp(config?.centerY, 0, 1, .62),
    };
}

/** Shared vertices and indices keep adjacent triangles watertight. UVs never move. */
export function createBreathingMesh(columns = 48, rows = 48) {
    const uv = new Float32Array((columns + 1) * (rows + 1) * 2);
    const indices = new Uint16Array(columns * rows * 6);
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
        const i = (y * (columns + 1) + x) * 2; uv[i] = x / columns; uv[i + 1] = y / rows;
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.set([a, c, b, b, c, d], (y * columns + x) * 6);
    }
    return { uv, positions: new Float32Array(uv), indices };
}

/** Continuous, compact torso expansion. Smoothly pin the image edges, even off-centre. */
export function deformBreathingMesh(mesh, config, inhale) {
    const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
    const amplitude = config.amount * Math.max(0, Math.min(1, inhale));
    for (let i = 0; i < mesh.uv.length; i += 2) {
        const x = mesh.uv[i], y = mesh.uv[i + 1];
        const rx = (x - config.centerX) / .5, ry = (y - config.centerY) / .3;
        const local = Math.pow(Math.max(0, 1 - rx * rx - ry * ry), 3);
        const edge = smooth(x / .08) * smooth((1 - x) / .08) * smooth(y / .08) * smooth((1 - y) / .08);
        const motion = local * edge * amplitude;
        mesh.positions[i] = x + rx * motion;
        mesh.positions[i + 1] = y + ry * motion * .6;
    }
    return mesh.positions;
}

/** One GPU context for the entire cast; each frame receives a composited canvas copy. */
export class SpriteMeshRenderer {
    constructor(onUnavailable = () => {}) {
        this.surfaces = new Map(); this.materials = new WeakMap(); this.mesh = createBreathingMesh(); this.onUnavailable = onUnavailable;
    }
    initialize() {
        if (this.failed) return false;
        if (this.gl) return true;
        this.canvas = document.createElement('canvas');
        const options = { alpha: true, antialias: true, premultipliedAlpha: true, depth: false, stencil: false };
        const gl = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
        if (!gl) { this.failed = true; return false; }
        this.gl = gl; this.modern = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        this.onLost = () => {
            this.failed = true;
            for (const frame of [...this.surfaces.keys()]) this.remove(frame);
            this.onUnavailable();
        };
        this.canvas.addEventListener('webglcontextlost', this.onLost);
        const header = this.modern ? '#version 300 es\n' : '';
        const texturePrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision > 0 ? 'highp' : 'mediump';
        const vertex = `${header}precision highp float;
            ${this.modern ? 'in' : 'attribute'} vec2 a_position;
            ${this.modern ? 'in' : 'attribute'} vec2 a_uv;
            ${this.modern ? 'out' : 'varying'} ${texturePrecision} vec2 v_uv;
            uniform vec4 u_bounds;
            uniform bool u_flip;
            void main() {
                vec2 p = u_bounds.xy + a_position * u_bounds.zw;
                gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
                v_uv = vec2(a_uv.x, u_flip ? 1.0 - a_uv.y : a_uv.y);
            }`;
        const fragment = `${header}precision ${texturePrecision} float;
            ${this.modern ? 'in' : 'varying'} ${texturePrecision} vec2 v_uv;
            uniform sampler2D u_sprite;
            uniform sampler2D u_normal;
            uniform sampler2D u_material;
            uniform bool u_lit, u_hasNormal, u_hasMaterial;
            uniform vec3 u_lightDirection, u_lightColor;
            uniform float u_intensity, u_ambient, u_normalStrength, u_roughness, u_metallic;
            ${this.modern ? 'out vec4 color;' : ''}
            void main() {
                vec4 base = ${this.modern ? 'texture' : 'texture2D'}(u_sprite, v_uv);
                vec4 result = base;
                if (u_lit && base.a > 0.001) {
                    vec3 n = vec3(0.0, 0.0, 1.0);
                    if (u_hasNormal) { n = ${this.modern ? 'texture' : 'texture2D'}(u_normal, v_uv).rgb * 2.0 - 1.0; n.xy *= u_normalStrength; n = normalize(n + vec3(0.0, 0.0, 0.00001)); }
                    vec3 material = vec3(1.0, u_roughness, u_metallic);
                    if (u_hasMaterial) material = ${this.modern ? 'texture' : 'texture2D'}(u_material, v_uv).rgb;
                    vec3 l = u_lightDirection;
                    float ndl = max(dot(n, l), 0.0);
                    vec3 albedo = pow(clamp(base.rgb / base.a, 0.0, 1.0), vec3(2.2));
                    vec3 lamp = pow(u_lightColor, vec3(2.2)) * u_intensity;
                    float rough = clamp(material.g, 0.08, 1.0), metal = clamp(material.b, 0.0, 1.0);
                    vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
                    float shine = pow(max(dot(n, h), 0.0), mix(96.0, 3.0, rough * rough)) * (1.0 - rough * 0.8);
                    vec3 specular = mix(vec3(0.04), albedo, metal) * shine * lamp * ndl;
                    vec3 diffuse = albedo * (vec3(u_ambient * material.r) + lamp * ndl * (1.0 - metal * 0.65));
                    result = vec4(pow(max(diffuse + specular, vec3(0.0)), vec3(1.0 / 2.2)) * base.a, base.a);
                }
                ${this.modern ? 'color' : 'gl_FragColor'} = result;
            }`;
        const shaders = [];
        try {
            this.program = gl.createProgram();
            for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
                const shader = gl.createShader(type); shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                gl.attachShader(this.program, shader);
            }
            gl.linkProgram(this.program);
            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
            gl.useProgram(this.program);
            this.buffers = [];
            for (const [name, data, usage] of [['a_position', this.mesh.positions, gl.DYNAMIC_DRAW], ['a_uv', this.mesh.uv, gl.STATIC_DRAW]]) {
                const buffer = gl.createBuffer(); this.buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, usage);
                const location = gl.getAttribLocation(this.program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
            }
            this.indexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);
            this.bounds = gl.getUniformLocation(this.program, 'u_bounds');
            this.uniforms = Object.fromEntries(['flip', 'lit', 'hasNormal', 'hasMaterial', 'lightDirection', 'lightColor', 'intensity', 'ambient', 'normalStrength', 'roughness', 'metallic'].map(name => [name, gl.getUniformLocation(this.program, `u_${name}`)]));
            gl.uniform1i(gl.getUniformLocation(this.program, 'u_sprite'), 0);
            gl.uniform1i(gl.getUniformLocation(this.program, 'u_normal'), 1);
            gl.uniform1i(gl.getUniformLocation(this.program, 'u_material'), 2);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.enable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0);
            this.lightFramebuffer = gl.createFramebuffer();
            this.maxSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
            return true;
        } catch (error) {
            console.warn('[VN+] Mesh unavailable; using static sprites.', error);
            this.dispose(); this.failed = true; return false;
        } finally { for (const shader of shaders) gl.deleteShader(shader); }
    }
    enable(frame) {
        if (this.surfaces.has(frame)) return true;
        if (!this.initialize()) return false;
        const canvas = document.createElement('canvas'); canvas.className = 'vn-sprite-mesh';
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', frame.querySelector('.vn-sprite-open').alt);
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) return false;
        const surface = { canvas, context, textures: new Map(), litTextures: new Map(), mapRevision: 0, lightingPasses: 0, draws: 0 };
        this.surfaces.set(frame, surface); frame.append(canvas);
        // Keep the ordinary image visible until the first successful mesh draw.
        return true;
    }
    setMaps(frame, image, maps) {
        if (!this.materials.has(frame)) this.materials.set(frame, new Map());
        this.materials.get(frame).set(image, maps);
        const surface = this.surfaces.get(frame); if (surface) surface.mapRevision++;
    }
    texture(surface, image, data = false) {
        if (surface.textures.has(image)) return surface.textures.get(image);
        const gl = this.gl, texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        const powerOfTwo = n => (n & (n - 1)) === 0;
        let source = image;
        const largest = Math.max(image.naturalWidth, image.naturalHeight);
        if (largest > this.gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
            source = document.createElement('canvas'); const ratio = this.gl.getParameter(gl.MAX_TEXTURE_SIZE) / largest;
            source.width = Math.max(1, Math.floor(image.naturalWidth * ratio)); source.height = Math.max(1, Math.floor(image.naturalHeight * ratio));
            const context = source.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, source.width, source.height);
        }
        const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
        const mipmaps = this.modern || (powerOfTwo(width) && powerOfTwo(height));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        try {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !data);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
            surface.textures.set(image, texture); return texture;
        } catch (error) { gl.deleteTexture(texture); throw error; }
        finally { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); }
    }
    /** Bake a normal-mapped 2D direction only when the source/map/light/size changes.
     * Breathing then samples this cached texture with the ordinary unlit shader. */
    litTexture(surface, image, texture, maps, key, width, height, light, direction, properties) {
        const cached = surface.litTextures.get(image);
        if (cached?.key === key) return cached.texture;
        const gl = this.gl, u = this.uniforms, target = cached?.texture || gl.createTexture();
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        surface.litTextures.set(image, { texture: target, key });
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFramebuffer);
        try {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Lighting cache framebuffer unavailable');
            gl.viewport(0, 0, width, height); gl.scissor(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(this.program); gl.uniform4f(this.bounds, 0, 0, 1, 1); gl.uniform1i(u.flip, true);
            gl.uniform1i(u.lit, true); gl.uniform1i(u.hasNormal, light.normalMaps && !!maps.normal); gl.uniform1i(u.hasMaterial, light.normalMaps && !!maps.material);
            gl.uniform3f(u.lightDirection, ...direction);
            gl.uniform3f(u.lightColor, ...[1, 3, 5].map(at => parseInt(light.color.slice(at, at + 2), 16) / 255));
            gl.uniform1f(u.intensity, light.intensity); gl.uniform1f(u.ambient, light.ambient);
            gl.uniform1f(u.normalStrength, clamp(properties?.normalStrength, 0, 2, 1));
            gl.uniform1f(u.roughness, clamp(properties?.roughness, 0, 1, .82)); gl.uniform1f(u.metallic, clamp(properties?.metallic, 0, 1, 0));
            for (const [unit, map] of [[1, maps.normal], [2, maps.material]]) {
                gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, map && light.normalMaps ? this.texture(surface, map, true) : texture);
            }
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.mesh.uv);
            gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0); surface.lightingPasses++;
            return target;
        } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.uniform1i(u.flip, false); }
    }
    draw(frame, config, inhale, light = null, properties = {}) {
        const surface = this.surfaces.get(frame); if (!surface || this.failed) return false;
        const open = frame.querySelector('.vn-sprite-open'), closed = frame.querySelector('.vn-sprite-blink');
        const image = closed && !closed.hidden ? closed : open;
        const rect = frame.getBoundingClientRect(); if (!rect.width || !rect.height || !image?.naturalWidth) return false;
        try {
            const gl = this.gl; gl.activeTexture(gl.TEXTURE0);
            const texture = this.texture(surface, image);
            const allMaps = this.materials.get(frame), maps = { ...(image.naturalWidth === open.naturalWidth && image.naturalHeight === open.naturalHeight ? allMaps?.get(open) : {}), ...allMaps?.get(image) };
            frame.dataset.normalMap = String(!!(light?.enabled && light.normalMaps && maps.normal)); frame.dataset.materialMap = String(!!(light?.enabled && light.normalMaps && maps.material));
            const keep = new Set([open, closed, ...[...(allMaps?.values() || [])].flatMap(value => [value.normal, value.material])]);
            for (const [loaded, oldTexture] of surface.textures) if (!keep.has(loaded)) { gl.deleteTexture(oldTexture); surface.textures.delete(loaded); }
            for (const [loaded, cached] of surface.litTextures) if (!light?.enabled || (loaded !== open && loaded !== closed)) { gl.deleteTexture(cached.texture); surface.litTextures.delete(loaded); }
            const dpr = window.devicePixelRatio || 1;
            const ratio = Math.min(dpr, this.maxSize / rect.width, this.maxSize / rect.height);
            const width = Math.max(1, Math.ceil(rect.width * ratio)), height = Math.max(1, Math.ceil(rect.height * ratio));
            const root = frame.closest('#vnplus-overlay')?.getBoundingClientRect() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
            const direction = light?.enabled ? lightDirection(light, { x: (rect.left + rect.width / 2 - root.left) / root.width, y: (rect.top + rect.height / 2 - root.top) / root.height }, root.width / root.height) : null;
            const lightKey = JSON.stringify([direction, light?.enabled && [light.color, light.intensity, light.ambient, light.normalMaps], properties, surface.mapRevision, width, height]);
            const drawKey = JSON.stringify([lightKey, config, inhale]);
            if (surface.drawKey === drawKey && surface.image === image) return true;
            if (this.canvas.width < width) this.canvas.width = width;
            if (this.canvas.height < height) this.canvas.height = height;
            if (surface.canvas.width !== width) surface.canvas.width = width;
            if (surface.canvas.height !== height) surface.canvas.height = height;
            // Match the fallback img's contain/bottom-center sizing, including tall art.
            const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
            const fitWidth = image.naturalWidth * fit / width, fitHeight = image.naturalHeight * fit / height;
            const lit = light?.enabled ? this.litTexture(surface, image, texture, maps, lightKey, Math.max(1, Math.ceil(width * fitWidth)), Math.max(1, Math.ceil(height * fitHeight)), light, direction, properties) : texture;
            gl.viewport(0, 0, width, height); gl.scissor(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(this.program); gl.uniform4f(this.bounds, (1 - fitWidth) / 2, 1 - fitHeight, fitWidth, fitHeight);
            gl.uniform1i(this.uniforms.lit, false); gl.uniform1i(this.uniforms.flip, false);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, deformBreathingMesh(this.mesh, config, inhale));
            gl.bindTexture(gl.TEXTURE_2D, lit); gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
            surface.context.clearRect(0, 0, width, height);
            surface.context.drawImage(this.canvas, 0, this.canvas.height - height, width, height, 0, 0, width, height);
            frame.classList.add('vn-sprite-meshed'); surface.inhale = inhale; surface.image = image; surface.drawKey = drawKey; surface.draws++;
            return true;
        } catch (error) {
            console.warn('[VN+] Sprite mesh failed; using static image.', error); this.remove(frame); return false;
        }
    }
    remove(frame) {
        const surface = this.surfaces.get(frame); if (!surface) return;
        for (const texture of surface.textures.values()) this.gl?.deleteTexture(texture);
        for (const cached of surface.litTextures.values()) this.gl?.deleteTexture(cached.texture);
        surface.canvas.remove(); frame.classList.remove('vn-sprite-meshed'); this.surfaces.delete(frame);
    }
    dispose() {
        for (const frame of [...this.surfaces.keys()]) this.remove(frame);
        if (this.gl) {
            for (const buffer of this.buffers || []) this.gl.deleteBuffer(buffer);
            this.gl.deleteBuffer(this.indexBuffer); this.gl.deleteProgram(this.program); this.gl.deleteFramebuffer(this.lightFramebuffer);
            this.canvas.removeEventListener('webglcontextlost', this.onLost);
            this.gl.getExtension('WEBGL_lose_context')?.loseContext(); this.gl = null;
        }
    }
}
