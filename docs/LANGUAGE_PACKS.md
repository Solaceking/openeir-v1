# Language packs

OpenEir ships English as the compiled core. Everything else is a **community pack**: a single JSON file loaded on demand, versioned independently, with graceful fallback to English for any missing key.

> **Status at release:** English is the only fully translated language. German, Simplified Chinese and Arabic/RTL packs exist as working drafts in `public/language-packs/` but are gated behind a **“Coming soon”** badge in Settings until their coverage is complete — OpenEir does not ship half-translated interfaces. Contributions that push a pack to 100% of the keys in `src/lib/i18n/en.ts` are exactly the kind of first PR we love.

## Anatomy

`public/language-packs/<code>.json`:

```json
{
  "name": "German",
  "nativeName": "Deutsch",
  "dir": "ltr",
  "version": "1.0.0",
  "authors": ["You <you@example.org>"],
  "strings": {
    "nav": { "dashboard": "Übersicht", "record": "Erfassen" },
    "dashboard": { "greetingMorning": "Guten Morgen, {name}" }
  }
}
```

- `dir` — `"ltr"` or `"rtl"`. RTL flips the entire interface.
- `strings` — any subset of the keys in `src/lib/i18n/en.ts`. Deep-merged over English.
- `{name}` — interpolation variables, same names as the English source.

## Contributing one

1. Copy `public/language-packs/de.json` as your template.
2. Translate the keys you can; **skip the rest** — fallback fills them in while you work (a pack is enabled in the Settings switcher once it covers all core keys).
3. Bump `version`, add yourself to `authors`.
4. Add a row to `PACK_CHOICES` in `src/components/views/settings.tsx`.
5. Open a PR titled `i18n: add <language>`.

## Conventions

- Keep clinical terms conservative: use the phrasing your doctor uses.
- The Eir insight texts are generated in English by the AI layer; pack strings cover UI chrome. (Model-driven insight translation is on the roadmap.)
- Test your pack with a screen reader too — German VoiceOver is a different experience than German text on screen.

## How loading works

`src/lib/i18n/index.ts` fetches `/language-packs/<code>.json` when selected, caches it in memory and localStorage, deep-merges over the English dictionary, and sets `document.dir` for RTL. Zero server involvement; no unused bytes ever downloaded.
