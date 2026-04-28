let globalData;
let globalActData;
let currentSearchTerm = "";
let wordSearchDebounceTimer = null;

const selectedSeason = "all";
const WORD_CHART_WIDTH = 560;
const WORD_CHART_DEFAULT_HEIGHT = 440;
const WORD_TOP_SPEAKERS = 12;
const WORD_CHART_MIN_WIDTH = 320;
const WORD_CHART_MIN_HEIGHT = 280;
const TIMELINE_TOP_N = 15;
const MAIN_CHARACTER_COUNT = 18;
const TOP_WORDS_N = 18;
const WORD_CLOUD_N = 55;
const TOP_PHRASES_N = 14;

const STOP_WORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "arent", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
    "can", "cant", "cannot", "could", "couldnt",
    "did", "didnt", "do", "does", "doesnt", "doing", "dont", "down", "during",
    "each", "few", "for", "from", "further",
    "had", "hadnt", "has", "hasnt", "have", "havent", "having", "he", "hed", "hell", "hes", "her", "here", "heres", "hers", "herself", "him", "himself", "his", "how", "hows",
    "i", "id", "ill", "im", "ive", "if", "in", "into", "is", "isnt", "it", "its", "itself",
    "just",
    "lets",
    "me", "more", "most", "mustnt", "my", "myself",
    "no", "nor", "not", "now",
    "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own",
    "same", "she", "shed", "shell", "shes", "should", "shouldnt", "so", "some", "such",
    "than", "that", "thats", "the", "their", "theirs", "them", "themselves", "then", "there", "theres", "these", "they", "theyd", "theyll", "theyre", "theyve", "this", "those", "through", "to", "too",
    "under", "until", "up",
    "very",
    "was", "wasnt", "we", "wed", "well", "were", "weve", "were", "werent", "what", "whats", "when", "whens", "where", "wheres", "which", "while", "who", "whos", "whom", "why", "whys", "with", "wont", "would", "wouldnt",
    "you", "youd", "youll", "youre", "youve", "your", "yours", "yourself", "yourselves"
]);

Promise
    .all([
        d3.csv("data/master_all_seasons.csv"),
        d3.csv("data/act_character_dataset.csv")
    ])
    .then(([lineData, actData]) => {
        lineData.forEach(d => {
            d.season = +d.season;
            d.episode = +d.episode;
            d.character = String(d.character || "").trim().toUpperCase();
            d.sentence = String(d.sentence || "").trim();
        });

        actData.forEach(d => {
            d.season = +d.season;
            d.episode = +d.episode;
            d.act_number = +d.act_number;
            d.characters = parseCharactersInAct(d.characters_in_act);
        });

        globalData = lineData;
        globalActData = actData;

        initializeTimelineFilters();
        initializeWordSearch();
        initializeTextExplorer();

        updateChart("all");
        updateTextExplorer();

        d3.select("#seasonSelect").on("change", function () {
            const selectedSeason = this.value;
            updateChart(selectedSeason);
        });

        d3.select("#characterSelect").on("change", updateTextExplorer);
        d3.select("#textSeasonSelect").on("change", updateTextExplorer);
    });

function initializeTextExplorer() {
    const characterSelect = d3.select("#characterSelect");
    const textSeasonSelect = d3.select("#textSeasonSelect");

    const characterCounts = d3.rollups(
        globalData,
        v => v.length,
        d => d.character
    )
        .map(([character, count]) => ({ character, count }))
        .filter(d => d.character)
        .sort((a, b) => b.count - a.count)
        .slice(0, MAIN_CHARACTER_COUNT);

    characterSelect
        .selectAll("option")
        .data(characterCounts)
        .enter()
        .append("option")
        .attr("value", d => d.character)
        .text(d => d.character);

    const seasons = Array.from(new Set(globalData.map(d => d.season))).sort((a, b) => a - b);

    textSeasonSelect.append("option")
        .attr("value", "all")
        .text("All Seasons");

    textSeasonSelect
        .selectAll("option.season-option")
        .data(seasons)
        .enter()
        .append("option")
        .attr("class", "season-option")
        .attr("value", d => d)
        .text(d => `Season ${d}`);
}

function updateTextExplorer() {
    const selectedCharacter = d3.select("#characterSelect").property("value");
    const selectedSeason = d3.select("#textSeasonSelect").property("value") || "all";

    let characterData = globalData.filter(d => d.character === selectedCharacter);
    if (selectedSeason !== "all") {
        characterData = characterData.filter(d => d.season === +selectedSeason);
    }

    const tokensBySentence = characterData
        .map(d => tokenizeSentence(d.sentence))
        .filter(tokens => tokens.length > 0);

    const allTokens = tokensBySentence.flat();
    const wordCounts = countItems(allTokens);

    const topWords = wordCounts
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_WORDS_N);

    const cloudWords = wordCounts
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, WORD_CLOUD_N);

    const topPhrases = extractTopPhrases(tokensBySentence)
        .slice(0, TOP_PHRASES_N);

    updateTextSummary(selectedCharacter, selectedSeason, characterData, allTokens, wordCounts.length);

    drawWordCloud(cloudWords);
    drawWordFrequencyBars(topWords);
    drawPhraseBars(topPhrases);
}

