# Changelog

## 1.0.0 (2026-07-02)


### Features

* add network MIDI output + mt32-pi device module ([1996526](https://github.com/nicolasgalvez/opl3-duo-midi/commit/199652601b1260dd58523d597342787157015839))
* add network MIDI output + mt32-pi device module ([79be54f](https://github.com/nicolasgalvez/opl3-duo-midi/commit/79be54fe494339f0a67305ad6fcbb21a7e82752b))
* **midi:** add --av-offset for render A/V sync tweak ([4b122f4](https://github.com/nicolasgalvez/opl3-duo-midi/commit/4b122f43ab485db258840d923aec0557ebec038d))
* **midi:** add --obs render mode via OBS WebSocket ([80d8657](https://github.com/nicolasgalvez/opl3-duo-midi/commit/80d8657db1a5ae881fcc761e8ecd67623e6441e9))
* **midi:** add overnight batch album renderer ([225e25f](https://github.com/nicolasgalvez/opl3-duo-midi/commit/225e25f39a03468d76257cce56e2605a3cb333da))
* **midi:** display layouts, platform presets, and root npm link ([bf65d9c](https://github.com/nicolasgalvez/opl3-duo-midi/commit/bf65d9cd701c1897f89e723131b5c81f2d72907d))
* **midi:** load .m3u and JSPF playlists in play/serve/render ([d0baa6b](https://github.com/nicolasgalvez/opl3-duo-midi/commit/d0baa6b2328ab2237127c0695576d34f5434b5c0))
* **midi:** load .m3u and JSPF playlists in play/serve/render [ODM-1] ([e3402c3](https://github.com/nicolasgalvez/opl3-duo-midi/commit/e3402c33d52a35691e104dbfb5b02d2a2914fc3d))
* **midi:** optional repeat/shuffle with web UI toggles ([dc6bde5](https://github.com/nicolasgalvez/opl3-duo-midi/commit/dc6bde5c8888ba62277e241e04a1312a5adb710e))
* **midi:** persistent media library (lowdb) with /api/library ([ceeb31b](https://github.com/nicolasgalvez/opl3-duo-midi/commit/ceeb31b7654eb7ebe82979b1fd6b3de612b5ac73))
* **midi:** video render with clean RtAudio audio capture + web theming ([1bd09c1](https://github.com/nicolasgalvez/opl3-duo-midi/commit/1bd09c1e7883042e154a1299e07a5e5b04ec0435))
* OPL3 Duo USB-MIDI synth firmware for Teensy 4.1 + opl CLI ([0f937ea](https://github.com/nicolasgalvez/opl3-duo-midi/commit/0f937ea90055d81209e520214842ff17dc9a34fd))
* **render:** support driving an installed browser via --browser-path ([fb8976f](https://github.com/nicolasgalvez/opl3-duo-midi/commit/fb8976f51ae5de4d5bcd42760e441739986650ec))
* web player UI, L/R VU LEDs, and web tests ([#1](https://github.com/nicolasgalvez/opl3-duo-midi/issues/1)) ([6b35d19](https://github.com/nicolasgalvez/opl3-duo-midi/commit/6b35d198bc916d716d5786a2fba8da64e0b77a00))
* **web:** add WCAG-AA theme options (green/winamp/win98/amber) ([4519433](https://github.com/nicolasgalvez/opl3-duo-midi/commit/451943349d1aa1aae39aa0203fb1783af04bbed4))
* **web:** gate Web Player v2 behind --ui v2, add live position + e2e ([3aca69b](https://github.com/nicolasgalvez/opl3-duo-midi/commit/3aca69b4c8fb194d4ab598011cc9f2ba74843e21))
* **web:** in-browser playback foundation — MIDI bytes + output switch ([954f38f](https://github.com/nicolasgalvez/opl3-duo-midi/commit/954f38f88aee5f7f224f0cbb2ffe5243529a19cd))
* **web:** in-browser SoundFont playback (spessasynth) ([bfcf111](https://github.com/nicolasgalvez/opl3-duo-midi/commit/bfcf111d2dd63abe55159d8a5ef38687ba3a9705))
* **web:** in-browser SoundFont playback (spessasynth) [ODM-5] ([6659f74](https://github.com/nicolasgalvez/opl3-duo-midi/commit/6659f741be968207d472d432d83a3ac583cb0d26))
* **web:** integrate Tailwind v4 (theme + utilities, no preflight) ([422e381](https://github.com/nicolasgalvez/opl3-duo-midi/commit/422e381c59d83163270f730dec9cb8a0ff3fd4ea))
* **web:** layout parity for minimized + overlay in the SPA (ODM-7 slice 1) ([659c2b4](https://github.com/nicolasgalvez/opl3-duo-midi/commit/659c2b494fd19a89f5901ccbbe27a31261e32bf8))
* **web:** make v2 the default UI + migrate layout specs ([4e03dc0](https://github.com/nicolasgalvez/opl3-duo-midi/commit/4e03dc003872c438c2bcd41d3bfbca6281552fb6))
* **web:** make Web Player v2 the default UI + layout parity [ODM-7] ([bdf9cac](https://github.com/nicolasgalvez/opl3-duo-midi/commit/bdf9cac896541ada1f8398611530e453bbb5ed08))
* **web:** media library — drag-drop upload + local DB [ODM-4] ([db871a5](https://github.com/nicolasgalvez/opl3-duo-midi/commit/db871a5ff72a4bcbfcf839c052b826fa61c2d7a7))
* **web:** media library UI — drag-drop upload, search, play, remove ([69ea4b6](https://github.com/nicolasgalvez/opl3-duo-midi/commit/69ea4b65093afca27ad2c3b3260626736e0087b5))
* **web:** runtime config + feature flags for embeddable player mode ([0237ddc](https://github.com/nicolasgalvez/opl3-duo-midi/commit/0237ddc0cbfcb2fcedee7860e132bb82c9c5cc69))
* **web:** runtime config + feature flags for embeddable player mode [ODM-6] ([9cca13d](https://github.com/nicolasgalvez/opl3-duo-midi/commit/9cca13def228a1916204699d1d5926955e722bd2))
* **web:** scaffold Web Player v2 SPA with File/Edit/View menu ([571bb5a](https://github.com/nicolasgalvez/opl3-duo-midi/commit/571bb5a7e11e0caefaf8fa2e7a3278396a0fd86c))
* **web:** WCAG-AA theme options + Tailwind foundation [ODM-8] ([e03431a](https://github.com/nicolasgalvez/opl3-duo-midi/commit/e03431a8c9864f1be6407d2be67d842c72a3c8de))
* **web:** Web Player v2 — File/Edit/View menu + React rebuild [ODM-3] ([79f6965](https://github.com/nicolasgalvez/opl3-duo-midi/commit/79f6965dd4ae2965e5c2a6140b3573b284e9d3d3))
* **web:** wire File/Edit menus to backend (open/save/reorder/remove) ([1454827](https://github.com/nicolasgalvez/opl3-duo-midi/commit/1454827881390df14f617ceeee022f3634052f0f))


### Bug Fixes

* **ci:** install ALSA so `opl serve` loads + tolerant test-server startup ([4318744](https://github.com/nicolasgalvez/opl3-duo-midi/commit/4318744606ca19b86ce4e308d45c193b55d798f7))
* **midi:** don't crash serve when MIDI enumeration fails (no ALSA seq) [ODM-10] ([5580ee6](https://github.com/nicolasgalvez/opl3-duo-midi/commit/5580ee6d1e4a01a9725adec8734da69610c63942))
* **midi:** send full controller reset between tracks [ODM-16] ([#28](https://github.com/nicolasgalvez/opl3-duo-midi/issues/28)) ([5062901](https://github.com/nicolasgalvez/opl3-duo-midi/commit/5062901be5b003d06c3bcc8832eca407a614fcca))
* **midi:** support RIFF-wrapped (.rmi) MIDI files ([657a2ed](https://github.com/nicolasgalvez/opl3-duo-midi/commit/657a2ed34aec9ae9caa0b2ec18a1e5db99f28d56))
* **render:** support old macOS via --browser-path, fix OBS file race ([eed8c25](https://github.com/nicolasgalvez/opl3-duo-midi/commit/eed8c255822f582cd2282b4b01fa5bd3215e9428))
* **render:** wait for OBS output file size to stabilize ([0b6749a](https://github.com/nicolasgalvez/opl3-duo-midi/commit/0b6749a2ad5f9d99c4cc82d4662ca73389f6719c))
* **test:** repair render.spec + clean the unit glob [ODM-9] ([c2a0c47](https://github.com/nicolasgalvez/opl3-duo-midi/commit/c2a0c471affd5142824b81d9a1cc35a5e23e63e6))
* **test:** repair render.spec server + move hardware script out of unit glob ([34724ad](https://github.com/nicolasgalvez/opl3-duo-midi/commit/34724adbf0843d0e7f1ded99374d2a5a66b32576))
