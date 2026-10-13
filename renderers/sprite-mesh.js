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
        this.surfaces = new Map(); this.mesh = createBreathingMesh(); this.onUnavailable = onUnavailable;
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
            void main() {
                vec2 p = u_bounds.xy + a_position * u_bounds.zw;
                gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
                v_uv = a_uv;
            }`;
        const fragment = `${header}precision ${texturePrecision} float;
            ${this.modern ? 'in' : 'varying'} ${texturePrecision} vec2 v_uv;
            uniform sampler2D u_sprite;
            ${this.modern ? 'out vec4 color;' : ''}
            void main() { ${this.modern ? 'color = texture' : 'gl_FragColor = texture2D'}(u_sprite, v_uv); }`;
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
            gl.uniform1i(gl.getUniformLocation(this.program, 'u_sprite'), 0);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.enable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0);
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
        const surface = { canvas, context, textures: new Map() };
        this.surfaces.set(frame, surface); frame.append(canvas);
        // Keep the ordinary image visible until the first successful mesh draw.
        return true;
    }
    texture(surface, image) {
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
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
            surface.textures.set(image, texture); return texture;
        } catch (error) { gl.deleteTexture(texture); throw error; }
    }
    draw(frame, config, inhale) {
        const surface = this.surfaces.get(frame); if (!surface || this.failed) return false;
        const open = frame.querySelector('.vn-sprite-open'), closed = frame.querySelector('.vn-sprite-blink');
        const image = closed && !closed.hidden ? closed : open;
        const rect = frame.getBoundingClientRect(); if (!rect.width || !rect.height || !image?.naturalWidth) return false;
        try {
            const gl = this.gl, texture = this.texture(surface, image);
            for (const [loaded, oldTexture] of surface.textures) if (loaded !== open && loaded !== closed) { gl.deleteTexture(oldTexture); surface.textures.delete(loaded); }
            const dpr = window.devicePixelRatio || 1;
            const ratio = Math.min(dpr, this.maxSize / rect.width, this.maxSize / rect.height);
            const width = Math.max(1, Math.ceil(rect.width * ratio)), height = Math.max(1, Math.ceil(rect.height * ratio));
            if (this.canvas.width < width) this.canvas.width = width;
            if (this.canvas.height < height) this.canvas.height = height;
            if (surface.canvas.width !== width) surface.canvas.width = width;
            if (surface.canvas.height !== height) surface.canvas.height = height;
            // Match the fallback img's contain/bottom-center sizing, including tall art.
            const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
            const fitWidth = image.naturalWidth * fit / width, fitHeight = image.naturalHeight * fit / height;
            gl.viewport(0, 0, width, height); gl.scissor(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(this.program); gl.uniform4f(this.bounds, (1 - fitWidth) / 2, 1 - fitHeight, fitWidth, fitHeight);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, deformBreathingMesh(this.mesh, config, inhale));
            gl.bindTexture(gl.TEXTURE_2D, texture); gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
            surface.context.clearRect(0, 0, width, height);
            surface.context.drawImage(this.canvas, 0, this.canvas.height - height, width, height, 0, 0, width, height);
            frame.classList.add('vn-sprite-meshed'); surface.inhale = inhale; surface.image = image;
            return true;
        } catch (error) {
            console.warn('[VN+] Sprite mesh failed; using static image.', error); this.remove(frame); return false;
        }
    }
    remove(frame) {
        const surface = this.surfaces.get(frame); if (!surface) return;
        for (const texture of surface.textures.values()) this.gl?.deleteTexture(texture);
        surface.canvas.remove(); frame.classList.remove('vn-sprite-meshed'); this.surfaces.delete(frame);
    }
    dispose() {
        for (const frame of [...this.surfaces.keys()]) this.remove(frame);
        if (this.gl) {
            for (const buffer of this.buffers || []) this.gl.deleteBuffer(buffer);
            this.gl.deleteBuffer(this.indexBuffer); this.gl.deleteProgram(this.program);
            this.canvas.removeEventListener('webglcontextlost', this.onLost);
            this.gl.getExtension('WEBGL_lose_context')?.loseContext(); this.gl = null;
        }
    }
}