function updateTextSummary(selectedCharacter, selectedSeason, characterData, allTokens, uniqueWordCount) {
    const summary = d3.select("#textSummary");
    const seasonLabel = selectedSeason === "all" ? "All Seasons" : `Season ${selectedSeason}`;

    summary.text(
        `${selectedCharacter} | ${seasonLabel} | Lines: ${characterData.length.toLocaleString()} | ` +
        `Filtered Words: ${allTokens.length.toLocaleString()} | Unique Words: ${uniqueWordCount.toLocaleString()}`
    );
}

function tokenizeSentence(sentence) {
    return String(sentence || "")
        .toLowerCase()
        .replace(/[^a-z0-9'\s-]/g, " ")
        .replace(/\b\d+\b/g, " ")
        .split(/\s+/)
        .map(token => token.replace(/^'+|'+$/g, ""))
        .filter(token => token.length > 1)
        .filter(token => /^[a-z][a-z'-]*$/.test(token))
        .filter(token => !STOP_WORDS.has(token.replace(/'/g, "")));
}

function countItems(items) {
    const counts = new Map();

    items.forEach(item => {
        counts.set(item, (counts.get(item) || 0) + 1);
    });

    return Array.from(counts.entries());
}

function extractTopPhrases(tokensBySentence) {
    const phraseCounts = new Map();

    tokensBySentence.forEach(tokens => {
        [2, 3, 4].forEach(n => {
            if (tokens.length < n) {
                return;
            }

            for (let i = 0; i <= tokens.length - n; i += 1) {
                const phrase = tokens.slice(i, i + n).join(" ");
                phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
            }
        });
    });

    return Array.from(phraseCounts.entries())
        .map(([phrase, count]) => ({ phrase, count }))
        .filter(d => d.count >= 2)
        .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);
}

function drawWordFrequencyBars(topWords) {
    const svg = d3.select("#wordBars");
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const margin = { top: 15, right: 20, bottom: 60, left: 120 };

    svg.selectAll("*").remove();

    if (!topWords.length) {
        drawEmptyState(svg, width, height, "No words available for this selection.");
        return;
    }

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const x = d3.scaleLinear()
        .domain([0, d3.max(topWords, d => d.count) || 1])
        .nice()
        .range([0, chartWidth]);

    const y = d3.scaleBand()
        .domain(topWords.map(d => d.word))
        .range([0, chartHeight])
        .padding(0.15);

    g.selectAll("rect")
        .data(topWords)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", d => y(d.word))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.count))
        .attr("fill", "#2b7bba");

    g.selectAll("text.bar-label")
        .data(topWords)
        .enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.count) + 4)
        .attr("y", d => (y(d.word) || 0) + y.bandwidth() / 2)
        .attr("dominant-baseline", "middle")
        .style("font-size", "11px")
        .text(d => d.count);

    g.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(x));

    g.append("g")
        .call(d3.axisLeft(y));

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 45)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Word Frequency");
}

function drawPhraseBars(topPhrases) {
    const svg = d3.select("#phraseBars");
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const margin = { top: 15, right: 20, bottom: 60, left: 200 };

    svg.selectAll("*").remove();

    if (!topPhrases.length) {
        drawEmptyState(svg, width, height, "No repeated phrase patterns found in this selection.");
        return;
    }

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const x = d3.scaleLinear()
        .domain([0, d3.max(topPhrases, d => d.count) || 1])
        .nice()
        .range([0, chartWidth]);

    const y = d3.scaleBand()
        .domain(topPhrases.map(d => d.phrase))
        .range([0, chartHeight])
        .padding(0.15);

    g.selectAll("rect")
        .data(topPhrases)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", d => y(d.phrase))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.count))
        .attr("fill", "#1a936f");

    g.selectAll("text.bar-label")
        .data(topPhrases)
        .enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.count) + 4)
        .attr("y", d => (y(d.phrase) || 0) + y.bandwidth() / 2)
        .attr("dominant-baseline", "middle")
        .style("font-size", "11px")
        .text(d => d.count);

    g.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));

    g.append("g")
        .call(d3.axisLeft(y).tickFormat(value => truncate(value, 28)));

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 45)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Phrase Frequency");
}

