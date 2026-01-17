[![license](https://img.shields.io/github/license/emptydeen/data.svg)](LICENSE) [![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme) ![npm](https://img.shields.io/npm/v/@max-xoo/fotmob?color=green)
# 📿 EmptyDeen - Data

> Data collection engine for **[EmptyDeen](https://github.com/emptydeen/emptydeen)** - An Islamic learning app with a modern interface

## 📌 What's this?

This repo scrapes and processes Quranic data:

- 📖 Quran text (Arabic + translations)
- 📝 Tafsir (commentary)
- 🔊 Audio recitations
- 🗣️ Phonetic pronunciations with Tajwid

## 🚀 Quick Start

```bash
# 1. Extract the database
unzip data/quran.sqlite.zip -d data/

# 2. Install dependencies
npm install

# 3. Run the script
node index.js
```

> **Note:** The `quran.sqlite` database is converted from [quran-database](https://github.com/AbdullahGhanem/quran-database) to SQLite format.

**Output:**
```
output/
├── surahs.json          # All Quran data
└── audios/
    ├── 1/               # Surah 1 audios
    │   ├── 1.mp3
    │   ├── 2.mp3
    │   └── ...
    └── ...
```

## 📊 Data Sources

- **Translations & Quran**: [tanzil.net/trans](https://tanzil.net/trans/)
- **Tafsir**: [quranenc.com](https://quranenc.com/fr/)
- **Pronunciations**: [transliteration.org](http://transliteration.org/)

## 📝 JSON Structure

```json
{
  "1": {
    "name": "Al-Fatihah",
    "number": 1,
    "surah": {
      "en": ["In the name of Allah..."],
      "fr": ["Au nom d'Allah..."],
      "ar": ["بِسْمِ اللَّهِ..."]
    },
    "tafsir": {
      "en": [["Commentary..."]],
      "fr": [["Commentaire..."]]
    },
    "pronunciation": ["Bismi <HmA>A</HmA>ll<MS2>ā</MS2>hi..."]
  }
}
```