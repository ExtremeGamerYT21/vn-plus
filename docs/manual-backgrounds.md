# Manual background recovery

Click **Background** in VN mode's top bar to replace a missing or black background immediately. Filter the current environment's indexed images, preview one, then click **Apply background**. You can also choose an image from your computer (up to 25 MiB); it applies as soon as it loads.

The replacement stays across dialogue beats without replaying speech, moving the playback position, or editing the chat's text. **Use scripted background** removes it. A changed scripted background, fade/presentation mode, chat, or content environment also removes it. Choosing a replacement can temporarily reveal a scene that is currently faded to black.

Local files are kept in memory for the current page only, and are released when replaced, cleared, or the extension is disposed. They are not uploaded or copied into authored content folders. Add an image to the environment's `backgrounds/` folder and refresh the asset inventory if you want it available permanently. Environment images retain their configured indoor/outdoor lighting properties; temporary local images use the outdoor default.

The playback snapshot in message `extra` identifies an active replacement with `background.manual: true`; local files also set `background.temporary: true` and leave `background.asset` empty instead of persisting a temporary object URL. Reconstructed narrative context continues to describe the script.
