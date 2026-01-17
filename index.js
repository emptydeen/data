const fs = require("fs");
const path = require("path");

const axios = require("axios");
const cheerio = require("cheerio");

const sqlite3 = require("better-sqlite3");
const db = sqlite3("data/quran.sqlite");

const surahs = {};

let stats = {
    totalSurahs: 0,
    totalVerses: 0,
    downloadedAudios: 0,
    skippedAudios: 0,
    failedAudios: 0
};

(async () => {
    console.log("🚀 Starting Quran data processing...\n");
    
    const folders = fs.readdirSync("data/surah/", {
            withFileTypes: true
        })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    console.log(`📁 Found ${folders.length} translation folders\n`);

    const quran = db.prepare(`SELECT * FROM surahs`).all();
    console.log(`📖 Loaded ${quran.length} surahs from database\n`);

    console.log("📝 Processing text data...");
    for (const folder of folders) {
        const lines = fs.readFileSync(path.join("data", "surah", folder, "data.txt"))
            .toString()
            .split("\n");

        for (const line of lines) {
            if (!line.trim()) continue;
            
            const data = line.split("|");
            const surah = quran.find(i => i.id.toString() === data[0].toString());

            const name = surah["name_en"];
            const number = parseInt(data[0]);
            const aya = parseInt(data[1]);
            const text = data[2];

            if (!surahs.hasOwnProperty(number)) {
                surahs[number] = {
                    name,
                    number,
                    tafsir: {},
                    surah: {},
                    pronunciation: []
                };
            }

            if (!surahs[number]["surah"][folder]) {
                surahs[number]["surah"][folder] = [];
            }

            surahs[number]["surah"][folder][aya - 1] = text.trim();
            surahs[number].length = aya;
        }

        const tafsirPath = path.join("data", "surah", folder, "tafsir.sqlite");

        if (fs.existsSync(tafsirPath)) {
            const tafsir = sqlite3(tafsirPath).prepare(`SELECT * FROM translations`).all();

            for (const data of tafsir) {
                const number = parseInt(data.sura);
                const aya = parseInt(data.aya);

                if (!surahs[number]["tafsir"][folder]) {
                    surahs[number]["tafsir"][folder] = [];
                }

                surahs[number]["tafsir"][folder][aya - 1] = [
                    data.translation.substring((aya.toString()).length).trim(),
                    ...(data.footnotes && data.footnotes.trim() ? [data.footnotes] : [])
                ];
            }
        }
    }
    
    console.log("✅ Text data processed\n");

    stats.totalSurahs = Object.keys(surahs).length;

    console.log("🔊 Scraping pronunciations and downloading audios...\n");

    let lastLog = Date.now();
    const downloadQueue = [];

    for (const [number, data] of Object.entries(surahs)) {
        surahs[number]["pronunciation"] = await scrapSurahPronunciation(number, downloadQueue);
        
        if (Date.now() - lastLog > 2000) {
            console.log(`   Processing... Surah ${number}/${stats.totalSurahs} | Downloaded: ${stats.downloadedAudios} | Skipped: ${stats.skippedAudios}`);
            lastLog = Date.now();
        }
        
        await sleep(500);
    }

    await Promise.all(downloadQueue);

    console.log("\n" + "=".repeat(60));
    console.log("📊 STATISTICS:");
    console.log(`   Total Surahs: ${stats.totalSurahs}`);
    console.log(`   Total Verses: ${stats.totalVerses}`);
    console.log(`   Downloaded: ${stats.downloadedAudios}`);
    console.log(`   Skipped (existing): ${stats.skippedAudios}`);
    console.log(`   Failed: ${stats.failedAudios}`);
    console.log("=".repeat(60));

    console.log("\n💾 Saving JSON file...");
    fs.writeFileSync(
        "output/surahs.json",
        JSON.stringify(surahs, null, 2),
        "utf8"
    );

    console.log("\n✅ Process completed!");
    console.log("📁 Output:");
    console.log("   - output/surahs.json");
    console.log("   - output/audios/\n");
})();