function drawWordCloud(words) {
    const svg = d3.select("#wordCloud");
    const width = +svg.attr("width");
    const height = +svg.attr("height");

    svg.selectAll("*").remove();

    if (!words.length) {
        drawEmptyState(svg, width, height, "No words available for this selection.");
        return;
    }

    const sizeScale = d3.scaleSqrt()
        .domain([1, d3.max(words, d => d.count) || 1])
        .range([12, 56]);

    const colorScale = d3.scaleLinear()
        .domain([1, d3.max(words, d => d.count) || 1])
        .range([0.25, 0.95]);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const placed = [];
    const collisionPadding = 3;
    const centerX = width / 2;
    const centerY = height / 2;

    words
        .slice()
        .sort((a, b) => b.count - a.count)
        .forEach((wordObj, idx) => {
            const size = sizeScale(wordObj.count);
            context.font = `${size}px sans-serif`;
            const textWidth = context.measureText(wordObj.word).width;
            const textHeight = size;

            let found = false;
            let finalBox = null;

            // Place larger words first using an expanding spiral with slight jitter.
            for (let t = 0; t < 2200 && !found; t += 1) {
                const angle = 0.34 * t;
                const radius = 3.8 * Math.sqrt(t);
                const jitterX = (Math.random() - 0.5) * 2.2;
                const jitterY = (Math.random() - 0.5) * 2.2;
                const x = centerX + radius * Math.cos(angle) + jitterX - textWidth / 2;
                const yTop = centerY + radius * Math.sin(angle) + jitterY - textHeight / 2;

                const box = {
                    x,
                    y: yTop,
                    width: textWidth,
                    height: textHeight
                };

                const inBounds = box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height;
                if (!inBounds) {
                    continue;
                }

                const overlaps = placed.some(p => (
                    box.x < p.x + p.width + collisionPadding &&
                    box.x + box.width + collisionPadding > p.x &&
                    box.y < p.y + p.height + collisionPadding &&
                    box.y + box.height + collisionPadding > p.y
                ));

                if (!overlaps) {
                    found = true;
                    finalBox = box;
                    placed.push(box);
                }
            }

            // If no exact spiral spot is found, try bounded random samples.
            for (let t = 0; t < 700 && !found; t += 1) {
                const x = Math.random() * Math.max(1, width - textWidth);
                const yTop = Math.random() * Math.max(1, height - textHeight);
                const box = {
                    x,
                    y: yTop,
                    width: textWidth,
                    height: textHeight
                };

                const overlaps = placed.some(p => (
                    box.x < p.x + p.width + collisionPadding &&
                    box.x + box.width + collisionPadding > p.x &&
                    box.y < p.y + p.height + collisionPadding &&
                    box.y + box.height + collisionPadding > p.y
                ));

                if (!overlaps) {
                    found = true;
                    finalBox = box;
                    placed.push(box);
                }
            }

            // Skip drawing if we cannot safely place the word.
            if (!found || !finalBox) {
                return;
            }

            svg.append("text")
                .attr("x", finalBox.x)
                .attr("y", finalBox.y + textHeight)
                .style("font-family", "sans-serif")
                .style("font-size", `${size}px`)
                .style("fill", d3.interpolatePuBuGn(colorScale(wordObj.count)))
                .style("opacity", idx < 20 ? 0.95 : 0.85)
                .text(wordObj.word);
        });
}

