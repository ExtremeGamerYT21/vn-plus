import { sceneLighting } from './scene-context.js';

export const LIGHT_DEFAULTS = { sceneLightEnabled: false, sceneLightNormalMaps: true, sceneLightHud: true, sceneLightIntensity: 1, sceneLightAmbient: .35 };
const number = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const color = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
export const lightRGB = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
const blendColor = (a, b, t) => '#' + lightRGB(a).map((value, index) => Math.round((value + (lightRGB(b)[index] - value) * t) * 255).toString(16).padStart(2, '0')).join('');

/** Fictional local time, never the PC clock. Coordinates are fractions of the viewport; Y points down. */
export function sceneLight(scene, inside = false, settings = {}, properties = {}) {
    const daylight = sceneLighting(scene, inside), minutes = scene?.minutes;
    let position = { x: .5, y: .05, z: 1 }, tint = '#fff9ed', kind = 'unknown', strength = 1;
    if (inside) { tint = '#ffd39a'; kind = 'indoor'; strength = .9; }
    else if (Number.isFinite(minutes)) {
        const at = Math.max(0, Math.min(1439, minutes));
        if (at < 360 || at > 1080) { tint = '#b5c9ff'; kind = 'moon'; strength = .14; }
        else {
            const points = [[360, .06, .5, .65, '#ff9955'], [540, .22, .08, 1, '#ffe4a3'], [720, .5, -.08, 1.2, '#fffdf5'], [900, .78, .08, 1, '#ffe4a3'], [1080, .94, .5, .65, '#ff9955']];
            const upper = Math.max(1, points.findIndex(point => point[0] >= at));
            const a = points[upper - 1], b = points[upper], t = (at - a[0]) / (b[0] - a[0]);
            position = Object.fromEntries(['x', 'y', 'z'].map((key, index) => [key, a[index + 1] + (b[index + 1] - a[index + 1]) * t]));
            tint = blendColor(a[4], b[4], t); kind = 'sun'; strength = .2 + .8 * daylight.level;
        }
    }
    const authored = properties?.light && typeof properties.light === 'object' && !Array.isArray(properties.light) ? properties.light : {};
    const source = authored.position;
    position = { x: number(source?.x, position.x, -2, 3), y: number(source?.y, position.y, -2, 3), z: number(source?.z, position.z, .05, 4) };
    const intensity = number(authored.intensity, strength, 0, 3) * number(settings.sceneLightIntensity, 1, 0, 2);
    const ambient = number(authored.ambient, number(settings.sceneLightAmbient, .35, 0, 1) * (inside ? 1 : .55 + .45 * daylight.level), 0, 1);
    return { enabled: settings.sceneLightEnabled === true, normalMaps: settings.sceneLightNormalMaps !== false, hud: settings.sceneLightHud !== false,
        kind, position, color: color(authored.color, tint), intensity, ambient, level: daylight.level, inside: !!inside,
        coordinates: 'viewport fractions; x right, y down, z toward viewer', normalConvention: 'OpenGL +Y', materialChannels: 'R: occlusion, G: roughness, B: metallic' };
}

/** Small CPU equivalent used for DOM surfaces and deterministic renderer checks. */
export function surfaceLight(light, position = { x: .5, y: .5 }, aspect = 1, normal = [0, 0, 1]) {
    if (!light?.enabled) return { brightness: 1, color: '#ffffff', direction: { x: 0, y: -1 }, diffuse: 0 };
    const vector = [(light.position.x - position.x) * aspect, position.y - light.position.y, light.position.z];
    const length = Math.hypot(...vector) || 1;
    const diffuse = Math.max(0, vector.reduce((sum, value, index) => sum + value / length * normal[index], 0));
    return { brightness: Math.max(.4, Math.min(1.3, light.ambient + light.intensity * diffuse)), color: light.color,
        direction: { x: vector[0] / length, y: -vector[1] / length }, diffuse };
}
