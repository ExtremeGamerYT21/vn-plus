# Harry Potter: correspondence & brass

An original theme for VN+ 2.20.1 or newer. Dialogue and playback buttons share a single sheet of textured parchment with irregular edges, warm patina and paper shadows. The lower margin holds raised brass controls and a green Continue key. Emerald ink, restrained rules and serif typography complete the letter. VN+ settings become a matching paper ledger.

Buttons use brushed brass or textured green faces, worn metal rims, engraved-looking lettering and a visible raised edge. Pressing a key depresses it; Auto and music toggles remain inset with a red wax finish while selected. Dropdowns sit in recessed wells, and the settings action buttons use the same green-and-brass material. Keyboard focus and disabled states remain distinct.

Copy `dialogue.css`, `settings.css` and the `ui/` folder from this folder to `environments/harry-potter/`, select **Harry Potter**, and click **Refresh assets**. Keep the path `ui/parchment-paper.png` relative to the CSS. These installed files are Git-ignored and survive extension updates. Back up any existing custom CSS before replacing it. To revert, turn off **General → Apply environment CSS (dialogue / settings)**, or remove the two installed CSS files and refresh. Other environments and other extensions keep their own styling.

## Design references

Research uses the film graphic designers and the official Harry Potter site:

- [Studio MinaLima's film work](https://www.studiominalima.com/harry-potter-fantastic-beasts-films): historical typography, manuscript details and convincing physical props.
- [Making the Hogwarts letter](https://www.harrypotter.com/features/minalima-talk-through-the-hogwarts-letter): emerald handwriting and sealed correspondence informed the ink palette.
- [The Daily Prophet designs](https://minalima.com/product/the-daily-prophet-deluxe-wallpaper/): typographic hierarchy and fine newspaper rules.
- [MinaLima's Prisoner of Azkaban edition](https://www.harrypotter.com/news/take-a-look-at-prisoner-of-azkaban-illustrated-by-minalima): fine gold framing around illustrated book covers.

No logos, film graphics or fonts are copied. `ui/parchment-paper.png` is an original generated blank-paper texture. Irregular edges, inset rules, brass highlights and pressed button states are CSS. The fonts use installed Palatino/Book Antiqua, with Georgia and serif fallbacks. There are no external requests.

## Customize

Edit the `--hp-*` variables at the top of each file. `dialogue.css` controls the VN overlay; `settings.css` controls only VN+'s extension settings. See [the CSS reference](../../docs/environment-css.md).

Character text colors, fonts, textures and voice properties remain authoritative. Unspecified text colors become dark ink on parchment. If a character uses a pale text color, choose a darker ink in its `properties.json` for contrast. The `.vn-dialogue-shell` surrounds both text and buttons; other themes retain `display: contents` by default. **Textbox image only** bypasses this paper frame and continues to display its own texture with a transparent frame. Waiting screens and hidden dialogue also bypass the paper. The theme does not move busts, change timing or recolor the scene lighting.

The dialogue is wider than the default at desktop sizes. Mobile controls wrap, keyboard focus remains visible, and the existing reduced-motion setting still applies. The paper grows upward with the full text, reserving room for the toolbar and buttons. Exceptionally long passages still scroll when they exceed the available screen height, with the scrollbar hidden. Typewriter reveal reserves the full paragraph's height from the start.