function drawEmptyState(svg, width, height, message) {
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .style("fill", "#666")
        .text(message);
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1)}...`;
}

function initializeTimelineFilters() {
    const timelineSeasonSelect = d3.select("#timelineSeasonSelect");
    const timelineEpisodeSelect = d3.select("#timelineEpisodeSelect");

    const seasons = Array.from(new Set(globalActData.map(d => d.season))).sort((a, b) => a - b);

    timelineSeasonSelect.selectAll("option").remove();
    timelineSeasonSelect
        .append("option")
        .attr("value", "all")
        .text("All Seasons");

    timelineSeasonSelect
        .selectAll("option.timeline-season-option")
        .data(seasons)
        .enter()
        .append("option")
        .attr("class", "timeline-season-option")
        .attr("value", d => d)
        .text(d => `Season ${d}`);

    updateTimelineEpisodeOptions("all");

    timelineSeasonSelect.on("change", function () {
        const selectedTimelineSeason = this.value;
        updateTimelineEpisodeOptions(selectedTimelineSeason);
        renderTimelineFromFilters();
    });

    timelineEpisodeSelect.on("change", function () {
        renderTimelineFromFilters();
    });
}

function updateTimelineEpisodeOptions(selectedTimelineSeason) {
    const timelineEpisodeSelect = d3.select("#timelineEpisodeSelect");

    const sourceData = selectedTimelineSeason === "all"
        ? globalActData
        : globalActData.filter(d => d.season === +selectedTimelineSeason);

    const episodes = Array.from(new Set(sourceData.map(d => d.episode))).sort((a, b) => a - b);

    timelineEpisodeSelect.selectAll("option").remove();
    timelineEpisodeSelect
        .append("option")
        .attr("value", "all")
        .text("All Episodes");

    timelineEpisodeSelect
        .selectAll("option.timeline-episode-option")
        .data(episodes)
        .enter()
        .append("option")
        .attr("class", "timeline-episode-option")
        .attr("value", d => d)
        .text(d => `Episode ${String(d).padStart(2, "0")}`);

    timelineEpisodeSelect.property("value", "all");
}

function renderTimelineFromFilters() {
    if (!globalActData || !globalData) {
        return;
    }

    const timelineSeason = d3.select("#timelineSeasonSelect").property("value") || "all";
    const timelineEpisode = d3.select("#timelineEpisodeSelect").property("value") || "all";

    let filteredActData = globalActData;

    if (timelineSeason !== "all") {
        filteredActData = filteredActData.filter(d => d.season === +timelineSeason);
    }

    if (timelineEpisode !== "all") {
        filteredActData = filteredActData.filter(d => d.episode === +timelineEpisode);
    }

    let filteredLineData = globalData;

    if (timelineSeason !== "all") {
        filteredLineData = filteredLineData.filter(d => d.season === +timelineSeason);
    }

    if (timelineEpisode !== "all") {
        filteredLineData = filteredLineData.filter(d => d.episode === +timelineEpisode);
    }

    const timelineCharacterCounts = d3.rollups(
        filteredLineData,
        v => v.length,
        d => d.character
    );

    const timelineTopCharacters = timelineCharacterCounts
        .map(([character, count]) => ({ character, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TIMELINE_TOP_N);

    drawActTimeline(filteredActData, timelineTopCharacters, timelineSeason);
}

function parseCharactersInAct(rawList) {
    if (!rawList) {
        return [];
    }

    const normalized = rawList
        .replace(/""/g, '"')
        .replace(/&#160;/g, " ");

    try {
        return JSON.parse(normalized)
            .map(name => String(name).trim().toUpperCase())
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function drawBarChart(data, filteredData) {
    const svg = d3.select("#chart");
    const tooltip = d3.select("#tooltip");
    const width = 800;
    const height = 500;
    const margin = { top: 20, right: 20, bottom: 50, left: 120 };

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const episodeCounts = d3.rollups(
        filteredData,
        v => new Set(v.map(d => `${d.season}-${d.episode}`)).size,
        d => d.character
    );

    const episodeMap = Object.fromEntries(episodeCounts);

    svg.selectAll("*").remove();

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 0])
        .nice()
        .range([0, chartWidth]);

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 40)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .text("Number of Lines Spoken");

    const y = d3.scaleBand()
        .domain(data.map(d => d.character))
        .range([0, chartHeight])
        .padding(0.2);

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2)
        .attr("y", -80)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .text("Characters");

    g.selectAll("rect")
        .data(data)
        .enter()
        .append("rect")
        .attr("y", d => y(d.character))
        .attr("width", d => x(d.count))
        .attr("height", y.bandwidth())
        .attr("fill", "steelblue")
        .on("mouseover", (event, d) => {
            const episodes = episodeMap[d.character] || 0;
            tooltip.style("display", "block")
                .html(`<strong>${d.character}</strong><br>Lines: ${d.count}<br>Episodes: ${episodes}`);
        })
        .on("mousemove", event => {
            tooltip.style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY + 10}px`);
        })
        .on("mouseout", () => {
            tooltip.style("display", "none");
        });

    g.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(x));

    g.append("g")
        .call(d3.axisLeft(y));
}

function updateChart(selectedSeason) {
    let filteredData;

    if (selectedSeason === "all") {
        filteredData = globalData;
    } else {
        filteredData = globalData.filter(d => d.season === +selectedSeason);
    }

    const characterCounts = d3.rollups(
        filteredData,
        v => v.length,
        d => d.character
    );

    const processed = characterCounts
        .map(([character, count]) => ({ character, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

    drawBarChart(processed, filteredData);
    renderTimelineFromFilters();
    updateWordSearchVisuals();
}

function initializeWordSearch() {
    const input = d3.select("#wordSearch");

    const triggerSearchUpdate = () => {
        currentSearchTerm = input.property("value").trim();
        updateWordSearchVisuals();
    };

    // Live feedback while typing.
    input.on("input", () => {
        if (wordSearchDebounceTimer) {
            clearTimeout(wordSearchDebounceTimer);
        }
        wordSearchDebounceTimer = setTimeout(() => {
            triggerSearchUpdate();
        }, 120);
    });

    input.on("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            if (wordSearchDebounceTimer) {
                clearTimeout(wordSearchDebounceTimer);
            }
            triggerSearchUpdate();
        }
    });

    window.addEventListener("resize", () => {
        if (wordSearchDebounceTimer) {
            clearTimeout(wordSearchDebounceTimer);
        }
        wordSearchDebounceTimer = setTimeout(() => {
            updateWordSearchVisuals();
        }, 120);
    });

    drawChartMessage(
        "#lineChart",
        getWordChartWidth("#lineChart"),
        getWordChartHeight("#lineChart"),
        "Search a word or phrase to see mentions by episode."
    );
    drawChartMessage(
        "#barChart",
        getWordChartWidth("#barChart"),
        getWordChartHeight("#barChart"),
        "Search a word or phrase to see who says it most often."
    );
}

