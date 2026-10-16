# Optional 3D scene light

Enable **Extensions → Visual Novel+ → Scene lighting → Enable 3D scene light**. It starts off for existing and new installations. **Use sprite normal and material maps**, **Light HUD and buttons**, **Light intensity** and **Ambient fill** can be adjusted independently. A page refresh installs this frontend feature; no new server bridge is required.

The light follows fictional header time, including inherited headers, historical playback and backward navigation. It does not use the computer clock or animate time by itself. Outside, its position and color interpolate through:

| Story time | Position | Color |
| --- | --- | --- |
| 06:00 | Middle left | Orange |
| 09:00 | Top left | Pale yellow |
| 12:00 | Above center | Near white |
| 15:00 | Top right | Pale yellow |
| 18:00 | Middle right | Orange |

After dark there is a faint cool overhead fill. Indoors the default is a warm, candle-colored overhead light, independent of time. Unknown time uses a neutral overhead light. Existing background time shading remains active. The new sprite shader replaces the old whole-stage brightness multiplier, avoiding double darkening; inactive-speaker and narrator dimming still apply separately.

## Background overrides

Add a `light` object to an entry in the environment's existing `backgrounds/properties.json`. Matching uses the actual resolved background filename, including semantic matches. An omitted entry is outside; an omitted light field keeps its automatic value.

```json
{
  "Hogwarts - Great Hall - Candlelit Tables.png": {
    "inside": true,
    "light": {
      "position": { "x": 0.35, "y": 0.05, "z": 0.9 },
      "color": "#ffd39a",
      "intensity": 0.9,
      "ambient": 0.35
    }
  }
}
```

X/Y are fractions of the entire VN viewport: X=0 is left, X=1 is right; Y=0 is top, Y=1 is bottom. Z is distance toward the viewer in viewport-height units. X/Y may be -2 to 3 for offscreen sources, Z .05–4, intensity 0–3, ambient 0–1. Colors use `#rrggbb`. Invalid values fall back to automatic values, and numeric outliers are clamped. Global intensity multiplies the source intensity. An authored override is static, including outdoors, until a different background/entry is selected. Use **Refresh assets** after editing properties.

## Sprite normal and material maps

Place optional PNG maps next to each expression image, using the resolved image's stem:

```text
characters/lyra_malfoy/sprites/
  joy.png
  joy_normal.png
  joy_material.png
  joy_blink.png
  joy_blink_normal.png       (optional)
  joy_blink_material.png     (optional)
```

Normal maps use **OpenGL/tangent-space +Y**: red faces right, green faces up, blue faces the viewer. A flat normal is approximately RGB `(128,128,255)`. The shader preserves image alpha and uses the same UVs for color, normals and materials, including breathing deformation. Export all maps with the **same pixel dimensions and alignment** as the matching color image. Mismatched/broken maps are ignored. DirectX normals need their green channel inverted before use.

Material maps are packed **ORM** data: **R=ambient occlusion, G=roughness, B=metallic**. White occlusion is unoccluded, white roughness is matte, white metallic is metal. A useful plain matte material is RGB `(255,210,0)`. Alpha is ignored. These channels follow the usual [glTF texture convention](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials); VN+'s lightweight diffuse/specular lighting is not a full glTF/PBR renderer. Data maps are not treated as sRGB colors or multiplied by their alpha.

Maps follow the **resolved expression**, so an emotion routed to `joy.png` uses `joy_normal.png`. Maps are never expressions or fallback artwork. Missing blink maps reuse matching open-eye maps; dedicated blink maps override only their supplied channels. New files can be found without a catalog rebuild; successful and missing lookups are cached until Refresh assets. Optional map failures do not turn the character into a silhouette. Without maps, the image receives flat-surface lighting; the feature does not infer an anatomically accurate normal map from the drawing.

Optional scalar material defaults belong in character properties:

```json
{ "lighting": { "normalStrength": 1, "roughness": 0.82, "metallic": 0 } }
```

Normal strength ranges 0–2. Roughness and metallic range 0–1 and apply when no material map is present. Lighting works with breathing disabled and with reduced motion, without starting an idle animation clock. WebGL failures fall back to the ordinary image with basic brightness shading.

## HUD and artifacts

HUD groups receive light color/intensity while keeping a readability floor. Button bevel highlights/shadows follow the source position. Themes retain their original materials, shadows, geometry and focus states; toggling lighting off restores their original filters/shadows. This is a DOM surface approximation, rather than normal-mapping every HTML button. HUD lighting can be disabled while keeping sprite lighting.

Interactive artifacts receive light data through their existing isolated capability channel. Their iframe is not forcibly color-filtered: each object decides how to light its own textures/geometry, avoiding double shading. No extra parent access, network access, storage permission or model call is granted.

Static artifacts without a bridge receive basic host-side color/brightness shading instead. Interactive artifacts written before this API need a lighting handler to use the new data; the compass below provides a working example.

```js
await VNPlus.ready;
function lightObject(light) {
    // enabled, position{x,y,z}, color, intensity, ambient, level, inside,
    // viewport{width,height}, artifact{x,y,width,height}
    // position is in VN viewport fractions; artifact bounds use the same units.
    const localX = (light.position.x - light.artifact.x) / light.artifact.width;
    // Update this artifact's CSS, canvas or WebGL renderer here.
}
const unsubscribe = VNPlus.onLighting(lightObject);
lightObject(await VNPlus.getLighting());
// Later: unsubscribe();
```

`window` also emits `vnplus:lighting` events inside the sandbox. Existing artifacts stay open and keep their interaction state when time/light changes. Events stop when the session closes. See [the responding brass compass](../examples/scene-light-compass.html): copy it into an environment as `artifacts/scene-light-compass/index.html`, enable interactive artifacts, then use `#VISUAL scene-light-compass`. The example reads lighting only and writes no message data.

The same sanitized object appears in `sceneVariables.lighting.light` and in current/playback snapshots under message `extra.vn_plus`. Context reconstruction includes background overrides even while VN is closed. Opening a historical scene lights the displayed scene without replacing the latest context snapshot. The overlay emits `vnplus:light-changed` whenever the shared presentation light changes.
