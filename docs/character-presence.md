# Character presence and quiet busts

The current completed POV message controls which busts remain on stage. A character participates by speaking (including an alias/thought) or through an explicit `#ENTER`. Someone absent from the whole message leaves the stage, even when their recent expression is still cached. Narration-only messages clear inherited busts unless they explicitly enter characters. Explicit exits and scene/location changes still apply.

Each dialogue, narration or artifact beat increases a present character's quiet count unless that character is the current speaker. Over four quiet beats, the bust moves farther toward its own screen edge, gradually darkens toward the inactive-brightness setting and becomes less opaque. Movement/dimming settles over 1.8 seconds; speaking restores the normal position, brightness and opacity over 0.35 seconds. Timed commands and repeated renders do not add quiet beats. Backward navigation reconstructs the saved beat's state.

Characters missing from a new message slide fully off their existing side and fade out over 1.4 seconds. The departing image retains its expression; pending image work, breathing and blinking are suspended, and resources are released after departure. A return before the exit finishes reuses the same body and cancels removal. Reduced motion removes absent bodies immediately. Closing or changing worlds cancels exits and releases their resources.

The existing cast-memory window still caches recent identities/emotions. Untagged dialogue keeps a cached expression; explicit `[default]`, `[neutral]` or another emotion replaces it normally. The narrator never receives a body. Missing-art shadows follow the same presence rules, and full-body anchors/character offsets remain unchanged.

Message-extra snapshots retain cached cast entries for compatibility. Each character now includes `present` and `silentBeats`; filter `characters` by `character.present !== false` to obtain the message's present cast. Cached entries with `present: false` do not occupy visible stage slots or leave stale busts on screen.