function updateWordSearchVisuals() {
    if (!globalData) {
        return;
    }

    const query = currentSearchTerm.trim();
    if (!query) {
        drawChartMessage(
            "#lineChart",
            getWordChartWidth("#lineChart"),
            getWordChartHeight("#lineChart"),
            "Search a word or phrase to see mentions by episode."
        );
        drawChartMessage(
            "#barChart",
            getWordChartWidth("#barChart"),
            getWordChartHeight("#barChart"),
            "Search a word or phrase to see who says it most often."
        );
        return;
    }

    const selectedSeason = d3.select("#seasonSelect").property("value") || "all";
    const scopedData = selectedSeason === "all"
        ? globalData
        : globalData.filter(d => d.season === +selectedSeason);

    const episodeSeries = buildEpisodeMentionSeries(scopedData, query);
    const speakerCounts = buildSpeakerMentionSeries(scopedData, query);

    drawWordFrequencyLineChart(episodeSeries, query, selectedSeason);
    drawWordSpeakerBarChart(speakerCounts, query, selectedSeason);
}

function buildEpisodeMentionSeries(data, query) {
    const mentionsByEpisode = new Map();

    data.forEach(d => {
        const mentions = countQueryMentions(d.sentence, query);
        if (!mentions) {
            return;
        }

        const key = `${d.season}-${d.episode}`;
        mentionsByEpisode.set(key, (mentionsByEpisode.get(key) || 0) + mentions);
    });

    const orderedEpisodes = Array.from(new Set(data.map(d => `${d.season}-${d.episode}`)))
        .map(key => {
            const [season, episode] = key.split("-").map(Number);
            return { season, episode, key };
        })
        .sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

    return orderedEpisodes.map((d, index) => ({
        ...d,
        index,
        label: `S${d.season}E${String(d.episode).padStart(2, "0")}`,
        count: mentionsByEpisode.get(d.key) || 0
    }));
}

function buildSpeakerMentionSeries(data, query) {
    const speakerMentions = d3.rollups(
        data,
        rows => d3.sum(rows, row => countQueryMentions(row.sentence, query)),
        d => d.character
    );

    return speakerMentions
        .map(([character, count]) => ({ character, count }))
        .filter(d => d.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, WORD_TOP_SPEAKERS);
}