async function scrapSurahPronunciation(number, downloadQueue) {
    const url = "http://transliteration.org/quran/WebSite_CD/MixFrench/" + format3(parseInt(number)) + ".asp";

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const ayas = [];

    $("table tr").each((index, row) => {
        const $tds = $(row).find("td");

        if ($tds.length === 3) {
            const $col1 = $($tds[0]);
            const $col2 = $($tds[1]);

            const hasAudio = $col1.find(`audio[id^="myAudio"]`).length > 0;

            if (hasAudio) {
                const frenchText = $col2.text().trim();
                const verseMatch = frenchText.match(/\[(\d+\.\d+)\]/);

                if (verseMatch) {
                    const verseNumber = verseMatch[1];

                    const $clone = $col1.clone();
                    $clone.find("audio").remove();
                    $clone.find("a").remove();

                    const buildPronunciation = ($el) => {
                        let text = "";

                        $el.contents().each((i, node) => {
                            if (node.type === "text") {
                                text += $(node).text();
                            } else if (node.type === "tag") {
                                const $node = $(node);
                                const tagName = node.name;

                                if (tagName === "span") {
                                    const className = $node.attr("class");
                                    const title = $node.attr("title");
                                    const content = $node.text();

                                    if (className) {
                                        text += `<${className}>${content}</${className}>`;
                                    } else if (title) {
                                        text += `<${title.replace(/\s+/g, "")}>${content}</${title.replace(/\s+/g, "")}>`;
                                    } else {
                                        text += content;
                                    }
                                } else if (tagName === "u") {
                                    const innerSpan = $node.find("span").first();
                                    if (innerSpan.length) {
                                        const className = innerSpan.attr("class");
                                        text += `<${className}>${innerSpan.text()}</${className}>`;
                                    } else {
                                        text += `<u>${$node.text()}</u>`;
                                    }
                                } else if (tagName === "font") {
                                    text += buildPronunciation($node);
                                } else if (tagName !== "audio" && tagName !== "a" && tagName !== "img") {
                                    text += buildPronunciation($node);
                                }
                            }
                        });
                        return text;
                    };

                    const pronunciation = buildPronunciation($clone).replace(/\s+/g, " ").trim();

                    let audioLink = "";
                    const audioEl = $col1.find(`audio[id^="myAudio"]`).first();

                    if (audioEl.length > 0) {
                        audioLink = audioEl.find("source").attr("src") || "";

                        if (!audioLink) {
                            audioLink = audioEl.attr("src") || "";
                        }
                    }

                    if (pronunciation && audioLink) {
                        ayas.push(pronunciation.trim());
                        downloadQueue.push(downloadAudio(audioLink, verseNumber));
                        stats.totalVerses++;
                    }
                }
            }
        }
    });

    return ayas;
}

async function downloadAudio(audioLink, verseNumber, retries = 3) {
    try {
        const [surahNum, verseNum] = verseNumber.split(".");

        const dirPath = path.join("output", "audios", surahNum);
        fs.mkdirSync(dirPath, { recursive: true });

        const ext = path.extname(audioLink);
        const fileName = `${verseNum}${ext}`;
        const filePath = path.join(dirPath, fileName);

        if (fs.existsSync(filePath)) {
            stats.skippedAudios++;
            return filePath;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(audioLink, {
                    responseType: "stream",
                    timeout: 30000
                });

                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on("finish", resolve);
                    writer.on("error", reject);
                    response.data.on("error", reject);
                });

                stats.downloadedAudios++;
                return filePath;
            } catch (err) {
                if (attempt < retries) {
                    await sleep(attempt * 2000);
                } else {
                    stats.failedAudios++;
                }
            }
        }

        return null;
    } catch (err) {
        stats.failedAudios++;
        return null;
    }
}

function format3(n) {
    n = Math.max(1, Math.min(999, n));
    return n.toString().padStart(3, "0");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}