# Harry Potter: correspondence & brass

An original CSS theme for VN+ 2.20 or newer. The dialogue resembles a folded letter: warm parchment, emerald ink, restrained rules, serif typography. The toolbar and playback controls use dark green bindings and aged brass. VN+ settings become a matching paper ledger.

Copy `dialogue.css` and `settings.css` from this folder to `environments/harry-potter/`, select **Harry Potter**, and click **Refresh assets**. These installed files are Git-ignored and survive extension updates. Back up any existing custom CSS before replacing it. To revert, turn off **General → Apply environment CSS (dialogue / settings)**, or remove the two installed CSS files and refresh. Other environments and other extensions keep their own styling.

## Design references

Research uses the film graphic designers and the official Harry Potter site:

- [Studio MinaLima's film work](https://www.studiominalima.com/harry-potter-fantastic-beasts-films): historical typography, manuscript details and convincing physical props.
- [Making the Hogwarts letter](https://www.harrypotter.com/features/minalima-talk-through-the-hogwarts-letter): emerald handwriting and sealed correspondence informed the ink palette.
- [The Daily Prophet designs](https://minalima.com/product/the-daily-prophet-deluxe-wallpaper/): typographic hierarchy and fine newspaper rules.
- [MinaLima's Prisoner of Azkaban edition](https://www.harrypotter.com/news/take-a-look-at-prisoner-of-azkaban-illustrated-by-minalima): fine gold framing around illustrated book covers.

No logos, film graphics, fonts or textures are copied or downloaded. Paper grain, borders and ornaments are CSS. The fonts use installed Palatino/Book Antiqua, with Georgia and serif fallbacks. There are no external requests.

## Customize

Edit the `--hp-*` variables at the top of each file. `dialogue.css` controls the VN overlay; `settings.css` controls only VN+'s extension settings. See [the CSS reference](../../docs/environment-css.md).

Character text colors, fonts, textures and voice properties remain authoritative. Unspecified text colors become dark ink on parchment. If a character uses a pale text color, choose a darker ink in its `properties.json` for contrast. The theme supplies a parchment fill for ordinary boxes. **Textbox image only** continues to display its own texture with a transparent frame. The theme does not move busts, change timing or recolor the scene lighting.

The dialogue is wider than the default at desktop sizes. Mobile controls wrap, keyboard focus remains visible, and the existing reduced-motion setting still applies. Long dialogue scrolls inside the box.