function drawWordFrequencyLineChart(series, query, selectedSeason) {
    const svgWidth = getWordChartWidth("#lineChart");
    const svgHeight = getWordChartHeight("#lineChart");
    const svg = d3.select("#lineChart")
        .attr("width", svgWidth)
        .attr("height", svgHeight);

    svg.selectAll("*").remove();

    if (!series.length) {
        drawChartMessage("#lineChart", svgWidth, svgHeight, "No episode data available.");
        return;
    }

    const totalMentions = d3.sum(series, d => d.count);
    const firstMention = series.find(d => d.count > 0);

    const margin = { top: 52, right: 22, bottom: 95, left: 72 };
    const chartWidth = svgWidth - margin.left - margin.right;
    const chartHeight = svgHeight - margin.top - margin.bottom;

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain([0, Math.max(0, series.length - 1)])
        .range([0, chartWidth]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(series, d => d.count) || 1])
        .nice()
        .range([chartHeight, 0]);

    const line = d3.line()
        .x(d => x(d.index))
        .y(d => y(d.count));

    g.append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", "#1f77b4")
        .attr("stroke-width", 2)
        .attr("d", line);

    const tooltip = d3.select("#tooltip");

    g.selectAll("circle")
        .data(series)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.index))
        .attr("cy", d => y(d.count))
        .attr("r", d => d.count > 0 ? 3 : 2)
        .attr("fill", d => d.count > 0 ? "#1f77b4" : "#98bdd8")
        .on("mouseover", (event, d) => {
            tooltip
                .style("display", "block")
                .html(`<strong>${d.label}</strong><br>Mentions: ${d.count}`);
        })
        .on("mousemove", event => {
            tooltip
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY + 10}px`);
        })
        .on("mouseout", () => {
            tooltip.style("display", "none");
        });

    g.append("rect")
    .attr("width", chartWidth)
    .attr("height", chartHeight)
    .style("fill", "none")
    .style("pointer-events", "all")
        .on("mousemove", function(event) {
            const [mx] = d3.pointer(event);

            const closest = series.reduce((a, b) => {
                return Math.abs(x(a.index) - mx) <
                    Math.abs(x(b.index) - mx) ? a : b;
            });

            const svgRect = svg.node().getBoundingClientRect();

            const dotX = svgRect.left + window.scrollX + margin.left + x(closest.index);
            const dotY = svgRect.top + window.scrollY + margin.top + y(closest.count);

            tooltip
            .style("display", "block")
            .html(`
                <strong>${closest.label}</strong><br>
                Mentions: ${closest.count}
            `);

            const ttWidth = tooltip.node().offsetWidth;
            const ttHeight = tooltip.node().offsetHeight;

            tooltip
                .style("left", `${dotX - ttWidth / 2}px`)
                .style("top", `${dotY - ttHeight - 12}px`);
        })
        .on("mouseout", () => {
            tooltip.style("display", "none");
        });

    const tickStep = Math.max(1, Math.ceil(series.length / 18));
    const tickValues = [];
    for (let i = 0; i < series.length; i += tickStep) {
        tickValues.push(i);
    }
    if (series.length > 1 && tickValues[tickValues.length - 1] !== series.length - 1) {
        tickValues.push(series.length - 1);
    }

    g.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(
            d3.axisBottom(x)
                .tickValues(tickValues)
                .tickFormat(index => series[index].label)
        )
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-0.5em")
        .attr("dy", "0.3em")
        .attr("transform", "rotate(-45)");

    g.append("g").call(d3.axisLeft(y));

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 82)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .text("Episode");

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .text("Mentions");

    const scopeLabel = selectedSeason === "all" ? "All Seasons" : `Season ${selectedSeason}`;
    const firstMentionText = firstMention ? `First mention: ${firstMention.label}` : "First mention: none";

    svg.append("text")
        .attr("x", svgWidth / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .text(`"${query}" Mentions by Episode (${scopeLabel})`);

    svg.append("text")
        .attr("x", svgWidth / 2)
        .attr("y", 39)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#555")
        .text(`Total mentions: ${totalMentions} | ${firstMentionText}`);
}

function drawWordSpeakerBarChart(speakerCounts, query, selectedSeason) {
    const svgWidth = getWordChartWidth("#barChart");
    const svgHeight = getWordChartHeight("#barChart");
    const svg = d3.select("#barChart")
        .attr("width", svgWidth)
        .attr("height", svgHeight);

    svg.selectAll("*").remove();

    if (!speakerCounts.length) {
        const scopeLabel = selectedSeason === "all" ? "all seasons" : `Season ${selectedSeason}`;
        drawChartMessage(
            "#barChart",
            svgWidth,
            svgHeight,
            `No speakers found for "${query}" in ${scopeLabel}.`
        );
        return;
    }

    const margin = { top: 52, right: 24, bottom: 48, left: 180 };
    const chartWidth = svgWidth - margin.left - margin.right;
    const chartHeight = svgHeight - margin.top - margin.bottom;

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain([0, d3.max(speakerCounts, d => d.count) || 0])
        .nice()
        .range([0, chartWidth]);

    const y = d3.scaleBand()
        .domain(speakerCounts.map(d => d.character))
        .range([0, chartHeight])
        .padding(0.18);

    const tooltip = d3.select("#tooltip");

    g.selectAll("rect")
        .data(speakerCounts)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", d => y(d.character))
        .attr("width", d => x(d.count))
        .attr("height", y.bandwidth())
        .attr("fill", "#4682b4")
        .on("mouseover", (event, d) => {
            tooltip
                .style("display", "block")
                .html(`<strong>${d.character}</strong><br>Mentions: ${d.count}`);
        })
        .on("mousemove", event => {
            tooltip
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY + 10}px`);
        })
        .on("mouseout", () => {
            tooltip.style("display", "none");
        });

    g.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(x));

    g.append("g")
        .call(d3.axisLeft(y));

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 38)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .text("Mentions");

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2)
        .attr("y", -135)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .text("Character");

    const scopeLabel = selectedSeason === "all" ? "All Seasons" : `Season ${selectedSeason}`;
    svg.append("text")
        .attr("x", svgWidth / 2)
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .text(`Top Speakers of "${query}" (${scopeLabel})`);
}

function getWordChartWidth(svgSelector) {
    const svgNode = d3.select(svgSelector).node();
    if (!svgNode) {
        return WORD_CHART_WIDTH;
    }

    const parent = svgNode.closest(".chart-card") || svgNode.parentElement;
    const measured = parent ? parent.getBoundingClientRect().width : svgNode.getBoundingClientRect().width;

    if (!Number.isFinite(measured) || measured <= 0) {
        return WORD_CHART_WIDTH;
    }

    return Math.max(WORD_CHART_MIN_WIDTH, Math.floor(measured - 1));
}

function getWordChartHeight(svgSelector) {
    const svgNode = d3.select(svgSelector).node();
    if (!svgNode) {
        return WORD_CHART_DEFAULT_HEIGHT;
    }

    const parent = svgNode.closest(".chart-card") || svgNode.parentElement;
    const measured = parent ? parent.getBoundingClientRect().height : svgNode.getBoundingClientRect().height;

    if (!Number.isFinite(measured) || measured <= 0) {
        return WORD_CHART_DEFAULT_HEIGHT;
    }

    return Math.max(WORD_CHART_MIN_HEIGHT, Math.floor(measured - 1));
}

function drawChartMessage(svgSelector, width, height, message) {
    const svg = d3.select(svgSelector)
        .attr("width", width)
        .attr("height", height);

    svg.selectAll("*").remove();

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("fill", "#555")
        .text(message);
}

function countQueryMentions(sentence, query) {
    if (!sentence || !query) {
        return 0;
    }

    const escapedQuery = escapeRegExp(query.trim());
    if (!escapedQuery) {
        return 0;
    }

    const usesWordBoundaries = !/\s/.test(query.trim());
    const pattern = usesWordBoundaries ? `\\b${escapedQuery}\\b` : escapedQuery;
    const regex = new RegExp(pattern, "gi");
    const matches = String(sentence).match(regex);
    return matches ? matches.length : 0;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function drawActTimeline(filteredActData, topCharacterData, selectedSeason) {
    const svg = d3.select("#timeline");
    const tooltip = d3.select("#tooltip");
    const width = 1000;
    const height = 520;
    const margin = { top: 25, right: 20, bottom: 110, left: 120 };

    svg.selectAll("*").remove();

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const orderedTopCharacters = topCharacterData.map(d => d.character.toUpperCase());
    const topCharacters = new Set(orderedTopCharacters);
    const filteredActs = filteredActData
        .filter(d => d.characters.some(char => topCharacters.has(char)))
        .sort((a, b) => (a.season - b.season) || (a.episode - b.episode) || (a.act_number - b.act_number));

    const actPoints = filteredActs.map((act, index) => ({
        ...act,
        actKey: `${act.season}-${act.episode}-${act.act_number}`,
        index,
        uniqueCharacters: Array.from(new Set(act.characters)).sort()
    }));

    const actKeys = actPoints.map(d => d.actKey);

    if (actKeys.length === 0) {
        g.append("text")
            .attr("x", chartWidth / 2)
            .attr("y", chartHeight / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("No act-character data available for this selection.");
        return;
    }

    const timelineStartIndex = -0.2;
    const x = d3.scaleLinear()
        .domain([timelineStartIndex, Math.max(0, actKeys.length - 1)])
        .range([0, chartWidth]);

    const activeCharacters = new Set(
        filteredActs.flatMap(d => d.characters.filter(char => topCharacters.has(char)))
    );

    const yDomain = orderedTopCharacters.filter(char => activeCharacters.has(char));
    if (!yDomain.length) {
        g.append("text")
            .attr("x", chartWidth / 2)
            .attr("y", chartHeight / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("No timeline characters match this season or episode selection.");
        return;
    }

    const yBase = d3.scalePoint()
        .domain(yDomain)
        .range([0, chartHeight]);

    const mergedYByActChar = new Map();
    filteredActs.forEach(act => {
        const key = `${act.season}-${act.episode}-${act.act_number}`;
        const participants = act.characters.filter(char => topCharacters.has(char));
        if (!participants.length) {
            return;
        }

        const mergeY = d3.mean(participants, char => yBase(char));
        const sortedParticipants = participants
            .slice()
            .sort((a, b) => yBase(a) - yBase(b));

        const microOffset = 2;
        sortedParticipants.forEach((char, idx) => {
            const centeredOffset = (idx - (sortedParticipants.length - 1) / 2) * microOffset;
            mergedYByActChar.set(`${char}|${key}`, mergeY + centeredOffset);
        });
    });

    const line = d3.line()
        .x(d => x(d.index))
        .y(d => d.y)
        .curve(d3.curveMonotoneX);

    const color = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(yDomain);

    yDomain.forEach(character => {
        const points = [{ actKey: "start", index: timelineStartIndex, y: yBase(character) }];

        filteredActs.forEach((act, index) => {
            const actKey = `${act.season}-${act.episode}-${act.act_number}`;
            const mergedY = mergedYByActChar.get(`${character}|${actKey}`);
            const yValue = mergedY !== undefined ? mergedY : yBase(character);

            if (index === 0) {
                points.push({ actKey, index: 0.001, y: yValue });
            } else {
                points.push({ actKey, index, y: yValue });
            }
        });

        if (points.length < 2) {
            return;
        }

        g.append("path")
            .datum({ character, points })
            .attr("class", "timeline-path")
            .attr("fill", "none")
            .attr("stroke", color(character))
            .attr("stroke-width", 2)
            .attr("opacity", 0.9)
            .attr("d", d => line(d.points));
    });

    let hoveredCharacter = null;
    const lockedCharacters = new Set();
    let yAxisLabels = null;

    const timelinePaths = g.selectAll(".timeline-path")
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            hoveredCharacter = d.character;
            applyCharacterFocus();
        })
        .on("mouseout", () => {
            hoveredCharacter = null;
            applyCharacterFocus();
        });

    const getFocusedCharacters = () => {
        const focused = new Set(lockedCharacters);
        if (hoveredCharacter) {
            focused.add(hoveredCharacter);
        }
        return focused;
    };

    function applyCharacterFocus() {
        const focusedCharacters = getFocusedCharacters();
        const hasFocus = focusedCharacters.size > 0;

        timelinePaths
            .attr("opacity", d => (!hasFocus || focusedCharacters.has(d.character)) ? 0.95 : 0.14)
            .attr("stroke-width", d => (!hasFocus || focusedCharacters.has(d.character)) ? 3.2 : 1.5);

        if (yAxisLabels) {
            yAxisLabels
                .style("opacity", char => (!hasFocus || focusedCharacters.has(char)) ? 1 : 0.45)
                .style("font-weight", char => lockedCharacters.has(char) ? "700" : "400");
        }
    }

    const xAxisGroup = g.append("g")
        .attr("class", "timeline-axis")
        .attr("transform", `translate(0,${chartHeight})`);

    const hoverBandGroup = g.append("g").attr("class", "timeline-hover-bands");

    const formatActLabel = actKey => {
        const [season, episode, act] = actKey.split("-").map(Number);
        if (selectedSeason === "all") {
            return `S${season}E${String(episode).padStart(2, "0")}-A${act}`;
        }
        return `E${String(episode).padStart(2, "0")}-A${act}`;
    };

    const renderXAxis = scale => {
        const [domainMin, domainMax] = scale.domain();
        const visibleCount = Math.max(1, domainMax - domainMin + 1);
        const step = Math.max(1, Math.ceil(visibleCount / 24));
        const start = Math.max(0, Math.floor(domainMin));
        const end = Math.min(actKeys.length - 1, Math.ceil(domainMax));
        const tickIndices = [];

        for (let i = start; i <= end; i += step) {
            tickIndices.push(i);
        }

        xAxisGroup
            .call(
                d3.axisBottom(scale)
                    .tickValues(tickIndices)
                    .tickFormat(index => formatActLabel(actKeys[index]))
            )
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-0.5em")
            .attr("dy", "0.3em")
            .attr("transform", "rotate(-45)");
    };

    const renderHoverBands = scale => {
        const bands = hoverBandGroup
            .selectAll("rect")
            .data(actPoints, d => d.actKey);

        bands.enter()
            .append("rect")
            .attr("class", "timeline-hover-band")
            .attr("y", 0)
            .attr("height", chartHeight)
            .on("mouseover", (event, d) => {
                const title = selectedSeason === "all"
                    ? `S${d.season}E${String(d.episode).padStart(2, "0")} - A${d.act_number}`
                    : `E${String(d.episode).padStart(2, "0")} - A${d.act_number}`;
                tooltip
                    .style("display", "block")
                    .html(`<strong>${title}</strong><br>${d.uniqueCharacters.join(", ")}`);
            })
            .on("mousemove", event => {
                tooltip
                    .style("left", `${event.pageX + 10}px`)
                    .style("top", `${event.pageY + 10}px`);
            })
            .on("mouseout", () => {
                tooltip.style("display", "none");
            })
            .merge(bands)
            .attr("x", d => scale(d.index) - 6)
            .attr("width", 12);

        bands.exit().remove();
    };

    renderXAxis(x);
    renderHoverBands(x);
    hoverBandGroup.lower();

    const yAxisGroup = g.append("g")
        .attr("class", "timeline-axis")
        .call(d3.axisLeft(yBase));

    yAxisLabels = yAxisGroup
        .selectAll(".tick text")
        .style("cursor", "pointer")
        .on("click", (event, character) => {
            if (lockedCharacters.has(character)) {
                lockedCharacters.delete(character);
            } else {
                lockedCharacters.add(character);
            }
            hoveredCharacter = null;
            applyCharacterFocus();
        });

    applyCharacterFocus();

    const clipId = "timeline-clip";
    g.append("defs")
        .append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    g.selectAll(".timeline-path")
        .attr("clip-path", `url(#${clipId})`);

    const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .translateExtent([[0, 0], [chartWidth, chartHeight]])
        .extent([[0, 0], [chartWidth, chartHeight]])
        .on("zoom", event => {
            const zoomedX = event.transform.rescaleX(x);
            const zoomedLine = line.x(point => zoomedX(point.index));
            g.selectAll(".timeline-path")
                .attr("d", d => zoomedLine(d.points));
            renderXAxis(zoomedX);
            renderHoverBands(zoomedX);
            hoverBandGroup.lower();
        });

    svg.call(zoom);

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 95)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text("Episodes and Acts");

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2)
        .attr("y", -88)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text("Characters");

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .text("Character Co-Appearance Timeline by Episode and Act");
}
